/**
 * Tests for Spectrum Integration
 */
import { describe, it, expect } from 'vitest';
import {
  integrateToXYZ,
  fastIntegrateToXYZ,
  generateD65Spectrum,
} from '../../core/physics/integration';

describe('Spectrum Integration', () => {
  describe('integrateToXYZ', () => {
    it('returns [0,0,0] for empty spectrum', () => {
      const result = integrateToXYZ(new Float32Array(0), 380, 700);
      expect(result).toEqual([0, 0, 0]);
    });
    
    it('returns [0,0,0] for all-zero spectrum', () => {
      const spectrum = new Float32Array(100).fill(0);
      const result = integrateToXYZ(spectrum, 380, 700);
      expect(result).toEqual([0, 0, 0]);
    });
    
    it('returns positive values for uniform spectrum', () => {
      const spectrum = new Float32Array(100).fill(1.0);
      const [x, y, z] = integrateToXYZ(spectrum, 380, 700);
      
      expect(x).toBeGreaterThan(0);
      expect(y).toBeGreaterThan(0);
      expect(z).toBeGreaterThan(0);
    });
    
    it('Y is larger than X for uniform visible spectrum', () => {
      const spectrum = new Float32Array(100).fill(1.0);
      const [x, y, z] = integrateToXYZ(spectrum, 380, 700);
      
      // Y represents luminance, integrates to large value
      // Note: Z can be slightly larger than Y for uniform spectrum
      // because z-bar has a sharp peak in blue
      expect(y).toBeGreaterThan(x);
      // Just verify all are positive
      expect(z).toBeGreaterThan(0);
    });
    
    it('handles spectrum outside visible range', () => {
      // UV-only spectrum (200-350nm)
      const spectrum = new Float32Array(100).fill(1.0);
      const [x, y, z] = integrateToXYZ(spectrum, 200, 350);
      
      // UV is below visible, should contribute 0
      expect(x).toBe(0);
      expect(y).toBe(0);
      expect(z).toBe(0);
    });
    
    it('accepts regular arrays', () => {
      const spectrum = Array(100).fill(1.0);
      const result = integrateToXYZ(spectrum, 380, 700);
      
      expect(result).toHaveLength(3);
      expect(result[1]).toBeGreaterThan(0);
    });
  });
  
  describe('fastIntegrateToXYZ', () => {
    it('returns [0,0,0] for zero intensity function', () => {
      const result = fastIntegrateToXYZ(() => 0, 16);
      expect(result).toEqual([0, 0, 0]);
    });
    
    it('returns positive values for uniform function', () => {
      const [x, y, z] = fastIntegrateToXYZ(() => 1.0, 16);
      
      expect(x).toBeGreaterThan(0);
      expect(y).toBeGreaterThan(0);
      expect(z).toBeGreaterThan(0);
    });
    
    it('matches integrateToXYZ for same input (approximately)', () => {
      const spectrum = new Float32Array(16);
      for (let i = 0; i < 16; i++) {
        spectrum[i] = 1.0;
      }
      
      const arrayResult = integrateToXYZ(spectrum, 380, 700);
      const funcResult = fastIntegrateToXYZ(() => 1.0, 16);
      
      // Should be in the same ballpark
      expect(funcResult[1]).toBeCloseTo(arrayResult[1], 0);
    });
    
    it('handles wavelength-dependent function', () => {
      // Function that peaks at 550nm
      const result = fastIntegrateToXYZ((wavelength) => {
        return Math.exp(-Math.pow((wavelength - 550) / 50, 2));
      }, 32);
      
      expect(result[1]).toBeGreaterThan(0); // Should have luminance
    });
  });
  
  describe('generateD65Spectrum', () => {
    it('returns array of correct length', () => {
      const spectrum = generateD65Spectrum(100, 1000, 100);
      expect(spectrum.length).toBe(100);
    });
    
    it('returns 1.0 in visible range', () => {
      const spectrum = generateD65Spectrum(380, 700, 100);
      
      // All values in visible range should be 1.0
      for (let i = 0; i < 100; i++) {
        expect(spectrum[i]).toBe(1.0);
      }
    });
    
    it('fades in UV region', () => {
      const spectrum = generateD65Spectrum(200, 400, 101);
      // Index 0 = 200nm, Index 100 = 400nm
      
      // Near 200nm should be low
      expect(spectrum[0]).toBeLessThan(0.5);
      
      // Near 380nm should be close to 1.0
      expect(spectrum[90]).toBeCloseTo(1.0, 0);
    });
    
    it('fades in IR region', () => {
      const spectrum = generateD65Spectrum(700, 1000, 101);
      // Index 0 = 700nm, Index 100 = 1000nm
      
      // At 700nm should be 1.0
      expect(spectrum[0]).toBe(1.0);
      
      // Near 1000nm should be low
      expect(spectrum[100]).toBeLessThan(0.5);
    });
  });
});

