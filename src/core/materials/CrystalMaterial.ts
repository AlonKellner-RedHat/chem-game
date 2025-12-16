/**
 * Crystal Material
 *
 * Corundum (Al2O3) crystal with optional dopant ions.
 * Uses mole fraction composition where pure corundum fills the remainder.
 */

import { MATERIAL_CONSTANTS, PURE_CORUNDUM_ABSORPTION } from './AbsorptionData';
import { createMaterial, type Material, type Molecule } from './Material';

/**
 * Chromium Ion (Cr³⁺)
 *
 * Creates ruby when doped into corundum.
 * Absorbs green/yellow, transmitting red.
 *
 * Fluorescence: Famous ruby fluorescence at 694.3nm (R1 line) and 692.9nm (R2 line).
 * Excited by blue (400nm) and green (550nm) light - the famous ruby laser transition.
 * Quantum yield is nearly 1 at room temperature.
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
  fluorescence: [
    // Blue/UV excitation → R1 line (694.3nm) deep red emission
    {
      excitationMin: 350,
      excitationMax: 450,
      excitationPeak: 404,
      emissionWavelength: 694.3,
      emissionWidth: 0.5,
      quantumYield: 0.9,
    },
    // Green excitation → R1 line (694.3nm) deep red emission
    {
      excitationMin: 500,
      excitationMax: 600,
      excitationPeak: 554,
      emissionWavelength: 694.3,
      emissionWidth: 0.5,
      quantumYield: 0.9,
    },
    // Blue/UV excitation → R2 line (692.9nm) deep red emission
    {
      excitationMin: 350,
      excitationMax: 450,
      excitationPeak: 404,
      emissionWavelength: 692.9,
      emissionWidth: 0.5,
      quantumYield: 0.85,
    },
  ],
};

/**
 * Potassium Permanganate (KMnO4)
 *
 * Deep purple compound with strong absorption.
 *
 * Fluorescence: Very weak due to rapid non-radiative decay from charge transfer states.
 * Mn(VII) is a strong oxidizer which quenches fluorescence.
 * We include weak emission for completeness.
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
  fluorescence: [
    // UV excitation → weak red emission (highly quenched)
    {
      excitationMin: 300,
      excitationMax: 400,
      excitationPeak: 350,
      emissionWavelength: 650,
      emissionWidth: 60,
      quantumYield: 0.001, // Extremely weak, mostly non-radiative decay
    },
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
    9.0, // bandGap eV (absorbs UV below ~138nm)
    150, // uvCutoff nm
    PURE_CORUNDUM_ABSORPTION,
    MATERIAL_CONSTANTS.CORUNDUM_MOLAR_CONCENTRATION
  );
}
