/**
 * Materials Module
 * 
 * Simplified material system for spectral calculations.
 */

export {
  createMaterial,
  createDefaultProperties,
  type Material,
  type MaterialProperties,
  type Molecule,
  type AbsorptionPeak,
} from './Material';

export { createWaterMaterial, CopperSulfate, MethyleneBlue } from './WaterMaterial';
export { createCrystalMaterial, ChromiumIon, PotassiumPermanganate } from './CrystalMaterial';
export { createGasMaterial, SodiumAtom, NeonAtom, MercuryAtom } from './GasMaterial';

import { createWaterMaterial } from './WaterMaterial';
import { createCrystalMaterial } from './CrystalMaterial';
import { createGasMaterial } from './GasMaterial';
import { Material } from './Material';

/**
 * Get all available materials
 */
export function getAllMaterials(): Material[] {
  return [
    createWaterMaterial(),
    createCrystalMaterial(),
    createGasMaterial(),
  ];
}

/**
 * Get material by ID
 */
export function getMaterialById(id: string): Material | undefined {
  return getAllMaterials().find(m => m.id === id);
}



