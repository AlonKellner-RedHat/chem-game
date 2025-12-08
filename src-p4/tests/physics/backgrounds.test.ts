/**
 * Tests for Background Illumination Modes
 */
import { describe, it, expect } from 'vitest';
import {
  getNormalBackgroundIntensity,
  getUVBackgroundIntensity,
  getDarkBackgroundIntensity,
  getBackgroundIntensity,
  generateBackgroundSpectrum,
} from '../../core/physics/backgrounds';

describe('Background Illumination', () => {
  describe('getNormalBackgroundIntensity', () => {
    it('returns 1.0 in visible range (380-700nm)', () => {
      expect(getNormalBackgroundIntensity(380)).toBe(1.0);
      expect(getNormalBackgroundIntensity(500)).toBe(1.0);
      expect(getNormalBackgroundIntensity(700)).toBe(1.0);
    });
    
    it('returns 0 at 250nm and below', () => {
      expect(getNormalBackgroundIntensity(250)).toBe(0);
      expect(getNormalBackgroundIntensity(200)).toBe(0);
    });
    
    it('returns 0 at 850nm and above', () => {
      expect(getNormalBackgroundIntensity(850)).toBe(0);
      expect(getNormalBackgroundIntensity(1000)).toBe(0);
    });
    
    it('fades smoothly in UV range (250-380nm)', () => {
      const at250 = getNormalBackgroundIntensity(250);
      const at315 = getNormalBackgroundIntensity(315);
      const at380 = getNormalBackgroundIntensity(380);
      
      expect(at250).toBe(0);
      expect(at315).toBeGreaterThan(0);
      expect(at315).toBeLessThan(1);
      expect(at380).toBe(1);
    });
    
    it('fades smoothly in IR range (700-850nm)', () => {
      const at700 = getNormalBackgroundIntensity(700);
      const at775 = getNormalBackgroundIntensity(775);
      const at850 = getNormalBackgroundIntensity(850);
      
      expect(at700).toBe(1);
      expect(at775).toBeGreaterThan(0);
      expect(at775).toBeLessThan(1);
      expect(at850).toBe(0);
    });
  });
  
  describe('getUVBackgroundIntensity', () => {
    it('returns 0 below 200nm', () => {
      expect(getUVBackgroundIntensity(150)).toBe(0);
      expect(getUVBackgroundIntensity(199)).toBe(0);
    });
    
    it('returns 1.0 in peak UV range (250-350nm)', () => {
      expect(getUVBackgroundIntensity(250)).toBe(1.0);
      expect(getUVBackgroundIntensity(300)).toBe(1.0);
      expect(getUVBackgroundIntensity(350)).toBe(1.0);
    });
    
    it('returns 0 at 450nm and above', () => {
      expect(getUVBackgroundIntensity(450)).toBe(0);
      expect(getUVBackgroundIntensity(500)).toBe(0);
    });
    
    it('fades in from 200-250nm', () => {
      const at200 = getUVBackgroundIntensity(200);
      const at225 = getUVBackgroundIntensity(225);
      const at250 = getUVBackgroundIntensity(250);
      
      expect(at200).toBe(0);
      expect(at225).toBeGreaterThan(0);
      expect(at225).toBeLessThan(1);
      expect(at250).toBe(1);
    });
    
    it('fades out from 350-450nm', () => {
      const at350 = getUVBackgroundIntensity(350);
      const at400 = getUVBackgroundIntensity(400);
      const at450 = getUVBackgroundIntensity(450);
      
      expect(at350).toBe(1);
      expect(at400).toBeGreaterThan(0);
      expect(at400).toBeLessThan(1);
      expect(at450).toBe(0);
    });
  });
  
  describe('getDarkBackgroundIntensity', () => {
    it('always returns 0', () => {
      expect(getDarkBackgroundIntensity(200)).toBe(0);
      expect(getDarkBackgroundIntensity(500)).toBe(0);
      expect(getDarkBackgroundIntensity(1000)).toBe(0);
    });
  });
  
  describe('getBackgroundIntensity', () => {
    it('dispatches to correct mode function', () => {
      expect(getBackgroundIntensity(500, 'normal')).toBe(1.0);
      expect(getBackgroundIntensity(500, 'uv')).toBe(0);
      expect(getBackgroundIntensity(500, 'dark')).toBe(0);
      
      expect(getBackgroundIntensity(300, 'normal')).toBeGreaterThan(0);
      expect(getBackgroundIntensity(300, 'uv')).toBe(1.0);
      expect(getBackgroundIntensity(300, 'dark')).toBe(0);
    });
  });
  
  describe('generateBackgroundSpectrum', () => {
    it('returns array of correct length', () => {
      const spectrum = generateBackgroundSpectrum('normal', 200, 1000, 100);
      expect(spectrum.length).toBe(100);
    });
    
    it('matches getBackgroundIntensity at sample points', () => {
      const spectrum = generateBackgroundSpectrum('normal', 200, 1000, 9);
      // 9 samples: 200, 300, 400, 500, 600, 700, 800, 900, 1000
      
      expect(spectrum[0]).toBe(getBackgroundIntensity(200, 'normal'));
      expect(spectrum[4]).toBe(getBackgroundIntensity(600, 'normal'));
      expect(spectrum[8]).toBe(getBackgroundIntensity(1000, 'normal'));
    });
    
    it('works with different modes', () => {
      const normal = generateBackgroundSpectrum('normal', 380, 700, 3);
      const uv = generateBackgroundSpectrum('uv', 380, 700, 3);
      const dark = generateBackgroundSpectrum('dark', 380, 700, 3);
      
      // Normal should be all 1.0 in visible
      expect(normal[1]).toBe(1.0);
      
      // UV should be 0 in visible
      expect(uv[1]).toBe(0);
      
      // Dark should be all 0
      expect(dark[0]).toBe(0);
      expect(dark[1]).toBe(0);
      expect(dark[2]).toBe(0);
    });
  });
});



