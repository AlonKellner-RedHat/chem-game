import { describe, it, expect, beforeEach } from 'vitest';
import { MaterialRegistry } from '../../../../src/core/spectral/registry/MaterialRegistry';
import { Material } from '../../../../src/core/spectral/interfaces/Material';
import { Molecule } from '../../../../src/core/spectral/interfaces/Molecule';
import { SpectralEffect } from '../../../../src/core/spectral/interfaces/SpectralEffect';

describe('MaterialRegistry', () => {
  let registry: MaterialRegistry;

  const createMockMaterial = (id: string, name: string): Material => ({
    id,
    name,
    bandGap: 3.5,
    uvCutoff: 300,
    refractiveIndex: (wavelength: number) => 1.5,
    baseTransmission: (wavelength: number) => 1.0,
    molecules: [],
    getEffects: () => [],
  });

  beforeEach(() => {
    registry = new MaterialRegistry();
  });

  it('should register a material', () => {
    const material = createMockMaterial('water', 'Water');
    registry.register(material);

    const retrieved = registry.get('water');
    expect(retrieved).toBe(material);
    expect(retrieved?.id).toBe('water');
  });

  it('should return null for non-existent material', () => {
    const retrieved = registry.get('non-existent');
    expect(retrieved).toBeNull();
  });

  it('should handle duplicate registration (overwrite)', () => {
    const material1 = createMockMaterial('water', 'Water');
    const material2 = createMockMaterial('water', 'Water V2');

    registry.register(material1);
    registry.register(material2);

    const retrieved = registry.get('water');
    expect(retrieved).toBe(material2);
    expect(retrieved?.name).toBe('Water V2');
  });

  it('should return all registered materials', () => {
    const material1 = createMockMaterial('water', 'Water');
    const material2 = createMockMaterial('crystal', 'Crystal');

    registry.register(material1);
    registry.register(material2);

    const all = registry.getAll();
    expect(all.length).toBe(2);
    expect(all).toContain(material1);
    expect(all).toContain(material2);
  });

  it('should return empty array when no materials registered', () => {
    const all = registry.getAll();
    expect(all).toEqual([]);
    expect(all.length).toBe(0);
  });

  it('should handle multiple registrations', () => {
    const materials = [
      createMockMaterial('water', 'Water'),
      createMockMaterial('crystal', 'Crystal'),
      createMockMaterial('glass', 'Glass'),
    ];

    materials.forEach((material) => registry.register(material));

    expect(registry.getAll().length).toBe(3);
    materials.forEach((material) => {
      expect(registry.get(material.id)).toBe(material);
    });
  });
});

