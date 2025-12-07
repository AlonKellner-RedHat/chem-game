import { Molecule } from '../interfaces/Molecule';
import { SolutionProperties } from '../SolutionProperties';

/**
 * Mercury Atom - Sharp lines in UV and visible
 * Temperature affects line width via Doppler broadening
 */
export class MercuryAtom implements Molecule {
  readonly id = 'mercury-atom';
  readonly name = 'Mercury (Hg)';

  // Mercury characteristic lines
  private readonly LINES = [
    { center: 253.7, strength: 15000 }, // Strong UV line
    { center: 365.0, strength: 8000 }, // UV
    { center: 404.7, strength: 6000 }, // Violet
    { center: 435.8, strength: 7000 }, // Blue
    { center: 546.1, strength: 5000 }, // Green
    { center: 577.0, strength: 4000 }, // Yellow
    { center: 579.1, strength: 4000 }, // Yellow
  ];
  private readonly NATURAL_LINEWIDTH = 0.001; // nm
  private readonly REFERENCE_TEMPERATURE = 273; // K (0°C)

  getMolarExtinctionCoefficient(wavelength: number, properties?: SolutionProperties): number {
    let total = 0;
    for (const line of this.LINES) {
      const gamma = this.getLineWidth(line.center, properties);
      const delta = wavelength - line.center;
      const lorentzian = gamma / (Math.PI * (delta * delta + gamma * gamma));
      total += line.strength * lorentzian;
    }
    return total;
  }

  /**
   * Calculate temperature-dependent line width
   * Includes natural width and Doppler broadening
   */
  private getLineWidth(wavelength: number, properties?: SolutionProperties): number {
    if (!properties) {
      return this.NATURAL_LINEWIDTH;
    }

    const temperature = properties.temperature;
    
    // Doppler broadening: FWHM ∝ wavelength * sqrt(T / M)
    // Simplified for visualization: gamma_doppler = natural_width * sqrt(T / T_ref) * (wavelength / reference_wavelength)
    const referenceWavelength = 546.1; // nm (green line, middle of visible range)
    const dopplerFactor = Math.sqrt(temperature / this.REFERENCE_TEMPERATURE) * (wavelength / referenceWavelength);
    
    // Combine natural and Doppler broadening
    const dopplerWidth = this.NATURAL_LINEWIDTH * dopplerFactor * 0.1; // Scaling factor for visualization
    const totalWidth = this.NATURAL_LINEWIDTH + dopplerWidth;
    
    return totalWidth;
  }

  getAbsorptionPeaks(): number[] {
    return this.LINES.map((line) => line.center);
  }

  getAbsorptionBandwidth(peak: number, properties?: SolutionProperties): number {
    const gamma = this.getLineWidth(peak, properties);
    return gamma * 2.35482; // FWHM
  }
}

