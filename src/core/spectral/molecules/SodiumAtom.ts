import { Molecule } from "../interfaces/Molecule";
import { SolutionProperties } from "../SolutionProperties";

/**
 * Sodium Atom - Sharp emission/absorption line at 589nm (D-line)
 * Classic example of Fraunhofer lines
 * Temperature affects line width via Doppler broadening
 */
export class SodiumAtom implements Molecule {
  readonly id = "sodium-atom";
  readonly name = "Sodium (Na)";

  // D-line doublet: 589.0nm and 589.6nm
  private readonly LINE1_CENTER = 589.0; // nm
  private readonly LINE2_CENTER = 589.6; // nm
  private readonly PEAK_STRENGTH = 10000; // Very strong
  private readonly NATURAL_LINEWIDTH = 0.001; // nm (very sharp in vacuum)

  getMolarExtinctionCoefficient(
    wavelength: number,
    properties?: SolutionProperties
  ): number {
    const gamma = this.getLineWidth(wavelength, properties);
    // Lorentzian line shape for each line
    const line1 = this.lorentzian(wavelength, this.LINE1_CENTER, gamma);
    const line2 = this.lorentzian(wavelength, this.LINE2_CENTER, gamma);
    return this.PEAK_STRENGTH * (line1 + line2);
  }

  private lorentzian(
    wavelength: number,
    center: number,
    gamma: number
  ): number {
    const delta = wavelength - center;
    return gamma / (Math.PI * (delta * delta + gamma * gamma));
  }

  /**
   * Calculate temperature-dependent line width
   * Includes natural width and Doppler broadening
   * Doppler broadening FWHM: Δλ = (2λ/c) * sqrt(2kT*ln(2)/m)
   * For sodium at 589nm, this gives ~0.0026nm at 273K
   */
  private getLineWidth(
    wavelength: number,
    properties?: SolutionProperties
  ): number {
    if (!properties) {
      return this.NATURAL_LINEWIDTH;
    }

    const temperature = properties.temperature;

    // Handle 0K case (no thermal broadening)
    if (temperature <= 0) {
      return this.NATURAL_LINEWIDTH;
    }

    // Physical constants
    const c = 2.99792458e8; // Speed of light (m/s)
    const k = 1.380649e-23; // Boltzmann constant (J/K)
    const m = 22.989769 * 1.6605390666e-27; // Sodium atomic mass (kg)
    const ln2 = Math.log(2);

    // Convert wavelength to meters
    const lambdaM = wavelength * 1e-9;

    // Doppler broadening FWHM in meters: Δλ = (2λ/c) * sqrt(2kT*ln(2)/m)
    const dopplerFWHM_M =
      ((2 * lambdaM) / c) * Math.sqrt((2 * k * temperature * ln2) / m);

    // Convert to nanometers
    const dopplerFWHM_nm = dopplerFWHM_M * 1e9;

    // Convert FWHM to Lorentzian half-width (gamma)
    // For Lorentzian: FWHM = 2*gamma, so gamma = FWHM/2
    const dopplerGamma = dopplerFWHM_nm / 2;

    // Combine natural and Doppler broadening
    // Use quadrature addition: total_gamma = sqrt(natural^2 + doppler^2)
    // This is physically correct for independent broadening mechanisms
    const totalWidth = Math.sqrt(
      this.NATURAL_LINEWIDTH * this.NATURAL_LINEWIDTH +
        dopplerGamma * dopplerGamma
    );

    return totalWidth;
  }

  getAbsorptionPeaks(): number[] {
    return [this.LINE1_CENTER, this.LINE2_CENTER];
  }

  getAbsorptionBandwidth(
    _peak: number,
    properties?: SolutionProperties
  ): number {
    // Use average wavelength for line width calculation
    const avgWavelength = (this.LINE1_CENTER + this.LINE2_CENTER) / 2;
    const gamma = this.getLineWidth(avgWavelength, properties);
    return gamma * 2.35482; // FWHM
  }
}
