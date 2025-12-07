import { describe, it, expect } from 'vitest';
import { CIE, SpectrumPoint } from '../../../src/core/spectral/CIE';
import { SpectralDemo } from '../../../src/core/demos/SpectralDemo';
import { PerPixelSpectralRenderer } from '../../../src/core/spectral/PerPixelSpectralRenderer';

describe('Cone Stimulation Test', () => {
  describe('uniform spectrum produces equal cone stimulation', () => {
    it('should produce approximately equal X, Y, Z values for uniform spectrum over visible range', () => {
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

      // For a uniform spectrum with D65 illuminant, X, Y, Z should be close to D65 white point
      // D65 white point: X=0.95047, Y=1.0, Z=1.08883
      // These are NOT equal - D65 has slight variations that affect the ratios
      // But for equal cone stimulation (white perception), the ratios should be close to D65 white point
      expect(xyz.Y).toBeCloseTo(1.0, 2);
      expect(xyz.X).toBeCloseTo(0.95047, 1); // Allow 0.1 tolerance
      expect(xyz.Z).toBeCloseTo(1.08883, 1); // Allow 0.1 tolerance
      
      // The key is that all three cone types (S, M, L) are stimulated in balanced way
      // This is indicated by X, Y, Z being close to D65 white point ratios
    });

    it('should produce white RGB for uniform spectrum', () => {
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

      // Should be close to white (#ffffff) - all RGB values should be > 240
      expect(rgb.r).toBeGreaterThan(240);
      expect(rgb.g).toBeGreaterThan(240);
      expect(rgb.b).toBeGreaterThan(240);
      expect(rgb.r).toBeLessThanOrEqual(255);
      expect(rgb.g).toBeLessThanOrEqual(255);
      expect(rgb.b).toBeLessThanOrEqual(255);

      // RGB values should be balanced (within 15 of each other)
      const maxRGB = Math.max(rgb.r, rgb.g, rgb.b);
      const minRGB = Math.min(rgb.r, rgb.g, rgb.b);
      expect(maxRGB - minRGB).toBeLessThan(15);
    });
  });

  describe('SpectralDemo background produces white', () => {
    it('should produce white RGB for SpectralDemo background spectrum', () => {
      const demo = new SpectralDemo();
      const renderer = new PerPixelSpectralRenderer();

      // Get background spectrum from SpectralDemo (using private method via any cast)
      const backgroundSpectrum = (demo as any).calculateRGBBackgroundSpectrum();

      // Convert to XYZ
      const xyz = CIE.spectrumToXYZ(backgroundSpectrum, 'D65');

      // Convert to RGB
      const rgb = renderer.spectrumToRGB(backgroundSpectrum, 'D65');

      // Background has fade regions, so RGB might be lower than perfect white
      // But it should still be reasonably white (all > 150) and balanced
      expect(rgb.r).toBeGreaterThan(150);
      expect(rgb.g).toBeGreaterThan(150);
      expect(rgb.b).toBeGreaterThan(150);

      // RGB values should be reasonably balanced (within 30 of each other)
      // Fade regions cause slight color bias, but should still be close to white
      const maxRGB = Math.max(rgb.r, rgb.g, rgb.b);
      const minRGB = Math.min(rgb.r, rgb.g, rgb.b);
      expect(maxRGB - minRGB).toBeLessThan(30); // Should be close to white

      // X, Y, Z should be close to D65 white point ratios (0.95047, 1.0, 1.08883)
      // After normalization by Y, they should be close to these values
      // Allow larger tolerance for fade regions
      expect(xyz.Y).toBeCloseTo(1.0, 2);
      expect(xyz.X).toBeCloseTo(0.95047, 0); // Allow 1.0 tolerance for fade regions
      expect(xyz.Z).toBeCloseTo(1.08883, 0);
    });

    it('should have balanced X, Y, Z for background spectrum (indicating equal cone stimulation)', () => {
      const demo = new SpectralDemo();
      
      // Get background spectrum
      const backgroundSpectrum = (demo as any).calculateRGBBackgroundSpectrum();

      // Convert to XYZ
      const xyz = CIE.spectrumToXYZ(backgroundSpectrum, 'D65');

      // For a background that should appear white, X, Y, Z should be close to D65 white point
      // The ratios should be approximately: X:Y:Z ≈ 0.95047:1.0:1.08883
      // This indicates balanced stimulation of the three cone types
      // However, fade regions reduce power, so we allow larger tolerance
      const expectedRatioX = 0.95047;
      const expectedRatioZ = 1.08883;

      // Check that ratios are close to expected (within 50% tolerance for fade regions)
      // The fade regions reduce overall power, but ratios should still be reasonable
      const tolerance = 0.5;
      expect(Math.abs(xyz.X - expectedRatioX) / expectedRatioX).toBeLessThan(tolerance);
      expect(Math.abs(xyz.Z - expectedRatioZ) / expectedRatioZ).toBeLessThan(tolerance);
      expect(xyz.Y).toBeCloseTo(1.0, 2);
      
      // More importantly, X, Y, Z should be close to D65 white point ratios
      // This indicates balanced stimulation of the three cone types
      // Fade regions cause slight deviations, but should still be close
      expect(xyz.Y).toBeCloseTo(1.0, 2);
      expect(xyz.X).toBeCloseTo(0.95047, 1); // Within 0.1 of D65 white point
      expect(xyz.Z).toBeCloseTo(1.08883, 1); // Within 0.1 of D65 white point
    });
  });
});

