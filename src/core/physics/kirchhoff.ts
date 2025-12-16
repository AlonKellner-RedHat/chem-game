/**
 * Kirchhoff's Law and Radiative Transfer Implementation
 *
 * This module implements the solution to the Radiative Transfer Equation (RTE)
 * for a homogeneous slab (single layer):
 *
 *   I_out = I_in × T + B(λ,T) × (1 - T)
 *
 * where:
 *   - I_in = input intensity (background illumination)
 *   - T = transmission through the slab (from Beer-Lambert law)
 *   - B(λ,T) = Planck black body function at material temperature
 *   - (1-T) = absorptivity = emissivity (Kirchhoff's law)
 *
 * Kirchhoff's Law Connection:
 * ---------------------------
 * Kirchhoff's law states that for any material in thermal equilibrium:
 *   emissivity(λ) = absorptivity(λ) = 1 - transmission(λ)
 *
 * This means a material emits exactly as well as it absorbs at each wavelength.
 * A perfect mirror (T=1) emits nothing. An opaque black body (T=0) emits maximally.
 *
 * RTE Formula Equivalence:
 * ------------------------
 * The implementation uses: result = background × transmission + emission
 * where emission = (1-T) × B(λ,T)
 *
 * This is mathematically equivalent to the RTE solution:
 *   I_out = I_in × T + B(λ,T) × (1 - T)
 *
 * Multi-Layer Integration:
 * ------------------------
 * For multiple layers, each layer's output feeds as input to the next.
 * This implicit chaining naturally handles multi-layer radiative transfer.
 */

import { DRAPER_POINT } from './constants';
import { getPlanckRadiance } from './planck';

/**
 * Calculate emission intensity via Kirchhoff's law
 *
 * @param transmission - Material transmission at this wavelength (0-1)
 * @param wavelengthNm - Wavelength in nanometers
 * @param temperatureK - Material temperature in Kelvin
 * @returns Emission intensity (D65-normalized)
 */
export function getKirchhoffEmission(
  transmission: number,
  wavelengthNm: number,
  temperatureK: number
): number {
  // No emission below Draper point
  if (temperatureK < DRAPER_POINT) {
    return 0;
  }

  // Clamp transmission to valid range
  const trans = Math.max(0, Math.min(1, transmission));

  // Kirchhoff's law: emissivity = absorptivity = 1 - transmission
  const absorptivity = 1 - trans;

  // Emission = absorptivity × black body intensity
  return absorptivity * getPlanckRadiance(wavelengthNm, temperatureK);
}

/**
 * Calculate complete spectrum value at a wavelength
 *
 * This is the core formula combining:
 * - Background illumination (modulated by grid if applicable)
 * - Material transmission (absorption)
 * - Thermal emission (Kirchhoff's law)
 *
 * result = background × transmission + emission
 *
 * @param backgroundIntensity - Background illumination (0-1)
 * @param transmission - Material transmission at this wavelength (0-1)
 * @param wavelengthNm - Wavelength in nanometers
 * @param temperatureK - Material temperature in Kelvin
 * @param enableEmission - Whether to include thermal emission
 * @returns Final spectrum intensity
 */
export function computeSpectrumValue(
  backgroundIntensity: number,
  transmission: number,
  wavelengthNm: number,
  temperatureK: number,
  enableEmission = true
): number {
  // Transmitted light through material
  const transmitted = backgroundIntensity * transmission;

  // Add emission if enabled
  if (enableEmission) {
    const emission = getKirchhoffEmission(transmission, wavelengthNm, temperatureK);
    return transmitted + emission;
  }

  return transmitted;
}

/**
 * Calculate emission contribution only (for visualization)
 *
 * @param transmission - Material transmission at this wavelength (0-1)
 * @param wavelengthNm - Wavelength in nanometers
 * @param temperatureK - Material temperature in Kelvin
 * @returns Emission intensity only
 */
export function getEmissionOnly(
  transmission: number,
  wavelengthNm: number,
  temperatureK: number
): number {
  return getKirchhoffEmission(transmission, wavelengthNm, temperatureK);
}
