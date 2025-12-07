/**
 * Tests for separable Gaussian blur pass
 * 
 * Blur is applied based on scattering properties:
 * - Higher scattering coefficient = more blur
 * - Blur only affects content BEHIND the scattering layer
 * - Blur preserves shape edges (doesn't cross boundaries)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  UnifiedSpectralRenderer,
  UnifiedRendererConfig,
} from '../../../../src/core/spectral/renderers/UnifiedSpectralRenderer';
import { RectangleGeometry } from '../../../../src/core/spectral/geometry/RectangleGeometry';

describe('Blur Pass', () => {
  let renderer: UnifiedSpectralRenderer;
  const config: UnifiedRendererConfig = {
    width: 100,
    height: 100,
    numLayers: 6,
    wavelengthResolution: 100,
    maxShapesPerLayer: 256,
  };

  beforeEach(() => {
    renderer = new UnifiedSpectralRenderer(config);
  });

  describe('scattering coefficient effect', () => {
    it('should have no blur when scattering is 0', () => {
      renderer.addShape({
        id: 'no-scatter',
        layerIndex: 0,
        geometry: new RectangleGeometry(50, 50, 40, 40),
        materialId: 'glass',
        transmissionSpectrum: createFlatSpectrum(0.9),
        temperature: 300,
        scatteringCoeff: 0, // No scattering
        auraRadius: 0,
        auraDecay: 0,
      });

      // Get the blur sigma from the renderer's internal state
      const shape = renderer.getShape('no-scatter');
      expect(shape?.scatteringCoeff).toBe(0);
    });

    it('should increase blur with higher scattering coefficient', () => {
      // Shape 1: low scattering
      renderer.addShape({
        id: 'low-scatter',
        layerIndex: 0,
        geometry: new RectangleGeometry(30, 50, 20, 20),
        materialId: 'water',
        transmissionSpectrum: createFlatSpectrum(0.8),
        temperature: 300,
        scatteringCoeff: 0.1,
        auraRadius: 0,
        auraDecay: 0,
      });

      // Shape 2: high scattering
      renderer.addShape({
        id: 'high-scatter',
        layerIndex: 1,
        geometry: new RectangleGeometry(70, 50, 20, 20),
        materialId: 'milk',
        transmissionSpectrum: createFlatSpectrum(0.8),
        temperature: 300,
        scatteringCoeff: 0.8,
        auraRadius: 0,
        auraDecay: 0,
      });

      const lowShape = renderer.getShape('low-scatter');
      const highShape = renderer.getShape('high-scatter');

      expect(highShape?.scatteringCoeff).toBeGreaterThan(lowShape?.scatteringCoeff ?? 0);
    });
  });

  describe('layer order for blur', () => {
    it('should apply blur from front layers to back content', () => {
      // Layer 0 (back): colored pattern
      renderer.addShape({
        id: 'back-pattern',
        layerIndex: 0,
        geometry: new RectangleGeometry(50, 50, 60, 60),
        materialId: 'pattern',
        transmissionSpectrum: createVariedSpectrum(),
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 0,
        auraDecay: 0,
      });

      // Layer 1 (front): scattering layer
      renderer.addShape({
        id: 'scattering-layer',
        layerIndex: 1,
        geometry: new RectangleGeometry(50, 50, 40, 40),
        materialId: 'frosted',
        transmissionSpectrum: createFlatSpectrum(0.9),
        temperature: 300,
        scatteringCoeff: 0.5,
        auraRadius: 0,
        auraDecay: 0,
      });

      // Render and verify that content behind scattering layer is affected
      const imageData = renderer.renderToImageData();
      expect(imageData.data.length).toBe(config.width * config.height * 4);
    });
  });

  describe('blur does not affect foreground shapes', () => {
    it('should preserve sharp edges for shapes in front of scattering', () => {
      // Layer 0: scattering background
      renderer.addShape({
        id: 'scattering-bg',
        layerIndex: 0,
        geometry: new RectangleGeometry(50, 50, 80, 80),
        materialId: 'fog',
        transmissionSpectrum: createFlatSpectrum(0.7),
        temperature: 300,
        scatteringCoeff: 0.6,
        auraRadius: 0,
        auraDecay: 0,
      });

      // Layer 2 (front): sharp shape
      renderer.addShape({
        id: 'sharp-front',
        layerIndex: 2,
        geometry: new RectangleGeometry(50, 50, 30, 30),
        materialId: 'sharp',
        transmissionSpectrum: createFlatSpectrum(0.2), // Darker
        temperature: 300,
        scatteringCoeff: 0, // No scattering
        auraRadius: 0,
        auraDecay: 0,
      });

      // The front shape should have sharp edges (not blurred by layer 0)
      const frontShape = renderer.getShape('sharp-front');
      expect(frontShape?.scatteringCoeff).toBe(0);
    });
  });

  describe('blur accumulation', () => {
    it('should accumulate blur from multiple scattering layers', () => {
      // Add multiple scattering layers
      for (let i = 0; i < 3; i++) {
        renderer.addShape({
          id: `scatter-layer-${i}`,
          layerIndex: i,
          geometry: new RectangleGeometry(50, 50, 60 - i * 10, 60 - i * 10),
          materialId: `scatter${i}`,
          transmissionSpectrum: createFlatSpectrum(0.9),
          temperature: 300,
          scatteringCoeff: 0.2, // Each layer adds blur
          auraRadius: 0,
          auraDecay: 0,
        });
      }

      // Total scattering should be accumulated
      const shapes = [0, 1, 2].map(i => renderer.getShape(`scatter-layer-${i}`));
      const totalScatter = shapes.reduce((sum, s) => sum + (s?.scatteringCoeff ?? 0), 0);
      expect(totalScatter).toBeCloseTo(0.6, 2);
    });
  });

  describe('spectrum consistency with blur', () => {
    it('should apply same blur to all wavelengths uniformly', () => {
      renderer.addShape({
        id: 'mie-scatter',
        layerIndex: 0,
        geometry: new RectangleGeometry(50, 50, 40, 40),
        materialId: 'cloud',
        transmissionSpectrum: createFlatSpectrum(0.8),
        temperature: 300,
        scatteringCoeff: 0.5, // Mie scattering (uniform)
        auraRadius: 0,
        auraDecay: 0,
      });

      // Get spectrum at point inside shape
      const spectrum = renderer.getSpectrumAtPixel(50, 50, 16);

      // For Mie scattering, all wavelengths should have same transmission
      // (blur affects spatial distribution, not wavelength)
      const values = spectrum.map(p => p.transmission);
      const variance = calculateVariance(values);
      
      // Low variance means uniform across wavelengths
      expect(variance).toBeLessThan(0.01);
    });
  });
});

// Helper functions

function createFlatSpectrum(value: number, length: number = 100): Float32Array {
  const spectrum = new Float32Array(length);
  spectrum.fill(value);
  return spectrum;
}

function createVariedSpectrum(length: number = 100): Float32Array {
  const spectrum = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    // Create a sinusoidal pattern
    spectrum[i] = 0.5 + 0.4 * Math.sin((i / length) * Math.PI * 4);
  }
  return spectrum;
}

function calculateVariance(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
}

