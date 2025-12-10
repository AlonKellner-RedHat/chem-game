/**
 * Mole Fraction Material System Tests (TDD)
 * 
 * Tests for the mole fraction-based material composition system.
 * Written first as part of TDD RED phase.
 */
import { describe, it, expect } from 'vitest';

// These imports will fail initially (RED phase) - implementations come later
import {
  AbsorptionModel,
  BaseMaterialAbsorption,
  MoleculeAbsorption,
} from '../../core/materials/AbsorptionModel';
import {
  PURE_WATER_ABSORPTION,
  PURE_CORUNDUM_ABSORPTION,
  AIR_ABSORPTION,
} from '../../core/materials/AbsorptionData';
import {
  createWaterMaterial,
  createCrystalMaterial,
  createGasMaterial,
  createDefaultProperties,
  Material,
  MaterialProperties,
} from '../../core/materials';

describe('Mole Fraction Material System', () => {
  
  // ============================================================
  // AbsorptionModel Interface Tests
  // ============================================================
  
  describe('AbsorptionModel interface', () => {
    it('BaseMaterialAbsorption returns extinction for pure water', () => {
      const waterAbsorption = new BaseMaterialAbsorption('pure-water', PURE_WATER_ABSORPTION);
      
      // Should return a positive extinction coefficient
      const extinction = waterAbsorption.getExtinction(550, 300, 1);
      expect(extinction).toBeGreaterThan(0);
    });
    
    it('MoleculeAbsorption returns extinction from peaks', () => {
      const molecule = {
        id: 'test-molecule',
        name: 'Test',
        mass: 100,
        pressureBroadening: 0,
        peaks: [
          { wavelength: 500, extinction: 10, naturalWidth: 20 },
        ],
      };
      
      const moleculeAbsorption = new MoleculeAbsorption(molecule);
      
      // Should have peak extinction at 500nm
      const extinctionAtPeak = moleculeAbsorption.getExtinction(500, 300, 1);
      const extinctionOffPeak = moleculeAbsorption.getExtinction(400, 300, 1);
      
      expect(extinctionAtPeak).toBeGreaterThan(extinctionOffPeak);
    });
    
    it('extinction varies with wavelength for water', () => {
      const waterAbsorption = new BaseMaterialAbsorption('pure-water', PURE_WATER_ABSORPTION);
      
      const blueExtinction = waterAbsorption.getExtinction(450, 300, 1);
      const redExtinction = waterAbsorption.getExtinction(650, 300, 1);
      
      // Red should be absorbed more than blue (water is blue)
      expect(redExtinction).toBeGreaterThan(blueExtinction);
    });
    
    it('AbsorptionModel has id property', () => {
      const waterAbsorption = new BaseMaterialAbsorption('pure-water', PURE_WATER_ABSORPTION);
      expect(waterAbsorption.id).toBe('pure-water');
    });
  });
  
  // ============================================================
  // Pure Water Absorption Tests (Pope & Fry 1997 data)
  // ============================================================
  
  describe('Pure water absorption (Pope & Fry data)', () => {
    it('has minimum absorption near 418nm (~0.0044 m^-1)', () => {
      const waterAbsorption = new BaseMaterialAbsorption('pure-water', PURE_WATER_ABSORPTION);
      
      const extinction418 = waterAbsorption.getExtinction(418, 300, 1);
      
      // Pope & Fry: 0.0044 m^-1 at 418nm
      expect(extinction418).toBeCloseTo(0.0044, 3);
    });
    
    it('has higher absorption at 600nm (~0.24 m^-1)', () => {
      const waterAbsorption = new BaseMaterialAbsorption('pure-water', PURE_WATER_ABSORPTION);
      
      const extinction600 = waterAbsorption.getExtinction(600, 300, 1);
      
      // Pope & Fry: ~0.244 m^-1 at 600nm
      expect(extinction600).toBeCloseTo(0.244, 2);
    });
    
    it('has highest visible absorption at 700nm (~0.65 m^-1)', () => {
      const waterAbsorption = new BaseMaterialAbsorption('pure-water', PURE_WATER_ABSORPTION);
      
      const extinction700 = waterAbsorption.getExtinction(700, 300, 1);
      
      // Pope & Fry: ~0.65 m^-1 at 700nm
      expect(extinction700).toBeCloseTo(0.65, 1);
    });
    
    it('blue/red absorption ratio matches physical data', () => {
      const waterAbsorption = new BaseMaterialAbsorption('pure-water', PURE_WATER_ABSORPTION);
      
      const blue450 = waterAbsorption.getExtinction(450, 300, 1);
      const red650 = waterAbsorption.getExtinction(650, 300, 1);
      
      // Red should be ~37x more absorbed than blue (0.349 / 0.0094 ≈ 37)
      const ratio = red650 / blue450;
      expect(ratio).toBeGreaterThan(30);
      expect(ratio).toBeLessThan(45);
    });
    
    it('interpolates between data points', () => {
      const waterAbsorption = new BaseMaterialAbsorption('pure-water', PURE_WATER_ABSORPTION);
      
      // 475nm is between 450 (0.0094) and 500 (0.0257)
      const extinction475 = waterAbsorption.getExtinction(475, 300, 1);
      
      expect(extinction475).toBeGreaterThan(0.0094);
      expect(extinction475).toBeLessThan(0.0257);
    });
  });
  
  // ============================================================
  // Mole Fraction Composition Tests
  // ============================================================
  
  describe('Mole fraction composition', () => {
    it('base mole fraction = 1 - sum(additive fractions)', () => {
      const water = createWaterMaterial();
      const props: MaterialProperties = {
        moleFractions: {
          'copper-sulfate': 0.01,  // 1%
          'methylene-blue': 0.02, // 2%
        },
        pathLength: 100,
        temperature: 300,
        pressure: 1,
      };
      
      // Base should be 97% (1 - 0.01 - 0.02)
      const baseFraction = water.getBaseMoleFraction(props);
      expect(baseFraction).toBeCloseTo(0.97, 4);
    });
    
    it('throws error if total fractions exceed 1.0', () => {
      const water = createWaterMaterial();
      const props: MaterialProperties = {
        moleFractions: {
          'copper-sulfate': 0.6,
          'methylene-blue': 0.5, // Total = 1.1 > 1.0
        },
        pathLength: 100,
        temperature: 300,
        pressure: 1,
      };
      
      expect(() => water.getBaseMoleFraction(props)).toThrow();
    });
    
    it('0% additives equals pure base material', () => {
      const water = createWaterMaterial();
      const props: MaterialProperties = {
        moleFractions: {
          'copper-sulfate': 0,
          'methylene-blue': 0,
        },
        pathLength: 100,
        temperature: 300,
        pressure: 1,
      };
      
      const baseFraction = water.getBaseMoleFraction(props);
      expect(baseFraction).toBe(1.0);
    });
    
    it('adding solute decreases base fraction only', () => {
      const water = createWaterMaterial();
      
      const props1: MaterialProperties = {
        moleFractions: {
          'copper-sulfate': 0.01,
          'methylene-blue': 0.02,
        },
        pathLength: 100,
        temperature: 300,
        pressure: 1,
      };
      
      const props2: MaterialProperties = {
        moleFractions: {
          'copper-sulfate': 0.05, // Increased from 1% to 5%
          'methylene-blue': 0.02, // Unchanged
        },
        pathLength: 100,
        temperature: 300,
        pressure: 1,
      };
      
      const base1 = water.getBaseMoleFraction(props1);
      const base2 = water.getBaseMoleFraction(props2);
      
      // Base decreased by 4%
      expect(base1 - base2).toBeCloseTo(0.04, 4);
      
      // Methylene blue fraction unchanged
      expect(props2.moleFractions['methylene-blue']).toBe(0.02);
    });
  });
  
  // ============================================================
  // Transmission Calculation Tests
  // ============================================================
  
  describe('Transmission calculation', () => {
    it('pure water at 10m depth appears blue (red attenuated more)', () => {
      const water = createWaterMaterial();
      const props: MaterialProperties = {
        moleFractions: {}, // No additives = pure water
        pathLength: 1000, // 10 meters = 1000 cm
        temperature: 300,
        pressure: 1,
      };
      
      const spectrum = water.generateTransmissionSpectrum(400, 700, 100, props);
      
      // Sample blue (index ~16 for 450nm) and red (index ~83 for 650nm)
      const blueIdx = Math.round((450 - 400) / 3);
      const redIdx = Math.round((650 - 400) / 3);
      
      const blueTransmission = spectrum[blueIdx];
      const redTransmission = spectrum[redIdx];
      
      // Blue should transmit more than red (water absorbs red more)
      expect(blueTransmission).toBeGreaterThan(redTransmission);
      
      // At 10m, there should be noticeable absorption
      expect(redTransmission).toBeLessThan(0.5);
    });
    
    it('adding dye increases wavelength-specific absorption', () => {
      const water = createWaterMaterial();
      
      const pureProps: MaterialProperties = {
        moleFractions: {},
        pathLength: 100,
        temperature: 300,
        pressure: 1,
      };
      
      const dyeProps: MaterialProperties = {
        moleFractions: {
          'copper-sulfate': 0.001, // 0.1% copper sulfate
        },
        pathLength: 100,
        temperature: 300,
        pressure: 1,
      };
      
      const pureSpectrum = water.generateTransmissionSpectrum(400, 900, 100, pureProps);
      const dyeSpectrum = water.generateTransmissionSpectrum(400, 900, 100, dyeProps);
      
      // Copper sulfate absorbs at 800nm - transmission should be lower with dye
      const idx800 = Math.round((800 - 400) / 5);
      
      expect(dyeSpectrum[idx800]).toBeLessThan(pureSpectrum[idx800]);
    });
    
    it('mole fraction weighted absorption is additive', () => {
      const water = createWaterMaterial();
      
      // Low concentration
      const lowProps: MaterialProperties = {
        moleFractions: { 'copper-sulfate': 0.001 },
        pathLength: 100,
        temperature: 300,
        pressure: 1,
      };
      
      // Higher concentration
      const highProps: MaterialProperties = {
        moleFractions: { 'copper-sulfate': 0.01 },
        pathLength: 100,
        temperature: 300,
        pressure: 1,
      };
      
      const lowSpectrum = water.generateTransmissionSpectrum(400, 900, 100, lowProps);
      const highSpectrum = water.generateTransmissionSpectrum(400, 900, 100, highProps);
      
      // Higher concentration should have lower transmission
      const idx800 = Math.round((800 - 400) / 5);
      expect(highSpectrum[idx800]).toBeLessThan(lowSpectrum[idx800]);
    });
    
    it('pure corundum is transparent in visible range', () => {
      const crystal = createCrystalMaterial();
      const props: MaterialProperties = {
        moleFractions: {}, // No dopants
        pathLength: 100,
        temperature: 300,
        pressure: 1,
      };
      
      const spectrum = crystal.generateTransmissionSpectrum(400, 700, 100, props);
      
      // Should be nearly fully transparent
      const avgTransmission = spectrum.reduce((a, b) => a + b, 0) / spectrum.length;
      expect(avgTransmission).toBeGreaterThan(0.99);
    });
    
    it('air is transparent in visible range', () => {
      const gas = createGasMaterial();
      const props: MaterialProperties = {
        moleFractions: {}, // No atomic species
        pathLength: 10000, // 100 meters
        temperature: 300,
        pressure: 1,
      };
      
      const spectrum = gas.generateTransmissionSpectrum(400, 700, 100, props);
      
      // Should be nearly fully transparent
      const avgTransmission = spectrum.reduce((a, b) => a + b, 0) / spectrum.length;
      expect(avgTransmission).toBeGreaterThan(0.99);
    });
  });
  
  // ============================================================
  // Material Interface Tests
  // ============================================================
  
  describe('Material has base absorption', () => {
    it('water material has baseAbsorption property', () => {
      const water = createWaterMaterial();
      expect(water.baseAbsorption).toBeDefined();
      expect(water.baseAbsorption.id).toBe('pure-water');
    });
    
    it('crystal material has baseAbsorption property', () => {
      const crystal = createCrystalMaterial();
      expect(crystal.baseAbsorption).toBeDefined();
      expect(crystal.baseAbsorption.id).toBe('pure-crystal');
    });
    
    it('gas material has baseAbsorption property', () => {
      const gas = createGasMaterial();
      expect(gas.baseAbsorption).toBeDefined();
      expect(gas.baseAbsorption.id).toBe('pure-gas');
    });
    
    it('water has baseMolarConcentration of ~55.5 mol/L', () => {
      const water = createWaterMaterial();
      expect(water.baseMolarConcentration).toBeCloseTo(55.5, 0);
    });
  });
  
  // ============================================================
  // Backward Compatibility Tests
  // ============================================================
  
  describe('Backward compatibility', () => {
    it('createDefaultProperties returns moleFractions', () => {
      const water = createWaterMaterial();
      const props = createDefaultProperties(water);
      
      expect(props.moleFractions).toBeDefined();
      expect(typeof props.moleFractions).toBe('object');
    });
    
    it('default mole fractions are small percentages', () => {
      const water = createWaterMaterial();
      const props = createDefaultProperties(water);
      
      // Default should be small fractions (not mol/L anymore)
      for (const molecule of water.molecules) {
        const fraction = props.moleFractions[molecule.id];
        expect(fraction).toBeDefined();
        expect(fraction).toBeGreaterThan(0);
        expect(fraction).toBeLessThan(0.1); // Less than 10%
      }
    });
  });
});

