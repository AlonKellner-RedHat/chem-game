import { Material } from '../interfaces/Material';
import { SolutionProperties } from '../SolutionProperties';
import { SpectralCalculator } from '../SpectralCalculator';
// import { SpectrumPoint } from '../CIE'; // Not used

/**
 * MaterialTextureGenerator pre-calculates material transmission spectra as 1D textures
 * for GPU rendering. Textures are updated only when material properties change.
 * 
 * Texture format: 1D texture (width = wavelength samples, height = 1)
 * - X coordinate: Normalized wavelength (0.0 = 200nm, 1.0 = 1000nm)
 * - R channel: Transmission value (0.0 = fully absorbed, 1.0 = fully transparent)
 * - Resolution: 200 samples (sufficient for visual rendering)
 */
export class MaterialTextureGenerator {
  private readonly calculator: SpectralCalculator;
  private readonly resolution: number;

  constructor(resolution: number = 200) {
    this.calculator = new SpectralCalculator();
    this.resolution = resolution;
  }

  /**
   * Generate 1D texture data for material transmission spectrum
   * @param material Material to calculate
   * @param properties Current solution properties
   * @returns Float32Array ready for WebGL texture upload (200 samples)
   */
  generateMaterialTexture(
    material: Material,
    properties: SolutionProperties
  ): Float32Array {
    // Calculate spectrum at reduced resolution for GPU rendering
    const spectrum = this.calculator.calculateRGBSpectrum(material, properties);
    
    // Convert to texture format (normalized 0-1)
    const texture = new Float32Array(this.resolution);
    const minWavelength = 200; // nm
    const maxWavelength = 1000; // nm
    
    for (let i = 0; i < this.resolution; i++) {
      // Calculate wavelength for this sample
      const wavelength = i === this.resolution - 1
        ? maxWavelength
        : minWavelength + (i / (this.resolution - 1)) * (maxWavelength - minWavelength);
      
      // Interpolate transmission from spectrum
      const transmission = this.interpolateSpectrum(spectrum, wavelength);
      texture[i] = Math.max(0, Math.min(1, transmission)); // Clamp to [0, 1]
    }
    
    return texture;
  }

  /**
   * Check if properties have changed and texture needs updating
   * Compares key properties that affect transmission
   */
  static propertiesChanged(
    prev: SolutionProperties | null,
    curr: SolutionProperties
  ): boolean {
    if (!prev) return true;

    // Check temperature
    if (Math.abs(prev.temperature - curr.temperature) > 0.01) return true;

    // Check depth
    if (Math.abs(prev.depth - curr.depth) > 0.0001) return true;

    // Check pressure
    if (Math.abs(prev.pressure - curr.pressure) > 0.01) return true;

    // Check phase
    if (prev.phase !== curr.phase) return true;

    // Check molecule concentrations
    if (prev.moleculeConcentrations.size !== curr.moleculeConcentrations.size) return true;
    
    for (const [moleculeId, concentration] of curr.moleculeConcentrations) {
      const prevConcentration = prev.moleculeConcentrations.get(moleculeId) || 0;
      if (Math.abs(prevConcentration - concentration) > 0.0001) return true;
    }

    // Check particulates
    if (Math.abs(prev.bubbleDensity - curr.bubbleDensity) > 0.001) return true;
    if (Math.abs(prev.particleDensity - curr.particleDensity) > 0.001) return true;
    if (Math.abs(prev.particleSize - curr.particleSize) > 0.1) return true;

    return false;
  }

  /**
   * Linear interpolation helper for spectrum lookup
   */
  private interpolateSpectrum(
    spectrum: Array<{ wavelength: number; transmission: number }>,
    wavelength: number
  ): number {
    // Handle out of range
    if (wavelength < spectrum[0].wavelength) return spectrum[0].transmission;
    if (wavelength > spectrum[spectrum.length - 1].wavelength) {
      return spectrum[spectrum.length - 1].transmission;
    }

    // Find surrounding points
    for (let i = 0; i < spectrum.length - 1; i++) {
      const point1 = spectrum[i];
      const point2 = spectrum[i + 1];

      if (wavelength >= point1.wavelength && wavelength <= point2.wavelength) {
        // Linear interpolation
        const t = (wavelength - point1.wavelength) / (point2.wavelength - point1.wavelength);
        return point1.transmission + t * (point2.transmission - point1.transmission);
      }
    }

    return spectrum[spectrum.length - 1].transmission;
  }

  /**
   * Get texture resolution
   */
  getResolution(): number {
    return this.resolution;
  }
}

