import { describe, it, expect } from 'vitest';
import { CIE, SpectrumPoint } from '../../../src/core/spectral/CIE';
import { PerPixelSpectralRenderer } from '../../../src/core/spectral/PerPixelSpectralRenderer';

describe('Spectral White Test', () => {
  describe('uniform spectral distribution', () => {
    it('should produce RGB white (#ffffff) for uniform spectrum over visible range', () => {
      // Create uniform spectrum: all wavelengths in visible range (380-700nm) have transmission = 1.0
      const spectrum: SpectrumPoint[] = [];
      const minWavelength = 380;
      const maxWavelength = 700;
      const numPoints = 100;

      for (let i = 0; i < numPoints; i++) {
        const wavelength = i === numPoints - 1
          ? maxWavelength
          : minWavelength + (i / (numPoints - 1)) * (maxWavelength - minWavelength);
        spectrum.push({ wavelength, transmission: 1.0 });
      }

      // Convert to XYZ
      const xyz = CIE.spectrumToXYZ(spectrum, 'D65');

      // Convert to sRGB (already in 0-255 range)
      const rgb = CIE.xyzToSRGB(xyz);

      // Should be close to white (#ffffff)
      // Allow some tolerance for numerical precision
      expect(rgb.r).toBeGreaterThan(240);
      expect(rgb.g).toBeGreaterThan(240);
      expect(rgb.b).toBeGreaterThan(240);
      expect(rgb.r).toBeLessThanOrEqual(255);
      expect(rgb.g).toBeLessThanOrEqual(255);
      expect(rgb.b).toBeLessThanOrEqual(255);
    });

    it('should produce RGB white using PerPixelSpectralRenderer', () => {
      const renderer = new PerPixelSpectralRenderer();
      
      // Create uniform spectrum over visible range
      const spectrum: SpectrumPoint[] = [];
      const minWavelength = 380;
      const maxWavelength = 700;
      const numPoints = 100;

      for (let i = 0; i < numPoints; i++) {
        const wavelength = i === numPoints - 1
          ? maxWavelength
          : minWavelength + (i / (numPoints - 1)) * (maxWavelength - minWavelength);
        spectrum.push({ wavelength, transmission: 1.0 });
      }

      // Convert to RGB
      const rgb = renderer.spectrumToRGB(spectrum, 'D65');

      // Should be close to white
      expect(rgb.r).toBeGreaterThan(240);
      expect(rgb.g).toBeGreaterThan(240);
      expect(rgb.b).toBeGreaterThan(240);
    });

    it('should produce white for background spectrum uniform over visible', () => {
      const renderer = new PerPixelSpectralRenderer();
      
      // Background spectrum: uniform over visible (380-700nm), fades in UV/IR
      const spectrum: SpectrumPoint[] = [];
      const minWavelength = 200;
      const maxWavelength = 1000;
      const numPoints = 100;
      const visibleMin = 380;
      const visibleMax = 700;

      for (let i = 0; i < numPoints; i++) {
        const wavelength = i === numPoints - 1
          ? maxWavelength
          : minWavelength + (i / (numPoints - 1)) * (maxWavelength - minWavelength);
        
        // Calculate fade factor
        let transmission = 1.0;
        if (wavelength < visibleMin) {
          // UV fade: linear from 0 at 200nm to 1.0 at 380nm
          transmission = Math.max(0, (wavelength - 200) / (visibleMin - 200));
        } else if (wavelength > visibleMax) {
          // IR fade: linear from 1.0 at 700nm to 0 at 1000nm
          transmission = Math.max(0, 1.0 - (wavelength - visibleMax) / (1000 - visibleMax));
        }
        
        spectrum.push({ wavelength, transmission });
      }

      // Convert to RGB
      const rgb = renderer.spectrumToRGB(spectrum, 'D65');

      // Should be close to white (most power in visible range)
      expect(rgb.r).toBeGreaterThan(200);
      expect(rgb.g).toBeGreaterThan(200);
      expect(rgb.b).toBeGreaterThan(200);
    });
  });

  describe('brightness normalization', () => {
    it('should preserve color ratios when normalizing', () => {
      const renderer = new PerPixelSpectralRenderer();
      
      const rgb1: CIE.RGB = { r: 100, g: 200, b: 150 };
      const rgb2: CIE.RGB = { r: 50, g: 100, b: 75 };
      
      const maxBrightness = Math.max(rgb1.r, rgb1.g, rgb1.b, rgb2.r, rgb2.g, rgb2.b); // 200
      
      const normalized1 = renderer.normalizeRGB(rgb1, maxBrightness);
      const normalized2 = renderer.normalizeRGB(rgb2, maxBrightness);
      
      // Color ratios should be preserved within each color
      const ratio1_rg = rgb1.r / rgb1.g;
      const ratio1_rg_norm = normalized1.r / normalized1.g;
      expect(ratio1_rg_norm).toBeCloseTo(ratio1_rg, 2);
      
      const ratio2_rg = rgb2.r / rgb2.g;
      const ratio2_rg_norm = normalized2.r / normalized2.g;
      expect(ratio2_rg_norm).toBeCloseTo(ratio2_rg, 2);
      
      // rgb1 should have max component = 255 (since its max was 200, which equals maxBrightness)
      expect(Math.max(normalized1.r, normalized1.g, normalized1.b)).toBe(255);
      
      // rgb2 max component was 100, so normalized2 max = (100/200)*255 = 127.5 ≈ 128
      expect(Math.max(normalized2.r, normalized2.g, normalized2.b)).toBe(128);
      
      // Ratios are preserved: both have r/g = 0.5
      expect(normalized2.r / normalized2.g).toBeCloseTo(0.5, 2);
      expect(normalized1.r / normalized1.g).toBeCloseTo(0.5, 2);
    });

    it('should scale brightest color to 255 when maxBrightness > 0', () => {
      const renderer = new PerPixelSpectralRenderer();
      
      const rgb: CIE.RGB = { r: 100, g: 200, b: 150 };
      const maxBrightness = 200; // Max component
      
      const normalized = renderer.normalizeRGB(rgb, maxBrightness);
      
      // Max component should be 255
      const maxComponent = Math.max(normalized.r, normalized.g, normalized.b);
      expect(maxComponent).toBe(255);
      
      // Other components should scale proportionally
      expect(normalized.g).toBe(255); // Was max
      // 100 * 255 / 200 = 127.5, rounds to 128
      expect(normalized.r).toBe(128);
      // 150 * 255 / 200 = 191.25, rounds to 191
      expect(normalized.b).toBe(191);
    });

    it('should handle zero maxBrightness', () => {
      const renderer = new PerPixelSpectralRenderer();
      
      const rgb: CIE.RGB = { r: 100, g: 200, b: 150 };
      const normalized = renderer.normalizeRGB(rgb, 0);
      
      expect(normalized.r).toBe(0);
      expect(normalized.g).toBe(0);
      expect(normalized.b).toBe(0);
    });
  });
});

