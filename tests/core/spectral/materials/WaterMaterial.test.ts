import { describe, it, expect } from 'vitest';
import { WaterMaterial } from '../../../../src/core/spectral/materials/WaterMaterial';
import { ChemicalAbsorptionEffect } from '../../../../src/core/spectral/effects/ChemicalAbsorptionEffect';
import { ParticleScatteringEffect } from '../../../../src/core/spectral/effects/ParticleScatteringEffect';
import { MaterialDepthAbsorptionEffect } from '../../../../src/core/spectral/effects/MaterialDepthAbsorptionEffect';

describe('WaterMaterial', () => {
  it('should have correct properties', () => {
    const material = new WaterMaterial();
    expect(material.id).toBe('water');
    expect(material.name).toBe('Water');
    expect(material.bandGap).toBeGreaterThan(0);
    expect(material.uvCutoff).toBeGreaterThan(0);
  });

  it('should have 3 molecules', () => {
    const material = new WaterMaterial();
    expect(material.molecules.length).toBe(3);
    expect(material.molecules[0].id).toBe('copper-sulfate');
    expect(material.molecules[1].id).toBe('potassium-permanganate');
    expect(material.molecules[2].id).toBe('methylene-blue');
  });

  it('should have material depth absorption, chemical absorption and scattering effects', () => {
    const material = new WaterMaterial();
    const effects = material.getEffects();
    expect(effects.length).toBeGreaterThan(0);
    
    const effectIds = effects.map((e) => e.id);
    expect(effectIds).toContain('material-depth-absorption');
    expect(effectIds).toContain('chemical-absorption');
    expect(effectIds).toContain('particle-scattering');
  });

  it('should have effects in correct priority order', () => {
    const material = new WaterMaterial();
    const effects = material.getEffects();
    
    // Find effect indices
    const depthAbsIdx = effects.findIndex(e => e.id === 'material-depth-absorption');
    const chemAbsIdx = effects.findIndex(e => e.id === 'chemical-absorption');
    
    // MaterialDepthAbsorptionEffect (priority 5) should come before ChemicalAbsorptionEffect (priority 10)
    expect(depthAbsIdx).toBeGreaterThanOrEqual(0);
    expect(chemAbsIdx).toBeGreaterThanOrEqual(0);
    expect(depthAbsIdx).toBeLessThan(chemAbsIdx);
  });

  it('should be transparent above UV cutoff', () => {
    const material = new WaterMaterial();
    expect(material.baseTransmission(400)).toBe(1.0);
    expect(material.baseTransmission(600)).toBe(1.0);
  });

  it('should block UV at and below cutoff', () => {
    const material = new WaterMaterial();
    expect(material.baseTransmission(200)).toBe(0.0);
    expect(material.baseTransmission(199)).toBe(0.0);
    expect(material.baseTransmission(201)).toBe(1.0);
  });
});

