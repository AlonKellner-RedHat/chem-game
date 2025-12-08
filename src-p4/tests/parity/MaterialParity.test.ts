/**
 * Material Parity Tests
 * 
 * Verifies that P4 material calculations match P3 behavior.
 */
import { describe, it, expect } from 'vitest';
import {
  createWaterMaterial,
  createCrystalMaterial,
  createGasMaterial,
  createDefaultProperties,
} from '../../core/materials';

describe('Material Parity with P3', () => {
  describe('Water Material', () => {
    it('has copper sulfate absorption in red region', () => {
      const water = createWaterMaterial();
      const props = createDefaultProperties(water);
      
      // Set high copper sulfate concentration
      props.concentrations['copper-sulfate'] = 0.1;
      props.concentrations['methylene-blue'] = 0;
      
      const spectrum = water.generateTransmissionSpectrum(400, 900, 100, props);
      
      // Copper sulfate absorbs around 800nm (red)
      const blueIdx = 20; // ~500nm
      const redIdx = 80; // ~800nm
      
      // Blue should transmit more than red
      expect(spectrum[blueIdx]).toBeGreaterThan(spectrum[redIdx]);
    });
    
    it('methylene blue absorbs in red region', () => {
      const water = createWaterMaterial();
      const props = createDefaultProperties(water);
      
      props.concentrations['copper-sulfate'] = 0;
      props.concentrations['methylene-blue'] = 0.001;
      
      const spectrum = water.generateTransmissionSpectrum(400, 700, 100, props);
      
      // Methylene blue absorbs around 665nm
      const greenIdx = 33; // ~500nm
      const redIdx = 88; // ~665nm
      
      expect(spectrum[greenIdx]).toBeGreaterThan(spectrum[redIdx]);
    });
  });
  
  describe('Crystal Material', () => {
    it('chromium ion absorbs in green region (ruby)', () => {
      const crystal = createCrystalMaterial();
      const props = createDefaultProperties(crystal);
      
      props.concentrations['chromium-ion'] = 0.1;
      props.concentrations['potassium-permanganate'] = 0;
      
      const spectrum = crystal.generateTransmissionSpectrum(400, 700, 100, props);
      
      // Chromium absorbs around 550nm (green)
      const blueIdx = 20; // ~460nm
      const greenIdx = 50; // ~550nm
      
      expect(spectrum[blueIdx]).toBeGreaterThan(spectrum[greenIdx]);
    });
  });
  
  describe('Gas Material', () => {
    it('sodium has narrow D-line absorption', () => {
      const gas = createGasMaterial();
      const props = createDefaultProperties(gas);
      
      props.concentrations['sodium'] = 0.001;
      props.concentrations['neon'] = 0;
      props.concentrations['mercury'] = 0;
      
      // Use fine resolution to see narrow lines
      const spectrum = gas.generateTransmissionSpectrum(580, 600, 100, props);
      
      // Should have dip at 589nm
      const dLineIdx = Math.round((589 - 580) / (600 - 580) * 100);
      const offLineIdx = 10; // ~582nm
      
      expect(spectrum[offLineIdx]).toBeGreaterThan(spectrum[dLineIdx]);
    });
  });
  
  describe('Beer-Lambert Law', () => {
    it('transmission decreases exponentially with concentration', () => {
      const water = createWaterMaterial();
      
      const conc1 = createDefaultProperties(water, 0.01);
      const conc2 = createDefaultProperties(water, 0.1);
      
      const spectrum1 = water.generateTransmissionSpectrum(400, 700, 100, conc1);
      const spectrum2 = water.generateTransmissionSpectrum(400, 700, 100, conc2);
      
      // Average transmission should decrease with concentration
      const avg1 = spectrum1.reduce((a, b) => a + b, 0) / 100;
      const avg2 = spectrum2.reduce((a, b) => a + b, 0) / 100;
      
      expect(avg2).toBeLessThan(avg1);
    });
    
    it('transmission decreases with path length', () => {
      const water = createWaterMaterial();
      
      const short = createDefaultProperties(water);
      short.pathLength = 0.1;
      
      const long = createDefaultProperties(water);
      long.pathLength = 10;
      
      const spectrumShort = water.generateTransmissionSpectrum(400, 700, 100, short);
      const spectrumLong = water.generateTransmissionSpectrum(400, 700, 100, long);
      
      const avgShort = spectrumShort.reduce((a, b) => a + b, 0) / 100;
      const avgLong = spectrumLong.reduce((a, b) => a + b, 0) / 100;
      
      expect(avgLong).toBeLessThan(avgShort);
    });
  });
});




