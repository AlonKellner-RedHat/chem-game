/**
 * Blur Kernels and Shared Memory Operations
 *
 * Implements Gaussian and Voigt blur kernels for scattering effects.
 * Uses workgroup shared memory for efficient tiled blur operations.
 *
 * Blur Types:
 * - Gaussian: Standard blur for emission aura
 * - Voigt: Gaussian core + Lorentzian tails for scattering
 */

import package::wgsl::constants::{
  MAX_BLUR_RADIUS, BLUR_WEIGHTS,
  BLUR_TILE_WIDTH, BLUR_TILE_HEIGHT, BLUR_HALO,
  BLUR_SHARED_WIDTH, BLUR_SHARED_HEIGHT,
  SPECTRAL_SAMPLES, RAYLEIGH_BLUR_SCALE, MIE_BLUR_SCALE
};
import package::wgsl::bindings::blurTile;

// ============================================================
// Blur Weight Functions
// ============================================================

/**
 * Simple Gaussian weight for emission aura blur.
 *
 * @param dist - Distance from center
 * @param sigma - Standard deviation
 * @returns Gaussian weight
 */
fn gaussianWeight(dist: f32, sigma: f32) -> f32 {
  if (sigma <= 0.0) {
    if (dist == 0.0) { return 1.0; }
    return 0.0;
  }
  let normalizedDist = dist / sigma;
  return exp(-0.5 * normalizedDist * normalizedDist);
}

/**
 * Voigt-like blur kernel weight.
 *
 * Combines Gaussian core with Lorentzian tails for physical accuracy.
 * The Lorentzian tails model the extended scattering halo.
 *
 * @param dist - Distance from center
 * @param sigma - Standard deviation
 * @returns Voigt-like weight
 */
fn voigtBlurWeight(dist: f32, sigma: f32) -> f32 {
  if (sigma <= 0.0) {
    if (dist == 0.0) { return 1.0; }
    return 0.0;
  }

  let normalizedDist = dist / sigma;

  // Gaussian core
  let gaussian = exp(-0.5 * normalizedDist * normalizedDist);

  // Lorentzian tails (gamma = sigma * 0.5)
  let gamma = 0.5;
  let lorentzian = gamma / (normalizedDist * normalizedDist + gamma * gamma);

  // Mix: 80% Gaussian, 20% Lorentzian
  return 0.8 * gaussian + 0.2 * lorentzian;
}

// ============================================================
// Scattering Blur Sigma Calculation
// ============================================================

/**
 * Calculate wavelength-dependent blur sigma for scattering.
 *
 * Rayleigh: blur ∝ 1/λ⁴ (blue scatters more)
 * Mie: blur ≈ constant (wavelength-independent)
 *
 * @param wavelengthNm - Wavelength in nm
 * @param smallDensity - Rayleigh particle density
 * @param largeDensity - Mie particle density
 * @param pathLength - Optical path length
 * @returns Blur sigma in pixels
 */
fn getScatterBlurSigma(
  wavelengthNm: f32,
  smallDensity: f32,
  largeDensity: f32,
  pathLength: f32
) -> f32 {
  if (smallDensity <= 0.0 && largeDensity <= 0.0) {
    return 0.0;
  }

  // Rayleigh: blur ∝ 1/λ⁴ (normalized to 550nm)
  let rayleighFactor = pow(550.0 / wavelengthNm, 4.0);
  let rayleighBlur = smallDensity * rayleighFactor * RAYLEIGH_BLUR_SCALE;

  // Mie: blur ≈ constant
  let mieBlur = largeDensity * MIE_BLUR_SCALE;

  // Combined blur (add variances, take sqrt for sigma)
  return sqrt(rayleighBlur + mieBlur) * pathLength;
}

// ============================================================
// Precomputed Blur Weights
// ============================================================

/**
 * Get precomputed Gaussian weight for sigma=5.0.
 *
 * Uses the BLUR_WEIGHTS constant array for efficient lookup.
 * Weights are symmetric: weight[dx] = weight[-dx]
 *
 * @param dx - Distance from center (0-16)
 * @returns Normalized weight
 */
fn getPrecomputedWeight(dx: i32) -> f32 {
  let idx = abs(dx);
  if (idx > MAX_BLUR_RADIUS) {
    return 0.0;
  }
  return BLUR_WEIGHTS[idx];
}
