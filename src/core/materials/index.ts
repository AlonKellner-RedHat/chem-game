/**
 * Materials Module
 *
 * Mole fraction-based material system for spectral calculations.
 */

export {
  type AbsorptionDataPoint,
  AIR_ABSORPTION,
  MATERIAL_CONSTANTS,
  PURE_CORUNDUM_ABSORPTION,
  PURE_WATER_ABSORPTION,
} from './AbsorptionData';

export {
  type AbsorptionModel,
  BaseMaterialAbsorption,
  CompositeAbsorption,
  MoleculeAbsorption,
} from './AbsorptionModel';
export { ChromiumIon, createCrystalMaterial, PotassiumPermanganate } from './CrystalMaterial';
export { createGasMaterial, MercuryAtom, NeonAtom, SodiumAtom } from './GasMaterial';
export { createGoldMaterial } from './GoldMaterial';
export {
  type AbsorptionPeak,
  createDefaultProperties,
  createMaterial,
  type FluorescenceBand,
  type FluorescenceValidationResult,
  type Material,
  type MaterialProperties,
  type Molecule,
  validateFluorescenceBand,
} from './Material';
export { CopperSulfate, createWaterMaterial, MethyleneBlue } from './WaterMaterial';

import { createCrystalMaterial } from './CrystalMaterial';
import { createGasMaterial } from './GasMaterial';
import { createGoldMaterial } from './GoldMaterial';
import type { Material } from './Material';
import { createWaterMaterial } from './WaterMaterial';

/**
 * Get all available materials
 */
export function getAllMaterials(): Material[] {
  return [
    createWaterMaterial(),
    createCrystalMaterial(),
    createGasMaterial(),
    createGoldMaterial(),
  ];
}

/**
 * Get material by ID
 */
export function getMaterialById(id: string): Material | undefined {
  return getAllMaterials().find((m) => m.id === id);
}
