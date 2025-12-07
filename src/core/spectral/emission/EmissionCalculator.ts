import { SpectrumPoint } from '../CIE';

/**
 * EmissionCalculator - calculates net emission considering self-absorption
 * 
 * When a material emits light, some of that light is reabsorbed by the same
 * material (self-absorption). The net emission is:
 * 
 * E_net(λ) = E_base(λ) × (1 - exp(-α(λ) × d)) / (α(λ) × d)
 * 
 * Where:
 * - E_base(λ) = base emission spectrum
 * - α(λ) = absorption coefficient at wavelength λ
 * - d = optical path length (depth)
 * 
 * This formula comes from integrating emission over the path with exponential
 * attenuation - emission from the middle of the material is partially absorbed
 * before reaching the surface.
 */
export class EmissionCalculator {
  /**
   * Calculate net emission spectrum after self-absorption
   * 
   * @param baseEmission Base emission spectrum (before self-absorption)
   * @param absorptionCoefficients Absorption coefficients at each wavelength
   * @param depth Optical path length in cm
   * @returns Net emission spectrum
   */
  static calculateNetEmission(
    baseEmission: SpectrumPoint[],
    absorptionCoefficients: SpectrumPoint[],
    depth: number
  ): SpectrumPoint[] {
    if (depth <= 0) {
      return baseEmission.map(p => ({ ...p })); // No self-absorption
    }
    
    // Create a map of absorption coefficients for quick lookup
    const absorptionMap = new Map<number, number>();
    for (const point of absorptionCoefficients) {
      absorptionMap.set(point.wavelength, point.transmission);
    }
    
    return baseEmission.map(emissionPoint => {
      const wavelength = emissionPoint.wavelength;
      const baseIntensity = emissionPoint.transmission; // Using transmission field for intensity
      
      // Get absorption coefficient (convert transmission to absorption)
      // transmission = exp(-α × d), so α = -ln(transmission) / d
      const transmission = absorptionMap.get(wavelength) ?? 1.0;
      
      // Handle fully transparent case
      if (transmission >= 0.9999) {
        return { wavelength, transmission: baseIntensity };
      }
      
      // Calculate absorption coefficient from transmission
      const alpha = -Math.log(transmission) / depth;
      
      // Apply self-absorption formula
      // E_net = E_base × (1 - exp(-α × d)) / (α × d)
      // Note: (1 - exp(-α × d)) / (α × d) ranges from 1 (no absorption) to 0 (full absorption)
      const alphaD = alpha * depth;
      const selfAbsorptionFactor = (1 - Math.exp(-alphaD)) / alphaD;
      
      // Handle numerical edge cases
      const netIntensity = baseIntensity * (isFinite(selfAbsorptionFactor) ? selfAbsorptionFactor : 1.0);
      
      return { wavelength, transmission: Math.max(0, netIntensity) };
    });
  }
  
  /**
   * Calculate self-absorption factor for a single wavelength
   * 
   * @param transmission Material transmission at this wavelength (0-1)
   * @param depth Optical path length in cm
   * @returns Self-absorption factor (0-1, multiply base emission by this)
   */
  static calculateSelfAbsorptionFactor(transmission: number, depth: number): number {
    if (depth <= 0 || transmission >= 0.9999) {
      return 1.0; // No self-absorption
    }
    
    if (transmission <= 0.0001) {
      return 0.0; // Complete self-absorption
    }
    
    // α = -ln(transmission) / d
    const alpha = -Math.log(transmission) / depth;
    const alphaD = alpha * depth;
    
    // (1 - exp(-αd)) / (αd)
    const factor = (1 - Math.exp(-alphaD)) / alphaD;
    
    return isFinite(factor) ? factor : 1.0;
  }
  
  /**
   * Combine multiple emission sources additively
   * 
   * @param emissions Array of emission spectra
   * @returns Combined emission spectrum
   */
  static combineEmissions(emissions: SpectrumPoint[][]): SpectrumPoint[] {
    if (emissions.length === 0) {
      return [];
    }
    
    if (emissions.length === 1) {
      return emissions[0].map(p => ({ ...p }));
    }
    
    // Use the first emission's wavelengths as reference
    const reference = emissions[0];
    
    return reference.map((refPoint, index) => {
      const wavelength = refPoint.wavelength;
      
      // Sum intensities from all emission sources
      let totalIntensity = 0;
      for (const emission of emissions) {
        if (index < emission.length) {
          totalIntensity += emission[index].transmission;
        }
      }
      
      return { wavelength, transmission: totalIntensity };
    });
  }
  
  /**
   * Scale emission spectrum by a factor (e.g., aura intensity)
   * 
   * @param emission Emission spectrum
   * @param factor Scale factor (0-1 for aura falloff)
   * @returns Scaled emission spectrum
   */
  static scaleEmission(emission: SpectrumPoint[], factor: number): SpectrumPoint[] {
    return emission.map(p => ({
      wavelength: p.wavelength,
      transmission: p.transmission * factor,
    }));
  }
  
  /**
   * Check if an emission spectrum has any significant emission
   * 
   * @param emission Emission spectrum
   * @param threshold Minimum intensity to consider significant
   * @returns True if emission is significant
   */
  static hasSignificantEmission(emission: SpectrumPoint[], threshold: number = 1e-6): boolean {
    return emission.some(p => p.transmission > threshold);
  }
}

