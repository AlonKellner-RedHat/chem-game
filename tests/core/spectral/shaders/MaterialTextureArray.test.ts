/**
 * Tests for MaterialTextureArray - per-layer material texture atlases
 * 
 * Each layer can have multiple shapes, each with its own transmission spectrum.
 * The MaterialTextureArray stores these spectra in a 2D texture atlas:
 * - X axis: wavelength (0-1 normalized to 380-700nm)
 * - Y axis: shape index (0-255)
 * 
 * This allows the GPU shader to look up transmission for any shape in any layer.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MaterialTextureArray,
  MaterialTextureConfig,
  ShapeMaterialData,
} from '../../../../src/core/spectral/shaders/MaterialTextureArray';

describe('MaterialTextureArray', () => {
  let textureArray: MaterialTextureArray;
  const defaultConfig: MaterialTextureConfig = {
    wavelengthResolution: 100,
    maxShapesPerLayer: 256,
    numLayers: 6,
    wavelengthMin: 380,
    wavelengthMax: 700,
  };

  beforeEach(() => {
    textureArray = new MaterialTextureArray(defaultConfig);
  });

  describe('initialization', () => {
    it('should create array with correct dimensions', () => {
      expect(textureArray.getWavelengthResolution()).toBe(100);
      expect(textureArray.getMaxShapesPerLayer()).toBe(256);
      expect(textureArray.getNumLayers()).toBe(6);
    });

    it('should initialize with full transmission for all shapes', () => {
      // Shape 0 (no shape) should have full transmission
      const transmission = textureArray.getTransmission(0, 0, 550);
      expect(transmission).toBe(1.0);
    });
  });

  describe('material data management', () => {
    it('should set material data for a shape', () => {
      const materialData: ShapeMaterialData = {
        shapeIndex: 1,
        layerIndex: 0,
        transmissionSpectrum: createFlatSpectrum(0.5),
      };

      textureArray.setMaterialData(materialData);

      const transmission = textureArray.getTransmission(0, 1, 550);
      expect(transmission).toBeCloseTo(0.5, 2);
    });

    it('should support different transmission at different wavelengths', () => {
      // Create spectrum that varies with wavelength
      const spectrum = createVaryingSpectrum();

      const materialData: ShapeMaterialData = {
        shapeIndex: 1,
        layerIndex: 0,
        transmissionSpectrum: spectrum,
      };

      textureArray.setMaterialData(materialData);

      // Check that different wavelengths have different transmission
      const blue = textureArray.getTransmission(0, 1, 450);
      const green = textureArray.getTransmission(0, 1, 550);
      const red = textureArray.getTransmission(0, 1, 650);

      expect(blue).not.toBe(green);
      expect(green).not.toBe(red);
    });

    it('should handle multiple shapes in same layer', () => {
      const material1: ShapeMaterialData = {
        shapeIndex: 1,
        layerIndex: 0,
        transmissionSpectrum: createFlatSpectrum(0.3),
      };

      const material2: ShapeMaterialData = {
        shapeIndex: 2,
        layerIndex: 0,
        transmissionSpectrum: createFlatSpectrum(0.7),
      };

      textureArray.setMaterialData(material1);
      textureArray.setMaterialData(material2);

      expect(textureArray.getTransmission(0, 1, 550)).toBeCloseTo(0.3, 2);
      expect(textureArray.getTransmission(0, 2, 550)).toBeCloseTo(0.7, 2);
    });

    it('should handle same shape index in different layers', () => {
      const layer0Material: ShapeMaterialData = {
        shapeIndex: 1,
        layerIndex: 0,
        transmissionSpectrum: createFlatSpectrum(0.3),
      };

      const layer1Material: ShapeMaterialData = {
        shapeIndex: 1,
        layerIndex: 1,
        transmissionSpectrum: createFlatSpectrum(0.8),
      };

      textureArray.setMaterialData(layer0Material);
      textureArray.setMaterialData(layer1Material);

      expect(textureArray.getTransmission(0, 1, 550)).toBeCloseTo(0.3, 2);
      expect(textureArray.getTransmission(1, 1, 550)).toBeCloseTo(0.8, 2);
    });

    it('should update existing material data', () => {
      const initialData: ShapeMaterialData = {
        shapeIndex: 1,
        layerIndex: 0,
        transmissionSpectrum: createFlatSpectrum(0.5),
      };

      textureArray.setMaterialData(initialData);
      expect(textureArray.getTransmission(0, 1, 550)).toBeCloseTo(0.5, 2);

      const updatedData: ShapeMaterialData = {
        shapeIndex: 1,
        layerIndex: 0,
        transmissionSpectrum: createFlatSpectrum(0.2),
      };

      textureArray.setMaterialData(updatedData);
      expect(textureArray.getTransmission(0, 1, 550)).toBeCloseTo(0.2, 2);
    });
  });

  describe('texture data generation', () => {
    it('should generate Float32Array for layer texture', () => {
      const materialData: ShapeMaterialData = {
        shapeIndex: 1,
        layerIndex: 0,
        transmissionSpectrum: createFlatSpectrum(0.5),
      };

      textureArray.setMaterialData(materialData);

      const textureData = textureArray.generateTextureData(0);

      expect(textureData).toBeInstanceOf(Float32Array);
      // Width = wavelengthResolution, Height = maxShapesPerLayer
      expect(textureData.length).toBe(100 * 256);
    });

    it('should have correct values in texture data', () => {
      const materialData: ShapeMaterialData = {
        shapeIndex: 1,
        layerIndex: 0,
        transmissionSpectrum: createFlatSpectrum(0.5),
      };

      textureArray.setMaterialData(materialData);

      const textureData = textureArray.generateTextureData(0);

      // Shape 0 (no shape) should be 1.0
      expect(textureData[0]).toBe(1.0);

      // Shape 1 should be 0.5
      // Index = shapeIndex * wavelengthResolution + wavelengthIndex
      const midWavelengthIndex = 50; // Middle of spectrum
      const shape1Index = 1 * 100 + midWavelengthIndex;
      expect(textureData[shape1Index]).toBeCloseTo(0.5, 2);
    });

    it('should interpolate wavelength correctly', () => {
      // Create spectrum with specific values at key wavelengths
      const spectrum: Float32Array = new Float32Array(100);
      for (let i = 0; i < 100; i++) {
        const wavelength = 380 + (i / 99) * (700 - 380);
        // Linear gradient from 0 at 380nm to 1 at 700nm
        spectrum[i] = (wavelength - 380) / (700 - 380);
      }

      const materialData: ShapeMaterialData = {
        shapeIndex: 1,
        layerIndex: 0,
        transmissionSpectrum: spectrum,
      };

      textureArray.setMaterialData(materialData);

      // Check interpolation at specific wavelengths
      const at380 = textureArray.getTransmission(0, 1, 380);
      const at540 = textureArray.getTransmission(0, 1, 540);
      const at700 = textureArray.getTransmission(0, 1, 700);

      expect(at380).toBeCloseTo(0, 1);
      expect(at540).toBeCloseTo(0.5, 1);
      expect(at700).toBeCloseTo(1, 1);
    });
  });

  describe('dirty tracking', () => {
    it('should mark layer dirty when material data changes', () => {
      expect(textureArray.isLayerDirty(0)).toBe(false);

      const materialData: ShapeMaterialData = {
        shapeIndex: 1,
        layerIndex: 0,
        transmissionSpectrum: createFlatSpectrum(0.5),
      };

      textureArray.setMaterialData(materialData);

      expect(textureArray.isLayerDirty(0)).toBe(true);
    });

    it('should clear dirty flag after generating texture', () => {
      const materialData: ShapeMaterialData = {
        shapeIndex: 1,
        layerIndex: 0,
        transmissionSpectrum: createFlatSpectrum(0.5),
      };

      textureArray.setMaterialData(materialData);
      expect(textureArray.isLayerDirty(0)).toBe(true);

      textureArray.generateTextureData(0);
      expect(textureArray.isLayerDirty(0)).toBe(false);
    });

    it('should only mark affected layer as dirty', () => {
      const materialData: ShapeMaterialData = {
        shapeIndex: 1,
        layerIndex: 2,
        transmissionSpectrum: createFlatSpectrum(0.5),
      };

      textureArray.setMaterialData(materialData);

      expect(textureArray.isLayerDirty(0)).toBe(false);
      expect(textureArray.isLayerDirty(1)).toBe(false);
      expect(textureArray.isLayerDirty(2)).toBe(true);
      expect(textureArray.isLayerDirty(3)).toBe(false);
    });
  });

  describe('clear and reset', () => {
    it('should clear material data for a shape', () => {
      const materialData: ShapeMaterialData = {
        shapeIndex: 1,
        layerIndex: 0,
        transmissionSpectrum: createFlatSpectrum(0.5),
      };

      textureArray.setMaterialData(materialData);
      expect(textureArray.getTransmission(0, 1, 550)).toBeCloseTo(0.5, 2);

      textureArray.clearShape(0, 1);

      // Should reset to full transmission
      expect(textureArray.getTransmission(0, 1, 550)).toBe(1.0);
    });

    it('should clear entire layer', () => {
      for (let i = 1; i <= 3; i++) {
        textureArray.setMaterialData({
          shapeIndex: i,
          layerIndex: 0,
          transmissionSpectrum: createFlatSpectrum(0.3),
        });
      }

      textureArray.clearLayer(0);

      for (let i = 1; i <= 3; i++) {
        expect(textureArray.getTransmission(0, i, 550)).toBe(1.0);
      }
    });

    it('should clear all layers', () => {
      for (let layer = 0; layer < 6; layer++) {
        textureArray.setMaterialData({
          shapeIndex: 1,
          layerIndex: layer,
          transmissionSpectrum: createFlatSpectrum(0.4),
        });
      }

      textureArray.clearAll();

      for (let layer = 0; layer < 6; layer++) {
        expect(textureArray.getTransmission(layer, 1, 550)).toBe(1.0);
      }
    });
  });
});

// Helper functions

function createFlatSpectrum(value: number): Float32Array {
  const spectrum = new Float32Array(100);
  spectrum.fill(value);
  return spectrum;
}

function createVaryingSpectrum(): Float32Array {
  const spectrum = new Float32Array(100);
  for (let i = 0; i < 100; i++) {
    // Create a sinusoidal variation
    spectrum[i] = 0.5 + 0.5 * Math.sin((i / 100) * Math.PI * 4);
  }
  return spectrum;
}

