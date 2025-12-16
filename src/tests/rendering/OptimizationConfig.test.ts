/**
 * Tests for OptimizationConfig - Shader optimization configuration
 *
 * TDD: These tests are written first, implementation follows.
 * OCP: Config allows extension without modifying core code.
 */

import { describe, expect, it } from 'vitest';
import { OptimizationConfig, OptimizationPreset } from '../../core/rendering/OptimizationConfig';

describe('OptimizationConfig', () => {
  describe('factory methods', () => {
    it('default() enables all optimizations', () => {
      const config = OptimizationConfig.default();
      const flags = config.getFlags();

      expect(flags.hoistedMasks).toBe(true);
      expect(flags.earlyExit).toBe(true);
      expect(flags.downsampledScattering).toBe(true);
      expect(flags.precomputedScatteringTexture).toBe(true);
    });

    it('performance() enables all optimizations', () => {
      const config = OptimizationConfig.performance();
      const flags = config.getFlags();

      expect(flags.hoistedMasks).toBe(true);
      expect(flags.earlyExit).toBe(true);
      expect(flags.downsampledScattering).toBe(true);
      expect(flags.precomputedScatteringTexture).toBe(true);
    });

    it('quality() disables some optimizations for accuracy', () => {
      const config = OptimizationConfig.quality();
      const flags = config.getFlags();

      // Basic optimizations should still be enabled
      expect(flags.hoistedMasks).toBe(true);
      expect(flags.earlyExit).toBe(true);
      // Approximation-based optimizations disabled for quality
      expect(flags.downsampledScattering).toBe(false);
    });

    it('none() disables all optimizations', () => {
      const config = OptimizationConfig.none();
      const flags = config.getFlags();

      expect(flags.hoistedMasks).toBe(false);
      expect(flags.earlyExit).toBe(false);
      expect(flags.downsampledScattering).toBe(false);
      expect(flags.precomputedScatteringTexture).toBe(false);
    });
  });

  describe('individual flag control', () => {
    it('can disable individual optimizations', () => {
      const config = OptimizationConfig.default();

      config.setFlag('hoistedMasks', false);
      expect(config.getFlags().hoistedMasks).toBe(false);

      // Other flags should remain unchanged
      expect(config.getFlags().earlyExit).toBe(true);
      expect(config.getFlags().downsampledScattering).toBe(true);
    });

    it('can enable individual optimizations', () => {
      const config = OptimizationConfig.none();

      config.setFlag('earlyExit', true);
      expect(config.getFlags().earlyExit).toBe(true);

      // Other flags should remain unchanged
      expect(config.getFlags().hoistedMasks).toBe(false);
    });
  });

  describe('scatteringLUTSize', () => {
    it('defaults to 64 samples', () => {
      const config = OptimizationConfig.default();
      expect(config.getScatteringLUTSize()).toBe(64);
    });

    it('validates bounds (min 8, max 1024)', () => {
      const config = OptimizationConfig.default();

      expect(() => config.setScatteringLUTSize(4)).toThrow();
      expect(() => config.setScatteringLUTSize(2048)).toThrow();

      // Valid values should work
      config.setScatteringLUTSize(8);
      expect(config.getScatteringLUTSize()).toBe(8);

      config.setScatteringLUTSize(1024);
      expect(config.getScatteringLUTSize()).toBe(1024);
    });

    it('accepts powers of 2', () => {
      const config = OptimizationConfig.default();

      config.setScatteringLUTSize(16);
      expect(config.getScatteringLUTSize()).toBe(16);

      config.setScatteringLUTSize(256);
      expect(config.getScatteringLUTSize()).toBe(256);
    });
  });

  describe('getShaderDefines', () => {
    it('returns empty string when no defines needed', () => {
      const config = OptimizationConfig.none();
      const defines = config.getShaderDefines();

      // Should not contain any optimization defines
      expect(defines).not.toContain('ENABLE_HOISTED_MASKS');
      expect(defines).not.toContain('ENABLE_EARLY_EXIT');
    });

    it('includes defines for enabled optimizations', () => {
      const config = OptimizationConfig.default();
      const defines = config.getShaderDefines();

      expect(defines).toContain('ENABLE_HOISTED_MASKS');
      expect(defines).toContain('ENABLE_EARLY_EXIT');
      expect(defines).toContain('ENABLE_DOWNSAMPLED_SCATTERING');
      expect(defines).toContain('SCATTER_LUT_SIZE');
    });

    it('includes correct LUT size in defines', () => {
      const config = OptimizationConfig.default();
      config.setScatteringLUTSize(128);
      const defines = config.getShaderDefines();

      expect(defines).toContain('SCATTER_LUT_SIZE: u32 = 128u');
    });
  });

  describe('serialization', () => {
    it('toJSON returns serializable object', () => {
      const config = OptimizationConfig.default();
      const json = config.toJSON();

      expect(json).toHaveProperty('flags');
      expect(json).toHaveProperty('scatteringLUTSize');
      expect(json.flags).toHaveProperty('hoistedMasks');
      expect(json.flags).toHaveProperty('earlyExit');
    });

    it('fromJSON restores config correctly', () => {
      const original = OptimizationConfig.default();
      original.setFlag('earlyExit', false);
      original.setScatteringLUTSize(128);

      const json = original.toJSON();
      const restored = OptimizationConfig.fromJSON(json);

      expect(restored.getFlags().earlyExit).toBe(false);
      expect(restored.getFlags().hoistedMasks).toBe(true);
      expect(restored.getScatteringLUTSize()).toBe(128);
    });
  });

  describe('preset detection', () => {
    it('identifies performance preset', () => {
      const config = OptimizationConfig.performance();
      expect(config.getPreset()).toBe(OptimizationPreset.Performance);
    });

    it('identifies quality preset', () => {
      const config = OptimizationConfig.quality();
      expect(config.getPreset()).toBe(OptimizationPreset.Quality);
    });

    it('identifies none preset', () => {
      const config = OptimizationConfig.none();
      expect(config.getPreset()).toBe(OptimizationPreset.None);
    });

    it('returns custom for modified presets', () => {
      const config = OptimizationConfig.performance();
      config.setFlag('earlyExit', false);
      expect(config.getPreset()).toBe(OptimizationPreset.Custom);
    });
  });
});
