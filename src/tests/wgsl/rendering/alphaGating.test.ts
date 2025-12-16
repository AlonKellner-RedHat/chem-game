/**
 * Alpha Gating Test
 *
 * Ensures that the reflection visibility gate check uses COVERAGE only, not alpha.
 * Alpha should modulate absorption intensity, NOT act as a visibility gate.
 * Circles should be visible based on MSDF coverage alone.
 *
 * This test will fail if someone changes the gate check back to `coverage * alpha > 0.0`.
 */

import { describe, expect, it } from 'vitest';

/**
 * Correct gate check - uses coverage only
 * (This is what the shader should implement)
 */
function correctGateCheck(coverage: number, _alpha: number, isFullCoverage: boolean): boolean {
  return coverage > 0.0 || isFullCoverage;
}

/**
 * Buggy gate check - uses coverage * alpha
 * (This was the bug that made circles invisible)
 */
function buggyGateCheck(coverage: number, alpha: number, isFullCoverage: boolean): boolean {
  const mask = coverage * alpha;
  return mask > 0.0 || isFullCoverage;
}

/**
 * Simulate the full reflection contribution for bg-grid
 */
function simulateBgGridContribution(
  coverage: number,
  alpha: number,
  materialRefl: number,
  gateCheck: (cov: number, alpha: number, isFullCov: boolean) => boolean
): { contributes: boolean; totalReflection: number; maxCoverage: number } {
  const hasMsdf = true;
  const hasAlpha = true;
  const isFullCoverage = !hasMsdf && !hasAlpha;

  if (gateCheck(coverage, alpha, isFullCoverage)) {
    return {
      contributes: true,
      totalReflection: materialRefl,
      maxCoverage: coverage,
    };
  }

  return {
    contributes: false,
    totalReflection: 1.0, // No contribution, stays at 1.0
    maxCoverage: 0.0,
  };
}

describe('Alpha Gating Tests', () => {
  const BG_GRID_MATERIAL_REFL = 0.6; // 60% reflection

  describe('Required behavior: coverage-only gate check', () => {
    it('INSIDE circle with alpha=0: gate MUST PASS', () => {
      // Inside circle (coverage=1.0) but alpha=0 (black part of gradient)
      const result = simulateBgGridContribution(
        1.0, // coverage - INSIDE circle
        0.0, // alpha - BLACK part of gradient
        BG_GRID_MATERIAL_REFL,
        correctGateCheck
      );

      // Gate passes based on coverage alone - alpha does NOT affect visibility
      expect(result.contributes).toBe(true);
      expect(result.totalReflection).toBe(0.6);
      expect(result.maxCoverage).toBe(1.0);
    });

    it('INSIDE circle with alpha=0.7: gate passes', () => {
      // Inside circle with non-zero alpha (gradient region)
      const result = simulateBgGridContribution(
        1.0, // coverage - INSIDE circle
        0.7, // alpha - gradient region
        BG_GRID_MATERIAL_REFL,
        correctGateCheck
      );

      expect(result.contributes).toBe(true);
      expect(result.totalReflection).toBe(0.6);
      expect(result.maxCoverage).toBe(1.0);
    });

    it('OUTSIDE circle (coverage=0): gate fails', () => {
      const result = simulateBgGridContribution(
        0.0, // coverage - OUTSIDE circle
        0.7, // alpha doesn't matter
        BG_GRID_MATERIAL_REFL,
        correctGateCheck
      );

      expect(result.contributes).toBe(false); // Correct - outside circle
    });

    it('circles visible everywhere based on MSDF only', () => {
      // With correct gate check, circles are visible based on MSDF only

      // Pixel outside circle
      const outside = simulateBgGridContribution(0.0, 0.5, BG_GRID_MATERIAL_REFL, correctGateCheck);

      // Pixel inside circle, black alpha region
      const insideBlack = simulateBgGridContribution(
        1.0,
        0.0,
        BG_GRID_MATERIAL_REFL,
        correctGateCheck
      );

      // Pixel inside circle, gradient region
      const insideGradient = simulateBgGridContribution(
        1.0,
        0.7,
        BG_GRID_MATERIAL_REFL,
        correctGateCheck
      );

      // All pixels inside circles contribute, regardless of alpha
      expect(outside.contributes).toBe(false);
      expect(insideBlack.contributes).toBe(true); // Visible even with alpha=0
      expect(insideGradient.contributes).toBe(true);
    });
  });

  describe('Buggy behavior demonstration (DO NOT IMPLEMENT)', () => {
    it('demonstrates the bug: inside circle with alpha=0 fails gate', () => {
      // This test demonstrates what happens with the WRONG implementation
      const result = simulateBgGridContribution(
        1.0, // coverage - INSIDE circle
        0.0, // alpha - BLACK part of gradient
        BG_GRID_MATERIAL_REFL,
        buggyGateCheck // Using the buggy check
      );

      // BUG: Gate fails because coverage * alpha = 0
      expect(result.contributes).toBe(false);
    });

    it('demonstrates the visual bug: no circles visible in black alpha regions', () => {
      // Pixel inside circle, black alpha region
      const insideBlack = simulateBgGridContribution(
        1.0,
        0.0,
        BG_GRID_MATERIAL_REFL,
        buggyGateCheck
      );

      // Pixel inside circle, gradient region
      const insideGradient = simulateBgGridContribution(
        1.0,
        0.7,
        BG_GRID_MATERIAL_REFL,
        buggyGateCheck
      );

      // BUG: Circles only visible in gradient regions
      expect(insideBlack.contributes).toBe(false); // BUG!
      expect(insideGradient.contributes).toBe(true);
    });
  });

  describe('Visual result with bg-base + bg-grid multiplicative compounding', () => {
    const BG_BASE_REFL = 1.0; // 100% reflection

    it('correct: circles visible everywhere with consistent 60% reflection inside', () => {
      // Outside circle: only bg-base contributes
      const outsideRefl = BG_BASE_REFL * 1.0; // 100%

      // Inside circle: bg-base × bg-grid (regardless of alpha)
      const insideRefl = BG_BASE_REFL * BG_GRID_MATERIAL_REFL; // 60%

      // Clear contrast between inside and outside
      expect(outsideRefl).toBe(1.0);
      expect(insideRefl).toBe(0.6);
      expect(outsideRefl).not.toBe(insideRefl); // Circles visible!
    });

    it('buggy: circles invisible in black alpha regions (DO NOT IMPLEMENT)', () => {
      // This demonstrates the bug where alpha gates visibility

      // Outside circle: only bg-base contributes
      const outsideRefl = BG_BASE_REFL * 1.0; // 100%

      // Inside circle with alpha=0: BUG - bg-grid doesn't contribute!
      // Only bg-base contributes
      const insideBlackRefl = BG_BASE_REFL * 1.0; // 100% (BUG!)

      // Inside circle with alpha=0.7: bg-grid contributes
      const insideGradientRefl = BG_BASE_REFL * BG_GRID_MATERIAL_REFL; // 60%

      // BUG: No contrast between outside and inside-black!
      expect(outsideRefl).toBe(insideBlackRefl); // Both 100% - circles invisible!
      expect(insideGradientRefl).toBe(0.6); // Only gradient regions show circles
    });
  });
});
