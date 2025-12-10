/**
 * Gas Material
 * 
 * Air (N2/O2) with optional atomic/molecular species.
 * Uses mole fraction composition where air fills the remainder.
 */

import { createMaterial, Material, Molecule } from './Material';
import { AIR_ABSORPTION, MATERIAL_CONSTANTS } from './AbsorptionData';

/**
 * Sodium Atom (Na)
 * 
 * Produces characteristic yellow D-line doublet at 589.0 and 589.6 nm.
 * Used in sodium vapor lamps.
 */
export const SodiumAtom: Molecule = {
  id: 'sodium',
  name: 'Sodium (Na)',
  mass: 22.99, // atomic mass units
  pressureBroadening: 0.02, // nm/atm - typical for Na in noble gas buffer
  peaks: [
    // D-line doublet (D1 at 589.6nm, D2 at 589.0nm)
    { wavelength: 589.0, extinction: 40, naturalWidth: 0.1 },
    { wavelength: 589.6, extinction: 40, naturalWidth: 0.1 },
  ],
};

/**
 * Neon Atom (Ne)
 * 
 * Produces characteristic orange-red emission in neon signs.
 */
export const NeonAtom: Molecule = {
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

/**
 * Mercury Atom (Hg)
 * 
 * Produces multiple spectral lines from UV to visible.
 * Used in fluorescent lamps and UV sources.
 */
export const MercuryAtom: Molecule = {
  id: 'mercury',
  name: 'Mercury (Hg)',
  mass: 200.59, // atomic mass units
  pressureBroadening: 0.025, // nm/atm
  peaks: [
    { wavelength: 253.7, extinction: 60, naturalWidth: 0.1 },
    { wavelength: 365.0, extinction: 35, naturalWidth: 0.1 },
    { wavelength: 435.8, extinction: 25, naturalWidth: 0.1 },
    { wavelength: 546.1, extinction: 45, naturalWidth: 0.1 },
    { wavelength: 579.0, extinction: 35, naturalWidth: 0.1 },
  ],
};

/**
 * Create Gas material with air base
 * 
 * Air is essentially transparent in the visible spectrum.
 * Absorption comes from added atomic/molecular species.
 * 
 * Note: Rayleigh scattering (blue sky effect) is handled separately
 * from absorption and is not included in this base material.
 */
export function createGasMaterial(): Material {
  return createMaterial(
    'gas',
    'Gas',
    [SodiumAtom, NeonAtom, MercuryAtom],
    10.0,  // bandGap eV (air is transparent)
    100,   // uvCutoff nm
    AIR_ABSORPTION,
    MATERIAL_CONSTANTS.AIR_MOLAR_CONCENTRATION
  );
}
