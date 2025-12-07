/**
 * UnifiedSpectralPhysics.glsl
 * 
 * SINGLE SOURCE OF TRUTH for all spectral physics calculations.
 * This file is included by UnifiedSpectralShader.glsl.
 * 
 * ALL physics formulas are defined here and used by both:
 * - RGB color rendering (16-wavelength integration)
 * - Spectrum readback (single wavelength query)
 * 
 * This ensures perfect synchronization between the spectral plot and rendering.
 * 
 * Functions:
 * - planckRadiance(wavelengthNm, temperature): D65-normalized black body
 * - kirchhoffEmission(transmission, wavelengthNm, temperature): Kirchhoff's law
 * - getBackgroundIntensity(wavelengthNm, mode): background illumination
 * - getAuraIntensity(signedDistance, auraRadius, auraDecay): aura falloff
 * - computeSpectrumValue(wavelengthNm, transmission, temperature, mode): combined result
 */

// ============================================================================
// Physical Constants
// ============================================================================

// Planck's law constants
const float C1 = 3.7417749e-16;   // 2πhc² in W·m²
const float C2 = 0.014387773;     // hc/k in m·K

// Temperature threshold for visible emission
const float DRAPER_POINT = 798.0;

// ============================================================================
// Background Boundaries
// ============================================================================

// Visible spectrum boundaries
const float VISIBLE_MIN = 380.0;
const float VISIBLE_MAX = 700.0;

// Normal mode fade boundaries
const float UV_FADE_START = 250.0;
const float IR_FADE_END = 850.0;

// UV mode boundaries
const float UV_SHORT_FADE_START = 200.0;
const float UV_SHORT_FADE_END = 250.0;
const float UV_LONG_FADE_START = 350.0;
const float UV_LONG_FADE_END = 450.0;

// ============================================================================
// Background Modes
// ============================================================================

const int MODE_NORMAL = 0;   // D65 white light
const int MODE_UV = 1;       // UV illumination
const int MODE_DARK = 2;     // No illumination (emission only)

// ============================================================================
// D65 Reference (set by CPU)
// ============================================================================

uniform float u_d65Reference;   // Pre-computed: getRawPlanckRadiance(550, 6500)

// ============================================================================
// Planck's Law Functions
// ============================================================================

/**
 * Raw Planck's law calculation (no normalization)
 * 
 * B(λ,T) = C1/λ⁵ × 1/(exp(C2/(λT)) - 1)
 * 
 * @param wavelengthNm Wavelength in nanometers
 * @param temperature Temperature in Kelvin
 * @return Raw spectral radiance
 */
float getRawPlanckRadiance(float wavelengthNm, float temperature) {
  if (temperature <= 0.0 || wavelengthNm <= 0.0) {
    return 0.0;
  }
  
  // Convert nm to meters
  float lambda = wavelengthNm * 1.0e-9;
  
  // Planck's law exponent
  float exponent = C2 / (lambda * temperature);
  
  // Handle numerical overflow (very cold temperatures)
  if (exponent > 700.0) {
    return 0.0;
  }
  
  float expTerm = exp(exponent);
  
  // Handle numerical underflow (very hot) - use Wien approximation
  if (expTerm <= 1.0) {
    return (C1 / pow(lambda, 5.0)) * exp(-exponent);
  }
  
  return (C1 / pow(lambda, 5.0)) / (expTerm - 1.0);
}

/**
 * D65-normalized Planck radiance
 * 
 * Normalized so that:
 * - 6500K at 550nm = 1.0
 * - < 6500K produces < 1.0
 * - > 6500K produces > 1.0
 * 
 * Returns 0 below Draper point (798K)
 * 
 * @param wavelengthNm Wavelength in nanometers
 * @param temperature Temperature in Kelvin
 * @return Normalized intensity relative to D65
 */
float planckRadiance(float wavelengthNm, float temperature) {
  // No visible emission below Draper point
  if (temperature < DRAPER_POINT || wavelengthNm <= 0.0) {
    return 0.0;
  }
  
  float raw = getRawPlanckRadiance(wavelengthNm, temperature);
  return raw / u_d65Reference;
}

// ============================================================================
// Kirchhoff's Law Emission
// ============================================================================

/**
 * Emission via Kirchhoff's law
 * 
 * Kirchhoff's law: emissivity = absorptivity = 1 - transmission
 * 
 * emission = absorptivity × planckRadiance(λ, T)
 * 
 * @param transmission Material transmission (0-1)
 * @param wavelengthNm Wavelength in nanometers
 * @param temperature Temperature in Kelvin
 * @return Emission intensity
 */
float kirchhoffEmission(float transmission, float wavelengthNm, float temperature) {
  // No emission below Draper point
  if (temperature < DRAPER_POINT) {
    return 0.0;
  }
  
  // Clamp transmission to [0, 1]
  float trans = clamp(transmission, 0.0, 1.0);
  
  // Kirchhoff's law: emissivity = absorptivity
  float absorptivity = 1.0 - trans;
  
  // emission = absorptivity × black body intensity
  return absorptivity * planckRadiance(wavelengthNm, temperature);
}

// ============================================================================
// Background Illumination
// ============================================================================

/**
 * Normal (D65) background intensity
 * Uniform in visible range (380-700nm), fades in UV and IR
 */
float getNormalBackgroundIntensity(float wavelengthNm) {
  // Visible range: full intensity
  if (wavelengthNm >= VISIBLE_MIN && wavelengthNm <= VISIBLE_MAX) {
    return 1.0;
  }
  
  // UV fade (< 380nm)
  if (wavelengthNm < VISIBLE_MIN) {
    if (wavelengthNm <= UV_FADE_START) {
      return 0.0;
    }
    // Fade from 250nm (0) to 380nm (1)
    float t = (wavelengthNm - UV_FADE_START) / (VISIBLE_MIN - UV_FADE_START);
    // Quadratic rise: 1 - (1-t)²
    return max(0.0, 1.0 - (1.0 - t) * (1.0 - t));
  }
  
  // IR fade (> 700nm)
  if (wavelengthNm >= IR_FADE_END) {
    return 0.0;
  }
  // Fade from 700nm (1) to 850nm (0)
  float t = (wavelengthNm - VISIBLE_MAX) / (IR_FADE_END - VISIBLE_MAX);
  // Quadratic decay: 1 - t²
  return max(0.0, 1.0 - t * t);
}

/**
 * UV background intensity
 * Peak at 250-350nm, fades to visible at 450nm
 */
float getUVBackgroundIntensity(float wavelengthNm) {
  // Below minimum: no light
  if (wavelengthNm < UV_SHORT_FADE_START) {
    return 0.0;
  }
  
  // Short wavelength fade-in (200-250nm)
  if (wavelengthNm < UV_SHORT_FADE_END) {
    float t = (wavelengthNm - UV_SHORT_FADE_START) / (UV_SHORT_FADE_END - UV_SHORT_FADE_START);
    // Fast rise: 1 - (1-t)²
    return 1.0 - (1.0 - t) * (1.0 - t);
  }
  
  // Peak UV range (250-350nm)
  if (wavelengthNm <= UV_LONG_FADE_START) {
    return 1.0;
  }
  
  // Long wavelength fade-out (350-450nm)
  if (wavelengthNm < UV_LONG_FADE_END) {
    float t = (wavelengthNm - UV_LONG_FADE_START) / (UV_LONG_FADE_END - UV_LONG_FADE_START);
    // Quadratic decay: 1 - t²
    return 1.0 - t * t;
  }
  
  // Beyond fade end: no UV light
  return 0.0;
}

/**
 * Background illumination intensity at a wavelength
 * 
 * @param wavelengthNm Wavelength in nanometers
 * @param mode Background mode (0=normal, 1=UV, 2=dark)
 * @return Background intensity (0-1)
 */
float getBackgroundIntensity(float wavelengthNm, int mode) {
  if (mode == MODE_DARK) {
    return 0.0;
  }
  
  if (mode == MODE_UV) {
    return getUVBackgroundIntensity(wavelengthNm);
  }
  
  return getNormalBackgroundIntensity(wavelengthNm);
}

// ============================================================================
// Aura Intensity
// ============================================================================

/**
 * Aura intensity at a given distance from shape boundary
 * 
 * @param signedDistance Signed distance (positive inside, negative outside)
 * @param auraRadius Maximum aura radius in pixels
 * @param auraDecay Exponential decay rate (1/pixels)
 * @return Aura intensity (0-1)
 */
float getAuraIntensity(float signedDistance, float auraRadius, float auraDecay) {
  // Inside shape: full intensity
  if (signedDistance >= 0.0) {
    return 1.0;
  }
  
  // Beyond aura radius: no intensity
  float outsideDistance = -signedDistance;
  if (outsideDistance > auraRadius) {
    return 0.0;
  }
  
  // Exponential decay: exp(-decay × distance)
  return exp(-auraDecay * outsideDistance);
}

// ============================================================================
// Combined Spectrum Value
// ============================================================================

/**
 * Compute final spectrum value at a wavelength
 * 
 * Core physics formula:
 *   result = background × transmission + emission
 * 
 * This is the SINGLE function that determines how light interacts with material.
 * Both RGB rendering and spectrum readback use this function.
 * 
 * @param wavelengthNm Wavelength in nanometers
 * @param transmission Material transmission (0-1)
 * @param temperature Material temperature in Kelvin
 * @param mode Background mode
 * @return Final spectrum intensity
 */
float computeSpectrumValue(float wavelengthNm, float transmission, float temperature, int mode) {
  float background = getBackgroundIntensity(wavelengthNm, mode);
  float transmitted = background * transmission;
  float emission = kirchhoffEmission(transmission, wavelengthNm, temperature);
  
  return transmitted + emission;
}

