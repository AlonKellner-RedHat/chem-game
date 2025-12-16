/**
 * Scattering Physics
 * 
 * Implements Rayleigh and Mie scattering for particles in a medium.
 * 
 * Rayleigh Scattering (d << λ):
 * - For particles much smaller than wavelength
 * - Intensity ∝ 1/λ⁴ (blue scatters more than red)
 * - Creates blue skies, red sunsets
 * 
 * Mie Scattering (d ~ λ):
 * - For particles comparable to or larger than wavelength
 * - Roughly wavelength-independent for large particles
 * - Creates white clouds, milk, fog
 */

import package::wgsl::constants::{
  RAYLEIGH_COEFF, MIE_COEFF,
  SMALL_PARTICLE_SIZE, LARGE_PARTICLE_SIZE,
  SCATTER_LUT_SIZE
};
import package::wgsl::bindings::params;

// ============================================================
// Rayleigh Scattering
// ============================================================

/**
 * Calculate Rayleigh scattering coefficient.
 * 
 * Rayleigh scattering formula: σ ∝ n × d⁶ / λ⁴
 * - n = particle density
 * - d = particle diameter
 * - λ = wavelength
 * 
 * @param wavelengthNm - Wavelength in nanometers
 * @param density - Particle density (particles/cm³)
 * @returns Scattering coefficient (per cm)
 */
fn getRayleighScattering(wavelengthNm: f32, density: f32) -> f32 {
  if (density <= 0.0 || wavelengthNm <= 0.0) {
    return 0.0;
  }
  
  // Core Rayleigh formula: σ ∝ n × d⁶ / λ⁴
  let lambda4 = pow(wavelengthNm, 4.0);
  let d6 = pow(SMALL_PARTICLE_SIZE, 6.0);
  
  return density * d6 * RAYLEIGH_COEFF / lambda4;
}

// ============================================================
// Mie Scattering
// ============================================================

/**
 * Calculate Mie scattering coefficient.
 * 
 * For large particles, uses size parameter x = πd/λ:
 * - Small x: approaches Rayleigh (1/λ⁴)
 * - Large x: Q_sca -> 2 (extinction paradox)
 * 
 * @param wavelengthNm - Wavelength in nanometers
 * @param density - Particle density (particles/cm³)
 * @returns Scattering coefficient (per cm)
 */
fn getMieScattering(wavelengthNm: f32, density: f32) -> f32 {
  if (density <= 0.0 || wavelengthNm <= 0.0) {
    return 0.0;
  }
  
  // Size parameter: x = πd/λ
  let x = 3.14159 * LARGE_PARTICLE_SIZE / wavelengthNm;
  
  // For small x, transition to Rayleigh behavior
  if (x < 0.3) {
    return getRayleighScattering(wavelengthNm, density);
  }
  
  // Mie regime: Q_sca ≈ 2 × (1 - exp(-x²/10))
  // This smoothly transitions from small-particle to large-particle behavior
  let Qsca = 2.0 * (1.0 - exp(-x * x / 10.0));
  
  // Geometric cross-section: π × r²
  let radius = LARGE_PARTICLE_SIZE / 2.0;
  let geometricCrossSection = 3.14159 * radius * radius;
  
  // Scattering coefficient = n × σ = n × Q × π × r²
  return density * Qsca * geometricCrossSection * MIE_COEFF;
}

// ============================================================
// Combined Scattering (Beer-Lambert)
// ============================================================

/**
 * Apply scattering attenuation using Beer-Lambert law.
 * 
 * I_out = I_in × exp(-σ × L)
 * 
 * @param intensity - Input intensity
 * @param wavelengthNm - Wavelength in nm
 * @param smallDensity - Rayleigh particle density
 * @param largeDensity - Mie particle density
 * @param pathLength - Path length in cm
 * @returns Transmitted (attenuated) intensity
 */
fn applyScattering(
  intensity: f32,
  wavelengthNm: f32,
  smallDensity: f32,
  largeDensity: f32,
  pathLength: f32
) -> f32 {
  if (pathLength <= 0.0) {
    return intensity;
  }
  
  let rayleigh = getRayleighScattering(wavelengthNm, smallDensity);
  let mie = getMieScattering(wavelengthNm, largeDensity);
  let totalScatter = (rayleigh + mie) * pathLength;
  
  // Exponential attenuation (Beer-Lambert)
  return intensity * exp(-totalScatter);
}

// ============================================================
// Scattering LUT (Downsampled Optimization)
// ============================================================

/**
 * Pre-computed scattering data for a shape.
 * Stores scattering coefficients at reduced wavelength resolution
 * for efficient interpolation when processing 5000 wavelengths.
 */
struct ScatterLUT {
  coefficients: array<f32, 64>,
}

/**
 * Build a scattering LUT for a shape's particle configuration.
 * Computes scattering at 64 wavelength samples for later interpolation.
 * 
 * @param smallDensity - Rayleigh particle density
 * @param largeDensity - Mie particle density
 * @param pathLength - Optical path length (cm)
 * @returns ScatterLUT with pre-computed coefficients
 */
fn buildScatterLUT(
  smallDensity: f32,
  largeDensity: f32,
  pathLength: f32
) -> ScatterLUT {
  var lut: ScatterLUT;
  
  // No scattering case - fill with zeros
  if (pathLength <= 0.0 || (smallDensity <= 0.0 && largeDensity <= 0.0)) {
    for (var i: u32 = 0u; i < SCATTER_LUT_SIZE; i++) {
      lut.coefficients[i] = 0.0;
    }
    return lut;
  }
  
  let wavelengthRange = params.wavelengthMax - params.wavelengthMin;
  
  // Compute scattering at each LUT sample
  for (var i: u32 = 0u; i < SCATTER_LUT_SIZE; i++) {
    let t = f32(i) / f32(SCATTER_LUT_SIZE - 1u);
    let wavelength = params.wavelengthMin + t * wavelengthRange;
    
    let rayleigh = getRayleighScattering(wavelength, smallDensity);
    let mie = getMieScattering(wavelength, largeDensity);
    lut.coefficients[i] = (rayleigh + mie) * pathLength;
  }
  
  return lut;
}

/**
 * Sample scattering coefficient from pre-computed LUT with linear interpolation.
 * 
 * @param lut - Pre-computed scattering LUT
 * @param wavelengthNm - Wavelength to sample
 * @returns Interpolated scattering coefficient
 */
fn sampleScatterLUT(lut: ptr<function, ScatterLUT>, wavelengthNm: f32) -> f32 {
  let wavelengthRange = params.wavelengthMax - params.wavelengthMin;
  let t = (wavelengthNm - params.wavelengthMin) / wavelengthRange;
  let tClamped = clamp(t, 0.0, 1.0);
  
  let indexFloat = tClamped * f32(SCATTER_LUT_SIZE - 1u);
  let indexLow = u32(floor(indexFloat));
  let indexHigh = min(indexLow + 1u, SCATTER_LUT_SIZE - 1u);
  let frac = indexFloat - f32(indexLow);
  
  // Linear interpolation between samples
  return mix((*lut).coefficients[indexLow], (*lut).coefficients[indexHigh], frac);
}

/**
 * Apply scattering using pre-computed LUT (optimized for many wavelengths).
 * 
 * @param intensity - Input intensity
 * @param lut - Pre-computed scattering LUT
 * @param wavelengthNm - Wavelength in nm
 * @param mask - Shape coverage (0-1)
 * @returns Transmitted intensity
 */
fn applyScatteringFromLUT(
  intensity: f32,
  lut: ptr<function, ScatterLUT>,
  wavelengthNm: f32,
  mask: f32
) -> f32 {
  let totalScatter = sampleScatterLUT(lut, wavelengthNm) * mask;
  return intensity * exp(-totalScatter);
}

