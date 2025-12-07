/**
 * MaterialTextureArray - Per-layer material texture atlases for GPU rendering
 * 
 * Stores transmission spectra for multiple shapes in a 2D texture atlas:
 * - X axis: wavelength (normalized to wavelength range)
 * - Y axis: shape index (0-255)
 * 
 * Each layer has its own texture atlas, allowing efficient GPU lookup
 * of transmission values for any shape at any wavelength.
 */

/**
 * Configuration for material texture array
 */
export interface MaterialTextureConfig {
  /** Number of wavelength samples (texture width) */
  wavelengthResolution: number;
  /** Maximum shapes per layer (texture height) */
  maxShapesPerLayer: number;
  /** Number of layers */
  numLayers: number;
  /** Minimum wavelength in nm */
  wavelengthMin: number;
  /** Maximum wavelength in nm */
  wavelengthMax: number;
}

/**
 * Material data for a single shape
 */
export interface ShapeMaterialData {
  /** Shape index within layer (1-255, 0 = no shape) */
  shapeIndex: number;
  /** Layer index (0-5) */
  layerIndex: number;
  /** Transmission spectrum (0-1 values, length = wavelengthResolution) */
  transmissionSpectrum: Float32Array;
}

/**
 * MaterialTextureArray manages per-layer material textures
 */
export class MaterialTextureArray {
  private config: MaterialTextureConfig;
  
  // Layer data: layer index -> (shape index -> spectrum data)
  private layerData: Map<number, Float32Array>[] = [];
  
  // Dirty tracking per layer
  private dirtyLayers: Set<number> = new Set();
  
  constructor(config: MaterialTextureConfig) {
    this.config = { ...config };
    
    // Initialize layer data
    for (let i = 0; i < config.numLayers; i++) {
      // Create full transmission default for all shapes
      const layerSize = config.wavelengthResolution * config.maxShapesPerLayer;
      const layerBuffer = new Float32Array(layerSize);
      layerBuffer.fill(1.0); // Default: full transmission
      this.layerData.push(new Map([[i, layerBuffer]]));
    }
  }
  
  /**
   * Get wavelength resolution
   */
  getWavelengthResolution(): number {
    return this.config.wavelengthResolution;
  }
  
  /**
   * Get maximum shapes per layer
   */
  getMaxShapesPerLayer(): number {
    return this.config.maxShapesPerLayer;
  }
  
  /**
   * Get number of layers
   */
  getNumLayers(): number {
    return this.config.numLayers;
  }
  
  /**
   * Get the layer buffer directly
   */
  private getLayerBuffer(layerIndex: number): Float32Array {
    const layerSize = this.config.wavelengthResolution * this.config.maxShapesPerLayer;
    const map = this.layerData[layerIndex];
    
    if (!map.has(layerIndex)) {
      const buffer = new Float32Array(layerSize);
      buffer.fill(1.0);
      map.set(layerIndex, buffer);
    }
    
    return map.get(layerIndex)!;
  }
  
  /**
   * Set material data for a shape
   */
  setMaterialData(data: ShapeMaterialData): void {
    if (data.layerIndex < 0 || data.layerIndex >= this.config.numLayers) {
      throw new Error(`Invalid layer index: ${data.layerIndex}`);
    }
    
    if (data.shapeIndex < 0 || data.shapeIndex >= this.config.maxShapesPerLayer) {
      throw new Error(`Invalid shape index: ${data.shapeIndex}`);
    }
    
    const buffer = this.getLayerBuffer(data.layerIndex);
    const wRes = this.config.wavelengthResolution;
    const startIdx = data.shapeIndex * wRes;
    
    // Copy spectrum data into buffer
    for (let i = 0; i < wRes && i < data.transmissionSpectrum.length; i++) {
      buffer[startIdx + i] = data.transmissionSpectrum[i];
    }
    
    // Mark layer as dirty
    this.dirtyLayers.add(data.layerIndex);
  }
  
  /**
   * Get transmission value at a specific wavelength for a shape
   * 
   * @param layerIndex Layer index (0-5)
   * @param shapeIndex Shape index (0-255)
   * @param wavelengthNm Wavelength in nanometers
   * @returns Transmission value (0-1)
   */
  getTransmission(layerIndex: number, shapeIndex: number, wavelengthNm: number): number {
    if (layerIndex < 0 || layerIndex >= this.config.numLayers) {
      return 1.0;
    }
    
    if (shapeIndex < 0 || shapeIndex >= this.config.maxShapesPerLayer) {
      return 1.0;
    }
    
    const buffer = this.getLayerBuffer(layerIndex);
    const wRes = this.config.wavelengthResolution;
    
    // Normalize wavelength to texture coordinate
    const { wavelengthMin, wavelengthMax } = this.config;
    const t = (wavelengthNm - wavelengthMin) / (wavelengthMax - wavelengthMin);
    const clampedT = Math.max(0, Math.min(1, t));
    
    // Get fractional index for interpolation
    const floatIdx = clampedT * (wRes - 1);
    const idx0 = Math.floor(floatIdx);
    const idx1 = Math.min(idx0 + 1, wRes - 1);
    const frac = floatIdx - idx0;
    
    // Sample and interpolate
    const startIdx = shapeIndex * wRes;
    const val0 = buffer[startIdx + idx0];
    const val1 = buffer[startIdx + idx1];
    
    return val0 * (1 - frac) + val1 * frac;
  }
  
  /**
   * Generate texture data for a layer
   * Returns Float32Array ready for GPU upload
   */
  generateTextureData(layerIndex: number): Float32Array {
    const buffer = this.getLayerBuffer(layerIndex);
    
    // Clear dirty flag
    this.dirtyLayers.delete(layerIndex);
    
    // Return a copy of the buffer
    return new Float32Array(buffer);
  }
  
  /**
   * Check if a layer needs texture update
   */
  isLayerDirty(layerIndex: number): boolean {
    return this.dirtyLayers.has(layerIndex);
  }
  
  /**
   * Clear material data for a specific shape (reset to full transmission)
   */
  clearShape(layerIndex: number, shapeIndex: number): void {
    if (layerIndex < 0 || layerIndex >= this.config.numLayers) {
      return;
    }
    
    if (shapeIndex < 0 || shapeIndex >= this.config.maxShapesPerLayer) {
      return;
    }
    
    const buffer = this.getLayerBuffer(layerIndex);
    const wRes = this.config.wavelengthResolution;
    const startIdx = shapeIndex * wRes;
    
    // Reset to full transmission
    for (let i = 0; i < wRes; i++) {
      buffer[startIdx + i] = 1.0;
    }
    
    this.dirtyLayers.add(layerIndex);
  }
  
  /**
   * Clear all material data for a layer
   */
  clearLayer(layerIndex: number): void {
    if (layerIndex < 0 || layerIndex >= this.config.numLayers) {
      return;
    }
    
    const buffer = this.getLayerBuffer(layerIndex);
    buffer.fill(1.0);
    
    this.dirtyLayers.add(layerIndex);
  }
  
  /**
   * Clear all material data for all layers
   */
  clearAll(): void {
    for (let i = 0; i < this.config.numLayers; i++) {
      this.clearLayer(i);
    }
  }
  
  /**
   * Get texture dimensions for a layer
   */
  getTextureDimensions(): { width: number; height: number } {
    return {
      width: this.config.wavelengthResolution,
      height: this.config.maxShapesPerLayer,
    };
  }
}

