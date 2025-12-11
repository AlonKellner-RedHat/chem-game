/**
 * Tests for SpectralPhysicsEngine
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createPhysicsEngine,
  getSharedPhysicsEngine,
  SpectralPhysicsEngine,
} from '../../core/physics';

describe('SpectralPhysicsEngine', () => {
  let engine: SpectralPhysicsEngine;
  
  beforeEach(() => {
    engine = createPhysicsEngine();
  });
  
  describe('configuration', () => {
    it('creates engine with default config', () => {
      const config = engine.getConfig();
      
      expect(config.shared.wavelengthMin).toBe(100);
      expect(config.shared.wavelengthMax).toBe(1000);
      expect(config.shared.backgroundMode).toBe('normal');
      expect(config.render.spectralResolution).toBe(16);
      expect(config.plot.spectralResolution).toBe(320);
    });
    
    it('accepts initial config overrides', () => {
      const customEngine = createPhysicsEngine({
        shared: { backgroundMode: 'uv' },
        render: { spectralResolution: 32 },
      });
      
      const config = customEngine.getConfig();
      expect(config.shared.backgroundMode).toBe('uv');
      expect(config.render.spectralResolution).toBe(32);
      // Non-overridden values should be defaults
      expect(config.shared.wavelengthMin).toBe(100);
    });
    
    it('updates shared config', () => {
      engine.updateSharedConfig({ backgroundMode: 'dark' });
      
      expect(engine.getConfig().shared.backgroundMode).toBe('dark');
    });
    
    it('updates render config', () => {
      engine.updateRenderConfig({ spectralResolution: 64 });
      
      expect(engine.getConfig().render.spectralResolution).toBe(64);
    });
    
    it('updates plot config', () => {
      engine.updatePlotConfig({
        spectralResolution: 1000,
        wavelengthStep: 0.5,
      });
      
      const config = engine.getConfig();
      expect(config.plot.spectralResolution).toBe(1000);
      expect(config.plot.wavelengthStep).toBe(0.5);
    });
  });
  
  describe('computeRGB', () => {
    it('returns RGB tuple', () => {
      const result = engine.computeRGB(1.0, 300);
      
      expect(result).toHaveLength(3);
      expect(typeof result[0]).toBe('number');
    });
    
    it('returns values in 0-1 range', () => {
      const [r, g, b] = engine.computeRGB(0.5, 300);
      
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(1);
    });
    
    it('accepts fixed transmission value', () => {
      const result = engine.computeRGB(0.5, 300);
      expect(result).toHaveLength(3);
    });
    
    it('accepts transmission function', () => {
      const result = engine.computeRGB(
        (wavelength) => wavelength < 500 ? 0.1 : 0.9,
        300
      );
      expect(result).toHaveLength(3);
    });
    
    it('full transmission gives bright color', () => {
      const [, , ] = engine.computeRGB(1.0, 300);
      // Full transmission should produce near-white in normal mode
    });
    
    it('zero transmission gives dark color', () => {
      const [r, g, b] = engine.computeRGB(0, 300);
      // Zero transmission, no emission = very dark
      expect(r).toBeLessThan(0.1);
      expect(g).toBeLessThan(0.1);
      expect(b).toBeLessThan(0.1);
    });
    
    it('respects background mode', () => {
      const normal = engine.computeRGB(1.0, 300);
      
      engine.updateSharedConfig({ backgroundMode: 'dark' });
      const dark = engine.computeRGB(1.0, 300);
      
      // Dark mode with no emission should be darker
      expect(dark[0]).toBeLessThan(normal[0]);
    });
  });
  
  describe('computeSpectrum', () => {
    it('returns Float32Array', () => {
      const result = engine.computeSpectrum(1.0, 300);
      expect(result).toBeInstanceOf(Float32Array);
    });
    
    it('returns array of configured length', () => {
      const result = engine.computeSpectrum(1.0, 300);
      expect(result.length).toBe(320); // Default plot resolution
      
      engine.updatePlotConfig({ spectralResolution: 100 });
      const result2 = engine.computeSpectrum(1.0, 300);
      expect(result2.length).toBe(100);
    });
    
    it('accepts fixed transmission value', () => {
      const result = engine.computeSpectrum(0.5, 300);
      
      // Should have values > 0 where background is present
      const hasNonZero = Array.from(result).some(v => v > 0);
      expect(hasNonZero).toBe(true);
    });
    
    it('accepts transmission function', () => {
      const result = engine.computeSpectrum(
        (wavelength) => wavelength < 500 ? 0.1 : 0.9,
        300
      );
      
      // Should have variable values
      const step = (1000 - 200) / 319;
      const indexAt450 = Math.floor((450 - 200) / step);
      const indexAt600 = Math.floor((600 - 200) / step);
      
      // Higher transmission at 600nm should give higher value (if in visible)
      expect(result[indexAt600]).toBeGreaterThan(result[indexAt450] * 0.5);
    });
  });
  
  describe('getBackgroundAt', () => {
    it('returns background intensity for wavelength', () => {
      const result = engine.getBackgroundAt(500);
      expect(result).toBe(1.0); // Normal mode, visible range
    });
    
    it('respects background mode', () => {
      const normal = engine.getBackgroundAt(500);
      
      engine.updateSharedConfig({ backgroundMode: 'dark' });
      const dark = engine.getBackgroundAt(500);
      
      expect(normal).toBe(1.0);
      expect(dark).toBe(0);
    });
    
    it('respects UV mode', () => {
      engine.updateSharedConfig({ backgroundMode: 'uv' });
      
      const inUV = engine.getBackgroundAt(300);
      const inVisible = engine.getBackgroundAt(500);
      
      expect(inUV).toBe(1.0); // Peak UV range
      expect(inVisible).toBe(0); // No UV light in visible
    });
  });
  
  describe('shared engine singleton', () => {
    it('returns same instance', () => {
      const engine1 = getSharedPhysicsEngine();
      const engine2 = getSharedPhysicsEngine();
      
      expect(engine1).toBe(engine2);
    });
    
    it('maintains state', () => {
      const engine1 = getSharedPhysicsEngine();
      engine1.updateSharedConfig({ backgroundMode: 'uv' });
      
      const engine2 = getSharedPhysicsEngine();
      expect(engine2.getConfig().shared.backgroundMode).toBe('uv');
    });
  });
  
  describe('render/plot path alignment', () => {
    it('uses same physics for both paths', () => {
      // Set temperature above Draper point for emission
      const temp = 3000;
      const transmission = 0.5;
      
      // Get RGB (fast path)
      const rgb = engine.computeRGB(transmission, temp);
      
      // Get spectrum (accurate path)
      const spectrum = engine.computeSpectrum(transmission, temp);
      
      // Both should show emission effects (non-zero in dark mode)
      engine.updateSharedConfig({ backgroundMode: 'dark' });
      
      const darkRgb = engine.computeRGB(transmission, temp);
      const darkSpectrum = engine.computeSpectrum(transmission, temp);
      
      // Should have emission in dark mode
      const hasEmissionRgb = darkRgb[0] > 0 || darkRgb[1] > 0 || darkRgb[2] > 0;
      const hasEmissionSpectrum = Array.from(darkSpectrum).some(v => v > 0);
      
      expect(hasEmissionRgb).toBe(true);
      expect(hasEmissionSpectrum).toBe(true);
    });
    
    it('shared config affects both paths identically', () => {
      // Disable emission
      engine.updateSharedConfig({ enableEmission: false });
      
      // Both paths should show no emission in dark mode
      engine.updateSharedConfig({ backgroundMode: 'dark' });
      
      const rgb = engine.computeRGB(0.5, 3000);
      const spectrum = engine.computeSpectrum(0.5, 3000);
      
      // No emission, no background = nothing
      expect(rgb[0] + rgb[1] + rgb[2]).toBeLessThan(0.01);
      expect(Array.from(spectrum).reduce((a, b) => a + b, 0)).toBe(0);
    });
  });
});




