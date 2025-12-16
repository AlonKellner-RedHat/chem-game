/**
 * Background Circle-Grid Visibility Test
 *
 * This test reproduces the EXACT background scenario to verify that:
 * 1. The circle-grid pattern is visible
 * 2. The bounding box check doesn't incorrectly filter out shapes
 * 3. The early-exit doesn't skip ambient light for background
 * 4. Multiplicative compounding works correctly
 *
 * Background setup:
 * - Layer 0: bg-base (no MSDF, no alpha) + bg-grid (MSDF + alpha)
 * - bg-base provides 100% reflection everywhere
 * - bg-grid provides 60% reflection inside circles, nothing outside
 * - Result: 100% outside circles, 60% inside circles
 */

import { describe, expect, it } from 'vitest';

// =============================================================================
// Shape Simulation Types
// =============================================================================

interface SimulatedShape {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layer: number;
  hasMsdf: boolean;
  hasAlpha: boolean;
  materialReflection: number; // 0-1 reflection factor
  // For MSDF shapes, this function returns coverage at (x,y)
  msdfCoverage?: (x: number, y: number) => number;
  // For alpha shapes, this function returns alpha at (x,y)
  alphaValue?: (x: number, y: number) => number;
}

// =============================================================================
// Shader Function Simulations
// =============================================================================

/**
 * Simulates getMsdfCoverage from msdf.wesl
 */
function getMsdfCoverage(shape: SimulatedShape, x: number, y: number): number {
  // Check if within bounding box (EXACT shader logic)
  if (x < shape.x || x >= shape.x + shape.width || y < shape.y || y >= shape.y + shape.height) {
    return 0.0;
  }

  // No MSDF = full coverage
  if (!shape.hasMsdf) {
    return 1.0;
  }

  // Call the MSDF coverage function if provided
  if (shape.msdfCoverage) {
    return shape.msdfCoverage(x, y);
  }

  return 1.0; // Default: full coverage
}

/**
 * Simulates getAlphaValue from msdf.wesl
 */
function getAlphaValue(shape: SimulatedShape, x: number, y: number): number {
  // Check if within bounding box
  if (x < shape.x || x >= shape.x + shape.width || y < shape.y || y >= shape.y + shape.height) {
    return 0.0;
  }

  // No alpha = full intensity
  if (!shape.hasAlpha) {
    return 1.0;
  }

  // Call the alpha function if provided
  if (shape.alphaValue) {
    return shape.alphaValue(x, y);
  }

  return 1.0; // Default: full intensity
}

// =============================================================================
// Pre-computation Simulation (mirrors shader's pre-computation step)
// =============================================================================

interface PrecomputedData {
  shapeCoverages: number[];
  shapeAlphas: number[];
  maxMask: number;
}

function precomputeCoverageAndAlpha(
  shapes: SimulatedShape[],
  x: number,
  y: number
): PrecomputedData {
  const shapeCoverages: number[] = [];
  const shapeAlphas: number[] = [];
  let maxMask = 0.0;

  for (const shape of shapes) {
    const coverage = getMsdfCoverage(shape, x, y);
    const alpha = getAlphaValue(shape, x, y);
    shapeCoverages.push(coverage);
    shapeAlphas.push(alpha);
    maxMask = Math.max(maxMask, coverage * alpha);
  }

  return { shapeCoverages, shapeAlphas, maxMask };
}

// =============================================================================
// Ambient Reflection Simulation (mirrors shader's ambient loop)
// =============================================================================

interface AmbientResult {
  earlyExitTriggered: boolean;
  totalReflection: number;
  maxCoverage: number;
  anyShapeOnLayer: boolean;
  contributingShapes: string[];
}

function computeAmbientReflection(
  shapes: SimulatedShape[],
  precomputed: PrecomputedData,
  currentLayer: number
): AmbientResult {
  // Early-exit check (EXACT shader logic)
  if (precomputed.maxMask === 0.0) {
    return {
      earlyExitTriggered: true,
      totalReflection: 0.0,
      maxCoverage: 0.0,
      anyShapeOnLayer: false,
      contributingShapes: [],
    };
  }

  let totalReflection = 1.0;
  let maxCoverage = 0.0;
  let anyShapeOnLayer = false;
  const contributingShapes: string[] = [];

  for (let i = 0; i < shapes.length; i++) {
    const shape = shapes[i];

    // Layer check (EXACT shader logic)
    if (shape.layer === currentLayer) {
      const coverage = precomputed.shapeCoverages[i];
      const isFullCoverage = !shape.hasMsdf && !shape.hasAlpha;

      // Gate check uses COVERAGE only, not alpha (fixed logic)
      if (coverage > 0.0 || isFullCoverage) {
        anyShapeOnLayer = true;
        contributingShapes.push(shape.id);

        // Compound material reflections
        totalReflection *= shape.materialReflection;

        // Track max coverage
        const effectiveCoverage = isFullCoverage ? 1.0 : coverage;
        maxCoverage = Math.max(maxCoverage, effectiveCoverage);
      }
    }
  }

  return {
    earlyExitTriggered: false,
    totalReflection,
    maxCoverage,
    anyShapeOnLayer,
    contributingShapes,
  };
}

// =============================================================================
// Circle Grid Pattern Simulation
// =============================================================================

/**
 * Simulates a diagonal circle grid pattern.
 * Returns 1.0 inside circles, 0.0 outside.
 */
function diagonalCircleGridCoverage(x: number, y: number, gridSize: number = 80): number {
  // Calculate which grid cell we're in
  const cellX = Math.floor(x / gridSize);
  const cellY = Math.floor(y / gridSize);

  // Diagonal offset: odd rows are shifted by half a cell
  const offsetX = cellY % 2 === 1 ? gridSize / 2 : 0;

  // Center of the nearest circle
  const circleX = cellX * gridSize + gridSize / 2 + offsetX;
  const circleY = cellY * gridSize + gridSize / 2;

  // Distance from circle center
  const dx = x - circleX;
  const dy = y - circleY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Circle radius (slightly smaller than half the grid size)
  const radius = gridSize * 0.4;

  // Inside circle = 1.0, outside = 0.0
  // Add anti-aliasing at edge
  if (dist < radius - 0.5) return 1.0;
  if (dist > radius + 0.5) return 0.0;
  return 1.0 - (dist - (radius - 0.5)); // Anti-aliased edge
}

// =============================================================================
// Test Suite
// =============================================================================

describe('Background Circle-Grid Visibility Test', () => {
  const SCREEN_WIDTH = 1280;
  const SCREEN_HEIGHT = 720;
  const BG_BASE_REFL = 1.0; // 100% reflection
  const BG_GRID_REFL = 0.6; // 60% reflection

  describe('Bounding Box Check', () => {
    it('returns 0.0 coverage when shape has width=0', () => {
      const shape: SimulatedShape = {
        id: 'bg-base',
        x: 0,
        y: 0,
        width: 0, // BUG: width not set!
        height: SCREEN_HEIGHT,
        layer: 0,
        hasMsdf: false,
        hasAlpha: false,
        materialReflection: BG_BASE_REFL,
      };

      // Test at various pixel positions
      expect(getMsdfCoverage(shape, 0, 0)).toBe(0.0); // x >= 0 + 0 = true, returns 0
      expect(getMsdfCoverage(shape, 100, 100)).toBe(0.0);
      expect(getMsdfCoverage(shape, 640, 360)).toBe(0.0);
    });

    it('returns 0.0 coverage when shape has height=0', () => {
      const shape: SimulatedShape = {
        id: 'bg-base',
        x: 0,
        y: 0,
        width: SCREEN_WIDTH,
        height: 0, // BUG: height not set!
        layer: 0,
        hasMsdf: false,
        hasAlpha: false,
        materialReflection: BG_BASE_REFL,
      };

      expect(getMsdfCoverage(shape, 100, 100)).toBe(0.0);
      expect(getMsdfCoverage(shape, 640, 360)).toBe(0.0);
    });

    it('returns 1.0 coverage for full-coverage shape with correct dimensions', () => {
      const shape: SimulatedShape = {
        id: 'bg-base',
        x: 0,
        y: 0,
        width: SCREEN_WIDTH,
        height: SCREEN_HEIGHT,
        layer: 0,
        hasMsdf: false,
        hasAlpha: false,
        materialReflection: BG_BASE_REFL,
      };

      // All positions within bounds should return 1.0
      expect(getMsdfCoverage(shape, 0, 0)).toBe(1.0);
      expect(getMsdfCoverage(shape, 100, 100)).toBe(1.0);
      expect(getMsdfCoverage(shape, 640, 360)).toBe(1.0);
      expect(getMsdfCoverage(shape, SCREEN_WIDTH - 1, SCREEN_HEIGHT - 1)).toBe(1.0);

      // Position at exact boundary should return 0.0
      expect(getMsdfCoverage(shape, SCREEN_WIDTH, SCREEN_HEIGHT)).toBe(0.0);
    });

    it('returns correct MSDF coverage for circle-grid pattern', () => {
      const shape: SimulatedShape = {
        id: 'bg-grid',
        x: 0,
        y: 0,
        width: SCREEN_WIDTH,
        height: SCREEN_HEIGHT,
        layer: 0,
        hasMsdf: true,
        hasAlpha: true,
        materialReflection: BG_GRID_REFL,
        msdfCoverage: (x, y) => diagonalCircleGridCoverage(x, y),
        alphaValue: () => 1.0, // Ignore alpha for this test
      };

      // Center of first circle (at gridSize/2, gridSize/2) should be 1.0
      const coverage1 = getMsdfCoverage(shape, 40, 40);
      expect(coverage1).toBe(1.0);

      // Outside circles should be 0.0
      const coverage2 = getMsdfCoverage(shape, 0, 0);
      expect(coverage2).toBe(0.0);
    });
  });

  describe('Early-Exit Check', () => {
    it('triggers early-exit when all shapes have zero coverage (zero dimensions bug)', () => {
      const shapes: SimulatedShape[] = [
        {
          id: 'bg-base',
          x: 0,
          y: 0,
          width: 0, // BUG
          height: 0, // BUG
          layer: 0,
          hasMsdf: false,
          hasAlpha: false,
          materialReflection: BG_BASE_REFL,
        },
        {
          id: 'bg-grid',
          x: 0,
          y: 0,
          width: 0, // BUG
          height: 0, // BUG
          layer: 0,
          hasMsdf: true,
          hasAlpha: true,
          materialReflection: BG_GRID_REFL,
        },
      ];

      const precomputed = precomputeCoverageAndAlpha(shapes, 640, 360);
      expect(precomputed.maxMask).toBe(0.0);

      const result = computeAmbientReflection(shapes, precomputed, 0);
      expect(result.earlyExitTriggered).toBe(true);
      // No ambient light would be added - circles invisible!
    });

    it('does NOT trigger early-exit when bg-base has correct dimensions', () => {
      const shapes: SimulatedShape[] = [
        {
          id: 'bg-base',
          x: 0,
          y: 0,
          width: SCREEN_WIDTH,
          height: SCREEN_HEIGHT,
          layer: 0,
          hasMsdf: false,
          hasAlpha: false,
          materialReflection: BG_BASE_REFL,
        },
        {
          id: 'bg-grid',
          x: 0,
          y: 0,
          width: SCREEN_WIDTH,
          height: SCREEN_HEIGHT,
          layer: 0,
          hasMsdf: true,
          hasAlpha: true,
          materialReflection: BG_GRID_REFL,
          msdfCoverage: (x, y) => diagonalCircleGridCoverage(x, y),
          alphaValue: () => 0.5,
        },
      ];

      // Test at center of screen (might be outside circles)
      const precomputed = precomputeCoverageAndAlpha(shapes, 640, 360);

      // bg-base has coverage=1.0, alpha=1.0, so maxMask should be >= 1.0
      expect(precomputed.maxMask).toBeGreaterThan(0.0);
      expect(precomputed.shapeCoverages[0]).toBe(1.0); // bg-base

      const result = computeAmbientReflection(shapes, precomputed, 0);
      expect(result.earlyExitTriggered).toBe(false);
    });
  });

  describe('Full Ambient Reflection Flow', () => {
    const createBackgroundShapes = (): SimulatedShape[] => [
      {
        id: 'bg-base',
        x: 0,
        y: 0,
        width: SCREEN_WIDTH,
        height: SCREEN_HEIGHT,
        layer: 0,
        hasMsdf: false,
        hasAlpha: false,
        materialReflection: BG_BASE_REFL,
      },
      {
        id: 'bg-grid',
        x: 0,
        y: 0,
        width: SCREEN_WIDTH,
        height: SCREEN_HEIGHT,
        layer: 0,
        hasMsdf: true,
        hasAlpha: true,
        materialReflection: BG_GRID_REFL,
        msdfCoverage: (x, y) => diagonalCircleGridCoverage(x, y),
        alphaValue: () => 1.0, // Full alpha for clear visibility
      },
    ];

    it('computes 100% reflection OUTSIDE circles', () => {
      const shapes = createBackgroundShapes();

      // Position outside circles (corner of grid cell)
      const x = 0;
      const y = 0;

      // Verify we're outside a circle
      expect(diagonalCircleGridCoverage(x, y)).toBe(0.0);

      const precomputed = precomputeCoverageAndAlpha(shapes, x, y);
      const result = computeAmbientReflection(shapes, precomputed, 0);

      expect(result.earlyExitTriggered).toBe(false);
      expect(result.anyShapeOnLayer).toBe(true);

      // Only bg-base contributes (coverage > 0 || isFullCoverage)
      expect(result.contributingShapes).toContain('bg-base');
      expect(result.contributingShapes).not.toContain('bg-grid'); // coverage = 0

      // Total reflection = bg-base only = 1.0
      expect(result.totalReflection).toBe(1.0);
      expect(result.maxCoverage).toBe(1.0);
    });

    it('computes 60% reflection INSIDE circles', () => {
      const shapes = createBackgroundShapes();

      // Position inside a circle (center of first grid cell)
      const x = 40;
      const y = 40;

      // Verify we're inside a circle
      expect(diagonalCircleGridCoverage(x, y)).toBe(1.0);

      const precomputed = precomputeCoverageAndAlpha(shapes, x, y);
      const result = computeAmbientReflection(shapes, precomputed, 0);

      expect(result.earlyExitTriggered).toBe(false);
      expect(result.anyShapeOnLayer).toBe(true);

      // Both bg-base and bg-grid contribute
      expect(result.contributingShapes).toContain('bg-base');
      expect(result.contributingShapes).toContain('bg-grid');

      // Total reflection = bg-base * bg-grid = 1.0 * 0.6 = 0.6
      expect(result.totalReflection).toBeCloseTo(0.6, 5);
      expect(result.maxCoverage).toBe(1.0);
    });

    it('circles ARE visible (contrast exists between inside and outside)', () => {
      const shapes = createBackgroundShapes();

      // Outside circle
      const outsideX = 0;
      const outsideY = 0;
      const precomputedOutside = precomputeCoverageAndAlpha(shapes, outsideX, outsideY);
      const resultOutside = computeAmbientReflection(shapes, precomputedOutside, 0);

      // Inside circle
      const insideX = 40;
      const insideY = 40;
      const precomputedInside = precomputeCoverageAndAlpha(shapes, insideX, insideY);
      const resultInside = computeAmbientReflection(shapes, precomputedInside, 0);

      // Key assertion: CIRCLES ARE VISIBLE
      expect(resultOutside.totalReflection).not.toBe(resultInside.totalReflection);
      expect(resultOutside.totalReflection).toBe(1.0);
      expect(resultInside.totalReflection).toBeCloseTo(0.6, 5);

      // Contrast = 40%
      const contrast = resultOutside.totalReflection - resultInside.totalReflection;
      expect(contrast).toBeCloseTo(0.4, 5);

      console.log('\n=== CIRCLE VISIBILITY TEST ===');
      console.log(`Outside circles: reflection = ${resultOutside.totalReflection}`);
      console.log(`Inside circles:  reflection = ${resultInside.totalReflection}`);
      console.log(`Contrast: ${contrast * 100}%`);
      console.log('Circles ARE visible ✓');
    });

    it('circles are INVISIBLE when dimensions are zero (bug reproduction)', () => {
      const shapesWithBug: SimulatedShape[] = [
        {
          id: 'bg-base',
          x: 0,
          y: 0,
          width: 0, // BUG!
          height: 0, // BUG!
          layer: 0,
          hasMsdf: false,
          hasAlpha: false,
          materialReflection: BG_BASE_REFL,
        },
        {
          id: 'bg-grid',
          x: 0,
          y: 0,
          width: 0, // BUG!
          height: 0, // BUG!
          layer: 0,
          hasMsdf: true,
          hasAlpha: true,
          materialReflection: BG_GRID_REFL,
          msdfCoverage: (x, y) => diagonalCircleGridCoverage(x, y),
          alphaValue: () => 1.0,
        },
      ];

      // Test at various positions
      const positions = [
        { x: 0, y: 0 },
        { x: 40, y: 40 },
        { x: 640, y: 360 },
      ];

      for (const pos of positions) {
        const precomputed = precomputeCoverageAndAlpha(shapesWithBug, pos.x, pos.y);

        // All coverage values are 0.0 due to bounding box bug
        expect(precomputed.shapeCoverages[0]).toBe(0.0);
        expect(precomputed.shapeCoverages[1]).toBe(0.0);
        expect(precomputed.maxMask).toBe(0.0);

        const result = computeAmbientReflection(shapesWithBug, precomputed, 0);
        expect(result.earlyExitTriggered).toBe(true);
      }

      console.log('\n=== BUG REPRODUCTION ===');
      console.log('When dimensions are 0, all coverage values are 0.0');
      console.log('Early-exit triggers, NO ambient light added');
      console.log('Result: Circles INVISIBLE!');
    });
  });

  describe('Multi-Position Grid Scan', () => {
    it('shows circle pattern across multiple positions', () => {
      const shapes: SimulatedShape[] = [
        {
          id: 'bg-base',
          x: 0,
          y: 0,
          width: SCREEN_WIDTH,
          height: SCREEN_HEIGHT,
          layer: 0,
          hasMsdf: false,
          hasAlpha: false,
          materialReflection: BG_BASE_REFL,
        },
        {
          id: 'bg-grid',
          x: 0,
          y: 0,
          width: SCREEN_WIDTH,
          height: SCREEN_HEIGHT,
          layer: 0,
          hasMsdf: true,
          hasAlpha: true,
          materialReflection: BG_GRID_REFL,
          msdfCoverage: (x, y) => diagonalCircleGridCoverage(x, y),
          alphaValue: () => 1.0,
        },
      ];

      console.log('\n=== GRID SCAN ===');
      console.log('Position\tCoverage\tReflection\tInCircle');
      console.log('-'.repeat(60));

      let insideCount = 0;
      let outsideCount = 0;

      // Scan a line from (0,0) to (160,0) - should cross circle boundaries
      for (let x = 0; x <= 160; x += 10) {
        const y = 40; // y=40 is at circle center level

        const coverage = diagonalCircleGridCoverage(x, y);
        const precomputed = precomputeCoverageAndAlpha(shapes, x, y);
        const result = computeAmbientReflection(shapes, precomputed, 0);

        const inCircle = coverage > 0.5;
        if (inCircle) insideCount++;
        else outsideCount++;

        console.log(
          `(${x.toString().padStart(3)}, ${y})\t${coverage.toFixed(2)}\t\t${result.totalReflection.toFixed(2)}\t\t${inCircle ? 'YES' : 'NO'}`
        );

        // Verify correct reflection
        if (coverage > 0.5) {
          expect(result.totalReflection).toBeCloseTo(0.6, 1);
        } else if (coverage < 0.5) {
          expect(result.totalReflection).toBe(1.0);
        }
      }

      // Should have both inside and outside samples
      expect(insideCount).toBeGreaterThan(0);
      expect(outsideCount).toBeGreaterThan(0);
    });
  });
});
