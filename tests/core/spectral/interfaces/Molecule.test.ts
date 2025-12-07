import { describe, it, expect } from 'vitest';
import { Molecule } from '../../../../src/core/spectral/interfaces/Molecule';

describe('Molecule interface', () => {
  it('should have required properties', () => {
    const molecule: Molecule = {
      id: 'test-molecule',
      name: 'Test Molecule',
      getMolarExtinctionCoefficient: (wavelength: number) => 0,
      getAbsorptionPeaks: () => [],
      getAbsorptionBandwidth: (peak: number) => 0,
    };

    expect(molecule.id).toBe('test-molecule');
    expect(molecule.name).toBe('Test Molecule');
  });

  it('should calculate molar extinction coefficient', () => {
    const molecule: Molecule = {
      id: 'test-molecule',
      name: 'Test Molecule',
      getMolarExtinctionCoefficient: (wavelength: number) => {
        // Simple Gaussian peak at 600nm
        const peak = 600;
        const width = 50;
        return Math.exp(-Math.pow((wavelength - peak) / width, 2)) * 1000;
      },
      getAbsorptionPeaks: () => [600],
      getAbsorptionBandwidth: (peak: number) => 50,
    };

    const epsilon600 = molecule.getMolarExtinctionCoefficient(600);
    const epsilon700 = molecule.getMolarExtinctionCoefficient(700);

    expect(epsilon600).toBeGreaterThan(epsilon700);
    expect(epsilon600).toBeCloseTo(1000, 1);
  });

  it('should return absorption peaks', () => {
    const molecule: Molecule = {
      id: 'test-molecule',
      name: 'Test Molecule',
      getMolarExtinctionCoefficient: (wavelength: number) => 0,
      getAbsorptionPeaks: () => [400, 600, 800],
      getAbsorptionBandwidth: (peak: number) => 50,
    };

    const peaks = molecule.getAbsorptionPeaks();
    expect(peaks).toEqual([400, 600, 800]);
    expect(peaks.length).toBe(3);
  });

  it('should return absorption bandwidth for each peak', () => {
    const molecule: Molecule = {
      id: 'test-molecule',
      name: 'Test Molecule',
      getMolarExtinctionCoefficient: (wavelength: number) => 0,
      getAbsorptionPeaks: () => [400, 600],
      getAbsorptionBandwidth: (peak: number) => {
        if (peak === 400) return 30;
        if (peak === 600) return 50;
        return 0;
      },
    };

    expect(molecule.getAbsorptionBandwidth(400)).toBe(30);
    expect(molecule.getAbsorptionBandwidth(600)).toBe(50);
  });

  it('should handle edge cases for extinction coefficient', () => {
    const molecule: Molecule = {
      id: 'test-molecule',
      name: 'Test Molecule',
      getMolarExtinctionCoefficient: (wavelength: number) => {
        if (wavelength < 200 || wavelength > 1000) return 0;
        return 100;
      },
      getAbsorptionPeaks: () => [500],
      getAbsorptionBandwidth: (peak: number) => 50,
    };

    expect(molecule.getMolarExtinctionCoefficient(100)).toBe(0);
    expect(molecule.getMolarExtinctionCoefficient(500)).toBe(100);
    expect(molecule.getMolarExtinctionCoefficient(1500)).toBe(0);
  });
});

