/**
 * Fluorescence Physics
 * 
 * Implements fluorescence emission for UV-absorbing materials.
 * 
 * Fluorescence Process:
 * 1. UV photons are absorbed (excitation)
 * 2. Molecules enter excited electronic state
 * 3. Light is re-emitted at longer wavelengths (Stokes shift)
 * 
 * Two-Pass Algorithm:
 * - Pass 1: Accumulate total excitation from all absorbed wavelengths
 * - Pass 2: Distribute emission according to emission spectrum
 * 
 * This correctly handles inter-wavelength coupling:
 * - UV light at 300nm can cause visible emission at 589nm
 */

import spectral::physics::materials::{
  getMaterialTransmission,
  getFluorescenceExcitation,
  getFluorescenceEmission
};

// ============================================================
// Excitation Accumulation (Pass 1)
// ============================================================

/**
 * Calculate fluorescence excitation for a single wavelength.
 * 
 * Excitation amount = absorbed_light × excitation_efficiency
 * 
 * @param transmittedIntensity - Light intensity reaching the material
 * @param materialTrans - Material transmission at this wavelength
 * @param materialIndex - Index into material palette
 * @param wavelengthNm - Wavelength in nanometers
 * @param mask - Shape coverage (0-1)
 * @returns Excitation contribution from this wavelength
 */
fn calculateExcitation(
  transmittedIntensity: f32,
  materialTrans: f32,
  materialIndex: u32,
  wavelengthNm: f32,
  mask: f32
) -> f32 {
  // Calculate absorbed light (what was removed from transmission)
  let absorbedLight = transmittedIntensity * (1.0 - materialTrans) * mask;
  
  // Get excitation efficiency at this wavelength
  let excitationEff = getFluorescenceExcitation(materialIndex, wavelengthNm);
  
  // Return excitation contribution
  return absorbedLight * excitationEff;
}

// ============================================================
// Emission Distribution (Pass 2)
// ============================================================

/**
 * Calculate fluorescence emission at a specific wavelength.
 * 
 * Uses pre-accumulated excitation (from Pass 1) to compute
 * emission according to the emission spectrum shape.
 * 
 * @param totalExcitation - Total excitation accumulated from all wavelengths
 * @param materialIndex - Index into material palette
 * @param wavelengthNm - Emission wavelength
 * @param quantumYield - Fluorescence quantum yield (0-1)
 * @returns Emitted intensity at this wavelength
 */
fn calculateEmission(
  totalExcitation: f32,
  materialIndex: u32,
  wavelengthNm: f32,
  quantumYield: f32
) -> f32 {
  // Get emission line shape at this wavelength (normalized 0-1)
  // Non-zero at emission wavelength (e.g., 589nm for sodium)
  let emissionShape = getFluorescenceEmission(materialIndex, wavelengthNm);
  
  // Fluorescence emission = totalExcitation × emissionShape × quantumYield
  // The quantum yield accounts for non-radiative losses
  return totalExcitation * emissionShape * quantumYield;
}

