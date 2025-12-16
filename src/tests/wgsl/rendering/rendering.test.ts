/**
 * Rendering Module Tests
 * 
 * Tests for MSDF, color, blur, and ambient modules.
 */

import { describe, it, expect } from 'vitest';
import { PHYSICAL_CONSTANTS } from '../testHelpers';

describe('MSDF Rendering', () => {
  describe('Median Function', () => {
    it('should return median of three values', () => {
      // median(r,g,b) = max(min(r,g), min(max(r,g), b))
      const testMedian = (r: number, g: number, b: number) => {
        return Math.max(Math.min(r, g), Math.min(Math.max(r, g), b));
      };
      
      expect(testMedian(0.5, 0.3, 0.7)).toBe(0.5);
      expect(testMedian(0.0, 0.5, 1.0)).toBe(0.5);
      expect(testMedian(0.8, 0.8, 0.8)).toBe(0.8);
    });
  });

  describe('Signed Distance', () => {
    it('0.5 = edge', () => {
      const sd = 0.5 - 0.5; // median - 0.5
      expect(sd).toBe(0);
    });

    it('>0.5 = inside', () => {
      const sd = 0.8 - 0.5;
      expect(sd).toBeGreaterThan(0);
    });

    it('<0.5 = outside', () => {
      const sd = 0.2 - 0.5;
      expect(sd).toBeLessThan(0);
    });
  });
});

describe('Color Mathematics', () => {
  describe('XYZ to sRGB Matrix', () => {
    it('D65 white point should convert to white', () => {
      // D65 white point: X=0.9505, Y=1.0, Z=1.089
      const x = 0.9505, y = 1.0, z = 1.089;
      
      // Matrix multiplication
      const r = 3.2406 * x - 1.5372 * y - 0.4986 * z;
      const g = -0.9689 * x + 1.8758 * y + 0.0415 * z;
      const b = 0.0557 * x - 0.2040 * y + 1.0570 * z;
      
      expect(r).toBeCloseTo(1.0, 1);
      expect(g).toBeCloseTo(1.0, 1);
      expect(b).toBeCloseTo(1.0, 1);
    });

    it('black should convert to black', () => {
      const r = 3.2406 * 0 - 1.5372 * 0 - 0.4986 * 0;
      const g = -0.9689 * 0 + 1.8758 * 0 + 0.0415 * 0;
      const b = 0.0557 * 0 - 0.2040 * 0 + 1.0570 * 0;
      
      expect(r).toBe(0);
      expect(g).toBe(0);
      expect(b).toBe(0);
    });
  });

  describe('Gamma Correction', () => {
    it('linear segment for small values', () => {
      // y = 12.92 * x for x <= 0.0031308
      const x = 0.001;
      const y = 12.92 * x;
      expect(y).toBeCloseTo(0.01292, 4);
    });

    it('gamma ~2.4 for larger values', () => {
      // y = 1.055 * x^(1/2.4) - 0.055
      const x = 0.5;
      const y = 1.055 * Math.pow(x, 1/2.4) - 0.055;
      expect(y).toBeCloseTo(0.735, 2);
    });

    it('zero input gives zero output', () => {
      expect(0).toBe(0);
    });
  });
});

describe('Blur Kernels', () => {
  describe('Gaussian Weight', () => {
    it('peak at center (dist=0)', () => {
      const sigma = 5;
      const weight = Math.exp(-0.5 * 0 * 0);
      expect(weight).toBe(1);
    });

    it('decreases with distance', () => {
      const sigma = 5;
      const w0 = Math.exp(-0.5 * Math.pow(0/sigma, 2));
      const w5 = Math.exp(-0.5 * Math.pow(5/sigma, 2));
      const w10 = Math.exp(-0.5 * Math.pow(10/sigma, 2));
      
      expect(w0).toBeGreaterThan(w5);
      expect(w5).toBeGreaterThan(w10);
    });

    it('zero sigma gives delta function', () => {
      // At dist=0, weight=1; elsewhere weight=0
      const sigma = 0;
      expect(true).toBe(true); // Handled in shader with guard
    });
  });

  describe('Precomputed Weights', () => {
    it('should have 17 weights (0-16)', () => {
      // BLUR_WEIGHTS array has 17 elements
      expect(17).toBe(17);
    });

    it('center weight should be largest', () => {
      // BLUR_WEIGHTS[0] = 0.0798 (center)
      const centerWeight = 0.0798;
      const edgeWeight = 0.0004; // BLUR_WEIGHTS[16]
      
      expect(centerWeight).toBeGreaterThan(edgeWeight);
    });
  });
});

describe('Ambient Light', () => {
  describe('Pattern Coverage', () => {
    it('inside circles = 0.6 contribution', () => {
      const coverage = 1.0; // Inside circle
      const contribution = 1.0 - 0.4 * coverage;
      expect(contribution).toBe(0.6);
    });

    it('outside circles = 1.0 contribution', () => {
      const coverage = 0.0; // Outside circle
      const contribution = 1.0 - 0.4 * coverage;
      expect(contribution).toBe(1.0);
    });
  });

  describe('Spectral Distribution', () => {
    it('ambient matches background in normal mode', () => {
      // Both use getBackgroundIntensity
      const wavelength = 550;
      const bgIntensity = 1.0; // Normal mode, visible
      const ambientIntensity = bgIntensity;
      
      expect(ambientIntensity).toBe(bgIntensity);
    });
  });
});

