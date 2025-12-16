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

describe('Mask Gating for Ambient Contribution', () => {
  /**
   * Reference implementation: determines if a shape should contribute to ambient
   * Shapes only contribute when:
   * 1. The pixel is inside the shape (mask > 0), OR
   * 2. The shape has no mask (full-coverage shape like bg-base)
   */
  function shouldContribute(mask: number, hasMsdf: boolean, hasAlpha: boolean): boolean {
    const isFullCoverageShape = !hasMsdf && !hasAlpha;
    return mask > 0 || isFullCoverageShape;
  }

  /**
   * Get mask value (coverage) for a shape at a pixel
   * This is what getShapeMask() returns in WGSL
   */
  function getMask(
    msdfCoverage: number,
    alpha: number,
    hasMsdf: boolean,
    hasAlpha: boolean
  ): number {
    // No textures = full coverage
    if (!hasMsdf && !hasAlpha) {
      return 1.0;
    }
    const effectiveMsdf = hasMsdf ? msdfCoverage : 1.0;
    const effectiveAlpha = hasAlpha ? alpha : 1.0;
    return effectiveMsdf * effectiveAlpha;
  }

  /**
   * Compound reflections with mask gating
   * Only shapes that "shouldContribute" are included in the multiplication
   */
  function compoundWithGating(
    shapes: Array<{
      mask: number;
      reflFactor: number;
      materialRefl: number;
      hasMsdf: boolean;
      hasAlpha: boolean;
    }>
  ): number {
    let totalReflection = 1.0;
    for (const shape of shapes) {
      if (shouldContribute(shape.mask, shape.hasMsdf, shape.hasAlpha)) {
        totalReflection *= shape.reflFactor * shape.materialRefl;
      }
    }
    return totalReflection;
  }

  describe('Full-coverage shapes (no mask)', () => {
    it('bg-base always contributes regardless of mask value', () => {
      // bg-base: no MSDF, no alpha → full-coverage shape
      const bgBase = {
        mask: 1.0,
        reflFactor: 1.0,
        materialRefl: 1.0,
        hasMsdf: false,
        hasAlpha: false,
      };
      expect(shouldContribute(bgBase.mask, bgBase.hasMsdf, bgBase.hasAlpha)).toBe(true);
    });
  });

  describe('Material shapes (MSDF, no alpha)', () => {
    it('should NOT contribute when outside shape (mask = 0)', () => {
      // Golden circle: MSDF but no alpha, outside the shape
      const goldenCircle = {
        mask: 0.0, // Outside shape
        reflFactor: 1.0, // getReflectionFactor returns 1.0
        materialRefl: 0.8, // Gold reflection
        hasMsdf: true,
        hasAlpha: false,
      };
      expect(shouldContribute(goldenCircle.mask, goldenCircle.hasMsdf, goldenCircle.hasAlpha)).toBe(
        false
      );
    });

    it('should contribute when inside shape (mask > 0)', () => {
      // Golden circle: MSDF but no alpha, inside the shape
      const goldenCircle = {
        mask: 1.0, // Inside shape
        reflFactor: 1.0,
        materialRefl: 0.8,
        hasMsdf: true,
        hasAlpha: false,
      };
      expect(shouldContribute(goldenCircle.mask, goldenCircle.hasMsdf, goldenCircle.hasAlpha)).toBe(
        true
      );
    });

    it('material shapes outside their bounds should not affect total reflection', () => {
      // Scenario: bg-base + golden circle (pixel outside golden circle)
      const shapes = [
        {
          mask: 1.0,
          reflFactor: 1.0,
          materialRefl: 1.0, // 100% reflection
          hasMsdf: false,
          hasAlpha: false,
        },
        {
          mask: 0.0, // Outside golden circle
          reflFactor: 1.0,
          materialRefl: 0.5, // 50% reflection (should NOT affect result)
          hasMsdf: true,
          hasAlpha: false,
        },
      ];
      // Only bg-base contributes, golden circle is gated out
      expect(compoundWithGating(shapes)).toBe(1.0);
    });

    it('material shapes inside their bounds should affect total reflection', () => {
      // Scenario: bg-base + golden circle (pixel inside golden circle)
      const shapes = [
        {
          mask: 1.0,
          reflFactor: 1.0,
          materialRefl: 1.0,
          hasMsdf: false,
          hasAlpha: false,
        },
        {
          mask: 1.0, // Inside golden circle
          reflFactor: 1.0,
          materialRefl: 0.5, // 50% reflection
          hasMsdf: true,
          hasAlpha: false,
        },
      ];
      // Both contribute: 1.0 * 1.0 * 1.0 * 0.5 = 0.5
      expect(compoundWithGating(shapes)).toBe(0.5);
    });
  });

  describe('Background grid (MSDF + alpha)', () => {
    it('should NOT contribute outside circles (mask = 0)', () => {
      const bgGrid = {
        mask: 0.0, // Outside circles (msdf=0)
        reflFactor: 1.0, // Full reflection outside
        materialRefl: 0.6,
        hasMsdf: true,
        hasAlpha: true,
      };
      expect(shouldContribute(bgGrid.mask, bgGrid.hasMsdf, bgGrid.hasAlpha)).toBe(false);
    });

    it('should contribute inside circles (mask > 0)', () => {
      const bgGrid = {
        mask: 0.5, // Inside circle with alpha=0.5
        reflFactor: 0.5, // 1 - alpha = 0.5
        materialRefl: 0.6,
        hasMsdf: true,
        hasAlpha: true,
      };
      expect(shouldContribute(bgGrid.mask, bgGrid.hasMsdf, bgGrid.hasAlpha)).toBe(true);
    });
  });

  describe('Full layer scenario', () => {
    it('outside circles: only bg-base contributes', () => {
      // Layer 0: bg-base + bg-grid, pixel outside circles
      const shapes = [
        {
          mask: 1.0,
          reflFactor: 1.0,
          materialRefl: 1.0,
          hasMsdf: false,
          hasAlpha: false,
        },
        {
          mask: 0.0, // Outside circles
          reflFactor: 1.0,
          materialRefl: 0.6,
          hasMsdf: true,
          hasAlpha: true,
        },
      ];
      // Only bg-base contributes: 1.0 * 1.0 = 1.0
      expect(compoundWithGating(shapes)).toBe(1.0);
    });

    it('inside circles: both bg-base and bg-grid contribute', () => {
      // Layer 0: bg-base + bg-grid, pixel inside circle with alpha=0.3
      const shapes = [
        {
          mask: 1.0,
          reflFactor: 1.0,
          materialRefl: 1.0,
          hasMsdf: false,
          hasAlpha: false,
        },
        {
          mask: 0.7, // Inside circle, msdf=1 * alpha=0.7
          reflFactor: 0.3, // 1 - alpha = 1 - 0.7 = 0.3
          materialRefl: 0.6,
          hasMsdf: true,
          hasAlpha: true,
        },
      ];
      // Both contribute: 1.0 * 1.0 * 0.3 * 0.6 = 0.18
      expect(compoundWithGating(shapes)).toBeCloseTo(0.18, 5);
    });
  });
});
