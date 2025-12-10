/**
 * Tests for Planck's Law implementation
 */
import { describe, it, expect } from 'vitest';
import {
  getPlanckRadiance,
  getRawPlanckRadiance,
  getWienPeakWavelength,
  hasVisibleEmission,
} from '../../core/physics/planck';
import { DRAPER_POINT, D65_TEMPERATURE } from '../../core/physics/constants';

describe('Planck\'s Law', () => {
  describe('getRawPlanckRadiance', () => {
    it('returns 0 for zero temperature', () => {
      expect(getRawPlanckRadiance(500, 0)).toBe(0);
    });
    
    it('returns 0 for zero wavelength', () => {
      expect(getRawPlanckRadiance(0, 3000)).toBe(0);
    });
    
    it('returns positive value for valid inputs', () => {
      const result = getRawPlanckRadiance(500, 5000);
      expect(result).toBeGreaterThan(0);
    });
    
    it('intensity increases with temperature', () => {
      const low = getRawPlanckRadiance(500, 3000);
      const high = getRawPlanckRadiance(500, 6000);
      expect(high).toBeGreaterThan(low);
    });
    
    it('peak shifts to shorter wavelengths at higher temperatures', () => {
      // At 3000K, peak is around 966nm
      // At 6000K, peak is around 483nm
      const lowTempPeak = getRawPlanckRadiance(966, 3000);
      const highTempPeak = getRawPlanckRadiance(483, 6000);
      
      // Both should be near their respective peaks
      expect(lowTempPeak).toBeGreaterThan(getRawPlanckRadiance(500, 3000));
      expect(highTempPeak).toBeGreaterThan(getRawPlanckRadiance(900, 6000));
    });
  });
  
  describe('getPlanckRadiance (normalized)', () => {
    it('returns 0 below Draper point', () => {
      expect(getPlanckRadiance(500, 700)).toBe(0);
      expect(getPlanckRadiance(500, DRAPER_POINT - 1)).toBe(0);
    });
    
    it('returns positive value at Draper point', () => {
      const result = getPlanckRadiance(500, DRAPER_POINT);
      expect(result).toBeGreaterThan(0);
    });
    
    it('normalizes to approximately 1.0 at D65 reference', () => {
      // At 6500K, 550nm should be close to 1.0
      const result = getPlanckRadiance(550, D65_TEMPERATURE);
      expect(result).toBeCloseTo(1.0, 1);
    });
    
    it('returns less than 1.0 for lower temperatures', () => {
      const result = getPlanckRadiance(550, 4000);
      expect(result).toBeLessThan(1.0);
    });
    
    it('returns greater than 1.0 for higher temperatures', () => {
      const result = getPlanckRadiance(550, 10000);
      expect(result).toBeGreaterThan(1.0);
    });
  });
  
  describe('getWienPeakWavelength', () => {
    it('returns Infinity for zero temperature', () => {
      expect(getWienPeakWavelength(0)).toBe(Infinity);
    });
    
    it('returns ~500nm for 5796K (sun surface)', () => {
      const peak = getWienPeakWavelength(5796);
      expect(peak).toBeCloseTo(500, -1); // Within 10nm
    });
    
    it('returns ~966nm for 3000K', () => {
      const peak = getWienPeakWavelength(3000);
      expect(peak).toBeCloseTo(966, -1);
    });
    
    it('peak wavelength decreases with increasing temperature', () => {
      const lowT = getWienPeakWavelength(3000);
      const highT = getWienPeakWavelength(6000);
      expect(highT).toBeLessThan(lowT);
    });
  });
  
  describe('hasVisibleEmission', () => {
    it('returns false below Draper point', () => {
      expect(hasVisibleEmission(700)).toBe(false);
      expect(hasVisibleEmission(797)).toBe(false);
    });
    
    it('returns true at Draper point', () => {
      expect(hasVisibleEmission(DRAPER_POINT)).toBe(true);
    });
    
    it('returns true above Draper point', () => {
      expect(hasVisibleEmission(1000)).toBe(true);
      expect(hasVisibleEmission(5000)).toBe(true);
    });
  });
});




