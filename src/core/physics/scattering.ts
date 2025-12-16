/**
 * Scattering Physics
 *
 * Implements Rayleigh and Mie scattering for particles in a medium.
 *
 * Rayleigh Scattering (d << λ):
 * - For particles much smaller than the wavelength
 * - Intensity ∝ 1/λ⁴
 * - Creates blue skies, red sunsets
 * - Scattering cross-section: σ = (2π⁵/3) × (d⁶/λ⁴) × ((n²-1)/(n²+2))²
 *
 * Mie Scattering (d ~ λ):
 * - For particles comparable to or larger than wavelength
 * - Roughly wavelength-independent for large particles
 * - Creates white clouds, milk, fog
 * - Full solution requires Maxwell's equations
 */

/**
 * Rayleigh scattering reference coefficient
 *
 * Based on the physical Rayleigh cross-section formula:
 * σ = ((2π)^5 / 48) × (d^6 / λ^4) × n_m^4 × ((n_p² - n_m²)/(n_p² + 2n_m²))²
 *
 * For 50nm silica nanoparticles (n_p=1.5) in water (n_m=1.33):
 * - Prefactor ((2π)^5 / 48) ≈ 204
 * - RI factor: n_m^4 × ((n_p² - n_m²)/(n_p² + 2n_m²))² ≈ 0.022
 * - Unit conversion (nm^6/nm^4 to cm²): 1e-14
 * - Combined: ~4.5e-14
 *
 * This produces physically accurate scattering:
 * - At 1e12 particles/cm³ with 50nm particles, 1cm path: ~2-3% scattering
 * - At 1e13 particles/cm³: ~20-30% scattering
 * - At 1e14 particles/cm³: ~85-95% scattering (strong effect)
 *
 * The coefficient includes the ((2π)^5/48) prefactor, unit conversion,
 * and a typical refractive index contrast factor for condensed media.
 */
export const RAYLEIGH_REFERENCE_COEFFICIENT = 5e-14;

/**
 * Mie scattering reference coefficient
 *
 * For large particles, scattering efficiency Q_sca approaches ~2.
 * Cross-section σ = Q × π × (d/2)²
 *
 * Tuned so that 1e8 particles/cm³ of 1000nm particles
 * produces moderate (~10-30%) scattering over 1cm path.
 */
export const MIE_REFERENCE_COEFFICIENT = 5e-16;

/**
 * Default small particle size for Rayleigh scattering (nm)
 * Typical for atmospheric molecules, nanoparticles
 */
export const DEFAULT_SMALL_PARTICLE_SIZE = 50;

/**
 * Default large particle size for Mie scattering (nm)
 * Typical for water droplets, dust, large colloids
 */
export const DEFAULT_LARGE_PARTICLE_SIZE = 1000;

/**
 * Parameters for Rayleigh scattering
 */
export interface RayleighParams {
  /** Particle density (particles per cm³) */
  particleDensity: number;
  /** Particle diameter (nm) - must be << wavelength */
  particleSize: number;
}

/**
 * Parameters for Mie scattering
 */
export interface MieParams {
  /** Particle density (particles per cm³) */
  particleDensity: number;
  /** Particle diameter (nm) - comparable to wavelength */
  particleSize: number;
}

/**
 * Calculate Rayleigh scattering coefficient
 *
 * Rayleigh scattering follows the 1/λ⁴ law:
 * σ_R = (8π³/3) × (n²-1)²/(N²λ⁴) × depolarization_factor
 *
 * Simplified for visualization:
 * scattering ∝ n × d⁶ / λ⁴
 *
 * @param wavelengthNm - Wavelength in nanometers
 * @param params - Rayleigh scattering parameters
 * @returns Scattering coefficient (per cm)
 */
export function getRayleighScattering(wavelengthNm: number, params: RayleighParams): number {
  if (params.particleDensity <= 0 || params.particleSize <= 0 || wavelengthNm <= 0) {
    return 0;
  }

  // Core Rayleigh formula: σ ∝ n × d⁶ / λ⁴
  const lambda4 = Math.pow(wavelengthNm, 4);
  const d6 = Math.pow(params.particleSize, 6);

  // Normalized scattering coefficient
  return (params.particleDensity * d6 * RAYLEIGH_REFERENCE_COEFFICIENT) / lambda4;
}

/**
 * Calculate Mie scattering coefficient
 *
 * For particles comparable to or larger than the wavelength,
 * we use a simplified Mie approximation based on the size parameter:
 * x = πd/λ
 *
 * For small x: approaches Rayleigh (1/λ⁴)
 * For large x: Q_sca → 2 (extinction paradox)
 *
 * @param wavelengthNm - Wavelength in nanometers
 * @param params - Mie scattering parameters
 * @returns Scattering coefficient (per cm)
 */
export function getMieScattering(wavelengthNm: number, params: MieParams): number {
  if (params.particleDensity <= 0 || params.particleSize <= 0 || wavelengthNm <= 0) {
    return 0;
  }

  // Size parameter: x = πd/λ
  const x = (Math.PI * params.particleSize) / wavelengthNm;

  // For very small particles, transition to Rayleigh behavior
  if (x < 0.3) {
    // Small particle limit - use Rayleigh
    return getRayleighScattering(wavelengthNm, {
      particleDensity: params.particleDensity,
      particleSize: params.particleSize,
    });
  }

  // Mie regime: scattering efficiency Q_sca
  // Approximation: Q_sca ≈ 2 × (1 - exp(-x²/10)) for x > 0.3
  // This smoothly transitions from small-particle to large-particle behavior
  const Qsca = 2 * (1 - Math.exp((-x * x) / 10));

  // Geometric cross-section: π × r²
  const radius = params.particleSize / 2;
  const geometricCrossSection = Math.PI * radius * radius;

  // Scattering coefficient = n × σ = n × Q × π × r²
  return params.particleDensity * Qsca * geometricCrossSection * MIE_REFERENCE_COEFFICIENT;
}

/**
 * Apply scattering to reduce light intensity
 *
 * Uses Beer-Lambert-like exponential attenuation:
 * I_out = I_in × exp(-σ × L)
 *
 * where σ is the total scattering coefficient and L is the path length.
 *
 * @param intensity - Input intensity
 * @param wavelengthNm - Wavelength in nanometers
 * @param smallParticleDensity - Rayleigh scattering particle density (particles/cm³)
 * @param largeParticleDensity - Mie scattering particle density (particles/cm³)
 * @param pathLength - Path length through medium (cm)
 * @returns Scattered (reduced) intensity
 */
export function applyScattering(
  intensity: number,
  wavelengthNm: number,
  smallParticleDensity: number,
  largeParticleDensity: number,
  pathLength: number
): number {
  if (pathLength <= 0) {
    return intensity;
  }

  // Calculate total scattering coefficient
  const rayleigh = getRayleighScattering(wavelengthNm, {
    particleDensity: smallParticleDensity,
    particleSize: DEFAULT_SMALL_PARTICLE_SIZE,
  });

  const mie = getMieScattering(wavelengthNm, {
    particleDensity: largeParticleDensity,
    particleSize: DEFAULT_LARGE_PARTICLE_SIZE,
  });

  const totalScattering = (rayleigh + mie) * pathLength;

  // Exponential attenuation (Beer-Lambert)
  return intensity * Math.exp(-totalScattering);
}

/**
 * Get the scattered light spectrum (what gets redirected, not transmitted)
 *
 * This is useful for computing atmospheric glow or volumetric scattering.
 * Scattered intensity = (1 - transmission) × input
 *
 * @param wavelengthNm - Wavelength in nanometers
 * @param smallParticleDensity - Rayleigh particle density
 * @param largeParticleDensity - Mie particle density
 * @param pathLength - Path length (cm)
 * @returns Fraction of light that is scattered (not transmitted)
 */
export function getScatteredFraction(
  wavelengthNm: number,
  smallParticleDensity: number,
  largeParticleDensity: number,
  pathLength: number
): number {
  const transmitted = applyScattering(
    1.0,
    wavelengthNm,
    smallParticleDensity,
    largeParticleDensity,
    pathLength
  );
  return 1.0 - transmitted;
}
