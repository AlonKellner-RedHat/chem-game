import { describe, it, expect, beforeEach } from 'vitest';
import { SpectralDemo } from '../../../src/core/demos/SpectralDemo';

describe('Background Distribution Fadeout', () => {
  let demo: SpectralDemo;

  beforeEach(() => {
    demo = new SpectralDemo();
  });

  describe('visible mode background distribution', () => {
    it('should have full transmission in visible range (380-700nm)', () => {
      // Access the background spectrum through calculateNormalizedColors
      // We'll test the fade factor function behavior indirectly
      const spectrum = (demo as any).calculateUniformBackgroundSpectrum();
      
      // Find points in visible range
      const visible380 = spectrum.find((p: { wavelength: number }) => Math.abs(p.wavelength - 380) < 1);
      const visible550 = spectrum.find((p: { wavelength: number }) => Math.abs(p.wavelength - 550) < 1);
      const visible700 = spectrum.find((p: { wavelength: number }) => Math.abs(p.wavelength - 700) < 1);
      
      expect(visible380).toBeDefined();
      expect(visible550).toBeDefined();
      expect(visible700).toBeDefined();
      
      // Should be close to 1.0 in visible range
      expect(visible380!.transmission).toBeCloseTo(1.0, 2);
      expect(visible550!.transmission).toBeCloseTo(1.0, 2);
      expect(visible700!.transmission).toBeCloseTo(1.0, 2);
    });

    it('should fade from 1.0 at 700nm to near 0 at 850nm (IR fadeout)', () => {
      const spectrum = (demo as any).calculateUniformBackgroundSpectrum();
      
      const at700 = spectrum.find((p: { wavelength: number }) => Math.abs(p.wavelength - 700) < 1);
      const at750 = spectrum.find((p: { wavelength: number }) => Math.abs(p.wavelength - 750) < 1);
      const at800 = spectrum.find((p: { wavelength: number }) => Math.abs(p.wavelength - 800) < 1);
      const at850 = spectrum.find((p: { wavelength: number }) => Math.abs(p.wavelength - 850) < 1);
      const at900 = spectrum.find((p: { wavelength: number }) => Math.abs(p.wavelength - 900) < 1);
      
      expect(at700).toBeDefined();
      expect(at750).toBeDefined();
      expect(at800).toBeDefined();
      expect(at850).toBeDefined();
      expect(at900).toBeDefined();
      
      // Should start at 1.0 at 700nm (visible edge)
      expect(at700!.transmission).toBeCloseTo(1.0, 2);
      
      // Should decay smoothly from 700nm to 850nm
      expect(at750!.transmission).toBeLessThan(at700!.transmission);
      expect(at750!.transmission).toBeGreaterThan(0);
      expect(at800!.transmission).toBeLessThan(at750!.transmission);
      expect(at800!.transmission).toBeGreaterThan(0);
      expect(at850!.transmission).toBeLessThan(at800!.transmission);
      expect(at850!.transmission).toBeCloseTo(0, 1); // Near 0 at fade end
      
      // Should be 0 beyond 850nm
      expect(at900!.transmission).toBe(0);
    });

    it('should fade from 1.0 at 380nm to near 0 at 250nm (UV fadeout)', () => {
      const spectrum = (demo as any).calculateUniformBackgroundSpectrum();
      
      const at250 = spectrum.find((p: { wavelength: number }) => Math.abs(p.wavelength - 250) < 1);
      const at300 = spectrum.find((p: { wavelength: number }) => Math.abs(p.wavelength - 300) < 1);
      const at350 = spectrum.find((p: { wavelength: number }) => Math.abs(p.wavelength - 350) < 1);
      const at380 = spectrum.find((p: { wavelength: number }) => Math.abs(p.wavelength - 380) < 1);
      const at200 = spectrum.find((p: { wavelength: number }) => Math.abs(p.wavelength - 200) < 1);
      
      expect(at250).toBeDefined();
      expect(at300).toBeDefined();
      expect(at350).toBeDefined();
      expect(at380).toBeDefined();
      expect(at200).toBeDefined();
      
      // Should start at 1.0 at 380nm (visible edge)
      expect(at380!.transmission).toBeCloseTo(1.0, 2);
      
      // Should decay smoothly from 380nm to 250nm
      expect(at350!.transmission).toBeLessThan(at380!.transmission);
      expect(at350!.transmission).toBeGreaterThan(0);
      expect(at300!.transmission).toBeLessThan(at350!.transmission);
      expect(at300!.transmission).toBeGreaterThan(0);
      expect(at250!.transmission).toBeLessThan(at300!.transmission);
      expect(at250!.transmission).toBeCloseTo(0, 1); // Near 0 at fade end
      
      // Should be 0 below 250nm
      expect(at200!.transmission).toBe(0);
    });
  });

  describe('UV mode background distribution', () => {
    beforeEach(() => {
      // Enable UV mode
      (demo as any).uvMode = true;
    });

    afterEach(() => {
      (demo as any).uvMode = false;
    });

    it('should have full transmission in peak UV range (250-350nm)', () => {
      const spectrum = (demo as any).calculateUVBackgroundSpectrum();
      
      // UV spectrum: peak at 250-350nm, fades on both ends
      const at280 = spectrum.find((p: { wavelength: number }) => Math.abs(p.wavelength - 280) < 1);
      const at300 = spectrum.find((p: { wavelength: number }) => Math.abs(p.wavelength - 300) < 1);
      const at320 = spectrum.find((p: { wavelength: number }) => Math.abs(p.wavelength - 320) < 1);
      
      expect(at280).toBeDefined();
      expect(at300).toBeDefined();
      expect(at320).toBeDefined();
      
      // Should be 1.0 in peak UV range (250-350nm)
      expect(at280!.transmission).toBeCloseTo(1.0, 2);
      expect(at300!.transmission).toBeCloseTo(1.0, 2);
      expect(at320!.transmission).toBeCloseTo(1.0, 2);
    });

    it('should fade from 1.0 at 350nm to near 0 at 450nm (UV background fadeout)', () => {
      const spectrum = (demo as any).calculateUVBackgroundSpectrum();
      
      // UV fade-out is from 350nm to 450nm
      const at350 = spectrum.find((p: { wavelength: number }) => Math.abs(p.wavelength - 350) < 1);
      const at380 = spectrum.find((p: { wavelength: number }) => Math.abs(p.wavelength - 380) < 1);
      const at410 = spectrum.find((p: { wavelength: number }) => Math.abs(p.wavelength - 410) < 1);
      const at450 = spectrum.find((p: { wavelength: number }) => Math.abs(p.wavelength - 450) < 1);
      const at500 = spectrum.find((p: { wavelength: number }) => Math.abs(p.wavelength - 500) < 1);
      
      expect(at350).toBeDefined();
      expect(at380).toBeDefined();
      expect(at410).toBeDefined();
      expect(at450).toBeDefined();
      expect(at500).toBeDefined();
      
      // Should start at 1.0 at 350nm (peak UV edge)
      expect(at350!.transmission).toBeCloseTo(1.0, 2);
      
      // Should decay smoothly from 350nm to 450nm
      expect(at380!.transmission).toBeLessThan(at350!.transmission);
      expect(at380!.transmission).toBeGreaterThan(0);
      expect(at410!.transmission).toBeLessThan(at380!.transmission);
      expect(at410!.transmission).toBeGreaterThan(0);
      expect(at450!.transmission).toBeCloseTo(0, 1); // Near 0 at fade end
      
      // Should be 0 beyond 450nm
      expect(at500!.transmission).toBeCloseTo(0, 1);
    });
  });
});

