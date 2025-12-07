import { SpectralLayer, SpectralShape } from './SpectralLayer';
import { SpectrumPoint } from '../CIE';
import { calculateBlurSigma } from '../scattering/ScatteringProperties';
import { EmissionCalculator } from '../emission/EmissionCalculator';

/**
 * CompositorConfig - configuration for the layer compositor
 */
export interface CompositorConfig {
  /** Maximum blur sigma in pixels (for performance) */
  maxBlurSigma: number;
  
  /** Maximum aura radius in pixels */
  maxAuraRadius: number;
  
  /** Resolution for wavelength sampling */
  wavelengthResolution: number;
  
  /** Wavelength range */
  wavelengthMin: number;
  wavelengthMax: number;
}

/**
 * Default compositor configuration
 */
export const DEFAULT_COMPOSITOR_CONFIG: CompositorConfig = {
  maxBlurSigma: 50,
  maxAuraRadius: 30,
  wavelengthResolution: 100,
  wavelengthMin: 380,
  wavelengthMax: 700,
};

/**
 * PixelSpectralData - spectral data for a single pixel
 */
export interface PixelSpectralData {
  /** Accumulated transmission spectrum (from all layers behind) */
  transmission: SpectrumPoint[];
  
  /** Accumulated emission spectrum (from all layers) */
  emission: SpectrumPoint[];
  
  /** Blur sigma for content behind current layer */
  blurSigma: number;
  
  /** Aura intensity at this pixel (for emission falloff) */
  auraIntensity: number;
}

/**
 * LayerCompositor - composes multiple spectral layers in order
 * 
 * Processing order per layer:
 * 1. Blur content from previous layers (based on scattering)
 * 2. Apply absorption (only inside shapes)
 * 3. Add emission (inside shapes + aura outside)
 * 
 * OCP: New composition modes can be added without modifying existing code
 */
export class LayerCompositor {
  private layers: SpectralLayer[] = [];
  private config: CompositorConfig;
  
  constructor(config: Partial<CompositorConfig> = {}) {
    this.config = { ...DEFAULT_COMPOSITOR_CONFIG, ...config };
  }
  
  /**
   * Add a layer to the compositor
   * Layers are automatically sorted by zOrder
   */
  addLayer(layer: SpectralLayer): void {
    this.layers.push(layer);
    this.sortLayers();
  }
  
  /**
   * Remove a layer by ID
   */
  removeLayer(id: string): boolean {
    const index = this.layers.findIndex(l => l.id === id);
    if (index >= 0) {
      this.layers.splice(index, 1);
      return true;
    }
    return false;
  }
  
  /**
   * Get all layers in z-order
   */
  getLayers(): SpectralLayer[] {
    return [...this.layers];
  }
  
  /**
   * Get layer by ID
   */
  getLayer(id: string): SpectralLayer | null {
    return this.layers.find(l => l.id === id) || null;
  }
  
  /**
   * Sort layers by z-order (lower = further back)
   */
  private sortLayers(): void {
    this.layers.sort((a, b) => a.zOrder - b.zOrder);
  }
  
  /**
   * Clear all layers
   */
  clear(): void {
    this.layers = [];
  }
  
  /**
   * Update all layers' spectra (call after property changes)
   */
  updateAllSpectra(): void {
    for (const layer of this.layers) {
      layer.updateSpectra();
    }
  }
  
  /**
   * Compose all layers at a specific pixel
   * Returns the final spectral data for rendering
   * 
   * @param x X coordinate in world space
   * @param y Y coordinate in world space
   * @param backgroundSpectrum Initial illumination spectrum
   */
  composeAt(x: number, y: number, backgroundSpectrum: SpectrumPoint[]): PixelSpectralData {
    // Initialize with background
    let transmission = backgroundSpectrum.map(p => ({ ...p }));
    let emission: SpectrumPoint[] = this.createEmptySpectrum();
    let totalBlurSigma = 0;
    let maxAuraIntensity = 0;
    
    // Process each layer in order
    for (const layer of this.layers) {
      const layerResult = this.processLayer(layer, x, y, transmission);
      
      // Apply layer's effect on transmission (multiplicative)
      transmission = this.multiplySpectra(transmission, layerResult.absorption);
      
      // Add layer's emission (additive)
      emission = EmissionCalculator.combineEmissions([emission, layerResult.emission]);
      
      // Accumulate blur
      totalBlurSigma += layerResult.blurSigma;
      
      // Track max aura intensity
      maxAuraIntensity = Math.max(maxAuraIntensity, layerResult.auraIntensity);
    }
    
    // Clamp blur to max
    totalBlurSigma = Math.min(totalBlurSigma, this.config.maxBlurSigma);
    
    return {
      transmission,
      emission,
      blurSigma: totalBlurSigma,
      auraIntensity: maxAuraIntensity,
    };
  }
  
  /**
   * Process a single layer's contribution at a pixel
   */
  private processLayer(
    layer: SpectralLayer,
    x: number,
    y: number,
    _incomingTransmission: SpectrumPoint[]
  ): {
    absorption: SpectrumPoint[];
    emission: SpectrumPoint[];
    blurSigma: number;
    auraIntensity: number;
  } {
    const shape = layer.getShapeAt(x, y);
    const auraIntensity = layer.getAuraIntensity(x, y);
    
    if (shape) {
      // Inside a shape - apply full absorption and emission
      const absorption = shape.getAbsorptionSpectrum();
      const netEmission = shape.getNetEmissionSpectrum();
      const scattering = shape.getScattering();
      const blurSigma = calculateBlurSigma(scattering, 1.0); // depth from shape
      
      return {
        absorption,
        emission: netEmission,
        blurSigma,
        auraIntensity: 1.0,
      };
    } else if (auraIntensity > 0) {
      // Outside shape but within aura - only emission, no absorption
      // Find the nearest shape for emission
      const nearestShape = this.findNearestEmittingShape(layer, x, y);
      
      if (nearestShape) {
        const netEmission = nearestShape.getNetEmissionSpectrum();
        const scaledEmission = EmissionCalculator.scaleEmission(netEmission, auraIntensity);
        
        return {
          absorption: this.createFullTransmissionSpectrum(), // No absorption
          emission: scaledEmission,
          blurSigma: 0,
          auraIntensity,
        };
      }
    }
    
    // Outside all shapes and auras - no effect
    return {
      absorption: this.createFullTransmissionSpectrum(),
      emission: this.createEmptySpectrum(),
      blurSigma: 0,
      auraIntensity: 0,
    };
  }
  
  /**
   * Find the nearest shape with emission in a layer
   */
  private findNearestEmittingShape(layer: SpectralLayer, x: number, y: number): SpectralShape | null {
    const shapes = layer.getShapes();
    let nearestShape: SpectralShape | null = null;
    let nearestDistance = Infinity;
    
    for (const shape of shapes) {
      const emission = shape.getNetEmissionSpectrum();
      if (!EmissionCalculator.hasSignificantEmission(emission)) {
        continue; // Skip non-emitting shapes
      }
      
      const distance = Math.abs(shape.geometry.getEdgeDistance(x, y));
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestShape = shape;
      }
    }
    
    return nearestShape;
  }
  
  /**
   * Multiply two spectra (for absorption)
   */
  private multiplySpectra(a: SpectrumPoint[], b: SpectrumPoint[]): SpectrumPoint[] {
    return a.map((point, i) => ({
      wavelength: point.wavelength,
      transmission: point.transmission * (b[i]?.transmission ?? 1.0),
    }));
  }
  
  /**
   * Create an empty (zero) spectrum
   */
  private createEmptySpectrum(): SpectrumPoint[] {
    const points: SpectrumPoint[] = [];
    const step = (this.config.wavelengthMax - this.config.wavelengthMin) / this.config.wavelengthResolution;
    
    for (let wl = this.config.wavelengthMin; wl <= this.config.wavelengthMax; wl += step) {
      points.push({ wavelength: wl, transmission: 0 });
    }
    
    return points;
  }
  
  /**
   * Create a full transmission (1.0) spectrum
   */
  private createFullTransmissionSpectrum(): SpectrumPoint[] {
    const points: SpectrumPoint[] = [];
    const step = (this.config.wavelengthMax - this.config.wavelengthMin) / this.config.wavelengthResolution;
    
    for (let wl = this.config.wavelengthMin; wl <= this.config.wavelengthMax; wl += step) {
      points.push({ wavelength: wl, transmission: 1.0 });
    }
    
    return points;
  }
  
  /**
   * Get compositor configuration
   */
  getConfig(): CompositorConfig {
    return { ...this.config };
  }
  
  /**
   * Update compositor configuration
   */
  setConfig(config: Partial<CompositorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

