import { SpectralEffect } from '../interfaces/SpectralEffect';
import { SolutionProperties } from '../SolutionProperties';
import { Material } from '../interfaces/Material';

/**
 * ParticleScatteringEffect implements Rayleigh/Mie scattering
 * A_scat(λ) = β × λ^(-n)
 * where n = 4 for Rayleigh (small particles), n = 0-2 for Mie (large particles)
 */
export class ParticleScatteringEffect implements SpectralEffect {
  readonly id = 'particle-scattering';
  readonly name = 'Particle Scattering';

  // Threshold for Rayleigh vs Mie scattering (wavelength in nm)
  private readonly RAYLEIGH_THRESHOLD = 100; // nm

  apply(
    wavelength: number,
    properties: SolutionProperties,
    _material: Material
  ): number {
    if (properties.particleDensity <= 0) {
      return 1.0; // No particles = no scattering
    }

    // Determine scattering exponent based on particle size
    let exponent: number;
    if (properties.particleSize < this.RAYLEIGH_THRESHOLD) {
      // Rayleigh scattering: n ≈ 4
      exponent = 4;
    } else {
      // Mie scattering: n ≈ 0-2 (use 1.5 as average)
      exponent = 1.5;
    }

    // Scattering coefficient: β ∝ particle density
    const beta = properties.particleDensity * 0.1; // Scaling factor

    // Scattering absorbance: A_scat = β × λ^(-n)
    const scatteringAbsorbance = beta * Math.pow(wavelength, -exponent);

    // Convert to transmission
    const transmission = Math.pow(10, -scatteringAbsorbance);
    return transmission;
  }

  getType(): 'scattering' {
    return 'scattering';
  }

  getPriority(): number {
    return 20; // Applied after chemical absorption
  }
}

