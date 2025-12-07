import { describe, it, expect } from 'vitest';
import { CrystalMaterial } from '../../../../src/core/spectral/materials/CrystalMaterial';
import { ChemicalAbsorptionEffect } from '../../../../src/core/spectral/effects/ChemicalAbsorptionEffect';

describe('CrystalMaterial', () => {
  it('should have correct properties', () => {
    const material = new CrystalMaterial();
    expect(material.id).toBe('crystal');
    expect(material.name).toBe('Crystal');
    expect(material.bandGap).toBeGreaterThan(0);
    expect(material.uvCutoff).toBeGreaterThan(0);
  });

  it('should have 3 impurity ions', () => {
    const material = new CrystalMaterial();
    expect(material.molecules.length).toBe(3);
    expect(material.molecules[0].id).toBe('chromium-ion');
    expect(material.molecules[1].id).toBe('iron-titanium-ion');
    expect(material.molecules[2].id).toBe('manganese-ion');
  });

  it('should have chemical absorption effect', () => {
    const material = new CrystalMaterial();
    const effects = material.getEffects();
    expect(effects.length).toBeGreaterThan(0);
    
    const effectIds = effects.map((e) => e.id);
    expect(effectIds).toContain('chemical-absorption');
  });

  it('should be transparent above UV cutoff', () => {
    const material = new CrystalMaterial();
    expect(material.baseTransmission(400)).toBe(1.0);
    expect(material.baseTransmission(600)).toBe(1.0);
  });
});

