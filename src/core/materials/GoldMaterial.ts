/**
 * Gold Material
 *
 * Metallic gold with zero transmission (opaque) and physically accurate
 * golden reflection based on gold's optical constants.
 *
 * Gold's characteristic color comes from the interband transition at ~2.4eV (~520nm)
 * where d-band electrons transition to the Fermi level. Below this edge, gold
 * absorbs blue/violet light; above it, gold is highly reflective.
 *
 * Reflectivity data based on gold's measured optical properties:
 * - Johnson & Christy (1972) optical constants
 * - Olmon et al. (2012) updated measurements
 */

import type { Material, MaterialProperties } from './Material';

/**
 * Gold reflectivity data points (wavelength in nm, reflectivity 0-1)
 * Based on experimentally measured values for bulk gold
 */
const GOLD_REFLECTIVITY_DATA: Array<{ wavelength: number; reflectivity: number }> = [
  // UV region - lower reflectivity
  { wavelength: 200, reflectivity: 0.27 },
  { wavelength: 250, reflectivity: 0.3 },
  { wavelength: 300, reflectivity: 0.35 },
  { wavelength: 350, reflectivity: 0.37 },
  // Visible - blue/violet absorbed (interband transitions)
  { wavelength: 400, reflectivity: 0.38 },
  { wavelength: 450, reflectivity: 0.39 },
  { wavelength: 500, reflectivity: 0.48 },
  // Interband transition edge (~520nm / 2.4eV)
  { wavelength: 520, reflectivity: 0.58 },
  { wavelength: 550, reflectivity: 0.85 },
  // Red/orange/yellow - highly reflective (Drude-like behavior)
  { wavelength: 600, reflectivity: 0.93 },
  { wavelength: 650, reflectivity: 0.96 },
  { wavelength: 700, reflectivity: 0.97 },
  { wavelength: 750, reflectivity: 0.98 },
  { wavelength: 800, reflectivity: 0.98 },
  // Near-IR - very high reflectivity
  { wavelength: 900, reflectivity: 0.98 },
  { wavelength: 1000, reflectivity: 0.99 },
];

/**
 * Interpolate gold reflectivity at a given wavelength
 */
function interpolateGoldReflectivity(wavelengthNm: number): number {
  const data = GOLD_REFLECTIVITY_DATA;

  // Clamp to data range
  if (wavelengthNm <= data[0].wavelength) {
    return data[0].reflectivity;
  }
  if (wavelengthNm >= data[data.length - 1].wavelength) {
    return data[data.length - 1].reflectivity;
  }

  // Find bracketing points
  for (let i = 0; i < data.length - 1; i++) {
    if (wavelengthNm >= data[i].wavelength && wavelengthNm <= data[i + 1].wavelength) {
      // Linear interpolation
      const t = (wavelengthNm - data[i].wavelength) / (data[i + 1].wavelength - data[i].wavelength);
      return data[i].reflectivity + t * (data[i + 1].reflectivity - data[i].reflectivity);
    }
  }

  // Fallback (shouldn't reach here)
  return 0.5;
}

/**
 * Custom reflection spectrum generator for gold
 * Returns physically accurate reflectivity based on wavelength
 */
function goldReflectionSpectrum(
  wavelengthMin: number,
  wavelengthMax: number,
  resolution: number,
  _properties: MaterialProperties
): Float32Array {
  const spectrum = new Float32Array(resolution);
  const step = (wavelengthMax - wavelengthMin) / (resolution - 1);

  for (let i = 0; i < resolution; i++) {
    const wavelength = wavelengthMin + i * step;
    spectrum[i] = interpolateGoldReflectivity(wavelength);
  }

  return spectrum;
}

/**
 * Create Gold material
 *
 * Metallic gold is completely opaque (zero transmission) for any thickness
 * greater than a few nanometers. The reflection spectrum gives the
 * characteristic golden color.
 */
export function createGoldMaterial(): Material {
  // Gold is a pure metal with no dissolved molecules
  const molecules: never[] = [];

  return {
    id: 'gold',
    name: 'Gold',
    molecules,
    bandGap: 0, // Metals have no band gap (continuous conduction band)
    uvCutoff: 0,
    baseAbsorption: { id: 'gold-base', getExtinction: () => Number.POSITIVE_INFINITY }, // Infinite absorption
    baseMolarConcentration: 1,
    reflectionRatio: 1.0, // Full reflection magnitude (not scaled down)

    getBaseMoleFraction(_properties: MaterialProperties): number {
      return 1.0; // Pure gold, no additives
    },

    generateTransmissionSpectrum(
      _wavelengthMin: number,
      _wavelengthMax: number,
      resolution: number,
      _properties: MaterialProperties
    ): Float32Array {
      // Metals are completely opaque - zero transmission at all wavelengths
      // This is physically accurate for gold thicker than ~100nm
      return new Float32Array(resolution).fill(0.0);
    },

    generateFluorescenceTextures(
      _wavelengthMin: number,
      _wavelengthMax: number,
      resolution: number,
      _properties: MaterialProperties
    ): {
      excitation: Float32Array;
      emission: Float32Array;
      totalQuantumYield: number;
    } {
      // Metals don't fluoresce (all energy goes to free electron excitation)
      return {
        excitation: new Float32Array(resolution).fill(0),
        emission: new Float32Array(resolution).fill(0),
        totalQuantumYield: 0,
      };
    },

    generateReflectionSpectrum(
      wavelengthMin: number,
      wavelengthMax: number,
      resolution: number,
      properties: MaterialProperties
    ): Float32Array {
      return goldReflectionSpectrum(wavelengthMin, wavelengthMax, resolution, properties);
    },
  };
}

/**
 * Create default properties for gold material
 */
export function createGoldDefaultProperties(): MaterialProperties {
  return {
    moleFractions: {},
    pathLength: 1.0, // 1cm depth (irrelevant for opaque metal, but needed for interface)
    temperature: 300,
    pressure: 1.0,
  };
}
