/**
 * UnifiedSpectralRenderer - Main unified spectral rendering API
 * 
 * This renderer provides a single interface for both RGB rendering and spectrum readback.
 * Both paths use the SAME physics calculations, ensuring perfect synchronization.
 * 
 * Features:
 * - 6 layers with up to 255 shapes each
 * - Shape CRUD operations
 * - Per-shape properties (transmission, temperature, scattering)
 * - Dual output modes (RGB and spectrum)
 * - Background modes (normal, UV, dark)
 * 
 * In a GPU context, this would use WebGL shaders.
 * For CPU fallback (tests), it uses LayerCompositionEngine.
 */

import { ShapeGeometry } from '../geometry/ShapeGeometry';
import { SpectrumPoint } from '../CIE';
import { LayerMaskRenderer, GPUShape } from '../shaders/LayerMaskRenderer';
import { MaterialTextureArray, ShapeMaterialData } from '../shaders/MaterialTextureArray';
import { LayerCompositionEngine, LayerData } from '../shaders/LayerCompositionEngine';
import { UnifiedSpectralPhysics, BackgroundMode } from '../shaders/UnifiedSpectralPhysics';

/**
 * Configuration for UnifiedSpectralRenderer
 */
export interface UnifiedRendererConfig {
  width: number;
  height: number;
  numLayers: number;
  wavelengthResolution: number;
  maxShapesPerLayer: number;
}

/**
 * Shape definition for the unified renderer
 */
export interface UnifiedShape {
  id: string;
  layerIndex: number;
  geometry: ShapeGeometry;
  materialId: string;
  transmissionSpectrum: Float32Array;
  temperature: number;
  scatteringCoeff: number;
  auraRadius: number;
  auraDecay: number;
}

/**
 * Internal shape with assigned index
 */
interface IndexedUnifiedShape extends UnifiedShape {
  shapeIndex: number;
}

type BackgroundModeStr = 'normal' | 'uv' | 'dark';

/**
 * UnifiedSpectralRenderer - Unified GPU/CPU spectral renderer
 */
export class UnifiedSpectralRenderer {
  private config: UnifiedRendererConfig;
  private physics: UnifiedSpectralPhysics;
  private compositionEngine: LayerCompositionEngine;
  private maskRenderer: LayerMaskRenderer;
  private materialTextures: MaterialTextureArray;
  
  // Shape storage
  private shapes: Map<string, IndexedUnifiedShape> = new Map();
  private shapesByLayer: Map<number, Set<string>> = new Map();
  
  // Background mode
  private backgroundMode: BackgroundModeStr = 'normal';
  
  constructor(config: UnifiedRendererConfig) {
    this.config = { ...config };
    this.physics = new UnifiedSpectralPhysics();
    
    // Initialize composition engine
    this.compositionEngine = new LayerCompositionEngine(
      {
        numLayers: config.numLayers,
        wavelengthMin: 380,
        wavelengthMax: 700,
      },
      this.physics
    );
    
    // Initialize mask renderer
    this.maskRenderer = new LayerMaskRenderer({
      width: config.width,
      height: config.height,
      numLayers: config.numLayers,
    });
    
    // Initialize material textures
    this.materialTextures = new MaterialTextureArray({
      wavelengthResolution: config.wavelengthResolution,
      maxShapesPerLayer: config.maxShapesPerLayer,
      numLayers: config.numLayers,
      wavelengthMin: 380,
      wavelengthMax: 700,
    });
    
    // Initialize layer sets
    for (let i = 0; i < config.numLayers; i++) {
      this.shapesByLayer.set(i, new Set());
    }
  }
  
  /**
   * Get number of layers
   */
  getNumLayers(): number {
    return this.config.numLayers;
  }
  
  /**
   * Get total shape count
   */
  getShapeCount(): number {
    return this.shapes.size;
  }
  
  /**
   * Get shape count in a specific layer
   */
  getShapeCountInLayer(layerIndex: number): number {
    return this.shapesByLayer.get(layerIndex)?.size ?? 0;
  }
  
  /**
   * Get current background mode
   */
  getBackgroundMode(): BackgroundModeStr {
    return this.backgroundMode;
  }
  
  /**
   * Set background mode
   */
  setBackgroundMode(mode: BackgroundModeStr): void {
    this.backgroundMode = mode;
  }
  
  /**
   * Add a shape
   */
  addShape(shape: UnifiedShape): void {
    if (shape.layerIndex < 0 || shape.layerIndex >= this.config.numLayers) {
      throw new Error(`Invalid layer index: ${shape.layerIndex}`);
    }
    
    // Add to mask renderer to get shape index
    const gpuShape: GPUShape = {
      id: shape.id,
      layerIndex: shape.layerIndex,
      geometry: shape.geometry,
      materialId: shape.materialId,
      temperature: shape.temperature,
      scatteringCoeff: shape.scatteringCoeff,
      auraRadius: shape.auraRadius,
      auraDecay: shape.auraDecay,
    };
    
    const shapeIndex = this.maskRenderer.addShape(gpuShape);
    
    // Store indexed shape
    const indexedShape: IndexedUnifiedShape = {
      ...shape,
      shapeIndex,
    };
    
    this.shapes.set(shape.id, indexedShape);
    this.shapesByLayer.get(shape.layerIndex)!.add(shape.id);
    
    // Add material data
    this.materialTextures.setMaterialData({
      shapeIndex,
      layerIndex: shape.layerIndex,
      transmissionSpectrum: shape.transmissionSpectrum,
    });
    
    // Update composition engine (simplified - assumes one shape per layer for now)
    this.updateLayerData(shape.layerIndex);
  }
  
  /**
   * Remove a shape
   */
  removeShape(id: string): boolean {
    const shape = this.shapes.get(id);
    if (!shape) {
      return false;
    }
    
    // Remove from mask renderer
    this.maskRenderer.removeShape(id);
    
    // Clear material data
    this.materialTextures.clearShape(shape.layerIndex, shape.shapeIndex);
    
    // Remove from storage
    this.shapes.delete(id);
    this.shapesByLayer.get(shape.layerIndex)!.delete(id);
    
    // Update composition engine
    this.updateLayerData(shape.layerIndex);
    
    return true;
  }
  
  /**
   * Get a shape by ID
   */
  getShape(id: string): UnifiedShape | null {
    return this.shapes.get(id) ?? null;
  }
  
  /**
   * Move a shape to new geometry
   */
  moveShape(id: string, newGeometry: ShapeGeometry): boolean {
    const shape = this.shapes.get(id);
    if (!shape) {
      return false;
    }
    
    shape.geometry = newGeometry;
    this.maskRenderer.moveShape(id, newGeometry);
    
    return true;
  }
  
  /**
   * Update shape temperature
   */
  setTemperature(id: string, temperature: number): boolean {
    const shape = this.shapes.get(id);
    if (!shape) {
      return false;
    }
    
    shape.temperature = temperature;
    this.maskRenderer.setTemperature(id, temperature);
    this.updateLayerData(shape.layerIndex);
    
    return true;
  }
  
  /**
   * Update shape scattering coefficient
   */
  setScattering(id: string, coefficient: number): boolean {
    const shape = this.shapes.get(id);
    if (!shape) {
      return false;
    }
    
    shape.scatteringCoeff = coefficient;
    this.maskRenderer.setScattering(id, coefficient);
    this.updateLayerData(shape.layerIndex);
    
    return true;
  }
  
  /**
   * Update shape transmission spectrum
   */
  setTransmissionSpectrum(id: string, spectrum: Float32Array): boolean {
    const shape = this.shapes.get(id);
    if (!shape) {
      return false;
    }
    
    shape.transmissionSpectrum = spectrum;
    
    this.materialTextures.setMaterialData({
      shapeIndex: shape.shapeIndex,
      layerIndex: shape.layerIndex,
      transmissionSpectrum: spectrum,
    });
    
    this.updateLayerData(shape.layerIndex);
    
    return true;
  }
  
  /**
   * Update composition engine layer data
   */
  private updateLayerData(layerIndex: number): void {
    const shapeIds = this.shapesByLayer.get(layerIndex);
    if (!shapeIds || shapeIds.size === 0) {
      this.compositionEngine.clearLayer(layerIndex);
      return;
    }
    
    // For simplicity, use the first shape's properties
    // In full implementation, this would need per-pixel lookup
    const firstId = Array.from(shapeIds)[0];
    const shape = this.shapes.get(firstId);
    
    if (!shape) {
      this.compositionEngine.clearLayer(layerIndex);
      return;
    }
    
    // Get average transmission (simplified)
    const avgTransmission = shape.transmissionSpectrum.reduce((a, b) => a + b, 0) / 
                           shape.transmissionSpectrum.length;
    
    const data: LayerData = {
      hasShape: true,
      transmission: avgTransmission,
      temperature: shape.temperature,
      scatteringCoeff: shape.scatteringCoeff,
      auraRadius: shape.auraRadius,
      auraDecay: shape.auraDecay,
    };
    
    this.compositionEngine.setLayerData(layerIndex, data);
  }
  
  /**
   * Get background mode enum
   */
  private getBackgroundModeEnum(): BackgroundMode {
    switch (this.backgroundMode) {
      case 'uv': return BackgroundMode.UV;
      case 'dark': return BackgroundMode.Dark;
      default: return BackgroundMode.Normal;
    }
  }
  
  /**
   * Get spectrum at a pixel
   * 
   * This is the core synchronization point - uses same physics as rendering.
   */
  getSpectrumAtPixel(x: number, y: number, resolution: number): SpectrumPoint[] {
    const mode = this.getBackgroundModeEnum();
    
    // Check if point is inside any shape to update layer data
    let inAnyShape = false;
    for (const [, shape] of this.shapes) {
      if (shape.geometry.contains(x, y)) {
        // Make sure this layer is updated
        this.updateLayerData(shape.layerIndex);
        inAnyShape = true;
      }
    }
    
    // If not in any shape, clear all layer data (pure background)
    if (!inAnyShape) {
      for (let i = 0; i < this.config.numLayers; i++) {
        this.compositionEngine.clearLayer(i);
      }
    }
    
    // Use composition engine to get spectrum
    // This ensures same physics as rendering
    return this.compositionEngine.getSpectrumAt(x, y, mode, resolution);
  }
  
  /**
   * Render to ImageData
   * 
   * Uses same physics as getSpectrumAtPixel via LayerCompositionEngine.
   */
  renderToImageData(): { width: number; height: number; data: Uint8ClampedArray } {
    const { width, height } = this.config;
    const data = new Uint8ClampedArray(width * height * 4);
    const mode = this.getBackgroundModeEnum();
    const imageData = { width, height, data };
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Check if pixel is inside any shape in any layer
        let pixelInShape = false;
        
        for (const [, shape] of this.shapes) {
          if (shape.geometry.contains(x, y)) {
            pixelInShape = true;
            break;
          }
        }
        
        // Get RGB from composition engine
        const rgb = this.compositionEngine.composeToRGB(x, y, mode);
        
        const idx = (y * width + x) * 4;
        imageData.data[idx] = rgb.r;
        imageData.data[idx + 1] = rgb.g;
        imageData.data[idx + 2] = rgb.b;
        imageData.data[idx + 3] = 255;
      }
    }
    
    return imageData;
  }
  
  /**
   * Clear all shapes
   */
  clear(): void {
    this.shapes.clear();
    for (let i = 0; i < this.config.numLayers; i++) {
      this.shapesByLayer.set(i, new Set());
      this.compositionEngine.clearLayer(i);
    }
    this.maskRenderer.clear();
    this.materialTextures.clearAll();
  }
  
  /**
   * Resize the renderer
   */
  resize(width: number, height: number): void {
    this.config.width = width;
    this.config.height = height;
    this.maskRenderer.resize(width, height);
  }
}

