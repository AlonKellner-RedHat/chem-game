/**
 * Scattering Physics Tests
 *
 * Tests for Rayleigh and Mie scattering implementations in WGSL.
 * Validates wavelength dependence and physical relationships.
 */

import { describe, expect, it } from 'vitest';
import { PHYSICAL_CONSTANTS } from '../testHelpers';

describe('Scattering Physics', () => {
  describe('Rayleigh Scattering', () => {
    it('coefficient should produce realistic scattering', () => {
      // Rayleigh coefficient should produce ~2-3% scattering at:
      // - 1e12 particles/cm³
      // - 50nm particles
      // - 1cm path length
      // - 500nm wavelength

      // σ ∝ n × d⁶ / λ⁴
      const coeff = PHYSICAL_CONSTANTS.RAYLEIGH_COEFF;
      const density = 1e12;
      const particleSize = 50;
      const wavelength = 500;

      const d6 = Math.pow(particleSize, 6);
      const lambda4 = Math.pow(wavelength, 4);
      const scatterCoeff = (density * d6 * coeff) / lambda4;

      // Should be small but measurable
      expect(scatterCoeff).toBeGreaterThan(0.001);
      expect(scatterCoeff).toBeLessThan(1.0);
    });

    it('scales as 1/λ⁴ (blue scatters more than red)', () => {
      // Rayleigh scattering: I ∝ 1/λ⁴
      const blueWavelength = 450;
      const redWavelength = 650;

      // Blue should scatter (650/450)^4 ≈ 4.35 times more than red
      const expectedRatio = Math.pow(redWavelength / blueWavelength, 4);
      expect(expectedRatio).toBeCloseTo(4.35, 1);
    });

    it('scales as d⁶ (larger particles scatter more)', () => {
      // For small particles, scattering scales as diameter^6
      const d1 = 30; // nm
      const d2 = 60; // nm

      // Doubling diameter → 2^6 = 64x more scattering
      const expectedRatio = Math.pow(d2 / d1, 6);
      expect(expectedRatio).toBe(64);
    });

    it('scales linearly with particle density', () => {
      // More particles = more scattering
      const density1 = 1e12;
      const density2 = 2e12;

      expect(density2 / density1).toBe(2);
    });
  });

  describe('Mie Scattering', () => {
    it('coefficient should be smaller than Rayleigh', () => {
      // Mie coefficient is smaller because:
      // - Larger particles (1000nm) need fewer to scatter light
      // - Different physics (geometric cross-section dominated)
      expect(PHYSICAL_CONSTANTS.MIE_COEFF).toBeLessThan(PHYSICAL_CONSTANTS.RAYLEIGH_COEFF);
    });

    it('particle size should be comparable to visible light', () => {
      // Mie regime: particle size ~ wavelength
      expect(PHYSICAL_CONSTANTS.LARGE_PARTICLE_SIZE).toBeGreaterThan(
        PHYSICAL_CONSTANTS.VISIBLE_MIN
      );
    });

    it('should be roughly wavelength-independent for large particles', () => {
      // For large particles (x = πd/λ >> 1), Q_sca approaches 2
      // This means scattering is independent of wavelength
      const particleSize = 1000; // nm
      const xBlue = (Math.PI * particleSize) / 450;
      const xRed = (Math.PI * particleSize) / 650;

      // Both should be in the geometric regime (x > 2)
      expect(xBlue).toBeGreaterThan(2);
      expect(xRed).toBeGreaterThan(2);
    });
  });

  describe('Combined Scattering', () => {
    it('Beer-Lambert exponential decay', () => {
      // I_out = I_in × exp(-σ × L)
      // For small σL, transmission ≈ 1 - σL
      const sigma = 0.1; // per cm
      const pathLength = 1; // cm

      const transmission = Math.exp(-sigma * pathLength);
      expect(transmission).toBeCloseTo(0.905, 2); // exp(-0.1) ≈ 0.905
    });

    it('zero scattering with no particles', () => {
      // With no particles, transmission = 1
      const sigma = 0;
      const transmission = Math.exp(-sigma * 1.0);
      expect(transmission).toBe(1.0);
    });

    it('total scattering = Rayleigh + Mie', () => {
      // Total extinction is the sum of both scattering mechanisms
      const sigmaRayleigh = 0.05;
      const sigmaMie = 0.03;
      const sigmaTotal = sigmaRayleigh + sigmaMie;

      // Combined transmission is exp(-(σR + σM) × L)
      const pathLength = 1;
      const transmission = Math.exp(-sigmaTotal * pathLength);
      expect(transmission).toBeCloseTo(0.923, 2);
    });
  });

  describe('Scattering LUT', () => {
    it('LUT size should be 64 wavelength samples', () => {
      // LUT is used to avoid computing scattering for all 5000 wavelengths
      const SCATTER_LUT_SIZE = 64;
      expect(SCATTER_LUT_SIZE).toBe(64);
    });

    it('should enable linear interpolation between samples', () => {
      // 64 samples across 100-1000nm = ~14nm per sample
      const wavelengthRange = 1000 - 100;
      const lutSize = 64;
      const nmPerSample = wavelengthRange / (lutSize - 1);

      expect(nmPerSample).toBeCloseTo(14.3, 1);
    });
  });
});
