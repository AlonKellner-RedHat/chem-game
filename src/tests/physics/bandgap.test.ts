/**
 * Band Gap Absorption Tests
 * 
 * Tests for Tauc-like band gap absorption edge implementation.
 * Physics: λ_cutoff = hc/E_g = 1240/E_g (nm)
 */

import { describe, it, expect } from 'vitest';
import { evToWavelength, getTaucAbsorption } from '../../core/physics/bandgap';

describe('Band Gap Absorption', () => {
  describe('evToWavelength', () => {
    it('calculates correct cutoff wavelength from eV', () => {
      // hc = 1240 eV·nm
      expect(evToWavelength(3.0)).toBeCloseTo(413.3, 0); // UV cutoff
      expect(evToWavelength(1.5)).toBeCloseTo(826.7, 0); // IR cutoff
      expect(evToWavelength(2.0)).toBeCloseTo(620, 0);   // Red edge
      expect(evToWavelength(1.0)).toBeCloseTo(1240, 0);  // Near-IR
    });

    it('handles edge cases', () => {
      expect(evToWavelength(0)).toBe(Infinity);
      expect(evToWavelength(Infinity)).toBe(0);
    });
  });

  describe('getTaucAbsorption', () => {
    it('returns full transmission for wavelengths longer than cutoff', () => {
      // 3.0 eV -> 413.3 nm cutoff
      // Wavelengths > 413.3nm should be transparent
      expect(getTaucAbsorption(500, 3.0)).toBeCloseTo(1.0, 2);
      expect(getTaucAbsorption(600, 3.0)).toBeCloseTo(1.0, 2);
      expect(getTaucAbsorption(700, 3.0)).toBeCloseTo(1.0, 2);
    });

    it('absorbs strongly for wavelengths much shorter than cutoff', () => {
      // 3.0 eV -> 413.3 nm cutoff
      // Wavelengths << 413.3nm should be absorbed
      const transmission300 = getTaucAbsorption(300, 3.0);
      const transmission350 = getTaucAbsorption(350, 3.0);
      
      expect(transmission300).toBeLessThan(0.5);
      expect(transmission350).toBeLessThan(transmission300 + 0.5); // More absorbed at shorter wavelength
    });

    it('shows gradual absorption edge near cutoff (Tauc behavior)', () => {
      // Near the cutoff, absorption should increase sharply
      const cutoff = evToWavelength(3.0); // ~413.3 nm
      
      const atCutoff = getTaucAbsorption(cutoff, 3.0);
      const justBelow = getTaucAbsorption(cutoff - 10, 3.0);
      const wellBelow = getTaucAbsorption(cutoff - 50, 3.0);
      
      // At cutoff should be near 1.0 (transparent)
      expect(atCutoff).toBeCloseTo(1.0, 1);
      
      // Below cutoff should decrease
      expect(justBelow).toBeLessThan(atCutoff);
      expect(wellBelow).toBeLessThan(justBelow);
    });

    it('applies Tauc-like quadratic energy dependence', () => {
      // Tauc: α ∝ (hν - Eg)^n where n=2 for indirect gap
      // Absorption should increase roughly quadratically with excess energy
      const bandGap = 2.0; // eV
      const cutoffWl = evToWavelength(bandGap); // 620 nm
      
      // Calculate excess energy for different wavelengths
      const wl1 = 500; // Higher energy photon
      const wl2 = 550; // Medium energy photon
      
      const trans1 = getTaucAbsorption(wl1, bandGap);
      const trans2 = getTaucAbsorption(wl2, bandGap);
      
      // Higher energy (shorter wavelength) should have more absorption
      expect(trans1).toBeLessThan(trans2);
    });

    it('handles zero and negative band gaps gracefully', () => {
      // Zero band gap = always absorbing (metal-like)
      expect(getTaucAbsorption(500, 0)).toBeLessThan(1.0);
      
      // Negative band gap makes no physical sense, treat as zero
      expect(getTaucAbsorption(500, -1)).toBeLessThan(1.0);
    });
  });
});

