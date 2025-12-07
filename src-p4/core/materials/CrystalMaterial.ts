/**
 * Crystal Material
 * 
 * Corundum-like crystal with impurity ions.
 */

import { createMaterial, Material, Molecule } from './Material';

// Molecule definitions
// For ions in crystals, broadening is from phonon coupling/crystal field effects
// Temperature can slightly affect these, but the natural widths dominate
// Pressure broadening is negligible in solid phase (incompressible)
const ChromiumIon: Molecule = {
  id: 'chromium-ion',
  name: 'Chromium Ion (Cr³⁺)',
  mass: 52.0, // Chromium atomic mass
  pressureBroadening: 0, // Negligible in solid phase
  peaks: [
    // Ruby-like d-d transition bands (inherently broad)
    { wavelength: 550, extinction: 25, naturalWidth: 80 },
    { wavelength: 400, extinction: 18, naturalWidth: 60 },
  ],
};

const PotassiumPermanganate: Molecule = {
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
 * Create Crystal material
 */
export function createCrystalMaterial(): Material {
  return createMaterial(
    'crystal',
    'Crystal',
    [ChromiumIon, PotassiumPermanganate],
    9.0,  // bandGap eV
    150   // uvCutoff nm
  );
}

export { ChromiumIon, PotassiumPermanganate };


