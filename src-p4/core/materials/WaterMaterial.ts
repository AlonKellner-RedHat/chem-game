/**
 * Water Material
 * 
 * Clear base with colored solute molecules.
 */

import { createMaterial, Material, Molecule } from './Material';

// Molecule definitions
// For molecules in solution, broadening is dominated by vibronic/solvent effects
// not Doppler or pressure broadening. Liquids are incompressible so pressure has minimal effect.
const CopperSulfate: Molecule = {
  id: 'copper-sulfate',
  name: 'Copper Sulfate',
  mass: 159.6, // CuSO4 molecular mass (high mass = minimal Doppler)
  pressureBroadening: 0, // Negligible in liquid phase
  peaks: [
    // Broad d-d transition band
    { wavelength: 800, extinction: 8, naturalWidth: 100 },
  ],
};

const MethyleneBlue: Molecule = {
  id: 'methylene-blue',
  name: 'Methylene Blue',
  mass: 319.9, // Molecular mass (high = minimal Doppler)
  pressureBroadening: 0, // Negligible in liquid phase
  peaks: [
    // Broad electronic transition bands
    { wavelength: 665, extinction: 50, naturalWidth: 50 },
    { wavelength: 605, extinction: 20, naturalWidth: 40 },
  ],
};

/**
 * Create Water material
 */
export function createWaterMaterial(): Material {
  return createMaterial(
    'water',
    'Water',
    [CopperSulfate, MethyleneBlue],
    7.5,  // bandGap eV
    200   // uvCutoff nm
  );
}

export { CopperSulfate, MethyleneBlue };


