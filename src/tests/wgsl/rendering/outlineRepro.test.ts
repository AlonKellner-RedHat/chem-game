/**
 * Test to reproduce and identify the outline issue.
 *
 * The user reports an outline that is "expressed equally on all shapes"
 * regardless of material. This test simulates the exact shader behavior
 * to identify the root cause.
 */

import { describe, expect, it } from 'vitest';

/**
 * Simulate MSDF smoothstep anti-aliasing.
 * screenPxDist ranges from -0.5 (outside) to +0.5 (inside) over 1 pixel.
 */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Simulate MSDF mask sampling.
 * @param pixelDistFromEdge - Distance from shape edge in pixels (negative = outside)
 * @returns mask value (0-1)
 */
function simulateMsdfMask(pixelDistFromEdge: number): number {
  // MSDF uses smoothstep(-0.5, 0.5, screenPxDist)
  // screenPxDist = 0 at edge, positive inside, negative outside
  return smoothstep(-0.5, 0.5, pixelDistFromEdge);
}

/**
 * The current shader's ambient reflection calculation.
 * Uses standard linear blend (no sharpen) for proper anti-aliasing.
 */
function calculateAmbientReflection(
  bgBaseMaterialRefl: number,
  shapeMaterialRefl: number,
  mask: number,
  hasMsdf: boolean,
  hasAlpha: boolean
): number {
  let totalReflection = 1.0;

  // bg-base always contributes (no mask, no alpha)
  const bgEffectiveRefl = bgBaseMaterialRefl; // mix(1.0, 1.0, 1.0) = 1.0
  totalReflection *= 1.0 * bgEffectiveRefl;

  // Material shape contribution
  const shapeIsFullCoverage = !hasMsdf && !hasAlpha;
  if (mask > 0.0 || shapeIsFullCoverage) {
    const reflFactor = 1.0; // Material shapes have no alpha, so reflFactor = 1.0
    // Standard linear blend - NO sharpen (proper anti-aliasing)
    const effectiveMask = shapeIsFullCoverage ? 1.0 : mask;
    const effectiveRefl = 1.0 - effectiveMask + effectiveMask * shapeMaterialRefl;
    totalReflection *= reflFactor * effectiveRefl;
  }

  return totalReflection;
}

describe('Outline Reproduction Test', () => {
  const GOLD_REFL = 0.8;
  const BLUE_REFL = 0.6;
  const BG_REFL = 1.0;

  describe('MSDF mask behavior at edge', () => {
    it('should show mask transition over 1 pixel', () => {
      // Distance from edge in pixels: negative = outside, positive = inside
      const distances = [-1.0, -0.5, -0.25, 0.0, 0.25, 0.5, 1.0];
      const masks = distances.map(simulateMsdfMask);

      console.log('MSDF mask values at different pixel distances:');
      distances.forEach((d, i) => {
        console.log(`  dist=${d.toFixed(2)}: mask=${masks[i].toFixed(4)}`);
      });

      // Outside shape (dist <= -0.5): mask should be ~0
      expect(masks[0]).toBeLessThan(0.01); // dist=-1.0
      expect(masks[1]).toBeLessThan(0.01); // dist=-0.5

      // At edge (dist=0): mask should be 0.5
      expect(masks[3]).toBeCloseTo(0.5, 2); // dist=0.0

      // Inside shape (dist >= 0.5): mask should be ~1
      expect(masks[5]).toBeGreaterThan(0.99); // dist=0.5
      expect(masks[6]).toBeGreaterThan(0.99); // dist=1.0
    });
  });

  describe('Ambient reflection at shape edge', () => {
    it('should show reflection values across edge (gold shape)', () => {
      const distances = [-1.0, -0.5, -0.25, 0.0, 0.25, 0.5, 1.0];

      console.log('\nAmbient reflection for GOLD shape (refl=0.8):');
      console.log('dist\tmask\tsharpenMask\ttotalRefl');

      distances.forEach((dist) => {
        const mask = simulateMsdfMask(dist);
        const sharpenedMask = Math.min(mask * 2.0, 1.0);
        const totalRefl = calculateAmbientReflection(BG_REFL, GOLD_REFL, mask, true, false);
        console.log(
          `${dist.toFixed(2)}\t${mask.toFixed(4)}\t${sharpenedMask.toFixed(4)}\t\t${totalRefl.toFixed(4)}`
        );
      });
    });

    it('should show reflection values across edge (blue shape)', () => {
      const distances = [-1.0, -0.5, -0.25, 0.0, 0.25, 0.5, 1.0];

      console.log('\nAmbient reflection for BLUE shape (refl=0.6):');
      console.log('dist\tmask\tsharpenMask\ttotalRefl');

      distances.forEach((dist) => {
        const mask = simulateMsdfMask(dist);
        const sharpenedMask = Math.min(mask * 2.0, 1.0);
        const totalRefl = calculateAmbientReflection(BG_REFL, BLUE_REFL, mask, true, false);
        console.log(
          `${dist.toFixed(2)}\t${mask.toFixed(4)}\t${sharpenedMask.toFixed(4)}\t\t${totalRefl.toFixed(4)}`
        );
      });
    });

    it('edge values transition smoothly from outside to inside (anti-aliasing)', () => {
      // Test at fine resolution across the edge
      const fineDists = [];
      for (let d = -0.5; d <= 1.0; d += 0.1) {
        fineDists.push(d);
      }

      const goldReflections = fineDists.map((dist) => {
        const mask = simulateMsdfMask(dist);
        return calculateAmbientReflection(BG_REFL, GOLD_REFL, mask, true, false);
      });

      // With proper anti-aliasing, edge values ARE brighter than interior
      // This is CORRECT - the edge is a blend of shape (0.8) and background (1.0)
      const interiorValue = goldReflections[goldReflections.length - 1]; // dist=1.0
      const outsideValue = goldReflections[0]; // dist=-0.5

      console.log('\nAnti-aliased edge transition:');
      console.log(`Outside value (dist=-0.5): ${outsideValue.toFixed(4)}`);
      console.log(`Interior value (dist=1.0): ${interiorValue.toFixed(4)}`);

      // Verify transition is monotonic (decreasing from outside to inside)
      let isMonotonic = true;
      for (let i = 1; i < goldReflections.length; i++) {
        if (goldReflections[i] > goldReflections[i - 1] + 0.001) {
          isMonotonic = false;
          console.log(
            `Non-monotonic at dist=${fineDists[i].toFixed(1)}: ${goldReflections[i - 1].toFixed(4)} -> ${goldReflections[i].toFixed(4)}`
          );
        }
      }

      console.log(`Transition is ${isMonotonic ? 'monotonic ✓' : 'NOT monotonic ⚠️'}`);
      expect(isMonotonic).toBe(true);

      // Verify outside > interior (anti-aliasing creates this gradient)
      expect(outsideValue).toBeGreaterThan(interiorValue);
    });

    it('CRITICAL: check for kink in transition (derivative discontinuity)', () => {
      // Sample at fine resolution
      const fineDists = [];
      for (let d = -0.5; d <= 1.0; d += 0.05) {
        fineDists.push(d);
      }

      const goldReflections = fineDists.map((dist) => {
        const mask = simulateMsdfMask(dist);
        return calculateAmbientReflection(BG_REFL, GOLD_REFL, mask, true, false);
      });

      // Calculate first derivative (slope)
      const slopes: number[] = [];
      for (let i = 1; i < goldReflections.length; i++) {
        const slope = (goldReflections[i] - goldReflections[i - 1]) / 0.05;
        slopes.push(slope);
      }

      console.log('\nSlope analysis (looking for kinks):');
      fineDists.slice(1).forEach((d, i) => {
        if (Math.abs(slopes[i]) > 0.01) {
          console.log(`  dist=${d.toFixed(2)}: slope=${slopes[i].toFixed(4)}`);
        }
      });

      // Check for sudden slope changes (kinks)
      let maxSlopeChange = 0;
      let kinkLocation = 0;
      for (let i = 1; i < slopes.length; i++) {
        const slopeChange = Math.abs(slopes[i] - slopes[i - 1]);
        if (slopeChange > maxSlopeChange) {
          maxSlopeChange = slopeChange;
          kinkLocation = fineDists[i + 1];
        }
      }

      console.log(
        `\nMax slope change: ${maxSlopeChange.toFixed(4)} at dist=${kinkLocation.toFixed(2)}`
      );

      // A kink indicates a visual discontinuity
      if (maxSlopeChange > 0.5) {
        console.log('KINK DETECTED: Sharp transition may cause visible outline');
      }
    });

    it('CRITICAL: compare edge behavior for different materials', () => {
      // The user says outline is "expressed equally on all shapes"
      // This test checks if the outline effect is material-independent

      const materials = [
        { name: 'gold', refl: 0.8 },
        { name: 'blue', refl: 0.6 },
        { name: 'green', refl: 0.7 },
        { name: 'red', refl: 0.5 },
      ];

      console.log('\nComparing edge behavior across materials:');
      console.log('Material\tInside\tEdge(0)\tOutside\tEdge-Inside');

      const edgeEffects: number[] = [];

      materials.forEach((mat) => {
        const inside = calculateAmbientReflection(BG_REFL, mat.refl, 1.0, true, false);
        const edge = calculateAmbientReflection(
          BG_REFL,
          mat.refl,
          simulateMsdfMask(0),
          true,
          false
        );
        const outside = calculateAmbientReflection(BG_REFL, mat.refl, 0, true, false);

        const edgeEffect = edge - inside;
        edgeEffects.push(edgeEffect);

        console.log(
          `${mat.name}\t\t${inside.toFixed(3)}\t${edge.toFixed(3)}\t${outside.toFixed(3)}\t${edgeEffect.toFixed(4)}`
        );
      });

      // If outline is "equal" for all shapes, the edge effect should be the same
      const avgEdgeEffect = edgeEffects.reduce((a, b) => a + b) / edgeEffects.length;
      const maxDeviation = Math.max(...edgeEffects.map((e) => Math.abs(e - avgEdgeEffect)));

      console.log(`\nAverage edge effect: ${avgEdgeEffect.toFixed(4)}`);
      console.log(`Max deviation from average: ${maxDeviation.toFixed(4)}`);

      // If deviation is small, outline IS material-independent
      if (maxDeviation < 0.01) {
        console.log('CONFIRMED: Outline effect is MATERIAL-INDEPENDENT');
      } else {
        console.log('Outline effect varies by material');
      }
    });
  });

  describe('Mask gating boundary', () => {
    it('should check for discontinuity at mask=0 boundary', () => {
      // The mask gating creates a hard boundary at mask=0
      // Let's see what happens just below and just above this threshold

      const justBelow = 0.0;
      const justAbove = 0.001;

      const reflBelow = calculateAmbientReflection(BG_REFL, GOLD_REFL, justBelow, true, false);
      const reflAbove = calculateAmbientReflection(BG_REFL, GOLD_REFL, justAbove, true, false);

      console.log('\nMask gating boundary analysis:');
      console.log(`mask=0.000: totalRefl=${reflBelow.toFixed(6)}`);
      console.log(`mask=0.001: totalRefl=${reflAbove.toFixed(6)}`);
      console.log(`Difference: ${(reflBelow - reflAbove).toFixed(6)}`);

      // The difference should be very small
      const diff = Math.abs(reflBelow - reflAbove);
      if (diff > 0.01) {
        console.log('DISCONTINUITY DETECTED at mask=0 boundary!');
      }
    });
  });

  describe('Full pixel row simulation', () => {
    it('should visualize reflection values across a horizontal line through shape edge', () => {
      // Simulate a row of pixels crossing the shape edge
      // Shape edge is at pixel 50, so we sample from 45 to 55

      console.log('\nPixel row crossing shape edge (edge at pixel 50):');
      console.log('pixel\tdist\tmask\ttotalRefl\tchar');

      const results: { pixel: number; refl: number }[] = [];

      for (let pixel = 45; pixel <= 55; pixel++) {
        const distFromEdge = pixel - 50; // Edge at pixel 50
        const mask = simulateMsdfMask(distFromEdge);
        const totalRefl = calculateAmbientReflection(BG_REFL, GOLD_REFL, mask, true, false);

        // Create ASCII visualization
        const charIndex = Math.floor((1.0 - totalRefl) * 10);
        const chars = ' .:-=+*#%@';
        const char = chars[Math.min(charIndex, chars.length - 1)];

        results.push({ pixel, refl: totalRefl });
        console.log(
          `${pixel}\t${distFromEdge.toFixed(1)}\t${mask.toFixed(3)}\t${totalRefl.toFixed(4)}\t${char}`
        );
      }

      // Check for any unexpected patterns
      const reflValues = results.map((r) => r.refl);
      const minRefl = Math.min(...reflValues);
      const maxRefl = Math.max(...reflValues);

      console.log(`\nRange: ${minRefl.toFixed(4)} to ${maxRefl.toFixed(4)}`);

      // Verify monotonic transition (no peaks or valleys)
      let isMonotonic = true;
      for (let i = 1; i < reflValues.length; i++) {
        if (reflValues[i] > reflValues[i - 1] + 0.001) {
          // Allowing small tolerance
          isMonotonic = false;
          console.log(
            `Non-monotonic at pixel ${results[i].pixel}: ${reflValues[i - 1].toFixed(4)} -> ${reflValues[i].toFixed(4)}`
          );
        }
      }

      if (isMonotonic) {
        console.log('Transition is monotonic (no bright rim)');
      } else {
        console.log('WARNING: Non-monotonic transition detected!');
      }
    });
  });

  describe('SUB-PIXEL ALIGNMENT ANALYSIS', () => {
    /**
     * The outline visibility varies at different scales because the shape edge
     * can land at different positions relative to pixel centers.
     *
     * With the 1-pixel MSDF anti-aliasing, the max step is always ~0.2 for a
     * material with 0.8 reflection (difference from 1.0 background).
     *
     * This is a fundamental limitation of 1-pixel anti-aliasing.
     */

    it('shows edge behavior at different sub-pixel positions', () => {
      console.log('\n=== SUB-PIXEL ALIGNMENT TEST ===\n');

      // Test different sub-pixel positions of the shape edge
      const edgeOffsets = [0.0, 0.25, 0.5, 0.75];

      const maxSteps: number[] = [];

      edgeOffsets.forEach((offset) => {
        console.log(`\n--- Edge at pixel 50.${(offset * 100).toFixed(0)} ---`);
        console.log('pixel\tdist\tmask\ttotalRefl');

        const edgePosition = 50 + offset;
        const transitions: number[] = [];

        for (let pixel = 48; pixel <= 53; pixel++) {
          const distFromEdge = pixel - edgePosition;
          const mask = simulateMsdfMask(distFromEdge);
          const totalRefl = calculateAmbientReflection(BG_REFL, GOLD_REFL, mask, true, false);

          transitions.push(totalRefl);
          console.log(
            `${pixel}\t${distFromEdge.toFixed(2)}\t${mask.toFixed(3)}\t${totalRefl.toFixed(4)}`
          );
        }

        // Calculate max step size (largest single-pixel change)
        let maxStep = 0;
        for (let i = 1; i < transitions.length; i++) {
          const step = Math.abs(transitions[i] - transitions[i - 1]);
          maxStep = Math.max(maxStep, step);
        }
        maxSteps.push(maxStep);
        console.log(`Max single-pixel step: ${maxStep.toFixed(4)}`);
      });

      // The max step should be similar regardless of sub-pixel position
      // (within the range determined by the material's reflection delta)
      const avgMaxStep = maxSteps.reduce((a, b) => a + b) / maxSteps.length;
      console.log(`\nAverage max step: ${avgMaxStep.toFixed(4)}`);
      console.log('This represents the inherent edge contrast of the anti-aliasing.');
    });

    it('shows that 1-pixel AA creates visible edges (fundamental limitation)', () => {
      console.log('\n=== 1-PIXEL ANTI-ALIASING LIMITATION ===\n');

      // The maximum contrast at the edge is: |bgRefl - materialRefl| = |1.0 - 0.8| = 0.2
      // With 1-pixel AA, this entire contrast can appear in a single pixel step

      const materialContrast = Math.abs(BG_REFL - GOLD_REFL);
      console.log(`Material contrast: ${materialContrast.toFixed(2)}`);
      console.log(`With 1-pixel AA, worst-case step = ${materialContrast.toFixed(2)}`);
      console.log("\nThis is visible as an 'outline' when the edge lands on a pixel boundary.");
      console.log('The only ways to reduce this are:');
      console.log('  1. Use wider anti-aliasing (2+ pixels)');
      console.log('  2. Reduce material contrast (closer to background)');
      console.log('  3. Accept the outline as the cost of sharp edges');

      // Verify the max step equals material contrast
      const edgePosition = 50.5; // Worst case: edge on pixel boundary
      const transitions: number[] = [];

      for (let pixel = 49; pixel <= 52; pixel++) {
        const mask = simulateMsdfMask(pixel - edgePosition);
        transitions.push(calculateAmbientReflection(BG_REFL, GOLD_REFL, mask, true, false));
      }

      let maxStep = 0;
      for (let i = 1; i < transitions.length; i++) {
        maxStep = Math.max(maxStep, Math.abs(transitions[i] - transitions[i - 1]));
      }

      console.log(`\nActual max step at pixel boundary: ${maxStep.toFixed(4)}`);
      expect(maxStep).toBeCloseTo(materialContrast, 1);
    });
  });
});
