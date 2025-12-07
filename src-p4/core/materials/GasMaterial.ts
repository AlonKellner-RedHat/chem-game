/**
 * Gas Material
 * 
 * Gas phase with atomic/molecular line spectra.
 */

import { createMaterial, Material, Molecule } from './Material';

// Atomic/molecular line definitions
// Natural linewidths set to ~0.1nm to represent typical spectrometer resolution.
// True natural linewidth is ~0.00001nm but is never observed in practice.
// Pressure broadening coefficients are typical values for noble gas buffers.
const SodiumAtom: Molecule = {
  id: 'sodium',
  name: 'Sodium (Na)',
  mass: 22.99, // atomic mass units
  pressureBroadening: 0.02, // nm/atm - typical for Na in noble gas buffer
  peaks: [
    // D-line doublet (D1 at 589.6nm, D2 at 589.0nm) - 0.6nm apart
    { wavelength: 589.0, extinction: 40, naturalWidth: 0.1 },
    { wavelength: 589.6, extinction: 40, naturalWidth: 0.1 },
  ],
};

const NeonAtom: Molecule = {
  id: 'neon',
  name: 'Neon (Ne)',
  mass: 20.18, // atomic mass units
  pressureBroadening: 0.015, // nm/atm
  peaks: [
    { wavelength: 585.2, extinction: 15, naturalWidth: 0.1 },
    { wavelength: 640.2, extinction: 25, naturalWidth: 0.1 },
    { wavelength: 703.2, extinction: 10, naturalWidth: 0.1 },
  ],
};

const MercuryAtom: Molecule = {
  id: 'mercury',
  name: 'Mercury (Hg)',
  mass: 200.59, // atomic mass units (heavier = narrower Doppler)
  pressureBroadening: 0.025, // nm/atm - slightly higher due to larger atom
  peaks: [
    { wavelength: 253.7, extinction: 60, naturalWidth: 0.1 },
    { wavelength: 365.0, extinction: 35, naturalWidth: 0.1 },
    { wavelength: 435.8, extinction: 25, naturalWidth: 0.1 },
    { wavelength: 546.1, extinction: 45, naturalWidth: 0.1 },
    { wavelength: 579.0, extinction: 35, naturalWidth: 0.1 },
  ],
};

/**
 * Create Gas material
 */
export function createGasMaterial(): Material {
  return createMaterial(
    'gas',
    'Gas',
    [SodiumAtom, NeonAtom, MercuryAtom],
    10.0,  // bandGap eV
    100    // uvCutoff nm
  );
}

export { SodiumAtom, NeonAtom, MercuryAtom };


