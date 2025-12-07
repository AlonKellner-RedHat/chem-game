import { Molecule } from '../interfaces/Molecule';

/**
 * Iron/Titanium Ion pair (Fe²⁺/Ti⁴⁺) for crystal materials
 * Used in sapphires - intervalence charge transfer absorbs red/yellow, transmits blue
 */
export class IronTitaniumIon implements Molecule {
  readonly id = 'iron-titanium-ion';
  readonly name = 'Iron/Titanium Ion (Fe²⁺/Ti⁴⁺)';

  // Charge transfer band in red/yellow region
  private readonly PEAK_WAVELENGTH = 580; // nm (yellow)
  private readonly PEAK_EXTINCTION = 150; // L/(mol·cm)
  private readonly BANDWIDTH = 150; // nm (broad band)

  getMolarExtinctionCoefficient(wavelength: number, _properties?: import('../SolutionProperties').SolutionProperties): number {
    // Broad Gaussian absorption
    const diff = wavelength - this.PEAK_WAVELENGTH;
    const sigma = this.BANDWIDTH / 2.35482;
    return this.PEAK_EXTINCTION * Math.exp(-0.5 * Math.pow(diff / sigma, 2));
  }

  getAbsorptionPeaks(): number[] {
    return [this.PEAK_WAVELENGTH];
  }

  getAbsorptionBandwidth(peak: number, _properties?: import('../SolutionProperties').SolutionProperties): number {
    if (peak === this.PEAK_WAVELENGTH) {
      return this.BANDWIDTH;
    }
    return 0;
  }
}

