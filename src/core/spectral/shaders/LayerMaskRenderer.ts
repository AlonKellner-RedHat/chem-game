/**
 * LayerMaskRenderer - Generates shape masks for GPU rendering
 * 
 * Creates textures where each pixel contains:
 * - 0 if outside all shapes
 * - 1-255 as the shape index if inside a shape
 * 
 * Supports up to 6 layers, each with up to 255 shapes.
 * Shapes within a layer are non-overlapping.
 * Shapes between layers can overlap.
 * 
 * Used by UnifiedSpectralRenderer for determining which material
 * affects each pixel in each layer.
 */

import { ShapeGeometry } from '../geometry/ShapeGeometry';

/**
 * GPUShape - represents a shape for GPU rendering
 */
export interface GPUShape {
  id: string;
  layerIndex: number;        // 0-5 (back to front)
  geometry: ShapeGeometry;
  materialId: string;
  temperature: number;       // Kelvin
  scatteringCoeff: number;   // 0-1
  auraRadius: number;        // pixels
  auraDecay: number;         // 1/pixels
}

/**
 * LayerMaskConfig - configuration for layer mask generation
 */
export interface LayerMaskConfig {
  width: number;
  height: number;
  numLayers: number;
}

/**
 * Internal shape data with assigned index
 */
interface IndexedShape extends GPUShape {
  shapeIndex: number; // 1-255 within layer
}

/**
 * LayerMaskRenderer - manages shapes and generates mask textures
 */
export class LayerMaskRenderer {
  private config: LayerMaskConfig;
  
  // Shape storage by layer
  private layers: Map<number, IndexedShape[]> = new Map();
  
  // Quick lookup by ID
  private shapesById: Map<string, IndexedShape> = new Map();
  
  // Dirty tracking per layer
  private dirtyLayers: Set<number> = new Set();
  
  // Next available shape index per layer
  private nextIndices: Map<number, number> = new Map();
  
  constructor(config: LayerMaskConfig) {
    this.config = { ...config };
    
    // Initialize layers
    for (let i = 0; i < config.numLayers; i++) {
      this.layers.set(i, []);
      this.nextIndices.set(i, 1); // Start at 1 (0 = no shape)
    }
  }
  
  /**
   * Get number of layers
   */
  getNumLayers(): number {
    return this.config.numLayers;
  }
  
  /**
   * Get total shape count or count for a specific layer
   */
  getShapeCount(layerIndex?: number): number {
    if (layerIndex !== undefined) {
      return this.layers.get(layerIndex)?.length ?? 0;
    }
    return this.shapesById.size;
  }
  
  /**
   * Add a shape to a layer
   */
  addShape(shape: GPUShape): number {
    if (shape.layerIndex < 0 || shape.layerIndex >= this.config.numLayers) {
      throw new Error(`Invalid layer index: ${shape.layerIndex}`);
    }
    
    // Get next available index for this layer
    const shapeIndex = this.nextIndices.get(shape.layerIndex)!;
    if (shapeIndex > 255) {
      throw new Error(`Too many shapes in layer ${shape.layerIndex} (max 255)`);
    }
    
    // Create indexed shape
    const indexedShape: IndexedShape = {
      ...shape,
      shapeIndex,
    };
    
    // Store shape
    this.layers.get(shape.layerIndex)!.push(indexedShape);
    this.shapesById.set(shape.id, indexedShape);
    this.nextIndices.set(shape.layerIndex, shapeIndex + 1);
    
    // Mark layer as dirty
    this.dirtyLayers.add(shape.layerIndex);
    
    return shapeIndex;
  }
  
  /**
   * Remove a shape by ID
   */
  removeShape(id: string): boolean {
    const shape = this.shapesById.get(id);
    if (!shape) {
      return false;
    }
    
    // Remove from layer
    const layerShapes = this.layers.get(shape.layerIndex)!;
    const index = layerShapes.indexOf(shape);
    if (index >= 0) {
      layerShapes.splice(index, 1);
    }
    
    // Remove from ID map
    this.shapesById.delete(id);
    
    // Mark layer as dirty
    this.dirtyLayers.add(shape.layerIndex);
    
    return true;
  }
  
  /**
   * Get a shape by ID
   */
  getShape(id: string): GPUShape | null {
    return this.shapesById.get(id) ?? null;
  }
  
  /**
   * Get shape index for a shape ID
   */
  getShapeIndex(id: string): number {
    const shape = this.shapesById.get(id);
    return shape?.shapeIndex ?? 0;
  }
  
  /**
   * Move a shape to a new position
   */
  moveShape(id: string, newGeometry: ShapeGeometry): boolean {
    const shape = this.shapesById.get(id);
    if (!shape) {
      return false;
    }
    
    shape.geometry = newGeometry;
    this.dirtyLayers.add(shape.layerIndex);
    
    return true;
  }
  
  /**
   * Update shape temperature
   */
  setTemperature(id: string, temperature: number): boolean {
    const shape = this.shapesById.get(id);
    if (!shape) {
      return false;
    }
    
    shape.temperature = temperature;
    return true;
  }
  
  /**
   * Update shape scattering coefficient
   */
  setScattering(id: string, coefficient: number): boolean {
    const shape = this.shapesById.get(id);
    if (!shape) {
      return false;
    }
    
    shape.scatteringCoeff = coefficient;
    return true;
  }
  
  /**
   * Update shape aura properties
   */
  setAuraProperties(id: string, radius: number, decay: number): boolean {
    const shape = this.shapesById.get(id);
    if (!shape) {
      return false;
    }
    
    shape.auraRadius = radius;
    shape.auraDecay = decay;
    return true;
  }
  
  /**
   * Check if a layer needs mask regeneration
   */
  isLayerDirty(layerIndex: number): boolean {
    return this.dirtyLayers.has(layerIndex);
  }
  
  /**
   * Clear dirty flag for a layer
   */
  clearDirty(layerIndex: number): void {
    this.dirtyLayers.delete(layerIndex);
  }
  
  /**
   * Generate mask data for a layer
   * Returns Uint8Array where each element is the shape index (0-255)
   */
  generateLayerMask(layerIndex: number): Uint8Array {
    const { width, height } = this.config;
    const mask = new Uint8Array(width * height);
    
    const shapes = this.layers.get(layerIndex) ?? [];
    
    // For each pixel, find which shape (if any) contains it
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixelIndex = y * width + x;
        
        // Check each shape
        for (const shape of shapes) {
          if (shape.geometry.contains(x, y)) {
            mask[pixelIndex] = shape.shapeIndex;
            break; // Non-overlapping shapes, so first hit wins
          }
        }
      }
    }
    
    // Clear dirty flag
    this.dirtyLayers.delete(layerIndex);
    
    return mask;
  }
  
  /**
   * Get packed layer temperatures for shader uniforms
   * Returns 8 floats (2 vec4s) for up to 6 layers
   */
  getLayerTemperatures(): Float32Array {
    const temps = new Float32Array(8);
    
    for (let i = 0; i < this.config.numLayers; i++) {
      const shapes = this.layers.get(i) ?? [];
      // Use first shape's temperature or default to 300K
      temps[i] = shapes.length > 0 ? shapes[0].temperature : 300;
    }
    
    return temps;
  }
  
  /**
   * Get packed layer scattering coefficients for shader uniforms
   * Returns 8 floats (2 vec4s) for up to 6 layers
   */
  getLayerScattering(): Float32Array {
    const scatter = new Float32Array(8);
    
    for (let i = 0; i < this.config.numLayers; i++) {
      const shapes = this.layers.get(i) ?? [];
      // Use first shape's scattering or default to 0
      scatter[i] = shapes.length > 0 ? shapes[0].scatteringCoeff : 0;
    }
    
    return scatter;
  }
  
  /**
   * Get packed layer aura radii for shader uniforms
   * Returns 8 floats (2 vec4s) for up to 6 layers
   */
  getLayerAuraRadii(): Float32Array {
    const radii = new Float32Array(8);
    
    for (let i = 0; i < this.config.numLayers; i++) {
      const shapes = this.layers.get(i) ?? [];
      radii[i] = shapes.length > 0 ? shapes[0].auraRadius : 20;
    }
    
    return radii;
  }
  
  /**
   * Get packed layer aura decay rates for shader uniforms
   * Returns 8 floats (2 vec4s) for up to 6 layers
   */
  getLayerAuraDecay(): Float32Array {
    const decay = new Float32Array(8);
    
    for (let i = 0; i < this.config.numLayers; i++) {
      const shapes = this.layers.get(i) ?? [];
      decay[i] = shapes.length > 0 ? shapes[0].auraDecay : 0.1;
    }
    
    return decay;
  }
  
  /**
   * Get all shapes in a layer
   */
  getLayerShapes(layerIndex: number): GPUShape[] {
    return [...(this.layers.get(layerIndex) ?? [])];
  }
  
  /**
   * Clear all shapes
   */
  clear(): void {
    for (let i = 0; i < this.config.numLayers; i++) {
      this.layers.set(i, []);
      this.nextIndices.set(i, 1);
      this.dirtyLayers.add(i);
    }
    this.shapesById.clear();
  }
  
  /**
   * Resize the mask dimensions
   */
  resize(width: number, height: number): void {
    this.config.width = width;
    this.config.height = height;
    
    // Mark all layers as dirty
    for (let i = 0; i < this.config.numLayers; i++) {
      this.dirtyLayers.add(i);
    }
  }
}

