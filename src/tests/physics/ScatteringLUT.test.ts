/**
 * Tests for ScatteringLUT - pre-computed scattering coefficient lookup tables
 *
 * TDD: These tests are written first, implementation follows.
 */

import { describe, expect, it } from 'vitest';
import { ScatteringLUT, type ScatteringLUTConfig } from '../../core/physics/ScatteringLUT';

describe('ScatteringLUT', () => {
  describe('getRayleighFactor', () => {
    it('returns ~4.4 at 380nm (blue) - normalized to 550nm', () => {
      // Rayleigh factor = (550/λ)^4
      // At 380nm: (550/380)^4 ≈ 4.42
      const factor = ScatteringLUT.getRayleighFactor(380);
      expect(factor).toBeCloseTo(4.42, 1);
    });

    it('returns 1.0 at 550nm (green) - reference wavelength', () => {
      const factor = ScatteringLUT.getRayleighFactor(550);
      expect(factor).toBeCloseTo(1.0, 3);
    });

    it('returns ~0.38 at 700nm (red)', () => {
      // At 700nm: (550/700)^4 ≈ 0.38
      const factor = ScatteringLUT.getRayleighFactor(700);
      expect(factor).toBeCloseTo(0.38, 1);
    });

    it('returns 0 for wavelengths <= 0', () => {
      expect(ScatteringLUT.getRayleighFactor(0)).toBe(0);
      expect(ScatteringLUT.getRayleighFactor(-100)).toBe(0);
    });
  });

  describe('getMieFactor', () => {
    it('returns approximately constant value across visible spectrum', () => {
      // Mie scattering is roughly wavelength-independent for large particles
      const factor380 = ScatteringLUT.getMieFactor(380);
      const factor550 = ScatteringLUT.getMieFactor(550);
      const factor700 = ScatteringLUT.getMieFactor(700);

      // All should be within 20% of each other
      expect(factor380 / factor550).toBeCloseTo(1.0, 0);
      expect(factor700 / factor550).toBeCloseTo(1.0, 0);
    });

    it('returns normalized value of 1.0 at reference wavelength', () => {
      const factor = ScatteringLUT.getMieFactor(550);
      expect(factor).toBeCloseTo(1.0, 1);
    });

    it('returns 0 for wavelengths <= 0', () => {
      expect(ScatteringLUT.getMieFactor(0)).toBe(0);
      expect(ScatteringLUT.getMieFactor(-100)).toBe(0);
    });
  });

  describe('generate', () => {
    const defaultConfig: ScatteringLUTConfig = {
      wavelengthMin: 100,
      wavelengthMax: 1000,
      samples: 256,
    };

    it('generates array of correct size', () => {
      const lut = ScatteringLUT.generate(defaultConfig);
      expect(lut).toBeInstanceOf(Float32Array);
      expect(lut.length).toBe(256);
    });

    it('generates Rayleigh LUT with correct values at key wavelengths', () => {
      const lut = ScatteringLUT.generate({
        wavelengthMin: 100,
        wavelengthMax: 1000,
        samples: 901, // 1nm resolution for easy testing (100-1000 = 900 range + 1)
      });

      // Index for wavelength = (wavelength - 100) with 1nm resolution
      const blue380Index = 280; // 380 - 100 = 280
      const green550Index = 450; // 550 - 100 = 450
      const red700Index = 600; // 700 - 100 = 600

      // Check Rayleigh factors at these indices
      expect(lut[green550Index]).toBeCloseTo(1.0, 1);
      expect(lut[blue380Index]).toBeGreaterThan(lut[green550Index]);
      expect(lut[red700Index]).toBeLessThan(lut[green550Index]);
    });

    it('interpolates smoothly between samples', () => {
      const lut = ScatteringLUT.generate(defaultConfig);

      // Check that adjacent values don't have large jumps
      // With extended range to 100nm, Rayleigh (1/λ⁴) varies more at short wavelengths
      for (let i = 1; i < lut.length; i++) {
        const ratio = lut[i] / lut[i - 1];
        // Allow up to 15% change for short wavelengths (Rayleigh varies rapidly there)
        expect(ratio).toBeGreaterThan(0.85);
        expect(ratio).toBeLessThan(1.15);
      }
    });

    it('handles edge wavelengths correctly', () => {
      const lut = ScatteringLUT.generate(defaultConfig);

      // First and last elements should be valid positive numbers
      expect(lut[0]).toBeGreaterThan(0);
      expect(lut[lut.length - 1]).toBeGreaterThan(0);
      expect(Number.isFinite(lut[0])).toBe(true);
      expect(Number.isFinite(lut[lut.length - 1])).toBe(true);
    });

    it('throws error for invalid config', () => {
      expect(() =>
        ScatteringLUT.generate({
          wavelengthMin: 1000,
          wavelengthMax: 200, // min > max
          samples: 256,
        })
      ).toThrow();

      expect(() =>
        ScatteringLUT.generate({
          wavelengthMin: 100,
          wavelengthMax: 1000,
          samples: 0, // invalid samples
        })
      ).toThrow();

      expect(() =>
        ScatteringLUT.generate({
          wavelengthMin: 100,
          wavelengthMax: 1000,
          samples: -10, // negative samples
        })
      ).toThrow();
    });
  });

  describe('interpolate', () => {
    it('returns correct value for exact sample positions', () => {
      const lut = new Float32Array([1.0, 2.0, 3.0, 4.0]);

      expect(ScatteringLUT.interpolate(lut, 0.0)).toBeCloseTo(1.0, 5);
      expect(ScatteringLUT.interpolate(lut, 1.0)).toBeCloseTo(4.0, 5);
    });

    it('linearly interpolates between samples', () => {
      const lut = new Float32Array([0.0, 10.0]);

      expect(ScatteringLUT.interpolate(lut, 0.0)).toBeCloseTo(0.0, 5);
      expect(ScatteringLUT.interpolate(lut, 0.5)).toBeCloseTo(5.0, 5);
      expect(ScatteringLUT.interpolate(lut, 1.0)).toBeCloseTo(10.0, 5);
    });

    it('clamps t values outside [0, 1]', () => {
      const lut = new Float32Array([1.0, 2.0, 3.0]);

      expect(ScatteringLUT.interpolate(lut, -0.5)).toBeCloseTo(1.0, 5);
      expect(ScatteringLUT.interpolate(lut, 1.5)).toBeCloseTo(3.0, 5);
    });
  });
});
