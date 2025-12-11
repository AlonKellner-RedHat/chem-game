/**
 * Fluorescence Integration Tests
 * 
 * End-to-end tests verifying that fluorescence works correctly
 * across the CPU material system and GPU rendering pipeline.
 */

import { describe, it, expect } from 'vitest';
import { createGasMaterial, SodiumAtom, MercuryAtom, NeonAtom } from '../../core/materials/GasMaterial';
import { createWaterMaterial, MethyleneBlue } from '../../core/materials/WaterMaterial';
import { createCrystalMaterial, ChromiumIon } from '../../core/materials/CrystalMaterial';
import { createDefaultProperties } from '../../core/materials/Material';
import { getExcitationEfficiency, getEmissionLineShape, calculateTotalExcitation } from '../../core/physics/fluorescence';
import { getUVBackgroundIntensity, getNormalBackgroundIntensity } from '../../core/physics/backgrounds';

describe('Fluorescence Integration', () => {
  describe('UV Mode Excitation', () => {
    it('UV mode background emits in UV range (100-380nm)', () => {
      // UV mode should emit in UV range only
      expect(getUVBackgroundIntensity(315)).toBeGreaterThan(0.5);  // Peak UV
      expect(getUVBackgroundIntensity(400)).toBe(0);  // No visible light
      expect(getUVBackgroundIntensity(589)).toBe(0);  // No yellow light
    });

    it('normal mode peaks in visible range', () => {
      // Normal mode should peak in visible range (380-700nm)
      expect(getNormalBackgroundIntensity(200)).toBe(0);  // Deep UV - no emission
      expect(getNormalBackgroundIntensity(500)).toBe(1.0);  // Full visible
      expect(getNormalBackgroundIntensity(589)).toBe(1.0);  // Yellow D-line region
    });
  });

  describe('Sodium Fluorescence', () => {
    const sodiumBand = SodiumAtom.fluorescence![0];

    it('sodium has excitation peak at 330nm', () => {
      expect(sodiumBand.excitationPeak).toBe(330);
      expect(sodiumBand.excitationMin).toBe(280);
      expect(sodiumBand.excitationMax).toBe(350);
    });

    it('sodium has emission at D-lines (589nm)', () => {
      expect(SodiumAtom.fluorescence![0].emissionWavelength).toBe(589.0);
      expect(SodiumAtom.fluorescence![1].emissionWavelength).toBe(589.6);
    });

    it('sodium excitation efficiency peaks at 330nm', () => {
      const peakEff = getExcitationEfficiency(330, sodiumBand);
      const offPeakEff = getExcitationEfficiency(400, sodiumBand);
      
      expect(peakEff).toBeCloseTo(1.0, 1);
      expect(offPeakEff).toBe(0);  // Outside excitation range
    });

    it('sodium emission peaks at 589nm', () => {
      const atPeak = getEmissionLineShape(589.0, sodiumBand, 300);
      const offPeak = getEmissionLineShape(500, sodiumBand, 300);
      
      expect(atPeak).toBeCloseTo(1.0, 1);
      expect(offPeak).toBeLessThan(0.01);
    });

    it('UV absorption leads to yellow emission for sodium', () => {
      // Simulate UV light being absorbed
      const absorbedSpectrum = new Float32Array(100).fill(0);
      // UV light absorbed in 280-350nm range (indices 18-25 for 100-1000nm)
      for (let i = 20; i < 30; i++) {
        absorbedSpectrum[i] = 1.0;  // Strong UV absorption
      }
      
      const excitation = calculateTotalExcitation(absorbedSpectrum, 100, 1000, sodiumBand);
      expect(excitation).toBeGreaterThan(0);
      
      // Emission at 589nm should be non-zero
      const emissionAt589 = getEmissionLineShape(589.0, sodiumBand, 300);
      expect(emissionAt589).toBeCloseTo(1.0, 1);
    });

    it('gas material generates correct fluorescence textures for sodium', () => {
      const gasMaterial = createGasMaterial();
      const props = createDefaultProperties(gasMaterial);
      props.moleFractions = { sodium: 0.01 };  // 1% sodium
      
      const textures = gasMaterial.generateFluorescenceTextures(100, 1000, 100, props);
      
      // Excitation should peak in UV range
      // Index ~25 corresponds to ~330nm for 100-1000nm range
      const uvIdx = Math.round((330 - 100) / 9);  // ~25
      expect(textures.excitation[uvIdx]).toBeGreaterThan(0);
      
      // Emission should peak at D-lines
      // Index ~54 corresponds to ~589nm
      const dLineIdx = Math.round((589 - 100) / 9);  // ~54
      expect(textures.emission[dLineIdx]).toBeGreaterThan(0);
      
      // Quantum yield should be reasonable
      expect(textures.totalQuantumYield).toBeGreaterThan(0);
      expect(textures.totalQuantumYield).toBeLessThan(2);  // Allows for multiple bands
    });
  });

  describe('Mercury Fluorescence', () => {
    const mercuryBands = MercuryAtom.fluorescence!;

    it('mercury has multiple emission lines', () => {
      const emissionWavelengths = mercuryBands.map(b => b.emissionWavelength);
      expect(emissionWavelengths).toContain(253.7);  // UV-C
      expect(emissionWavelengths).toContain(435.8);  // Blue
      expect(emissionWavelengths).toContain(546.1);  // Green
      expect(emissionWavelengths).toContain(579.0);  // Yellow
    });

    it('mercury excitation ranges span VUV to UV-A', () => {
      const minExcitation = Math.min(...mercuryBands.map(b => b.excitationMin));
      const maxExcitation = Math.max(...mercuryBands.map(b => b.excitationMax));
      
      expect(minExcitation).toBe(100);  // VUV
      expect(maxExcitation).toBe(400);  // UV-A
    });
  });

  describe('Ruby (Chromium) Fluorescence', () => {
    const rubyBands = ChromiumIon.fluorescence!;

    it('ruby has R-line emission at ~694nm', () => {
      const emissionWavelengths = rubyBands.map(b => b.emissionWavelength);
      expect(emissionWavelengths).toContain(694.3);  // R1 line
      expect(emissionWavelengths).toContain(692.9);  // R2 line
    });

    it('ruby is excited by blue (400nm) and green (554nm) light', () => {
      // Blue excitation band
      const blueBand = rubyBands.find(b => b.excitationPeak === 404);
      expect(blueBand).toBeDefined();
      
      // Green excitation band
      const greenBand = rubyBands.find(b => b.excitationPeak === 554);
      expect(greenBand).toBeDefined();
    });

    it('ruby has high quantum yield (~0.9)', () => {
      for (const band of rubyBands) {
        expect(band.quantumYield).toBeGreaterThanOrEqual(0.85);
      }
    });
  });

  describe('Dye Fluorescence', () => {
    it('methylene blue has weak fluorescence', () => {
      const mbBands = MethyleneBlue.fluorescence!;
      expect(mbBands).toBeDefined();
      
      // Methylene blue has low quantum yield
      for (const band of mbBands) {
        expect(band.quantumYield).toBeLessThan(0.1);
      }
    });

    it('methylene blue emits at 686nm (red)', () => {
      const mbBands = MethyleneBlue.fluorescence!;
      const emissionWavelengths = mbBands.map(b => b.emissionWavelength);
      expect(emissionWavelengths).toContain(686);
    });
  });

  describe('Stokes Shift Physics', () => {
    it('all molecules have emission > excitation (Stokes shift)', () => {
      const molecules = [SodiumAtom, MercuryAtom, NeonAtom, ChromiumIon, MethyleneBlue];
      
      for (const molecule of molecules) {
        if (!molecule.fluorescence) continue;
        
        for (const band of molecule.fluorescence) {
          expect(band.emissionWavelength).toBeGreaterThanOrEqual(band.excitationPeak);
        }
      }
    });

    it('quantum yield is always 0-1', () => {
      const molecules = [SodiumAtom, MercuryAtom, NeonAtom, ChromiumIon, MethyleneBlue];
      
      for (const molecule of molecules) {
        if (!molecule.fluorescence) continue;
        
        for (const band of molecule.fluorescence) {
          expect(band.quantumYield).toBeGreaterThanOrEqual(0);
          expect(band.quantumYield).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  describe('Material Texture Generation', () => {
    it('all materials can generate fluorescence textures', () => {
      const materials = [
        createGasMaterial(),
        createWaterMaterial(),
        createCrystalMaterial(),
      ];
      
      for (const material of materials) {
        const props = createDefaultProperties(material);
        const textures = material.generateFluorescenceTextures(100, 1000, 100, props);
        
        expect(textures.excitation).toBeInstanceOf(Float32Array);
        expect(textures.emission).toBeInstanceOf(Float32Array);
        expect(textures.excitation.length).toBe(100);
        expect(textures.emission.length).toBe(100);
        expect(typeof textures.totalQuantumYield).toBe('number');
      }
    });

    it('texture values are non-negative', () => {
      const gasMaterial = createGasMaterial();
      const props = createDefaultProperties(gasMaterial);
      props.moleFractions = { sodium: 0.01 };
      
      const textures = gasMaterial.generateFluorescenceTextures(100, 1000, 100, props);
      
      for (let i = 0; i < textures.excitation.length; i++) {
        expect(textures.excitation[i]).toBeGreaterThanOrEqual(0);
        expect(textures.emission[i]).toBeGreaterThanOrEqual(0);
      }
    });
  });
});

