/**
 * Band Gap Absorption
 *
 * Implements Tauc-like absorption edge for semiconductor/material band gaps.
 *
 * Physics:
 * - Band gap E_g determines the minimum photon energy for absorption
 * - Cutoff wavelength: λ_cutoff = hc/E_g = 1240/E_g (nm)
 * - Tauc relation: (αhν)^(1/n) = A(hν - E_g) where n depends on gap type
 *   - n = 1/2 for direct allowed transitions
 *   - n = 2 for indirect allowed transitions
 *
 * For real-time simulation, we use a simplified exponential edge that
 * captures the essential Tauc behavior: rapid onset of absorption
 * above the band gap energy.
 */

// Planck constant × speed of light in eV·nm
const HC_EV_NM = 1239.84193; // More precise: hc = 1239.84193 eV·nm

/**
 * Convert band gap energy (eV) to cutoff wavelength (nm)
 *
 * λ_cutoff = hc / E_g
 *
 * @param bandGapEV - Band gap energy in electron volts
 * @returns Cutoff wavelength in nanometers
 */
export function evToWavelength(bandGapEV: number): number {
  if (bandGapEV <= 0) {
    return Number.POSITIVE_INFINITY; // No band gap = absorbs at all wavelengths
  }
  return HC_EV_NM / bandGapEV;
}

/**
 * Convert wavelength (nm) to photon energy (eV)
 *
 * E = hc / λ
 *
 * @param wavelengthNm - Wavelength in nanometers
 * @returns Photon energy in electron volts
 */
export function wavelengthToEV(wavelengthNm: number): number {
  if (wavelengthNm <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return HC_EV_NM / wavelengthNm;
}

/**
 * Tauc absorption coefficient factor
 * Controls how sharply the absorption edge rises
 */
const TAUC_SHARPNESS = 5.0;

/**
 * Calculate Tauc-like absorption transmission
 *
 * For photons with energy > band gap, absorption follows Tauc relation:
 * α ∝ (hν - E_g)^n
 *
 * We use a simplified exponential model that captures this behavior:
 * T = exp(-(excess_energy)^2 × sharpness) for E > E_g
 * T = 1.0 for E <= E_g
 *
 * @param wavelengthNm - Wavelength in nanometers
 * @param bandGapEV - Band gap energy in electron volts
 * @returns Transmission factor (0-1)
 */
export function getTaucAbsorption(wavelengthNm: number, bandGapEV: number): number {
  // Handle edge cases
  if (bandGapEV <= 0) {
    // No band gap = always absorbs (metal-like behavior)
    // Use exponential decay with wavelength for realistic behavior
    return Math.exp(-TAUC_SHARPNESS * 0.5);
  }

  if (wavelengthNm <= 0) {
    return 0; // Infinite energy = fully absorbed
  }

  const cutoffWavelength = evToWavelength(bandGapEV);

  // Wavelengths longer than cutoff = transparent (photon energy < band gap)
  if (wavelengthNm >= cutoffWavelength) {
    return 1.0;
  }

  // Calculate excess photon energy above band gap
  const photonEnergy = wavelengthToEV(wavelengthNm);
  const excessEnergy = photonEnergy - bandGapEV;

  // Tauc-like absorption: quadratic dependence on excess energy
  // α ∝ (hν - E_g)² for indirect gap (most common)
  // Transmission = exp(-α × path), simplified to exp(-k × (excess)²)
  const absorption = TAUC_SHARPNESS * excessEnergy * excessEnergy;

  return Math.exp(-absorption);
}

/**
 * Get band gap absorption for use in material transmission calculation
 *
 * This function is designed to be called from Material.ts to replace
 * the simple UV cutoff fade with proper Tauc absorption.
 *
 * @param wavelengthNm - Wavelength in nanometers
 * @param bandGapEV - Band gap energy in electron volts
 * @param uvCutoff - Legacy UV cutoff (used as fallback if bandGap is not set)
 * @returns Transmission factor (0-1)
 */
export function getBandGapTransmission(
  wavelengthNm: number,
  bandGapEV: number,
  uvCutoff: number
): number {
  // If band gap is specified, use Tauc absorption
  if (bandGapEV > 0) {
    return getTaucAbsorption(wavelengthNm, bandGapEV);
  }

  // Fallback to legacy UV cutoff behavior for backwards compatibility
  if (wavelengthNm < uvCutoff) {
    const fade = Math.max(0, (wavelengthNm - 100) / (uvCutoff - 100));
    return fade * fade;
  }

  return 1.0;
}
