import { SolutionProperties } from '../SolutionProperties';

/**
 * Molecule interface defining the absorption characteristics of a chemical molecule
 * Molecules are extensible and can be added to materials
 */
export interface Molecule {
  readonly id: string;
  readonly name: string;

  // Absorption characteristics
  // Optional properties parameter for temperature-dependent broadening (e.g., Doppler broadening)
  getMolarExtinctionCoefficient(wavelength: number, properties?: SolutionProperties): number; // ε(λ) in L/(mol·cm)
  getAbsorptionPeaks(): number[]; // nm
  getAbsorptionBandwidth(peak: number, properties?: SolutionProperties): number; // nm
}

