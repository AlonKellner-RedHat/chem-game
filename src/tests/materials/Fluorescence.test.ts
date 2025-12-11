/**
 * Fluorescence Material Tests
 * 
 * TDD tests for the FluorescenceBand interface and fluorescence data validation.
 * 
 * Key physics constraints:
 * - Stokes shift: emission wavelength > excitation wavelength (energy loss)
 * - Quantum yield: 0-1 range (photon conversion efficiency)
 * - Excitation band must be in UV range for UV-excited fluorescence
 */

import { describe, it, expect } from 'vitest';
import {
  FluorescenceBand,
  validateFluorescenceBand,
  Molecule,
} from '../../core/materials/Material';

describe('FluorescenceBand Interface', () => {
  describe('Stokes Shift Validation', () => {
    it('emission wavelength must be greater than excitation peak (Stokes shift)', () => {
      const validBand: FluorescenceBand = {
        excitationMin: 280,
        excitationMax: 350,
        excitationPeak: 330,
        emissionWavelength: 589,  // > 330 (valid Stokes shift)
        emissionWidth: 0.1,
        quantumYield: 0.8,
      };
      
      expect(validateFluorescenceBand(validBand).valid).toBe(true);
    });

    it('rejects emission wavelength less than excitation peak (anti-Stokes)', () => {
      const invalidBand: FluorescenceBand = {
        excitationMin: 400,
        excitationMax: 500,
        excitationPeak: 450,
        emissionWavelength: 400,  // < 450 (invalid - would require energy gain)
        emissionWidth: 0.1,
        quantumYield: 0.8,
      };
      
      const result = validateFluorescenceBand(invalidBand);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Stokes');
    });

    it('allows emission equal to excitation (resonance fluorescence)', () => {
      const resonanceBand: FluorescenceBand = {
        excitationMin: 580,
        excitationMax: 600,
        excitationPeak: 589,
        emissionWavelength: 589,  // Equal (resonance case - allowed but rare)
        emissionWidth: 0.1,
        quantumYield: 0.8,
      };
      
      expect(validateFluorescenceBand(resonanceBand).valid).toBe(true);
    });
  });

  describe('Quantum Yield Validation', () => {
    it('accepts quantum yield in valid range (0-1)', () => {
      const band: FluorescenceBand = {
        excitationMin: 280,
        excitationMax: 350,
        excitationPeak: 330,
        emissionWavelength: 589,
        emissionWidth: 0.1,
        quantumYield: 0.95,
      };
      
      expect(validateFluorescenceBand(band).valid).toBe(true);
    });

    it('accepts zero quantum yield (non-fluorescent)', () => {
      const band: FluorescenceBand = {
        excitationMin: 280,
        excitationMax: 350,
        excitationPeak: 330,
        emissionWavelength: 589,
        emissionWidth: 0.1,
        quantumYield: 0,
      };
      
      expect(validateFluorescenceBand(band).valid).toBe(true);
    });

    it('accepts unity quantum yield (100% efficient)', () => {
      const band: FluorescenceBand = {
        excitationMin: 280,
        excitationMax: 350,
        excitationPeak: 330,
        emissionWavelength: 589,
        emissionWidth: 0.1,
        quantumYield: 1.0,
      };
      
      expect(validateFluorescenceBand(band).valid).toBe(true);
    });

    it('rejects quantum yield greater than 1', () => {
      const band: FluorescenceBand = {
        excitationMin: 280,
        excitationMax: 350,
        excitationPeak: 330,
        emissionWavelength: 589,
        emissionWidth: 0.1,
        quantumYield: 1.5,  // Invalid - cannot emit more photons than absorbed
      };
      
      const result = validateFluorescenceBand(band);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('quantum yield');
    });

    it('rejects negative quantum yield', () => {
      const band: FluorescenceBand = {
        excitationMin: 280,
        excitationMax: 350,
        excitationPeak: 330,
        emissionWavelength: 589,
        emissionWidth: 0.1,
        quantumYield: -0.5,
      };
      
      const result = validateFluorescenceBand(band);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('quantum yield');
    });
  });

  describe('Excitation Band Validation', () => {
    it('excitation peak must be within excitation range', () => {
      const band: FluorescenceBand = {
        excitationMin: 280,
        excitationMax: 350,
        excitationPeak: 330,  // Within [280, 350]
        emissionWavelength: 589,
        emissionWidth: 0.1,
        quantumYield: 0.8,
      };
      
      expect(validateFluorescenceBand(band).valid).toBe(true);
    });

    it('rejects excitation peak outside range', () => {
      const band: FluorescenceBand = {
        excitationMin: 280,
        excitationMax: 350,
        excitationPeak: 400,  // Outside [280, 350]
        emissionWavelength: 589,
        emissionWidth: 0.1,
        quantumYield: 0.8,
      };
      
      const result = validateFluorescenceBand(band);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('excitation peak');
    });

    it('rejects inverted excitation range (min > max)', () => {
      const band: FluorescenceBand = {
        excitationMin: 350,
        excitationMax: 280,  // Inverted
        excitationPeak: 330,
        emissionWavelength: 589,
        emissionWidth: 0.1,
        quantumYield: 0.8,
      };
      
      const result = validateFluorescenceBand(band);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('excitation range');
    });
  });

  describe('Emission Width Validation', () => {
    it('accepts positive emission width', () => {
      const band: FluorescenceBand = {
        excitationMin: 280,
        excitationMax: 350,
        excitationPeak: 330,
        emissionWavelength: 589,
        emissionWidth: 0.1,
        quantumYield: 0.8,
      };
      
      expect(validateFluorescenceBand(band).valid).toBe(true);
    });

    it('rejects zero emission width', () => {
      const band: FluorescenceBand = {
        excitationMin: 280,
        excitationMax: 350,
        excitationPeak: 330,
        emissionWavelength: 589,
        emissionWidth: 0,
        quantumYield: 0.8,
      };
      
      const result = validateFluorescenceBand(band);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('emission width');
    });

    it('rejects negative emission width', () => {
      const band: FluorescenceBand = {
        excitationMin: 280,
        excitationMax: 350,
        excitationPeak: 330,
        emissionWavelength: 589,
        emissionWidth: -1,
        quantumYield: 0.8,
      };
      
      const result = validateFluorescenceBand(band);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('emission width');
    });
  });
});

describe('Molecule with Fluorescence', () => {
  it('molecule can have optional fluorescence property', () => {
    const molecule: Molecule = {
      id: 'test',
      name: 'Test Molecule',
      peaks: [],
      mass: 100,
      pressureBroadening: 0.01,
      // No fluorescence - should be valid
    };
    
    expect(molecule.fluorescence).toBeUndefined();
  });

  it('molecule can have multiple fluorescence bands', () => {
    const molecule: Molecule = {
      id: 'sodium',
      name: 'Sodium (Na)',
      peaks: [
        { wavelength: 589.0, extinction: 40, naturalWidth: 0.1 },
        { wavelength: 589.6, extinction: 40, naturalWidth: 0.1 },
      ],
      mass: 22.99,
      pressureBroadening: 0.02,
      fluorescence: [
        {
          excitationMin: 280,
          excitationMax: 350,
          excitationPeak: 330,
          emissionWavelength: 589.0,
          emissionWidth: 0.1,
          quantumYield: 0.95,
        },
        {
          excitationMin: 280,
          excitationMax: 350,
          excitationPeak: 330,
          emissionWavelength: 589.6,
          emissionWidth: 0.1,
          quantumYield: 0.95,
        },
      ],
    };
    
    expect(molecule.fluorescence).toHaveLength(2);
    expect(molecule.fluorescence![0].emissionWavelength).toBe(589.0);
    expect(molecule.fluorescence![1].emissionWavelength).toBe(589.6);
  });

  it('fluorescence emission wavelengths should match absorption peaks for atomic species', () => {
    // For atomic fluorescence, the emission lines are typically the same as absorption lines
    const molecule: Molecule = {
      id: 'sodium',
      name: 'Sodium (Na)',
      peaks: [
        { wavelength: 589.0, extinction: 40, naturalWidth: 0.1 },
      ],
      mass: 22.99,
      pressureBroadening: 0.02,
      fluorescence: [
        {
          excitationMin: 280,
          excitationMax: 350,
          excitationPeak: 330,
          emissionWavelength: 589.0,  // Matches absorption peak
          emissionWidth: 0.1,
          quantumYield: 0.95,
        },
      ],
    };
    
    // Emission should match one of the absorption peaks
    const emissionWavelengths = molecule.fluorescence!.map(f => f.emissionWavelength);
    const absorptionWavelengths = molecule.peaks.map(p => p.wavelength);
    
    for (const emission of emissionWavelengths) {
      expect(absorptionWavelengths).toContain(emission);
    }
  });
});
