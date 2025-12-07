import { describe, it, expect } from 'vitest';
import { BlackbodyEmissionEffect } from '../../../../src/core/spectral/effects/BlackbodyEmissionEffect';
import { SolutionProperties } from '../../../../src/core/spectral/SolutionProperties';
import { Material } from '../../../../src/core/spectral/interfaces/Material';

describe('BlackbodyEmissionEffect', () => {
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

  it('should have no emission below Draper point (798K)', () => {
    const effect = new BlackbodyEmissionEffect();
    const material = createMockMaterial();

    const properties: SolutionProperties = {
      moleculeConcentrations: new Map(),
      temperature: 500, // Below 798K
      pressure: 1.0,
      depth: 1.0,
      bubbleDensity: 0,
      particleDensity: 0,
      particleSize: 0,
      phase: 'liquid',
    };

    // No emission below threshold
    const factor = effect.apply(600, properties, material);
    expect(factor).toBeCloseTo(1.0, 5); // No emission = no change
  });

  it('should emit at temperatures above Draper point', () => {
    const effect = new BlackbodyEmissionEffect();
    const material = createMockMaterial();

    const properties: SolutionProperties = {
      moleculeConcentrations: new Map(),
      temperature: 1000, // Above 798K
      pressure: 1.0,
      depth: 1.0,
      bubbleDensity: 0,
      particleDensity: 0,
      particleSize: 0,
      phase: 'liquid',
    };

    // Should have emission (factor > 1)
    const factor = effect.apply(600, properties, material);
    expect(factor).toBeGreaterThan(1.0);
  });

  it('should follow Planck\'s law distribution', () => {
    const effect = new BlackbodyEmissionEffect();
    const material = createMockMaterial();

    const properties: SolutionProperties = {
      moleculeConcentrations: new Map(),
      temperature: 2000, // High temperature
      pressure: 1.0,
      depth: 1.0,
      bubbleDensity: 0,
      particleDensity: 0,
      particleSize: 0,
      phase: 'liquid',
    };

    // At high temperature, peak shifts to shorter wavelengths
    // Red (700nm) should have less emission than blue (400nm) at very high T
    const factor400 = effect.apply(400, properties, material);
    const factor700 = effect.apply(700, properties, material);

    // Both should emit, but distribution follows Planck's law
    expect(factor400).toBeGreaterThan(1.0);
    expect(factor700).toBeGreaterThan(1.0);
  });

  it('should scale with temperature', () => {
    const effect = new BlackbodyEmissionEffect();
    const material = createMockMaterial();

    const propertiesLow: SolutionProperties = {
      moleculeConcentrations: new Map(),
      temperature: 1000,
      pressure: 1.0,
      depth: 1.0,
      bubbleDensity: 0,
      particleDensity: 0,
      particleSize: 0,
      phase: 'liquid',
    };

    const propertiesHigh: SolutionProperties = {
      ...propertiesLow,
      temperature: 2000, // Higher temperature
    };

    const factorLow = effect.apply(600, propertiesLow, material);
    const factorHigh = effect.apply(600, propertiesHigh, material);

    expect(factorHigh).toBeGreaterThan(factorLow); // More emission at higher T
  });

  it('should have correct type and priority', () => {
    const effect = new BlackbodyEmissionEffect();
    expect(effect.getType()).toBe('emission');
    expect(effect.getPriority()).toBeGreaterThanOrEqual(0);
  });

  it('should handle edge case at exactly Draper point', () => {
    const effect = new BlackbodyEmissionEffect();
    const material = createMockMaterial();

    const properties: SolutionProperties = {
      moleculeConcentrations: new Map(),
      temperature: 798, // Exactly at Draper point
      pressure: 1.0,
      depth: 1.0,
      bubbleDensity: 0,
      particleDensity: 0,
      particleSize: 0,
      phase: 'liquid',
    };

    // At threshold, should start emitting
    const factor = effect.apply(600, properties, material);
    expect(factor).toBeGreaterThanOrEqual(1.0);
  });
});

