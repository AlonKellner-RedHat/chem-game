import { describe, it, expect } from 'vitest';
import { SpectralEffect } from '../../../../src/core/spectral/interfaces/SpectralEffect';
import { SolutionProperties } from '../../../../src/core/spectral/SolutionProperties';
import { Material } from '../../../../src/core/spectral/interfaces/Material';

describe('SpectralEffect interface', () => {
  const mockProperties: SolutionProperties = {
    moleculeConcentrations: new Map(),
    temperature: 298,
    pressure: 1.0,
    depth: 1.0,
    bubbleDensity: 0,
    particleDensity: 0,
    particleSize: 0,
    phase: 'liquid',
  };

  const mockMaterial: Material = {
    id: 'test-material',
    name: 'Test Material',
    bandGap: 3.5,
    uvCutoff: 300,
    refractiveIndex: (wavelength: number) => 1.5,
    baseTransmission: (wavelength: number) => 1.0,
    molecules: [],
    getEffects: () => [],
  };

  it('should have required properties', () => {
    const effect: SpectralEffect = {
      id: 'test-effect',
      name: 'Test Effect',
      apply: (wavelength, properties, material) => 1.0,
      getType: () => 'absorption',
      getPriority: () => 0,
    };

    expect(effect.id).toBe('test-effect');
    expect(effect.name).toBe('Test Effect');
  });

  it('should apply effect and return modification factor', () => {
    const effect: SpectralEffect = {
      id: 'test-effect',
      name: 'Test Effect',
      apply: (wavelength, properties, material) => {
        // 50% absorption
        return 0.5;
      },
      getType: () => 'absorption',
      getPriority: () => 0,
    };

    const factor = effect.apply(500, mockProperties, mockMaterial);
    expect(factor).toBe(0.5);
    expect(factor).toBeGreaterThanOrEqual(0);
    expect(factor).toBeLessThanOrEqual(1);
  });

  it('should return effect type', () => {
    const absorptionEffect: SpectralEffect = {
      id: 'absorption',
      name: 'Absorption',
      apply: () => 0.5,
      getType: () => 'absorption',
      getPriority: () => 0,
    };

    const emissionEffect: SpectralEffect = {
      id: 'emission',
      name: 'Emission',
      apply: () => 1.5,
      getType: () => 'emission',
      getPriority: () => 0,
    };

    expect(absorptionEffect.getType()).toBe('absorption');
    expect(emissionEffect.getType()).toBe('emission');
  });

  it('should return priority for ordering', () => {
    const effect1: SpectralEffect = {
      id: 'effect1',
      name: 'Effect 1',
      apply: () => 1.0,
      getType: () => 'absorption',
      getPriority: () => 10,
    };

    const effect2: SpectralEffect = {
      id: 'effect2',
      name: 'Effect 2',
      apply: () => 1.0,
      getType: () => 'scattering',
      getPriority: () => 5,
    };

    expect(effect1.getPriority()).toBe(10);
    expect(effect2.getPriority()).toBe(5);
    expect(effect2.getPriority()).toBeLessThan(effect1.getPriority());
  });

  it('should handle different effect types', () => {
    const types: Array<'absorption' | 'scattering' | 'emission' | 'structural'> = [
      'absorption',
      'scattering',
      'emission',
      'structural',
    ];

    types.forEach((type) => {
      const effect: SpectralEffect = {
        id: `effect-${type}`,
        name: `Effect ${type}`,
        apply: () => 1.0,
        getType: () => type,
        getPriority: () => 0,
      };

      expect(effect.getType()).toBe(type);
    });
  });

  it('should use properties and material in apply method', () => {
    const effect: SpectralEffect = {
      id: 'test-effect',
      name: 'Test Effect',
      apply: (wavelength, properties, material) => {
        // Use temperature from properties
        if (properties.temperature > 1000) return 1.5; // emission
        return 0.8; // absorption
      },
      getType: () => 'emission',
      getPriority: () => 0,
    };

    const coldFactor = effect.apply(500, mockProperties, mockMaterial);
    expect(coldFactor).toBe(0.8);

    const hotProperties = { ...mockProperties, temperature: 1500 };
    const hotFactor = effect.apply(500, hotProperties, mockMaterial);
    expect(hotFactor).toBe(1.5);
  });
});

