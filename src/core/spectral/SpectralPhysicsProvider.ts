import { SpectrumPoint } from './CIE';
import { Material } from './interfaces/Material';
import { SolutionProperties } from './SolutionProperties';
import { BlackBodyEmission } from './emission/BlackBodyEmission';
import { ScatteringProperties, NO_SCATTERING } from './scattering/ScatteringProperties';
import { EmissionProperties } from './emission/EmissionSpectrum';
import { SpectralCalculator } from './SpectralCalculator';
import {
  calculateUniformBackgroundSpectrum,
  calculateUVBackgroundSpectrum,
  calculateRGBBackgroundSpectrum,
  calculateUVRGBBackgroundSpectrum,
  calculateDarkBackgroundSpectrum,
  calculateDarkRGBBackgroundSpectrum,
} from '../demos/spectral/SpectralCalculations';

/**
 * Background illumination mode
 */
export type BackgroundMode = 'normal' | 'uv' | 'dark';

/**
 * SpectralPhysicsProvider - Unified physics interface for spectral calculations
 * 
 * This class provides a single source of truth for all spectral physics:
 * - Background spectrum (Normal D65, UV, or Dark mode)
 * - Transmission spectrum (material absorption)
 * - Emission spectrum (black body + Kirchhoff's law)
 * - Scattering properties (Rayleigh, Mie)
 * - Aura properties (emission glow falloff)
 * 
 * Both the spectral plot (CPU, high resolution) and the GPU renderer
 * use this interface to ensure identical physics.
 * 
 * OCP: New physics effects can be added by extending the interface
 * without modifying existing consumers.
 */
export class SpectralPhysicsProvider {
  private readonly blackBodyEmission: BlackBodyEmission;
  private readonly calculator: SpectralCalculator;
  
  // Draper point: temperature at which visible emission begins
  private static readonly DRAPER_POINT = 798; // K
  
  // Default aura properties
  private static readonly DEFAULT_AURA_RADIUS = 20;
  private static readonly DEFAULT_AURA_DECAY = 0.1;
  
  constructor() {
    this.blackBodyEmission = new BlackBodyEmission();
    this.calculator = new SpectralCalculator();
  }
  
  /**
   * Get background illumination spectrum for a given mode
   * 
   * @param mode 'normal' (D65 white), 'uv' (UV-weighted), or 'dark' (zero)
   * @param resolution Number of wavelength samples (default: high for display)
   * @returns Spectrum points with wavelength and intensity
   */
  getBackgroundSpectrum(mode: BackgroundMode, resolution: 'display' | 'render' = 'display'): SpectrumPoint[] {
    if (mode === 'dark') {
      // Dark mode: zero intensity at all wavelengths
      return resolution === 'display'
        ? calculateDarkBackgroundSpectrum()
        : calculateDarkRGBBackgroundSpectrum();
    }
    
    if (mode === 'uv') {
      return resolution === 'display' 
        ? calculateUVBackgroundSpectrum()
        : calculateUVRGBBackgroundSpectrum();
    }
    
    // Normal mode: D65 white light
    return resolution === 'display'
      ? calculateUniformBackgroundSpectrum()
      : calculateRGBBackgroundSpectrum();
  }
  
  /**
   * Get transmission spectrum for a material
   * 
   * @param material The material to calculate transmission for
   * @param props Solution properties (concentration, depth, etc.)
   * @param resolution Number of wavelength samples
   * @returns Spectrum points with wavelength and transmission (0-1)
   */
  getTransmissionSpectrum(
    material: Material,
    props: SolutionProperties,
    resolution: number = 100
  ): SpectrumPoint[] {
    const spectrum: SpectrumPoint[] = [];
    const minWl = 380;
    const maxWl = 700;
    const step = (maxWl - minWl) / (resolution - 1);
    
    for (let i = 0; i < resolution; i++) {
      const wavelength = minWl + i * step;
      const transmission = this.calculator.calculateTransmission(
        wavelength,
        material,
        props
      );
      spectrum.push({ wavelength, transmission });
    }
    
    return spectrum;
  }
  
  /**
   * Get emission spectrum for a material using Kirchhoff's law
   * 
   * Kirchhoff's Law: emissivity = absorptivity = 1 - transmission
   * 
   * Emission at each wavelength:
   *   E(λ) = absorptivity(λ) × B(λ, T) / B(λ, 6500K)
   * 
   * where B(λ, T) is the Planck black body function
   * 
   * @param material The material to calculate emission for
   * @param props Solution properties (must include temperature)
   * @param resolution Number of wavelength samples
   * @returns Spectrum points with wavelength and emission intensity
   */
  getEmissionSpectrum(
    material: Material,
    props: SolutionProperties,
    resolution: number = 100
  ): SpectrumPoint[] {
    const temperature = props.temperature;
    const spectrum: SpectrumPoint[] = [];
    const minWl = 380;
    const maxWl = 700;
    const step = (maxWl - minWl) / (resolution - 1);
    
    // Below Draper point, no visible emission
    const hasEmission = temperature > SpectralPhysicsProvider.DRAPER_POINT;
    
    for (let i = 0; i < resolution; i++) {
      const wavelength = minWl + i * step;
      
      let emission = 0;
      if (hasEmission) {
        // Calculate transmission (absorption)
        const transmission = this.calculator.calculateTransmission(
          wavelength,
          material,
          props
        );
        
        // Kirchhoff's law: emissivity = absorptivity = 1 - transmission
        const absorptivity = 1 - transmission;
        
        // Black body emission (D65-normalized)
        const blackBodyIntensity = this.blackBodyEmission.getIntensityAt(wavelength, temperature);
        
        // Emission = absorptivity × black body intensity
        emission = absorptivity * blackBodyIntensity;
      }
      
      spectrum.push({ wavelength, transmission: emission });
    }
    
    return spectrum;
  }
  
  /**
   * Get scattering properties for a material
   * 
   * Scattering depends on:
   * - Particle density (more particles = more scattering)
   * - Particle size (determines Rayleigh vs Mie)
   * - Optical path length (depth)
   * 
   * @param material The material
   * @param props Solution properties
   * @returns Scattering properties (coefficient, wavelength power, asymmetry)
   */
  getScatteringProperties(material: Material, props: SolutionProperties): ScatteringProperties {
    const particleDensity = props.particleDensity ?? 0;
    const particleSize = props.particleSize ?? 0;
    const depth = props.depth ?? 0.01;
    
    // No scattering if no particles
    if (particleDensity <= 0) {
      return NO_SCATTERING;
    }
    
    // Scattering coefficient based on particle density and depth
    const coefficient = Math.min(1, particleDensity * depth * 10);
    
    // Wavelength power: small particles = Rayleigh (λ^-4), large = Mie (λ^0)
    // Transition around 100nm particle size
    const wavelengthPower = particleSize < 100 ? 4 * (1 - particleSize / 100) : 0;
    
    // Asymmetry: larger particles scatter forward more
    const asymmetry = Math.min(0.9, particleSize / 500);
    
    return {
      coefficient,
      wavelengthPower,
      asymmetry,
    };
  }
  
  /**
   * Get aura properties for emission glow
   * 
   * Aura radius and decay depend on emission intensity (temperature)
   * 
   * @param material The material
   * @param props Solution properties
   * @returns Emission properties with aura settings
   */
  getAuraProperties(material: Material, props: SolutionProperties): EmissionProperties {
    const temperature = props.temperature;
    
    // Base aura properties
    let auraRadius = SpectralPhysicsProvider.DEFAULT_AURA_RADIUS;
    let auraDecay = SpectralPhysicsProvider.DEFAULT_AURA_DECAY;
    
    // Increase aura radius with temperature (hotter = more glow)
    if (temperature > SpectralPhysicsProvider.DRAPER_POINT) {
      // Scale aura with temperature relative to D65
      const tempFactor = Math.min(2, temperature / 6500);
      auraRadius = SpectralPhysicsProvider.DEFAULT_AURA_RADIUS * (1 + tempFactor);
      
      // Faster decay at lower temperatures (more localized glow)
      auraDecay = SpectralPhysicsProvider.DEFAULT_AURA_DECAY / tempFactor;
    }
    
    return {
      auraRadius,
      auraDecay,
      emissivity: 1.0,
    };
  }
  
  /**
   * Get combined spectrum (transmission + emission) at a point
   * 
   * This is what the final rendered color is based on:
   *   result = background × transmission + emission
   * 
   * @param material The material at this point
   * @param props Solution properties
   * @param backgroundMode Background illumination mode
   * @param resolution Number of wavelength samples
   * @returns Combined spectrum
   */
  getCombinedSpectrum(
    material: Material,
    props: SolutionProperties,
    backgroundMode: BackgroundMode = 'normal',
    resolution: number = 100
  ): SpectrumPoint[] {
    const background = this.getBackgroundSpectrum(backgroundMode, 
      resolution > 200 ? 'display' : 'render');
    const transmission = this.getTransmissionSpectrum(material, props, resolution);
    const emission = this.getEmissionSpectrum(material, props, resolution);
    
    // Combine: result = background × transmission + emission
    return background.map((bgPoint, i) => {
      const trans = transmission[i]?.transmission ?? 1;
      const emit = emission[i]?.transmission ?? 0;
      
      return {
        wavelength: bgPoint.wavelength,
        transmission: bgPoint.transmission * trans + emit,
      };
    });
  }
  
}

