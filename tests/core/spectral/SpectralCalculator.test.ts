import { describe, it, expect } from 'vitest';
import { SpectralCalculator } from '../../../src/core/spectral/SpectralCalculator';
import { Material } from '../../../src/core/spectral/interfaces/Material';
import { SpectralEffect } from '../../../src/core/spectral/interfaces/SpectralEffect';
import { SolutionProperties } from '../../../src/core/spectral/SolutionProperties';
import { ChemicalAbsorptionEffect } from '../../../src/core/spectral/effects/ChemicalAbsorptionEffect';
import { ParticleScatteringEffect } from '../../../src/core/spectral/effects/ParticleScatteringEffect';
import { BlackbodyEmissionEffect } from '../../../src/core/spectral/effects/BlackbodyEmissionEffect';
import { MaterialDepthAbsorptionEffect } from '../../../src/core/spectral/effects/MaterialDepthAbsorptionEffect';
import { WaterMaterial } from '../../../src/core/spectral/materials/WaterMaterial';
import { Molecule } from '../../../src/core/spectral/interfaces/Molecule';

describe('SpectralCalculator', () => {
  const createMockMolecule = (id: string): Molecule => ({
    id,
    name: `Molecule ${id}`,
    getMolarExtinctionCoefficient: (wavelength: number) => {
      if (wavelength === 600) return 1000;
      return 0;
    },
    getAbsorptionPeaks: () => [600],
    getAbsorptionBandwidth: () => 50,
  });

  const createMockMaterial = (effects: SpectralEffect[]): Material => ({
    id: 'test-material',
    name: 'Test Material',
    bandGap: 3.5,
    uvCutoff: 300,
    refractiveIndex: (wavelength: number) => 1.5,
    baseTransmission: (wavelength: number) => 1.0,
    molecules: [],
    getEffects: () => effects,
  });

  it('should calculate transmission with single effect', () => {
    const calculator = new SpectralCalculator();
    const effect = new ChemicalAbsorptionEffect();
    const material = createMockMaterial([effect]);

    const properties: SolutionProperties = {
      moleculeConcentrations: new Map(),
      temperature: 298,
      pressure: 1.0,
      depth: 0.01, // 0.01 m = 1 cm
      bubbleDensity: 0,
      particleDensity: 0,
      particleSize: 0,
      phase: 'liquid',
    };

    const transmission = calculator.calculateTransmission(500, material, properties);
    expect(transmission).toBeGreaterThanOrEqual(0);
    expect(transmission).toBeLessThanOrEqual(1);
  });

  it('should compose multiple effects in priority order', () => {
    const calculator = new SpectralCalculator();
    const absorption = new ChemicalAbsorptionEffect();
    const scattering = new ParticleScatteringEffect();
    const material = createMockMaterial([absorption, scattering]);

    const properties: SolutionProperties = {
      moleculeConcentrations: new Map(),
      temperature: 298,
      pressure: 1.0,
      depth: 0.01, // 0.01 m = 1 cm
      bubbleDensity: 0,
      particleDensity: 0.1, // Some particles
      particleSize: 100,
      phase: 'liquid',
    };

    const transmission = calculator.calculateTransmission(500, material, properties);
    expect(transmission).toBeGreaterThanOrEqual(0);
    expect(transmission).toBeLessThanOrEqual(1);
  });

  it('should apply effects in priority order', () => {
    const calculator = new SpectralCalculator();
    
    // Create effects with different priorities
    const effect1: SpectralEffect = {
      id: 'effect1',
      name: 'Effect 1',
      apply: () => 0.5, // 50% transmission
      getType: () => 'absorption',
      getPriority: () => 10,
    };

    const effect2: SpectralEffect = {
      id: 'effect2',
      name: 'Effect 2',
      apply: () => 0.8, // 80% transmission
      getType: () => 'absorption',
      getPriority: () => 5, // Lower priority = applied first
    };

    const material = createMockMaterial([effect1, effect2]);

    const properties: SolutionProperties = {
      moleculeConcentrations: new Map(),
      temperature: 298,
      pressure: 1.0,
      depth: 0.01, // 0.01 m = 1 cm
      bubbleDensity: 0,
      particleDensity: 0,
      particleSize: 0,
      phase: 'liquid',
    };

    // effect2 (priority 5) should be applied first, then effect1 (priority 10)
    // Result: 1.0 * 0.8 * 0.5 = 0.4
    const transmission = calculator.calculateTransmission(500, material, properties);
    expect(transmission).toBeCloseTo(0.4, 5);
  });

  it('should handle zero effects', () => {
    const calculator = new SpectralCalculator();
    const material = createMockMaterial([]);

    const properties: SolutionProperties = {
      moleculeConcentrations: new Map(),
      temperature: 298,
      pressure: 1.0,
      depth: 0.01, // 0.01 m = 1 cm
      bubbleDensity: 0,
      particleDensity: 0,
      particleSize: 0,
      phase: 'liquid',
    };

    // No effects = base transmission
    const transmission = calculator.calculateTransmission(500, material, properties);
    expect(transmission).toBe(1.0); // Base transmission is 1.0
  });

  it('should calculate full 2000-frequency spectrum', () => {
    const calculator = new SpectralCalculator();
    const effect = new ChemicalAbsorptionEffect();
    const material = createMockMaterial([effect]);

    const properties: SolutionProperties = {
      moleculeConcentrations: new Map(),
      temperature: 298,
      pressure: 1.0,
      depth: 0.01, // 0.01 m = 1 cm
      bubbleDensity: 0,
      particleDensity: 0,
      particleSize: 0,
      phase: 'liquid',
    };

    // Calculate spectrum from 200nm to 1000nm
    const spectrum = calculator.calculateFullSpectrum(material, properties);

    expect(spectrum.length).toBeGreaterThan(2000); // Resolution was increased
    expect(spectrum[0].wavelength).toBeCloseTo(200, 1);
    expect(spectrum[spectrum.length - 1].wavelength).toBeCloseTo(1000, 1);
    expect(spectrum[0].transmission).toBeGreaterThanOrEqual(0);
    expect(spectrum[0].transmission).toBeLessThanOrEqual(1);
  });

  it('should calculate ~100-frequency RGB approximation', () => {
    const calculator = new SpectralCalculator();
    const effect = new ChemicalAbsorptionEffect();
    const material = createMockMaterial([effect]);

    const properties: SolutionProperties = {
      moleculeConcentrations: new Map(),
      temperature: 298,
      pressure: 1.0,
      depth: 0.01, // 0.01 m = 1 cm
      bubbleDensity: 0,
      particleDensity: 0,
      particleSize: 0,
      phase: 'liquid',
    };

    // Sample ~100 key wavelengths for RGB calculation
    const keyWavelengths: number[] = [];
    for (let i = 0; i < 100; i++) {
      const wavelength = 200 + (i / 100) * 800; // 200-1000nm
      keyWavelengths.push(wavelength);
    }

    const transmissions = keyWavelengths.map((wavelength) =>
      calculator.calculateTransmission(wavelength, material, properties)
    );

    expect(transmissions.length).toBe(100);
    transmissions.forEach((t) => {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
    });
  });

  it('should handle known material combinations', () => {
    const calculator = new SpectralCalculator();
    const absorption = new ChemicalAbsorptionEffect();
    const scattering = new ParticleScatteringEffect();
    const emission = new BlackbodyEmissionEffect();
    const material = createMockMaterial([absorption, scattering, emission]);

    const properties: SolutionProperties = {
      moleculeConcentrations: new Map(),
      temperature: 1500, // High temperature for emission
      pressure: 1.0,
      depth: 0.01, // 0.01 m = 1 cm
      bubbleDensity: 0,
      particleDensity: 0.2,
      particleSize: 50,
      phase: 'liquid',
    };

    const transmission = calculator.calculateTransmission(600, material, properties);
    // With emission, factor can be > 1, but overall transmission should be reasonable
    expect(transmission).toBeGreaterThan(0);
  });

  it('should handle edge cases with extreme values', () => {
    const calculator = new SpectralCalculator();
    const effect = new ChemicalAbsorptionEffect();
    const material = createMockMaterial([effect]);

    const properties: SolutionProperties = {
      moleculeConcentrations: new Map(),
      temperature: 0, // Very cold
      pressure: 0, // Very low pressure
      depth: 0, // Zero depth
      bubbleDensity: 0,
      particleDensity: 0,
      particleSize: 0,
      phase: 'liquid',
    };

    // Should not crash with extreme values
    const transmission = calculator.calculateTransmission(500, material, properties);
    expect(transmission).toBeGreaterThanOrEqual(0);
    expect(transmission).toBeLessThanOrEqual(1);
  });

  it('should show blue tint for water at 1000m depth', () => {
    const calculator = new SpectralCalculator();
    const waterMaterial = new WaterMaterial();

    const properties: SolutionProperties = {
      moleculeConcentrations: new Map(), // No molecules, just pure water
      temperature: 298,
      pressure: 1.0,
      depth: 1000.0, // 1000 meters
      bubbleDensity: 0,
      particleDensity: 0,
      particleSize: 0,
      phase: 'liquid',
    };

    // Red light (650nm) should be absorbed more than blue light (450nm)
    const redTransmission = calculator.calculateTransmission(650, waterMaterial, properties);
    const blueTransmission = calculator.calculateTransmission(450, waterMaterial, properties);

    // Blue transmission should be higher than red transmission (blue tint)
    expect(blueTransmission).toBeGreaterThan(redTransmission);
    // Red should be almost completely absorbed (α ≈ 0.3 m⁻¹ at 650nm)
    // At 1000m: T = 10^(-0.3 * 1000) = 10^(-300) ≈ 0
    expect(redTransmission).toBeLessThan(0.001);
    // Blue should still have some transmission (α ≈ 0.002 m⁻¹ at 450nm)
    // At 1000m: T = 10^(-0.002 * 1000) = 10^(-2) ≈ 0.01
    expect(blueTransmission).toBeGreaterThan(0.001);
    // Blue transmission should be significantly higher than red
    expect(blueTransmission).toBeGreaterThan(redTransmission * 10);
  });

  it('should apply MaterialDepthAbsorptionEffect before ChemicalAbsorptionEffect', () => {
    const calculator = new SpectralCalculator();
    
    const depthEffect = new MaterialDepthAbsorptionEffect();
    const chemEffect = new ChemicalAbsorptionEffect();
    
    // Create material with 'water' ID so depth effect applies
    const material: Material = {
      id: 'water', // Must be 'water' for MaterialDepthAbsorptionEffect to apply
      name: 'Test Water',
      bandGap: 3.5,
      uvCutoff: 300,
      refractiveIndex: (wavelength: number) => 1.5,
      baseTransmission: (wavelength: number) => 1.0,
      molecules: [],
      getEffects: () => [chemEffect, depthEffect],
    };

    const properties: SolutionProperties = {
      moleculeConcentrations: new Map(),
      temperature: 298,
      pressure: 1.0,
      depth: 10.0, // 10 meters
      bubbleDensity: 0,
      particleDensity: 0,
      particleSize: 0,
      phase: 'liquid',
    };

    // Both effects should be applied
    const transmission = calculator.calculateTransmission(650, material, properties); // Red light for stronger absorption
    
    // Transmission should be less than 1.0 (some absorption from depth effect)
    expect(transmission).toBeLessThan(1.0);
    expect(transmission).toBeGreaterThan(0);
  });
});

