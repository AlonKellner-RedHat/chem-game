/**
 * Kirchhoff's Law Implementation
 * 
 * Kirchhoff's law of thermal radiation states that:
 * emissivity(λ) = absorptivity(λ) = 1 - transmission(λ)
 * 
 * For a material at temperature T:
 * emission(λ) = absorptivity(λ) × B(λ,T)
 * 
 * where B(λ,T) is the Planck black body function.
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
  enableEmission: boolean = true
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




