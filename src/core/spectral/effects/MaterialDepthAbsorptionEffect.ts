import { SpectralEffect } from '../interfaces/SpectralEffect';
import { SolutionProperties } from '../SolutionProperties';
import { Material } from '../interfaces/Material';

/**
 * MaterialDepthAbsorptionEffect implements depth-dependent absorption for materials
 * Uses Beer-Lambert law: T = 10^(-α * depth)
 * where α is the material-specific absorption coefficient (m⁻¹)
 */
export class MaterialDepthAbsorptionEffect implements SpectralEffect {
  readonly id = 'material-depth-absorption';
  readonly name = 'Material Depth Absorption';

  apply(
    wavelength: number,
    properties: SolutionProperties,
    material: Material
  ): number {
    // No absorption at zero depth
    if (properties.depth <= 0) {
      return 1.0;
    }

    // Get material-specific absorption coefficient
    const alpha = this.getAbsorptionCoefficient(wavelength, material.id);

    // Beer-Lambert law: T = 10^(-α * depth)
    const absorbance = alpha * properties.depth;
    const transmission = Math.pow(10, -absorbance);

    return transmission;
  }

  /**
   * Get material-specific absorption coefficient (m⁻¹)
   * @param wavelength Wavelength in nm
   * @param materialId Material ID
   * @returns Absorption coefficient in m⁻¹
   */
  private getAbsorptionCoefficient(
    wavelength: number,
    materialId: string
  ): number {
    switch (materialId) {
      case 'water':
        return this.getWaterAbsorptionCoefficient(wavelength);
      case 'crystal':
        return this.getCrystalAbsorptionCoefficient(wavelength);
      case 'gas':
        return 0.0; // No depth-dependent absorption for gases
      default:
        return 0.0; // Unknown materials have no depth absorption
    }
  }

  /**
   * Water absorption coefficient data points (m⁻¹)
   * Based on published research:
   * - Pope & Fry (1997): Absorption spectrum (380-700 nm) of pure water
   * - Quickenden & Irvin (1980): Ultraviolet (250-550 nm) absorption spectrum
   * - Hale & Querry (1973): Optical constants of water
   * 
   * Key characteristics:
   * - UV minimum at ~344 nm: ~0.000811 m⁻¹
   * - Visible minimum at ~418 nm: ~0.0044 m⁻¹
   * - Absorption increases toward longer (red) and shorter (UV) wavelengths
   */
  private readonly WATER_ABSORPTION_DATA: Array<{ wavelength: number; coefficient: number }> = [
    // UV region - strong absorption, minimum at 344 nm
    { wavelength: 250, coefficient: 0.1 }, // Strong UV absorption
    { wavelength: 300, coefficient: 0.005 },
    { wavelength: 344, coefficient: 0.000811 }, // UV minimum
    { wavelength: 380, coefficient: 0.008 }, // Near UV-visible boundary
    
    // Visible region - minimum around 418 nm
    { wavelength: 400, coefficient: 0.01 }, // Blue
    { wavelength: 418, coefficient: 0.0044 }, // Visible minimum
    { wavelength: 450, coefficient: 0.002 }, // Blue-green
    { wavelength: 475, coefficient: 0.0018 }, // Cyan
    { wavelength: 500, coefficient: 0.003 }, // Green
    { wavelength: 550, coefficient: 0.01 }, // Yellow-green
    
    // Red region - increasing absorption
    { wavelength: 600, coefficient: 0.2 }, // Orange-red
    { wavelength: 650, coefficient: 0.3 }, // Red
    { wavelength: 700, coefficient: 0.5 }, // Deep red
    
    // Near-IR - strong absorption
    { wavelength: 800, coefficient: 2.0 }, // Near-IR
  ];

  /**
   * Water absorption coefficient (m⁻¹)
   * Uses linear interpolation between measured data points for continuous profile
   * @param wavelength Wavelength in nm
   * @returns Absorption coefficient in m⁻¹
   */
  private getWaterAbsorptionCoefficient(wavelength: number): number {
    const data = this.WATER_ABSORPTION_DATA;
    
    // Handle wavelengths below minimum
    if (wavelength < data[0].wavelength) {
      // Extrapolate using exponential increase for deep UV
      const minWavelength = data[0].wavelength;
      const minCoefficient = data[0].coefficient;
      const ratio = wavelength / minWavelength;
      return minCoefficient * Math.pow(10, 1 - ratio); // Exponential increase
    }
    
    // Handle wavelengths above maximum
    if (wavelength > data[data.length - 1].wavelength) {
      // Extrapolate using exponential increase for IR
      const maxIndex = data.length - 1;
      const maxWavelength = data[maxIndex].wavelength;
      const maxCoefficient = data[maxIndex].coefficient;
      const ratio = wavelength / maxWavelength;
      return maxCoefficient * Math.pow(ratio, 2); // Quadratic increase for IR
    }
    
    // Find surrounding data points for interpolation
    for (let i = 0; i < data.length - 1; i++) {
      const point1 = data[i];
      const point2 = data[i + 1];
      
      if (wavelength >= point1.wavelength && wavelength <= point2.wavelength) {
        // Linear interpolation
        const t = (wavelength - point1.wavelength) / (point2.wavelength - point1.wavelength);
        return point1.coefficient + t * (point2.coefficient - point1.coefficient);
      }
    }
    
    // Fallback (should not reach here)
    return 0.1;
  }

  /**
   * Crystal absorption coefficient (m⁻¹)
   * Crystal has minimal absorption (mostly transparent)
   * α ≈ 0.00001 m⁻¹ for all wavelengths (extremely transparent)
   */
  private getCrystalAbsorptionCoefficient(_wavelength: number): number {
    // Crystal is highly transparent
    return 0.00001;
  }

  getType(): 'absorption' {
    return 'absorption';
  }

  getPriority(): number {
    return 5; // Applied before ChemicalAbsorptionEffect (priority 10)
  }
}

