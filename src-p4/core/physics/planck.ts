/**
 * Planck's Law Implementation
 * 
 * Calculates black body spectral radiance using Planck's law:
 * B(λ,T) = (2hc²/λ⁵) × 1/(exp(hc/λkT) - 1)
 * 
 * This is the fundamental formula for thermal radiation.
 */

import { C1, C2, DRAPER_POINT, D65_TEMPERATURE } from './constants';

/**
 * Calculate raw Planck spectral radiance (no normalization)
 * 
 * @param wavelengthNm - Wavelength in nanometers
 * @param temperatureK - Temperature in Kelvin
 * @returns Raw spectral radiance in W/(m³·sr)
 */
export function getRawPlanckRadiance(
  wavelengthNm: number,
  temperatureK: number
): number {
  if (temperatureK <= 0 || wavelengthNm <= 0) {
    return 0;
  }
  
  // Convert wavelength from nm to meters
  const lambda = wavelengthNm * 1e-9;
  
  // Planck's law exponent: hc/(λkT)
  const exponent = C2 / (lambda * temperatureK);
  
  // Handle numerical overflow (very cold temperatures)
  if (exponent > 700) {
    return 0;
  }
  
  const expTerm = Math.exp(exponent);
  
  // Handle numerical underflow (very hot) - use Wien approximation
  if (expTerm <= 1) {
    return (C1 / Math.pow(lambda, 5)) * Math.exp(-exponent);
  }
  
  // Full Planck formula
  return (C1 / Math.pow(lambda, 5)) / (expTerm - 1);
}

// Cache the D65 reference intensity for normalization
let d65ReferenceIntensity: number | null = null;

/**
 * Get D65 reference intensity (cached)
 * This is the raw Planck intensity at 550nm, 6500K
 */
export function getD65ReferenceIntensity(): number {
  if (d65ReferenceIntensity === null) {
    d65ReferenceIntensity = getRawPlanckRadiance(550, D65_TEMPERATURE);
  }
  return d65ReferenceIntensity;
}

/**
 * Calculate D65-normalized Planck spectral radiance
 * 
 * Normalized so that:
 * - 6500K at 550nm = 1.0
 * - < 6500K produces < 1.0
 * - > 6500K produces > 1.0
 * 
 * Returns 0 below Draper point (798K)
 * 
 * @param wavelengthNm - Wavelength in nanometers
 * @param temperatureK - Temperature in Kelvin
 * @returns Normalized intensity relative to D65
 */
export function getPlanckRadiance(
  wavelengthNm: number,
  temperatureK: number
): number {
  // No visible emission below Draper point
  if (temperatureK < DRAPER_POINT || wavelengthNm <= 0) {
    return 0;
  }
  
  const raw = getRawPlanckRadiance(wavelengthNm, temperatureK);
  return raw / getD65ReferenceIntensity();
}

/**
 * Get Wien's displacement law peak wavelength
 * 
 * λ_max = b / T
 * where b = 2897771.955 nm·K
 * 
 * @param temperatureK - Temperature in Kelvin
 * @returns Peak wavelength in nm
 */
export function getWienPeakWavelength(temperatureK: number): number {
  if (temperatureK <= 0) {
    return Infinity;
  }
  return 2897771.955 / temperatureK;
}

/**
 * Check if a temperature produces visible emission
 * 
 * @param temperatureK - Temperature in Kelvin
 * @returns true if temperature is above Draper point
 */
export function hasVisibleEmission(temperatureK: number): boolean {
  return temperatureK >= DRAPER_POINT;
}


