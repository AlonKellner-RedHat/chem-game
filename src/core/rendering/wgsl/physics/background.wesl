/**
 * Background Illumination
 * 
 * Implements different illumination modes for the background.
 * 
 * Modes:
 * - Normal (0): D65-like illumination covering visible + some UV/IR
 * - UV (1): Pure UV illumination (100-380nm), visible range is BLACK
 * - Dark (2): No illumination - useful for seeing emission only
 */

import spectral::constants::{VISIBLE_MIN, VISIBLE_MAX};
import spectral::bindings::params;

// ============================================================
// Background Intensity
// ============================================================

/**
 * Get background intensity at wavelength based on mode.
 * 
 * @param wavelengthNm - Wavelength in nanometers
 * @returns Intensity (0-1)
 */
fn getBackgroundIntensity(wavelengthNm: f32) -> f32 {
  // Dark mode: zero everywhere
  if (params.backgroundMode == 2u) {
    return 0.0;
  }
  
  // UV mode: Pure UV illumination (invisible to eye, excites fluorescence)
  // Emits only in UV range (100-380nm), zero in visible
  // Background appears BLACK but is actually emitting UV light
  if (params.backgroundMode == 1u) {
    // No emission below 100nm (extreme vacuum UV)
    if (wavelengthNm < 100.0) { return 0.0; }
    
    // Ramp up from 100-150nm (reverse quadratic)
    if (wavelengthNm < 150.0) {
      let t = (wavelengthNm - 100.0) / 50.0;
      return 1.0 - (1.0 - t) * (1.0 - t);
    }
    
    // Full intensity in deep UV to UV-A range (150-350nm)
    if (wavelengthNm <= 350.0) { return 1.0; }
    
    // Sharp cutoff before visible range (350-380nm)
    if (wavelengthNm < VISIBLE_MIN) {
      let t = (wavelengthNm - 350.0) / (VISIBLE_MIN - 350.0);
      return 1.0 - t * t;
    }
    
    // ZERO visible light - background appears black
    return 0.0;
  }
  
  // Normal mode: D65-like illumination
  // Full intensity in visible range
  if (wavelengthNm >= VISIBLE_MIN && wavelengthNm <= VISIBLE_MAX) {
    return 1.0;
  }
  
  // UV falloff (below visible)
  if (wavelengthNm < VISIBLE_MIN) {
    if (wavelengthNm <= 250.0) { return 0.0; }
    let t = (wavelengthNm - 250.0) / (VISIBLE_MIN - 250.0);
    return 1.0 - (1.0 - t) * (1.0 - t); // Reverse quadratic
  }
  
  // IR falloff (above visible)
  if (wavelengthNm >= 850.0) { return 0.0; }
  let t = (wavelengthNm - VISIBLE_MAX) / (850.0 - VISIBLE_MAX);
  return 1.0 - t * t; // Quadratic falloff
}

// ============================================================
// Ambient Light
// ============================================================

/**
 * Get ambient light intensity at wavelength.
 * 
 * Ambient light has the same spectral distribution as the background
 * but is applied from the "front" as reflected light rather than
 * transmitted backlight.
 * 
 * Returns f16 for memory efficiency.
 * 
 * @param wavelengthNm - Wavelength in nanometers
 * @returns Ambient intensity as f16
 */
fn getAmbientIntensity(wavelengthNm: f32) -> f16 {
  // Use same distribution as background - they are synced
  return f16(getBackgroundIntensity(wavelengthNm));
}

