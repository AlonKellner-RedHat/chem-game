/**
 * Integration tests for SpectralOptimizations
 *
 * Tests the integration of OptimizationConfig and ScatteringLUT
 * with the SpectralComputePipeline (TypeScript-side only).
 */

import { describe, expect, it } from 'vitest';
import { ScatteringLUT, type ScatteringLUTConfig } from '../../core/physics/ScatteringLUT';
import { OptimizationConfig, OptimizationPreset } from '../../core/rendering/OptimizationConfig';

describe('SpectralOptimizations Integration', () => {
  describe('OptimizationConfig + ScatteringLUT', () => {
    it('generates LUT when downsampledScattering is enabled', () => {
      const config = OptimizationConfig.default();
      expect(config.getFlags().downsampledScattering).toBe(true);

      // LUT should be generated for the configured size
      const lutConfig: ScatteringLUTConfig = {
        wavelengthMin: 100,
        wavelengthMax: 1000,
        samples: config.getScatteringLUTSize(),
      };

      const lut = ScatteringLUT.generate(lutConfig);
      expect(lut.length).toBe(config.getScatteringLUTSize());
    });

    it('uses quality config LUT size appropriately', () => {
      const config = OptimizationConfig.quality();

      // Quality mode disables downsampled scattering
      expect(config.getFlags().downsampledScattering).toBe(false);

      // But LUT size is still available for other uses
      expect(config.getScatteringLUTSize()).toBeGreaterThan(0);
    });
  });

  describe('Shader Defines Generation', () => {
    it('generates valid WGSL constant declarations', () => {
      const config = OptimizationConfig.default();
      const defines = config.getShaderDefines();

      // Should be valid WGSL syntax
      expect(defines).toContain('const ');
      expect(defines).toContain(': bool = true');

      // Should include all enabled optimizations
      expect(defines).toContain('ENABLE_HOISTED_MASKS');
      expect(defines).toContain('ENABLE_EARLY_EXIT');
    });

    it('generates empty defines for none preset', () => {
      const config = OptimizationConfig.none();
      const defines = config.getShaderDefines();

      // No optimization defines should be present
      expect(defines).not.toContain('ENABLE_HOISTED_MASKS');
      expect(defines).not.toContain('ENABLE_EARLY_EXIT');
    });

    it('includes correct LUT size in defines', () => {
      const config = OptimizationConfig.default();
      config.setScatteringLUTSize(128);
      const defines = config.getShaderDefines();

      expect(defines).toContain('SCATTER_LUT_SIZE: u32 = 128u');
    });
  });

  describe('Configuration Persistence', () => {
    it('config survives JSON serialization', () => {
      const original = OptimizationConfig.default();
      original.setFlag('earlyExit', false);
      original.setScatteringLUTSize(256);

      const json = original.toJSON();
      const jsonString = JSON.stringify(json);
      const parsed = JSON.parse(jsonString);
      const restored = OptimizationConfig.fromJSON(parsed);

      expect(restored.getFlags().earlyExit).toBe(false);
      expect(restored.getFlags().hoistedMasks).toBe(true);
      expect(restored.getScatteringLUTSize()).toBe(256);
    });

    it('preset detection works after modification', () => {
      const config = OptimizationConfig.performance();
      expect(config.getPreset()).toBe(OptimizationPreset.Performance);

      // Disabling downsampledScattering changes to Quality preset (matches its flags)
      config.setFlag('downsampledScattering', false);
      expect(config.getPreset()).toBe(OptimizationPreset.Quality);

      // Further modification makes it Custom
      config.setFlag('earlyExit', false);
      expect(config.getPreset()).toBe(OptimizationPreset.Custom);
    });
  });

  describe('ScatteringLUT Accuracy', () => {
    it('LUT interpolation matches direct calculation within tolerance', () => {
      const lutConfig: ScatteringLUTConfig = {
        wavelengthMin: 100,
        wavelengthMax: 1000,
        samples: 256,
      };

      const lut = ScatteringLUT.generate(lutConfig);

      // Test at several wavelengths
      const testWavelengths = [380, 450, 550, 620, 700];

      for (const wavelength of testWavelengths) {
        const direct = ScatteringLUT.getRayleighFactor(wavelength);
        // t is normalized position in 100-1000nm range
        const t = (wavelength - 100) / 900;
        const interpolated = ScatteringLUT.interpolate(lut, t);

        // Should match within 5% (acceptable for downsampled approximation)
        const error = Math.abs(direct - interpolated) / direct;
        expect(error).toBeLessThan(0.05);
      }
    });

    it('LUT handles edge wavelengths correctly', () => {
      const lutConfig: ScatteringLUTConfig = {
        wavelengthMin: 100,
        wavelengthMax: 1000,
        samples: 64,
      };

      const lut = ScatteringLUT.generate(lutConfig);

      // Edge values should match exactly (no interpolation needed)
      // Index 0 corresponds to wavelengthMin (100nm), index 1 to wavelengthMax (1000nm)
      const firstDirect = ScatteringLUT.getRayleighFactor(100);
      const lastDirect = ScatteringLUT.getRayleighFactor(1000);

      expect(ScatteringLUT.interpolate(lut, 0)).toBeCloseTo(firstDirect, 2);
      expect(ScatteringLUT.interpolate(lut, 1)).toBeCloseTo(lastDirect, 2);
    });
  });

  describe('Optimization Flag Combinations', () => {
    it('all flags can be independently toggled', () => {
      const config = OptimizationConfig.none();
      const flagKeys: (keyof ReturnType<typeof config.getFlags>)[] = [
        'hoistedMasks',
        'earlyExit',
        'downsampledScattering',
        'precomputedScatteringTexture',
      ];

      // Enable each flag one by one
      for (const key of flagKeys) {
        config.setFlag(key, true);
        expect(config.getFlags()[key]).toBe(true);

        // Other flags should still be in their previous state
        // (we're enabling them in order, so check all prior keys are true)
        for (const priorKey of flagKeys.slice(0, flagKeys.indexOf(key))) {
          expect(config.getFlags()[priorKey]).toBe(true);
        }
      }

      // Disable them in reverse order
      for (const key of [...flagKeys].reverse()) {
        config.setFlag(key, false);
        expect(config.getFlags()[key]).toBe(false);
      }
    });
  });
});
