import { PixelFilter } from './PixelFilter';
import { SpectrumPoint } from '../CIE';
import { Material } from '../interfaces/Material';
import { SolutionProperties } from '../SolutionProperties';
import { SpectralCalculator } from '../SpectralCalculator';
import { BlackBodyEmission } from '../emission/BlackBodyEmission';

/**
 * MaterialFilter - Wraps Material + SolutionProperties into a PixelFilter
 * Applies material's spectral effects (absorption, emission, etc.) to spectrum
 * 
 * Physics formula: final[λ] = input[λ] × transmission[λ] + emission[λ]
 * 
 * OCP: Reuses existing Material, SpectralCalculator, and BlackBodyEmission
 */
export class MaterialFilter implements PixelFilter {
  readonly id: string;
  private readonly material: Material;
  private readonly properties: SolutionProperties;
  private readonly calculator: SpectralCalculator;
  private readonly blackBodyEmission: BlackBodyEmission;
  
  // Draper point: temperature at which visible glow begins (~798K)
  private static readonly DRAPER_POINT = 798;

  constructor(material: Material, properties: SolutionProperties, id?: string) {
    this.material = material;
    this.properties = properties;
    this.calculator = new SpectralCalculator();
    this.blackBodyEmission = new BlackBodyEmission();
    this.id = id || `material-${material.id}`;
  }

  apply(spectrum: SpectrumPoint[]): SpectrumPoint[] {
    const temperature = this.properties.temperature;
    const hasEmission = temperature > MaterialFilter.DRAPER_POINT;
    
    // Apply material's transmission and add emission to each wavelength point
    // 
    // Kirchhoff's Law: At thermal equilibrium, emissivity = absorptivity
    // 
    // Physics formula:
    //   absorptivity = 1 - transmission
    //   emitted = absorptivity × blackBodyIntensity
    //   result = input × transmission + emitted
    //
    // This means:
    // - Transparent materials (transmission=1) don't emit (absorptivity=0)
    // - Opaque materials (transmission=0) emit maximally (absorptivity=1)
    // - The coupling is physically correct: good absorbers are good emitters
    
    return spectrum.map(point => {
      // Calculate transmission (absorption)
      const materialTransmission = this.calculator.calculateTransmission(
        point.wavelength,
        this.material,
        this.properties
      );
      const transmitted = point.transmission * materialTransmission;
      
      // Calculate emission (black body radiation if above Draper point)
      // Apply Kirchhoff's Law: emissivity = absorptivity = 1 - transmission
      let emitted = 0;
      if (hasEmission) {
        const absorptivity = 1 - materialTransmission;
        const blackBodyIntensity = this.blackBodyEmission.getIntensityAt(point.wavelength, temperature);
        emitted = absorptivity * blackBodyIntensity;
      }
      
      return {
        ...point,
        transmission: transmitted + emitted,
      };
    });
  }

  canScatter(): boolean {
    // Check if material has scattering effects
    const effects = this.material.getEffects();
    return effects.some(effect => effect.getType() === 'scattering');
  }

  getMaterial(): Material {
    return this.material;
  }

  getProperties(): SolutionProperties {
    return this.properties;
  }
}

