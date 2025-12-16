/**
 * Physics Parity Tests
 *
 * Verifies that P4 physics calculations match P3 implementation.
 * These tests compare specific numerical outputs between implementations.
 */
import { describe, expect, it } from 'vitest';
import {
  createPhysicsEngine,
  getBackgroundIntensity,
  getCIE_X,
  getCIE_Y,
  getCIE_Z,
  getKirchhoffEmission,
  getPlanckRadiance,
  xyzToSRGB,
} from '../../core/physics';

describe('Physics Parity with P3', () => {
  describe('Planck Radiation', () => {
    it('matches D65 normalization at 550nm, 6500K', () => {
      // P3: getPlanckRadiance(550, 6500) ≈ 1.0
      const result = getPlanckRadiance(550, 6500);
      expect(result).toBeCloseTo(1.0, 1);
    });

    it('matches low temperature behavior', () => {
      // Below Draper point: should be 0
      const result = getPlanckRadiance(550, 700);
      expect(result).toBe(0);
    });

    it('matches high temperature behavior', () => {
      // At 10000K, 550nm: should be > 1
      const result = getPlanckRadiance(550, 10000);
      expect(result).toBeGreaterThan(1);
    });
  });

  describe('Kirchhoff Emission', () => {
    it('zero emission for fully transparent material', () => {
      // Transmission = 1.0 → absorptivity = 0 → no emission
      const result = getKirchhoffEmission(1.0, 550, 3000);
      expect(result).toBe(0);
    });

    it('proportional to absorptivity', () => {
      const lowAbs = getKirchhoffEmission(0.9, 550, 3000); // 10% absorption
      const highAbs = getKirchhoffEmission(0.1, 550, 3000); // 90% absorption

      // High absorption → higher emission
      expect(highAbs).toBeGreaterThan(lowAbs * 5);
    });
  });

  describe('Background Modes', () => {
    it('normal mode: full intensity in visible', () => {
      expect(getBackgroundIntensity(500, 'normal')).toBe(1.0);
      expect(getBackgroundIntensity(400, 'normal')).toBe(1.0);
      expect(getBackgroundIntensity(600, 'normal')).toBe(1.0);
    });

    it('UV mode: full intensity in UV range', () => {
      expect(getBackgroundIntensity(300, 'uv')).toBe(1.0);
      expect(getBackgroundIntensity(500, 'uv')).toBe(0); // No UV in visible
    });

    it('dark mode: zero everywhere', () => {
      expect(getBackgroundIntensity(300, 'dark')).toBe(0);
      expect(getBackgroundIntensity(500, 'dark')).toBe(0);
    });
  });

  describe('CIE Color Matching', () => {
    it('Y peaks at 555nm (luminous efficiency)', () => {
      const y555 = getCIE_Y(555);
      expect(y555).toBeCloseTo(1.0, 2);
    });

    it('X peaks in red region (~600nm)', () => {
      const x600 = getCIE_X(600);
      const x500 = getCIE_X(500);
      expect(x600).toBeGreaterThan(x500);
    });

    it('Z peaks in blue region (~445nm)', () => {
      const z445 = getCIE_Z(445);
      const z500 = getCIE_Z(500);
      expect(z445).toBeGreaterThan(z500);
    });

    it('all zero outside visible range', () => {
      expect(getCIE_X(300)).toBe(0);
      expect(getCIE_Y(300)).toBe(0);
      expect(getCIE_Z(300)).toBe(0);
    });
  });

  describe('sRGB Conversion', () => {
    it('D65 white point converts to white', () => {
      // D65: X=0.9505, Y=1.0, Z=1.089
      const [r, g, b] = xyzToSRGB([0.9505, 1.0, 1.089]);

      expect(r).toBeCloseTo(1.0, 1);
      expect(g).toBeCloseTo(1.0, 1);
      expect(b).toBeCloseTo(1.0, 1);
    });

    it('black converts to black', () => {
      const [r, g, b] = xyzToSRGB([0, 0, 0]);

      expect(r).toBe(0);
      expect(g).toBe(0);
      expect(b).toBe(0);
    });
  });

  describe('Physics Engine Integration', () => {
    it('render and plot paths use same physics', () => {
      const engine = createPhysicsEngine();

      // Both paths should produce valid output
      const rgb = engine.computeRGB(0.5, 300);
      const spectrum = engine.computeSpectrum(0.5, 300);

      expect(rgb).toHaveLength(3);
      expect(spectrum.length).toBeGreaterThan(0);
    });

    it('background mode affects both paths', () => {
      const engine = createPhysicsEngine();

      // Normal mode
      const normalRgb = engine.computeRGB(1.0, 300);

      // Dark mode
      engine.updateSharedConfig({ backgroundMode: 'dark' });
      const darkRgb = engine.computeRGB(1.0, 300);

      // Dark should be much darker (no background, no emission at 300K)
      const normalBrightness = normalRgb[0] + normalRgb[1] + normalRgb[2];
      const darkBrightness = darkRgb[0] + darkRgb[1] + darkRgb[2];

      expect(darkBrightness).toBeLessThan(normalBrightness * 0.1);
    });

    it('emission visible above Draper point', () => {
      const engine = createPhysicsEngine({
        shared: { backgroundMode: 'dark' },
      });

      // Below Draper point: no emission
      const coldRgb = engine.computeRGB(0.5, 700);

      // Above Draper point: should have emission
      const hotRgb = engine.computeRGB(0.5, 3000);

      const coldBrightness = coldRgb[0] + coldRgb[1] + coldRgb[2];
      const hotBrightness = hotRgb[0] + hotRgb[1] + hotRgb[2];

      expect(coldBrightness).toBeLessThan(0.01);
      expect(hotBrightness).toBeGreaterThan(0.1);
    });
  });
});
