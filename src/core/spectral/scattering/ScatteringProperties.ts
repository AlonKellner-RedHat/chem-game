/**
 * ScatteringProperties - defines how a material scatters light
 * 
 * Scattering causes blur of content seen THROUGH the material,
 * while keeping the material boundaries sharp.
 * 
 * Types of scattering:
 * - Rayleigh (λ^-4): Small particles, wavelength dependent, blue scatters more
 * - Mie (λ^0): Larger particles, wavelength independent, white/milky appearance
 */
export interface ScatteringProperties {
  /**
   * Base scattering coefficient (0 = no scatter, 1 = fully opaque/blurred)
   */
  coefficient: number;
  
  /**
   * Wavelength dependence power:
   * - 0 = Mie scattering (uniform across wavelengths, cloudy appearance)
   * - 4 = Rayleigh scattering (blue scatters more, sunset effect)
   * - Values in between for mixed scattering
   */
  wavelengthPower: number;
  
  /**
   * Asymmetry parameter (-1 to 1):
   * - -1 = pure backscatter
   * - 0 = isotropic (equal in all directions)
   * - 1 = pure forward scatter
   */
  asymmetry: number;
}

/**
 * ScatteringResult - calculated blur parameters for a pixel
 */
export interface ScatteringResult {
  /**
   * Gaussian blur sigma in pixels
   * Calculated from: coefficient × depth × refractive_index
   */
  blurSigma: number;
  
  /**
   * Wavelength-dependent blur factor (for Rayleigh)
   * Applied per wavelength during integration
   */
  wavelengthFactor: (wavelength: number) => number;
}

/**
 * Default scattering properties for clear materials
 */
export const NO_SCATTERING: ScatteringProperties = {
  coefficient: 0,
  wavelengthPower: 0,
  asymmetry: 0,
};

/**
 * Rayleigh scattering (clear sky, clean water)
 */
export const RAYLEIGH_SCATTERING: ScatteringProperties = {
  coefficient: 0.1,
  wavelengthPower: 4,
  asymmetry: 0,
};

/**
 * Mie scattering (clouds, fog, milk)
 */
export const MIE_SCATTERING: ScatteringProperties = {
  coefficient: 0.5,
  wavelengthPower: 0,
  asymmetry: 0.8, // Forward scattering
};

/**
 * Calculate blur sigma from scattering properties and optical path
 * @param scattering Scattering properties
 * @param depth Optical path length in cm
 * @param refractiveIndex Material refractive index
 * @returns Blur sigma in pixels
 */
export function calculateBlurSigma(
  scattering: ScatteringProperties,
  depth: number,
  refractiveIndex: number = 1.0
): number {
  if (scattering.coefficient <= 0) {
    return 0;
  }
  
  // Blur increases with depth, scattering coefficient, and refractive index
  // The formula is empirical for visual results
  const baseSigma = scattering.coefficient * depth * refractiveIndex;
  
  // Scale to reasonable pixel values (0-50 pixels typical range)
  return baseSigma * 10;
}

/**
 * Calculate wavelength-dependent scattering factor
 * @param wavelength Wavelength in nm
 * @param scattering Scattering properties
 * @param referenceWavelength Reference wavelength for normalization (default 550nm)
 * @returns Scattering factor (1.0 at reference wavelength)
 */
export function calculateWavelengthFactor(
  wavelength: number,
  scattering: ScatteringProperties,
  referenceWavelength: number = 550
): number {
  if (scattering.wavelengthPower === 0) {
    return 1.0; // Mie scattering is wavelength-independent
  }
  
  // Rayleigh: scattering ∝ λ^-4
  return Math.pow(referenceWavelength / wavelength, scattering.wavelengthPower);
}

