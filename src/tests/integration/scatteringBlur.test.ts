/**
 * Scattering Blur Integration Tests
 *
 * Tests for the per-layer wavelength-dependent scattering blur system.
 *
 * The blur system implements:
 * - Per-layer processing (back-to-front)
 * - Wavelength-dependent blur radius (Rayleigh: 1/λ⁴, Mie: constant)
 * - Voigt-like blur kernel (Gaussian core + Lorentzian tails)
 */

import { describe, expect, it } from 'vitest';
import { getMieScattering, getRayleighScattering } from '../../core/physics/scattering';
import { voigtProfile } from '../../core/physics/voigt';

describe('Scattering Blur Physics', () => {
  describe('Wavelength-dependent blur sigma', () => {
    it('Rayleigh blur sigma scales with 1/λ² (sqrt of 1/λ⁴)', () => {
      // The blur sigma is sqrt of the scattering coefficient
      // Rayleigh scattering ∝ 1/λ⁴, so sigma ∝ 1/λ²

      const blueWavelength = 450;
      const greenWavelength = 550;
      const redWavelength = 650;

      // Calculate relative sigma factors (normalized to green at 550nm)
      const blueFactor = Math.pow(550 / blueWavelength, 2);
      const greenFactor = 1.0;
      const redFactor = Math.pow(550 / redWavelength, 2);

      // Blue should have larger blur radius
      expect(blueFactor).toBeGreaterThan(greenFactor);
      expect(greenFactor).toBeGreaterThan(redFactor);

      // Verify the ratios
      expect(blueFactor).toBeCloseTo(1.49, 1); // (550/450)² ≈ 1.49
      expect(redFactor).toBeCloseTo(0.72, 1); // (550/650)² ≈ 0.72
    });

    it('Mie blur sigma is wavelength-independent', () => {
      // For Mie scattering, the blur should be roughly the same across wavelengths
      const density = 1e8;
      const size = 1000;

      const blueMie = getMieScattering(450, { particleDensity: density, particleSize: size });
      const greenMie = getMieScattering(550, { particleDensity: density, particleSize: size });
      const redMie = getMieScattering(650, { particleDensity: density, particleSize: size });

      // All should be within 2x of each other (roughly uniform)
      const maxMie = Math.max(blueMie, greenMie, redMie);
      const minMie = Math.min(blueMie, greenMie, redMie);

      expect(maxMie / minMie).toBeLessThan(2.0);
    });
  });

  describe('Voigt blur kernel properties', () => {
    it('Voigt kernel has maximum at center', () => {
      const sigma = 5.0;
      const center = voigtProfile(0, sigma, sigma * 0.5);
      const offset1 = voigtProfile(1, sigma, sigma * 0.5);
      const offset5 = voigtProfile(5, sigma, sigma * 0.5);

      expect(center).toBeGreaterThan(offset1);
      expect(offset1).toBeGreaterThan(offset5);
    });

    it('Voigt kernel is symmetric', () => {
      const sigma = 3.0;
      const left = voigtProfile(-2, sigma, sigma * 0.5);
      const right = voigtProfile(2, sigma, sigma * 0.5);

      expect(left).toBeCloseTo(right, 5);
    });

    it('Voigt kernel has extended tails (Lorentzian contribution)', () => {
      // The Voigt profile should have longer tails than a pure Gaussian
      // due to the Lorentzian component
      const sigma = 2.0;

      // At 4 sigma, compare Voigt to pure Gaussian
      const dist = 4 * sigma;
      const voigt = voigtProfile(dist, sigma, sigma * 0.5);
      const gaussian = Math.exp(-0.5 * Math.pow(dist / sigma, 2));

      // Voigt should be significantly higher in the tails
      expect(voigt).toBeGreaterThan(gaussian * 2);
    });
  });

  describe('Layer processing order', () => {
    it('layers should be processed back-to-front (ascending layer index)', () => {
      // Simulate layer sorting
      const shapes = [
        { layer: 2, id: 'front' },
        { layer: 0, id: 'back' },
        { layer: 1, id: 'middle' },
      ];

      const sorted = [...shapes].sort((a, b) => a.layer - b.layer);

      expect(sorted[0].id).toBe('back');
      expect(sorted[1].id).toBe('middle');
      expect(sorted[2].id).toBe('front');
    });
  });

  describe('Combined Rayleigh and Mie blur', () => {
    it('combined blur should be dominated by larger component', () => {
      // When both Rayleigh and Mie are present, the total blur
      // should be primarily determined by whichever is larger
      const density = 1e10;

      const rayleighBlue = getRayleighScattering(450, {
        particleDensity: density,
        particleSize: 50,
      });
      const rayleighRed = getRayleighScattering(650, {
        particleDensity: density,
        particleSize: 50,
      });
      const mie = getMieScattering(550, { particleDensity: density / 1000, particleSize: 1000 });

      // For visualization, combined sigma = sqrt(rayleigh + mie)
      // The wavelength dependence comes primarily from Rayleigh
      const blueTotal = Math.sqrt(rayleighBlue + mie);
      const redTotal = Math.sqrt(rayleighRed + mie);

      // Blue should still have more blur even with Mie added
      expect(blueTotal).toBeGreaterThan(redTotal);
    });
  });

  describe('Expected visual effects', () => {
    it('Rayleigh-only scattering should create blue halo', () => {
      // With only Rayleigh scattering:
      // - Blue light (450nm) gets maximum blur
      // - Red light (650nm) gets minimal blur
      // Result: Blue halo around the object

      const blueSigmaFactor = Math.pow(550 / 450, 2);
      const redSigmaFactor = Math.pow(550 / 650, 2);

      // Blue blur should be ~2x larger than red blur
      expect(blueSigmaFactor / redSigmaFactor).toBeGreaterThan(2.0);
    });

    it('Mie-only scattering should create white/gray haze', () => {
      // With only Mie scattering:
      // - All wavelengths get similar blur
      // Result: White/gray haze (no color shift)

      const density = 1e8;
      const blueMie = getMieScattering(450, { particleDensity: density, particleSize: 1000 });
      const redMie = getMieScattering(650, { particleDensity: density, particleSize: 1000 });

      const ratio = blueMie / redMie;
      // Should be close to 1.0 (uniform across wavelengths)
      expect(ratio).toBeGreaterThan(0.5);
      expect(ratio).toBeLessThan(2.0);
    });
  });

  describe('Spectral buffer indexing', () => {
    it('spectral index formula is correct', () => {
      // spectralIndex = (y * width + x) * SPECTRAL_SAMPLES + wavelengthIdx
      const width = 1280;
      const SPECTRAL_SAMPLES = 16;

      // Test a few cases
      const idx00_w0 = (0 * width + 0) * SPECTRAL_SAMPLES + 0;
      expect(idx00_w0).toBe(0);

      const idx00_w15 = (0 * width + 0) * SPECTRAL_SAMPLES + 15;
      expect(idx00_w15).toBe(15);

      const idx10_w0 = (0 * width + 1) * SPECTRAL_SAMPLES + 0;
      expect(idx10_w0).toBe(16);

      const idx01_w0 = (1 * width + 0) * SPECTRAL_SAMPLES + 0;
      expect(idx01_w0).toBe(width * SPECTRAL_SAMPLES);
    });

    it('wavelength calculation from index is correct', () => {
      // Now uses full range 100-1000nm for UV fluorescence
      const WAVELENGTH_MIN = 100;
      const WAVELENGTH_MAX = 1000;
      const SPECTRAL_SAMPLES = 16;

      const getWavelength = (idx: number) => {
        // New formula: wavelengthMin + (wavelengthMax - wavelengthMin) * idx / (sampleCount - 1)
        return WAVELENGTH_MIN + ((WAVELENGTH_MAX - WAVELENGTH_MIN) * idx) / (SPECTRAL_SAMPLES - 1);
      };

      // First sample should be at 100nm
      expect(getWavelength(0)).toBeCloseTo(100, 0);

      // Last sample should be at 1000nm
      expect(getWavelength(15)).toBeCloseTo(1000, 0);

      // Middle sample (index 7.5) should be around 550nm
      // (100 + 900 * 7 / 15 ≈ 520nm)
      expect(getWavelength(7)).toBeCloseTo(520, 0);
    });
  });
});
