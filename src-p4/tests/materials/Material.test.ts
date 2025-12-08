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
    
    it('has two molecules', () => {
      const water = createWaterMaterial();
      expect(water.molecules).toHaveLength(2);
    });
    
    it('generates transmission spectrum', () => {
      const water = createWaterMaterial();
      const props = createDefaultProperties(water);
      
      const spectrum = water.generateTransmissionSpectrum(400, 700, 100, props);
      
      expect(spectrum).toHaveLength(100);
      expect(spectrum.every(v => v >= 0 && v <= 1)).toBe(true);
    });
    
    it('full transmission with zero concentration', () => {
      const water = createWaterMaterial();
      const props = createDefaultProperties(water, 0); // Zero concentration
      
      const spectrum = water.generateTransmissionSpectrum(400, 700, 100, props);
      
      // Should be nearly 1.0 everywhere (no absorption)
      expect(spectrum.every(v => v > 0.99)).toBe(true);
    });
    
    it('absorption increases with concentration', () => {
      const water = createWaterMaterial();
      
      const lowConc = createDefaultProperties(water, 0.001);
      const highConc = createDefaultProperties(water, 0.1);
      
      const lowSpectrum = water.generateTransmissionSpectrum(400, 700, 100, lowConc);
      const highSpectrum = water.generateTransmissionSpectrum(400, 700, 100, highConc);
      
      // Higher concentration should have lower transmission
      const lowAvg = lowSpectrum.reduce((a, b) => a + b, 0) / 100;
      const highAvg = highSpectrum.reduce((a, b) => a + b, 0) / 100;
      
      expect(highAvg).toBeLessThan(lowAvg);
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
      expect(sodium!.peaks[0].bandwidth).toBeLessThan(5);
    });
  });
  
  describe('getAllMaterials', () => {
    it('returns three materials', () => {
      const materials = getAllMaterials();
      expect(materials).toHaveLength(3);
    });
    
    it('includes water, crystal, and gas', () => {
      const materials = getAllMaterials();
      const ids = materials.map(m => m.id);
      
      expect(ids).toContain('water');
      expect(ids).toContain('crystal');
      expect(ids).toContain('gas');
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
    it('sets default concentration for all molecules', () => {
      const water = createWaterMaterial();
      const props = createDefaultProperties(water);
      
      for (const molecule of water.molecules) {
        expect(props.concentrations[molecule.id]).toBeDefined();
        expect(props.concentrations[molecule.id]).toBeGreaterThan(0);
      }
    });
    
    it('uses provided default concentration', () => {
      const water = createWaterMaterial();
      const props = createDefaultProperties(water, 0.05);
      
      expect(props.concentrations['copper-sulfate']).toBe(0.05);
    });
    
    it('sets default temperature', () => {
      const water = createWaterMaterial();
      const props = createDefaultProperties(water);
      
      expect(props.temperature).toBe(300);
    });
  });
});




