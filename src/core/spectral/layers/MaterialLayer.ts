import { SpectralLayer, SpectralShape, SpectralLayerConfig, calculateAuraIntensity, blendAuraIntensities } from './SpectralLayer';
import { ScatteringProperties, NO_SCATTERING, calculateBlurSigma } from '../scattering/ScatteringProperties';
import { SpectrumPoint } from '../CIE';
import { ShapeGeometry } from '../geometry/ShapeGeometry';
import { EmissionProperties } from '../emission/EmissionSpectrum';
import { EmissionCalculator } from '../emission/EmissionCalculator';

/**
 * MaterialShape - a shape with material properties
 */
export interface MaterialShapeConfig {
  id: string;
  geometry: ShapeGeometry;
  absorptionSpectrum: SpectrumPoint[];
  baseEmissionSpectrum: SpectrumPoint[];
  scattering: ScatteringProperties;
  emissionProperties: EmissionProperties;
  depth?: number;
}

/**
 * MaterialShape implementation of SpectralShape
 */
export class MaterialShape implements SpectralShape {
  readonly id: string;
  readonly geometry: ShapeGeometry;
  
  private absorptionSpectrum: SpectrumPoint[];
  private baseEmissionSpectrum: SpectrumPoint[];
  private netEmissionSpectrum: SpectrumPoint[];
  private scattering: ScatteringProperties;
  private emissionProps: EmissionProperties;
  private depth: number;
  
  constructor(config: MaterialShapeConfig) {
    this.id = config.id;
    this.geometry = config.geometry;
    this.absorptionSpectrum = [...config.absorptionSpectrum];
    this.baseEmissionSpectrum = [...config.baseEmissionSpectrum];
    this.scattering = { ...config.scattering };
    this.emissionProps = { ...config.emissionProperties };
    this.depth = config.depth ?? 1.0;
    
    // Calculate initial net emission
    this.netEmissionSpectrum = this.calculateNetEmission();
  }
  
  getAbsorptionSpectrum(): SpectrumPoint[] {
    return this.absorptionSpectrum.map(p => ({ ...p }));
  }
  
  getBaseEmissionSpectrum(): SpectrumPoint[] {
    return this.baseEmissionSpectrum.map(p => ({ ...p }));
  }
  
  getNetEmissionSpectrum(): SpectrumPoint[] {
    return this.netEmissionSpectrum.map(p => ({ ...p }));
  }
  
  getScattering(): ScatteringProperties {
    return { ...this.scattering };
  }
  
  getEmissionProperties(): EmissionProperties {
    return { ...this.emissionProps };
  }
  
  updateSpectra(): void {
    this.netEmissionSpectrum = this.calculateNetEmission();
  }
  
  /**
   * Calculate net emission after self-absorption
   */
  private calculateNetEmission(): SpectrumPoint[] {
    return EmissionCalculator.calculateNetEmission(
      this.baseEmissionSpectrum,
      this.absorptionSpectrum,
      this.depth
    );
  }
  
  /**
   * Update absorption spectrum (e.g., when concentration changes)
   */
  setAbsorptionSpectrum(spectrum: SpectrumPoint[]): void {
    this.absorptionSpectrum = [...spectrum];
    this.updateSpectra();
  }
  
  /**
   * Update base emission spectrum (e.g., when temperature changes)
   */
  setBaseEmissionSpectrum(spectrum: SpectrumPoint[]): void {
    this.baseEmissionSpectrum = [...spectrum];
    this.updateSpectra();
  }
  
  /**
   * Update scattering properties
   */
  setScattering(scattering: ScatteringProperties): void {
    this.scattering = { ...scattering };
  }
  
  /**
   * Update emission properties (aura radius, decay)
   */
  setEmissionProperties(props: EmissionProperties): void {
    this.emissionProps = { ...props };
  }
  
  /**
   * Update depth (affects self-absorption and blur)
   */
  setDepth(depth: number): void {
    this.depth = depth;
    this.updateSpectra();
  }
}

/**
 * MaterialLayer - a layer containing MaterialShapes
 * 
 * Implements the SpectralLayer interface for use with LayerCompositor
 */
export class MaterialLayer implements SpectralLayer {
  readonly id: string;
  readonly zOrder: number;
  
  private shapes: MaterialShape[] = [];
  private defaultAuraRadius: number = 20;
  private defaultAuraDecay: number = 0.1;
  
  constructor(config: SpectralLayerConfig) {
    this.id = config.id;
    this.zOrder = config.zOrder;
  }
  
  /**
   * Add a shape to this layer
   */
  addShape(shape: MaterialShape): void {
    this.shapes.push(shape);
  }
  
  /**
   * Remove a shape by ID
   */
  removeShape(id: string): boolean {
    const index = this.shapes.findIndex(s => s.id === id);
    if (index >= 0) {
      this.shapes.splice(index, 1);
      return true;
    }
    return false;
  }
  
  /**
   * Get all shapes
   */
  getShapes(): SpectralShape[] {
    return [...this.shapes];
  }
  
  /**
   * Check if a point is inside any shape
   */
  containsPoint(x: number, y: number): boolean {
    return this.shapes.some(s => s.geometry.contains(x, y));
  }
  
  /**
   * Get the shape at a point (if any)
   */
  getShapeAt(x: number, y: number): SpectralShape | null {
    return this.shapes.find(s => s.geometry.contains(x, y)) || null;
  }
  
  /**
   * Get absorption at a point for a wavelength
   */
  getAbsorptionAt(x: number, y: number, wavelength: number): number {
    const shape = this.getShapeAt(x, y);
    if (!shape) return 1.0; // Full transmission outside shapes
    
    const spectrum = shape.getAbsorptionSpectrum();
    // Find closest wavelength
    let closest = spectrum[0];
    for (const point of spectrum) {
      if (Math.abs(point.wavelength - wavelength) < Math.abs(closest.wavelength - wavelength)) {
        closest = point;
      }
    }
    return closest.transmission;
  }
  
  /**
   * Get emission at a point for a wavelength (includes aura falloff)
   */
  getEmissionAt(x: number, y: number, wavelength: number): number {
    // Check if inside any shape
    const shape = this.getShapeAt(x, y);
    if (shape) {
      const spectrum = shape.getNetEmissionSpectrum();
      let closest = spectrum[0];
      for (const point of spectrum) {
        if (Math.abs(point.wavelength - wavelength) < Math.abs(closest.wavelength - wavelength)) {
          closest = point;
        }
      }
      return closest.transmission;
    }
    
    // Outside shapes - check for aura contribution
    const auraIntensity = this.getAuraIntensity(x, y);
    if (auraIntensity <= 0) return 0;
    
    // Find nearest emitting shape for aura
    let nearestEmission = 0;
    let nearestDistance = Infinity;
    
    for (const s of this.shapes) {
      const dist = Math.abs(s.geometry.getEdgeDistance(x, y));
      if (dist < nearestDistance) {
        nearestDistance = dist;
        const spectrum = s.getNetEmissionSpectrum();
        let closest = spectrum[0];
        for (const point of spectrum) {
          if (Math.abs(point.wavelength - wavelength) < Math.abs(closest.wavelength - wavelength)) {
            closest = point;
          }
        }
        nearestEmission = closest.transmission;
      }
    }
    
    return nearestEmission * auraIntensity;
  }
  
  /**
   * Get aura intensity at a point
   * - 1.0 inside any shape
   * - Exponential decay outside, based on nearest shape
   * - Multiple shapes' auras blend additively
   */
  getAuraIntensity(x: number, y: number): number {
    const intensities: number[] = [];
    
    for (const shape of this.shapes) {
      const distance = shape.geometry.getEdgeDistance(x, y);
      const props = shape.getEmissionProperties();
      const radius = props.auraRadius ?? this.defaultAuraRadius;
      const decay = props.auraDecay ?? this.defaultAuraDecay;
      
      const intensity = calculateAuraIntensity(distance, radius, decay);
      if (intensity > 0) {
        intensities.push(intensity);
      }
    }
    
    return blendAuraIntensities(intensities);
  }
  
  /**
   * Get scattering at a point
   */
  getScatteringAt(x: number, y: number): ScatteringProperties {
    const shape = this.getShapeAt(x, y);
    return shape?.getScattering() ?? NO_SCATTERING;
  }
  
  /**
   * Get blur sigma at a point
   */
  getBlurSigmaAt(x: number, y: number): number {
    const scattering = this.getScatteringAt(x, y);
    if (scattering.coefficient <= 0) return 0;
    
    // Use default depth of 1.0 for blur calculation
    return calculateBlurSigma(scattering, 1.0);
  }
  
  /**
   * Update all shapes' spectra
   */
  updateSpectra(): void {
    for (const shape of this.shapes) {
      shape.updateSpectra();
    }
  }
  
  /**
   * Clear all shapes
   */
  clear(): void {
    this.shapes = [];
  }
}

