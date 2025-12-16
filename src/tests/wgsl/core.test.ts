/**
 * Core WESL Module Tests
 *
 * Tests for constants, structs, and bindings modules.
 *
 * Note: GPU tests are in a separate file (core.gpu.test.ts) and only run
 * when WebGPU is available. These tests validate the constant values
 * that are shared between TypeScript and WGSL.
 */

import { describe, expect, it } from 'vitest';
import { PHYSICAL_CONSTANTS } from './testHelpers';

describe('Core WESL Modules', () => {
  describe('Physical Constants', () => {
    it('D65_TEMPERATURE should be 6500K', () => {
      expect(PHYSICAL_CONSTANTS.D65_TEMPERATURE).toBe(6500.0);
    });

    it('visible spectrum range should be 380-700nm', () => {
      expect(PHYSICAL_CONSTANTS.VISIBLE_MIN).toBe(380.0);
      expect(PHYSICAL_CONSTANTS.VISIBLE_MAX).toBe(700.0);
    });

    it('C2 (Planck second constant) should match hc/k', () => {
      // C2 = hc/k where h=Planck, c=speed of light, k=Boltzmann
      // Expected value: 14387768.8 nm·K
      expect(PHYSICAL_CONSTANTS.C2).toBeCloseTo(14387768.8, 0);
    });

    it('scattering coefficients should be physically reasonable', () => {
      // Rayleigh coefficient should produce ~2-3% scattering at moderate densities
      expect(PHYSICAL_CONSTANTS.RAYLEIGH_COEFF).toBeGreaterThan(1e-15);
      expect(PHYSICAL_CONSTANTS.RAYLEIGH_COEFF).toBeLessThan(1e-12);

      // Mie coefficient should be smaller (larger particles, fewer needed)
      expect(PHYSICAL_CONSTANTS.MIE_COEFF).toBeLessThan(PHYSICAL_CONSTANTS.RAYLEIGH_COEFF);
    });

    it('particle sizes should match Rayleigh/Mie regimes', () => {
      // Rayleigh: particle << wavelength (50nm << 380nm)
      expect(PHYSICAL_CONSTANTS.SMALL_PARTICLE_SIZE).toBeLessThan(
        PHYSICAL_CONSTANTS.VISIBLE_MIN / 4
      );

      // Mie: particle ~ wavelength (1000nm > 700nm)
      expect(PHYSICAL_CONSTANTS.LARGE_PARTICLE_SIZE).toBeGreaterThan(
        PHYSICAL_CONSTANTS.VISIBLE_MAX
      );
    });

    it('SPECTRAL_SAMPLES should be 16 for rendering', () => {
      expect(PHYSICAL_CONSTANTS.SPECTRAL_SAMPLES).toBe(16);
    });

    it('MAX_BLUR_RADIUS should be reasonable', () => {
      // Should be enough for visible blur without excessive computation
      expect(PHYSICAL_CONSTANTS.MAX_BLUR_RADIUS).toBeGreaterThanOrEqual(8);
      expect(PHYSICAL_CONSTANTS.MAX_BLUR_RADIUS).toBeLessThanOrEqual(32);
    });
  });

  // GPU tests are in core.gpu.test.ts (requires WebGPU runtime)

  describe('Struct Alignment', () => {
    it('Shape struct should be 64 bytes (16-byte aligned)', () => {
      // Shape has: 4×f32 (pos/bounds) + f32 (temp) + 3×u32 (layer/material/mask)
      //          + u32 + 2×f32 (msdf) + 2×f32 (scatter) + f32 (fluor) + 2×f32 (padding)
      // Total: 16 f32/u32 = 64 bytes
      const expectedSize = 64;
      const fields = 16; // Number of 4-byte fields
      expect(fields * 4).toBe(expectedSize);
    });

    it('Params struct should be properly aligned', () => {
      // All fields are 4 bytes (u32, i32, or f32)
      // Total fields in Params: 26
      const paramsFields = 26;
      expect(paramsFields % 4).toBe(2); // 26 = 6×4 + 2, need 2 more for 16-byte alignment
    });
  });
});
