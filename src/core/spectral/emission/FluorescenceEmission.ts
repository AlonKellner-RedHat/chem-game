import { SpectrumPoint } from '../CIE';
import { EmissionSpectrum, EmissionProperties } from './EmissionSpectrum';

/**
 * FluorescenceConfig - configuration for a fluorescent material
 */
export interface FluorescenceConfig {
  id: string;
  name: string;
  
  /** Peak excitation wavelength in nm (typically UV) */
  excitationPeak: number;
  
  /** Excitation bandwidth (FWHM) in nm */
  excitationWidth: number;
  
  /** Peak emission wavelength in nm (typically visible) */
  emissionPeak: number;
  
  /** Emission bandwidth (FWHM) in nm */
  emissionWidth: number;
  
  /** Quantum yield: fraction of absorbed photons that cause emission (0-1) */
  quantumYield: number;
}

/**
 * FluorescenceEmission - implements UV absorption and visible re-emission
 * 
 * Fluorescence occurs when a material:
 * 1. Absorbs UV photons (excitation)
 * 2. Undergoes electronic transition
 * 3. Re-emits at longer wavelength (Stokes shift)
 * 
 * The emission intensity depends on:
 * - Excitation intensity at the absorption wavelengths
 * - Quantum yield (efficiency of photon conversion)
 * - Concentration of fluorophore
 * 
 * Examples:
 * - Sodium D-lines: 330nm excitation → 589nm emission
 * - Fluorescein: 490nm excitation → 520nm emission
 * - Quinine: 350nm excitation → 450nm emission
 */
export class FluorescenceEmission implements EmissionSpectrum {
  readonly id: string;
  readonly name: string;
  
  private readonly excitationPeak: number;
  private readonly emissionPeak: number;
  private readonly quantumYield: number;
  
  // Pre-computed Gaussian parameters
  private readonly excitationSigma: number;
  private readonly emissionSigma: number;
  
  constructor(config: FluorescenceConfig) {
    this.id = config.id;
    this.name = config.name;
    this.excitationPeak = config.excitationPeak;
    this.emissionPeak = config.emissionPeak;
    this.quantumYield = Math.max(0, Math.min(1, config.quantumYield));
    
    // Convert FWHM to sigma: FWHM = 2.355 × σ
    this.excitationSigma = config.excitationWidth / 2.355;
    this.emissionSigma = config.emissionWidth / 2.355;
  }
  
  /**
   * Get the excitation efficiency at a specific wavelength
   * Returns 0-1 indicating how efficiently this wavelength excites fluorescence
   * 
   * @param wavelength Excitation wavelength in nm
   * @returns Excitation efficiency (0-1)
   */
  getExcitationEfficiency(wavelength: number): number {
    return this.gaussian(wavelength, this.excitationPeak, this.excitationSigma);
  }
  
  /**
   * Get the emission spectrum at a given excitation intensity
   * 
   * @param excitationIntensity Total excitation intensity (0-1 normalized)
   * @param minWavelength Minimum emission wavelength in nm
   * @param maxWavelength Maximum emission wavelength in nm
   * @param numPoints Number of spectrum points
   * @returns Emission spectrum
   */
  getEmission(
    excitationIntensity: number,
    minWavelength: number = 380,
    maxWavelength: number = 700,
    numPoints: number = 100
  ): SpectrumPoint[] {
    const spectrum: SpectrumPoint[] = [];
    const step = (maxWavelength - minWavelength) / (numPoints - 1);
    
    // No emission without excitation
    if (excitationIntensity <= 0) {
      for (let i = 0; i < numPoints; i++) {
        const wavelength = minWavelength + i * step;
        spectrum.push({ wavelength, transmission: 0 });
      }
      return spectrum;
    }
    
    // Emission intensity scales with excitation and quantum yield
    const maxEmission = excitationIntensity * this.quantumYield;
    
    for (let i = 0; i < numPoints; i++) {
      const wavelength = minWavelength + i * step;
      const emissionProfile = this.gaussian(wavelength, this.emissionPeak, this.emissionSigma);
      const intensity = maxEmission * emissionProfile;
      spectrum.push({ wavelength, transmission: intensity });
    }
    
    return spectrum;
  }
  
  /**
   * Get emission intensity at a specific wavelength
   * 
   * @param wavelength Emission wavelength in nm
   * @param excitationIntensity Total excitation intensity
   * @returns Emission intensity
   */
  getEmissionAt(wavelength: number, excitationIntensity: number): number {
    if (excitationIntensity <= 0) {
      return 0;
    }
    
    const emissionProfile = this.gaussian(wavelength, this.emissionPeak, this.emissionSigma);
    return excitationIntensity * this.quantumYield * emissionProfile;
  }
  
  /**
   * Check if fluorescence is active (has excitation)
   * 
   * @param excitationIntensity Excitation intensity
   * @returns True if emission is expected
   */
  isActive(excitationIntensity: number, _properties?: EmissionProperties): boolean {
    return excitationIntensity > 0;
  }
  
  /**
   * Get the Stokes shift (difference between emission and excitation peaks)
   * Positive value indicates energy loss (normal fluorescence)
   * 
   * @returns Stokes shift in nm
   */
  getStokesShift(): number {
    return this.emissionPeak - this.excitationPeak;
  }
  
  /**
   * Get excitation peak wavelength
   */
  getExcitationPeak(): number {
    return this.excitationPeak;
  }
  
  /**
   * Get emission peak wavelength
   */
  getEmissionPeak(): number {
    return this.emissionPeak;
  }
  
  /**
   * Get quantum yield
   */
  getQuantumYield(): number {
    return this.quantumYield;
  }
  
  /**
   * Gaussian function for spectral profiles
   * 
   * @param x Wavelength
   * @param mu Peak wavelength
   * @param sigma Standard deviation
   * @returns Gaussian value (0-1, normalized to peak=1)
   */
  private gaussian(x: number, mu: number, sigma: number): number {
    const exponent = -Math.pow(x - mu, 2) / (2 * sigma * sigma);
    return Math.exp(exponent);
  }
  
  // EmissionSpectrum interface implementation
  
  getBaseEmission(_temperature: number, properties?: EmissionProperties): SpectrumPoint[] {
    const excitationIntensity = properties?.excitationIntensity ?? 0;
    return this.getEmission(excitationIntensity);
  }
  
  getEmissionAtWavelength(wavelength: number, _temperature: number, properties?: EmissionProperties): number {
    const excitationIntensity = properties?.excitationIntensity ?? 0;
    return this.getEmissionAt(wavelength, excitationIntensity);
  }
}

/**
 * Pre-defined fluorophores for common materials
 */
export const SODIUM_D_LINES: FluorescenceConfig = {
  id: 'sodium-d',
  name: 'Sodium D-lines',
  excitationPeak: 330,
  excitationWidth: 50,
  emissionPeak: 589,
  emissionWidth: 2,
  quantumYield: 0.95,
};

export const FLUORESCEIN: FluorescenceConfig = {
  id: 'fluorescein',
  name: 'Fluorescein',
  excitationPeak: 490,
  excitationWidth: 30,
  emissionPeak: 520,
  emissionWidth: 30,
  quantumYield: 0.92,
};

export const QUININE: FluorescenceConfig = {
  id: 'quinine',
  name: 'Quinine',
  excitationPeak: 350,
  excitationWidth: 30,
  emissionPeak: 450,
  emissionWidth: 50,
  quantumYield: 0.55,
};

