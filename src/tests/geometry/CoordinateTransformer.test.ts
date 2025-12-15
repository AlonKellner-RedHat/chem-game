/**
 * CoordinateTransformer Tests (TDD - Red Phase)
 *
 * Tests for coordinate transformation between normalized (0-1) and pixel coordinates.
 */

import { describe, it, expect } from "vitest";
import {
  NormalizedRect,
  PixelRect,
  toPixelRect,
  toNormalizedRect,
} from "../../core/geometry/CoordinateTransformer";

describe("CoordinateTransformer", () => {
  describe("toPixelRect", () => {
    it("converts origin (0,0) with zero size", () => {
      const normalized: NormalizedRect = { nx: 0, ny: 0, nw: 0, nh: 0 };
      const result = toPixelRect(normalized, 1920, 1080);
      expect(result).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    });

    it("converts full screen (0,0,1,1) to screen dimensions", () => {
      const normalized: NormalizedRect = { nx: 0, ny: 0, nw: 1, nh: 1 };
      const result = toPixelRect(normalized, 1920, 1080);
      expect(result).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    });

    it("converts center position (0.5, 0.5) correctly", () => {
      const normalized: NormalizedRect = { nx: 0.5, ny: 0.5, nw: 0, nh: 0 };
      const result = toPixelRect(normalized, 1000, 800);
      expect(result.x).toBe(500);
      expect(result.y).toBe(400);
    });

    it("converts half-size shape at center", () => {
      const normalized: NormalizedRect = { nx: 0.25, ny: 0.25, nw: 0.5, nh: 0.5 };
      const result = toPixelRect(normalized, 1000, 800);
      expect(result).toEqual({ x: 250, y: 200, width: 500, height: 400 });
    });

    it("handles different aspect ratios", () => {
      const normalized: NormalizedRect = { nx: 0.1, ny: 0.2, nw: 0.3, nh: 0.4 };
      
      // 16:9 screen
      const result1 = toPixelRect(normalized, 1920, 1080);
      expect(result1.x).toBe(192);
      expect(result1.y).toBe(216);
      expect(result1.width).toBe(576);
      expect(result1.height).toBe(432);
      
      // 4:3 screen
      const result2 = toPixelRect(normalized, 1024, 768);
      expect(result2.x).toBeCloseTo(102.4);
      expect(result2.y).toBeCloseTo(153.6);
      expect(result2.width).toBeCloseTo(307.2);
      expect(result2.height).toBeCloseTo(307.2);
    });

    it("maintains relative edge distances", () => {
      // Shape at 10% from left, 20% from top, 30% wide, 40% tall
      const normalized: NormalizedRect = { nx: 0.1, ny: 0.2, nw: 0.3, nh: 0.4 };
      
      const result = toPixelRect(normalized, 2000, 1000);
      
      // Left edge distance: 10% of 2000 = 200
      expect(result.x).toBe(200);
      // Right edge distance: 2000 - 200 - 600 = 1200 = 60% of 2000
      expect(2000 - result.x - result.width).toBe(1200);
      
      // Top edge distance: 20% of 1000 = 200
      expect(result.y).toBe(200);
      // Bottom edge distance: 1000 - 200 - 400 = 400 = 40% of 1000
      expect(1000 - result.y - result.height).toBe(400);
    });
  });

  describe("toNormalizedRect", () => {
    it("converts origin (0,0) with zero size", () => {
      const pixels: PixelRect = { x: 0, y: 0, width: 0, height: 0 };
      const result = toNormalizedRect(pixels, 1280, 720);
      expect(result).toEqual({ nx: 0, ny: 0, nw: 0, nh: 0 });
    });

    it("converts full screen to (0,0,1,1)", () => {
      const pixels: PixelRect = { x: 0, y: 0, width: 1280, height: 720 };
      const result = toNormalizedRect(pixels, 1280, 720);
      expect(result).toEqual({ nx: 0, ny: 0, nw: 1, nh: 1 });
    });

    it("converts pixel coordinates to normalized", () => {
      // Square shape at x:20, y:80, 200x200 on 1280x720 base
      const pixels: PixelRect = { x: 20, y: 80, width: 200, height: 200 };
      const result = toNormalizedRect(pixels, 1280, 720);
      
      expect(result.nx).toBeCloseTo(20 / 1280);
      expect(result.ny).toBeCloseTo(80 / 720);
      expect(result.nw).toBeCloseTo(200 / 1280);
      expect(result.nh).toBeCloseTo(200 / 720);
    });

    it("round-trips correctly with toPixelRect", () => {
      const original: PixelRect = { x: 150, y: 80, width: 200, height: 200 };
      const baseWidth = 1280;
      const baseHeight = 720;
      
      // Convert to normalized
      const normalized = toNormalizedRect(original, baseWidth, baseHeight);
      
      // Convert back to pixels at same resolution
      const restored = toPixelRect(normalized, baseWidth, baseHeight);
      
      expect(restored.x).toBeCloseTo(original.x);
      expect(restored.y).toBeCloseTo(original.y);
      expect(restored.width).toBeCloseTo(original.width);
      expect(restored.height).toBeCloseTo(original.height);
    });

    it("scales correctly to different screen sizes", () => {
      const original: PixelRect = { x: 128, y: 72, width: 256, height: 144 };
      const baseWidth = 1280;
      const baseHeight = 720;
      
      // Convert to normalized (10%, 10%, 20%, 20%)
      const normalized = toNormalizedRect(original, baseWidth, baseHeight);
      expect(normalized.nx).toBeCloseTo(0.1);
      expect(normalized.ny).toBeCloseTo(0.1);
      expect(normalized.nw).toBeCloseTo(0.2);
      expect(normalized.nh).toBeCloseTo(0.2);
      
      // Scale to 1920x1080
      const scaled = toPixelRect(normalized, 1920, 1080);
      expect(scaled.x).toBeCloseTo(192);  // 10% of 1920
      expect(scaled.y).toBeCloseTo(108);  // 10% of 1080
      expect(scaled.width).toBeCloseTo(384);  // 20% of 1920
      expect(scaled.height).toBeCloseTo(216); // 20% of 1080
    });
  });
});

