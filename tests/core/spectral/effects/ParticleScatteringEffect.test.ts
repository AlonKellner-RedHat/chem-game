import { describe, it, expect } from 'vitest';
import { ParticleScatteringEffect } from '../../../../src/core/spectral/effects/ParticleScatteringEffect';
import { SolutionProperties } from '../../../../src/core/spectral/SolutionProperties';
import { Material } from '../../../../src/core/spectral/interfaces/Material';

describe('ParticleScatteringEffect', () => {
  const createMockMaterial = (): Material => ({
    id: 'test-material',
    name: 'Test Material',
    bandGap: 3.5,
    uvCutoff: 300,
    refractiveIndex: (wavelength: number) => 1.5,
    baseTransmission: (wavelength: number) => 1.0,
    molecules: [],
    getEffects: () => [],
  });

  it('should implement Rayleigh scattering for small particles', () => {
    const effect = new ParticleScatteringEffect();
    const material = createMockMaterial();

    const properties: SolutionProperties = {
      moleculeConcentrations: new Map(),
      temperature: 298,
      pressure: 1.0,
      depth: 1.0,
      bubbleDensity: 0,
      particleDensity: 0.1, // 10% particles
      particleSize: 10, // 10nm - small particles (Rayleigh)
      phase: 'liquid',
    };

    // Rayleigh: A_scat ∝ λ^(-4)
    // Blue (400nm) should scatter more than red (700nm)
    const factor400 = effect.apply(400, properties, material);
    const factor700 = effect.apply(700, properties, material);

    expect(factor400).toBeLessThan(factor700); // More scattering at shorter wavelength
  });

  it('should implement Mie scattering for large particles', () => {
    const effect = new ParticleScatteringEffect();
    const material = createMockMaterial();

    const properties: SolutionProperties = {
      moleculeConcentrations: new Map(),
      temperature: 298,
      pressure: 1.0,
      depth: 1.0,
      bubbleDensity: 0,
      particleDensity: 0.1,
      particleSize: 1000, // 1000nm - large particles (Mie)
      phase: 'liquid',
    };

    // Mie: A_scat ∝ λ^(-n) where n ≈ 0-2
    // More uniform scattering across wavelengths
    const factor400 = effect.apply(400, properties, material);
    const factor700 = effect.apply(700, properties, material);

    // Mie scattering is more uniform, but still some wavelength dependence
    expect(factor400).toBeLessThan(1.0);
    expect(factor700).toBeLessThan(1.0);
  });

  it('should handle zero particle density', () => {
    const effect = new ParticleScatteringEffect();
    const material = createMockMaterial();

    const properties: SolutionProperties = {
      moleculeConcentrations: new Map(),
      temperature: 298,
      pressure: 1.0,
      depth: 1.0,
      bubbleDensity: 0,
      particleDensity: 0, // No particles
      particleSize: 100,
      phase: 'liquid',
    };

    // No particles = no scattering
    const factor = effect.apply(500, properties, material);
    expect(factor).toBeCloseTo(1.0, 5); // Full transmission
  });

  it('should scale with particle density', () => {
    const effect = new ParticleScatteringEffect();
    const material = createMockMaterial();

    const propertiesLow: SolutionProperties = {
      moleculeConcentrations: new Map(),
      temperature: 298,
      pressure: 1.0,
      depth: 1.0,
      bubbleDensity: 0,
      particleDensity: 0.1,
      particleSize: 100,
      phase: 'liquid',
    };

    const propertiesHigh: SolutionProperties = {
      ...propertiesLow,
      particleDensity: 0.5, // Higher density
    };

    const factorLow = effect.apply(500, propertiesLow, material);
    const factorHigh = effect.apply(500, propertiesHigh, material);

    expect(factorHigh).toBeLessThan(factorLow); // More scattering with higher density
  });

  it('should have correct type and priority', () => {
    const effect = new ParticleScatteringEffect();
    expect(effect.getType()).toBe('scattering');
    expect(effect.getPriority()).toBeGreaterThanOrEqual(0);
  });

  it('should handle wavelength dependence correctly', () => {
    const effect = new ParticleScatteringEffect();
    const material = createMockMaterial();

    const properties: SolutionProperties = {
      moleculeConcentrations: new Map(),
      temperature: 298,
      pressure: 1.0,
      depth: 1.0,
      bubbleDensity: 0,
      particleDensity: 0.2,
      particleSize: 50, // Medium particles
      phase: 'liquid',
    };

    // Shorter wavelengths should scatter more
    const factorUV = effect.apply(300, properties, material);
    const factorBlue = effect.apply(400, properties, material);
    const factorRed = effect.apply(700, properties, material);

    expect(factorUV).toBeLessThan(factorBlue);
    expect(factorBlue).toBeLessThan(factorRed);
  });
});

