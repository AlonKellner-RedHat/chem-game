/**
 * Voigt Profile Tests
 *
 * Tests for the true Voigt profile implementation.
 * Voigt = Gaussian ⊗ Lorentzian (convolution)
 *
 * The Voigt function combines:
 * - Doppler broadening (Gaussian) from thermal motion
 * - Pressure/natural broadening (Lorentzian) from collisions
 */

import { describe, expect, it } from 'vitest';
import {
  gaussianProfile,
  lorentzianProfile,
  voigtFWHM,
  voigtProfile,
} from '../../core/physics/voigt';

describe('Voigt Profile', () => {
  describe('Gaussian Profile (Doppler limit)', () => {
    it('has maximum at center', () => {
      const center = gaussianProfile(0, 1.0);
      const offCenter = gaussianProfile(0.5, 1.0);
      expect(center).toBeGreaterThan(offCenter);
    });

    it('is symmetric', () => {
      const left = gaussianProfile(-1.0, 1.0);
      const right = gaussianProfile(1.0, 1.0);
      expect(left).toBeCloseTo(right, 6);
    });

    it('scales with FWHM', () => {
      // Wider FWHM = lower peak
      const narrow = gaussianProfile(0, 0.5);
      const wide = gaussianProfile(0, 2.0);
      expect(narrow).toBeGreaterThan(wide);
    });
  });

  describe('Lorentzian Profile (Pressure limit)', () => {
    it('has maximum at center', () => {
      const center = lorentzianProfile(0, 1.0);
      const offCenter = lorentzianProfile(0.5, 1.0);
      expect(center).toBeGreaterThan(offCenter);
    });

    it('is symmetric', () => {
      const left = lorentzianProfile(-1.0, 1.0);
      const right = lorentzianProfile(1.0, 1.0);
      expect(left).toBeCloseTo(right, 6);
    });

    it('has longer tails than Gaussian', () => {
      // At 3 sigma, Lorentzian should be higher than Gaussian
      const gaussianTail = gaussianProfile(3.0, 1.0);
      const lorentzianTail = lorentzianProfile(3.0, 1.0);
      expect(lorentzianTail).toBeGreaterThan(gaussianTail);
    });
  });

  describe('Voigt Profile', () => {
    it('reduces to Gaussian when Lorentzian width is zero', () => {
      const gaussianFWHM = 1.0;
      const lorentzianFWHM = 0;

      const voigt = voigtProfile(0.5, gaussianFWHM, lorentzianFWHM);
      const gaussian = gaussianProfile(0.5, gaussianFWHM);

      expect(voigt).toBeCloseTo(gaussian, 2);
    });

    it('reduces to Lorentzian when Gaussian width is zero', () => {
      const gaussianFWHM = 0;
      const lorentzianFWHM = 1.0;

      const voigt = voigtProfile(0.5, gaussianFWHM, lorentzianFWHM);
      const lorentzian = lorentzianProfile(0.5, lorentzianFWHM);

      expect(voigt).toBeCloseTo(lorentzian, 2);
    });

    it('is between Gaussian and Lorentzian for mixed broadening', () => {
      const x = 3.0; // In the tails
      const gaussianFWHM = 1.0;
      const lorentzianFWHM = 1.0;

      const voigt = voigtProfile(x, gaussianFWHM, lorentzianFWHM);
      const gaussian = gaussianProfile(x, gaussianFWHM);
      const lorentzian = lorentzianProfile(x, lorentzianFWHM);

      // Voigt tail should be between Gaussian (fast decay) and Lorentzian (slow decay)
      expect(voigt).toBeGreaterThan(gaussian * 0.5);
      expect(voigt).toBeLessThan(lorentzian * 2);
    });

    it('has maximum at center', () => {
      const center = voigtProfile(0, 1.0, 1.0);
      const offCenter = voigtProfile(0.5, 1.0, 1.0);
      expect(center).toBeGreaterThan(offCenter);
    });

    it('is symmetric', () => {
      const left = voigtProfile(-1.0, 1.0, 1.0);
      const right = voigtProfile(1.0, 1.0, 1.0);
      expect(left).toBeCloseTo(right, 5);
    });
  });

  describe('voigtFWHM', () => {
    it('equals Gaussian FWHM when Lorentzian is zero', () => {
      const fwhm = voigtFWHM(2.0, 0);
      expect(fwhm).toBeCloseTo(2.0, 2);
    });

    it('equals Lorentzian FWHM when Gaussian is zero', () => {
      const fwhm = voigtFWHM(0, 2.0);
      expect(fwhm).toBeCloseTo(2.0, 2);
    });

    it('is wider than either component alone for mixed broadening', () => {
      const gaussianFWHM = 1.0;
      const lorentzianFWHM = 1.0;
      const totalFWHM = voigtFWHM(gaussianFWHM, lorentzianFWHM);

      expect(totalFWHM).toBeGreaterThan(gaussianFWHM);
      expect(totalFWHM).toBeGreaterThan(lorentzianFWHM);
    });

    it('follows Olivero approximation', () => {
      // For equal widths, FWHM ≈ 0.5346 * L + sqrt(0.2166 * L² + G²)
      const G = 1.0;
      const L = 1.0;
      const expected = 0.5346 * L + Math.sqrt(0.2166 * L * L + G * G);
      const actual = voigtFWHM(G, L);

      expect(actual).toBeCloseTo(expected, 2);
    });
  });
});
