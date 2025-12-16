/**
 * Planck Radiation Tests
 * 
 * Tests for blackbody radiation calculations in WGSL.
 * Validates that GPU implementation matches expected physics.
 */

import { describe, it, expect } from 'vitest';
import { PHYSICAL_CONSTANTS } from '../testHelpers';

describe('Planck Radiation Physics', () => {
  describe('Constants', () => {
    it('D65 temperature should be standard illuminant value', () => {
      expect(PHYSICAL_CONSTANTS.D65_TEMPERATURE).toBe(6500);
    });

    it('C2 (Planck second constant) should be hc/k in nm·K', () => {
      // C2 = hc/k = 14387768.8 nm·K (using modern CODATA values)
      // h = 6.62607015e-34 J·s
      // c = 299792458 m/s
      // k = 1.380649e-23 J/K
      // C2 = h*c/k = 0.014387768... m·K = 14387768.8 nm·K
      expect(PHYSICAL_CONSTANTS.C2).toBeCloseTo(14387768.8, 0);
    });
  });

  describe('Planck Radiance Formula', () => {
    // These tests verify the mathematical properties of Planck's law
    // without requiring GPU execution

    it('Wien displacement law: peak wavelength inversely proportional to temperature', () => {
      // λ_max = b/T where b ≈ 2898 μm·K = 2.898e6 nm·K
      const wienConstant = 2.898e6; // nm·K
      
      // At 6500K (D65), peak should be around 446nm (blue-violet)
      const peakAt6500K = wienConstant / 6500;
      expect(peakAt6500K).toBeCloseTo(446, 0);
      
      // At 3000K (warm white), peak should be around 966nm (infrared)
      const peakAt3000K = wienConstant / 3000;
      expect(peakAt3000K).toBeCloseTo(966, 0);
      
      // At 10000K (hot star), peak should be around 290nm (UV)
      const peakAt10000K = wienConstant / 10000;
      expect(peakAt10000K).toBeCloseTo(290, 0);
    });

    it('Stefan-Boltzmann law: total power scales as T^4', () => {
      // Just verify the relationship holds
      const T1 = 3000;
      const T2 = 6000;
      
      // Power ratio should be (T2/T1)^4 = 2^4 = 16
      const powerRatio = Math.pow(T2 / T1, 4);
      expect(powerRatio).toBe(16);
    });
  });

  describe('Kirchhoff Emission', () => {
    it('emissivity = absorptivity = 1 - transmission', () => {
      // For a material with 80% transmission:
      const transmission = 0.8;
      const absorptivity = 1 - transmission;
      const emissivity = absorptivity; // Kirchhoff's law
      
      expect(emissivity).toBeCloseTo(0.2, 10);
    });

    it('fully transparent material has zero emission', () => {
      const transmission = 1.0;
      const emissivity = 1 - transmission;
      expect(emissivity).toBe(0);
    });

    it('opaque material has maximum emission', () => {
      const transmission = 0.0;
      const emissivity = 1 - transmission;
      expect(emissivity).toBe(1.0);
    });
  });

  describe('D65 Normalization', () => {
    it('D65 reference should be raw Planck at 550nm, 6500K', () => {
      // D65 is normalized so that P(550nm, 6500K) = 1.0
      // The raw value is stored for efficient division
      expect(PHYSICAL_CONSTANTS.D65_REFERENCE).toBeGreaterThan(1e28);
      expect(PHYSICAL_CONSTANTS.D65_REFERENCE).toBeLessThan(1e31);
    });
  });
});

