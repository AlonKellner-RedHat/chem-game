import { describe, it, expect } from 'vitest';
import { Material } from '../../../../src/core/spectral/interfaces/Material';
import { Molecule } from '../../../../src/core/spectral/interfaces/Molecule';
import { SpectralEffect } from '../../../../src/core/spectral/interfaces/SpectralEffect';

describe('Material interface', () => {
  it('should have required properties', () => {
    // This test will fail until we implement the interface
    // It defines the contract we need to implement
    const material: Material = {
      id: 'test-material',
      name: 'Test Material',
      bandGap: 3.5,
      uvCutoff: 300,
      refractiveIndex: (wavelength: number) => 1.5,
      baseTransmission: (wavelength: number) => 1.0,
      molecules: [],
      getEffects: () => [],
    };

    expect(material.id).toBe('test-material');
    expect(material.name).toBe('Test Material');
    expect(material.bandGap).toBe(3.5);
    expect(material.uvCutoff).toBe(300);
  });

  it('should have molecules array', () => {
    const material: Material = {
      id: 'test-material',
      name: 'Test Material',
      bandGap: 3.5,
      uvCutoff: 300,
      refractiveIndex: (wavelength: number) => 1.5,
      baseTransmission: (wavelength: number) => 1.0,
      molecules: [],
      getEffects: () => [],
    };

    expect(Array.isArray(material.molecules)).toBe(true);
  });

  it('should have getEffects method that returns SpectralEffect array', () => {
    const material: Material = {
      id: 'test-material',
      name: 'Test Material',
      bandGap: 3.5,
      uvCutoff: 300,
      refractiveIndex: (wavelength: number) => 1.5,
      baseTransmission: (wavelength: number) => 1.0,
      molecules: [],
      getEffects: () => [],
    };

    const effects = material.getEffects();
    expect(Array.isArray(effects)).toBe(true);
  });

  it('should have readonly properties (compile-time check)', () => {
    const material: Material = {
      id: 'test-material',
      name: 'Test Material',
      bandGap: 3.5,
      uvCutoff: 300,
      refractiveIndex: (wavelength: number) => 1.5,
      baseTransmission: (wavelength: number) => 1.0,
      molecules: [],
      getEffects: () => [],
    };

    // TypeScript readonly is a compile-time check
    // At runtime, we verify the interface contract is met
    expect(material.id).toBe('test-material');
    expect(typeof material.id).toBe('string');
  });

  it('should calculate refractive index for different wavelengths', () => {
    const material: Material = {
      id: 'test-material',
      name: 'Test Material',
      bandGap: 3.5,
      uvCutoff: 300,
      refractiveIndex: (wavelength: number) => 1.5 + (589 - wavelength) * 0.0001,
      baseTransmission: (wavelength: number) => 1.0,
      molecules: [],
      getEffects: () => [],
    };

    const n589 = material.refractiveIndex(589);
    const n400 = material.refractiveIndex(400);
    expect(n589).toBeCloseTo(1.5, 5);
    expect(n400).toBeGreaterThan(1.5);
  });

  it('should calculate base transmission for different wavelengths', () => {
    const material: Material = {
      id: 'test-material',
      name: 'Test Material',
      bandGap: 3.5,
      uvCutoff: 300,
      refractiveIndex: (wavelength: number) => 1.5,
      baseTransmission: (wavelength: number) => wavelength > 300 ? 1.0 : 0.0,
      molecules: [],
      getEffects: () => [],
    };

    expect(material.baseTransmission(400)).toBe(1.0);
    expect(material.baseTransmission(200)).toBe(0.0);
  });
});

