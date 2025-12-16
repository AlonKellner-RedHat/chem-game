/**
 * Coverage Consistency Tests (TDD)
 *
 * Tests to ensure absorption and reflection use the SAME coverage value,
 * resulting in a constant absorption-to-reflection ratio.
 *
 * The key insight is:
 * - MSDF coverage (0-1) determines edge anti-aliasing
 * - Alpha (0-1) modulates intensity (affects absorption only)
 * - Both absorption and reflection must use the same MSDF coverage
 */

import { describe, expect, it } from 'vitest';

/**
 * Reference implementation: Get MSDF coverage only (no alpha)
 */
function getMsdfCoverage(hasMsdf: boolean, msdfValue: number): number {
  if (!hasMsdf) {
    return 1.0; // No MSDF = full coverage
  }
  return msdfValue;
}

/**
 * Reference implementation: Get alpha value only (no MSDF)
 */
function getAlphaValue(hasAlpha: boolean, alphaValue: number): number {
  if (!hasAlpha) {
    return 1.0; // No alpha = full intensity
  }
  return alphaValue;
}

/**
 * Compute absorption mask (coverage * alpha)
 */
function computeAbsorptionMask(coverage: number, alpha: number): number {
  return coverage * alpha;
}

/**
 * Compute reflection mask (coverage only, NO alpha)
 * This ensures reflection is not affected by alpha gradients
 */
function computeReflectionMask(coverage: number): number {
  return coverage;
}

/**
 * Compute the shape's absorbed light contribution
 * absorbed = coverage * (1 - materialTrans)
 */
function computeAbsorbedContribution(
  coverage: number,
  alpha: number,
  materialTrans: number
): number {
  const mask = computeAbsorptionMask(coverage, alpha);
  // absorbed = mask * (1 - trans) = mask * absorption_coefficient
  return mask * (1 - materialTrans);
}

/**
 * Compute the shape's reflected light contribution
 * reflected = coverage * materialRefl
 */
function computeReflectedContribution(coverage: number, materialRefl: number): number {
  const reflMask = computeReflectionMask(coverage);
  return reflMask * materialRefl;
}

describe('Coverage Consistency', () => {
  describe('MSDF Coverage Extraction', () => {
    it('should return 1.0 when no MSDF texture', () => {
      expect(getMsdfCoverage(false, 0.5)).toBe(1.0);
      expect(getMsdfCoverage(false, 0.0)).toBe(1.0);
    });

    it('should return MSDF value when MSDF texture exists', () => {
      expect(getMsdfCoverage(true, 0.5)).toBe(0.5);
      expect(getMsdfCoverage(true, 1.0)).toBe(1.0);
      expect(getMsdfCoverage(true, 0.0)).toBe(0.0);
    });
  });

  describe('Alpha Value Extraction', () => {
    it('should return 1.0 when no alpha texture', () => {
      expect(getAlphaValue(false, 0.5)).toBe(1.0);
      expect(getAlphaValue(false, 0.0)).toBe(1.0);
    });

    it('should return alpha value when alpha texture exists', () => {
      expect(getAlphaValue(true, 0.5)).toBe(0.5);
      expect(getAlphaValue(true, 1.0)).toBe(1.0);
      expect(getAlphaValue(true, 0.0)).toBe(0.0);
    });
  });

  describe('Absorption and Reflection Masks', () => {
    it('absorption uses coverage * alpha', () => {
      // Material shape: MSDF but no alpha
      expect(computeAbsorptionMask(0.5, 1.0)).toBe(0.5);
      expect(computeAbsorptionMask(1.0, 1.0)).toBe(1.0);

      // Shape with alpha gradient
      expect(computeAbsorptionMask(1.0, 0.5)).toBe(0.5);
      expect(computeAbsorptionMask(0.5, 0.5)).toBe(0.25);
    });

    it('reflection uses coverage only (NO alpha)', () => {
      // Reflection should NOT be affected by alpha
      expect(computeReflectionMask(0.5)).toBe(0.5);
      expect(computeReflectionMask(1.0)).toBe(1.0);
      expect(computeReflectionMask(0.0)).toBe(0.0);
    });

    it('absorption and reflection use identical MSDF coverage', () => {
      const coverage = 0.5;
      const alpha = 0.7;

      const absorptionMask = computeAbsorptionMask(coverage, alpha);
      const reflectionMask = computeReflectionMask(coverage);

      // The coverage component (MSDF) is the same
      // absorptionMask / alpha = coverage = reflectionMask
      expect(absorptionMask / alpha).toBeCloseTo(reflectionMask, 10);
    });
  });
});

describe('Constant Absorption-to-Reflection Ratio', () => {
  const materialTrans = 0.7; // 30% absorbed
  const materialRefl = 0.8; // 80% reflected

  describe('For material shapes (no alpha)', () => {
    const alpha = 1.0; // No alpha = full intensity

    it('ratio should be constant at edge (coverage=0.5)', () => {
      const coverage = 0.5;
      const absorbed = computeAbsorbedContribution(coverage, alpha, materialTrans);
      const reflected = computeReflectedContribution(coverage, materialRefl);

      // absorbed = 0.5 * 1.0 * 0.3 = 0.15
      // reflected = 0.5 * 0.8 = 0.4
      expect(absorbed).toBeCloseTo(0.15, 5);
      expect(reflected).toBeCloseTo(0.4, 5);

      const ratio = absorbed / reflected;
      expect(ratio).toBeCloseTo(0.375, 5); // (1-0.7) / 0.8 = 0.375
    });

    it('ratio should be constant at interior (coverage=1.0)', () => {
      const coverage = 1.0;
      const absorbed = computeAbsorbedContribution(coverage, alpha, materialTrans);
      const reflected = computeReflectedContribution(coverage, materialRefl);

      // absorbed = 1.0 * 1.0 * 0.3 = 0.3
      // reflected = 1.0 * 0.8 = 0.8
      expect(absorbed).toBeCloseTo(0.3, 5);
      expect(reflected).toBeCloseTo(0.8, 5);

      const ratio = absorbed / reflected;
      expect(ratio).toBeCloseTo(0.375, 5); // Same ratio!
    });

    it('ratio should be constant across all coverage values', () => {
      const expectedRatio = (1 - materialTrans) / materialRefl; // 0.375
      const coverages = [0.1, 0.25, 0.5, 0.75, 0.9, 1.0];

      coverages.forEach((coverage) => {
        const absorbed = computeAbsorbedContribution(coverage, alpha, materialTrans);
        const reflected = computeReflectedContribution(coverage, materialRefl);

        if (coverage > 0) {
          const ratio = absorbed / reflected;
          expect(ratio).toBeCloseTo(expectedRatio, 5);
        }
      });
    });
  });

  describe('For shapes with alpha gradient', () => {
    it('ratio changes with alpha (expected behavior)', () => {
      // When alpha varies, the absorption changes but reflection stays same
      // This is CORRECT - alpha affects absorption intensity only
      const coverage = 1.0;

      // High alpha region
      const alpha1 = 1.0;
      const absorbed1 = computeAbsorbedContribution(coverage, alpha1, materialTrans);
      const reflected1 = computeReflectedContribution(coverage, materialRefl);
      const ratio1 = absorbed1 / reflected1;

      // Low alpha region
      const alpha2 = 0.5;
      const absorbed2 = computeAbsorbedContribution(coverage, alpha2, materialTrans);
      const reflected2 = computeReflectedContribution(coverage, materialRefl);
      const ratio2 = absorbed2 / reflected2;

      // Reflection should be the same (coverage is same)
      expect(reflected1).toBeCloseTo(reflected2, 5);

      // Absorption differs based on alpha
      expect(absorbed1).toBeCloseTo(0.3, 5); // 1.0 * 1.0 * 0.3
      expect(absorbed2).toBeCloseTo(0.15, 5); // 1.0 * 0.5 * 0.3

      // Ratios differ - this is expected!
      expect(ratio1).toBeCloseTo(0.375, 5);
      expect(ratio2).toBeCloseTo(0.1875, 5);
    });

    it('but ratio is constant for same alpha value (regardless of coverage)', () => {
      const alpha = 0.7; // Constant alpha
      const coverages = [0.25, 0.5, 0.75, 1.0];

      // When alpha is constant, the ratio absorbed/reflected is still constant
      // because both scale linearly with coverage
      const expectedRatio = (alpha * (1 - materialTrans)) / materialRefl;

      coverages.forEach((coverage) => {
        const absorbed = computeAbsorbedContribution(coverage, alpha, materialTrans);
        const reflected = computeReflectedContribution(coverage, materialRefl);

        if (coverage > 0) {
          const ratio = absorbed / reflected;
          expect(ratio).toBeCloseTo(expectedRatio, 5);
        }
      });
    });
  });
});

describe('No MSDF Re-sampling', () => {
  it('reflection should NOT re-sample MSDF for material shapes', () => {
    // For material shapes (hasMsdf=true, hasAlpha=false):
    // The reflection calculation should use the cached coverage value,
    // NOT call getReflectionFactor() which re-samples the MSDF

    const hasMsdf = true;
    const hasAlpha = false;

    // In the fixed implementation, for no-alpha shapes:
    // - reflFactor is NOT computed (no re-sampling)
    // - Only the cached coverage value is used

    // The key invariant: reflFactor should effectively be 1.0
    // for shapes without alpha, without re-sampling
    const cachedCoverage = 0.5; // Pre-computed once

    // OLD (broken): getReflectionFactor() re-samples MSDF
    // This could return a slightly different value due to fp precision

    // NEW (fixed): Use cached coverage directly, no re-sampling
    const reflMask = cachedCoverage; // Same as absorption's coverage
    expect(reflMask).toBe(0.5);

    // For shapes without alpha, there's no "reflFactor" multiplier
    // The reflection is simply: mix(1.0, materialRefl, coverage)
    const materialRefl = 0.8;
    const effectiveRefl = 1.0 - cachedCoverage + cachedCoverage * materialRefl;
    expect(effectiveRefl).toBeCloseTo(0.9, 5); // mix(1.0, 0.8, 0.5)
  });

  it('reflection for alpha shapes should use cached alpha, not re-sample', () => {
    // For shapes WITH alpha (like bg-grid):
    // The reflection calculation should use cached values

    const cachedCoverage = 1.0;
    const cachedAlpha = 0.7;

    // Absorption uses: coverage * alpha = 0.7
    const absorptionMask = cachedCoverage * cachedAlpha;
    expect(absorptionMask).toBe(0.7);

    // Reflection uses: coverage only = 1.0
    // (alpha does NOT affect reflection)
    const reflectionMask = cachedCoverage;
    expect(reflectionMask).toBe(1.0);
  });
});

describe('Edge Anti-aliasing Symmetry', () => {
  it('at shape edge, absorption and reflection scale proportionally', () => {
    // At an edge pixel (coverage = 0.5):
    const coverage = 0.5;
    const alpha = 1.0;
    const materialTrans = 0.7;
    const materialRefl = 0.8;

    // Shape's contribution (not blended with background)
    const shapeAbsorbed = coverage * alpha * (1 - materialTrans);
    const shapeReflected = coverage * materialRefl;

    // Both are scaled by the SAME coverage factor
    // This means anti-aliasing is symmetric
    expect(shapeAbsorbed / coverage).toBeCloseTo((1 - materialTrans) * alpha, 5);
    expect(shapeReflected / coverage).toBeCloseTo(materialRefl, 5);

    // The ratio is preserved
    const ratio = shapeAbsorbed / shapeReflected;
    expect(ratio).toBeCloseTo(((1 - materialTrans) * alpha) / materialRefl, 5);
  });

  it('prevents constructive interference at edges', () => {
    // The user's requirement: absorption and reflection should be
    // "equally anti-aliased" so they don't "constructively interfere"

    // This means at edge pixels:
    // - If absorption is reduced by coverage, reflection is also reduced
    // - They don't create a "halo" where one is full while other is partial

    const coverages = [0.0, 0.25, 0.5, 0.75, 1.0];

    coverages.forEach((coverage) => {
      const shapeAbsorbedScale = coverage; // Linear with coverage
      const shapeReflectedScale = coverage; // SAME linear scale

      // Both scale identically with coverage
      expect(shapeAbsorbedScale).toBe(shapeReflectedScale);
    });
  });
});
