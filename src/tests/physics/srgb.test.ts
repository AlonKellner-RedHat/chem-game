/**
 * Tests for sRGB Color Conversion
 */
import { describe, expect, it } from 'vitest';
import {
  gammaCorrect,
  normalizeXYZ,
  srgbTo8Bit,
  xyzTo8BitSRGB,
  xyzToLinearRGB,
  xyzToSRGB,
} from '../../core/physics/srgb';

describe('sRGB Conversion', () => {
  describe('gammaCorrect', () => {
    it('returns 0 for 0 input', () => {
      expect(gammaCorrect(0)).toBe(0);
    });

    it('returns 0 for negative input', () => {
      expect(gammaCorrect(-0.5)).toBe(0);
    });

    it('uses linear portion for small values', () => {
      const result = gammaCorrect(0.001);
      expect(result).toBeCloseTo(0.001 * 12.92, 5);
    });

    it('uses power curve for larger values', () => {
      const result = gammaCorrect(0.5);
      const expected = 1.055 * Math.pow(0.5, 1 / 2.4) - 0.055;
      expect(result).toBeCloseTo(expected, 5);
    });

    it('returns ~1.0 for input of 1.0', () => {
      const result = gammaCorrect(1.0);
      expect(result).toBeCloseTo(1.0, 5);
    });

    it('can exceed 1.0 for HDR input', () => {
      const result = gammaCorrect(2.0);
      expect(result).toBeGreaterThan(1.0);
    });
  });

  describe('xyzToLinearRGB', () => {
    it('converts D65 white point to approximately [1, 1, 1]', () => {
      // D65 white point: X=0.9505, Y=1.0000, Z=1.0890
      const [r, g, b] = xyzToLinearRGB([0.9505, 1.0, 1.089]);

      expect(r).toBeCloseTo(1.0, 1);
      expect(g).toBeCloseTo(1.0, 1);
      expect(b).toBeCloseTo(1.0, 1);
    });

    it('returns [0, 0, 0] for black', () => {
      const [r, g, b] = xyzToLinearRGB([0, 0, 0]);

      expect(r).toBe(0);
      expect(g).toBe(0);
      expect(b).toBe(0);
    });

    it('handles pure colors', () => {
      // Pure spectral red (around 700nm) has high X, low Y/Z
      // This won't produce pure RGB red but should have high R
      const [r, g, b] = xyzToLinearRGB([0.4, 0.2, 0.01]);

      expect(r).toBeGreaterThan(g);
      expect(r).toBeGreaterThan(b);
    });
  });

  describe('xyzToSRGB', () => {
    it('returns values in 0-1 range when clamped', () => {
      const [r, g, b] = xyzToSRGB([0.5, 0.5, 0.5], true);

      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(1);
    });

    it('can exceed range when not clamped', () => {
      const [r, g, b] = xyzToSRGB([2.0, 2.0, 2.0], false);

      // At least one should exceed 1.0
      expect(r > 1 || g > 1 || b > 1).toBe(true);
    });

    it('applies gamma correction', () => {
      const [r] = xyzToSRGB([0.5, 0.5, 0.5]);
      const [linearR] = xyzToLinearRGB([0.5, 0.5, 0.5]);

      // Gamma corrected should differ from linear
      expect(r).not.toBe(linearR);
    });
  });

  describe('srgbTo8Bit', () => {
    it('converts 0 to 0', () => {
      const [r, g, b] = srgbTo8Bit([0, 0, 0]);

      expect(r).toBe(0);
      expect(g).toBe(0);
      expect(b).toBe(0);
    });

    it('converts 1 to 255', () => {
      const [r, g, b] = srgbTo8Bit([1, 1, 1]);

      expect(r).toBe(255);
      expect(g).toBe(255);
      expect(b).toBe(255);
    });

    it('converts 0.5 to approximately 128', () => {
      const [r] = srgbTo8Bit([0.5, 0.5, 0.5]);

      expect(r).toBe(128);
    });

    it('clamps values exceeding range', () => {
      const [r, g, b] = srgbTo8Bit([1.5, -0.5, 0.5]);

      expect(r).toBe(255);
      expect(g).toBe(0);
      expect(b).toBe(128);
    });

    it('returns integers', () => {
      const [r, g, b] = srgbTo8Bit([0.33, 0.66, 0.99]);

      expect(Number.isInteger(r)).toBe(true);
      expect(Number.isInteger(g)).toBe(true);
      expect(Number.isInteger(b)).toBe(true);
    });
  });

  describe('xyzTo8BitSRGB', () => {
    it('combines conversion and quantization', () => {
      const result = xyzTo8BitSRGB([0.5, 0.5, 0.5]);

      expect(result).toHaveLength(3);
      expect(result.every((v) => v >= 0 && v <= 255)).toBe(true);
      expect(result.every(Number.isInteger)).toBe(true);
    });
  });

  describe('normalizeXYZ', () => {
    it('divides by maxY', () => {
      const [x, y, z] = normalizeXYZ([1.0, 2.0, 0.5], 2.0);

      expect(x).toBe(0.5);
      expect(y).toBe(1.0);
      expect(z).toBe(0.25);
    });

    it('returns [0,0,0] for zero maxY', () => {
      const result = normalizeXYZ([1.0, 2.0, 0.5], 0);

      expect(result).toEqual([0, 0, 0]);
    });

    it('returns [0,0,0] for negative maxY', () => {
      const result = normalizeXYZ([1.0, 2.0, 0.5], -1);

      expect(result).toEqual([0, 0, 0]);
    });
  });
});
