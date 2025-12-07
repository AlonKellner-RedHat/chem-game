import { Molecule } from '../interfaces/Molecule';

/**
 * Potassium Permanganate (KMnO4) molecule
 * Characteristic purple color due to absorption in green region
 */
export class PotassiumPermanganate implements Molecule {
  readonly id = 'potassium-permanganate';
  readonly name = 'Potassium Permanganate';

  // Main absorption peak around 525nm (green region)
  private readonly PEAK_WAVELENGTH = 525; // nm
  private readonly PEAK_EXTINCTION = 2000; // L/(mol·cm) - very strong absorption
  private readonly BANDWIDTH = 80; // nm

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

