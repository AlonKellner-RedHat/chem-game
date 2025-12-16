/**
 * WESL Test Helpers
 * 
 * Provides constants and utilities for testing WGSL/WESL shaders.
 * 
 * Note: GPU-specific helpers are in gpuTestHelpers.ts to avoid
 * loading WebGPU bindings in environments that don't support it.
 */

/**
 * Compare two numbers with relative tolerance
 * Useful for comparing floating point results from GPU
 */
export function expectCloseTo(
  actual: number,
  expected: number,
  relativeTolerance: number = 0.01
): boolean {
  if (expected === 0) {
    return Math.abs(actual) < relativeTolerance;
  }
  const relativeError = Math.abs((actual - expected) / expected);
  return relativeError < relativeTolerance;
}

/**
 * Physical constants for validation tests
 * These should match the values in constants.wesl
 */
export const PHYSICAL_CONSTANTS = {
  D65_TEMPERATURE: 6500.0,
  VISIBLE_MIN: 380.0,
  VISIBLE_MAX: 700.0,
  C2: 14387768.8, // hc/k in nm·K
  D65_REFERENCE: 3.62e+29, // Raw Planck at 550nm, 6500K
  
  // Scattering constants
  RAYLEIGH_COEFF: 5e-14,
  MIE_COEFF: 5e-16,
  SMALL_PARTICLE_SIZE: 50.0, // nm
  LARGE_PARTICLE_SIZE: 1000.0, // nm
  
  // Blur constants
  MAX_BLUR_RADIUS: 16,
  SPECTRAL_SAMPLES: 16,
};

