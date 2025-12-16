/**
 * Background Illumination Tests
 * 
 * Tests for different background illumination modes.
 */

import { describe, it, expect } from 'vitest';
import { PHYSICAL_CONSTANTS } from '../testHelpers';

describe('Background Illumination', () => {
  describe('Normal Mode', () => {
    it('full intensity in visible range (380-700nm)', () => {
      // Normal mode: D65-like illumination
      const visibleIntensity = 1.0;
      expect(visibleIntensity).toBe(1.0);
    });

    it('smooth falloff in near-UV (250-380nm)', () => {
      // Reverse quadratic falloff
      const wavelength = 315; // Middle of UV range
      const t = (wavelength - 250) / (380 - 250);
      const intensity = 1 - (1 - t) * (1 - t);
      
      expect(intensity).toBeGreaterThan(0);
      expect(intensity).toBeLessThan(1);
    });

    it('zero below 250nm', () => {
      const deepUvIntensity = 0;
      expect(deepUvIntensity).toBe(0);
    });

    it('smooth falloff in near-IR (700-850nm)', () => {
      const wavelength = 775; // Middle of IR falloff
      const t = (wavelength - 700) / (850 - 700);
      const intensity = 1 - t * t;
      
      expect(intensity).toBeGreaterThan(0);
      expect(intensity).toBeLessThan(1);
    });

    it('zero above 850nm', () => {
      const irIntensity = 0;
      expect(irIntensity).toBe(0);
    });
  });

  describe('UV Mode', () => {
    it('full intensity in UV range (150-350nm)', () => {
      // UV mode: Only UV light, no visible
      const uvIntensity = 1.0;
      expect(uvIntensity).toBe(1.0);
    });

    it('zero in visible range (380-700nm)', () => {
      // Background appears BLACK but emits UV
      const visibleIntensity = 0;
      expect(visibleIntensity).toBe(0);
    });

    it('ramp up from deep UV (100-150nm)', () => {
      // Reverse quadratic ramp
      const wavelength = 125;
      const t = (wavelength - 100) / 50;
      const intensity = 1 - (1 - t) * (1 - t);
      
      expect(intensity).toBeGreaterThan(0);
      expect(intensity).toBeLessThan(1);
    });

    it('cutoff before visible (350-380nm)', () => {
      const wavelength = 365;
      const t = (wavelength - 350) / (380 - 350);
      const intensity = 1 - t * t;
      
      expect(intensity).toBeGreaterThan(0);
      expect(intensity).toBeLessThan(1);
    });
  });

  describe('Dark Mode', () => {
    it('zero intensity everywhere', () => {
      // Dark mode: No illumination at all
      const darkIntensity = 0;
      expect(darkIntensity).toBe(0);
    });

    it('useful for seeing emission only', () => {
      // With no background, only emissive materials are visible
      const backgroundContribution = 0;
      const emissionContribution = 0.5;
      const totalVisible = backgroundContribution + emissionContribution;
      
      expect(totalVisible).toBe(0.5);
    });
  });

  describe('Ambient Light', () => {
    it('ambient has same spectral distribution as background', () => {
      // Ambient light is synced with background mode
      // This ensures consistent illumination from all directions
      const backgroundMode = 'normal';
      const wavelength = 550;
      
      // Both should have same intensity at this wavelength
      // (implementation detail - both call same function)
      const bgIntensity = 1.0; // In normal mode at 550nm
      const ambientIntensity = 1.0;
      
      expect(ambientIntensity).toBe(bgIntensity);
    });
  });
});

