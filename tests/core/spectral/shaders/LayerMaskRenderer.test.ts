/**
 * Tests for LayerMaskRenderer - renders shape masks to GPU textures
 * 
 * The LayerMaskRenderer generates textures where each pixel contains the
 * shape index (1-255) if inside a shape, or 0 if outside all shapes.
 * 
 * Each layer has its own mask texture (6 layers total).
 * Shapes within a layer are non-overlapping.
 * Shapes between layers can overlap.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LayerMaskRenderer,
  GPUShape,
  LayerMaskConfig,
} from '../../../../src/core/spectral/shaders/LayerMaskRenderer';
import { RectangleGeometry } from '../../../../src/core/spectral/geometry/RectangleGeometry';
import { CircleGeometry } from '../../../../src/core/spectral/geometry/CircleGeometry';

describe('LayerMaskRenderer', () => {
  let renderer: LayerMaskRenderer;
  const defaultConfig: LayerMaskConfig = {
    width: 100,
    height: 100,
    numLayers: 6,
  };

  beforeEach(() => {
    renderer = new LayerMaskRenderer(defaultConfig);
  });

  describe('initialization', () => {
    it('should create 6 layer masks by default', () => {
      expect(renderer.getNumLayers()).toBe(6);
    });

    it('should create configurable number of layers', () => {
      const customRenderer = new LayerMaskRenderer({ ...defaultConfig, numLayers: 3 });
      expect(customRenderer.getNumLayers()).toBe(3);
    });

    it('should start with no shapes', () => {
      expect(renderer.getShapeCount()).toBe(0);
      expect(renderer.getShapeCount(0)).toBe(0);
    });
  });

  describe('shape management', () => {
    it('should add a shape to a layer', () => {
      const shape: GPUShape = {
        id: 'rect1',
        layerIndex: 0,
        geometry: new RectangleGeometry(50, 50, 20, 20),
        materialId: 'water',
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      };

      renderer.addShape(shape);

      expect(renderer.getShapeCount()).toBe(1);
      expect(renderer.getShapeCount(0)).toBe(1);
    });

    it('should assign unique shape indices within a layer (1-255)', () => {
      const shape1: GPUShape = {
        id: 'rect1',
        layerIndex: 0,
        geometry: new RectangleGeometry(20, 20, 10, 10),
        materialId: 'water',
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      };

      const shape2: GPUShape = {
        id: 'rect2',
        layerIndex: 0,
        geometry: new RectangleGeometry(60, 60, 10, 10),
        materialId: 'crystal',
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      };

      renderer.addShape(shape1);
      renderer.addShape(shape2);

      const index1 = renderer.getShapeIndex('rect1');
      const index2 = renderer.getShapeIndex('rect2');

      expect(index1).toBeGreaterThan(0);
      expect(index1).toBeLessThanOrEqual(255);
      expect(index2).toBeGreaterThan(0);
      expect(index2).toBeLessThanOrEqual(255);
      expect(index1).not.toBe(index2);
    });

    it('should allow same shape index in different layers', () => {
      const shape1: GPUShape = {
        id: 'rect1',
        layerIndex: 0,
        geometry: new RectangleGeometry(50, 50, 20, 20),
        materialId: 'water',
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      };

      const shape2: GPUShape = {
        id: 'rect2',
        layerIndex: 1,
        geometry: new RectangleGeometry(50, 50, 20, 20),
        materialId: 'crystal',
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      };

      renderer.addShape(shape1);
      renderer.addShape(shape2);

      // Same position, different layers - both should have index 1
      const index1 = renderer.getShapeIndex('rect1');
      const index2 = renderer.getShapeIndex('rect2');

      // Indices can be the same since they're in different layers
      expect(index1).toBe(1);
      expect(index2).toBe(1);
    });

    it('should remove a shape', () => {
      const shape: GPUShape = {
        id: 'rect1',
        layerIndex: 0,
        geometry: new RectangleGeometry(50, 50, 20, 20),
        materialId: 'water',
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      };

      renderer.addShape(shape);
      expect(renderer.getShapeCount()).toBe(1);

      renderer.removeShape('rect1');
      expect(renderer.getShapeCount()).toBe(0);
    });

    it('should update shape position', () => {
      const shape: GPUShape = {
        id: 'rect1',
        layerIndex: 0,
        geometry: new RectangleGeometry(50, 50, 20, 20),
        materialId: 'water',
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      };

      renderer.addShape(shape);

      const newGeometry = new RectangleGeometry(70, 70, 20, 20);
      renderer.moveShape('rect1', newGeometry);

      const movedShape = renderer.getShape('rect1');
      expect(movedShape).not.toBeNull();
      expect(movedShape!.geometry).toBe(newGeometry);
    });
  });

  describe('mask generation', () => {
    it('should generate mask with shape index inside shape', () => {
      const shape: GPUShape = {
        id: 'rect1',
        layerIndex: 0,
        geometry: new RectangleGeometry(50, 50, 20, 20),
        materialId: 'water',
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      };

      renderer.addShape(shape);
      const mask = renderer.generateLayerMask(0);

      // Check point inside rectangle (50, 50) ± 10
      const insideX = 50;
      const insideY = 50;
      const index = mask[insideY * defaultConfig.width + insideX];

      expect(index).toBe(renderer.getShapeIndex('rect1'));
    });

    it('should generate mask with 0 outside all shapes', () => {
      const shape: GPUShape = {
        id: 'rect1',
        layerIndex: 0,
        geometry: new RectangleGeometry(50, 50, 10, 10),
        materialId: 'water',
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      };

      renderer.addShape(shape);
      const mask = renderer.generateLayerMask(0);

      // Check point outside rectangle
      const outsideX = 10;
      const outsideY = 10;
      const index = mask[outsideY * defaultConfig.width + outsideX];

      expect(index).toBe(0);
    });

    it('should handle circular shapes', () => {
      const shape: GPUShape = {
        id: 'circle1',
        layerIndex: 0,
        geometry: new CircleGeometry(50, 50, 15),
        materialId: 'water',
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      };

      renderer.addShape(shape);
      const mask = renderer.generateLayerMask(0);

      // Check center (should be inside)
      const centerIndex = mask[50 * defaultConfig.width + 50];
      expect(centerIndex).toBe(renderer.getShapeIndex('circle1'));

      // Check outside circle (should be 0)
      const outsideIndex = mask[10 * defaultConfig.width + 10];
      expect(outsideIndex).toBe(0);

      // Check edge (radius 15, so (50+15, 50) is on edge)
      // Point (66, 50) should be outside
      const edgeIndex = mask[50 * defaultConfig.width + 66];
      expect(edgeIndex).toBe(0);
    });

    it('should handle multiple non-overlapping shapes', () => {
      const shape1: GPUShape = {
        id: 'rect1',
        layerIndex: 0,
        geometry: new RectangleGeometry(25, 25, 10, 10),
        materialId: 'water',
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      };

      const shape2: GPUShape = {
        id: 'rect2',
        layerIndex: 0,
        geometry: new RectangleGeometry(75, 75, 10, 10),
        materialId: 'crystal',
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      };

      renderer.addShape(shape1);
      renderer.addShape(shape2);
      const mask = renderer.generateLayerMask(0);

      // Check first shape area
      const index1 = mask[25 * defaultConfig.width + 25];
      expect(index1).toBe(renderer.getShapeIndex('rect1'));

      // Check second shape area
      const index2 = mask[75 * defaultConfig.width + 75];
      expect(index2).toBe(renderer.getShapeIndex('rect2'));

      // Different indices
      expect(index1).not.toBe(index2);
    });

    it('should generate independent masks for each layer', () => {
      const shape1: GPUShape = {
        id: 'layer0-shape',
        layerIndex: 0,
        geometry: new RectangleGeometry(50, 50, 20, 20),
        materialId: 'water',
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      };

      const shape2: GPUShape = {
        id: 'layer1-shape',
        layerIndex: 1,
        geometry: new RectangleGeometry(50, 50, 20, 20),
        materialId: 'crystal',
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      };

      renderer.addShape(shape1);
      renderer.addShape(shape2);

      const mask0 = renderer.generateLayerMask(0);
      const mask1 = renderer.generateLayerMask(1);
      const mask2 = renderer.generateLayerMask(2); // Empty layer

      // Layer 0 should have shape1
      const layer0Index = mask0[50 * defaultConfig.width + 50];
      expect(layer0Index).toBe(renderer.getShapeIndex('layer0-shape'));

      // Layer 1 should have shape2
      const layer1Index = mask1[50 * defaultConfig.width + 50];
      expect(layer1Index).toBe(renderer.getShapeIndex('layer1-shape'));

      // Layer 2 should be empty
      const layer2Index = mask2[50 * defaultConfig.width + 50];
      expect(layer2Index).toBe(0);
    });
  });

  describe('property updates', () => {
    it('should update temperature', () => {
      const shape: GPUShape = {
        id: 'rect1',
        layerIndex: 0,
        geometry: new RectangleGeometry(50, 50, 20, 20),
        materialId: 'water',
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      };

      renderer.addShape(shape);
      renderer.setTemperature('rect1', 2000);

      const updatedShape = renderer.getShape('rect1');
      expect(updatedShape?.temperature).toBe(2000);
    });

    it('should update scattering coefficient', () => {
      const shape: GPUShape = {
        id: 'rect1',
        layerIndex: 0,
        geometry: new RectangleGeometry(50, 50, 20, 20),
        materialId: 'water',
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      };

      renderer.addShape(shape);
      renderer.setScattering('rect1', 0.5);

      const updatedShape = renderer.getShape('rect1');
      expect(updatedShape?.scatteringCoeff).toBe(0.5);
    });

    it('should update aura properties', () => {
      const shape: GPUShape = {
        id: 'rect1',
        layerIndex: 0,
        geometry: new RectangleGeometry(50, 50, 20, 20),
        materialId: 'water',
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      };

      renderer.addShape(shape);
      renderer.setAuraProperties('rect1', 30, 0.2);

      const updatedShape = renderer.getShape('rect1');
      expect(updatedShape?.auraRadius).toBe(30);
      expect(updatedShape?.auraDecay).toBe(0.2);
    });
  });

  describe('dirty tracking', () => {
    it('should mark layer dirty when shape added', () => {
      expect(renderer.isLayerDirty(0)).toBe(false);

      const shape: GPUShape = {
        id: 'rect1',
        layerIndex: 0,
        geometry: new RectangleGeometry(50, 50, 20, 20),
        materialId: 'water',
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      };

      renderer.addShape(shape);
      expect(renderer.isLayerDirty(0)).toBe(true);
    });

    it('should mark layer dirty when shape moved', () => {
      const shape: GPUShape = {
        id: 'rect1',
        layerIndex: 0,
        geometry: new RectangleGeometry(50, 50, 20, 20),
        materialId: 'water',
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      };

      renderer.addShape(shape);
      renderer.clearDirty(0);
      expect(renderer.isLayerDirty(0)).toBe(false);

      renderer.moveShape('rect1', new RectangleGeometry(60, 60, 20, 20));
      expect(renderer.isLayerDirty(0)).toBe(true);
    });

    it('should clear dirty flag after generating mask', () => {
      const shape: GPUShape = {
        id: 'rect1',
        layerIndex: 0,
        geometry: new RectangleGeometry(50, 50, 20, 20),
        materialId: 'water',
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      };

      renderer.addShape(shape);
      expect(renderer.isLayerDirty(0)).toBe(true);

      renderer.generateLayerMask(0);
      expect(renderer.isLayerDirty(0)).toBe(false);
    });
  });

  describe('layer uniforms', () => {
    it('should generate packed temperature uniforms', () => {
      // Add shapes to different layers with different temperatures
      for (let i = 0; i < 6; i++) {
        const shape: GPUShape = {
          id: `shape${i}`,
          layerIndex: i,
          geometry: new RectangleGeometry(50, 50, 10, 10),
          materialId: 'water',
          temperature: 1000 * (i + 1), // 1000, 2000, 3000, 4000, 5000, 6000
          scatteringCoeff: 0,
          auraRadius: 20,
          auraDecay: 0.1,
        };
        renderer.addShape(shape);
      }

      const temps = renderer.getLayerTemperatures();

      // Packed as 2 vec4s: [0].xyzw = layers 0-3, [1].xy = layers 4-5
      expect(temps).toHaveLength(8); // 2 vec4s = 8 floats
      expect(temps[0]).toBe(1000); // Layer 0
      expect(temps[1]).toBe(2000); // Layer 1
      expect(temps[2]).toBe(3000); // Layer 2
      expect(temps[3]).toBe(4000); // Layer 3
      expect(temps[4]).toBe(5000); // Layer 4
      expect(temps[5]).toBe(6000); // Layer 5
    });

    it('should generate packed scattering uniforms', () => {
      for (let i = 0; i < 6; i++) {
        const shape: GPUShape = {
          id: `shape${i}`,
          layerIndex: i,
          geometry: new RectangleGeometry(50, 50, 10, 10),
          materialId: 'water',
          temperature: 300,
          scatteringCoeff: 0.1 * (i + 1), // 0.1, 0.2, 0.3, 0.4, 0.5, 0.6
          auraRadius: 20,
          auraDecay: 0.1,
        };
        renderer.addShape(shape);
      }

      const scatter = renderer.getLayerScattering();

      expect(scatter).toHaveLength(8);
      expect(scatter[0]).toBeCloseTo(0.1, 5);
      expect(scatter[5]).toBeCloseTo(0.6, 5);
    });
  });
});

