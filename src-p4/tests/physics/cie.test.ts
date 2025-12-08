/**
 * Tests for CIE Color Matching Functions
 */
import { describe, it, expect } from 'vitest';
import {
  getCIE_X,
  getCIE_Y,
  getCIE_Z,
  getCIE_XYZ,
  generateCIETextures,
} from '../../core/physics/cie';

describe('CIE Color Matching Functions', () => {
  describe('getCIE_X', () => {
    it('returns 0 outside visible range', () => {
      expect(getCIE_X(300)).toBe(0);
      expect(getCIE_X(800)).toBe(0);
    });
    
    it('returns positive in visible range', () => {
      expect(getCIE_X(500)).toBeGreaterThan(0);
      expect(getCIE_X(600)).toBeGreaterThan(0);
    });
    
    it('peaks around 600nm (red)', () => {
      const peak = getCIE_X(600);
      expect(peak).toBeGreaterThan(getCIE_X(500));
      expect(peak).toBeGreaterThan(getCIE_X(700));
    });
    
    it('interpolates between data points', () => {
      // Data has values at 500nm and 505nm
      const at502 = getCIE_X(502);
      const at500 = getCIE_X(500);
      const at505 = getCIE_X(505);
      
      expect(at502).toBeGreaterThan(Math.min(at500, at505));
      expect(at502).toBeLessThan(Math.max(at500, at505));
    });
  });
  
  describe('getCIE_Y', () => {
    it('returns 0 outside visible range', () => {
      expect(getCIE_Y(300)).toBe(0);
      expect(getCIE_Y(800)).toBe(0);
    });
    
    it('peaks at 555nm (maximum sensitivity)', () => {
      const peak = getCIE_Y(555);
      expect(peak).toBeCloseTo(1.0, 2);
    });
    
    it('Y represents luminous efficiency', () => {
      // Y function matches human eye sensitivity
      expect(getCIE_Y(380)).toBeLessThan(0.01);
      expect(getCIE_Y(700)).toBeLessThan(0.01);
      expect(getCIE_Y(550)).toBeGreaterThan(0.9);
    });
  });
  
  describe('getCIE_Z', () => {
    it('returns 0 outside visible range', () => {
      expect(getCIE_Z(300)).toBe(0);
      expect(getCIE_Z(800)).toBe(0);
    });
    
    it('peaks in blue region (~445nm)', () => {
      const peak = getCIE_Z(445);
      expect(peak).toBeGreaterThan(getCIE_Z(400));
      expect(peak).toBeGreaterThan(getCIE_Z(500));
    });
    
    it('drops to 0 in red region', () => {
      expect(getCIE_Z(650)).toBe(0);
      expect(getCIE_Z(700)).toBe(0);
    });
  });
  
  describe('getCIE_XYZ', () => {
    it('returns array of 3 values', () => {
      const result = getCIE_XYZ(550);
      expect(result).toHaveLength(3);
    });
    
    it('matches individual function calls', () => {
      const wavelength = 550;
      const [x, y, z] = getCIE_XYZ(wavelength);
      
      expect(x).toBe(getCIE_X(wavelength));
      expect(y).toBe(getCIE_Y(wavelength));
      expect(z).toBe(getCIE_Z(wavelength));
    });
    
    it('returns [0,0,0] outside visible range', () => {
      const [x, y, z] = getCIE_XYZ(800);
      expect(x).toBe(0);
      expect(y).toBe(0);
      expect(z).toBe(0);
    });
  });
  
  describe('generateCIETextures', () => {
    it('returns textures of correct length', () => {
      const result = generateCIETextures(380, 700, 100);
      
      expect(result.x.length).toBe(100);
      expect(result.y.length).toBe(100);
      expect(result.z.length).toBe(100);
    });
    
    it('returns normalized values (0-1)', () => {
      const result = generateCIETextures(380, 700, 100);
      
      for (let i = 0; i < 100; i++) {
        expect(result.x[i]).toBeGreaterThanOrEqual(0);
        expect(result.x[i]).toBeLessThanOrEqual(1);
        expect(result.y[i]).toBeGreaterThanOrEqual(0);
        expect(result.y[i]).toBeLessThanOrEqual(1);
        expect(result.z[i]).toBeGreaterThanOrEqual(0);
        expect(result.z[i]).toBeLessThanOrEqual(1);
      }
    });
    
    it('provides scale factors for denormalization', () => {
      const result = generateCIETextures(380, 700, 100);
      
      expect(result.scales.x).toBeGreaterThan(0);
      expect(result.scales.y).toBeGreaterThan(0);
      expect(result.scales.z).toBeGreaterThan(0);
    });
    
    it('max Y scale is approximately 1.0 (at 555nm)', () => {
      const result = generateCIETextures(380, 700, 321);
      // Resolution 321 gives us steps of 1nm
      
      // Y peaks at 1.0 at 555nm
      expect(result.scales.y).toBeCloseTo(1.0, 1);
    });
  });
});



