import { SpectralCalculator } from './SpectralCalculator';
import { CIE } from './CIE';
import { Material } from './interfaces/Material';
import { SolutionProperties } from './SolutionProperties';

/**
 * SpectralRenderer converts spectral calculations to RGB colors for display
 */
export class SpectralRenderer {
  private calculator: SpectralCalculator;

  constructor() {
    this.calculator = new SpectralCalculator();
  }

  /**
   * Calculate RGB color and alpha for a material with given properties
   */
  calculateColorAndAlpha(
    material: Material,
    properties: SolutionProperties,
    uvMode: boolean = false
  ): { color: number; alpha: number } {
    // Get RGB spectrum (~100 frequencies for performance)
    const spectrum = this.calculator.calculateRGBSpectrum(material, properties);

    // Calculate average transmission for alpha
    const avgTransmission = spectrum.reduce((sum, point) => sum + point.transmission, 0) / spectrum.length;
    
    // Convert to XYZ with appropriate illuminant
    const illuminant = uvMode ? 'UV' : 'D65';
    const xyz = CIE.spectrumToXYZ(spectrum, illuminant);

    // Convert to sRGB
    const rgb = CIE.xyzToSRGB(xyz);

    // Convert to Phaser color format (0xRRGGBB)
    const color = (rgb.r << 16) | (rgb.g << 8) | rgb.b;
    
    // Calculate alpha based on transmission
    // Clear materials (high transmission) = low alpha (more transparent)
    // Colored materials (low transmission) = high alpha (more opaque)
    // For fully transparent (T=1.0): alpha = 0.15 (nearly invisible)
    // For opaque (T=0.0): alpha = 1.0 (fully opaque)
    // Inverse relationship: high transmission → low alpha
    const alpha = Math.max(0.15, Math.min(1.0, 1.0 - avgTransmission * 0.85));
    
    return { color, alpha };
  }

  /**
   * Calculate RGB color for a material with given properties (backward compatibility)
   */
  calculateColor(material: Material, properties: SolutionProperties): number {
    return this.calculateColorAndAlpha(material, properties).color;
  }

  /**
   * Calculate full spectrum for analysis (2000 frequencies)
   */
  calculateFullSpectrum(material: Material, properties: SolutionProperties) {
    return this.calculator.calculateFullSpectrum(material, properties);
  }
}

