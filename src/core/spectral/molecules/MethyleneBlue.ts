import { Molecule } from '../interfaces/Molecule';

/**
 * Methylene Blue molecule
 * Characteristic blue color due to absorption in orange/red region
 */
export class MethyleneBlue implements Molecule {
  readonly id = 'methylene-blue';
  readonly name = 'Methylene Blue';

  // Main absorption peak around 665nm (red region)
  private readonly PEAK_WAVELENGTH = 665; // nm
  private readonly PEAK_EXTINCTION = 80000; // L/(mol·cm) - extremely strong
  private readonly BANDWIDTH = 50; // nm

  getMolarExtinctionCoefficient(wavelength: number, _properties?: import('../SolutionProperties').SolutionProperties): number {
    // Gaussian absorption profile
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

