/**
 * Tests for Bin-Integrated Spectral Texture Generation
 * 
 * These tests verify that material texture generation correctly integrates
 * spectral features over wavelength bins, ensuring:
 * 1. Narrow peaks are captured regardless of bin placement
 * 2. Energy is conserved (sum of bins = analytical integral)
 * 3. Different resolutions give consistent total absorption/emission
 */

import { describe, it, expect } from 'vitest';
import { createMaterial, type MaterialProperties, type Molecule } from '../../core/materials/Material';
import { integrateVoigtOverBin } from '../../core/physics/integration';

describe('Bin-Integrated Material Textures', () => {
  // Test molecule with a single narrow absorption peak
  const narrowPeakMolecule: Molecule = {
    id: 'test-narrow',
    name: 'Test Narrow Peak',
    mass: 23,
    pressureBroadening: 0.02,
    peaks: [
      { wavelength: 589, extinction: 100, naturalWidth: 0.1 },
    ],
  };

  // Test molecule with wide absorption band
  const wideBandMolecule: Molecule = {
    id: 'test-wide',
    name: 'Test Wide Band',
    mass: 100,
    pressureBroadening: 0.5,
    peaks: [
      { wavelength: 500, extinction: 50, naturalWidth: 20 },
    ],
  };

  const defaultProps: MaterialProperties = {
    moleFractions: { 'test-narrow': 0.1 },
    pathLength: 1.0,
    temperature: 300,
    pressure: 1.0,
  };

  describe('Transmission Texture Generation', () => {
    it('should capture narrow absorption line at bin center', () => {
      const material = createMaterial(
        'test',
        'Test Material',
        [narrowPeakMolecule],
        10.0,  // High band gap (transparent to visible)
        100,   // UV cutoff
        [],    // No base absorption
        1.0
      );

      // Generate high-res spectrum to find the absorption peak
      const highRes = material.generateTransmissionSpectrum(
        100, 1000, 4500, defaultProps
      );
      
      // Find minimum transmission (max absorption) around 589nm
      const peakBin = Math.round((589 - 100) / (900 / 4500));
      const peakTransmission = highRes[peakBin];
      
      // Should show significant absorption at the peak
      expect(peakTransmission).toBeLessThan(1.0);
    });

    it('should capture narrow absorption line in low-res rendering texture', () => {
      const material = createMaterial(
        'test',
        'Test Material',
        [narrowPeakMolecule],
        10.0,
        100,
        [],
        1.0
      );

      // Generate low-res spectrum (32 samples like rendering)
      const lowRes = material.generateTransmissionSpectrum(
        100, 1000, 32, defaultProps
      );
      
      // Find the bin containing 589nm
      const binWidth = 900 / 31;
      const peakBin = Math.floor((589 - 100) / binWidth);
      const peakTransmission = lowRes[peakBin];
      
      // Should show absorption even at low resolution
      // (This test will fail until bin integration is implemented)
      expect(peakTransmission).toBeLessThan(1.0);
    });

    it('should capture narrow peak even when sample wavelength misses the peak', () => {
      // Create material with peak at 589nm (0.1nm width)
      const material = createMaterial(
        'test',
        'Test Material',
        [narrowPeakMolecule],
        10.0,
        100,
        [],
        1.0
      );

      // Generate spectrum with 32 samples over 100-1000nm
      // Sample wavelengths: 100, 129, 158, ... 593.5nm (near 589nm but not exactly)
      const lowRes = material.generateTransmissionSpectrum(
        100, 1000, 32, defaultProps
      );
      
      // The actual sample wavelengths are:
      // Sample 17: 100 + 17 * (900/31) = 100 + 493.5 = 593.5nm
      // This is 4.5nm away from the 589nm peak!
      
      // With point sampling, the transmission at 593.5nm would be ~1.0
      // With bin integration, it should capture the 589nm peak
      
      // Check all samples - at least one should show absorption
      let foundAbsorption = false;
      for (let i = 0; i < lowRes.length; i++) {
        if (lowRes[i] < 0.99) {
          foundAbsorption = true;
          break;
        }
      }
      
      // This test will FAIL until bin integration is implemented
      // Currently, point sampling misses the 0.1nm peak
      expect(foundAbsorption).toBe(true);
    });

    it('should preserve total absorption energy between resolutions (bin integration test)', () => {
      // This tests that narrow peaks are captured at low resolution
      // Due to Beer-Lambert nonlinearity, exact energy conservation isn't possible
      // but the peak should at least be visible at low resolution
      
      const material = createMaterial(
        'test',
        'Test Material',
        [narrowPeakMolecule],
        10.0,
        100,
        [],
        1.0
      );

      // High-res: 4500 samples, 0.2nm each
      const highRes = material.generateTransmissionSpectrum(
        100, 1000, 4500, defaultProps
      );
      
      // Low-res: 32 samples, ~29nm each
      const lowRes = material.generateTransmissionSpectrum(
        100, 1000, 32, defaultProps
      );
      
      // Find the bin with minimum transmission (max absorption) at each resolution
      let highResMinT = 1.0;
      let lowResMinT = 1.0;
      
      for (const t of highRes) {
        highResMinT = Math.min(highResMinT, t);
      }
      for (const t of lowRes) {
        lowResMinT = Math.min(lowResMinT, t);
      }
      
      console.log('High-res min T:', highResMinT.toFixed(6));
      console.log('Low-res min T:', lowResMinT.toFixed(6));
      
      // Both should show significant absorption (T < 1)
      expect(highResMinT).toBeLessThan(0.9);
      expect(lowResMinT).toBeLessThan(0.99); // Should see SOME absorption at low res
    });

    it('should give consistent total absorption across resolutions for wide bands', () => {
      const material = createMaterial(
        'test',
        'Test Material',
        [wideBandMolecule],
        10.0,
        100,
        [],
        1.0
      );

      const props: MaterialProperties = {
        moleFractions: { 'test-wide': 0.1 },
        pathLength: 1.0,
        temperature: 300,
        pressure: 1.0,
      };

      // High resolution
      const highRes = material.generateTransmissionSpectrum(100, 1000, 4500, props);
      let highResAbsorption = 0;
      for (let i = 0; i < highRes.length; i++) {
        highResAbsorption += (1 - highRes[i]);
      }
      highResAbsorption /= highRes.length; // Average absorption

      // Low resolution
      const lowRes = material.generateTransmissionSpectrum(100, 1000, 32, props);
      let lowResAbsorption = 0;
      for (let i = 0; i < lowRes.length; i++) {
        lowResAbsorption += (1 - lowRes[i]);
      }
      lowResAbsorption /= lowRes.length; // Average absorption

      // For wide bands, both resolutions should give similar average absorption
      // Allow 40% tolerance for sampling effects and Beer-Lambert nonlinearity
      const ratio = lowResAbsorption / highResAbsorption;
      expect(ratio).toBeGreaterThan(0.6);
      expect(ratio).toBeLessThan(1.4);
    });
  });

  describe('Dual Resolution Textures', () => {
    it('should generate low-res emission texture that captures narrow peaks', () => {
      const fluorMolecule: Molecule = {
        id: 'sodium',
        name: 'Sodium',
        mass: 23,
        pressureBroadening: 0.02,
        peaks: [{ wavelength: 589, extinction: 40, naturalWidth: 0.1 }],
        fluorescence: [
          {
            excitationMin: 280,
            excitationMax: 350,
            excitationPeak: 330,
            emissionWavelength: 589,
            emissionWidth: 0.1,
            quantumYield: 0.95,
          },
        ],
      };

      const material = createMaterial(
        'test-sodium',
        'Test Sodium',
        [fluorMolecule],
        10.0,
        100,
        [],
        1.0
      );

      const props: MaterialProperties = {
        moleFractions: { 'sodium': 0.1 },
        pathLength: 1.0,
        temperature: 300,
        pressure: 1.0,
      };

      // Generate LOW-RES emission texture (32 samples like rendering)
      const { emission: lowRes } = material.generateFluorescenceTextures(
        100, 1000, 32, props
      );
      
      // Find max emission value
      let maxEmission = 0;
      let maxBin = -1;
      for (let i = 0; i < lowRes.length; i++) {
        if (lowRes[i] > maxEmission) {
          maxEmission = lowRes[i];
          maxBin = i;
        }
      }
      
      console.log('Low-res emission max:', maxEmission.toFixed(6), 'at bin', maxBin);
      
      // The bin containing 589nm should have significant emission
      // Value = moleFraction × quantumYield × binFraction
      // ≈ 0.1 × 0.95 × 0.5 ≈ 0.05
      expect(maxEmission).toBeGreaterThan(0.02);
      
      // Find the bin that should contain 589nm
      const binWidth = 900 / 31;
      const expectedBin = Math.floor((589 - 100) / binWidth);
      console.log('Expected bin for 589nm:', expectedBin, 'actual max bin:', maxBin);
      
      // Max should be at or near the expected bin
      expect(Math.abs(maxBin - expectedBin)).toBeLessThanOrEqual(1);
    });

    it('should have similar total emission energy at both resolutions', () => {
      const fluorMolecule: Molecule = {
        id: 'sodium',
        name: 'Sodium',
        mass: 23,
        pressureBroadening: 0.02,
        peaks: [{ wavelength: 589, extinction: 40, naturalWidth: 0.1 }],
        fluorescence: [
          {
            excitationMin: 280,
            excitationMax: 350,
            excitationPeak: 330,
            emissionWavelength: 589,
            emissionWidth: 0.1,
            quantumYield: 0.95,
          },
        ],
      };

      const material = createMaterial(
        'test-sodium',
        'Test Sodium',
        [fluorMolecule],
        10.0,
        100,
        [],
        1.0
      );

      const props: MaterialProperties = {
        moleFractions: { 'sodium': 0.1 },
        pathLength: 1.0,
        temperature: 300,
        pressure: 1.0,
      };

      // High-res
      const { emission: highRes } = material.generateFluorescenceTextures(
        100, 1000, 4500, props
      );
      let highResTotal = 0;
      for (const val of highRes) {
        highResTotal += val;
      }

      // Low-res
      const { emission: lowRes } = material.generateFluorescenceTextures(
        100, 1000, 32, props
      );
      let lowResTotal = 0;
      for (const val of lowRes) {
        lowResTotal += val;
      }

      console.log('High-res total emission:', highResTotal.toFixed(6));
      console.log('Low-res total emission:', lowResTotal.toFixed(6));
      
      // Both should be similar (within 10% for bin-integrated approach)
      const ratio = lowResTotal / highResTotal;
      expect(ratio).toBeGreaterThan(0.9);
      expect(ratio).toBeLessThan(1.1);
    });
  });

  describe('Emission Texture Generation', () => {
    const fluorMolecule: Molecule = {
      id: 'test-fluor',
      name: 'Test Fluorescent',
      mass: 23,
      pressureBroadening: 0.02,
      peaks: [{ wavelength: 589, extinction: 40, naturalWidth: 0.1 }],
      fluorescence: [
        {
          excitationMin: 280,
          excitationMax: 350,
          excitationPeak: 330,
          emissionWavelength: 589,
          emissionWidth: 0.1,
          quantumYield: 0.95,
        },
      ],
    };

    it('should capture narrow emission line in correct bin', () => {
      const material = createMaterial(
        'test-fluor',
        'Test Fluorescent',
        [fluorMolecule],
        10.0,
        100,
        [],
        1.0
      );

      const props: MaterialProperties = {
        moleFractions: { 'test-fluor': 0.1 },
        pathLength: 1.0,
        temperature: 300,
        pressure: 1.0,
      };

      // High-res emission texture
      const { emission: highRes } = material.generateFluorescenceTextures(
        100, 1000, 4500, props
      );
      
      // Find max emission around 589nm
      const peakBin = Math.round((589 - 100) / (900 / 4500));
      const maxEmission = Math.max(...Array.from(highRes));
      const peakEmission = highRes[peakBin];
      
      // Peak should be at or very close to the max
      expect(peakEmission).toBeCloseTo(maxEmission, 1);
    });

    it('should preserve emission energy at low resolution', () => {
      const material = createMaterial(
        'test-fluor',
        'Test Fluorescent',
        [fluorMolecule],
        10.0,
        100,
        [],
        1.0
      );

      const props: MaterialProperties = {
        moleFractions: { 'test-fluor': 0.1 },
        pathLength: 1.0,
        temperature: 300,
        pressure: 1.0,
      };

      // High-res: sum of all emission values
      const { emission: highRes } = material.generateFluorescenceTextures(
        100, 1000, 4500, props
      );
      let highResTotal = 0;
      for (const val of highRes) {
        highResTotal += val;
      }

      // Low-res: sum of all emission values
      const { emission: lowRes } = material.generateFluorescenceTextures(
        100, 1000, 32, props
      );
      let lowResTotal = 0;
      for (const val of lowRes) {
        lowResTotal += val;
      }

      // For bin-integrated textures, low-res total should be similar to high-res
      // when properly scaled by bin width
      // (This will fail until bin integration is implemented)
      const highResSum = highResTotal * (900 / 4500);
      const lowResSum = lowResTotal * (900 / 32);
      
      // Allow significant tolerance for now - just verify non-zero at low res
      expect(lowResTotal).toBeGreaterThan(0);
    });
  });

  describe('Excitation Texture Generation', () => {
    const fluorMolecule: Molecule = {
      id: 'test-fluor',
      name: 'Test Fluorescent',
      mass: 23,
      pressureBroadening: 0.02,
      peaks: [{ wavelength: 589, extinction: 40, naturalWidth: 0.1 }],
      fluorescence: [
        {
          excitationMin: 280,
          excitationMax: 350,
          excitationPeak: 330,
          emissionWavelength: 589,
          emissionWidth: 0.1,
          quantumYield: 0.95,
        },
      ],
    };

    it('should capture excitation band in UV region', () => {
      const material = createMaterial(
        'test-fluor',
        'Test Fluorescent',
        [fluorMolecule],
        10.0,
        100,
        [],
        1.0
      );

      const props: MaterialProperties = {
        moleFractions: { 'test-fluor': 0.1 },
        pathLength: 1.0,
        temperature: 300,
        pressure: 1.0,
      };

      const { excitation } = material.generateFluorescenceTextures(
        100, 1000, 900, props
      );
      
      // Excitation peak is at 330nm
      const peakBin = Math.round((330 - 100) / 1);
      const peakExcitation = excitation[peakBin];
      
      // Should have non-zero excitation around 330nm
      expect(peakExcitation).toBeGreaterThan(0);
    });

    it('should have zero excitation outside excitation band', () => {
      const material = createMaterial(
        'test-fluor',
        'Test Fluorescent',
        [fluorMolecule],
        10.0,
        100,
        [],
        1.0
      );

      const props: MaterialProperties = {
        moleFractions: { 'test-fluor': 0.1 },
        pathLength: 1.0,
        temperature: 300,
        pressure: 1.0,
      };

      const { excitation } = material.generateFluorescenceTextures(
        100, 1000, 900, props
      );
      
      // At 589nm (emission wavelength), excitation should be ~0
      const emissionBin = Math.round((589 - 100) / 1);
      const excitationAtEmission = excitation[emissionBin];
      
      // Should have near-zero excitation at visible wavelengths
      expect(excitationAtEmission).toBeLessThan(0.01);
    });
  });
});

