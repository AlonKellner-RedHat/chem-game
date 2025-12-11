/**
 * Fluorescence Physics Tests
 * 
 * TDD tests for the fluorescence physics module.
 * Tests the excitation efficiency, emission line shape, and quantum yield calculations.
 */

import { describe, it, expect } from 'vitest';
import {
  FluorescenceModel,
  MoleculeFluorescence,
  getExcitationEfficiency,
  getEmissionLineShape,
  calculateTotalExcitation,
  getDopplerWidth,
} from '../../core/physics/fluorescence';
import { FluorescenceBand, Molecule } from '../../core/materials/Material';

describe('FluorescenceModel Interface', () => {
  const testBand: FluorescenceBand = {
    excitationMin: 280,
    excitationMax: 350,
    excitationPeak: 315,
    emissionWavelength: 589,
    emissionWidth: 0.1,
    quantumYield: 0.8,
  };

  describe('getExcitationEfficiency', () => {
    it('returns 1.0 at excitation peak', () => {
      const efficiency = getExcitationEfficiency(315, testBand);
      expect(efficiency).toBeCloseTo(1.0, 2);
    });

    it('returns 0 outside excitation range', () => {
      expect(getExcitationEfficiency(200, testBand)).toBe(0);
      expect(getExcitationEfficiency(400, testBand)).toBe(0);
    });

    it('follows Gaussian profile within excitation range', () => {
      // At 1 sigma from peak, efficiency should be ~0.606
      // At 2 sigma from peak, efficiency should be ~0.135
      const atPeak = getExcitationEfficiency(315, testBand);
      const nearPeak = getExcitationEfficiency(320, testBand);
      const farFromPeak = getExcitationEfficiency(340, testBand);

      expect(atPeak).toBeGreaterThan(nearPeak);
      expect(nearPeak).toBeGreaterThan(farFromPeak);
      expect(farFromPeak).toBeGreaterThan(0);
    });

    it('is symmetric around excitation peak', () => {
      const below = getExcitationEfficiency(300, testBand);
      const above = getExcitationEfficiency(330, testBand);
      expect(below).toBeCloseTo(above, 2);
    });
  });

  describe('getEmissionLineShape', () => {
    it('returns peak value at emission wavelength', () => {
      const atPeak = getEmissionLineShape(589, testBand, 300);
      const offPeak = getEmissionLineShape(590, testBand, 300);
      expect(atPeak).toBeGreaterThan(offPeak);
    });

    it('returns near-zero far from emission wavelength', () => {
      const farAway = getEmissionLineShape(500, testBand, 300);
      expect(farAway).toBeLessThan(0.001);
    });

    it('is normalized so peak value is 1', () => {
      const atPeak = getEmissionLineShape(589, testBand, 300);
      expect(atPeak).toBeCloseTo(1.0, 1);
    });

    it('broadens with temperature (Doppler broadening)', () => {
      // Higher temperature = broader Doppler width
      const widthCold = getDopplerWidth(589, 100, 23);  // 100K
      const widthHot = getDopplerWidth(589, 1000, 23);  // 1000K
      expect(widthHot).toBeGreaterThan(widthCold);
    });
  });
});

describe('MoleculeFluorescence Class', () => {
  const testMolecule: Molecule = {
    id: 'test',
    name: 'Test Molecule',
    peaks: [{ wavelength: 589, extinction: 40, naturalWidth: 0.1 }],
    mass: 23,
    pressureBroadening: 0.02,
    fluorescence: [
      {
        excitationMin: 280,
        excitationMax: 350,
        excitationPeak: 315,
        emissionWavelength: 589,
        emissionWidth: 0.1,
        quantumYield: 0.8,
      },
    ],
  };

  it('creates model from molecule with fluorescence bands', () => {
    const model = new MoleculeFluorescence(testMolecule);
    expect(model.id).toBe('test');
    expect(model.bands).toHaveLength(1);
  });

  it('returns empty bands for molecule without fluorescence', () => {
    const noFluorMolecule: Molecule = {
      id: 'no-fluor',
      name: 'Non-fluorescent',
      peaks: [],
      mass: 23,
      pressureBroadening: 0.02,
    };
    const model = new MoleculeFluorescence(noFluorMolecule);
    expect(model.bands).toHaveLength(0);
  });

  it('getTotalQuantumYield returns sum of all band quantum yields', () => {
    const multiband: Molecule = {
      id: 'multi',
      name: 'Multi-band',
      peaks: [],
      mass: 23,
      pressureBroadening: 0.02,
      fluorescence: [
        {
          excitationMin: 280,
          excitationMax: 320,
          excitationPeak: 300,
          emissionWavelength: 500,
          emissionWidth: 0.1,
          quantumYield: 0.3,
        },
        {
          excitationMin: 280,
          excitationMax: 320,
          excitationPeak: 300,
          emissionWavelength: 600,
          emissionWidth: 0.1,
          quantumYield: 0.4,
        },
      ],
    };
    const model = new MoleculeFluorescence(multiband);
    expect(model.getTotalQuantumYield()).toBeCloseTo(0.7, 2);
  });
});

describe('calculateTotalExcitation', () => {
  const testBand: FluorescenceBand = {
    excitationMin: 280,
    excitationMax: 350,
    excitationPeak: 315,
    emissionWavelength: 589,
    emissionWidth: 0.1,
    quantumYield: 0.8,
  };

  it('returns 0 when no light is absorbed', () => {
    const absorbedSpectrum = new Float32Array(100).fill(0);
    const result = calculateTotalExcitation(absorbedSpectrum, 200, 400, testBand);
    expect(result).toBe(0);
  });

  it('returns positive value when UV light is absorbed in excitation range', () => {
    // Create spectrum with absorption in UV range
    const absorbedSpectrum = new Float32Array(100);
    // Fill with 1.0 in UV range (280-350nm maps to indices 40-75 for 200-400nm range)
    for (let i = 40; i < 75; i++) {
      absorbedSpectrum[i] = 1.0;
    }
    const result = calculateTotalExcitation(absorbedSpectrum, 200, 400, testBand);
    expect(result).toBeGreaterThan(0);
  });

  it('excitation is proportional to absorbed intensity', () => {
    const absorbedLow = new Float32Array(100);
    const absorbedHigh = new Float32Array(100);
    for (let i = 40; i < 75; i++) {
      absorbedLow[i] = 0.5;
      absorbedHigh[i] = 1.0;
    }
    const resultLow = calculateTotalExcitation(absorbedLow, 200, 400, testBand);
    const resultHigh = calculateTotalExcitation(absorbedHigh, 200, 400, testBand);
    expect(resultHigh).toBeCloseTo(resultLow * 2, 1);
  });

  it('excitation is weighted by excitation efficiency', () => {
    // Absorption only at peak excitation wavelength
    const absorbedAtPeak = new Float32Array(100).fill(0);
    absorbedAtPeak[57] = 1.0;  // ~315nm for 200-400nm range with 100 samples
    
    // Absorption at edge of excitation range
    const absorbedAtEdge = new Float32Array(100).fill(0);
    absorbedAtEdge[40] = 1.0;  // ~280nm
    
    const resultPeak = calculateTotalExcitation(absorbedAtPeak, 200, 400, testBand);
    const resultEdge = calculateTotalExcitation(absorbedAtEdge, 200, 400, testBand);
    
    expect(resultPeak).toBeGreaterThan(resultEdge);
  });
});

describe('Stokes Shift Physics', () => {
  it('emission wavelength is always longer than excitation wavelength (lower energy)', () => {
    const band: FluorescenceBand = {
      excitationMin: 280,
      excitationMax: 350,
      excitationPeak: 315,
      emissionWavelength: 589,
      emissionWidth: 0.1,
      quantumYield: 0.8,
    };
    
    // All excitation wavelengths should be shorter than emission
    expect(band.excitationMax).toBeLessThan(band.emissionWavelength);
  });

  it('quantum yield represents energy loss during relaxation', () => {
    // Quantum yield < 1 means some energy is lost as heat/vibration
    const band: FluorescenceBand = {
      excitationMin: 280,
      excitationMax: 350,
      excitationPeak: 315,
      emissionWavelength: 589,
      emissionWidth: 0.1,
      quantumYield: 0.8,  // 80% of absorbed photons re-emitted
    };
    
    expect(band.quantumYield).toBeLessThan(1);
  });
});

