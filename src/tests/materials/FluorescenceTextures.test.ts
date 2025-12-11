/**
 * Fluorescence Texture Generation Tests
 * 
 * Tests for CPU-side fluorescence texture generation.
 * Following TDD methodology - these tests are written BEFORE implementation.
 */

import { describe, it, expect } from 'vitest';
import {
  createGasMaterial,
  createWaterMaterial,
  createCrystalMaterial,
  createDefaultProperties,
} from '../../core/materials';

describe('Fluorescence Texture Generation', () => {
  describe('generateFluorescenceTextures', () => {
    const gasMaterial = createGasMaterial();
    const waterMaterial = createWaterMaterial();
    const crystalMaterial = createCrystalMaterial();
    
    it('returns excitation and emission Float32Arrays', () => {
      const props = createDefaultProperties(gasMaterial);
      const result = gasMaterial.generateFluorescenceTextures(
        100, 1000, 100, props
      );
      
      expect(result.excitation).toBeInstanceOf(Float32Array);
      expect(result.emission).toBeInstanceOf(Float32Array);
      expect(result.excitation.length).toBe(100);
      expect(result.emission.length).toBe(100);
    });
    
    it('returns totalQuantumYield between 0 and 1', () => {
      const props = createDefaultProperties(gasMaterial);
      const result = gasMaterial.generateFluorescenceTextures(
        100, 1000, 100, props
      );
      
      expect(result.totalQuantumYield).toBeGreaterThanOrEqual(0);
      expect(result.totalQuantumYield).toBeLessThanOrEqual(1);
    });
    
    it('excitation texture has non-zero values in UV range for sodium', () => {
      const props = createDefaultProperties(gasMaterial);
      props.moleFractions['sodium'] = 0.1;  // 10% sodium
      
      const result = gasMaterial.generateFluorescenceTextures(
        100, 1000, 900, props
      );
      
      // Sodium excitation is 280-350nm
      // At resolution 900, step = 1nm, index 230 = 330nm (peak)
      const uvIndex = 230;  // 100 + 230 = 330nm
      expect(result.excitation[uvIndex]).toBeGreaterThan(0);
      
      // At 600nm (index 500), excitation should be zero
      const visibleIndex = 500;
      expect(result.excitation[visibleIndex]).toBeCloseTo(0, 3);
    });
    
    it('emission texture has non-zero values at D-line wavelengths for sodium', () => {
      const props = createDefaultProperties(gasMaterial);
      props.moleFractions['sodium'] = 0.1;
      
      const result = gasMaterial.generateFluorescenceTextures(
        100, 1000, 900, props
      );
      
      // Sodium emission is at 589nm
      // At resolution 900, step = 1nm, index 489 = 589nm
      const emissionIndex = 489;
      expect(result.emission[emissionIndex]).toBeGreaterThan(0);
      
      // At 400nm (index 300), emission should be near zero
      const blueIndex = 300;
      expect(result.emission[blueIndex]).toBeCloseTo(0, 3);
    });
    
    it('texture values scale with mole fraction', () => {
      const propsLow = createDefaultProperties(gasMaterial);
      propsLow.moleFractions['sodium'] = 0.01;
      
      const propsHigh = createDefaultProperties(gasMaterial);
      propsHigh.moleFractions['sodium'] = 0.1;
      
      const resultLow = gasMaterial.generateFluorescenceTextures(100, 1000, 900, propsLow);
      const resultHigh = gasMaterial.generateFluorescenceTextures(100, 1000, 900, propsHigh);
      
      // At excitation peak (330nm, index 230)
      expect(resultHigh.excitation[230]).toBeGreaterThan(resultLow.excitation[230]);
      // Ratio should be approximately 10x
      const ratio = resultHigh.excitation[230] / resultLow.excitation[230];
      expect(ratio).toBeCloseTo(10, 0);
    });
    
    it('returns zero textures when no fluorescent molecules are present', () => {
      const props = createDefaultProperties(gasMaterial);
      // Set all mole fractions to zero
      for (const key of Object.keys(props.moleFractions)) {
        props.moleFractions[key] = 0;
      }
      
      const result = gasMaterial.generateFluorescenceTextures(100, 1000, 100, props);
      
      const excitationSum = result.excitation.reduce((a, b) => a + b, 0);
      const emissionSum = result.emission.reduce((a, b) => a + b, 0);
      
      expect(excitationSum).toBe(0);
      expect(emissionSum).toBe(0);
    });
    
    it('works for water material (dyes)', () => {
      const props = createDefaultProperties(waterMaterial);
      props.moleFractions['methylene-blue'] = 0.01;
      
      const result = waterMaterial.generateFluorescenceTextures(100, 1000, 900, props);
      
      // Methylene blue has visible excitation (600-670nm) and emission (686nm)
      const excitationIndex = 565; // 665nm
      const emissionIndex = 586;   // 686nm
      
      expect(result.excitation[excitationIndex]).toBeGreaterThan(0);
      expect(result.emission[emissionIndex]).toBeGreaterThan(0);
    });
    
    it('works for crystal material (ruby fluorescence)', () => {
      const props = createDefaultProperties(crystalMaterial);
      props.moleFractions['chromium-ion'] = 0.01;
      
      const result = crystalMaterial.generateFluorescenceTextures(100, 1000, 900, props);
      
      // Ruby has green excitation (550nm) and deep red emission (694nm)
      const excitationIndex = 454; // 554nm (green)
      const emissionIndex = 594;   // 694nm (deep red)
      
      expect(result.excitation[excitationIndex]).toBeGreaterThan(0);
      expect(result.emission[emissionIndex]).toBeGreaterThan(0);
    });
  });
  
  describe('Physical Constraints', () => {
    it('excitation and emission are non-negative', () => {
      const material = createGasMaterial();
      const props = createDefaultProperties(material);
      props.moleFractions['sodium'] = 0.1;
      
      const result = material.generateFluorescenceTextures(100, 1000, 900, props);
      
      for (let i = 0; i < result.excitation.length; i++) {
        expect(result.excitation[i]).toBeGreaterThanOrEqual(0);
        expect(result.emission[i]).toBeGreaterThanOrEqual(0);
      }
    });
    
    it('emission occurs at longer wavelengths than excitation (Stokes shift)', () => {
      const material = createGasMaterial();
      const props = createDefaultProperties(material);
      props.moleFractions['sodium'] = 0.1;
      
      const result = material.generateFluorescenceTextures(100, 1000, 900, props);
      
      // Find peak excitation wavelength
      let peakExIdx = 0;
      let peakExVal = 0;
      for (let i = 0; i < result.excitation.length; i++) {
        if (result.excitation[i] > peakExVal) {
          peakExVal = result.excitation[i];
          peakExIdx = i;
        }
      }
      
      // Find peak emission wavelength
      let peakEmIdx = 0;
      let peakEmVal = 0;
      for (let i = 0; i < result.emission.length; i++) {
        if (result.emission[i] > peakEmVal) {
          peakEmVal = result.emission[i];
          peakEmIdx = i;
        }
      }
      
      // Emission peak should be at longer wavelength (higher index)
      expect(peakEmIdx).toBeGreaterThan(peakExIdx);
    });
  });
});

