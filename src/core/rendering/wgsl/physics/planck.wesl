/**
 * Planck Radiation Physics
 * 
 * Implements blackbody radiation and Kirchhoff emission for thermal physics.
 * 
 * Physics:
 * - Planck's law: B(λ,T) = (2hc²/λ⁵) × 1/(exp(hc/λkT) - 1)
 * - Kirchhoff's law: emissivity = absorptivity = 1 - transmission
 * - D65 normalization: radiance normalized to 1.0 at 550nm, 6500K
 */

import package::wgsl::constants::{C2, D65_REFERENCE};

// ============================================================
// Raw Planck Radiance
// ============================================================

/**
 * Get raw (unnormalized) Planck radiance at wavelength and temperature.
 * 
 * Uses the form: B ∝ 1 / (λ⁵ × (exp(C2/λT) - 1))
 * where C2 = hc/k ≈ 14387768.8 nm·K
 * 
 * @param wavelengthNm - Wavelength in nanometers
 * @param temperatureK - Temperature in Kelvin
 * @returns Raw radiance (unnormalized)
 */
fn getRawPlanckRadiance(wavelengthNm: f32, temperatureK: f32) -> f32 {
  // Guard against invalid inputs
  if (temperatureK <= 0.0 || wavelengthNm <= 0.0) {
    return 0.0;
  }
  
  // Calculate exponent: hc/(λkT) = C2/(λT)
  let exponent = C2 / (wavelengthNm * temperatureK);
  
  // Prevent overflow for very large exponents (cold objects at short wavelengths)
  if (exponent > 700.0) {
    return 0.0;
  }
  
  // Convert wavelength to meters for proper scaling
  let lambda = wavelengthNm * 1e-9;
  let expTerm = exp(exponent);
  
  // Guard against numerical issues
  if (expTerm <= 1.0) {
    return 0.0;
  }
  
  // Planck formula: B ∝ 1 / (λ⁵ × (exp(C2/λT) - 1))
  return 1.0 / (pow(lambda, 5.0) * (expTerm - 1.0));
}

// ============================================================
// D65-Normalized Planck Radiance
// ============================================================

/**
 * Get D65-normalized Planck radiance.
 * 
 * Normalized so that getPlanckRadiance(550, 6500) ≈ 1.0
 * This provides a consistent reference for color calculations.
 * 
 * @param wavelengthNm - Wavelength in nanometers
 * @param temperatureK - Temperature in Kelvin
 * @returns Normalized radiance (1.0 = D65 at 550nm)
 */
fn getPlanckRadiance(wavelengthNm: f32, temperatureK: f32) -> f32 {
  let raw = getRawPlanckRadiance(wavelengthNm, temperatureK);
  return raw / D65_REFERENCE;
}

// ============================================================
// Kirchhoff Emission
// ============================================================

/**
 * Calculate thermal emission using Kirchhoff's law.
 * 
 * Kirchhoff's law states that at thermal equilibrium:
 *   emissivity(λ,T) = absorptivity(λ,T) = 1 - transmission(λ)
 * 
 * This means good absorbers are good emitters, and transparent
 * materials emit weakly.
 * 
 * @param transmission - Material transmission at this wavelength (0-1)
 * @param wavelengthNm - Wavelength in nanometers
 * @param temperatureK - Temperature in Kelvin
 * @returns Emitted radiance (D65-normalized)
 */
fn getKirchhoffEmission(transmission: f32, wavelengthNm: f32, temperatureK: f32) -> f32 {
  // Clamp transmission to valid range
  let trans = clamp(transmission, 0.0, 1.0);
  
  // Absorptivity = 1 - transmission (Kirchhoff's law)
  let absorptivity = 1.0 - trans;
  
  // Emitted radiance = absorptivity × blackbody radiance
  return absorptivity * getPlanckRadiance(wavelengthNm, temperatureK);
}

