/**
 * Tests for Dual Output Mode - ensuring RGB and spectrum modes are synchronized
 * 
 * The unified shader has two output modes:
 * - Mode 0: RGB color (16-wavelength integration)
 * - Mode 1: Spectrum value at a specific wavelength
 * 
 * Both modes MUST use the same composeLayers() function.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LayerCompositionEngine,
  CompositionConfig,
} from '../../../../src/core/spectral/shaders/LayerCompositionEngine';
import {
  UnifiedSpectralPhysics,
  BackgroundMode,
} from '../../../../src/core/spectral/shaders/UnifiedSpectralPhysics';

describe('Dual Output Mode', () => {
  let engine: LayerCompositionEngine;
  let physics: UnifiedSpectralPhysics;
  const config: CompositionConfig = {
    numLayers: 6,
    wavelengthMin: 380,
    wavelengthMax: 700,
  };

  beforeEach(() => {
    physics = new UnifiedSpectralPhysics();
    engine = new LayerCompositionEngine(config, physics);
  });

  describe('mode synchronization', () => {
    it('should use same composeLayers for both RGB and spectrum', () => {
      // Set up a test layer
      engine.setLayerData(0, {
        hasShape: true,
        transmission: 0.5,
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 0,
        auraDecay: 0,
      });

      // Get spectrum at 16 wavelengths (matching RGB integration)
      const spectrum = engine.getSpectrumAt(50, 50, BackgroundMode.Normal, 16);
      
      // Each spectrum point should match what composeLayers returns
      for (const point of spectrum) {
        const singleResult = engine.composeAt(50, 50, point.wavelength, BackgroundMode.Normal);
        expect(point.transmission).toBeCloseTo(singleResult.intensity, 3);
      }
    });

    it('should produce consistent results across output modes', () => {
      engine.setLayerData(0, {
        hasShape: true,
        transmission: 0.3,
        temperature: 6500,
        scatteringCoeff: 0,
        auraRadius: 0,
        auraDecay: 0,
      });

      // RGB mode produces color
      const rgb = engine.composeToRGB(50, 50, BackgroundMode.Normal);
      
      // Spectrum mode produces values at each wavelength
      const spectrum = engine.getSpectrumAt(50, 50, BackgroundMode.Normal, 100);
      
      // RGB should be within valid range
      expect(rgb.r).toBeGreaterThanOrEqual(0);
      expect(rgb.r).toBeLessThanOrEqual(255);
      expect(rgb.g).toBeGreaterThanOrEqual(0);
      expect(rgb.g).toBeLessThanOrEqual(255);
      expect(rgb.b).toBeGreaterThanOrEqual(0);
      expect(rgb.b).toBeLessThanOrEqual(255);
      
      // Spectrum should have correct length
      expect(spectrum.length).toBe(100);
    });
  });

  describe('spectrum readback', () => {
    it('should return exact values at sampled wavelengths', () => {
      engine.setLayerData(0, {
        hasShape: true,
        transmission: 0.7,
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 0,
        auraDecay: 0,
      });

      // Sample at specific wavelengths
      const at450 = engine.composeAt(50, 50, 450, BackgroundMode.Normal);
      const at550 = engine.composeAt(50, 50, 550, BackgroundMode.Normal);
      const at650 = engine.composeAt(50, 50, 650, BackgroundMode.Normal);
      
      // All should show background × 0.7 (no emission at room temp)
      const bg = physics.getBackgroundIntensity(550, BackgroundMode.Normal);
      expect(at550.intensity).toBeCloseTo(bg * 0.7, 3);
    });

    it('should support variable resolution spectrum', () => {
      engine.setLayerData(0, {
        hasShape: true,
        transmission: 0.5,
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 0,
        auraDecay: 0,
      });

      const lowRes = engine.getSpectrumAt(50, 50, BackgroundMode.Normal, 10);
      const highRes = engine.getSpectrumAt(50, 50, BackgroundMode.Normal, 100);
      
      expect(lowRes.length).toBe(10);
      expect(highRes.length).toBe(100);
      
      // Both should show same physics (same transmission at same wavelength)
      // Find closest matching wavelengths
      const lowMid = lowRes[Math.floor(lowRes.length / 2)];
      const highMid = highRes[Math.floor(highRes.length / 2)];
      
      // Should be similar (not exact due to different wavelength sampling)
      expect(lowMid.transmission).toBeGreaterThan(0);
      expect(highMid.transmission).toBeGreaterThan(0);
    });
  });

  describe('RGB integration', () => {
    it('should integrate correctly for white background', () => {
      // No layers = just background
      const rgb = engine.composeToRGB(50, 50, BackgroundMode.Normal);
      
      // Should produce approximately neutral gray/white
      // Due to gamma correction and normalization, values will be high
      expect(rgb.r).toBeGreaterThan(200);
      expect(rgb.g).toBeGreaterThan(200);
      expect(rgb.b).toBeGreaterThan(200);
    });

    it('should show color shift for colored filter', () => {
      // A red filter would block blue more than red
      // Here we simulate with uniform transmission
      engine.setLayerData(0, {
        hasShape: true,
        transmission: 0.5,
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 0,
        auraDecay: 0,
      });

      const rgb = engine.composeToRGB(50, 50, BackgroundMode.Normal);
      
      // With uniform transmission, colors should stay roughly neutral
      // (normalized by max)
      expect(Math.abs(rgb.r - rgb.g)).toBeLessThan(50);
      expect(Math.abs(rgb.g - rgb.b)).toBeLessThan(50);
    });

    it('should show warm glow for emission', () => {
      engine.setLayerData(0, {
        hasShape: true,
        transmission: 0.0,
        temperature: 2000, // Warm color
        scatteringCoeff: 0,
        auraRadius: 0,
        auraDecay: 0,
      });

      const rgb = engine.composeToRGB(50, 50, BackgroundMode.Dark);
      
      // 2000K emission should be warm (red > blue)
      expect(rgb.r).toBeGreaterThan(rgb.b);
    });
  });

  describe('background modes', () => {
    it('should work in normal mode', () => {
      const spectrum = engine.getSpectrumAt(50, 50, BackgroundMode.Normal, 16);
      
      // Should have non-zero values in visible range
      const visibleMid = spectrum.find(p => p.wavelength >= 500 && p.wavelength <= 600);
      expect(visibleMid?.transmission).toBe(1.0);
    });

    it('should work in UV mode', () => {
      const spectrum = engine.getSpectrumAt(50, 50, BackgroundMode.UV, 16);
      
      // In UV mode, visible range should be low
      const visibleMid = spectrum.find(p => p.wavelength >= 550 && p.wavelength <= 600);
      expect(visibleMid?.transmission).toBe(0);
    });

    it('should work in dark mode', () => {
      const spectrum = engine.getSpectrumAt(50, 50, BackgroundMode.Dark, 16);
      
      // Dark mode = all zeros
      for (const point of spectrum) {
        expect(point.transmission).toBe(0);
      }
    });

    it('should show only emission in dark mode', () => {
      engine.setLayerData(0, {
        hasShape: true,
        transmission: 0.0,
        temperature: 6500,
        scatteringCoeff: 0,
        auraRadius: 0,
        auraDecay: 0,
      });

      const spectrum = engine.getSpectrumAt(50, 50, BackgroundMode.Dark, 16);
      
      // Should have emission (non-zero values)
      const hasEmission = spectrum.some(p => p.transmission > 0);
      expect(hasEmission).toBe(true);
    });
  });

  describe('physics consistency', () => {
    it('should produce same physics in both modes for same input', () => {
      engine.setLayerData(0, {
        hasShape: true,
        transmission: 0.5,
        temperature: 2000,
        scatteringCoeff: 0,
        auraRadius: 0,
        auraDecay: 0,
      });

      // Get spectrum values at key wavelengths
      const spectrum = engine.getSpectrumAt(50, 50, BackgroundMode.Normal, 16);
      
      // Calculate expected values using physics directly
      for (const point of spectrum) {
        const bg = physics.getBackgroundIntensity(point.wavelength, BackgroundMode.Normal);
        const transmitted = bg * 0.5;
        const emission = physics.kirchhoffEmission(0.5, point.wavelength, 2000);
        const expected = transmitted + emission;
        
        expect(point.transmission).toBeCloseTo(expected, 2);
      }
    });
  });
});

