import { Molecule } from '../interfaces/Molecule';
import { SolutionProperties } from '../SolutionProperties';

/**
 * Neon Atom - Multiple sharp emission lines in red/orange region
 * Temperature affects line width via Doppler broadening
 */
export class NeonAtom implements Molecule {
  readonly id = 'neon-atom';
  readonly name = 'Neon (Ne)';

  // Characteristic neon lines
  private readonly LINES = [
    { center: 585.2, strength: 8000 },
    { center: 588.2, strength: 6000 },
    { center: 594.5, strength: 7000 },
    { center: 597.6, strength: 5000 },
    { center: 603.0, strength: 6000 },
    { center: 607.4, strength: 5000 },
    { center: 614.3, strength: 4000 },
    { center: 616.4, strength: 4000 },
    { center: 621.7, strength: 3000 },
    { center: 626.7, strength: 3000 },
    { center: 633.4, strength: 2000 },
    { center: 638.3, strength: 2000 },
    { center: 640.2, strength: 2000 },
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
    const referenceWavelength = 620; // nm (middle of neon line range)
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

