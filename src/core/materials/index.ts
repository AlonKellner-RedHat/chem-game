/**
 * Materials Module
 * 
 * Mole fraction-based material system for spectral calculations.
 */

export {
  createMaterial,
  createDefaultProperties,
  validateFluorescenceBand,
  type Material,
  type MaterialProperties,
  type Molecule,
  type AbsorptionPeak,
  type FluorescenceBand,
  type FluorescenceValidationResult,
} from './Material';

export {
  type AbsorptionModel,
  BaseMaterialAbsorption,
  MoleculeAbsorption,
  CompositeAbsorption,
} from './AbsorptionModel';

export {
  type AbsorptionDataPoint,
  PURE_WATER_ABSORPTION,
  PURE_CORUNDUM_ABSORPTION,
  AIR_ABSORPTION,
  MATERIAL_CONSTANTS,
} from './AbsorptionData';

export { createWaterMaterial, CopperSulfate, MethyleneBlue } from './WaterMaterial';
export { createCrystalMaterial, ChromiumIon, PotassiumPermanganate } from './CrystalMaterial';
export { createGasMaterial, SodiumAtom, NeonAtom, MercuryAtom } from './GasMaterial';
export { createGoldMaterial } from './GoldMaterial';

import { createWaterMaterial } from './WaterMaterial';
import { createCrystalMaterial } from './CrystalMaterial';
import { createGasMaterial } from './GasMaterial';
import { createGoldMaterial } from './GoldMaterial';
import { Material } from './Material';

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
  return getAllMaterials().find(m => m.id === id);
}
