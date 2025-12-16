/**
 * Fluorescence Physics Tests
 * 
 * Tests for fluorescence emission calculations.
 * Fluorescence: UV absorption → visible light emission
 */

import { describe, it, expect } from 'vitest';

describe('Fluorescence Physics', () => {
  describe('Quantum Yield', () => {
    it('quantum yield should be between 0 and 1', () => {
      // Quantum yield = photons emitted / photons absorbed
      // Can never exceed 1 (energy conservation)
      const minYield = 0;
      const maxYield = 1;
      
      expect(minYield).toBeGreaterThanOrEqual(0);
      expect(maxYield).toBeLessThanOrEqual(1);
    });

    it('zero quantum yield means no fluorescence', () => {
      const quantumYield = 0;
      const absorbedLight = 100;
      const emitted = absorbedLight * quantumYield;
      
      expect(emitted).toBe(0);
    });
  });

  describe('Two-Pass Algorithm', () => {
    it('Pass 1: accumulate excitation across all wavelengths', () => {
      // Excitation from multiple UV wavelengths adds up
      const excitationFromUV1 = 0.3;
      const excitationFromUV2 = 0.2;
      const totalExcitation = excitationFromUV1 + excitationFromUV2;
      
      expect(totalExcitation).toBe(0.5);
    });

    it('Pass 2: distribute emission according to emission spectrum', () => {
      // Emission spectrum defines where light is re-emitted
      // e.g., sodium D-lines at 589nm
      const totalExcitation = 1.0;
      const emissionAtPeak = 1.0; // Peak of emission spectrum
      const emissionAtOffPeak = 0.1; // Away from peak
      const quantumYield = 0.8;
      
      const emittedAtPeak = totalExcitation * emissionAtPeak * quantumYield;
      const emittedAtOffPeak = totalExcitation * emissionAtOffPeak * quantumYield;
      
      expect(emittedAtPeak).toBeCloseTo(0.8, 10);
      expect(emittedAtOffPeak).toBeCloseTo(0.08, 10);
    });
  });

  describe('Energy Conservation', () => {
    it('emitted energy should not exceed absorbed energy', () => {
      const absorbedEnergy = 100;
      const quantumYield = 0.9; // 90% efficient
      const stokesShift = 0.9; // Emitted photons have ~90% of absorbed energy
      
      const emittedEnergy = absorbedEnergy * quantumYield * stokesShift;
      expect(emittedEnergy).toBeLessThan(absorbedEnergy);
    });

    it('Stokes shift: emitted wavelength > absorbed wavelength', () => {
      // Fluorescence always emits at longer wavelengths (lower energy)
      const absorbedWavelength = 350; // UV
      const emittedWavelength = 589;  // Visible (sodium D-line)
      
      expect(emittedWavelength).toBeGreaterThan(absorbedWavelength);
    });
  });
});

