import { SpectrumPoint } from '../CIE';

/**
 * AuraConfig - configuration for emission aura rendering
 */
export interface AuraConfig {
  /** Maximum radius of the aura in pixels */
  radius: number;
  
  /** Exponential decay rate (1/pixels) - higher = faster falloff */
  decay: number;
}

/**
 * Default aura configuration
 */
export const DEFAULT_AURA_CONFIG: AuraConfig = {
  radius: 20,
  decay: 0.15, // Intensity falls to ~5% at radius
};

/**
 * EmissionAuraCalculator - calculates emission glow effects around shapes
 * 
 * Auras create a soft glow around emitting objects:
 * - Inside shape: full emission intensity
 * - At edge: full emission intensity
 * - Outside shape: exponential decay with distance
 * 
 * Multiple shapes' auras blend additively, creating overlapping glows
 * where adjacent shapes meet.
 * 
 * IMPORTANT: Auras only affect emission, NOT absorption.
 * Absorption is strictly determined by whether a pixel is inside a shape.
 */
export class EmissionAuraCalculator {
  private readonly config: AuraConfig;
  
  constructor(config: Partial<AuraConfig> = {}) {
    this.config = { ...DEFAULT_AURA_CONFIG, ...config };
  }
  
  /**
   * Get aura intensity at a signed distance from shape boundary
   * 
   * @param signedDistance Positive = inside shape, negative = outside shape
   * @returns Intensity factor (0-1)
   */
  getIntensity(signedDistance: number): number {
    // Inside shape (positive or zero distance): full intensity
    if (signedDistance >= 0) {
      return 1.0;
    }
    
    // Outside shape (negative distance)
    const outsideDistance = -signedDistance;
    
    // Beyond aura radius: no intensity
    if (outsideDistance > this.config.radius) {
      return 0;
    }
    
    // Exponential decay: intensity = exp(-distance × decay)
    return Math.exp(-outsideDistance * this.config.decay);
  }
  
  /**
   * Scale an emission spectrum by the aura intensity at a given distance
   * 
   * @param emission Base emission spectrum
   * @param signedDistance Signed distance from shape boundary
   * @returns Scaled emission spectrum
   */
  scaleEmission(emission: SpectrumPoint[], signedDistance: number): SpectrumPoint[] {
    const intensity = this.getIntensity(signedDistance);
    
    return emission.map(point => ({
      wavelength: point.wavelength,
      transmission: point.transmission * intensity,
    }));
  }
  
  /**
   * Blend aura intensities from multiple shapes
   * Auras are additive but clamped to 1.0
   * 
   * @param intensities Array of aura intensities from different shapes
   * @returns Blended intensity (0-1)
   */
  blendAuras(intensities: number[]): number {
    if (intensities.length === 0) {
      return 0;
    }
    
    const sum = intensities.reduce((acc, val) => acc + val, 0);
    return Math.min(1.0, sum);
  }
  
  /**
   * Combine emission spectra from multiple sources (additive)
   * 
   * @param emissions Array of emission spectra
   * @returns Combined emission spectrum
   */
  combineEmissions(emissions: SpectrumPoint[][]): SpectrumPoint[] {
    if (emissions.length === 0) {
      return [];
    }
    
    if (emissions.length === 1) {
      return emissions[0].map(p => ({ ...p }));
    }
    
    // Use first emission as reference for wavelengths
    const reference = emissions[0];
    
    return reference.map((refPoint, index) => {
      let totalIntensity = 0;
      
      for (const emission of emissions) {
        if (index < emission.length) {
          totalIntensity += emission[index].transmission;
        }
      }
      
      return {
        wavelength: refPoint.wavelength,
        transmission: totalIntensity,
      };
    });
  }
  
  /**
   * Check if aura affects absorption (it doesn't)
   * Auras only affect emission - absorption is shape-boundary based
   * 
   * @param _signedDistance Distance from shape (unused, always returns false)
   * @returns Always false - auras don't affect absorption
   */
  affectsAbsorption(_signedDistance: number): boolean {
    return false;
  }
  
  /**
   * Get the current configuration
   */
  getConfig(): AuraConfig {
    return { ...this.config };
  }
  
  /**
   * Calculate the distance at which intensity falls below a threshold
   * 
   * @param threshold Minimum intensity threshold (default 0.01)
   * @returns Distance in pixels where intensity falls below threshold
   */
  getEffectiveRadius(threshold: number = 0.01): number {
    // intensity = exp(-d × decay) = threshold
    // -d × decay = ln(threshold)
    // d = -ln(threshold) / decay
    if (this.config.decay <= 0) {
      return this.config.radius;
    }
    
    const calculatedRadius = -Math.log(threshold) / this.config.decay;
    return Math.min(calculatedRadius, this.config.radius);
  }
  
  /**
   * Get aura contribution for a pixel from multiple shapes
   * Each shape provides its signed distance to the pixel
   * 
   * @param signedDistances Array of signed distances from each shape
   * @returns Blended aura intensity (0-1)
   */
  getBlendedIntensity(signedDistances: number[]): number {
    const intensities = signedDistances.map(d => this.getIntensity(d));
    return this.blendAuras(intensities);
  }
}

