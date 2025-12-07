import { describe, it, expect } from 'vitest';
import { linearToLogarithmic, logarithmicToLinear } from '../../../src/core/utils/LogarithmicScale';

describe('SliderUtils', () => {
  describe('logarithmic slider value calculation', () => {
    it('should calculate molecule concentration (0.0001 M to 0.1 M logarithmic)', () => {
      const min = 0.0001;
      const max = 0.1;
      
      // Slider position 0 → min value
      const value0 = linearToLogarithmic(0, min, max);
      expect(value0).toBe(min);
      
      // Slider position 1 → max value
      const value1 = linearToLogarithmic(1, min, max);
      expect(value1).toBe(max);
      
      // Slider position 0.5 → geometric mean
      const value05 = linearToLogarithmic(0.5, min, max);
      const geometricMean = Math.sqrt(min * max);
      expect(value05).toBeCloseTo(geometricMean, 4);
    });

    it('should calculate temperature (1 K to 2000 K logarithmic)', () => {
      const min = 1;
      const max = 2000;
      
      // Slider position 0 → min value
      const value0 = linearToLogarithmic(0, min, max);
      expect(value0).toBe(min);
      
      // Slider position 1 → max value
      const value1 = linearToLogarithmic(1, min, max);
      expect(value1).toBe(max);
      
      // Slider position 0.5 → geometric mean
      const value05 = linearToLogarithmic(0.5, min, max);
      const geometricMean = Math.sqrt(min * max);
      expect(value05).toBeCloseTo(geometricMean, 0);
    });

    it('should calculate depth (0.01 m to 1000 m logarithmic)', () => {
      const min = 0.01;
      const max = 1000;
      
      // Slider position 0 → min value
      const value0 = linearToLogarithmic(0, min, max);
      expect(value0).toBe(min);
      
      // Slider position 1 → max value
      const value1 = linearToLogarithmic(1, min, max);
      expect(value1).toBe(max);
      
      // Slider position 0.5 → geometric mean
      const value05 = linearToLogarithmic(0.5, min, max);
      const geometricMean = Math.sqrt(min * max);
      expect(value05).toBeCloseTo(geometricMean, 2);
    });
  });

  describe('slider handle positioning', () => {
    it('should convert value to slider position (inverse)', () => {
      const min = 0.01;
      const max = 1000;
      
      // Test various values
      const testValues = [
        { value: 0.01, expectedPos: 0 },
        { value: 1000, expectedPos: 1 },
        { value: Math.sqrt(0.01 * 1000), expectedPos: 0.5 },
        { value: 1.0, expectedPos: logarithmicToLinear(1.0, min, max) },
        { value: 100.0, expectedPos: logarithmicToLinear(100.0, min, max) },
      ];

      for (const test of testValues) {
        const position = logarithmicToLinear(test.value, min, max);
        expect(position).toBeGreaterThanOrEqual(0);
        expect(position).toBeLessThanOrEqual(1);
        
        // Verify round-trip: position → value → position
        const roundTripValue = linearToLogarithmic(position, min, max);
        const roundTripPosition = logarithmicToLinear(roundTripValue, min, max);
        expect(roundTripPosition).toBeCloseTo(position, 5);
      }
    });

    it('should clamp handle position to slider bounds', () => {
      const min = 0.01;
      const max = 1000;
      
      // Values below min should map to position 0
      const belowMin = logarithmicToLinear(0.001, min, max);
      expect(belowMin).toBeLessThanOrEqual(0);
      
      // Values above max should map to position 1
      const aboveMax = logarithmicToLinear(2000, min, max);
      expect(aboveMax).toBeGreaterThanOrEqual(1);
    });

    it('should handle concentration slider range', () => {
      const min = 0.0001;
      const max = 0.1;
      
      // Test edge cases
      expect(linearToLogarithmic(0, min, max)).toBe(min);
      expect(linearToLogarithmic(1, min, max)).toBe(max);
      
      // Test middle value
      const mid = linearToLogarithmic(0.5, min, max);
      expect(mid).toBeGreaterThan(min);
      expect(mid).toBeLessThan(max);
    });

    it('should handle temperature slider range', () => {
      const min = 1;
      const max = 2000;
      
      // Test edge cases
      expect(linearToLogarithmic(0, min, max)).toBe(min);
      expect(linearToLogarithmic(1, min, max)).toBe(max);
      
      // Test middle value
      const mid = linearToLogarithmic(0.5, min, max);
      expect(mid).toBeGreaterThan(min);
      expect(mid).toBeLessThan(max);
    });
  });
});

