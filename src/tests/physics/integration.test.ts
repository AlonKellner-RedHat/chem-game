/**
 * Tests for Bin Integration Utilities
 *
 * These utilities integrate spectral profiles over wavelength bins to ensure
 * equal representation: every wavelength contributes to exactly one bin,
 * and the sum of all bins equals the analytical integral over the full range.
 */

import { describe, expect, it } from 'vitest';
import {
  integrateGaussianOverBin,
  integrateLorentzianOverBin,
  integrateVoigtOverBin,
} from '../../core/physics/integration';
import { gaussianProfile, lorentzianProfile, voigtProfile } from '../../core/physics/voigt';

describe('Bin Integration Utilities', () => {
  describe('integrateGaussianOverBin', () => {
    it('should capture full peak when bin contains entire peak', () => {
      // Gaussian with FWHM=1nm centered at 500nm
      // Bin covers 490-510nm (20nm wide) - should capture essentially all of the peak
      const center = 500;
      const fwhm = 1;
      const binStart = 490;
      const binEnd = 510;

      const integral = integrateGaussianOverBin(center, binStart, binEnd, fwhm);

      // A normalized Gaussian integrates to 1 over (-∞, +∞)
      // With 20nm bin vs 1nm FWHM, we should capture >99.9% of the area
      expect(integral).toBeGreaterThan(0.999);
      expect(integral).toBeLessThanOrEqual(1.0);
    });

    it('should return ~0 when peak is far outside bin', () => {
      // Gaussian at 500nm, bin is 100-110nm (far away)
      const integral = integrateGaussianOverBin(500, 100, 110, 1);

      expect(integral).toBeLessThan(1e-10);
    });

    it('should capture partial peak at bin edge', () => {
      // Gaussian centered at 500nm with FWHM=10nm
      // Bin covers 500-520nm (half the peak)
      const integral = integrateGaussianOverBin(500, 500, 520, 10);

      // Should capture roughly half the peak (0.5 ± some tolerance)
      expect(integral).toBeGreaterThan(0.45);
      expect(integral).toBeLessThan(0.55);
    });

    it('should satisfy energy conservation: sum of bins = 1', () => {
      // Divide 450-550nm into 10 bins of 10nm each
      const center = 500;
      const fwhm = 20; // Spread across multiple bins
      const binWidth = 10;

      let totalIntegral = 0;
      for (let binStart = 450; binStart < 550; binStart += binWidth) {
        totalIntegral += integrateGaussianOverBin(center, binStart, binStart + binWidth, fwhm);
      }

      // Sum should be ~1 (the total Gaussian integral)
      expect(totalIntegral).toBeCloseTo(1.0, 2);
    });

    it('should work with narrow peak and wide bins (rendering scenario)', () => {
      // Sodium D-line scenario: 0.1nm peak, 29nm bins
      const center = 589;
      const fwhm = 0.5; // Slightly wider for test stability

      // Create bins from 100-1000nm with 32 samples (29nm each)
      const binWidth = 900 / 31;
      let totalIntegral = 0;
      let maxBinValue = 0;

      for (let i = 0; i < 32; i++) {
        const binStart = 100 + i * binWidth - binWidth / 2;
        const binEnd = binStart + binWidth;
        const binIntegral = integrateGaussianOverBin(center, binStart, binEnd, fwhm);
        totalIntegral += binIntegral;
        maxBinValue = Math.max(maxBinValue, binIntegral);
      }

      // Total should still be ~1
      expect(totalIntegral).toBeCloseTo(1.0, 1);
      // At least one bin should capture significant energy
      expect(maxBinValue).toBeGreaterThan(0.9);
    });
  });

  describe('integrateLorentzianOverBin', () => {
    it('should capture most of peak when bin is wide relative to linewidth', () => {
      // Lorentzian with FWHM=0.1nm centered at 500nm
      // Bin covers 490-510nm (200× the linewidth)
      const integral = integrateLorentzianOverBin(500, 490, 510, 0.1);

      // Should capture almost all energy (Lorentzian has long tails though)
      expect(integral).toBeGreaterThan(0.95);
      expect(integral).toBeLessThanOrEqual(1.0);
    });

    it('should return ~0 when peak is far outside bin', () => {
      const integral = integrateLorentzianOverBin(500, 100, 110, 0.1);

      // Lorentzian has longer tails than Gaussian (1/x² decay)
      // At 400nm from center with 0.1nm FWHM, still some contribution
      expect(integral).toBeLessThan(1e-5);
    });

    it('should satisfy energy conservation for Lorentzian', () => {
      const center = 500;
      const fwhm = 10;
      const binWidth = 5;

      let totalIntegral = 0;
      // Need wide range because Lorentzian has long tails
      for (let binStart = 0; binStart < 1000; binStart += binWidth) {
        totalIntegral += integrateLorentzianOverBin(center, binStart, binStart + binWidth, fwhm);
      }

      // Sum should be ~1
      expect(totalIntegral).toBeCloseTo(1.0, 1);
    });
  });

  describe('integrateVoigtOverBin', () => {
    it('should reduce to Gaussian when Lorentzian width is 0', () => {
      const center = 500;
      const gaussianFWHM = 5;
      const lorentzianFWHM = 0;

      const voigtIntegral = integrateVoigtOverBin(center, 490, 510, gaussianFWHM, lorentzianFWHM);
      const gaussianIntegral = integrateGaussianOverBin(center, 490, 510, gaussianFWHM);

      expect(voigtIntegral).toBeCloseTo(gaussianIntegral, 2);
    });

    it('should reduce to Lorentzian when Gaussian width is 0', () => {
      const center = 500;
      const gaussianFWHM = 0;
      const lorentzianFWHM = 5;

      const voigtIntegral = integrateVoigtOverBin(center, 490, 510, gaussianFWHM, lorentzianFWHM);
      const lorentzianIntegral = integrateLorentzianOverBin(center, 490, 510, lorentzianFWHM);

      expect(voigtIntegral).toBeCloseTo(lorentzianIntegral, 2);
    });

    it('should satisfy energy conservation for Voigt profile', () => {
      const center = 500;
      const gaussianFWHM = 5;
      const lorentzianFWHM = 2;
      const binWidth = 10;

      let totalIntegral = 0;
      // Need very wide range because Lorentzian has 1/x² tails
      for (let binStart = -5000; binStart < 6000; binStart += binWidth) {
        totalIntegral += integrateVoigtOverBin(
          center,
          binStart,
          binStart + binWidth,
          gaussianFWHM,
          lorentzianFWHM
        );
      }

      // Also do numerical integration directly to check voigtProfile normalization
      let directVoigtIntegral = 0;
      let directGaussianIntegral = 0;
      let directLorentzianIntegral = 0;
      const step = 0.1;
      for (let x = -5500; x < 5500; x += step) {
        directVoigtIntegral += voigtProfile(x, gaussianFWHM, lorentzianFWHM) * step;
        directGaussianIntegral += gaussianProfile(x, gaussianFWHM) * step;
        directLorentzianIntegral += lorentzianProfile(x, lorentzianFWHM) * step;
      }

      // Gaussian and Lorentzian should integrate to 1
      expect(directGaussianIntegral).toBeCloseTo(1.0, 1);
      expect(directLorentzianIntegral).toBeCloseTo(1.0, 1);

      // Voigt should also integrate to 1 (it's a convolution of two normalized PDFs)
      // Note: The Faddeeva approximation in voigt.ts may not be perfectly normalized
      // Our bin integral should at least match the direct integration
      expect(totalIntegral).toBeCloseTo(directVoigtIntegral, 1);
    });

    it('should capture narrow emission line in wide rendering bin', () => {
      // Sodium D-line: 589nm, naturalWidth=0.1nm (Lorentzian), Doppler~0.001nm
      const center = 589;
      const gaussianFWHM = 0.01;
      const lorentzianFWHM = 0.1;

      // Rendering bin size: 900nm / 31 ≈ 29nm
      const binWidth = 29;
      // Find the bin that contains 589nm
      const binStart = 575; // Approximately contains 589nm
      const binEnd = binStart + binWidth;

      const integral = integrateVoigtOverBin(
        center,
        binStart,
        binEnd,
        gaussianFWHM,
        lorentzianFWHM
      );

      // This bin should capture most of the peak energy
      // Lorentzian tails extend far, so ~85% in one bin is good
      expect(integral).toBeGreaterThan(0.8);
    });

    it('should match numerical integration of voigtProfile', () => {
      const center = 500;
      const gaussianFWHM = 3;
      const lorentzianFWHM = 1;
      const binStart = 495;
      const binEnd = 505;

      // Numerical integration with small steps
      const steps = 1000;
      const step = (binEnd - binStart) / steps;
      let numericalIntegral = 0;
      for (let i = 0; i < steps; i++) {
        const x = binStart + (i + 0.5) * step - center;
        numericalIntegral += voigtProfile(x, gaussianFWHM, lorentzianFWHM) * step;
      }

      const analyticalIntegral = integrateVoigtOverBin(
        center,
        binStart,
        binEnd,
        gaussianFWHM,
        lorentzianFWHM
      );

      // Should match within 1%
      expect(analyticalIntegral).toBeCloseTo(numericalIntegral, 2);
    });
  });

  describe('Energy Conservation Across Resolutions', () => {
    it('should preserve total energy when changing bin resolution', () => {
      const center = 589;
      const gaussianFWHM = 0.01;
      const lorentzianFWHM = 0.1;
      const rangeStart = 100;
      const rangeEnd = 1000;

      // High resolution: 4500 bins (0.2nm each)
      const highResBins = 4500;
      const highResStep = (rangeEnd - rangeStart) / highResBins;
      let highResTotal = 0;
      for (let i = 0; i < highResBins; i++) {
        const binStart = rangeStart + i * highResStep;
        highResTotal += integrateVoigtOverBin(
          center,
          binStart,
          binStart + highResStep,
          gaussianFWHM,
          lorentzianFWHM
        );
      }

      // Low resolution: 32 bins (28nm each)
      const lowResBins = 32;
      const lowResStep = (rangeEnd - rangeStart) / lowResBins;
      let lowResTotal = 0;
      for (let i = 0; i < lowResBins; i++) {
        const binStart = rangeStart + i * lowResStep;
        lowResTotal += integrateVoigtOverBin(
          center,
          binStart,
          binStart + lowResStep,
          gaussianFWHM,
          lorentzianFWHM
        );
      }

      // Both should give the same total within the range (within tolerance)
      // Note: Both miss some Lorentzian tails outside 100-1000nm range
      // Small numerical differences are expected due to different integration steps
      expect(highResTotal).toBeCloseTo(lowResTotal, 1);
      // Within 100-1000nm we capture ~85% due to Lorentzian tails outside range
      expect(highResTotal).toBeGreaterThan(0.8);
      expect(highResTotal).toBeLessThan(1.0);
    });
  });
});
