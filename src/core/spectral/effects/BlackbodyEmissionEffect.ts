import { SpectralEffect } from '../interfaces/SpectralEffect';
import { SolutionProperties } from '../SolutionProperties';
import { Material } from '../interfaces/Material';

/**
 * BlackbodyEmissionEffect implements Planck's law for thermal emission
 * Only emits at temperatures above the Draper point (798K)
 */
export class BlackbodyEmissionEffect implements SpectralEffect {
  readonly id = 'blackbody-emission';
  readonly name = 'Blackbody Emission';

  // Draper point: temperature at which objects start to glow visibly
  private readonly DRAPER_POINT = 798; // Kelvin

  // Physical constants
  private readonly PLANCK = 6.626e-34; // J·s
  private readonly SPEED_OF_LIGHT = 2.998e8; // m/s
  private readonly BOLTZMANN = 1.381e-23; // J/K

  apply(
    wavelength: number,
    properties: SolutionProperties,
    _material: Material
  ): number {
    if (properties.temperature < this.DRAPER_POINT) {
      return 1.0; // No emission below threshold
    }

    // Convert wavelength from nm to meters
    const lambda = wavelength * 1e-9; // m

    // Planck's law: B(λ, T) = (2πhc²/λ⁵) / (e^(hc/λkT) - 1)
    const hc = this.PLANCK * this.SPEED_OF_LIGHT;
    const hcOverLambda = hc / lambda;
    const kT = this.BOLTZMANN * properties.temperature;

    const exponent = hcOverLambda / kT;
    const denominator = Math.exp(exponent) - 1;

    // Spectral radiance (simplified, normalized)
    const spectralRadiance = 1.0 / (Math.pow(lambda, 5) * denominator);

    // Normalize and convert to emission factor
    // At very high temperatures, emission can be significant
    // Scale to reasonable range (1.0 = no emission, >1.0 = emission)
    const emissionFactor = 1.0 + spectralRadiance * 1e-20; // Scaling factor

    return Math.min(emissionFactor, 10.0); // Cap at reasonable maximum
  }

  getType(): 'emission' {
    return 'emission';
  }

  getPriority(): number {
    return 30; // Applied last (emission is additive)
  }
}

