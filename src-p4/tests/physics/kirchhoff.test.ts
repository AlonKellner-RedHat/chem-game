/**
 * Tests for Kirchhoff's Law implementation
 */
import { describe, it, expect } from 'vitest';
import {
  getKirchhoffEmission,
  computeSpectrumValue,
  getEmissionOnly,
} from '../../core/physics/kirchhoff';
import { DRAPER_POINT } from '../../core/physics/constants';

describe('Kirchhoff\'s Law', () => {
  describe('getKirchhoffEmission', () => {
    it('returns 0 below Draper point', () => {
      expect(getKirchhoffEmission(0.5, 500, 700)).toBe(0);
    });
    
    it('returns 0 for fully transparent material', () => {
      // transmission = 1.0 means absorptivity = 0
      expect(getKirchhoffEmission(1.0, 500, 3000)).toBe(0);
    });
    
    it('returns positive for absorbing material above Draper point', () => {
      const result = getKirchhoffEmission(0.5, 500, 1500);
      expect(result).toBeGreaterThan(0);
    });
    
    it('emission increases with absorption (lower transmission)', () => {
      const highTrans = getKirchhoffEmission(0.8, 500, 3000);
      const lowTrans = getKirchhoffEmission(0.2, 500, 3000);
      expect(lowTrans).toBeGreaterThan(highTrans);
    });
    
    it('emission increases with temperature', () => {
      const lowTemp = getKirchhoffEmission(0.5, 500, 1500);
      const highTemp = getKirchhoffEmission(0.5, 500, 5000);
      expect(highTemp).toBeGreaterThan(lowTemp);
    });
    
    it('clamps transmission to 0-1 range', () => {
      // transmission > 1 should be treated as 1
      expect(getKirchhoffEmission(1.5, 500, 3000)).toBe(0);
      
      // transmission < 0 should be treated as 0
      const result = getKirchhoffEmission(-0.5, 500, 3000);
      expect(result).toBeGreaterThan(0); // Full absorption
    });
  });
  
  describe('computeSpectrumValue', () => {
    it('returns background * transmission when emission disabled', () => {
      const result = computeSpectrumValue(1.0, 0.5, 500, 300, false);
      expect(result).toBe(0.5); // 1.0 * 0.5
    });
    
    it('adds emission when enabled and above Draper point', () => {
      const withoutEmission = computeSpectrumValue(1.0, 0.5, 500, 3000, false);
      const withEmission = computeSpectrumValue(1.0, 0.5, 500, 3000, true);
      expect(withEmission).toBeGreaterThan(withoutEmission);
    });
    
    it('emission has no effect below Draper point', () => {
      const withoutEmission = computeSpectrumValue(1.0, 0.5, 500, 300, false);
      const withEmission = computeSpectrumValue(1.0, 0.5, 500, 300, true);
      expect(withEmission).toBe(withoutEmission);
    });
    
    it('returns only emission in dark mode (background = 0)', () => {
      const result = computeSpectrumValue(0, 0.5, 500, 3000, true);
      // Should equal emission only
      const emission = getEmissionOnly(0.5, 500, 3000);
      expect(result).toBe(emission);
    });
    
    it('fully transparent material only transmits background', () => {
      const result = computeSpectrumValue(1.0, 1.0, 500, 3000, true);
      expect(result).toBe(1.0); // Full transmission, no emission (absorptivity = 0)
    });
  });
  
  describe('getEmissionOnly', () => {
    it('returns same as getKirchhoffEmission', () => {
      const kirchhoff = getKirchhoffEmission(0.5, 500, 3000);
      const emission = getEmissionOnly(0.5, 500, 3000);
      expect(emission).toBe(kirchhoff);
    });
  });
});




