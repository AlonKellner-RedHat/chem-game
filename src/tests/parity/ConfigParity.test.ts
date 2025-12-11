/**
 * Configuration Parity Tests
 * 
 * Verifies that render/plot path configuration works correctly.
 */
import { describe, it, expect } from 'vitest';
import { createPhysicsEngine, createDefaultConfig } from '../../core/physics';

describe('Configuration Parity', () => {
  describe('Default Configuration', () => {
    it('uses correct wavelength range', () => {
      const config = createDefaultConfig();
      
      expect(config.shared.wavelengthMin).toBe(100);
      expect(config.shared.wavelengthMax).toBe(1000);
    });
    
    it('uses correct visible range', () => {
      const config = createDefaultConfig();
      
      expect(config.shared.visibleMin).toBe(380);
      expect(config.shared.visibleMax).toBe(700);
    });
    
    it('uses correct physical constants', () => {
      const config = createDefaultConfig();
      
      expect(config.shared.draperPoint).toBe(798);
      expect(config.shared.d65ReferenceTemp).toBe(6500);
    });
    
    it('render path uses low resolution', () => {
      const config = createDefaultConfig();
      
      expect(config.render.spectralResolution).toBe(32);
      expect(config.render.outputMode).toBe('rgb');
    });
    
    it('plot path uses high resolution', () => {
      const config = createDefaultConfig();
      
      expect(config.plot.spectralResolution).toBe(320);
      expect(config.plot.outputMode).toBe('spectrum');
    });
  });
  
  describe('Shared Config Updates', () => {
    it('shared config affects both paths', () => {
      const engine = createPhysicsEngine();
      
      // Default is normal mode
      expect(engine.getConfig().shared.backgroundMode).toBe('normal');
      
      // Update shared config
      engine.updateSharedConfig({ backgroundMode: 'dark' });
      
      // Verify change
      expect(engine.getConfig().shared.backgroundMode).toBe('dark');
      
      // Both paths should use dark mode
      const bg500 = engine.getBackgroundAt(500);
      expect(bg500).toBe(0); // Dark mode = no background
    });
    
    it('emission can be toggled', () => {
      const engine = createPhysicsEngine();
      
      expect(engine.getConfig().shared.enableEmission).toBe(true);
      
      engine.updateSharedConfig({ enableEmission: false });
      
      expect(engine.getConfig().shared.enableEmission).toBe(false);
    });
  });
  
  describe('Path-Specific Config', () => {
    it('render resolution is independent of plot resolution', () => {
      const engine = createPhysicsEngine();
      
      engine.updateRenderConfig({ spectralResolution: 32 });
      engine.updatePlotConfig({ spectralResolution: 640 });
      
      const config = engine.getConfig();
      expect(config.render.spectralResolution).toBe(32);
      expect(config.plot.spectralResolution).toBe(640);
    });
    
    it('spectrum output length matches plot resolution', () => {
      const engine = createPhysicsEngine();
      
      engine.updatePlotConfig({ spectralResolution: 100 });
      
      const spectrum = engine.computeSpectrum(1.0, 300);
      expect(spectrum.length).toBe(100);
    });
  });
  
  describe('Custom Wavelength Step', () => {
    it('plot path respects custom step size', () => {
      const engine = createPhysicsEngine();
      
      engine.updatePlotConfig({
        spectralResolution: 100,
        wavelengthStep: 5, // 5nm step
      });
      
      // Should cover 200nm + 99*5nm = 695nm range
      const spectrum = engine.computeSpectrum(1.0, 300);
      expect(spectrum.length).toBe(100);
    });
  });
  
  describe('Initial Config Override', () => {
    it('accepts initial config in constructor', () => {
      const engine = createPhysicsEngine({
        shared: {
          backgroundMode: 'uv',
          enableEmission: false,
        },
        render: {
          spectralResolution: 64,
        },
      });
      
      const config = engine.getConfig();
      
      expect(config.shared.backgroundMode).toBe('uv');
      expect(config.shared.enableEmission).toBe(false);
      expect(config.render.spectralResolution).toBe(64);
      
      // Non-overridden values should be defaults
      expect(config.shared.wavelengthMin).toBe(100);
    });
  });
});




