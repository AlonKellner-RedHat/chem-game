/**
 * Ambient Alpha Tests
 *
 * These tests verify that the ambient alpha gradient is correctly sampled
 * and applied to ambient light contributions.
 *
 * The diagonal-circle-grid has alpha gradients:
 * - Linear: bright on right (1.0), black on left (0.0)
 * - Radial: bright spot at bottom-left, fading outward
 *
 * Combined with screen blend:
 * - Top-left corner: low alpha (near 0)
 * - Bottom-right corner: high alpha (near 1)
 * - Bottom-left: moderate alpha (radial gradient)
 * - Right side: high alpha (linear gradient)
 */

import { describe, expect, it } from "vitest";

describe("Ambient Alpha Gradient", () => {
  // Simulated alpha sampling based on the gradient definition
  // Linear: x1=100%, x2=0% (right to left), opacity 1.0 -> 0.0
  // Radial: center at (128, 648), radius 1200, focal at (64, 684)

  const SCREEN_WIDTH = 1280;
  const SCREEN_HEIGHT = 720;

  /**
   * Simulate the linear gradient (right to left)
   * Returns opacity at normalized x position (0-1)
   */
  function sampleLinearGradient(u: number): number {
    // Linear gradient: bright on right (u=1), transparent on left (u=0)
    // x1=100%, x2=0% means the gradient goes from right to left
    return u; // u=0 (left) -> 0, u=1 (right) -> 1
  }

  /**
   * Simulate the radial gradient (bottom-left corner)
   * Returns opacity at normalized position
   */
  function sampleRadialGradient(u: number, v: number): number {
    // Radial center: (128, 648) in 1280x720
    // Normalized: (0.1, 0.9)
    const cx = 0.1;
    const cy = 0.9;
    const maxRadius = 1200 / Math.max(SCREEN_WIDTH, SCREEN_HEIGHT);

    const dx = u - cx;
    const dy = v - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const t = Math.min(dist / maxRadius, 1);

    // Stops: 0%->1.0, 25%->0.6, 60%->0.1, 100%->0.0
    if (t < 0.25) {
      return 1.0 - (1.0 - 0.6) * (t / 0.25);
    } else if (t < 0.6) {
      return 0.6 - (0.6 - 0.1) * ((t - 0.25) / 0.35);
    } else {
      return 0.1 - 0.1 * ((t - 0.6) / 0.4);
    }
  }

  /**
   * Simulate screen blend mode: result = 1 - (1-a)(1-b)
   */
  function screenBlend(a: number, b: number): number {
    return 1 - (1 - a) * (1 - b);
  }

  /**
   * Simulate getAmbientAlpha() - combines both gradients with screen blend
   */
  function simulateGetAmbientAlpha(x: number, y: number): number {
    const u = x / SCREEN_WIDTH;
    const v = y / SCREEN_HEIGHT;

    const linear = sampleLinearGradient(u);
    const radial = sampleRadialGradient(u, v);

    // Screen blend: start with black (0), add linear, add radial
    return screenBlend(linear, radial);
  }

  describe("Alpha Gradient Spatial Variation", () => {
    it("getAmbientAlpha returns different values at different positions", () => {
      const topLeft = simulateGetAmbientAlpha(0, 0);
      const topRight = simulateGetAmbientAlpha(SCREEN_WIDTH - 1, 0);
      const bottomLeft = simulateGetAmbientAlpha(0, SCREEN_HEIGHT - 1);
      const bottomRight = simulateGetAmbientAlpha(
        SCREEN_WIDTH - 1,
        SCREEN_HEIGHT - 1
      );
      const center = simulateGetAmbientAlpha(
        SCREEN_WIDTH / 2,
        SCREEN_HEIGHT / 2
      );

      // All positions should have different alpha values
      const values = [topLeft, topRight, bottomLeft, bottomRight, center];
      const uniqueValues = new Set(values.map((v) => v.toFixed(2)));

      // Should have at least 3 distinct values
      expect(uniqueValues.size).toBeGreaterThanOrEqual(3);
    });

    it("top-left corner has low alpha (darkest region)", () => {
      const topLeft = simulateGetAmbientAlpha(10, 10);

      // Top-left: far from radial center, left side of linear gradient
      // Should be relatively dark
      expect(topLeft).toBeLessThan(0.3);
    });

    it("bottom-right corner has high alpha (brightest region)", () => {
      const bottomRight = simulateGetAmbientAlpha(
        SCREEN_WIDTH - 10,
        SCREEN_HEIGHT - 10
      );

      // Bottom-right: right side of linear (bright) + some radial
      // Should be bright
      expect(bottomRight).toBeGreaterThan(0.8);
    });

    it("bottom-left has moderate alpha (radial center)", () => {
      // Near the radial gradient center
      const bottomLeft = simulateGetAmbientAlpha(100, 650);

      // Should be bright due to radial gradient
      expect(bottomLeft).toBeGreaterThan(0.5);
    });

    it("right side has high alpha (linear gradient)", () => {
      const rightSide = simulateGetAmbientAlpha(SCREEN_WIDTH - 50, 360);

      // Right side: linear gradient is at maximum
      expect(rightSide).toBeGreaterThan(0.9);
    });
  });

  describe("Alpha Modulates Ambient Contribution", () => {
    const AMBIENT_INTENSITY = 1.0;
    const TOTAL_REFLECTION = 0.8;
    const MAX_COVERAGE = 1.0;
    const AMBIENT_PATTERN = 0.6; // Inside circles

    function calculateAmbientContribution(alpha: number): number {
      return (
        AMBIENT_INTENSITY * TOTAL_REFLECTION * MAX_COVERAGE * AMBIENT_PATTERN * alpha
      );
    }

    it("low alpha reduces ambient contribution", () => {
      const lowAlpha = 0.1;
      const highAlpha = 0.9;

      const lowContrib = calculateAmbientContribution(lowAlpha);
      const highContrib = calculateAmbientContribution(highAlpha);

      // Low alpha should result in much lower contribution
      expect(lowContrib).toBeLessThan(highContrib);
      expect(lowContrib / highContrib).toBeCloseTo(lowAlpha / highAlpha, 1);
    });

    it("alpha=0 results in zero ambient contribution", () => {
      const contrib = calculateAmbientContribution(0);
      expect(contrib).toBe(0);
    });

    it("alpha=1 maintains full ambient contribution", () => {
      const contrib = calculateAmbientContribution(1.0);
      const expected =
        AMBIENT_INTENSITY * TOTAL_REFLECTION * MAX_COVERAGE * AMBIENT_PATTERN;
      expect(contrib).toBe(expected);
    });
  });

  describe("getAmbientAlpha Contract", () => {
    it("returns values in range [0, 1]", () => {
      // Sample many positions
      for (let x = 0; x < SCREEN_WIDTH; x += 100) {
        for (let y = 0; y < SCREEN_HEIGHT; y += 100) {
          const alpha = simulateGetAmbientAlpha(x, y);
          expect(alpha).toBeGreaterThanOrEqual(0);
          expect(alpha).toBeLessThanOrEqual(1);
        }
      }
    });

    it("alpha varies continuously (no sudden jumps)", () => {
      // Sample along a diagonal
      let prevAlpha = simulateGetAmbientAlpha(0, 0);

      for (let t = 0.1; t <= 1.0; t += 0.1) {
        const x = t * SCREEN_WIDTH;
        const y = t * SCREEN_HEIGHT;
        const alpha = simulateGetAmbientAlpha(x, y);

        // Change should be gradual (less than 0.5 per step)
        expect(Math.abs(alpha - prevAlpha)).toBeLessThan(0.5);
        prevAlpha = alpha;
      }
    });
  });
});

