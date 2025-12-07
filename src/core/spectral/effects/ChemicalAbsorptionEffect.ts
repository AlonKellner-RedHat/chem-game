import { SpectralEffect } from '../interfaces/SpectralEffect';
import { SolutionProperties } from '../SolutionProperties';
import { Material } from '../interfaces/Material';

/**
 * ChemicalAbsorptionEffect implements Beer-Lambert law for chemical absorption
 * A(λ) = Σ(ε_i(λ) × c_i × l)
 * where ε is molar extinction coefficient, c is concentration, l is path length
 */
export class ChemicalAbsorptionEffect implements SpectralEffect {
  readonly id = 'chemical-absorption';
  readonly name = 'Chemical Absorption';

  apply(
    wavelength: number,
    properties: SolutionProperties,
    material: Material
  ): number {
    let totalAbsorbance = 0;

    // Sum absorption from all molecules
    for (const molecule of material.molecules) {
      const concentration = properties.moleculeConcentrations.get(molecule.id) || 0;
      
      if (concentration > 0) {
        const epsilon = molecule.getMolarExtinctionCoefficient(wavelength, properties);
        // Beer-Lambert: A = ε × c × l
        // Note: epsilon is typically in L/(mol·cm), so depth must be in cm
        // properties.depth is in meters, so convert: depth_cm = depth_m * 100
        const depthCm = properties.depth * 100;
        const absorbance = epsilon * concentration * depthCm;
        totalAbsorbance += absorbance;
      }
    }

    // Convert absorbance to transmission: T = 10^(-A)
    const transmission = Math.pow(10, -totalAbsorbance);
    return transmission;
  }

  getType(): 'absorption' {
    return 'absorption';
  }

  getPriority(): number {
    return 10; // Applied early in the chain
  }
}

