import { describe, it, expect } from 'vitest';
import { ChemicalAbsorptionEffect } from '../../../../src/core/spectral/effects/ChemicalAbsorptionEffect';
import { SolutionProperties } from '../../../../src/core/spectral/SolutionProperties';
import { Material } from '../../../../src/core/spectral/interfaces/Material';
import { Molecule } from '../../../../src/core/spectral/interfaces/Molecule';

describe('ChemicalAbsorptionEffect', () => {
  const createMockMolecule = (id: string, peak: number, epsilon: number): Molecule => ({
    id,
    name: `Molecule ${id}`,
    getMolarExtinctionCoefficient: (wavelength: number) => {
      // Gaussian peak
      const width = 50;
      return epsilon * Math.exp(-Math.pow((wavelength - peak) / width, 2));
    },
    getAbsorptionPeaks: () => [peak],
    getAbsorptionBandwidth: (p: number) => 50,
  });

  const createMockMaterial = (molecules: Molecule[]): Material => ({
    id: 'test-material',
    name: 'Test Material',
    bandGap: 3.5,
    uvCutoff: 300,
    refractiveIndex: (wavelength: number) => 1.5,
    baseTransmission: (wavelength: number) => 1.0,
    molecules,
    getEffects: () => [],
  });

  it('should implement Beer-Lambert law', () => {
    const effect = new ChemicalAbsorptionEffect();
    const molecule = createMockMolecule('mol1', 600, 1000); // ε = 1000 at peak
    const material = createMockMaterial([molecule]);

    const properties: SolutionProperties = {
      moleculeConcentrations: new Map([['mol1', 0.01]]), // 0.01 M
      temperature: 298,
      pressure: 1.0,
      depth: 0.01, // 0.01 m = 1 cm path length
      bubbleDensity: 0,
      particleDensity: 0,
      particleSize: 0,
      phase: 'liquid',
    };

    // Beer-Lambert: A = ε × c × l
    // At peak (600nm): A = 1000 × 0.01 × (0.01 m * 100 cm/m) = 1000 × 0.01 × 1.0 = 10
    // Transmission: T = 10^(-A) = 10^(-10) ≈ 0
    const factor = effect.apply(600, properties, material);
    expect(factor).toBeLessThan(0.01); // Very low transmission
  });

  it('should handle zero concentration', () => {
    const effect = new ChemicalAbsorptionEffect();
    const molecule = createMockMolecule('mol1', 600, 1000);
    const material = createMockMaterial([molecule]);

    const properties: SolutionProperties = {
      moleculeConcentrations: new Map([['mol1', 0]]), // Zero concentration
      temperature: 298,
      pressure: 1.0,
      depth: 0.01, // 0.01 m = 1 cm
      bubbleDensity: 0,
      particleDensity: 0,
      particleSize: 0,
      phase: 'liquid',
    };

    // No absorption when concentration is zero
    const factor = effect.apply(600, properties, material);
    expect(factor).toBeCloseTo(1.0, 5); // Full transmission
  });

  it('should handle multiple molecules', () => {
    const effect = new ChemicalAbsorptionEffect();
    const mol1 = createMockMolecule('mol1', 400, 500);
    const mol2 = createMockMolecule('mol2', 600, 1000);
    const material = createMockMaterial([mol1, mol2]);

    const properties: SolutionProperties = {
      moleculeConcentrations: new Map([
        ['mol1', 0.01],
        ['mol2', 0.01],
      ]),
      temperature: 298,
      pressure: 1.0,
      depth: 0.01, // 0.01 m = 1 cm
      bubbleDensity: 0,
      particleDensity: 0,
      particleSize: 0,
      phase: 'liquid',
    };

    // Both molecules contribute to absorption
    const factor400 = effect.apply(400, properties, material);
    const factor600 = effect.apply(600, properties, material);

    expect(factor400).toBeLessThan(1.0);
    expect(factor600).toBeLessThan(1.0);
    expect(factor600).toBeLessThan(factor400); // mol2 has higher epsilon
  });

  it('should handle molecules not in concentration map', () => {
    const effect = new ChemicalAbsorptionEffect();
    const molecule = createMockMolecule('mol1', 600, 1000);
    const material = createMockMaterial([molecule]);

    const properties: SolutionProperties = {
      moleculeConcentrations: new Map(), // Empty map
      temperature: 298,
      pressure: 1.0,
      depth: 0.01, // 0.01 m = 1 cm
      bubbleDensity: 0,
      particleDensity: 0,
      particleSize: 0,
      phase: 'liquid',
    };

    // No concentration = no absorption
    const factor = effect.apply(600, properties, material);
    expect(factor).toBeCloseTo(1.0, 5);
  });

  it('should have correct type and priority', () => {
    const effect = new ChemicalAbsorptionEffect();
    expect(effect.getType()).toBe('absorption');
    expect(effect.getPriority()).toBeGreaterThanOrEqual(0);
  });

  it('should handle edge cases with very high concentration', () => {
    const effect = new ChemicalAbsorptionEffect();
    const molecule = createMockMolecule('mol1', 600, 1000);
    const material = createMockMaterial([molecule]);

    const properties: SolutionProperties = {
      moleculeConcentrations: new Map([['mol1', 10.0]]), // Very high concentration
      temperature: 298,
      pressure: 1.0,
      depth: 0.01, // 0.01 m = 1 cm
      bubbleDensity: 0,
      particleDensity: 0,
      particleSize: 0,
      phase: 'liquid',
    };

    const factor = effect.apply(600, properties, material);
    expect(factor).toBeGreaterThanOrEqual(0);
    expect(factor).toBeLessThanOrEqual(1);
  });
});

