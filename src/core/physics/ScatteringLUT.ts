/**
 * ScatteringLUT - Pre-computed scattering coefficient lookup tables
 * 
 * Generates lookup tables for Rayleigh and Mie scattering factors,
 * allowing GPU shaders to sample pre-computed values instead of
 * computing expensive pow() operations per wavelength.
 * 
 * This follows OCP (Open-Closed Principle) - the LUT generation is
 * configurable without modifying the core algorithm.
 */

/**
 * Configuration for generating a scattering LUT
 */
export interface ScatteringLUTConfig {
  /** Minimum wavelength in nm (typically 200) */
  wavelengthMin: number;
  /** Maximum wavelength in nm (typically 1000) */
  wavelengthMax: number;
  /** Number of samples in the LUT (typically 256) */
  samples: number;
}

/**
 * Reference wavelength for normalization (550nm = green light)
 */
const REFERENCE_WAVELENGTH = 550;

/**
 * ScatteringLUT provides pre-computed scattering coefficient lookup tables
 * for use in GPU shaders, eliminating per-wavelength pow() calculations.
 */
export class ScatteringLUT {
  /**
   * Calculate the Rayleigh scattering factor for a given wavelength.
   * Rayleigh scattering scales as (λ_ref/λ)^4 - blue scatters more than red.
   * 
   * @param wavelengthNm - Wavelength in nanometers
   * @returns Rayleigh factor normalized to 1.0 at 550nm
   */
  static getRayleighFactor(wavelengthNm: number): number {
    if (wavelengthNm <= 0) {
      return 0;
    }
    
    // Rayleigh: factor = (550/λ)^4
    const ratio = REFERENCE_WAVELENGTH / wavelengthNm;
    return Math.pow(ratio, 4);
  }

  /**
   * Calculate the Mie scattering factor for a given wavelength.
   * Mie scattering is roughly wavelength-independent for large particles.
   * 
   * For particles much larger than the wavelength (geometric regime),
   * the scattering efficiency Q_sca ≈ 2, independent of wavelength.
   * 
   * @param wavelengthNm - Wavelength in nanometers
   * @returns Mie factor normalized to 1.0 at 550nm
   */
  static getMieFactor(wavelengthNm: number): number {
    if (wavelengthNm <= 0) {
      return 0;
    }
    
    // Mie is approximately wavelength-independent for large particles
    // We normalize to 1.0 at the reference wavelength
    // Small wavelength dependence: ~(λ_ref/λ)^0.2 for aerosols
    const ratio = REFERENCE_WAVELENGTH / wavelengthNm;
    return Math.pow(ratio, 0.2);
  }

  /**
   * Generate a lookup table of Rayleigh scattering factors.
   * 
   * The LUT maps normalized position [0, 1] to Rayleigh factor,
   * where 0 = wavelengthMin and 1 = wavelengthMax.
   * 
   * @param config - LUT generation configuration
   * @returns Float32Array of Rayleigh factors
   * @throws Error if config is invalid
   */
  static generate(config: ScatteringLUTConfig): Float32Array {
    // Validate config
    if (config.wavelengthMin >= config.wavelengthMax) {
      throw new Error(
        `Invalid wavelength range: min (${config.wavelengthMin}) must be less than max (${config.wavelengthMax})`
      );
    }
    if (config.samples <= 0) {
      throw new Error(`Invalid samples count: ${config.samples} must be positive`);
    }

    const lut = new Float32Array(config.samples);
    const wavelengthRange = config.wavelengthMax - config.wavelengthMin;

    for (let i = 0; i < config.samples; i++) {
      // Map index to wavelength
      const t = i / (config.samples - 1);
      const wavelength = config.wavelengthMin + t * wavelengthRange;
      
      // Store Rayleigh factor (primary use case for LUT)
      lut[i] = this.getRayleighFactor(wavelength);
    }

    return lut;
  }

  /**
   * Interpolate a value from a LUT given a normalized position.
   * 
   * @param lut - The lookup table
   * @param t - Normalized position [0, 1] where 0 = first sample, 1 = last sample
   * @returns Interpolated value
   */
  static interpolate(lut: Float32Array, t: number): number {
    if (lut.length === 0) {
      return 0;
    }
    if (lut.length === 1) {
      return lut[0];
    }

    // Clamp t to [0, 1]
    const tClamped = Math.max(0, Math.min(1, t));
    
    // Map t to LUT index
    const indexFloat = tClamped * (lut.length - 1);
    const indexLow = Math.floor(indexFloat);
    const indexHigh = Math.min(indexLow + 1, lut.length - 1);
    const frac = indexFloat - indexLow;

    // Linear interpolation
    return lut[indexLow] * (1 - frac) + lut[indexHigh] * frac;
  }

  /**
   * Generate a combined Rayleigh + Mie LUT for a specific particle configuration.
   * 
   * @param config - LUT generation configuration
   * @param rayleighWeight - Weight for Rayleigh component (0-1)
   * @param mieWeight - Weight for Mie component (0-1)
   * @returns Float32Array of combined scattering factors
   */
  static generateCombined(
    config: ScatteringLUTConfig,
    rayleighWeight: number = 0.5,
    mieWeight: number = 0.5
  ): Float32Array {
    const lut = new Float32Array(config.samples);
    const wavelengthRange = config.wavelengthMax - config.wavelengthMin;

    for (let i = 0; i < config.samples; i++) {
      const t = i / (config.samples - 1);
      const wavelength = config.wavelengthMin + t * wavelengthRange;
      
      const rayleigh = this.getRayleighFactor(wavelength) * rayleighWeight;
      const mie = this.getMieFactor(wavelength) * mieWeight;
      
      lut[i] = rayleigh + mie;
    }

    return lut;
  }
}

