/**
 * Crystal Material
 * 
 * Corundum (Al2O3) crystal with optional dopant ions.
 * Uses mole fraction composition where pure corundum fills the remainder.
 */

import { createMaterial, Material, Molecule } from './Material';
import { PURE_CORUNDUM_ABSORPTION, MATERIAL_CONSTANTS } from './AbsorptionData';

/**
 * Chromium Ion (Cr³⁺)
 * 
 * Creates ruby when doped into corundum.
 * Absorbs green/yellow, transmitting red.
 */
export const ChromiumIon: Molecule = {
  id: 'chromium-ion',
  name: 'Chromium Ion (Cr³⁺)',
  mass: 52.0, // Chromium atomic mass
  pressureBroadening: 0, // Negligible in solid phase
  peaks: [
    // Ruby-like d-d transition bands
    { wavelength: 550, extinction: 25, naturalWidth: 80 },
    { wavelength: 400, extinction: 18, naturalWidth: 60 },
  ],
};

/**
 * Potassium Permanganate (KMnO4)
 * 
 * Deep purple compound with strong absorption.
 */
export const PotassiumPermanganate: Molecule = {
  id: 'potassium-permanganate',
  name: 'Potassium Permanganate',
  mass: 158.0, // KMnO4 molecular mass
  pressureBroadening: 0, // Negligible in solid phase
  peaks: [
    // Charge transfer bands
    { wavelength: 525, extinction: 30, naturalWidth: 40 },
    { wavelength: 545, extinction: 30, naturalWidth: 40 },
  ],
};

/**
 * Create Crystal material with corundum base
 * 
 * Pure corundum (sapphire) is essentially transparent in the visible range.
 * Color comes from dopant ions:
 * - Cr³⁺ → Ruby (red)
 * - Ti⁴⁺/Fe²⁺ → Blue sapphire
 * - Fe³⁺ → Yellow sapphire
 */
export function createCrystalMaterial(): Material {
  return createMaterial(
    'crystal',
    'Crystal',
    [ChromiumIon, PotassiumPermanganate],
    9.0,  // bandGap eV (absorbs UV below ~138nm)
    150,  // uvCutoff nm
    PURE_CORUNDUM_ABSORPTION,
    MATERIAL_CONSTANTS.CORUNDUM_MOLAR_CONCENTRATION
  );
}
