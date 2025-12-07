import { Molecule } from '../interfaces/Molecule';

/**
 * Chromium Ion (Cr³⁺) for crystal materials
 * Used in rubies - absorbs green/violet, transmits red
 */
export class ChromiumIon implements Molecule {
  readonly id = 'chromium-ion';
  readonly name = 'Chromium Ion (Cr³⁺)';

  // Two main absorption bands for Cr³⁺ in corundum
  private readonly PEAK1_WAVELENGTH = 550; // nm (green)
  private readonly PEAK2_WAVELENGTH = 400; // nm (violet)
  private readonly PEAK_EXTINCTION = 100; // L/(mol·cm)
  private readonly BANDWIDTH = 100; // nm

  getMolarExtinctionCoefficient(wavelength: number, _properties?: import('../SolutionProperties').SolutionProperties): number {
    // Two Gaussian peaks
    const diff1 = wavelength - this.PEAK1_WAVELENGTH;
    const diff2 = wavelength - this.PEAK2_WAVELENGTH;
    const sigma = this.BANDWIDTH / 2.35482;
    
    const peak1 = this.PEAK_EXTINCTION * Math.exp(-0.5 * Math.pow(diff1 / sigma, 2));
    const peak2 = this.PEAK_EXTINCTION * Math.exp(-0.5 * Math.pow(diff2 / sigma, 2));
    
    return peak1 + peak2;
  }

  getAbsorptionPeaks(): number[] {
    return [this.PEAK1_WAVELENGTH, this.PEAK2_WAVELENGTH];
  }

  getAbsorptionBandwidth(peak: number, _properties?: import('../SolutionProperties').SolutionProperties): number {
    if (peak === this.PEAK1_WAVELENGTH || peak === this.PEAK2_WAVELENGTH) {
      return this.BANDWIDTH;
    }
    return 0;
  }
}

