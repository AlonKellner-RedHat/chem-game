/**
 * LayerCompositionEngine - CPU reference implementation for multi-layer composition
 * 
 * This implements the EXACT same logic that will be used in the GLSL shader.
 * The composition order per layer (from MultiPassRenderer):
 * 1. Blur pass - scattering from shapes in this layer
 * 2. Absorption pass - transmission through shapes
 * 3. Emission pass - black body + aura falloff
 * 
 * Layers are processed back-to-front (0 = back, 5 = front).
 */

import { UnifiedSpectralPhysics, BackgroundMode } from './UnifiedSpectralPhysics';
import { SpectrumPoint } from '../CIE';

/**
 * Configuration for the composition engine
 */
export interface CompositionConfig {
  numLayers: number;
  wavelengthMin: number;
  wavelengthMax: number;
}

/**
 * Per-layer data for composition
 */
export interface LayerData {
  hasShape: boolean;
  transmission: number;
  temperature: number;
  scatteringCoeff: number;
  auraRadius: number;
  auraDecay: number;
}

/**
 * Result of composing at a single point and wavelength
 */
export interface CompositionResult {
  intensity: number;
  hasEmission: boolean;
  blurSigma: number;
}

/**
 * RGB color result
 */
export interface RGBResult {
  r: number;
  g: number;
  b: number;
}

/**
 * LayerCompositionEngine - CPU implementation of multi-layer spectral composition
 */
export class LayerCompositionEngine {
  private config: CompositionConfig;
  private physics: UnifiedSpectralPhysics;
  private layerData: LayerData[] = [];
  
  constructor(config: CompositionConfig, physics: UnifiedSpectralPhysics) {
    this.config = { ...config };
    this.physics = physics;
    
    // Initialize empty layers
    for (let i = 0; i < config.numLayers; i++) {
      this.layerData.push({
        hasShape: false,
        transmission: 1.0,
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      });
    }
  }
  
  /**
   * Set layer data for a specific layer
   */
  setLayerData(layerIndex: number, data: LayerData): void {
    if (layerIndex < 0 || layerIndex >= this.config.numLayers) {
      return;
    }
    this.layerData[layerIndex] = { ...data };
  }
  
  /**
   * Clear layer data (reset to no shape)
   */
  clearLayer(layerIndex: number): void {
    if (layerIndex < 0 || layerIndex >= this.config.numLayers) {
      return;
    }
    this.layerData[layerIndex] = {
      hasShape: false,
      transmission: 1.0,
      temperature: 300,
      scatteringCoeff: 0,
      auraRadius: 20,
      auraDecay: 0.1,
    };
  }
  
  /**
   * Compose at a point for a specific wavelength
   * 
   * This is the core physics formula:
   * For each layer (back to front):
   *   1. Apply blur to previous content
   *   2. Apply transmission: content × layer_transmission
   *   3. Add emission: + layer_emission
   * 
   * @param x X coordinate (not used in this simplified version)
   * @param y Y coordinate (not used in this simplified version)
   * @param wavelengthNm Wavelength in nanometers
   * @param mode Background mode
   * @returns Composition result
   */
  composeAt(
    _x: number,
    _y: number,
    wavelengthNm: number,
    mode: BackgroundMode
  ): CompositionResult {
    // Start with background
    let intensity = this.physics.getBackgroundIntensity(wavelengthNm, mode);
    let hasEmission = false;
    let totalBlurSigma = 0;
    
    // Process each layer back-to-front
    for (let layer = 0; layer < this.config.numLayers; layer++) {
      const data = this.layerData[layer];
      
      if (!data.hasShape) {
        continue; // Skip empty layers
      }
      
      // 1. Blur (accumulate sigma)
      if (data.scatteringCoeff > 0) {
        // Blur sigma = scattering coefficient × scale factor
        totalBlurSigma += data.scatteringCoeff * 10;
      }
      
      // 2. Absorption
      intensity *= data.transmission;
      
      // 3. Emission
      const emission = this.physics.kirchhoffEmission(
        data.transmission,
        wavelengthNm,
        data.temperature
      );
      
      if (emission > 0) {
        // Aura intensity is 1.0 inside shape (simplified)
        intensity += emission;
        hasEmission = true;
      }
    }
    
    return {
      intensity,
      hasEmission,
      blurSigma: totalBlurSigma,
    };
  }
  
  /**
   * Compose to RGB by integrating over wavelength range
   * Uses 16 wavelength samples (matching GLSL shader)
   */
  composeToRGB(x: number, y: number, mode: BackgroundMode): RGBResult {
    const numSamples = 16;
    const { wavelengthMin, wavelengthMax } = this.config;
    
    // Accumulate XYZ
    let X = 0, Y = 0, Z = 0;
    
    for (let i = 0; i < numSamples; i++) {
      const t = i / (numSamples - 1);
      const wavelength = wavelengthMin + t * (wavelengthMax - wavelengthMin);
      
      const result = this.composeAt(x, y, wavelength, mode);
      const intensity = result.intensity;
      
      // CIE color matching functions (simplified approximation)
      const { xBar, yBar, zBar } = this.getCIEValues(wavelength);
      
      X += intensity * xBar;
      Y += intensity * yBar;
      Z += intensity * zBar;
    }
    
    // Normalize by number of samples
    const scale = (wavelengthMax - wavelengthMin) / numSamples;
    X *= scale;
    Y *= scale;
    Z *= scale;
    
    // XYZ to linear RGB
    const { r: linR, g: linG, b: linB } = this.xyzToLinearRGB(X, Y, Z);
    
    // Normalize and apply gamma
    const maxVal = Math.max(linR, linG, linB, 0.001);
    const normR = linR / maxVal;
    const normG = linG / maxVal;
    const normB = linB / maxVal;
    
    // Gamma correction
    const gamma = 2.4;
    const r = Math.pow(Math.max(0, normR), 1 / gamma);
    const g = Math.pow(Math.max(0, normG), 1 / gamma);
    const b = Math.pow(Math.max(0, normB), 1 / gamma);
    
    return {
      r: Math.round(Math.min(255, r * 255)),
      g: Math.round(Math.min(255, g * 255)),
      b: Math.round(Math.min(255, b * 255)),
    };
  }
  
  /**
   * Get full spectrum at a point
   */
  getSpectrumAt(
    x: number,
    y: number,
    mode: BackgroundMode,
    resolution: number
  ): SpectrumPoint[] {
    const { wavelengthMin, wavelengthMax } = this.config;
    const spectrum: SpectrumPoint[] = [];
    
    for (let i = 0; i < resolution; i++) {
      const t = i / (resolution - 1);
      const wavelength = wavelengthMin + t * (wavelengthMax - wavelengthMin);
      
      const result = this.composeAt(x, y, wavelength, mode);
      
      spectrum.push({
        wavelength,
        transmission: result.intensity,
      });
    }
    
    return spectrum;
  }
  
  /**
   * Simplified CIE color matching function approximation
   */
  private getCIEValues(wavelength: number): { xBar: number; yBar: number; zBar: number } {
    // Gaussian approximations for CIE 1931 2° observer
    const gaussian = (x: number, mean: number, sigma: number) =>
      Math.exp(-0.5 * Math.pow((x - mean) / sigma, 2));
    
    const xBar = 
      1.065 * gaussian(wavelength, 595.8, 33.33) +
      0.366 * gaussian(wavelength, 446.8, 19.44);
    
    const yBar = 
      1.014 * gaussian(wavelength, 556.3, 46.14);
    
    const zBar = 
      1.839 * gaussian(wavelength, 449.8, 22.87);
    
    return { xBar, yBar, zBar };
  }
  
  /**
   * XYZ to linear RGB conversion
   */
  private xyzToLinearRGB(X: number, Y: number, Z: number): { r: number; g: number; b: number } {
    // sRGB matrix (D65 adapted)
    const r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
    const g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
    const b = 0.0557 * X - 0.2040 * Y + 1.0570 * Z;
    
    return { r, g, b };
  }
}

