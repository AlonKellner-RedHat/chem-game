/**
 * Fluorescence Physics Module
 *
 * Implements fluorescence excitation and emission calculations.
 * Uses Gaussian profiles for excitation and Voigt profiles for emission.
 *
 * Physics:
 * - Excitation: UV photons are absorbed when wavelength is in excitation band
 * - Emission: Absorbed energy is re-emitted at longer wavelength (Stokes shift)
 * - Quantum yield: Fraction of absorbed photons that result in emission
 *
 * OCP Design: FluorescenceModel interface allows extension without modification.
 */

import type { FluorescenceBand, Molecule } from '../materials/Material';
import { voigtProfile } from './voigt';

// Physical constants
const SPEED_OF_LIGHT = 2.99792458e8; // m/s
const BOLTZMANN_CONST = 1.380649e-23; // J/K
const LN2 = Math.log(2);
const AMU_TO_KG = 1.6605390666e-27;

/**
 * FluorescenceModel interface (OCP)
 *
 * Allows different fluorescence implementations without modifying core code.
 */
export interface FluorescenceModel {
  /** Unique identifier */
  readonly id: string;

  /** Fluorescence bands */
  readonly bands: readonly FluorescenceBand[];

  /**
   * Get total quantum yield (sum of all bands)
   */
  getTotalQuantumYield(): number;

  /**
   * Get excitation efficiency at a wavelength (0-1)
   * Sums contributions from all fluorescence bands
   */
  getExcitationEfficiency(wavelengthNm: number): number;

  /**
   * Get emission spectrum at a wavelength for given excitation
   * @param wavelengthNm - Emission wavelength
   * @param excitationAmount - Total excitation (integrated absorbed light in excitation band)
   * @param temperatureK - Temperature for Doppler broadening
   */
  getEmissionSpectrum(wavelengthNm: number, excitationAmount: number, temperatureK: number): number;
}

/**
 * Get excitation efficiency at a specific wavelength for a fluorescence band.
 *
 * Uses Gaussian profile centered at excitationPeak, clamped to [excitationMin, excitationMax].
 * Returns 1.0 at peak, decreasing toward edges.
 *
 * @param wavelengthNm - Wavelength to evaluate
 * @param band - Fluorescence band definition
 * @returns Efficiency in range [0, 1]
 */
export function getExcitationEfficiency(wavelengthNm: number, band: FluorescenceBand): number {
  // Outside excitation range
  if (wavelengthNm < band.excitationMin || wavelengthNm > band.excitationMax) {
    return 0;
  }

  // Gaussian profile centered at excitationPeak
  // Width is set so that edges (min/max) are at ~5% of peak
  const rangeHalf = Math.max(
    band.excitationPeak - band.excitationMin,
    band.excitationMax - band.excitationPeak
  );

  // Gaussian sigma: we want ~5% at the edges (at 2.5*sigma we get ~4.4%)
  const sigma = rangeHalf / 2.5;

  const delta = wavelengthNm - band.excitationPeak;
  const gaussian = Math.exp(-0.5 * (delta / sigma) ** 2);

  return gaussian;
}

/**
 * Get emission line shape at a specific wavelength (normalized so peak = 1).
 *
 * Uses Voigt profile (Gaussian + Lorentzian convolution) centered at emissionWavelength.
 * Gaussian component comes from Doppler broadening (temperature).
 * Lorentzian component comes from natural linewidth (emissionWidth).
 *
 * @param wavelengthNm - Wavelength to evaluate
 * @param band - Fluorescence band definition
 * @param temperatureK - Temperature for Doppler broadening
 * @param massAMU - Atomic mass for Doppler calculation (default 23 for sodium-like)
 * @returns Line shape value normalized to 1 at peak
 */
export function getEmissionLineShape(
  wavelengthNm: number,
  band: FluorescenceBand,
  temperatureK: number,
  massAMU = 23
): number {
  // Calculate Doppler (Gaussian) width from temperature
  const dopplerWidth = calculateDopplerWidth(band.emissionWavelength, temperatureK, massAMU);

  // Total Lorentzian = natural linewidth
  const lorentzianWidth = Math.max(band.emissionWidth, 0.001);

  // Distance from line center
  const delta = wavelengthNm - band.emissionWavelength;

  // Voigt profile
  const profile = voigtProfile(delta, dopplerWidth, lorentzianWidth);

  // Normalize: calculate peak value and divide
  const peakProfile = voigtProfile(0, dopplerWidth, lorentzianWidth);

  return peakProfile > 0 ? profile / peakProfile : 0;
}

/**
 * Calculate total excitation from an absorbed spectrum.
 *
 * Integrates the absorbed spectrum weighted by excitation efficiency.
 * This is the total amount of "excitation energy" available for fluorescence.
 *
 * @param absorbedSpectrum - Array of absorbed intensities per wavelength bin
 * @param wavelengthMin - Minimum wavelength of spectrum
 * @param wavelengthMax - Maximum wavelength of spectrum
 * @param band - Fluorescence band to calculate excitation for
 * @returns Total excitation amount (arbitrary units)
 */
export function calculateTotalExcitation(
  absorbedSpectrum: Float32Array,
  wavelengthMin: number,
  wavelengthMax: number,
  band: FluorescenceBand
): number {
  const numSamples = absorbedSpectrum.length;
  if (numSamples === 0) return 0;

  const wavelengthStep = (wavelengthMax - wavelengthMin) / (numSamples - 1);
  let totalExcitation = 0;

  for (let i = 0; i < numSamples; i++) {
    const wavelength = wavelengthMin + i * wavelengthStep;
    const absorbed = absorbedSpectrum[i];

    if (absorbed > 0) {
      const efficiency = getExcitationEfficiency(wavelength, band);
      totalExcitation += absorbed * efficiency * wavelengthStep;
    }
  }

  return totalExcitation;
}

/**
 * Calculate total fluorescence emission at a wavelength.
 *
 * Emission = quantum_yield × excitation_amount × line_shape(wavelength)
 *
 * @param wavelengthNm - Emission wavelength
 * @param excitationAmount - Total excitation (absorbed light in excitation band)
 * @param band - Fluorescence band definition
 * @param temperatureK - Temperature for Doppler broadening
 * @param massAMU - Atomic mass for Doppler calculation
 * @returns Emission intensity
 */
export function calculateFluorescenceEmission(
  wavelengthNm: number,
  excitationAmount: number,
  band: FluorescenceBand,
  temperatureK: number,
  massAMU = 23
): number {
  if (excitationAmount <= 0) {
    return 0;
  }

  const normalizedShape = getEmissionLineShape(wavelengthNm, band, temperatureK, massAMU);

  return band.quantumYield * excitationAmount * normalizedShape;
}

/**
 * MoleculeFluorescence - OCP implementation for molecule fluorescence
 *
 * Combines multiple fluorescence bands for a single molecule.
 * Created from a Molecule that has optional fluorescence bands defined.
 */
export class MoleculeFluorescence implements FluorescenceModel {
  readonly id: string;
  readonly bands: readonly FluorescenceBand[];
  private readonly massAMU: number;

  constructor(molecule: Molecule) {
    this.id = molecule.id;
    this.bands = molecule.fluorescence ?? [];
    this.massAMU = molecule.mass;
  }

  /**
   * Get total quantum yield (sum of all band quantum yields)
   */
  getTotalQuantumYield(): number {
    return this.bands.reduce((sum, band) => sum + band.quantumYield, 0);
  }

  /**
   * Get excitation efficiency summed over all bands
   */
  getExcitationEfficiency(wavelengthNm: number): number {
    let total = 0;
    for (const band of this.bands) {
      total += getExcitationEfficiency(wavelengthNm, band);
    }
    // Clamp to [0, 1] - overlapping bands could exceed 1
    return Math.min(1, total);
  }

  /**
   * Get emission spectrum summed over all bands
   */
  getEmissionSpectrum(
    wavelengthNm: number,
    excitationAmount: number,
    temperatureK: number
  ): number {
    let total = 0;
    for (const band of this.bands) {
      total += calculateFluorescenceEmission(
        wavelengthNm,
        excitationAmount,
        band,
        temperatureK,
        this.massAMU
      );
    }
    return total;
  }

  /**
   * Calculate total excitation from absorbed spectrum for all bands
   */
  calculateExcitation(
    absorbedSpectrum: Float32Array,
    wavelengthMin: number,
    wavelengthMax: number
  ): number {
    let total = 0;
    for (const band of this.bands) {
      total += calculateTotalExcitation(absorbedSpectrum, wavelengthMin, wavelengthMax, band);
    }
    return total;
  }
}

/**
 * Calculate Doppler width from temperature and mass
 *
 * FWHM_doppler = (2λ/c) × sqrt(2kT×ln(2)/m)
 *
 * @param wavelengthNm - Center wavelength in nm
 * @param temperatureK - Temperature in Kelvin
 * @param massAMU - Atomic mass in atomic mass units
 * @returns Doppler FWHM in nm
 */
function calculateDopplerWidth(
  wavelengthNm: number,
  temperatureK: number,
  massAMU: number
): number {
  if (temperatureK <= 0 || massAMU <= 0) {
    return 0.001; // Minimum width
  }

  const wavelengthM = wavelengthNm * 1e-9;
  const massKg = massAMU * AMU_TO_KG;

  // Doppler FWHM in meters
  const dopplerFWHM_M =
    ((2 * wavelengthM) / SPEED_OF_LIGHT) *
    Math.sqrt((2 * BOLTZMANN_CONST * temperatureK * LN2) / massKg);

  // Convert to nm
  return Math.max(0.001, dopplerFWHM_M * 1e9);
}

/**
 * Get Doppler width for external use (e.g., tests)
 */
export function getDopplerWidth(
  wavelengthNm: number,
  temperatureK: number,
  massAMU: number
): number {
  return calculateDopplerWidth(wavelengthNm, temperatureK, massAMU);
}
