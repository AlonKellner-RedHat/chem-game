import { Molecule } from '../interfaces/Molecule';

/**
 * Copper Sulfate (CuSO4) molecule
 * Characteristic blue color due to absorption in red/orange region
 */
export class CopperSulfate implements Molecule {
  readonly id = 'copper-sulfate';
  readonly name = 'Copper Sulfate';

  // Main absorption peak around 800nm (red/orange region)
  private readonly PEAK_WAVELENGTH = 800; // nm
  private readonly PEAK_EXTINCTION = 50; // L/(mol·cm)
  private readonly BANDWIDTH = 100; // nm

  getMolarExtinctionCoefficient(wavelength: number, _properties?: import('../SolutionProperties').SolutionProperties): number {
    // Gaussian absorption profile
    const diff = wavelength - this.PEAK_WAVELENGTH;
    const sigma = this.BANDWIDTH / 2.35482; // Convert FWHM to sigma
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

