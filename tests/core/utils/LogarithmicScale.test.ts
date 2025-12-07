import { describe, it, expect } from 'vitest';
import { linearToLogarithmic, logarithmicToLinear } from '../../../src/core/utils/LogarithmicScale';

describe('LogarithmicScale', () => {
  describe('linearToLogarithmic', () => {
    it('should return min value when position is 0', () => {
      expect(linearToLogarithmic(0, 0.01, 1000)).toBe(0.01);
      expect(linearToLogarithmic(0, 1, 2000)).toBe(1);
      expect(linearToLogarithmic(0, 0.0001, 0.1)).toBe(0.0001);
    });

    it('should return max value when position is 1', () => {
      expect(linearToLogarithmic(1, 0.01, 1000)).toBe(1000);
      expect(linearToLogarithmic(1, 1, 2000)).toBe(2000);
      expect(linearToLogarithmic(1, 0.0001, 0.1)).toBe(0.1);
    });

    it('should return geometric mean when position is 0.5', () => {
      const result = linearToLogarithmic(0.5, 0.01, 1000);
      const expected = Math.sqrt(0.01 * 1000); // geometric mean ≈ 3.16
      expect(result).toBeCloseTo(expected, 2);
    });

    it('should handle depth range (0.01 to 1000 meters)', () => {
      expect(linearToLogarithmic(0, 0.01, 1000)).toBe(0.01);
      expect(linearToLogarithmic(1, 0.01, 1000)).toBe(1000);
      const mid = linearToLogarithmic(0.5, 0.01, 1000);
      expect(mid).toBeGreaterThan(0.01);
      expect(mid).toBeLessThan(1000);
      expect(mid).toBeCloseTo(Math.sqrt(0.01 * 1000), 2);
    });

    it('should handle concentration range (0.0001 to 0.1 M)', () => {
      expect(linearToLogarithmic(0, 0.0001, 0.1)).toBe(0.0001);
      expect(linearToLogarithmic(1, 0.0001, 0.1)).toBe(0.1);
      const mid = linearToLogarithmic(0.5, 0.0001, 0.1);
      expect(mid).toBeGreaterThan(0.0001);
      expect(mid).toBeLessThan(0.1);
      expect(mid).toBeCloseTo(Math.sqrt(0.0001 * 0.1), 4);
    });

    it('should handle temperature range (1 to 2000 K)', () => {
      expect(linearToLogarithmic(0, 1, 2000)).toBe(1);
      expect(linearToLogarithmic(1, 1, 2000)).toBe(2000);
      const mid = linearToLogarithmic(0.5, 1, 2000);
      expect(mid).toBeGreaterThan(1);
      expect(mid).toBeLessThan(2000);
      expect(mid).toBeCloseTo(Math.sqrt(1 * 2000), 0);
    });

    it('should handle edge case with min = 0', () => {
      // When min is 0, we need special handling
      const result = linearToLogarithmic(0.5, 0, 1000);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(1000);
    });

    it('should handle very small values', () => {
      const result = linearToLogarithmic(0.1, 0.0001, 0.1);
      expect(result).toBeGreaterThan(0.0001);
      expect(result).toBeLessThan(0.1);
    });

    it('should handle very large values', () => {
      const result = linearToLogarithmic(0.9, 0.01, 1000);
      expect(result).toBeGreaterThan(0.01);
      expect(result).toBeLessThan(1000);
    });
  });

  describe('logarithmicToLinear', () => {
    it('should return 0 when value equals min', () => {
      expect(logarithmicToLinear(0.01, 0.01, 1000)).toBeCloseTo(0, 5);
      expect(logarithmicToLinear(1, 1, 2000)).toBeCloseTo(0, 5);
      expect(logarithmicToLinear(0.0001, 0.0001, 0.1)).toBeCloseTo(0, 5);
    });

    it('should return 1 when value equals max', () => {
      expect(logarithmicToLinear(1000, 0.01, 1000)).toBeCloseTo(1, 5);
      expect(logarithmicToLinear(2000, 1, 2000)).toBeCloseTo(1, 5);
      expect(logarithmicToLinear(0.1, 0.0001, 0.1)).toBeCloseTo(1, 5);
    });

    it('should be inverse of linearToLogarithmic', () => {
      const testCases = [
        { position: 0.1, min: 0.01, max: 1000 },
        { position: 0.5, min: 0.01, max: 1000 },
        { position: 0.9, min: 0.01, max: 1000 },
        { position: 0.25, min: 0.0001, max: 0.1 },
        { position: 0.75, min: 1, max: 2000 },
      ];

      for (const testCase of testCases) {
        const value = linearToLogarithmic(
          testCase.position,
          testCase.min,
          testCase.max
        );
        const position = logarithmicToLinear(value, testCase.min, testCase.max);
        expect(position).toBeCloseTo(testCase.position, 5);
      }
    });

    it('should handle depth range (0.01 to 1000 meters)', () => {
      expect(logarithmicToLinear(0.01, 0.01, 1000)).toBeCloseTo(0, 5);
      expect(logarithmicToLinear(1000, 0.01, 1000)).toBeCloseTo(1, 5);
      const midValue = Math.sqrt(0.01 * 1000);
      const midPosition = logarithmicToLinear(midValue, 0.01, 1000);
      expect(midPosition).toBeCloseTo(0.5, 2);
    });

    it('should handle concentration range (0.0001 to 0.1 M)', () => {
      expect(logarithmicToLinear(0.0001, 0.0001, 0.1)).toBeCloseTo(0, 5);
      expect(logarithmicToLinear(0.1, 0.0001, 0.1)).toBeCloseTo(1, 5);
    });

    it('should handle temperature range (1 to 2000 K)', () => {
      expect(logarithmicToLinear(1, 1, 2000)).toBeCloseTo(0, 5);
      expect(logarithmicToLinear(2000, 1, 2000)).toBeCloseTo(1, 5);
    });

    it('should handle edge case with min = 0', () => {
      const result = logarithmicToLinear(100, 0, 1000);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    });

    it('should clamp values outside range', () => {
      const belowMin = logarithmicToLinear(0.001, 0.01, 1000);
      expect(belowMin).toBeLessThanOrEqual(0);
      
      const aboveMax = logarithmicToLinear(2000, 0.01, 1000);
      expect(aboveMax).toBeGreaterThanOrEqual(1);
    });
  });
});

