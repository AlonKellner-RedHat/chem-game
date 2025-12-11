/**
 * Water Material
 * 
 * Liquid water with intrinsic H2O absorption and optional dissolved molecules.
 * Uses mole fraction composition where pure water fills the remainder.
 */

import { createMaterial, Material, Molecule } from './Material';
import { PURE_WATER_ABSORPTION, MATERIAL_CONSTANTS } from './AbsorptionData';

/**
 * Copper Sulfate (CuSO4)
 * 
 * Blue-colored copper salt commonly used in chemistry demonstrations.
 * Absorbs in the red/near-IR region, transmitting blue light.
 * 
 * Fluorescence: Cu²⁺ has weak fluorescence due to d-d transitions.
 * UV excitation can produce weak blue-green emission.
 */
export const CopperSulfate: Molecule = {
  id: 'copper-sulfate',
  name: 'Copper Sulfate (CuSO₄)',
  mass: 159.6, // CuSO4 molecular mass
  pressureBroadening: 0, // Negligible in liquid phase
  peaks: [
    // Broad d-d transition band in red/IR
    { wavelength: 800, extinction: 8, naturalWidth: 100 },
  ],
  fluorescence: [
    // UV excitation → weak blue-green emission
    {
      excitationMin: 250,
      excitationMax: 350,
      excitationPeak: 300,
      emissionWavelength: 480,
      emissionWidth: 50,
      quantumYield: 0.02,  // Very weak fluorescence
    },
  ],
};

/**
 * Methylene Blue
 * 
 * Intense blue dye used as biological stain.
 * Absorbs strongly in the red/orange region.
 * 
 * Fluorescence: Strong red fluorescence at 686nm when excited at 665nm.
 * Also has UV excitation pathway at 291nm.
 */
export const MethyleneBlue: Molecule = {
  id: 'methylene-blue',
  name: 'Methylene Blue',
  mass: 319.9, // Molecular mass
  pressureBroadening: 0, // Negligible in liquid phase
  peaks: [
    // Broad electronic transition bands
    { wavelength: 665, extinction: 50, naturalWidth: 50 },
    { wavelength: 605, extinction: 20, naturalWidth: 40 },
  ],
  fluorescence: [
    // Red light excitation → near-IR emission (primary fluorescence)
    {
      excitationMin: 600,
      excitationMax: 670,
      excitationPeak: 665,
      emissionWavelength: 686,
      emissionWidth: 25,
      quantumYield: 0.04,  // Low quantum yield, rapid non-radiative decay
    },
    // UV excitation pathway → red emission
    {
      excitationMin: 250,
      excitationMax: 320,
      excitationPeak: 291,
      emissionWavelength: 686,
      emissionWidth: 25,
      quantumYield: 0.02,
    },
  ],
};

/**
 * Create Water material with intrinsic H2O absorption
 * 
 * Pure water absorbs light selectively:
 * - Minimal absorption in blue (~0.004 m^-1 at 418nm)
 * - Increasing absorption toward red (~0.65 m^-1 at 700nm)
 * - This is why deep water appears blue
 * 
 * The base absorption data comes from Pope & Fry (1997).
 */
export function createWaterMaterial(): Material {
  return createMaterial(
    'water',
    'Water',
    [CopperSulfate, MethyleneBlue],
    7.5,  // bandGap eV (absorbs far UV)
    200,  // uvCutoff nm
    PURE_WATER_ABSORPTION,
    MATERIAL_CONSTANTS.WATER_MOLAR_CONCENTRATION
  );
}
