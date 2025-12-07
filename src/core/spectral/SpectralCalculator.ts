import { Material } from './interfaces/Material';
import { SolutionProperties } from './SolutionProperties';

/**
 * SpectralCalculator composes multiple effects to calculate spectral transmission
 * Effects are applied in priority order (lower priority = applied first)
 */
export class SpectralCalculator {
  /**
   * Calculate transmission at a specific wavelength
   * @param wavelength Wavelength in nanometers
   * @param material The material with its effects
   * @param properties Solution properties (concentrations, temperature, etc.)
   * @returns Transmission factor (0-1 for absorption, >1 for emission)
   */
  calculateTransmission(
    wavelength: number,
    material: Material,
    properties: SolutionProperties
  ): number {
    // Start with base transmission (UV cutoff applied here)
    let transmission = material.baseTransmission(wavelength);
    
    // If UV cutoff blocks this wavelength, return 0 immediately
    if (transmission === 0) {
      return 0;
    }

    // Get effects from material
    const effects = material.getEffects();

    // Sort effects by priority (lower = applied first)
    const sortedEffects = [...effects].sort((a, b) => a.getPriority() - b.getPriority());

    // Apply each effect in order
    for (const effect of sortedEffects) {
      const factor = effect.apply(wavelength, properties, material);
      transmission *= factor;
    }

    return transmission;
  }

  /**
   * Calculate full spectrum (5334 frequencies from 200-1000nm, ~0.15nm resolution)
   * Used for high-resolution analysis (mouse hover)
   * Resolution chosen to resolve sodium D-line doublet (0.6nm separation) with room for smearing
   */
  calculateFullSpectrum(
    material: Material,
    properties: SolutionProperties
  ): Array<{ wavelength: number; transmission: number }> {
    const spectrum: Array<{ wavelength: number; transmission: number }> = [];
    const minWavelength = 200; // nm
    const maxWavelength = 1000; // nm
    // Resolution: ~0.15nm per point to resolve 0.6nm line separation with at least one point between
    const numFrequencies = 5334; // (1000-200)/0.15 + 1 ≈ 5334

    for (let i = 0; i < numFrequencies; i++) {
      // Ensure last value is exactly maxWavelength
      const wavelength = i === numFrequencies - 1
        ? maxWavelength
        : minWavelength + (i / (numFrequencies - 1)) * (maxWavelength - minWavelength);
      const transmission = this.calculateTransmission(wavelength, material, properties);
      spectrum.push({ wavelength, transmission });
    }

    return spectrum;
  }

  /**
   * Calculate RGB approximation spectrum (~100 key wavelengths)
   * Used for visual rendering
   */
  calculateRGBSpectrum(
    material: Material,
    properties: SolutionProperties
  ): Array<{ wavelength: number; transmission: number }> {
    const spectrum: Array<{ wavelength: number; transmission: number }> = [];
    const minWavelength = 200; // nm
    const maxWavelength = 1000; // nm
    const numFrequencies = 100;

    for (let i = 0; i < numFrequencies; i++) {
      // Ensure last value is exactly maxWavelength
      const wavelength = i === numFrequencies - 1
        ? maxWavelength
        : minWavelength + (i / (numFrequencies - 1)) * (maxWavelength - minWavelength);
      const transmission = this.calculateTransmission(wavelength, material, properties);
      spectrum.push({ wavelength, transmission });
    }

    return spectrum;
  }
}

