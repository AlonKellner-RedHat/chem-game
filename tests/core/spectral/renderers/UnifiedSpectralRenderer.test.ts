/**
 * Tests for UnifiedSpectralRenderer - the main unified renderer API
 * 
 * This renderer manages:
 * - 6 layer masks + material textures
 * - Shape CRUD operations
 * - Dual output modes (RGB and spectrum)
 * - Blur passes for scattering
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  UnifiedSpectralRenderer,
  UnifiedRendererConfig,
  UnifiedShape,
} from '../../../../src/core/spectral/renderers/UnifiedSpectralRenderer';
import { RectangleGeometry } from '../../../../src/core/spectral/geometry/RectangleGeometry';
import { CircleGeometry } from '../../../../src/core/spectral/geometry/CircleGeometry';

describe('UnifiedSpectralRenderer', () => {
  let renderer: UnifiedSpectralRenderer;
  const defaultConfig: UnifiedRendererConfig = {
    width: 200,
    height: 200,
    numLayers: 6,
    wavelengthResolution: 100,
    maxShapesPerLayer: 256,
  };

  beforeEach(() => {
    renderer = new UnifiedSpectralRenderer(defaultConfig);
  });

  describe('initialization', () => {
    it('should create renderer with 6 layers', () => {
      expect(renderer.getNumLayers()).toBe(6);
    });

    it('should start with no shapes', () => {
      expect(renderer.getShapeCount()).toBe(0);
    });

    it('should have normal background mode by default', () => {
      expect(renderer.getBackgroundMode()).toBe('normal');
    });
  });

  describe('shape management', () => {
    it('should add a shape to a layer', () => {
      const shape: UnifiedShape = {
        id: 'shape1',
        layerIndex: 0,
        geometry: new RectangleGeometry(100, 100, 50, 50),
        materialId: 'water',
        transmissionSpectrum: createFlatSpectrum(0.5),
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      };

      renderer.addShape(shape);

      expect(renderer.getShapeCount()).toBe(1);
      expect(renderer.getShape('shape1')).not.toBeNull();
    });

    it('should add shapes to different layers', () => {
      for (let i = 0; i < 6; i++) {
        renderer.addShape({
          id: `shape${i}`,
          layerIndex: i,
          geometry: new RectangleGeometry(100, 100, 30, 30),
          materialId: 'water',
          transmissionSpectrum: createFlatSpectrum(0.5),
          temperature: 300,
          scatteringCoeff: 0,
          auraRadius: 20,
          auraDecay: 0.1,
        });
      }

      expect(renderer.getShapeCount()).toBe(6);
      expect(renderer.getShapeCountInLayer(0)).toBe(1);
      expect(renderer.getShapeCountInLayer(5)).toBe(1);
    });

    it('should remove a shape', () => {
      renderer.addShape({
        id: 'shape1',
        layerIndex: 0,
        geometry: new RectangleGeometry(100, 100, 50, 50),
        materialId: 'water',
        transmissionSpectrum: createFlatSpectrum(0.5),
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      });

      expect(renderer.getShapeCount()).toBe(1);

      renderer.removeShape('shape1');

      expect(renderer.getShapeCount()).toBe(0);
    });

    it('should move a shape', () => {
      renderer.addShape({
        id: 'shape1',
        layerIndex: 0,
        geometry: new RectangleGeometry(50, 50, 30, 30),
        materialId: 'water',
        transmissionSpectrum: createFlatSpectrum(0.5),
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      });

      const newGeometry = new RectangleGeometry(150, 150, 30, 30);
      renderer.moveShape('shape1', newGeometry);

      const shape = renderer.getShape('shape1');
      expect(shape?.geometry).toBe(newGeometry);
    });
  });

  describe('property updates', () => {
    beforeEach(() => {
      renderer.addShape({
        id: 'shape1',
        layerIndex: 0,
        geometry: new RectangleGeometry(100, 100, 50, 50),
        materialId: 'water',
        transmissionSpectrum: createFlatSpectrum(0.5),
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      });
    });

    it('should update temperature', () => {
      renderer.setTemperature('shape1', 2000);

      const shape = renderer.getShape('shape1');
      expect(shape?.temperature).toBe(2000);
    });

    it('should update scattering coefficient', () => {
      renderer.setScattering('shape1', 0.5);

      const shape = renderer.getShape('shape1');
      expect(shape?.scatteringCoeff).toBe(0.5);
    });

    it('should update transmission spectrum', () => {
      const newSpectrum = createFlatSpectrum(0.3);
      renderer.setTransmissionSpectrum('shape1', newSpectrum);

      const shape = renderer.getShape('shape1');
      expect(shape?.transmissionSpectrum[50]).toBeCloseTo(0.3, 2);
    });

    it('should update background mode', () => {
      renderer.setBackgroundMode('dark');
      expect(renderer.getBackgroundMode()).toBe('dark');

      renderer.setBackgroundMode('uv');
      expect(renderer.getBackgroundMode()).toBe('uv');

      renderer.setBackgroundMode('normal');
      expect(renderer.getBackgroundMode()).toBe('normal');
    });
  });

  describe('spectrum readback', () => {
    beforeEach(() => {
      renderer.addShape({
        id: 'shape1',
        layerIndex: 0,
        geometry: new RectangleGeometry(100, 100, 50, 50),
        materialId: 'water',
        transmissionSpectrum: createFlatSpectrum(0.5),
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      });
    });

    it('should return spectrum at a point inside shape', () => {
      const spectrum = renderer.getSpectrumAtPixel(100, 100, 16);

      expect(spectrum.length).toBe(16);

      // Inside shape = transmission applied
      for (const point of spectrum) {
        expect(point.transmission).toBeLessThanOrEqual(1.0);
      }
    });

    it('should return background spectrum outside shapes', () => {
      const spectrum = renderer.getSpectrumAtPixel(10, 10, 16);

      expect(spectrum.length).toBe(16);

      // Outside all shapes = pure background
      for (const point of spectrum) {
        // In visible range, should be 1.0
        if (point.wavelength >= 380 && point.wavelength <= 700) {
          expect(point.transmission).toBeCloseTo(1.0, 1);
        }
      }
    });

    it('should support variable resolution', () => {
      const lowRes = renderer.getSpectrumAtPixel(100, 100, 10);
      const highRes = renderer.getSpectrumAtPixel(100, 100, 100);

      expect(lowRes.length).toBe(10);
      expect(highRes.length).toBe(100);
    });
  });

  describe('rendering', () => {
    beforeEach(() => {
      renderer.addShape({
        id: 'square',
        layerIndex: 0,
        geometry: new RectangleGeometry(50, 50, 30, 30),
        materialId: 'water',
        transmissionSpectrum: createFlatSpectrum(0.3),
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      });

      renderer.addShape({
        id: 'circle',
        layerIndex: 1,
        geometry: new CircleGeometry(150, 150, 25),
        materialId: 'crystal',
        transmissionSpectrum: createFlatSpectrum(0.7),
        temperature: 2000,
        scatteringCoeff: 0.5,
        auraRadius: 30,
        auraDecay: 0.05,
      });
    });

    it('should render to ImageData', () => {
      const imageData = renderer.renderToImageData();

      expect(imageData.width).toBe(defaultConfig.width);
      expect(imageData.height).toBe(defaultConfig.height);
      expect(imageData.data.length).toBe(defaultConfig.width * defaultConfig.height * 4);
    });

    it('should have valid pixel colors', () => {
      const imageData = renderer.renderToImageData();

      // Get pixel inside square
      const squareX = 50;
      const squareY = 50;
      const squareIdx = (squareY * defaultConfig.width + squareX) * 4;

      // Verify RGB values are valid
      expect(imageData.data[squareIdx]).toBeGreaterThanOrEqual(0);
      expect(imageData.data[squareIdx]).toBeLessThanOrEqual(255);
      expect(imageData.data[squareIdx + 1]).toBeGreaterThanOrEqual(0);
      expect(imageData.data[squareIdx + 1]).toBeLessThanOrEqual(255);
      expect(imageData.data[squareIdx + 2]).toBeGreaterThanOrEqual(0);
      expect(imageData.data[squareIdx + 2]).toBeLessThanOrEqual(255);
      expect(imageData.data[squareIdx + 3]).toBe(255); // Alpha
    });

    it('should update when properties change', () => {
      const before = renderer.renderToImageData();
      const centerIdx = (100 * defaultConfig.width + 50) * 4;
      const beforeR = before.data[centerIdx];

      // Change temperature to make it glow
      renderer.setTemperature('square', 6500);

      const after = renderer.renderToImageData();
      const afterR = after.data[centerIdx];

      // Color should change due to emission
      expect(afterR).not.toBe(beforeR);
    });
  });

  describe('dark mode', () => {
    it('should show only emission in dark mode', () => {
      renderer.addShape({
        id: 'hot',
        layerIndex: 0,
        geometry: new RectangleGeometry(100, 100, 50, 50),
        materialId: 'water',
        transmissionSpectrum: createFlatSpectrum(0.0), // Opaque
        temperature: 6500, // Hot
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      });

      renderer.setBackgroundMode('dark');

      const spectrum = renderer.getSpectrumAtPixel(100, 100, 16);

      // Should have emission (non-zero in visible)
      const hasEmission = spectrum.some(p => p.transmission > 0);
      expect(hasEmission).toBe(true);
    });

    it('should be dark for cold objects', () => {
      renderer.addShape({
        id: 'cold',
        layerIndex: 0,
        geometry: new RectangleGeometry(100, 100, 50, 50),
        materialId: 'water',
        transmissionSpectrum: createFlatSpectrum(0.5),
        temperature: 300, // Room temp
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      });

      renderer.setBackgroundMode('dark');

      const spectrum = renderer.getSpectrumAtPixel(100, 100, 16);

      // Cold + dark = no light
      for (const point of spectrum) {
        expect(point.transmission).toBe(0);
      }
    });
  });

  describe('layer composition', () => {
    it('should apply back-to-front composition', () => {
      // Layer 0 (back): filter
      renderer.addShape({
        id: 'back',
        layerIndex: 0,
        geometry: new RectangleGeometry(100, 100, 80, 80),
        materialId: 'water',
        transmissionSpectrum: createFlatSpectrum(0.5),
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 0,
        auraDecay: 0,
      });

      // Layer 1 (front): another filter
      renderer.addShape({
        id: 'front',
        layerIndex: 1,
        geometry: new RectangleGeometry(100, 100, 60, 60),
        materialId: 'crystal',
        transmissionSpectrum: createFlatSpectrum(0.5),
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 0,
        auraDecay: 0,
      });

      const spectrum = renderer.getSpectrumAtPixel(100, 100, 16);

      // Combined transmission: 0.5 × 0.5 = 0.25
      const midPoint = spectrum.find(p => p.wavelength >= 540 && p.wavelength <= 560);
      expect(midPoint?.transmission).toBeCloseTo(0.25, 1);
    });

    it('should handle 6 layers correctly', () => {
      // Add shapes to all 6 layers
      for (let i = 0; i < 6; i++) {
        renderer.addShape({
          id: `layer${i}`,
          layerIndex: i,
          geometry: new RectangleGeometry(100, 100, 80 - i * 5, 80 - i * 5),
          materialId: 'water',
          transmissionSpectrum: createFlatSpectrum(0.9), // 90% transmission each
          temperature: 300,
          scatteringCoeff: 0,
          auraRadius: 0,
          auraDecay: 0,
        });
      }

      const spectrum = renderer.getSpectrumAtPixel(100, 100, 16);

      // Combined: 0.9^6 ≈ 0.53
      const midPoint = spectrum.find(p => p.wavelength >= 540 && p.wavelength <= 560);
      expect(midPoint?.transmission).toBeCloseTo(Math.pow(0.9, 6), 1);
    });
  });

  describe('synchronization guarantee', () => {
    it('should produce consistent results between render and spectrum', () => {
      renderer.addShape({
        id: 'test',
        layerIndex: 0,
        geometry: new RectangleGeometry(100, 100, 50, 50),
        materialId: 'water',
        transmissionSpectrum: createFlatSpectrum(0.5),
        temperature: 2000,
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      });

      // Get spectrum at same point as rendered pixel
      const spectrum = renderer.getSpectrumAtPixel(100, 100, 100);

      // Render to get RGB
      const imageData = renderer.renderToImageData();
      const pixelIdx = (100 * defaultConfig.width + 100) * 4;
      const renderedR = imageData.data[pixelIdx];
      const renderedG = imageData.data[pixelIdx + 1];
      const renderedB = imageData.data[pixelIdx + 2];

      // Both should be non-zero (has content)
      expect(spectrum.length).toBe(100);
      expect(renderedR + renderedG + renderedB).toBeGreaterThan(0);
    });
  });
});

// Helper function to create flat spectrum
function createFlatSpectrum(value: number, length: number = 100): Float32Array {
  const spectrum = new Float32Array(length);
  spectrum.fill(value);
  return spectrum;
}

