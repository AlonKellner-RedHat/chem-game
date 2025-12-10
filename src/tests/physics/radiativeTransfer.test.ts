/**
 * Radiative Transfer Tests
 * 
 * Tests for the single-layer homogeneous slab radiative transfer equation:
 * 
 * I_out = I_in × T + B(λ,T) × (1 - T)
 * 
 * where:
 * - I_in is input intensity (background)
 * - T is transmission through the slab (from Beer-Lambert)
 * - B(λ,T) is the Planck black body function at material temperature
 * - (1-T) is absorptivity/emissivity (Kirchhoff's law)
 * 
 * This is mathematically equivalent to the current implementation:
 * result = background × transmission + emission
 * where emission = absorptivity × B(λ,T) = (1-T) × B(λ,T)
 */

import { describe, it, expect } from 'vitest';
import { computeSpectrumValue, getKirchhoffEmission } from '../../core/physics/kirchhoff';
import { getPlanckRadiance } from '../../core/physics/planck';

describe('Single-Layer Radiative Transfer', () => {
  const wavelength = 550; // nm (green light)
  
  describe('cold slab (T << Draper point)', () => {
    it('reduces to pure transmission', () => {
      const backgroundIntensity = 1.0;
      const transmission = 0.5;
      const coldTemperature = 300; // Room temperature, well below Draper point
      
      const result = computeSpectrumValue(
        backgroundIntensity,
        transmission,
        wavelength,
        coldTemperature,
        true
      );
      
      // At cold temperatures, emission is negligible
      // So result ≈ I_in × T
      const expectedPureTransmission = backgroundIntensity * transmission;
      expect(result).toBeCloseTo(expectedPureTransmission, 5);
    });
    
    it('shows no emission contribution below Draper point', () => {
      const emission = getKirchhoffEmission(0.5, wavelength, 300);
      expect(emission).toBe(0);
    });
  });

  describe('hot slab (T >> Draper point)', () => {
    it('approaches black body for optically thick slab', () => {
      const backgroundIntensity = 0.1; // Dim background
      const transmission = 0.001; // Very opaque (τ >> 1)
      const hotTemperature = 3000; // Well above Draper point
      
      const result = computeSpectrumValue(
        backgroundIntensity,
        transmission,
        wavelength,
        hotTemperature,
        true
      );
      
      // For optically thick hot slab: I_out → B(λ,T)
      const blackBodyIntensity = getPlanckRadiance(wavelength, hotTemperature);
      
      // Result should be dominated by emission
      // I_out = I_in × T + B × (1-T) ≈ B × 1 for T → 0
      expect(result).toBeCloseTo(blackBodyIntensity * (1 - transmission), 2);
    });

    it('emission dominates over transmitted background', () => {
      const transmission = 0.1; // Mostly opaque
      const hotTemperature = 2000;
      
      const emissionOnly = computeSpectrumValue(0, transmission, wavelength, hotTemperature, true);
      const withBackground = computeSpectrumValue(1.0, transmission, wavelength, hotTemperature, true);
      
      // The difference should be just the transmitted background
      const transmittedBackground = 1.0 * transmission;
      expect(withBackground - emissionOnly).toBeCloseTo(transmittedBackground, 3);
    });
  });

  describe('intermediate optical depth', () => {
    it('correctly interpolates for τ = 1', () => {
      // For τ = 1: T = e^(-1) ≈ 0.368
      const transmission = Math.exp(-1);
      const backgroundIntensity = 1.0;
      const temperature = 1500; // Hot enough to emit visibly
      
      const result = computeSpectrumValue(
        backgroundIntensity,
        transmission,
        wavelength,
        temperature,
        true
      );
      
      // I_out = I_in × T + B × (1-T)
      const blackBody = getPlanckRadiance(wavelength, temperature);
      const expected = backgroundIntensity * transmission + blackBody * (1 - transmission);
      
      expect(result).toBeCloseTo(expected, 5);
    });

    it('satisfies the RTE formula exactly', () => {
      // Test multiple transmission values
      const temperatures = [1000, 1500, 2000, 2500, 3000];
      const transmissions = [0.1, 0.3, 0.5, 0.7, 0.9];
      
      for (const T of temperatures) {
        for (const trans of transmissions) {
          const result = computeSpectrumValue(1.0, trans, wavelength, T, true);
          const blackBody = getPlanckRadiance(wavelength, T);
          const expected = 1.0 * trans + blackBody * (1 - trans);
          
          expect(result).toBeCloseTo(expected, 6);
        }
      }
    });
  });

  describe('Kirchhoff\'s law verification', () => {
    it('emissivity equals absorptivity', () => {
      const transmission = 0.6;
      const absorptivity = 1 - transmission;
      const temperature = 2000;
      
      const emission = getKirchhoffEmission(transmission, wavelength, temperature);
      const blackBody = getPlanckRadiance(wavelength, temperature);
      
      // Emission should be absorptivity × black body
      expect(emission).toBeCloseTo(absorptivity * blackBody, 6);
    });

    it('transparent material does not emit', () => {
      const transmission = 1.0; // Fully transparent
      const emission = getKirchhoffEmission(transmission, wavelength, 3000);
      
      expect(emission).toBe(0);
    });

    it('opaque material emits maximally', () => {
      const transmission = 0; // Fully opaque
      const temperature = 2000;
      
      const emission = getKirchhoffEmission(transmission, wavelength, temperature);
      const blackBody = getPlanckRadiance(wavelength, temperature);
      
      // Full absorption = full emission
      expect(emission).toBeCloseTo(blackBody, 6);
    });
  });

  describe('multi-layer implicit integration', () => {
    it('layer output feeds into next layer input', () => {
      // Simulate two layers: the output of layer 1 becomes input to layer 2
      const background = 1.0;
      const trans1 = 0.7;
      const trans2 = 0.5;
      const temp1 = 1500;
      const temp2 = 2000;
      
      // Layer 1
      const after1 = computeSpectrumValue(background, trans1, wavelength, temp1, true);
      
      // Layer 2 (uses output of layer 1 as input)
      const after2 = computeSpectrumValue(after1, trans2, wavelength, temp2, true);
      
      // Verify the chain is self-consistent
      const bb1 = getPlanckRadiance(wavelength, temp1);
      const bb2 = getPlanckRadiance(wavelength, temp2);
      
      const expected1 = background * trans1 + bb1 * (1 - trans1);
      const expected2 = expected1 * trans2 + bb2 * (1 - trans2);
      
      expect(after1).toBeCloseTo(expected1, 5);
      expect(after2).toBeCloseTo(expected2, 5);
    });
  });
});

