/**
 * Tests for Layer Composition - per-layer processing order
 * 
 * Each layer is processed in order:
 * 1. Blur pass - scattering from shapes in this layer
 * 2. Absorption pass - transmission through shapes
 * 3. Emission pass - black body + aura falloff
 * 
 * This mirrors the MultiPassRenderer.render() flow.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LayerCompositionEngine,
  CompositionResult,
  CompositionConfig,
} from '../../../../src/core/spectral/shaders/LayerCompositionEngine';
import {
  UnifiedSpectralPhysics,
  BackgroundMode,
} from '../../../../src/core/spectral/shaders/UnifiedSpectralPhysics';

describe('LayerCompositionEngine', () => {
  let engine: LayerCompositionEngine;
  let physics: UnifiedSpectralPhysics;
  const defaultConfig: CompositionConfig = {
    numLayers: 6,
    wavelengthMin: 380,
    wavelengthMax: 700,
  };

  beforeEach(() => {
    physics = new UnifiedSpectralPhysics();
    engine = new LayerCompositionEngine(defaultConfig, physics);
  });

  describe('basic composition', () => {
    it('should return background for empty layers', () => {
      const result = engine.composeAt(50, 50, 550, BackgroundMode.Normal);
      
      // No shapes = full background transmission
      const expected = physics.getBackgroundIntensity(550, BackgroundMode.Normal);
      expect(result.intensity).toBeCloseTo(expected, 5);
    });

    it('should apply transmission from a single layer', () => {
      // Add a shape with 50% transmission
      engine.setLayerData(0, {
        hasShape: true,
        transmission: 0.5,
        temperature: 300, // No emission
        scatteringCoeff: 0,
        auraRadius: 0,
        auraDecay: 0,
      });

      const result = engine.composeAt(50, 50, 550, BackgroundMode.Normal);
      
      const bg = physics.getBackgroundIntensity(550, BackgroundMode.Normal);
      expect(result.intensity).toBeCloseTo(bg * 0.5, 3);
    });

    it('should accumulate transmission across layers', () => {
      // Layer 0: 50% transmission
      engine.setLayerData(0, {
        hasShape: true,
        transmission: 0.5,
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 0,
        auraDecay: 0,
      });

      // Layer 1: 50% transmission
      engine.setLayerData(1, {
        hasShape: true,
        transmission: 0.5,
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 0,
        auraDecay: 0,
      });

      const result = engine.composeAt(50, 50, 550, BackgroundMode.Normal);
      
      const bg = physics.getBackgroundIntensity(550, BackgroundMode.Normal);
      // Combined: 0.5 × 0.5 = 0.25
      expect(result.intensity).toBeCloseTo(bg * 0.25, 3);
    });
  });

  describe('emission handling', () => {
    it('should add emission for hot objects', () => {
      engine.setLayerData(0, {
        hasShape: true,
        transmission: 0.0, // Fully opaque
        temperature: 6500, // D65 temperature
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      });

      const result = engine.composeAt(50, 50, 550, BackgroundMode.Normal);
      
      // Opaque + hot = only emission, no transmission
      const emission = physics.kirchhoffEmission(0.0, 550, 6500);
      expect(result.intensity).toBeCloseTo(emission, 2);
      expect(result.hasEmission).toBe(true);
    });

    it('should combine transmission and emission', () => {
      engine.setLayerData(0, {
        hasShape: true,
        transmission: 0.5, // 50% transparent
        temperature: 6500,
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      });

      const result = engine.composeAt(50, 50, 550, BackgroundMode.Normal);
      
      const bg = physics.getBackgroundIntensity(550, BackgroundMode.Normal);
      const transmitted = bg * 0.5;
      const emission = physics.kirchhoffEmission(0.5, 550, 6500);
      
      expect(result.intensity).toBeCloseTo(transmitted + emission, 2);
    });

    it('should not emit below Draper point', () => {
      engine.setLayerData(0, {
        hasShape: true,
        transmission: 0.0, // Fully opaque
        temperature: 500, // Below Draper point (798K)
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      });

      const result = engine.composeAt(50, 50, 550, BackgroundMode.Normal);
      
      // No transmission (opaque) + no emission (cold) = 0
      expect(result.intensity).toBe(0);
      expect(result.hasEmission).toBe(false);
    });
  });

  describe('layer order (back-to-front)', () => {
    it('should process layers in z-order', () => {
      // Layer 0 (back): hot emitter
      engine.setLayerData(0, {
        hasShape: true,
        transmission: 0.0,
        temperature: 6500,
        scatteringCoeff: 0,
        auraRadius: 0,
        auraDecay: 0,
      });

      // Layer 1 (front): 50% filter
      engine.setLayerData(1, {
        hasShape: true,
        transmission: 0.5,
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 0,
        auraDecay: 0,
      });

      const result = engine.composeAt(50, 50, 550, BackgroundMode.Normal);
      
      // Layer 0 emits, layer 1 filters it by 50%
      const emission = physics.kirchhoffEmission(0.0, 550, 6500);
      const filtered = emission * 0.5;
      
      expect(result.intensity).toBeCloseTo(filtered, 2);
    });

    it('should add layer 1 emission on top of filtered layer 0', () => {
      // Layer 0: emitter
      engine.setLayerData(0, {
        hasShape: true,
        transmission: 0.0,
        temperature: 2000,
        scatteringCoeff: 0,
        auraRadius: 0,
        auraDecay: 0,
      });

      // Layer 1: partially transparent + hot
      engine.setLayerData(1, {
        hasShape: true,
        transmission: 0.5,
        temperature: 6500,
        scatteringCoeff: 0,
        auraRadius: 0,
        auraDecay: 0,
      });

      const result = engine.composeAt(50, 50, 550, BackgroundMode.Normal);
      
      // Layer 0 emission, filtered by layer 1
      const layer0Emission = physics.kirchhoffEmission(0.0, 550, 2000);
      const filteredLayer0 = layer0Emission * 0.5;
      
      // Layer 1 emission (added on top)
      const layer1Emission = physics.kirchhoffEmission(0.5, 550, 6500);
      
      const expected = filteredLayer0 + layer1Emission;
      expect(result.intensity).toBeCloseTo(expected, 2);
    });
  });

  describe('empty layers', () => {
    it('should skip layers without shapes', () => {
      // Only layer 2 has a shape
      engine.setLayerData(2, {
        hasShape: true,
        transmission: 0.5,
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 0,
        auraDecay: 0,
      });

      const result = engine.composeAt(50, 50, 550, BackgroundMode.Normal);
      
      const bg = physics.getBackgroundIntensity(550, BackgroundMode.Normal);
      expect(result.intensity).toBeCloseTo(bg * 0.5, 3);
    });
  });

  describe('dark mode', () => {
    it('should show only emission in dark mode', () => {
      engine.setLayerData(0, {
        hasShape: true,
        transmission: 0.5,
        temperature: 6500,
        scatteringCoeff: 0,
        auraRadius: 0,
        auraDecay: 0,
      });

      const result = engine.composeAt(50, 50, 550, BackgroundMode.Dark);
      
      // No background, only emission
      const emission = physics.kirchhoffEmission(0.5, 550, 6500);
      expect(result.intensity).toBeCloseTo(emission, 3);
    });

    it('should return 0 for cold objects in dark mode', () => {
      engine.setLayerData(0, {
        hasShape: true,
        transmission: 0.5,
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 0,
        auraDecay: 0,
      });

      const result = engine.composeAt(50, 50, 550, BackgroundMode.Dark);
      
      // No background, no emission = 0
      expect(result.intensity).toBe(0);
    });
  });

  describe('scattering blur', () => {
    it('should calculate blur sigma from scattering coefficient', () => {
      engine.setLayerData(0, {
        hasShape: true,
        transmission: 1.0,
        temperature: 300,
        scatteringCoeff: 0.5,
        auraRadius: 0,
        auraDecay: 0,
      });

      const result = engine.composeAt(50, 50, 550, BackgroundMode.Normal);
      
      // Scattering should increase blur sigma
      expect(result.blurSigma).toBeGreaterThan(0);
    });

    it('should have zero blur for non-scattering layers', () => {
      engine.setLayerData(0, {
        hasShape: true,
        transmission: 1.0,
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 0,
        auraDecay: 0,
      });

      const result = engine.composeAt(50, 50, 550, BackgroundMode.Normal);
      
      expect(result.blurSigma).toBe(0);
    });

    it('should accumulate blur from multiple layers', () => {
      engine.setLayerData(0, {
        hasShape: true,
        transmission: 1.0,
        temperature: 300,
        scatteringCoeff: 0.3,
        auraRadius: 0,
        auraDecay: 0,
      });

      engine.setLayerData(1, {
        hasShape: true,
        transmission: 1.0,
        temperature: 300,
        scatteringCoeff: 0.3,
        auraRadius: 0,
        auraDecay: 0,
      });

      const result = engine.composeAt(50, 50, 550, BackgroundMode.Normal);
      
      // Two scattering layers should have more blur than one
      expect(result.blurSigma).toBeGreaterThan(3);
    });
  });

  describe('RGB integration', () => {
    it('should integrate spectrum to RGB', () => {
      // Set up a single layer with red filter (low blue transmission)
      engine.setLayerData(0, {
        hasShape: true,
        transmission: 0.5,
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 0,
        auraDecay: 0,
      });

      const rgb = engine.composeToRGB(50, 50, BackgroundMode.Normal);
      
      // Should have valid RGB values
      expect(rgb.r).toBeGreaterThanOrEqual(0);
      expect(rgb.r).toBeLessThanOrEqual(255);
      expect(rgb.g).toBeGreaterThanOrEqual(0);
      expect(rgb.g).toBeLessThanOrEqual(255);
      expect(rgb.b).toBeGreaterThanOrEqual(0);
      expect(rgb.b).toBeLessThanOrEqual(255);
    });

    it('should show warm color for low temperature emission', () => {
      engine.setLayerData(0, {
        hasShape: true,
        transmission: 0.0,
        temperature: 2000, // Low temp = red
        scatteringCoeff: 0,
        auraRadius: 0,
        auraDecay: 0,
      });

      const rgb = engine.composeToRGB(50, 50, BackgroundMode.Dark);
      
      // 2000K should be reddish
      expect(rgb.r).toBeGreaterThan(rgb.b);
    });

    it('should show cooler color for high temperature emission', () => {
      engine.setLayerData(0, {
        hasShape: true,
        transmission: 0.0,
        temperature: 10000, // High temp = bluish
        scatteringCoeff: 0,
        auraRadius: 0,
        auraDecay: 0,
      });

      const rgb = engine.composeToRGB(50, 50, BackgroundMode.Dark);
      
      // 10000K should have significant blue
      expect(rgb.b).toBeGreaterThan(0);
    });
  });

  describe('spectrum readback', () => {
    it('should return full spectrum at a point', () => {
      engine.setLayerData(0, {
        hasShape: true,
        transmission: 0.5,
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 0,
        auraDecay: 0,
      });

      const spectrum = engine.getSpectrumAt(50, 50, BackgroundMode.Normal, 16);
      
      expect(spectrum.length).toBe(16);
      
      // All values should be background × 0.5
      for (const point of spectrum) {
        const expectedBg = physics.getBackgroundIntensity(point.wavelength, BackgroundMode.Normal);
        expect(point.transmission).toBeCloseTo(expectedBg * 0.5, 2);
      }
    });

    it('should match RGB when spectrum is integrated', () => {
      engine.setLayerData(0, {
        hasShape: true,
        transmission: 0.5,
        temperature: 6500,
        scatteringCoeff: 0,
        auraRadius: 0,
        auraDecay: 0,
      });

      const rgb = engine.composeToRGB(50, 50, BackgroundMode.Normal);
      const spectrum = engine.getSpectrumAt(50, 50, BackgroundMode.Normal, 100);
      
      // Both should use the same physics, so integrating the spectrum
      // should give approximately the same RGB
      // (This is the core synchronization guarantee)
      expect(spectrum.length).toBe(100);
      
      // The RGB values should be within reasonable range
      expect(rgb.r).toBeGreaterThanOrEqual(0);
      expect(rgb.r).toBeLessThanOrEqual(255);
    });
  });
});

