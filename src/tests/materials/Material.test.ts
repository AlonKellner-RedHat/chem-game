/**
 * Tests for Material system
 */
import { describe, it, expect } from 'vitest';
import {
  createWaterMaterial,
  createCrystalMaterial,
  createGasMaterial,
  createDefaultProperties,
  getAllMaterials,
  getMaterialById,
} from '../../core/materials';

describe('Materials', () => {
  describe('createWaterMaterial', () => {
    it('has correct id and name', () => {
      const water = createWaterMaterial();
      expect(water.id).toBe('water');
      expect(water.name).toBe('Water');
    });
    
    it('has two additive molecules', () => {
      const water = createWaterMaterial();
      expect(water.molecules).toHaveLength(2);
    });
    
    it('has base absorption model', () => {
      const water = createWaterMaterial();
      expect(water.baseAbsorption).toBeDefined();
      expect(water.baseAbsorption.id).toBe('pure-water');
    });
    
    it('has correct base molar concentration (~55.5 mol/L)', () => {
      const water = createWaterMaterial();
      expect(water.baseMolarConcentration).toBeCloseTo(55.5, 0);
    });
    
    it('generates transmission spectrum', () => {
      const water = createWaterMaterial();
      const props = createDefaultProperties(water);
      
      const spectrum = water.generateTransmissionSpectrum(400, 700, 100, props);
      
      expect(spectrum).toHaveLength(100);
      expect(spectrum.every(v => v >= 0 && v <= 1)).toBe(true);
    });
    
    it('full transmission with zero mole fractions', () => {
      const water = createWaterMaterial();
      const props = createDefaultProperties(water, 0); // Zero mole fraction
      props.pathLength = 0.01; // Very short path to minimize base absorption
      
      const spectrum = water.generateTransmissionSpectrum(400, 700, 100, props);
      
      // Should be high transmission (minimal absorption at short path)
      expect(spectrum.every(v => v > 0.9)).toBe(true);
    });
    
    it('absorption increases with additive mole fraction', () => {
      const water = createWaterMaterial();
      
      const lowFrac = createDefaultProperties(water, 0.0001);
      const highFrac = createDefaultProperties(water, 0.01);
      
      const lowSpectrum = water.generateTransmissionSpectrum(400, 900, 100, lowFrac);
      const highSpectrum = water.generateTransmissionSpectrum(400, 900, 100, highFrac);
      
      // Higher mole fraction should have lower transmission
      const lowAvg = lowSpectrum.reduce((a, b) => a + b, 0) / 100;
      const highAvg = highSpectrum.reduce((a, b) => a + b, 0) / 100;
      
      expect(highAvg).toBeLessThan(lowAvg);
    });
    
    it('pure water absorbs red more than blue', () => {
      const water = createWaterMaterial();
      const props = createDefaultProperties(water, 0); // Pure water (no additives)
      props.pathLength = 1000; // 10 meters to see the effect
      
      const spectrum = water.generateTransmissionSpectrum(400, 700, 100, props);
      
      // Blue region (around index 16 for 450nm)
      const blueIdx = Math.round((450 - 400) / 3);
      // Red region (around index 83 for 650nm)  
      const redIdx = Math.round((650 - 400) / 3);
      
      // Blue should transmit more than red
      expect(spectrum[blueIdx]).toBeGreaterThan(spectrum[redIdx]);
    });
  });
  
  describe('createCrystalMaterial', () => {
    it('has correct id and name', () => {
      const crystal = createCrystalMaterial();
      expect(crystal.id).toBe('crystal');
      expect(crystal.name).toBe('Crystal');
    });
    
    it('has higher UV cutoff', () => {
      const crystal = createCrystalMaterial();
      expect(crystal.uvCutoff).toBe(150);
    });
    
    it('has base absorption model for crystal', () => {
      const crystal = createCrystalMaterial();
      expect(crystal.baseAbsorption).toBeDefined();
      expect(crystal.baseAbsorption.id).toBe('pure-crystal');
    });
    
    it('pure corundum is transparent in visible', () => {
      const crystal = createCrystalMaterial();
      const props = createDefaultProperties(crystal, 0); // No dopants
      props.pathLength = 1; // 1 cm
      
      const spectrum = crystal.generateTransmissionSpectrum(400, 700, 100, props);
      
      // Should be nearly fully transparent
      const avgTransmission = spectrum.reduce((a, b) => a + b, 0) / spectrum.length;
      expect(avgTransmission).toBeGreaterThan(0.99);
    });
  });
  
  describe('createGasMaterial', () => {
    it('has correct id and name', () => {
      const gas = createGasMaterial();
      expect(gas.id).toBe('gas');
      expect(gas.name).toBe('Gas');
    });
    
    it('has atomic line spectra (narrow peaks)', () => {
      const gas = createGasMaterial();
      
      // Check sodium has narrow D-line peaks
      const sodium = gas.molecules.find(m => m.id === 'sodium');
      expect(sodium).toBeDefined();
      expect(sodium!.peaks[0].naturalWidth).toBeLessThan(5);
    });
    
    it('has base absorption model for gas', () => {
      const gas = createGasMaterial();
      expect(gas.baseAbsorption).toBeDefined();
      expect(gas.baseAbsorption.id).toBe('pure-gas');
    });
    
    it('pure air is transparent in visible', () => {
      const gas = createGasMaterial();
      const props = createDefaultProperties(gas, 0); // No atomic species
      props.pathLength = 10000; // 100 meters
      
      const spectrum = gas.generateTransmissionSpectrum(400, 700, 100, props);
      
      // Should be nearly fully transparent
      const avgTransmission = spectrum.reduce((a, b) => a + b, 0) / spectrum.length;
      expect(avgTransmission).toBeGreaterThan(0.99);
    });
  });
  
  describe('getAllMaterials', () => {
    it('returns four materials', () => {
      const materials = getAllMaterials();
      expect(materials).toHaveLength(4);
    });
    
    it('includes water, crystal, gas, and gold', () => {
      const materials = getAllMaterials();
      const ids = materials.map(m => m.id);
      
      expect(ids).toContain('water');
      expect(ids).toContain('crystal');
      expect(ids).toContain('gas');
      expect(ids).toContain('gold');
    });
    
    it('all materials have base absorption', () => {
      const materials = getAllMaterials();
      for (const material of materials) {
        expect(material.baseAbsorption).toBeDefined();
        expect(typeof material.baseAbsorption.getExtinction).toBe('function');
      }
    });
  });
  
  describe('getMaterialById', () => {
    it('finds water by id', () => {
      const water = getMaterialById('water');
      expect(water).toBeDefined();
      expect(water!.name).toBe('Water');
    });
    
    it('returns undefined for unknown id', () => {
      const unknown = getMaterialById('unknown');
      expect(unknown).toBeUndefined();
    });
  });
  
  describe('createDefaultProperties', () => {
    it('sets default mole fractions for all molecules', () => {
      const water = createWaterMaterial();
      const props = createDefaultProperties(water);
      
      for (const molecule of water.molecules) {
        expect(props.moleFractions[molecule.id]).toBeDefined();
        expect(props.moleFractions[molecule.id]).toBeGreaterThan(0);
      }
    });
    
    it('uses provided default mole fraction', () => {
      const water = createWaterMaterial();
      const props = createDefaultProperties(water, 0.005);
      
      expect(props.moleFractions['copper-sulfate']).toBe(0.005);
    });
    
    it('sets default temperature', () => {
      const water = createWaterMaterial();
      const props = createDefaultProperties(water);
      
      expect(props.temperature).toBe(300);
    });
    
    it('default mole fractions are small (< 10%)', () => {
      const water = createWaterMaterial();
      const props = createDefaultProperties(water);
      
      for (const molecule of water.molecules) {
        expect(props.moleFractions[molecule.id]).toBeLessThan(0.1);
      }
    });
  });
  
  describe('getBaseMoleFraction', () => {
    it('returns 1.0 when no additives', () => {
      const water = createWaterMaterial();
      const props = createDefaultProperties(water, 0);
      
      const baseFraction = water.getBaseMoleFraction(props);
      expect(baseFraction).toBe(1.0);
    });
    
    it('decreases with additive fractions', () => {
      const water = createWaterMaterial();
      const props = createDefaultProperties(water);
      props.moleFractions['copper-sulfate'] = 0.05;
      props.moleFractions['methylene-blue'] = 0.02;
      
      const baseFraction = water.getBaseMoleFraction(props);
      expect(baseFraction).toBeCloseTo(0.93, 4);
    });
    
    it('throws when fractions exceed 1.0', () => {
      const water = createWaterMaterial();
      const props = createDefaultProperties(water);
      props.moleFractions['copper-sulfate'] = 0.6;
      props.moleFractions['methylene-blue'] = 0.5;
      
      expect(() => water.getBaseMoleFraction(props)).toThrow();
    });
  });
});
