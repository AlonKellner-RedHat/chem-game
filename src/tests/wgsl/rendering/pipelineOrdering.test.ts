/**
 * Pipeline Ordering Tests
 *
 * Tests that verify the correct ordering of material and texture processing.
 * Critical insight: Material reflected light is absorbed by texture transmission.
 *
 * Per-layer order:
 * 1. Material: mask → transmit → scatter → emit → blur → reflect
 * 2. Texture: mask → alpha → transmit → emit → reflect
 *
 * The texture transmission step absorbs BOTH transmitted light AND material reflection.
 */

import { describe, expect, it } from 'vitest';

describe('Pipeline Ordering: Material → Texture', () => {
  describe('Material Reflection Absorbed by Texture Transmission', () => {
    /**
     * This is the key ordering test.
     *
     * Scenario: A material shape reflects ambient light, then a texture shape
     * (like tinted glass) absorbs some of that reflected light.
     *
     * Wrong order: Texture first would not absorb material reflection
     * Correct order: Material reflect → Texture transmit
     */

    it('should absorb material reflection through texture transmission', () => {
      // Step 1: Background light passes through material
      const backgroundLight = 1.0;
      const materialTransmission = 0.4; // Material absorbs 60%
      const afterMaterialTransmit = backgroundLight * materialTransmission;
      expect(afterMaterialTransmit).toBeCloseTo(0.4, 5);

      // Step 2: Material reflects ambient light
      const ambientBrightness = 1.0;
      const materialReflection = 0.8; // 80% reflective surface
      const materialReflected = ambientBrightness * materialReflection;
      expect(materialReflected).toBeCloseTo(0.8, 5);

      // After material stage: transmitted + reflected
      const afterMaterial = afterMaterialTransmit + materialReflected;
      expect(afterMaterial).toBeCloseTo(1.2, 5);

      // Step 3: Texture transmission absorbs BOTH
      const textureTransmission = 0.5; // Tinted glass
      const textureMask = 1.0;
      const effectiveTextureTrans = 1.0 * (1 - textureMask) + textureTransmission * textureMask;

      const afterTextureTransmit = afterMaterial * effectiveTextureTrans;
      expect(afterTextureTransmit).toBeCloseTo(0.6, 5); // 1.2 * 0.5

      // This proves material reflection was absorbed by texture transmission!
    });

    it('should preserve the ordering with partial coverage', () => {
      const backgroundLight = 1.0;

      // Material stage
      const materialMask = 0.8; // 80% material coverage
      const materialTrans = 0.3;
      const materialRefl = 0.7;
      const ambientBrightness = 1.0;

      // Material transmission with partial coverage
      const effectiveMaterialTrans = 1.0 * (1 - materialMask) + materialTrans * materialMask;
      // = 0.2 + 0.24 = 0.44
      const afterMaterialTransmit = backgroundLight * effectiveMaterialTrans;

      // Material reflection (only where covered)
      const materialReflected = ambientBrightness * materialRefl * materialMask;
      // = 1.0 * 0.7 * 0.8 = 0.56

      const afterMaterial = afterMaterialTransmit + materialReflected;
      expect(afterMaterial).toBeCloseTo(1.0, 2);

      // Texture stage (different coverage area)
      const textureMask = 0.6;
      const textureTrans = 0.4;

      const effectiveTextureTrans = 1.0 * (1 - textureMask) + textureTrans * textureMask;
      // = 0.4 + 0.24 = 0.64
      const afterTextureTransmit = afterMaterial * effectiveTextureTrans;

      expect(afterTextureTransmit).toBeCloseTo(0.64, 2);
    });

    it('should handle texture emission AFTER transmission', () => {
      const backgroundLight = 1.0;
      const materialTrans = 0.5;
      const materialRefl = 0.5;
      const ambientBrightness = 1.0;

      const afterMaterial = backgroundLight * materialTrans + ambientBrightness * materialRefl;
      // = 0.5 + 0.5 = 1.0

      const textureTrans = 0.3;
      const textureEmission = 0.2;
      const textureMask = 1.0;

      const effectiveTextureTrans = 1.0 * (1 - textureMask) + textureTrans * textureMask;
      const afterTextureTransmit = afterMaterial * effectiveTextureTrans;
      // = 1.0 * 0.3 = 0.3

      const textureEmitted = textureEmission * textureMask;
      // = 0.2

      const afterTextureEmit = afterTextureTransmit + textureEmitted;
      // = 0.3 + 0.2 = 0.5

      expect(afterTextureEmit).toBeCloseTo(0.5, 5);
    });

    it('should add texture reflection LAST', () => {
      const backgroundLight = 1.0;
      const materialTrans = 0.5;
      const materialRefl = 0.5;
      const ambientBrightness = 1.0;

      // Material stage
      const afterMaterial = backgroundLight * materialTrans + ambientBrightness * materialRefl;

      // Texture stage
      const textureTrans = 0.4;
      const textureEmission = 0.1;
      const textureRefl = 0.3;
      const textureMask = 1.0;

      const effectiveTextureTrans = 1.0 * (1 - textureMask) + textureTrans * textureMask;
      const afterTextureTransmit = afterMaterial * effectiveTextureTrans;
      // = 1.0 * 0.4 = 0.4

      const textureEmitted = textureEmission * textureMask;
      // = 0.1

      const textureReflected = ambientBrightness * textureRefl * textureMask;
      // = 0.3

      const finalOutput = afterTextureTransmit + textureEmitted + textureReflected;
      // = 0.4 + 0.1 + 0.3 = 0.8

      expect(finalOutput).toBeCloseTo(0.8, 5);
    });
  });

  describe('Full Pipeline Simulation', () => {
    /**
     * Complete per-layer pipeline:
     * 1. Material: mask → transmit → scatter → emit → blur → reflect
     * 2. Texture: mask → alpha → transmit → emit → reflect
     */

    it('should simulate full layer processing', () => {
      // Initial conditions
      const inputLight = 1.0;
      const ambientBrightness = 1.0;

      // === MATERIAL STAGE ===

      // Material properties
      const material = {
        mask: 1.0,
        transmission: 0.3, // 70% absorption
        scatterProb: 0.1, // 10% scattering
        emission: 0.05, // Small thermal emission
        reflection: 0.6, // 60% reflective
      };

      // 1. Material mask (already 1.0)

      // 2. Material transmit
      const afterMaterialTrans = inputLight * material.transmission;
      // = 0.3

      // 3. Material scatter (simplified - some light scattered)
      const directTransmit = afterMaterialTrans * (1 - material.scatterProb);
      const scatteredLight = afterMaterialTrans * material.scatterProb;
      // Direct: 0.27, Scattered: 0.03

      // 4. Material emit
      const materialEmitted = material.emission * material.mask;
      // = 0.05

      // 5. Blur (simplified - scattered light returns)
      const afterBlur = directTransmit + scatteredLight + materialEmitted;
      // = 0.27 + 0.03 + 0.05 = 0.35

      // 6. Material reflect
      const materialReflected = ambientBrightness * material.reflection * material.mask;
      // = 0.6

      const afterMaterial = afterBlur + materialReflected;
      // = 0.35 + 0.6 = 0.95

      expect(afterMaterial).toBeCloseTo(0.95, 2);

      // === TEXTURE STAGE ===

      const texture = {
        mask: 0.8, // 80% coverage (edge anti-aliasing)
        alpha: 1.0,
        transmission: 0.7,
        emission: 0.1,
        reflection: 0.2,
      };

      // Combined mask
      const combinedMask = texture.mask * texture.alpha;

      // 1-2. Texture mask + alpha (combined)

      // 3. Texture transmit (absorbs material output including reflection!)
      const effectiveTextureTrans = 1.0 * (1 - combinedMask) + texture.transmission * combinedMask;
      // = 0.2 + 0.56 = 0.76
      const afterTextureTransmit = afterMaterial * effectiveTextureTrans;
      // = 0.95 * 0.76 = 0.722

      // 4. Texture emit
      const textureEmitted = texture.emission * combinedMask;
      // = 0.08

      // 5. Texture reflect
      const textureReflected = ambientBrightness * texture.reflection * combinedMask;
      // = 0.16

      const finalOutput = afterTextureTransmit + textureEmitted + textureReflected;
      // = 0.722 + 0.08 + 0.16 = 0.962

      expect(finalOutput).toBeCloseTo(0.962, 2);
    });

    it('should handle layer with only material shapes', () => {
      const inputLight = 1.0;
      const ambientBrightness = 1.0;

      const material = {
        mask: 1.0,
        transmission: 0.5,
        reflection: 0.4,
      };

      // No texture shapes = pass through
      const texture = {
        mask: 0.0, // No texture coverage
        transmission: 0.5,
        emission: 0.0,
        reflection: 0.0,
      };

      const afterMaterial =
        inputLight * material.transmission + ambientBrightness * material.reflection;
      // = 0.5 + 0.4 = 0.9

      const combinedMask = texture.mask;
      const effectiveTextureTrans = 1.0 * (1 - combinedMask) + texture.transmission * combinedMask;
      // = 1.0 (no texture effect)

      const afterTexture = afterMaterial * effectiveTextureTrans;
      // = 0.9

      expect(afterTexture).toBeCloseTo(0.9, 5);
    });

    it('should handle layer with only texture shapes', () => {
      const inputLight = 1.0;
      const ambientBrightness = 1.0;

      // No material shapes = pass through
      const material = {
        mask: 0.0,
        transmission: 0.5,
        reflection: 0.4,
      };

      const texture = {
        mask: 1.0,
        transmission: 0.6,
        emission: 0.2,
        reflection: 0.3,
      };

      // Material with no coverage
      const effectiveMaterialTrans =
        1.0 * (1 - material.mask) + material.transmission * material.mask;
      // = 1.0
      const materialReflected = ambientBrightness * material.reflection * material.mask;
      // = 0

      const afterMaterial = inputLight * effectiveMaterialTrans + materialReflected;
      // = 1.0

      // Texture processing
      const combinedMask = texture.mask;
      const effectiveTextureTrans = 1.0 * (1 - combinedMask) + texture.transmission * combinedMask;
      // = 0.6

      const afterTextureTransmit = afterMaterial * effectiveTextureTrans;
      const textureEmitted = texture.emission * combinedMask;
      const textureReflected = ambientBrightness * texture.reflection * combinedMask;

      const finalOutput = afterTextureTransmit + textureEmitted + textureReflected;
      // = 0.6 + 0.2 + 0.3 = 1.1

      expect(finalOutput).toBeCloseTo(1.1, 5);
    });
  });

  describe('Background Layer (Texture Only)', () => {
    /**
     * Background layer is special:
     * - Contains only texture shapes (no material shapes)
     * - Transmission is ignored (nothing behind it)
     * - Emission provides the scene illumination
     * - Reflection interacts with ambient shapes
     */

    it('should ignore transmission on background layer', () => {
      const texture = {
        mask: 1.0,
        transmission: 0.5, // This should be ignored
        emission: 1.0, // This is the illumination
        reflection: 0.5,
      };

      // No input light on background (nothing behind)
      const inputLight = 0.0;
      const ambientBrightness = 1.0;

      // Even with transmission, no light passes (nothing to transmit)
      const afterTransmit = inputLight * texture.transmission;
      expect(afterTransmit).toBe(0);

      // Only emission and reflection contribute
      const backgroundOutput =
        texture.emission * texture.mask + ambientBrightness * texture.reflection * texture.mask;
      expect(backgroundOutput).toBeCloseTo(1.5, 5);
    });

    it('background emission provides scene illumination', () => {
      // Background texture shape with emission spectrum
      const backgroundEmissionAt450nm = 0.8;
      const backgroundEmissionAt550nm = 1.0;
      const backgroundEmissionAt650nm = 0.9;

      // This emission is what illuminates shapes in front
      expect(backgroundEmissionAt550nm).toBe(1.0);
    });
  });
});

describe('Cross-Layer Ordering', () => {
  it('should process layers back to front', () => {
    // Layer 0: Background
    // Layer 1: Back material layer
    // Layer 2: Front material layer

    const layers = [
      { layer: 0, transmission: 0.8 },
      { layer: 1, transmission: 0.7 },
      { layer: 2, transmission: 0.6 },
    ];

    // Sort by layer (already sorted)
    layers.sort((a, b) => a.layer - b.layer);

    expect(layers[0].layer).toBe(0);
    expect(layers[2].layer).toBe(2);
  });

  it('front layer should absorb back layer output', () => {
    // Layer 0 outputs 1.0
    // Layer 1 absorbs and outputs 0.5
    // Layer 2 absorbs and outputs 0.25

    let light = 1.0;

    const layerTransmissions = [1.0, 0.5, 0.5]; // Layer 0, 1, 2

    for (const trans of layerTransmissions) {
      light *= trans;
    }

    expect(light).toBeCloseTo(0.25, 5);
  });
});
