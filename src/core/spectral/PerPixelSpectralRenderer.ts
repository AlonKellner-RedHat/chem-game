import { SpectralCalculator } from './SpectralCalculator';
import { CIE, SpectrumPoint, RGB, Illuminant } from './CIE';
import { Material } from './interfaces/Material';
import { SolutionProperties } from './SolutionProperties';

/**
 * PerPixelSpectralRenderer handles per-pixel spectral calculations
 * Each pixel's color is calculated by starting with background spectrum,
 * applying material filters along the path, then converting to RGB
 */
export class PerPixelSpectralRenderer {
  private calculator: SpectralCalculator;

  constructor() {
    this.calculator = new SpectralCalculator();
  }

  /**
   * Calculate spectral distribution for a pixel
   * Starts with background spectrum and applies each material's transmission
   * @param backgroundSpectrum Background spectral distribution
   * @param materials Array of materials along the path (in order)
   * @param uvMode Whether to use UV illuminant
   * @returns Final spectral distribution after all materials
   */
  calculatePixelSpectrum(
    backgroundSpectrum: SpectrumPoint[],
    materials: Array<{ material: Material; properties: SolutionProperties }>,
    _uvMode: boolean = false
  ): SpectrumPoint[] {
    // Start with background spectrum
    let spectrum = backgroundSpectrum.map(point => ({ ...point }));

    // Apply each material's transmission in sequence
    for (const { material, properties } of materials) {
      // Calculate material's transmission spectrum
      const materialSpectrum = this.calculator.calculateRGBSpectrum(material, properties);
      
      // Multiply transmissions: result = background * material
      // Interpolate material spectrum to match background spectrum wavelengths
      for (let i = 0; i < spectrum.length; i++) {
        const wavelength = spectrum[i].wavelength;
        const materialTransmission = this.interpolateTransmission(materialSpectrum, wavelength);
        spectrum[i].transmission *= materialTransmission;
      }
    }

    return spectrum;
  }

  /**
   * Interpolate transmission value at a specific wavelength from spectrum
   */
  private interpolateTransmission(spectrum: SpectrumPoint[], wavelength: number): number {
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
    
    // Extrapolation: use nearest point
    if (wavelength < spectrum[0].wavelength) {
      return spectrum[0].transmission;
    }
    if (wavelength > spectrum[spectrum.length - 1].wavelength) {
      return spectrum[spectrum.length - 1].transmission;
    }
    
    return 1.0; // Fallback
  }

  /**
   * Convert spectrum to RGB using CIE color matching functions
   * @param spectrum Spectral distribution
   * @param illuminant Illuminant type (D65 or UV)
   * @returns RGB color (0-255 range, not normalized)
   */
  spectrumToRGB(spectrum: SpectrumPoint[], illuminant: Illuminant = 'D65'): RGB {
    // Convert to XYZ
    const xyz = CIE.spectrumToXYZ(spectrum, illuminant);
    
    // Convert to sRGB (already returns 0-255 range)
    return CIE.xyzToSRGB(xyz);
  }

  /**
   * Normalize RGB relative to maximum brightness
   * @param rgb RGB color (0-255 range)
   * @param maxBrightness Maximum brightness value (max of R, G, B across all pixels)
   * @returns Normalized RGB (0-255 range, scaled so max component = 255 if maxBrightness > 0)
   */
  normalizeRGB(rgb: RGB, maxBrightness: number): RGB {
    if (maxBrightness <= 0) {
      return { r: 0, g: 0, b: 0 };
    }
    
    // Normalize: scale so that if this pixel had maxBrightness, it would be 255
    // Formula: normalized = (rgb / maxBrightness) * 255
    return {
      r: Math.min(255, Math.round((rgb.r / maxBrightness) * 255)),
      g: Math.min(255, Math.round((rgb.g / maxBrightness) * 255)),
      b: Math.min(255, Math.round((rgb.b / maxBrightness) * 255)),
    };
  }

  /**
   * Calculate RGB color for a pixel with brightness normalization
   * Combines calculatePixelSpectrum, spectrumToRGB, and normalizeRGB
   * @param backgroundSpectrum Background spectral distribution
   * @param materials Array of materials along the path
   * @param maxBrightness Maximum brightness for normalization
   * @param uvMode Whether to use UV illuminant
   * @returns Normalized RGB color
   */
  calculatePixelRGB(
    backgroundSpectrum: SpectrumPoint[],
    materials: Array<{ material: Material; properties: SolutionProperties }>,
    maxBrightness: number,
    uvMode: boolean = false
  ): RGB {
    const spectrum = this.calculatePixelSpectrum(backgroundSpectrum, materials, uvMode);
    const rgb = this.spectrumToRGB(spectrum, uvMode ? 'UV' : 'D65');
    return this.normalizeRGB(rgb, maxBrightness);
  }
}

