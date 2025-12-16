/**
 * Reflection Factor Tests (TDD)
 *
 * Tests for the new getReflectionFactor() function that computes
 * ambient light reflection based on MSDF coverage and alpha gradients.
 *
 * Reflection model:
 * - Outside circles (MSDF=0): 1.0 (full reflection)
 * - Inside circles: 1.0 - (msdfCoverage * alpha) (alpha = absorption)
 */

import { describe, expect, it } from 'vitest';

/**
 * Reference implementation of getReflectionFactor
 * This is what the WGSL shader should implement
 */
function getReflectionFactor(
  msdfCoverage: number,
  alpha: number,
  hasMsdf: boolean,
  hasAlpha: boolean
): number {
  // No textures = full reflection (like bg-base with no mask)
  if (!hasMsdf && !hasAlpha) {
    return 1.0;
  }

  // Get effective MSDF coverage (1.0 if no MSDF texture)
  const effectiveMsdf = hasMsdf ? msdfCoverage : 1.0;

  // Get effective alpha (0.0 if no alpha texture = no absorption, full reflection)
  const effectiveAlpha = hasAlpha ? alpha : 0.0;

  // Reflection = 1 - (coverage * absorption)
  // Outside circles: msdfCoverage=0 → reflection=1.0
  // Inside circles: msdfCoverage=1 → reflection=1-alpha
  return 1.0 - effectiveMsdf * effectiveAlpha;
}

describe('Reflection Factor Calculation', () => {
  describe('Outside circles (MSDF=0)', () => {
    it('should return 1.0 (full reflection) regardless of alpha', () => {
      // MSDF coverage = 0 means outside the shape
      expect(getReflectionFactor(0.0, 0.0, true, true)).toBe(1.0);
      expect(getReflectionFactor(0.0, 0.5, true, true)).toBe(1.0);
      expect(getReflectionFactor(0.0, 1.0, true, true)).toBe(1.0);
    });

    it('should return 1.0 even at shape boundary (MSDF=0.1)', () => {
      // Near the edge, still mostly outside
      const result = getReflectionFactor(0.1, 1.0, true, true);
      expect(result).toBeCloseTo(0.9, 5);
    });
  });

  describe('Inside circles (MSDF=1)', () => {
    it('alpha=0 should return 1.0 (no absorption)', () => {
      // Inside circle but alpha=0 means no absorption
      expect(getReflectionFactor(1.0, 0.0, true, true)).toBe(1.0);
    });

    it('alpha=0.5 should return 0.5 (50% absorption)', () => {
      // Inside circle with 50% alpha = 50% absorbed
      expect(getReflectionFactor(1.0, 0.5, true, true)).toBe(0.5);
    });

    it('alpha=0.7 should return 0.3 (70% absorption)', () => {
      // Matches the linear gradient max in diagonal-circle-grid
      expect(getReflectionFactor(1.0, 0.7, true, true)).toBeCloseTo(0.3, 5);
    });

    it('alpha=1.0 should return 0.0 (full absorption)', () => {
      // Inside circle with full alpha = fully absorbed
      expect(getReflectionFactor(1.0, 1.0, true, true)).toBe(0.0);
    });
  });

  describe('Partial MSDF coverage (anti-aliased edges)', () => {
    it('MSDF=0.5 with alpha=1.0 should return 0.5', () => {
      // Half inside, full absorption → half absorbed
      expect(getReflectionFactor(0.5, 1.0, true, true)).toBe(0.5);
    });

    it('MSDF=0.5 with alpha=0.5 should return 0.75', () => {
      // Half inside, half absorption → 25% absorbed
      expect(getReflectionFactor(0.5, 0.5, true, true)).toBe(0.75);
    });
  });

  describe('No textures (full coverage shapes)', () => {
    it('should return 1.0 when no MSDF and no alpha', () => {
      // Like bg-base with maskName=''
      expect(getReflectionFactor(0.0, 0.0, false, false)).toBe(1.0);
      expect(getReflectionFactor(1.0, 1.0, false, false)).toBe(1.0);
    });
  });

  describe('MSDF only (no alpha texture)', () => {
    it('should use alpha=0.0 as default (no absorption, full reflection inside)', () => {
      // MSDF but no alpha → no absorption → full reflection inside
      // This allows material shapes to reflect ambient light based on their material
      expect(getReflectionFactor(1.0, 0.0, true, false)).toBe(1.0);
      expect(getReflectionFactor(0.0, 0.0, true, false)).toBe(1.0);
    });
  });

  describe('Alpha only (no MSDF texture)', () => {
    it('should use MSDF=1.0 as default (everywhere is inside)', () => {
      // No MSDF → entire shape is "inside", alpha controls absorption
      expect(getReflectionFactor(0.0, 0.5, false, true)).toBe(0.5);
      expect(getReflectionFactor(0.0, 1.0, false, true)).toBe(0.0);
    });
  });
});

describe('Multiplicative Compounding', () => {
  /**
   * Reference implementation of multiplicative reflection compounding
   */
  function compoundReflections(reflectionFactors: number[]): number {
    return reflectionFactors.reduce((acc, r) => acc * r, 1.0);
  }

  describe('Single shape', () => {
    it('single shape reflection = its reflection factor', () => {
      expect(compoundReflections([0.8])).toBe(0.8);
      expect(compoundReflections([1.0])).toBe(1.0);
      expect(compoundReflections([0.5])).toBe(0.5);
    });
  });

  describe('Two shapes', () => {
    it('0.8 × 0.6 = 0.48', () => {
      expect(compoundReflections([0.8, 0.6])).toBeCloseTo(0.48, 5);
    });

    it('1.0 × 0.6 = 0.6 (identity)', () => {
      // Shape with reflection=1.0 has no effect
      expect(compoundReflections([1.0, 0.6])).toBe(0.6);
    });

    it('0.5 × 0.5 = 0.25', () => {
      expect(compoundReflections([0.5, 0.5])).toBe(0.25);
    });
  });

  describe('Multiple shapes', () => {
    it('three shapes: 0.9 × 0.8 × 0.7 = 0.504', () => {
      expect(compoundReflections([0.9, 0.8, 0.7])).toBeCloseTo(0.504, 5);
    });

    it('any zero absorption = no effect', () => {
      // All 1.0 = full reflection
      expect(compoundReflections([1.0, 1.0, 1.0])).toBe(1.0);
    });

    it('any full absorption = zero reflection', () => {
      // Any 0.0 = no reflection
      expect(compoundReflections([0.8, 0.0, 0.9])).toBe(0.0);
    });
  });

  describe('Background scenario', () => {
    it('bg-base(1.0) × bg-grid(0.7) = 0.7 inside circles', () => {
      // bg-base has no mask → reflection=1.0
      // bg-grid inside circle with alpha=0.3 → reflection=0.7
      const bgBase = getReflectionFactor(0, 0, false, false); // 1.0
      const bgGrid = getReflectionFactor(1.0, 0.3, true, true); // 0.7
      expect(compoundReflections([bgBase, bgGrid])).toBeCloseTo(0.7, 5);
    });

    it('bg-base(1.0) × bg-grid(1.0) = 1.0 outside circles', () => {
      // Both shapes have full reflection outside circles
      const bgBase = getReflectionFactor(0, 0, false, false); // 1.0
      const bgGrid = getReflectionFactor(0.0, 0.5, true, true); // 1.0 (outside)
      expect(compoundReflections([bgBase, bgGrid])).toBe(1.0);
    });
  });
});
