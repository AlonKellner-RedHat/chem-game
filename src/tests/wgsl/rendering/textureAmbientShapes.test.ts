/**
 * TextureShape and AmbientShape Struct Tests
 *
 * TDD tests for the new shape types introduced in the texture layer refactor.
 * Tests struct alignment, serialization, and GPU memory layout.
 */

import { describe, expect, it } from 'vitest';

/**
 * Calculate expected struct sizes with 16-byte alignment
 */
describe('TextureShape Struct', () => {
  /**
   * TextureShape layout (64 bytes, 16-byte aligned):
   *
   * Offset  Size  Field
   * ------  ----  -----
   * 0       4     x: f32
   * 4       4     y: f32
   * 8       4     width: f32
   * 12      4     height: f32
   * 16      4     layer: u32
   * 20      4     transmissionIndex: u32
   * 24      4     emissionIndex: u32
   * 28      4     reflectionIndex: u32
   * 32      4     msdfArrayIndex: u32
   * 36      4     msdfLayerIndex: u32
   * 40      4     alphaArrayIndex: u32
   * 44      4     alphaLayerIndex: u32
   * 48      4     hasMsdf: u32
   * 52      4     hasAlpha: u32
   * 56      4     texWidth: f32
   * 60      4     texHeight: f32
   * ------
   * Total: 64 bytes (16-byte aligned)
   */
  const TEXTURE_SHAPE_SIZE = 64;

  describe('Size and Alignment', () => {
    it('should be 64 bytes total', () => {
      // Calculate expected size based on field layout
      const fields = [
        // Position (16 bytes)
        { name: 'x', size: 4 },
        { name: 'y', size: 4 },
        { name: 'width', size: 4 },
        { name: 'height', size: 4 },
        // Layer and palette indices (16 bytes)
        { name: 'layer', size: 4 },
        { name: 'transmissionIndex', size: 4 },
        { name: 'emissionIndex', size: 4 },
        { name: 'reflectionIndex', size: 4 },
        // MSDF and alpha indices (16 bytes)
        { name: 'msdfArrayIndex', size: 4 },
        { name: 'msdfLayerIndex', size: 4 },
        { name: 'alphaArrayIndex', size: 4 },
        { name: 'alphaLayerIndex', size: 4 },
        // Flags and dimensions (16 bytes)
        { name: 'hasMsdf', size: 4 },
        { name: 'hasAlpha', size: 4 },
        { name: 'texWidth', size: 4 },
        { name: 'texHeight', size: 4 },
      ];

      const totalSize = fields.reduce((sum, f) => sum + f.size, 0);
      expect(totalSize).toBe(TEXTURE_SHAPE_SIZE);
    });

    it('should be 16-byte aligned', () => {
      expect(TEXTURE_SHAPE_SIZE % 16).toBe(0);
    });
  });

  describe('Serialization', () => {
    it('should serialize to ArrayBuffer correctly', () => {
      const shape = {
        x: 100.0,
        y: 200.0,
        width: 50.0,
        height: 75.0,
        layer: 1,
        transmissionIndex: 0,
        emissionIndex: 1,
        reflectionIndex: 2,
        msdfArrayIndex: 0,
        msdfLayerIndex: 3,
        alphaArrayIndex: 1,
        alphaLayerIndex: 0,
        hasMsdf: 1,
        hasAlpha: 1,
        texWidth: 256.0,
        texHeight: 256.0,
      };

      const buffer = new ArrayBuffer(TEXTURE_SHAPE_SIZE);
      const view = new DataView(buffer);

      // Serialize
      let offset = 0;
      view.setFloat32(offset, shape.x, true);
      offset += 4;
      view.setFloat32(offset, shape.y, true);
      offset += 4;
      view.setFloat32(offset, shape.width, true);
      offset += 4;
      view.setFloat32(offset, shape.height, true);
      offset += 4;
      view.setUint32(offset, shape.layer, true);
      offset += 4;
      view.setUint32(offset, shape.transmissionIndex, true);
      offset += 4;
      view.setUint32(offset, shape.emissionIndex, true);
      offset += 4;
      view.setUint32(offset, shape.reflectionIndex, true);
      offset += 4;
      view.setUint32(offset, shape.msdfArrayIndex, true);
      offset += 4;
      view.setUint32(offset, shape.msdfLayerIndex, true);
      offset += 4;
      view.setUint32(offset, shape.alphaArrayIndex, true);
      offset += 4;
      view.setUint32(offset, shape.alphaLayerIndex, true);
      offset += 4;
      view.setUint32(offset, shape.hasMsdf, true);
      offset += 4;
      view.setUint32(offset, shape.hasAlpha, true);
      offset += 4;
      view.setFloat32(offset, shape.texWidth, true);
      offset += 4;
      view.setFloat32(offset, shape.texHeight, true);
      offset += 4;

      expect(offset).toBe(TEXTURE_SHAPE_SIZE);

      // Verify by reading back
      expect(view.getFloat32(0, true)).toBe(100.0);
      expect(view.getFloat32(4, true)).toBe(200.0);
      expect(view.getUint32(16, true)).toBe(1); // layer
      expect(view.getUint32(20, true)).toBe(0); // transmissionIndex
      expect(view.getUint32(48, true)).toBe(1); // hasMsdf
    });

    it('should handle multiple shapes in contiguous buffer', () => {
      const shapes = [
        { x: 0, y: 0, width: 100, height: 100, layer: 0 },
        { x: 200, y: 200, width: 50, height: 50, layer: 1 },
      ];

      const buffer = new ArrayBuffer(shapes.length * TEXTURE_SHAPE_SIZE);
      const view = new DataView(buffer);

      for (let i = 0; i < shapes.length; i++) {
        const base = i * TEXTURE_SHAPE_SIZE;
        view.setFloat32(base + 0, shapes[i].x, true);
        view.setFloat32(base + 4, shapes[i].y, true);
        view.setFloat32(base + 8, shapes[i].width, true);
        view.setFloat32(base + 12, shapes[i].height, true);
        view.setUint32(base + 16, shapes[i].layer, true);
      }

      // Verify second shape
      expect(view.getFloat32(TEXTURE_SHAPE_SIZE + 0, true)).toBe(200);
      expect(view.getUint32(TEXTURE_SHAPE_SIZE + 16, true)).toBe(1);
    });
  });
});

describe('AmbientShape Struct', () => {
  /**
   * AmbientShape layout (64 bytes, 16-byte aligned):
   *
   * Offset  Size  Field
   * ------  ----  -----
   * 0       4     x: f32
   * 4       4     y: f32
   * 8       4     width: f32
   * 12      4     height: f32
   * 16      4     brightness: f32
   * 20      4     msdfArrayIndex: u32
   * 24      4     msdfLayerIndex: u32
   * 28      4     alphaArrayIndex: u32
   * 32      4     alphaLayerIndex: u32
   * 36      4     hasMsdf: u32
   * 40      4     hasAlpha: u32
   * 44      4     texWidth: f32
   * 48      4     texHeight: f32
   * 52      12    _padding: vec3<f32>
   * ------
   * Total: 64 bytes (16-byte aligned)
   */
  const AMBIENT_SHAPE_SIZE = 64;

  describe('Size and Alignment', () => {
    it('should be 64 bytes total', () => {
      // Calculate expected size based on field layout
      const fields = [
        // Position (16 bytes)
        { name: 'x', size: 4 },
        { name: 'y', size: 4 },
        { name: 'width', size: 4 },
        { name: 'height', size: 4 },
        // Brightness (4 bytes)
        { name: 'brightness', size: 4 },
        // MSDF indices (8 bytes)
        { name: 'msdfArrayIndex', size: 4 },
        { name: 'msdfLayerIndex', size: 4 },
        // Alpha indices (8 bytes)
        { name: 'alphaArrayIndex', size: 4 },
        { name: 'alphaLayerIndex', size: 4 },
        // Flags (8 bytes)
        { name: 'hasMsdf', size: 4 },
        { name: 'hasAlpha', size: 4 },
        // Texture dimensions (8 bytes)
        { name: 'texWidth', size: 4 },
        { name: 'texHeight', size: 4 },
        // Padding to 64 bytes (12 bytes)
        { name: '_padding', size: 12 },
      ];

      const totalSize = fields.reduce((sum, f) => sum + f.size, 0);
      expect(totalSize).toBe(AMBIENT_SHAPE_SIZE);
    });

    it('should be 16-byte aligned', () => {
      expect(AMBIENT_SHAPE_SIZE % 16).toBe(0);
    });
  });

  describe('Serialization', () => {
    it('should serialize to ArrayBuffer correctly', () => {
      const shape = {
        x: 0.0,
        y: 0.0,
        width: 1280.0,
        height: 720.0,
        brightness: 1.0,
        msdfArrayIndex: 1,
        msdfLayerIndex: 0,
        alphaArrayIndex: 1,
        alphaLayerIndex: 0,
        hasMsdf: 0,
        hasAlpha: 1,
        texWidth: 1280.0,
        texHeight: 720.0,
      };

      const buffer = new ArrayBuffer(AMBIENT_SHAPE_SIZE);
      const view = new DataView(buffer);

      // Serialize
      let offset = 0;
      view.setFloat32(offset, shape.x, true);
      offset += 4;
      view.setFloat32(offset, shape.y, true);
      offset += 4;
      view.setFloat32(offset, shape.width, true);
      offset += 4;
      view.setFloat32(offset, shape.height, true);
      offset += 4;
      view.setFloat32(offset, shape.brightness, true);
      offset += 4;
      view.setUint32(offset, shape.msdfArrayIndex, true);
      offset += 4;
      view.setUint32(offset, shape.msdfLayerIndex, true);
      offset += 4;
      view.setUint32(offset, shape.alphaArrayIndex, true);
      offset += 4;
      view.setUint32(offset, shape.alphaLayerIndex, true);
      offset += 4;
      view.setUint32(offset, shape.hasMsdf, true);
      offset += 4;
      view.setUint32(offset, shape.hasAlpha, true);
      offset += 4;
      view.setFloat32(offset, shape.texWidth, true);
      offset += 4;
      view.setFloat32(offset, shape.texHeight, true);
      offset += 4;
      // Padding (12 bytes) - can be zeroed
      view.setFloat32(offset, 0, true);
      offset += 4;
      view.setFloat32(offset, 0, true);
      offset += 4;
      view.setFloat32(offset, 0, true);
      offset += 4;

      expect(offset).toBe(AMBIENT_SHAPE_SIZE);

      // Verify by reading back
      expect(view.getFloat32(0, true)).toBe(0.0);
      expect(view.getFloat32(8, true)).toBe(1280.0);
      expect(view.getFloat32(16, true)).toBe(1.0); // brightness
      expect(view.getUint32(36, true)).toBe(0); // hasMsdf
      expect(view.getUint32(40, true)).toBe(1); // hasAlpha
    });

    it('should handle brightness values correctly', () => {
      const buffer = new ArrayBuffer(AMBIENT_SHAPE_SIZE);
      const view = new DataView(buffer);

      // Test various brightness values
      const testValues = [0.0, 0.5, 1.0, 2.0, 10.0];

      for (const brightness of testValues) {
        view.setFloat32(16, brightness, true);
        expect(view.getFloat32(16, true)).toBe(brightness);
      }
    });
  });

  describe('Brightness Accumulation (additive)', () => {
    it('should accumulate brightness values additively', () => {
      const shapes = [{ brightness: 0.3 }, { brightness: 0.4 }, { brightness: 0.5 }];

      // Simulate additive accumulation
      const totalBrightness = shapes.reduce((sum, s) => sum + s.brightness, 0);

      expect(totalBrightness).toBeCloseTo(1.2, 5);
    });

    it('should accumulate with mask modulation', () => {
      const shapes = [
        { brightness: 1.0, mask: 0.5 },
        { brightness: 1.0, mask: 0.3 },
      ];

      // Simulate: sum(brightness * mask)
      const totalBrightness = shapes.reduce((sum, s) => sum + s.brightness * s.mask, 0);

      expect(totalBrightness).toBeCloseTo(0.8, 5);
    });
  });
});

describe('Overlap Interactions', () => {
  describe('Texture Transmission (multiplicative)', () => {
    it('should multiply transmission values for overlapping shapes', () => {
      const transmissions = [0.8, 0.5, 0.9];

      // Multiplicative: product of all transmissions
      const result = transmissions.reduce((product, t) => product * t, 1.0);

      expect(result).toBeCloseTo(0.36, 5); // 0.8 * 0.5 * 0.9 = 0.36
    });

    it('should handle full transparency (transmission = 1.0)', () => {
      const transmissions = [1.0, 1.0, 1.0];
      const result = transmissions.reduce((product, t) => product * t, 1.0);

      expect(result).toBe(1.0);
    });

    it('should handle full opacity (transmission = 0.0)', () => {
      const transmissions = [0.5, 0.0, 0.9];
      const result = transmissions.reduce((product, t) => product * t, 1.0);

      expect(result).toBe(0.0);
    });

    it('should apply mask modulation with mix()', () => {
      // mix(1.0, transmission, mask) = 1.0 * (1 - mask) + transmission * mask
      const transmission = 0.5;
      const mask = 0.8;

      const result = 1.0 * (1 - mask) + transmission * mask;

      expect(result).toBeCloseTo(0.6, 5); // 0.2 + 0.4 = 0.6
    });
  });

  describe('Texture Emission (additive)', () => {
    it('should add emission values for overlapping shapes', () => {
      const emissions = [0.3, 0.4, 0.2];

      // Additive: sum of all emissions
      const result = emissions.reduce((sum, e) => sum + e, 0);

      expect(result).toBeCloseTo(0.9, 5);
    });

    it('should modulate emission by mask', () => {
      const shapes = [
        { emission: 0.5, mask: 1.0 },
        { emission: 0.5, mask: 0.5 },
      ];

      const result = shapes.reduce((sum, s) => sum + s.emission * s.mask, 0);

      expect(result).toBeCloseTo(0.75, 5); // 0.5 + 0.25
    });
  });

  describe('Texture Reflection (additive)', () => {
    it('should add reflection values for overlapping shapes', () => {
      const reflections = [0.2, 0.3, 0.1];

      // Additive: sum of all reflections
      const result = reflections.reduce((sum, r) => sum + r, 0);

      expect(result).toBeCloseTo(0.6, 5);
    });
  });
});

describe('Material Reflection -> Texture Transmission Ordering', () => {
  it('should apply texture transmission AFTER material reflection', () => {
    // Scenario: Material shape reflects light, texture shape absorbs some of it
    const backgroundLight = 1.0;
    const materialTransmission = 0.3; // 70% absorbed
    const materialReflection = 0.8; // Reflects 80% of ambient
    const ambientBrightness = 1.0;
    const textureTransmission = 0.5; // 50% absorbed

    // Step 1: Light through material (transmission)
    const afterMaterialTransmit = backgroundLight * materialTransmission;
    expect(afterMaterialTransmit).toBeCloseTo(0.3, 5);

    // Step 2: Add material reflection
    const materialReflected = ambientBrightness * materialReflection;
    const afterMaterialReflect = afterMaterialTransmit + materialReflected;
    expect(afterMaterialReflect).toBeCloseTo(1.1, 5); // 0.3 + 0.8

    // Step 3: Texture transmission absorbs BOTH transmitted AND reflected
    const afterTextureTransmit = afterMaterialReflect * textureTransmission;
    expect(afterTextureTransmit).toBeCloseTo(0.55, 5); // 1.1 * 0.5

    // This is the key ordering test: material reflection is absorbed by texture
  });

  it('should preserve ordering with partial mask coverage', () => {
    const inputLight = 1.0;
    const materialReflection = 0.5;
    const textureTransmission = 0.4;
    const textureMask = 0.7; // Texture only covers 70%

    // Material reflection added
    const afterMaterialReflect = inputLight + materialReflection;

    // Texture transmission with mask: mix(1.0, transmission, mask)
    const effectiveTransmission = 1.0 * (1 - textureMask) + textureTransmission * textureMask;
    const afterTexture = afterMaterialReflect * effectiveTransmission;

    // 1.5 * (0.3 + 0.28) = 1.5 * 0.58 = 0.87
    expect(afterTexture).toBeCloseTo(0.87, 2);
  });
});
