import { Material } from '../interfaces/Material';
import { SpectralEffect } from '../interfaces/SpectralEffect';

/**
 * Base class for materials providing common functionality
 */
export abstract class BaseMaterial implements Material {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly bandGap: number;
  abstract readonly uvCutoff: number;
  abstract readonly molecules: Material['molecules'];
  abstract getEffects(): SpectralEffect[];

  /**
   * Default refractive index (can be overridden)
   * Simple dispersion formula: n(λ) = A + B/λ²
   */
  refractiveIndex(wavelength: number): number {
    // Standard glass-like dispersion
    const A = 1.5;
    const B = 10000; // nm²
    return A + B / (wavelength * wavelength);
  }

  /**
   * Base transmission - transparent above UV cutoff
   */
  baseTransmission(wavelength: number): number {
    return wavelength > this.uvCutoff ? 1.0 : 0.0;
  }
}

