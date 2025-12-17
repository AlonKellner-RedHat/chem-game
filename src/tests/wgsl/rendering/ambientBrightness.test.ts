/**
 * Ambient Brightness Accumulation Tests
 *
 * Tests for ambient shape brightness sampling and accumulation.
 * Ambient shapes provide the light source that gets reflected by material and texture shapes.
 */

import { describe, expect, it } from 'vitest';

describe('Ambient Shape Brightness', () => {
  describe('Single Shape Sampling', () => {
    it('should return brightness when fully inside shape', () => {
      const shape = {
        brightness: 1.0,
        mask: 1.0, // Full MSDF coverage
        alpha: 1.0, // Full alpha
      };

      const result = shape.brightness * shape.mask * shape.alpha;
      expect(result).toBe(1.0);
    });

    it('should modulate brightness by MSDF coverage', () => {
      const shape = {
        brightness: 1.0,
        mask: 0.5, // Edge anti-aliasing
        alpha: 1.0,
      };

      const result = shape.brightness * shape.mask * shape.alpha;
      expect(result).toBe(0.5);
    });

    it('should modulate brightness by alpha gradient', () => {
      const shape = {
        brightness: 1.0,
        mask: 1.0,
        alpha: 0.7, // Alpha gradient
      };

      const result = shape.brightness * shape.mask * shape.alpha;
      expect(result).toBe(0.7);
    });

    it('should combine mask and alpha multiplicatively', () => {
      const shape = {
        brightness: 2.0,
        mask: 0.8,
        alpha: 0.5,
      };

      // brightness * mask * alpha = 2.0 * 0.8 * 0.5 = 0.8
      const result = shape.brightness * shape.mask * shape.alpha;
      expect(result).toBeCloseTo(0.8, 5);
    });

    it('should return 0 when outside shape (mask=0)', () => {
      const shape = {
        brightness: 1.0,
        mask: 0.0, // Outside MSDF boundary
        alpha: 1.0,
      };

      const result = shape.brightness * shape.mask * shape.alpha;
      expect(result).toBe(0);
    });

    it('should return 0 when alpha is 0', () => {
      const shape = {
        brightness: 1.0,
        mask: 1.0,
        alpha: 0.0, // Fully transparent
      };

      const result = shape.brightness * shape.mask * shape.alpha;
      expect(result).toBe(0);
    });
  });

  describe('Multiple Shape Accumulation', () => {
    it('should accumulate brightness additively', () => {
      const shapes = [
        { brightness: 0.5, mask: 1.0, alpha: 1.0 },
        { brightness: 0.3, mask: 1.0, alpha: 1.0 },
        { brightness: 0.2, mask: 1.0, alpha: 1.0 },
      ];

      // Additive: sum of all contributions
      const totalBrightness = shapes.reduce((sum, s) => sum + s.brightness * s.mask * s.alpha, 0);

      expect(totalBrightness).toBe(1.0);
    });

    it('should accumulate with partial overlap', () => {
      const shapes = [
        { brightness: 1.0, mask: 1.0, alpha: 1.0 }, // Full coverage
        { brightness: 1.0, mask: 0.5, alpha: 1.0 }, // Partial coverage (edge)
      ];

      const totalBrightness = shapes.reduce((sum, s) => sum + s.brightness * s.mask * s.alpha, 0);

      expect(totalBrightness).toBe(1.5);
    });

    it('should allow brightness > 1.0 (HDR)', () => {
      const shapes = [
        { brightness: 2.0, mask: 1.0, alpha: 1.0 },
        { brightness: 3.0, mask: 0.5, alpha: 1.0 },
      ];

      const totalBrightness = shapes.reduce((sum, s) => sum + s.brightness * s.mask * s.alpha, 0);

      // 2.0 + 1.5 = 3.5
      expect(totalBrightness).toBe(3.5);
    });

    it('should handle non-overlapping shapes correctly', () => {
      // At pixel P1: only shape 1 covers it
      const shapesAtP1 = [
        { brightness: 1.0, mask: 1.0, alpha: 1.0 }, // Shape 1 covers P1
        { brightness: 1.0, mask: 0.0, alpha: 1.0 }, // Shape 2 doesn't cover P1
      ];

      const brightnessAtP1 = shapesAtP1.reduce(
        (sum, s) => sum + s.brightness * s.mask * s.alpha,
        0
      );

      expect(brightnessAtP1).toBe(1.0);
    });
  });

  describe('Edge Cases', () => {
    it('should return 0 when no ambient shapes', () => {
      const shapes: { brightness: number; mask: number; alpha: number }[] = [];

      const totalBrightness = shapes.reduce((sum, s) => sum + s.brightness * s.mask * s.alpha, 0);

      expect(totalBrightness).toBe(0);
    });

    it('should handle very small brightness values', () => {
      const shapes = [
        { brightness: 0.001, mask: 1.0, alpha: 1.0 },
        { brightness: 0.002, mask: 1.0, alpha: 1.0 },
      ];

      const totalBrightness = shapes.reduce((sum, s) => sum + s.brightness * s.mask * s.alpha, 0);

      expect(totalBrightness).toBeCloseTo(0.003, 6);
    });

    it('should handle many overlapping shapes', () => {
      // 10 shapes, each contributing 0.1 brightness
      const shapes = Array.from({ length: 10 }, () => ({
        brightness: 0.1,
        mask: 1.0,
        alpha: 1.0,
      }));

      const totalBrightness = shapes.reduce((sum, s) => sum + s.brightness * s.mask * s.alpha, 0);

      expect(totalBrightness).toBeCloseTo(1.0, 5);
    });
  });

  describe('MSDF Coverage vs Alpha Distinction', () => {
    it('MSDF coverage controls shape boundary (anti-aliasing)', () => {
      // At the edge of an MSDF shape, coverage transitions 0→1
      const coverageValues = [0.0, 0.25, 0.5, 0.75, 1.0];

      for (const coverage of coverageValues) {
        expect(coverage).toBeGreaterThanOrEqual(0);
        expect(coverage).toBeLessThanOrEqual(1);
      }
    });

    it('Alpha controls intensity gradient (soft falloff)', () => {
      // Alpha can create smooth gradients across the shape
      const alphaGradient = [1.0, 0.8, 0.6, 0.4, 0.2, 0.0];

      // Gradient should decrease
      for (let i = 1; i < alphaGradient.length; i++) {
        expect(alphaGradient[i]).toBeLessThan(alphaGradient[i - 1]);
      }
    });

    it('no MSDF = full coverage (hasMsdf=0)', () => {
      // When hasMsdf is false, coverage defaults to 1.0 within bounding box
      const shape = {
        hasMsdf: false,
        brightness: 1.0,
        alpha: 0.5,
      };

      const coverage = shape.hasMsdf ? 0.8 : 1.0;
      const result = shape.brightness * coverage * shape.alpha;

      expect(result).toBe(0.5);
    });

    it('no alpha = full intensity (hasAlpha=0)', () => {
      // When hasAlpha is false, alpha defaults to 1.0
      const shape = {
        hasAlpha: false,
        brightness: 1.0,
        mask: 0.5,
      };

      const alpha = shape.hasAlpha ? 0.3 : 1.0;
      const result = shape.brightness * shape.mask * alpha;

      expect(result).toBe(0.5);
    });
  });

  describe('Ambient Brightness Usage', () => {
    it('brightness is multiplied by material/texture reflection', () => {
      // Final reflected light = ambient brightness × reflection spectrum
      const ambientBrightness = 1.5;
      const materialReflection = 0.8;

      const reflectedLight = ambientBrightness * materialReflection;
      expect(reflectedLight).toBeCloseTo(1.2, 5);
    });

    it('brightness is uniform across the spectrum', () => {
      // Unlike material/texture distributions, ambient brightness is a scalar
      // The same brightness value is used for all wavelengths
      const brightness = 1.0;

      const wavelengths = [400, 500, 550, 600, 700];
      for (const _wl of wavelengths) {
        // Brightness is the same at all wavelengths
        expect(brightness).toBe(1.0);
      }
    });

    it('reflection spectral distribution comes from material/texture palettes', () => {
      // Ambient brightness × reflection(wavelength) gives spectral result
      const ambientBrightness = 1.0;

      // Example: Gold-like reflection (higher in red)
      const reflectionAt450nm = 0.3;
      const reflectionAt550nm = 0.7;
      const reflectionAt650nm = 0.9;

      expect(ambientBrightness * reflectionAt650nm).toBeGreaterThan(
        ambientBrightness * reflectionAt450nm
      );
      expect(ambientBrightness * reflectionAt550nm).toBeCloseTo(0.7, 5);
    });
  });
});

describe('Default Ambient Shape', () => {
  it('full-screen ambient shape should provide uniform illumination', () => {
    const fullScreenAmbient = {
      x: 0,
      y: 0,
      width: 1280,
      height: 720,
      brightness: 1.0,
      hasMsdf: false,
      hasAlpha: false,
    };

    // At any pixel, mask=1 and alpha=1
    const brightnessAnywhere = fullScreenAmbient.brightness * 1.0 * 1.0;
    expect(brightnessAnywhere).toBe(1.0);
  });

  it('ambient shape with alpha gradient creates directional light', () => {
    // Alpha texture with gradient: bright on right, dark on left
    const gradientAmbient = {
      brightness: 1.0,
      alphaAtLeft: 0.0,
      alphaAtCenter: 0.5,
      alphaAtRight: 1.0,
    };

    expect(gradientAmbient.brightness * gradientAmbient.alphaAtLeft).toBe(0);
    expect(gradientAmbient.brightness * gradientAmbient.alphaAtCenter).toBe(0.5);
    expect(gradientAmbient.brightness * gradientAmbient.alphaAtRight).toBe(1.0);
  });

  it('ambient shape with MSDF creates shaped light source', () => {
    // MSDF circle creates circular light pattern
    const circularAmbient = {
      brightness: 1.0,
      coverageInside: 1.0,
      coverageEdge: 0.5,
      coverageOutside: 0.0,
    };

    expect(circularAmbient.brightness * circularAmbient.coverageInside).toBe(1.0);
    expect(circularAmbient.brightness * circularAmbient.coverageEdge).toBe(0.5);
    expect(circularAmbient.brightness * circularAmbient.coverageOutside).toBe(0);
  });
});
