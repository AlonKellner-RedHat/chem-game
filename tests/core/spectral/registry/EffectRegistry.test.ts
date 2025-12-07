import { describe, it, expect, beforeEach } from 'vitest';
import { EffectRegistry } from '../../../../src/core/spectral/registry/EffectRegistry';
import { SpectralEffect } from '../../../../src/core/spectral/interfaces/SpectralEffect';
import { SolutionProperties } from '../../../../src/core/spectral/SolutionProperties';
import { Material } from '../../../../src/core/spectral/interfaces/Material';

describe('EffectRegistry', () => {
  let registry: EffectRegistry;

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

  const createMockEffect = (id: string, name: string, priority: number = 0): SpectralEffect => ({
    id,
    name,
    apply: (wavelength, properties, material) => 1.0,
    getType: () => 'absorption',
    getPriority: () => priority,
  });

  beforeEach(() => {
    registry = new EffectRegistry();
  });

  it('should register an effect', () => {
    const effect = createMockEffect('absorption', 'Chemical Absorption');
    registry.register(effect);

    const retrieved = registry.get('absorption');
    expect(retrieved).toBe(effect);
    expect(retrieved?.id).toBe('absorption');
  });

  it('should return null for non-existent effect', () => {
    const retrieved = registry.get('non-existent');
    expect(retrieved).toBeNull();
  });

  it('should handle duplicate registration (overwrite)', () => {
    const effect1 = createMockEffect('absorption', 'Absorption V1');
    const effect2 = createMockEffect('absorption', 'Absorption V2');

    registry.register(effect1);
    registry.register(effect2);

    const retrieved = registry.get('absorption');
    expect(retrieved).toBe(effect2);
    expect(retrieved?.name).toBe('Absorption V2');
  });

  it('should return all registered effects', () => {
    const effect1 = createMockEffect('absorption', 'Chemical Absorption');
    const effect2 = createMockEffect('scattering', 'Particle Scattering');

    registry.register(effect1);
    registry.register(effect2);

    const all = registry.getAll();
    expect(all.length).toBe(2);
    expect(all).toContain(effect1);
    expect(all).toContain(effect2);
  });

  it('should return empty array when no effects registered', () => {
    const all = registry.getAll();
    expect(all).toEqual([]);
    expect(all.length).toBe(0);
  });

  it('should handle multiple registrations', () => {
    const effects = [
      createMockEffect('absorption', 'Chemical Absorption', 10),
      createMockEffect('scattering', 'Particle Scattering', 20),
      createMockEffect('emission', 'Blackbody Emission', 30),
    ];

    effects.forEach((effect) => registry.register(effect));

    expect(registry.getAll().length).toBe(3);
    effects.forEach((effect) => {
      expect(registry.get(effect.id)).toBe(effect);
    });
  });

  it('should support effect composition', () => {
    const effect1 = createMockEffect('absorption', 'Absorption', 10);
    const effect2 = createMockEffect('scattering', 'Scattering', 20);

    registry.register(effect1);
    registry.register(effect2);

    const all = registry.getAll();
    const sorted = all.sort((a, b) => a.getPriority() - b.getPriority());
    expect(sorted[0].id).toBe('absorption');
    expect(sorted[1].id).toBe('scattering');
  });
});

