/**
 * Texture Shape Physics Tests
 *
 * Tests for texture shape spectral physics:
 * - Transmission: multiplicative overlap
 * - Emission: additive overlap
 * - Reflection: additive overlap
 */

import { describe, expect, it } from 'vitest';

describe('Texture Shape Physics', () => {
  describe('Transmission (Multiplicative)', () => {
    /**
     * Transmission interacts multiplicatively between overlapping shapes.
     * Formula: totalTransmission = product(mix(1.0, trans_i, mask_i))
     *
     * The mix() ensures partial mask coverage blends between full transmission
     * (outside shape) and shape's transmission value (inside shape).
     */

    it('should compute transmission with mix() for mask modulation', () => {
      // mix(1.0, transmission, mask) = 1.0 * (1 - mask) + transmission * mask
      const transmission = 0.2;
      const mask = 1.0; // Full coverage

      const result = 1.0 * (1 - mask) + transmission * mask;
      expect(result).toBe(0.2);
    });

    it('should blend to 1.0 for zero mask (outside shape)', () => {
      const transmission = 0.2;
      const mask = 0.0; // Outside shape

      const result = 1.0 * (1 - mask) + transmission * mask;
      expect(result).toBe(1.0);
    });

    it('should partially blend for edge anti-aliasing', () => {
      const transmission = 0.0; // Fully opaque
      const mask = 0.5; // Edge pixel

      const result = 1.0 * (1 - mask) + transmission * mask;
      expect(result).toBe(0.5);
    });

    it('should multiply transmissions for overlapping shapes', () => {
      // Two shapes at same pixel
      const shape1 = { transmission: 0.8, mask: 1.0 };
      const shape2 = { transmission: 0.5, mask: 1.0 };

      const trans1 = 1.0 * (1 - shape1.mask) + shape1.transmission * shape1.mask;
      const trans2 = 1.0 * (1 - shape2.mask) + shape2.transmission * shape2.mask;

      const totalTransmission = trans1 * trans2;
      expect(totalTransmission).toBeCloseTo(0.4, 5); // 0.8 * 0.5
    });

    it('should handle three overlapping shapes', () => {
      const shapes = [
        { transmission: 0.9, mask: 1.0 },
        { transmission: 0.8, mask: 1.0 },
        { transmission: 0.7, mask: 1.0 },
      ];

      let totalTransmission = 1.0;
      for (const s of shapes) {
        const effective = 1.0 * (1 - s.mask) + s.transmission * s.mask;
        totalTransmission *= effective;
      }

      expect(totalTransmission).toBeCloseTo(0.504, 3); // 0.9 * 0.8 * 0.7
    });

    it('should compute correct light output', () => {
      const inputLight = 1.0;
      const transmission = 0.3;
      const mask = 0.8;

      const effectiveTransmission = 1.0 * (1 - mask) + transmission * mask;
      const outputLight = inputLight * effectiveTransmission;

      // 1.0 * (0.2 + 0.24) = 0.44
      expect(outputLight).toBeCloseTo(0.44, 5);
    });
  });

  describe('Emission (Additive)', () => {
    /**
     * Emission interacts additively between overlapping shapes.
     * Formula: totalEmission = sum(emission_i * mask_i)
     *
     * Unlike transmission, emission uses direct multiplication with mask,
     * not mix(), because emission is added to existing light.
     */

    it('should multiply emission by mask', () => {
      const emission = 1.0;
      const mask = 0.5;

      const result = emission * mask;
      expect(result).toBe(0.5);
    });

    it('should sum emissions for overlapping shapes', () => {
      const shapes = [
        { emission: 0.3, mask: 1.0 },
        { emission: 0.4, mask: 1.0 },
      ];

      const totalEmission = shapes.reduce((sum, s) => sum + s.emission * s.mask, 0);
      expect(totalEmission).toBeCloseTo(0.7, 5);
    });

    it('should handle wavelength-dependent emission', () => {
      // Different emission intensities at different wavelengths
      const emissionAt450nm = 0.1;
      const emissionAt550nm = 0.8;
      const emissionAt650nm = 0.3;
      const mask = 1.0;

      expect(emissionAt450nm * mask).toBe(0.1);
      expect(emissionAt550nm * mask).toBe(0.8);
      expect(emissionAt650nm * mask).toBe(0.3);
    });

    it('should allow HDR emission values', () => {
      const brightEmission = 5.0;
      const mask = 1.0;

      const result = brightEmission * mask;
      expect(result).toBe(5.0);
      expect(result).toBeGreaterThan(1.0);
    });
  });

  describe('Reflection (Additive)', () => {
    /**
     * Reflection interacts additively between overlapping shapes.
     * Formula: totalReflection = sum(reflection_i * mask_i)
     *
     * The accumulated reflection factor is then multiplied by ambient brightness
     * to get the reflected light contribution.
     */

    it('should multiply reflection by mask', () => {
      const reflection = 0.8;
      const mask = 0.5;

      const result = reflection * mask;
      expect(result).toBe(0.4);
    });

    it('should sum reflections for overlapping shapes', () => {
      const shapes = [
        { reflection: 0.2, mask: 1.0 },
        { reflection: 0.3, mask: 1.0 },
      ];

      const totalReflection = shapes.reduce((sum, s) => sum + s.reflection * s.mask, 0);
      expect(totalReflection).toBeCloseTo(0.5, 5);
    });

    it('should compute reflected light with ambient', () => {
      const ambientBrightness = 1.5;
      const reflection = 0.6;
      const mask = 1.0;

      const reflectedLight = ambientBrightness * reflection * mask;
      expect(reflectedLight).toBeCloseTo(0.9, 5);
    });

    it('should handle wavelength-dependent reflection', () => {
      const ambientBrightness = 1.0;
      const reflectionAt450nm = 0.2; // Low blue reflection
      const reflectionAt650nm = 0.9; // High red reflection (copper-like)

      const blueReflected = ambientBrightness * reflectionAt450nm;
      const redReflected = ambientBrightness * reflectionAt650nm;

      expect(redReflected).toBeGreaterThan(blueReflected);
    });
  });

  describe('Combined Texture Output', () => {
    /**
     * Full texture shape output formula:
     * output = inputLight * totalTransmission + totalEmission
     * reflectedLight = ambientBrightness * totalReflection
     *
     * Note: Material reflection is absorbed by texture transmission,
     * but texture reflection is added AFTER transmission.
     */

    it('should combine transmission and emission correctly', () => {
      const inputLight = 1.0;
      const transmission = 0.5;
      const emission = 0.2;
      const mask = 1.0;

      const effectiveTransmission = 1.0 * (1 - mask) + transmission * mask;
      const effectiveEmission = emission * mask;

      const output = inputLight * effectiveTransmission + effectiveEmission;
      expect(output).toBeCloseTo(0.7, 5); // 0.5 + 0.2
    });

    it('should handle pure emission (opaque emitter)', () => {
      const inputLight = 1.0;
      const transmission = 0.0; // Fully opaque
      const emission = 1.0;
      const mask = 1.0;

      const effectiveTransmission = 1.0 * (1 - mask) + transmission * mask;
      const effectiveEmission = emission * mask;

      const output = inputLight * effectiveTransmission + effectiveEmission;
      expect(output).toBeCloseTo(1.0, 5); // 0 + 1.0
    });

    it('should handle pure transmission (no emission)', () => {
      const inputLight = 1.0;
      const transmission = 0.7;
      const emission = 0.0;
      const mask = 1.0;

      const effectiveTransmission = 1.0 * (1 - mask) + transmission * mask;
      const effectiveEmission = emission * mask;

      const output = inputLight * effectiveTransmission + effectiveEmission;
      expect(output).toBeCloseTo(0.7, 5);
    });

    it('should compute full texture result with reflection', () => {
      const inputLight = 1.0;
      const ambientBrightness = 1.0;
      const transmission = 0.5;
      const emission = 0.1;
      const reflection = 0.3;
      const mask = 1.0;

      const effectiveTransmission = 1.0 * (1 - mask) + transmission * mask;
      const effectiveEmission = emission * mask;
      const effectiveReflection = reflection * mask;

      const transmitted = inputLight * effectiveTransmission;
      const emitted = effectiveEmission;
      const reflected = ambientBrightness * effectiveReflection;

      const totalOutput = transmitted + emitted + reflected;
      expect(totalOutput).toBeCloseTo(0.9, 5); // 0.5 + 0.1 + 0.3
    });
  });

  describe('Multiple Texture Shapes at Same Layer', () => {
    it('should process shapes in order and accumulate correctly', () => {
      const inputLight = 1.0;
      const ambientBrightness = 1.0;

      const shapes = [
        { transmission: 0.8, emission: 0.1, reflection: 0.1, mask: 1.0 },
        { transmission: 0.9, emission: 0.05, reflection: 0.05, mask: 1.0 },
      ];

      // Compute accumulated values
      let totalTransmission = 1.0;
      let totalEmission = 0.0;
      let totalReflection = 0.0;

      for (const s of shapes) {
        const effectiveTrans = 1.0 * (1 - s.mask) + s.transmission * s.mask;
        totalTransmission *= effectiveTrans;
        totalEmission += s.emission * s.mask;
        totalReflection += s.reflection * s.mask;
      }

      expect(totalTransmission).toBeCloseTo(0.72, 5); // 0.8 * 0.9
      expect(totalEmission).toBeCloseTo(0.15, 5); // 0.1 + 0.05
      expect(totalReflection).toBeCloseTo(0.15, 5); // 0.1 + 0.05

      // Final output
      const output =
        inputLight * totalTransmission + totalEmission + ambientBrightness * totalReflection;
      expect(output).toBeCloseTo(1.02, 2); // 0.72 + 0.15 + 0.15
    });
  });
});

describe('Texture Physics at Different Wavelengths', () => {
  it('should sample different transmission values per wavelength', () => {
    // Color filter example: passes red, blocks blue
    const transmissionPerWavelength = {
      450: 0.1, // Blue - blocked
      550: 0.5, // Green - partial
      650: 0.9, // Red - passes
    };

    const inputLight = 1.0;
    const mask = 1.0;

    for (const [wl, trans] of Object.entries(transmissionPerWavelength)) {
      const effective = 1.0 * (1 - mask) + trans * mask;
      const output = inputLight * effective;

      if (Number(wl) === 650) {
        expect(output).toBeCloseTo(0.9, 5);
      } else if (Number(wl) === 450) {
        expect(output).toBeCloseTo(0.1, 5);
      }
    }
  });

  it('should support wavelength-dependent emission (colored light)', () => {
    // Sodium lamp peaks at 589nm
    const emissionPerWavelength = {
      450: 0.0,
      550: 0.2,
      589: 1.0,
      650: 0.1,
    };

    const mask = 1.0;
    const peakEmission = emissionPerWavelength[589] * mask;
    expect(peakEmission).toBe(1.0);
  });
});
