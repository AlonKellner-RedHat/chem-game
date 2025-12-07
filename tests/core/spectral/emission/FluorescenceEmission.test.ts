import { describe, it, expect } from 'vitest';
import { FluorescenceEmission, FluorescenceConfig } from '../../../../src/core/spectral/emission/FluorescenceEmission';

/**
 * Fluorescence Emission Tests
 * 
 * Fluorescence: UV absorption → electron excitation → visible emission
 * 
 * Key physical properties:
 * 1. Stokes shift: Emission wavelength > Absorption wavelength (energy lost to heat)
 * 2. Quantum yield: Fraction of absorbed photons that cause emission (0-1)
 * 3. Excitation spectrum: Which wavelengths cause fluorescence
 * 4. Emission spectrum: Which wavelengths are emitted
 * 
 * Examples:
 * - Sodium D-lines: Absorbs UV/blue, emits at 589nm (orange)
 * - Fluorescein: Absorbs blue (490nm), emits green (520nm)
 * - Quinine: Absorbs UV (350nm), emits blue (450nm)
 */
describe('FluorescenceEmission', () => {
  describe('Basic fluorescence behavior', () => {
    it('should emit at longer wavelength than excitation (Stokes shift)', () => {
      const config: FluorescenceConfig = {
        id: 'test-fluor',
        name: 'Test Fluorophore',
        excitationPeak: 350,      // UV excitation
        excitationWidth: 30,
        emissionPeak: 450,        // Blue emission
        emissionWidth: 40,
        quantumYield: 0.8,
      };
      
      const emitter = new FluorescenceEmission(config);
      
      // Emission peak should be at longer wavelength than excitation
      expect(emitter.getEmissionPeak()).toBeGreaterThan(emitter.getExcitationPeak());
      
      // Stokes shift should be positive
      expect(emitter.getStokesShift()).toBeGreaterThan(0);
    });
    
    it('should require UV excitation to produce visible emission', () => {
      const config: FluorescenceConfig = {
        id: 'uv-fluor',
        name: 'UV Fluorophore',
        excitationPeak: 350,
        excitationWidth: 30,
        emissionPeak: 520,
        emissionWidth: 40,
        quantumYield: 0.9,
      };
      
      const emitter = new FluorescenceEmission(config);
      
      // No emission without excitation
      const noExcitation = emitter.getEmission(0);
      const maxNoExcitation = Math.max(...noExcitation.map(p => p.transmission));
      expect(maxNoExcitation).toBe(0);
      
      // Emission with UV excitation
      const withExcitation = emitter.getEmission(1.0);
      const maxWithExcitation = Math.max(...withExcitation.map(p => p.transmission));
      expect(maxWithExcitation).toBeGreaterThan(0);
    });
    
    it('should scale emission by quantum yield', () => {
      const config1: FluorescenceConfig = {
        id: 'high-yield',
        name: 'High Yield',
        excitationPeak: 400,
        excitationWidth: 20,
        emissionPeak: 500,
        emissionWidth: 30,
        quantumYield: 0.8,
      };
      
      const config2: FluorescenceConfig = {
        ...config1,
        id: 'low-yield',
        name: 'Low Yield',
        quantumYield: 0.4,
      };
      
      const emitter1 = new FluorescenceEmission(config1);
      const emitter2 = new FluorescenceEmission(config2);
      
      const emission1 = emitter1.getEmission(1.0);
      const emission2 = emitter2.getEmission(1.0);
      
      // Compare peak intensities
      const peak1 = Math.max(...emission1.map(p => p.transmission));
      const peak2 = Math.max(...emission2.map(p => p.transmission));
      
      // Should scale with quantum yield ratio
      const ratio = peak1 / peak2;
      expect(ratio).toBeCloseTo(0.8 / 0.4, 1);
    });
  });
  
  describe('Excitation spectrum', () => {
    it('should have Gaussian-like excitation profile', () => {
      const config: FluorescenceConfig = {
        id: 'gaussian-excite',
        name: 'Gaussian Excitation',
        excitationPeak: 400,
        excitationWidth: 30,  // FWHM = 30nm, so sigma ≈ 12.7nm
        emissionPeak: 500,
        emissionWidth: 40,
        quantumYield: 1.0,
      };
      
      const emitter = new FluorescenceEmission(config);
      
      // Excitation efficiency should peak at excitationPeak
      const atPeak = emitter.getExcitationEfficiency(400);
      const atHalfWidth = emitter.getExcitationEfficiency(415); // 15nm = half FWHM
      const farAway = emitter.getExcitationEfficiency(500);
      
      expect(atPeak).toBe(1.0); // Maximum at peak
      expect(atHalfWidth).toBeLessThan(atPeak); // Decreases away from peak
      expect(atHalfWidth).toBeGreaterThan(0.4); // At FWHM/2, should be ~0.5
      expect(farAway).toBeLessThan(0.001); // Negligible far away (100nm = ~8 sigma)
    });
    
    it('should return zero excitation for visible light when UV-excited', () => {
      const config: FluorescenceConfig = {
        id: 'uv-only',
        name: 'UV Only Excitation',
        excitationPeak: 300,
        excitationWidth: 30,
        emissionPeak: 450,
        emissionWidth: 40,
        quantumYield: 1.0,
      };
      
      const emitter = new FluorescenceEmission(config);
      
      // No excitation from visible light
      expect(emitter.getExcitationEfficiency(550)).toBeLessThan(1e-10);
      expect(emitter.getExcitationEfficiency(600)).toBeLessThan(1e-10);
    });
  });
  
  describe('Emission spectrum', () => {
    it('should have Gaussian-like emission profile', () => {
      const config: FluorescenceConfig = {
        id: 'gaussian-emit',
        name: 'Gaussian Emission',
        excitationPeak: 350,
        excitationWidth: 20,
        emissionPeak: 500,
        emissionWidth: 40,
        quantumYield: 1.0,
      };
      
      const emitter = new FluorescenceEmission(config);
      const emission = emitter.getEmission(1.0);
      
      // Find peak
      let peakWavelength = 0;
      let peakIntensity = 0;
      for (const point of emission) {
        if (point.transmission > peakIntensity) {
          peakIntensity = point.transmission;
          peakWavelength = point.wavelength;
        }
      }
      
      // Peak should be at emission peak wavelength
      expect(peakWavelength).toBeCloseTo(500, -1); // Within 10nm
    });
    
    it('should have correct FWHM based on emission width', () => {
      const config: FluorescenceConfig = {
        id: 'fwhm-test',
        name: 'FWHM Test',
        excitationPeak: 350,
        excitationWidth: 20,
        emissionPeak: 500,
        emissionWidth: 40, // FWHM = 2.355 × σ for Gaussian
        quantumYield: 1.0,
      };
      
      const emitter = new FluorescenceEmission(config);
      const emission = emitter.getEmission(1.0, 380, 700, 200);
      
      // Find peak and half-maximum points
      const peakIntensity = Math.max(...emission.map(p => p.transmission));
      const halfMax = peakIntensity / 2;
      
      // Find wavelengths where intensity crosses half-maximum
      let leftHalf = 0, rightHalf = 0;
      for (let i = 0; i < emission.length; i++) {
        if (emission[i].transmission >= halfMax && leftHalf === 0) {
          leftHalf = emission[i].wavelength;
        }
        if (emission[i].transmission >= halfMax) {
          rightHalf = emission[i].wavelength;
        }
      }
      
      const fwhm = rightHalf - leftHalf;
      // FWHM should be approximately equal to emissionWidth
      expect(fwhm).toBeGreaterThan(config.emissionWidth * 0.7);
      expect(fwhm).toBeLessThan(config.emissionWidth * 1.3);
    });
  });
  
  describe('Sodium D-line emission', () => {
    it('should emit at 589nm when excited by UV', () => {
      // Sodium D-lines: classic example of fluorescence
      const sodiumConfig: FluorescenceConfig = {
        id: 'sodium-d',
        name: 'Sodium D-lines',
        excitationPeak: 330,      // UV excitation
        excitationWidth: 50,
        emissionPeak: 589,        // Famous sodium D-line
        emissionWidth: 2,         // Very narrow emission
        quantumYield: 0.95,
      };
      
      const sodium = new FluorescenceEmission(sodiumConfig);
      const emission = sodium.getEmission(1.0, 580, 600, 100);
      
      // Peak should be at 589nm
      let peakWavelength = 0;
      let peakIntensity = 0;
      for (const point of emission) {
        if (point.transmission > peakIntensity) {
          peakIntensity = point.transmission;
          peakWavelength = point.wavelength;
        }
      }
      
      expect(peakWavelength).toBeCloseTo(589, 0);
    });
  });
  
  describe('Multiple fluorophores', () => {
    it('should combine emissions from multiple fluorophores', () => {
      const fluor1 = new FluorescenceEmission({
        id: 'blue-fluor',
        name: 'Blue Fluorophore',
        excitationPeak: 300,
        excitationWidth: 20,
        emissionPeak: 450,
        emissionWidth: 30,
        quantumYield: 0.8,
      });
      
      const fluor2 = new FluorescenceEmission({
        id: 'green-fluor',
        name: 'Green Fluorophore',
        excitationPeak: 350,
        excitationWidth: 20,
        emissionPeak: 520,
        emissionWidth: 30,
        quantumYield: 0.9,
      });
      
      // Get emissions with excitation
      const emission1 = fluor1.getEmission(1.0, 380, 700, 200);
      const emission2 = fluor2.getEmission(1.0, 380, 700, 200);
      
      // Find peak values (don't rely on exact wavelength match)
      const peak1 = Math.max(...emission1.filter(p => p.wavelength >= 430 && p.wavelength <= 470).map(p => p.transmission));
      const peak2 = Math.max(...emission2.filter(p => p.wavelength >= 500 && p.wavelength <= 540).map(p => p.transmission));
      
      // Both should have emission at their peaks
      expect(peak1).toBeGreaterThan(0);
      expect(peak2).toBeGreaterThan(0);
    });
  });
  
  describe('isActive check', () => {
    it('should return true when excitation intensity is above threshold', () => {
      const emitter = new FluorescenceEmission({
        id: 'active-test',
        name: 'Active Test',
        excitationPeak: 350,
        excitationWidth: 30,
        emissionPeak: 500,
        emissionWidth: 40,
        quantumYield: 0.5,
      });
      
      expect(emitter.isActive(0)).toBe(false);
      expect(emitter.isActive(0.01)).toBe(true);
      expect(emitter.isActive(1.0)).toBe(true);
    });
  });
});

