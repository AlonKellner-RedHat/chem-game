/**
 * Tests for UnifiedSpectralPhysics - the GLSL physics functions
 * 
 * These tests verify the TypeScript reference implementation that mirrors
 * the GLSL shader code. The GLSL shader MUST produce identical results.
 * 
 * Physics functions tested:
 * - planckRadiance(wavelength, temperature): D65-normalized black body radiation
 * - kirchhoffEmission(transmission, wavelength, temperature): emission via Kirchhoff's law
 * - getBackgroundIntensity(wavelength, mode): background illumination
 * - getAuraIntensity(distance, radius, decay): emission aura falloff
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  UnifiedSpectralPhysics,
  BackgroundMode,
} from '../../../../src/core/spectral/shaders/UnifiedSpectralPhysics';

describe('UnifiedSpectralPhysics', () => {
  let physics: UnifiedSpectralPhysics;

  beforeEach(() => {
    physics = new UnifiedSpectralPhysics();
  });

  describe('planckRadiance (D65-normalized)', () => {
    it('should return ~1.0 at 6500K, 550nm (D65 reference)', () => {
      const intensity = physics.planckRadiance(550, 6500);
      expect(intensity).toBeCloseTo(1.0, 1);
    });

    it('should return < 1.0 at 2000K, 550nm (cooler than D65)', () => {
      const intensity = physics.planckRadiance(550, 2000);
      expect(intensity).toBeLessThan(1.0);
      expect(intensity).toBeGreaterThan(0); // Should still emit
    });

    it('should return > 1.0 at 10000K, 550nm (hotter than D65)', () => {
      const intensity = physics.planckRadiance(550, 10000);
      expect(intensity).toBeGreaterThan(1.0);
    });

    it('should return 0 below Draper point (798K)', () => {
      const intensity = physics.planckRadiance(550, 700);
      expect(intensity).toBe(0);
    });

    it('should show red > green > blue pattern at low temperatures', () => {
      const temp = 2000;
      const red = physics.planckRadiance(650, temp);
      const green = physics.planckRadiance(550, temp);
      const blue = physics.planckRadiance(450, temp);
      
      expect(red).toBeGreaterThan(green);
      expect(green).toBeGreaterThan(blue);
    });

    it('should show blue > red pattern at very high temperatures', () => {
      const temp = 15000;
      const red = physics.planckRadiance(650, temp);
      const blue = physics.planckRadiance(450, temp);
      
      expect(blue).toBeGreaterThan(red);
    });
  });

  describe('kirchhoffEmission', () => {
    it('should return 0 when transmission is 1.0 (transparent)', () => {
      const emission = physics.kirchhoffEmission(1.0, 550, 6500);
      expect(emission).toBe(0);
    });

    it('should equal planckRadiance when transmission is 0 (opaque)', () => {
      const emission = physics.kirchhoffEmission(0.0, 550, 6500);
      const planck = physics.planckRadiance(550, 6500);
      expect(emission).toBeCloseTo(planck, 5);
    });

    it('should be proportional to absorptivity', () => {
      const temp = 6500;
      const wl = 550;
      
      const emission50 = physics.kirchhoffEmission(0.5, wl, temp);
      const emissionFull = physics.kirchhoffEmission(0.0, wl, temp);
      
      // 50% transmission = 50% absorptivity = 50% emission
      expect(emission50).toBeCloseTo(emissionFull * 0.5, 5);
    });

    it('should return 0 below Draper point regardless of absorptivity', () => {
      const emission = physics.kirchhoffEmission(0.0, 550, 700);
      expect(emission).toBe(0);
    });

    it('should produce visible emission at 2000K with high absorption', () => {
      const emission = physics.kirchhoffEmission(0.0, 550, 2000);
      expect(emission).toBeGreaterThan(0);
    });
  });

  describe('getBackgroundIntensity', () => {
    describe('normal mode (D65 white)', () => {
      it('should return 1.0 at 550nm (peak visible)', () => {
        const intensity = physics.getBackgroundIntensity(550, BackgroundMode.Normal);
        expect(intensity).toBe(1.0);
      });

      it('should return 1.0 at 380nm (visible edge)', () => {
        const intensity = physics.getBackgroundIntensity(380, BackgroundMode.Normal);
        expect(intensity).toBe(1.0);
      });

      it('should return 1.0 at 700nm (visible edge)', () => {
        const intensity = physics.getBackgroundIntensity(700, BackgroundMode.Normal);
        expect(intensity).toBe(1.0);
      });

      it('should fade towards 0 in UV (< 380nm)', () => {
        const at350 = physics.getBackgroundIntensity(350, BackgroundMode.Normal);
        const at300 = physics.getBackgroundIntensity(300, BackgroundMode.Normal);
        const at250 = physics.getBackgroundIntensity(250, BackgroundMode.Normal);
        
        expect(at350).toBeLessThan(1.0);
        expect(at300).toBeLessThan(at350);
        expect(at250).toBeLessThanOrEqual(at300);
      });

      it('should fade towards 0 in IR (> 700nm)', () => {
        const at750 = physics.getBackgroundIntensity(750, BackgroundMode.Normal);
        const at800 = physics.getBackgroundIntensity(800, BackgroundMode.Normal);
        const at850 = physics.getBackgroundIntensity(850, BackgroundMode.Normal);
        
        expect(at750).toBeLessThan(1.0);
        expect(at800).toBeLessThan(at750);
        expect(at850).toBeLessThanOrEqual(at800);
      });
    });

    describe('UV mode', () => {
      it('should return 1.0 at 300nm (peak UV)', () => {
        const intensity = physics.getBackgroundIntensity(300, BackgroundMode.UV);
        expect(intensity).toBe(1.0);
      });

      it('should return 0 at 550nm (visible)', () => {
        const intensity = physics.getBackgroundIntensity(550, BackgroundMode.UV);
        expect(intensity).toBe(0);
      });

      it('should fade from UV to visible (350-450nm)', () => {
        const at350 = physics.getBackgroundIntensity(350, BackgroundMode.UV);
        const at400 = physics.getBackgroundIntensity(400, BackgroundMode.UV);
        const at450 = physics.getBackgroundIntensity(450, BackgroundMode.UV);
        
        expect(at350).toBe(1.0);
        expect(at400).toBeLessThan(1.0);
        expect(at400).toBeGreaterThan(0);
        expect(at450).toBe(0);
      });

      it('should fade in at short wavelengths (200-250nm)', () => {
        const at200 = physics.getBackgroundIntensity(200, BackgroundMode.UV);
        const at225 = physics.getBackgroundIntensity(225, BackgroundMode.UV);
        const at250 = physics.getBackgroundIntensity(250, BackgroundMode.UV);
        
        expect(at200).toBe(0);
        expect(at225).toBeGreaterThan(0);
        expect(at250).toBe(1.0);
      });
    });

    describe('dark mode', () => {
      it('should return 0 at all wavelengths', () => {
        expect(physics.getBackgroundIntensity(300, BackgroundMode.Dark)).toBe(0);
        expect(physics.getBackgroundIntensity(450, BackgroundMode.Dark)).toBe(0);
        expect(physics.getBackgroundIntensity(550, BackgroundMode.Dark)).toBe(0);
        expect(physics.getBackgroundIntensity(650, BackgroundMode.Dark)).toBe(0);
        expect(physics.getBackgroundIntensity(800, BackgroundMode.Dark)).toBe(0);
      });
    });
  });

  describe('getAuraIntensity', () => {
    it('should return 1.0 inside shape (distance >= 0)', () => {
      const inside = physics.getAuraIntensity(0, 20, 0.1);
      expect(inside).toBe(1.0);
      
      const deep = physics.getAuraIntensity(10, 20, 0.1);
      expect(deep).toBe(1.0);
    });

    it('should decay exponentially outside shape', () => {
      const radius = 20;
      const decay = 0.1;
      
      const at5 = physics.getAuraIntensity(-5, radius, decay);
      const at10 = physics.getAuraIntensity(-10, radius, decay);
      const at15 = physics.getAuraIntensity(-15, radius, decay);
      
      expect(at5).toBeLessThan(1.0);
      expect(at10).toBeLessThan(at5);
      expect(at15).toBeLessThan(at10);
      
      // Check exponential decay: exp(-decay * distance)
      expect(at5).toBeCloseTo(Math.exp(-decay * 5), 3);
      expect(at10).toBeCloseTo(Math.exp(-decay * 10), 3);
    });

    it('should return 0 beyond aura radius', () => {
      const radius = 20;
      const decay = 0.1;
      
      const beyond = physics.getAuraIntensity(-25, radius, decay);
      expect(beyond).toBe(0);
    });

    it('should handle different decay rates', () => {
      const radius = 50;
      const dist = -10;
      
      const fastDecay = physics.getAuraIntensity(dist, radius, 0.2);
      const slowDecay = physics.getAuraIntensity(dist, radius, 0.05);
      
      expect(fastDecay).toBeLessThan(slowDecay);
    });
  });

  describe('computeSpectrumValue', () => {
    it('should combine background, transmission, and emission correctly', () => {
      const wavelength = 550;
      const transmission = 0.5;
      const temperature = 6500;
      const mode = BackgroundMode.Normal;
      
      const result = physics.computeSpectrumValue(
        wavelength,
        transmission,
        temperature,
        mode
      );
      
      // result = background × transmission + emission
      const bg = physics.getBackgroundIntensity(wavelength, mode);
      const emit = physics.kirchhoffEmission(transmission, wavelength, temperature);
      const expected = bg * transmission + emit;
      
      expect(result).toBeCloseTo(expected, 5);
    });

    it('should return only emission in dark mode', () => {
      const wavelength = 550;
      const transmission = 0.5;
      const temperature = 6500;
      
      const result = physics.computeSpectrumValue(
        wavelength,
        transmission,
        temperature,
        BackgroundMode.Dark
      );
      
      // In dark mode, only emission is visible
      const emit = physics.kirchhoffEmission(transmission, wavelength, temperature);
      expect(result).toBeCloseTo(emit, 5);
    });

    it('should return full background for transparent material at room temp', () => {
      const wavelength = 550;
      const transmission = 1.0; // Transparent
      const temperature = 300; // Room temp (no emission)
      
      const result = physics.computeSpectrumValue(
        wavelength,
        transmission,
        temperature,
        BackgroundMode.Normal
      );
      
      const bg = physics.getBackgroundIntensity(wavelength, BackgroundMode.Normal);
      expect(result).toBeCloseTo(bg, 5);
    });
  });

  describe('GLSL compatibility', () => {
    it('should handle edge cases without NaN or Infinity', () => {
      // Zero temperature
      expect(Number.isFinite(physics.planckRadiance(550, 0))).toBe(true);
      
      // Zero wavelength
      expect(Number.isFinite(physics.planckRadiance(0, 6500))).toBe(true);
      
      // Extreme temperature
      expect(Number.isFinite(physics.planckRadiance(550, 100000))).toBe(true);
      
      // Negative inputs (should clamp or return 0)
      expect(Number.isFinite(physics.planckRadiance(-100, 6500))).toBe(true);
      expect(Number.isFinite(physics.planckRadiance(550, -1000))).toBe(true);
    });

    it('should produce consistent results across wavelength range', () => {
      const temp = 5000;
      const wavelengths = [380, 420, 460, 500, 540, 580, 620, 660, 700];
      
      const intensities = wavelengths.map(wl => physics.planckRadiance(wl, temp));
      
      // All values should be finite and non-negative
      intensities.forEach(i => {
        expect(Number.isFinite(i)).toBe(true);
        expect(i).toBeGreaterThanOrEqual(0);
      });
      
      // Should have a smooth curve (no sudden jumps)
      for (let i = 1; i < intensities.length - 1; i++) {
        const diff1 = Math.abs(intensities[i] - intensities[i - 1]);
        const diff2 = Math.abs(intensities[i + 1] - intensities[i]);
        // Adjacent differences should be within reasonable bounds
        expect(diff1).toBeLessThan(intensities[i] * 0.5);
        expect(diff2).toBeLessThan(intensities[i] * 0.5);
      }
    });
  });
});

