import { SpectrumPoint } from '../CIE';

/**
 * EmissionSpectrum interface - represents a source of light emission
 * 
 * OCP: New emission types (black body, fluorescence, phosphorescence)
 * can be added by implementing this interface without modifying existing code.
 */
export interface EmissionSpectrum {
  readonly id: string;
  readonly name: string;
  
  /**
   * Get the base emission spectrum before self-absorption
   * @param temperature Temperature in Kelvin
   * @param properties Additional properties (e.g., concentrations)
   * @returns Array of spectrum points with emission intensity
   */
  getBaseEmission(temperature: number, properties?: EmissionProperties): SpectrumPoint[];
  
  /**
   * Get emission intensity at a specific wavelength
   * @param wavelength Wavelength in nm
   * @param temperature Temperature in Kelvin
   * @param properties Additional properties
   * @returns Emission intensity (arbitrary units, will be normalized)
   */
  getEmissionAt(wavelength: number, temperature: number, properties?: EmissionProperties): number;
  
  /**
   * Check if this emission source is active (e.g., above threshold temperature)
   * @param temperature Temperature in Kelvin
   * @param properties Additional properties
   */
  isActive(temperature: number, properties?: EmissionProperties): boolean;
}

/**
 * EmissionProperties - properties that affect emission behavior
 */
export interface EmissionProperties {
  // For black body radiation
  emissivity?: number;         // 0-1, how much like an ideal black body
  
  // For fluorescence
  quantumYield?: number;       // 0-1, fraction of absorbed photons that cause emission
  excitationIntensity?: number; // Intensity of excitation light (UV)
  
  // For aura rendering
  auraRadius?: number;         // Pixels for glow falloff
  auraDecay?: number;          // Exponential decay rate (1/pixels)
  
  // Molecule concentrations for chemical emission
  concentrations?: Map<string, number>;
}

/**
 * EmissionResult - the calculated emission for a pixel
 */
export interface EmissionResult {
  spectrum: SpectrumPoint[];   // Net emission spectrum after self-absorption
  auraIntensity: number;       // 0-1, falloff factor for aura (1.0 inside shape)
}

/**
 * Type of emission source
 */
export type EmissionType = 'thermal' | 'fluorescence' | 'phosphorescence' | 'chemical';

