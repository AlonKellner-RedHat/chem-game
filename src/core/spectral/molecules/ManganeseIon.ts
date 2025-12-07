import { Molecule } from '../interfaces/Molecule';

/**
 * Manganese Ion (Mn²⁺) for crystal materials
 * Used in some gemstones - weak absorption in green region
 */
export class ManganeseIon implements Molecule {
  readonly id = 'manganese-ion';
  readonly name = 'Manganese Ion (Mn²⁺)';

  // Weak absorption in green region
  private readonly PEAK_WAVELENGTH = 520; // nm (green)
  private readonly PEAK_EXTINCTION = 20; // L/(mol·cm) - weak
  private readonly BANDWIDTH = 80; // nm

  getMolarExtinctionCoefficient(wavelength: number, _properties?: import('../SolutionProperties').SolutionProperties): number {
    // Weak Gaussian absorption
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

