/**
 * Gas Material
 *
 * Air (N2/O2) with optional atomic/molecular species.
 * Uses mole fraction composition where air fills the remainder.
 */

import { AIR_ABSORPTION, MATERIAL_CONSTANTS } from './AbsorptionData';
import { createMaterial, type Material, type Molecule } from './Material';

/**
 * Sodium Atom (Na)
 *
 * Produces characteristic yellow D-line doublet at 589.0 and 589.6 nm.
 * Used in sodium vapor lamps.
 *
 * Fluorescence: UV excitation (3²S → 3²P transition) causes D-line emission.
 * Excitation peaks around 330nm (3²S → 4²P) with relaxation to 3²P → D-lines.
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
  fluorescence: [
    // D2 line: UV excitation → 589.0nm emission
    {
      excitationMin: 280,
      excitationMax: 350,
      excitationPeak: 330,
      emissionWavelength: 589.0,
      emissionWidth: 0.1,
      quantumYield: 0.95,
    },
    // D1 line: UV excitation → 589.6nm emission
    {
      excitationMin: 280,
      excitationMax: 350,
      excitationPeak: 330,
      emissionWavelength: 589.6,
      emissionWidth: 0.1,
      quantumYield: 0.95,
    },
  ],
};

/**
 * Neon Atom (Ne)
 *
 * Produces characteristic orange-red emission in neon signs.
 *
 * Fluorescence: VUV excitation (resonance lines 73.6nm, 74.4nm) followed by
 * cascade relaxation produces visible emission. We model UV excitation
 * at accessible wavelengths (100-150nm range).
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
  fluorescence: [
    // Deep UV excitation → 585.2nm orange emission
    {
      excitationMin: 100,
      excitationMax: 180,
      excitationPeak: 147,
      emissionWavelength: 585.2,
      emissionWidth: 0.1,
      quantumYield: 0.75,
    },
    // Deep UV excitation → 640.2nm red emission
    {
      excitationMin: 100,
      excitationMax: 180,
      excitationPeak: 147,
      emissionWavelength: 640.2,
      emissionWidth: 0.1,
      quantumYield: 0.85,
    },
    // Deep UV excitation → 703.2nm deep red emission
    {
      excitationMin: 100,
      excitationMax: 180,
      excitationPeak: 147,
      emissionWavelength: 703.2,
      emissionWidth: 0.1,
      quantumYield: 0.6,
    },
  ],
};

/**
 * Mercury Atom (Hg)
 *
 * Produces multiple spectral lines from UV to visible.
 * Used in fluorescent lamps and UV sources.
 *
 * Fluorescence: Strong resonance fluorescence at 253.7nm (UV-C).
 * VUV excitation (184.9nm) leads to cascade emission at visible wavelengths.
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
  fluorescence: [
    // VUV excitation → 253.7nm UV-C emission (primary Hg line)
    {
      excitationMin: 100,
      excitationMax: 200,
      excitationPeak: 185,
      emissionWavelength: 253.7,
      emissionWidth: 0.1,
      quantumYield: 0.9,
    },
    // UV excitation → 435.8nm blue emission
    {
      excitationMin: 200,
      excitationMax: 350,
      excitationPeak: 254,
      emissionWavelength: 435.8,
      emissionWidth: 0.1,
      quantumYield: 0.7,
    },
    // UV excitation → 546.1nm green emission
    {
      excitationMin: 200,
      excitationMax: 400,
      excitationPeak: 313,
      emissionWavelength: 546.1,
      emissionWidth: 0.1,
      quantumYield: 0.85,
    },
    // UV excitation → 579.0nm yellow emission
    {
      excitationMin: 200,
      excitationMax: 400,
      excitationPeak: 365,
      emissionWavelength: 579.0,
      emissionWidth: 0.1,
      quantumYield: 0.75,
    },
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
    10.0, // bandGap eV (air is transparent)
    100, // uvCutoff nm
    AIR_ABSORPTION,
    MATERIAL_CONSTANTS.AIR_MOLAR_CONCENTRATION
  );
}
