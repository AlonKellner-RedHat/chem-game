/**
 * Phaser Bridge
 * 
 * Bridges WebGPU compute output to Phaser rendering.
 * Currently implements a Canvas2D fallback since Phaser 4 is in RC.
 * 
 * Once Phaser 4 is stable, this will be updated to use native
 * Phaser 4 WebGPU textures.
 */

import { SpectralComputePipeline, GPUShape, ComputeParams } from './SpectralCompute';
import { initWebGPU, WebGPUContext } from './WebGPUContext';
import { MaskManager, LoadedMSDF } from './MaskLoader';
import { BackgroundMode } from '../physics/config';

// Re-export GPUShape for convenience
export type { GPUShape } from './SpectralCompute';

/**
 * Renderer interface (abstracts Phaser version)
 */
export interface Renderer {
  /** Initialize the renderer */
  init(): Promise<boolean>;
  
  /** Resize the render target */
  resize(width: number, height: number): void;
  
  /** Set material transmission spectra */
  setMaterials(materials: Float32Array[]): void;
  
  /** Set shapes to render */
  setShapes(shapes: GPUShape[]): void;
  
  /** Set background mode */
  setBackgroundMode(mode: BackgroundMode): void;
  
  /** Enable/disable emission */
  setEmissionEnabled(enabled: boolean): void;
  
  /** Render and return ImageData */
  render(): Promise<ImageData>;
  
  /** Get spectrum at a point */
  sampleSpectrum(x: number, y: number): Promise<Float32Array>;
  
  /** Get global max intensity from last render (for plot normalization) */
  getGlobalMaxIntensity(): number;
  
  /** Load MSDF files for shapes */
  loadMasks(maskNames: string[]): Promise<void>;
  
  /** Get MSDF index by name */
  getMaskIndex(name: string): number;
  
  /** Get MSDF texture dimensions by name */
  getMaskDimensions(name: string): { width: number; height: number };
  
  /** Get MSDF pixel range */
  getMsdfPxRange(): number;
  
  /** Destroy resources */
  destroy(): void;
}

/**
 * WebGPU-based renderer
 */
export class WebGPURenderer implements Renderer {
  private context: WebGPUContext | null = null;
  private pipeline: SpectralComputePipeline | null = null;
  private maskManager: MaskManager | null = null;
  
  private width = 0;
  private height = 0;
  private shapes: GPUShape[] = [];
  private materials: Float32Array[] = [];
  private backgroundMode: BackgroundMode = 'normal';
  private emissionEnabled = true;
  
  // Spectrum sampling state
  private sampleX = -1;
  private sampleY = -1;
  private lastSpectrum: Float32Array = new Float32Array(0);
  
  // Global max intensity from last render
  private lastGlobalMax: number = 1.0;
  
  async init(): Promise<boolean> {
    this.context = await initWebGPU();
    if (!this.context) {
      return false;
    }
    
    this.pipeline = new SpectralComputePipeline(this.context.device);
    await this.pipeline.initialize();
    
    return true;
  }
  
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }
  
  setMaterials(materials: Float32Array[]): void {
    this.materials = materials;
    if (this.pipeline) {
      this.pipeline.setMaterials(materials);
    }
  }
  
  setShapes(shapes: GPUShape[]): void {
    this.shapes = shapes;
  }
  
  setBackgroundMode(mode: BackgroundMode): void {
    this.backgroundMode = mode;
  }
  
  setEmissionEnabled(enabled: boolean): void {
    this.emissionEnabled = enabled;
  }
  
  async render(): Promise<ImageData> {
    if (!this.pipeline || this.width === 0 || this.height === 0) {
      return new ImageData(1, 1);
    }
    
    // Use higher spectral resolution when sampling
    const isSampling = this.sampleX >= 0 && this.sampleY >= 0;
    
    const params: ComputeParams = {
      width: this.width,
      height: this.height,
      wavelengthMin: 200,
      wavelengthMax: 1000,
      // Use 5000 samples when sampling to resolve fine features like Na D-lines
      spectralResolution: isSampling ? 5000 : 16,
      backgroundMode: this.backgroundMode,
      enableEmission: this.emissionEnabled,
      sampleX: this.sampleX,
      sampleY: this.sampleY,
      msdfPxRange: this.getMsdfPxRange(),
    };
    
    // Two-pass compute with global normalization
    const result = await this.pipeline.compute(params, this.shapes);
    this.lastGlobalMax = result.globalMaxIntensity;
    
    // Read back RGB data
    const rgbData = await this.pipeline.readRGBOutput();
    
    // If sampling, also read spectrum data
    if (isSampling) {
      this.lastSpectrum = await this.pipeline.readSpectrumOutput();
    }
    
    // Convert to ImageData (RGBA)
    const imageData = new ImageData(this.width, this.height);
    for (let i = 0; i < this.width * this.height; i++) {
      imageData.data[i * 4 + 0] = Math.round(rgbData[i * 4 + 0] * 255);
      imageData.data[i * 4 + 1] = Math.round(rgbData[i * 4 + 1] * 255);
      imageData.data[i * 4 + 2] = Math.round(rgbData[i * 4 + 2] * 255);
      imageData.data[i * 4 + 3] = 255;
    }
    
    return imageData;
  }
  
  /**
   * Get global max intensity from last render
   */
  getGlobalMaxIntensity(): number {
    return this.lastGlobalMax;
  }
  
  /**
   * Load MSDF files for shapes
   */
  async loadMasks(maskNames: string[]): Promise<void> {
    if (!this.context || !this.pipeline) {
      console.warn('[WebGPURenderer] Cannot load MSDF - not initialized');
      return;
    }
    
    // Create MSDF manager if not exists
    if (!this.maskManager) {
      this.maskManager = new MaskManager(this.context.device, '/msdf');
    }
    
    // Load all requested MSDFs
    await this.maskManager.loadMasks(maskNames);
    
    // Set MSDF textures on pipeline
    const msdfs = this.maskManager.getAllMasks();
    this.pipeline.setMaskTextures(msdfs.map(m => m.texture));
    
    console.log(`[WebGPURenderer] Loaded ${maskNames.length} MSDF textures`);
  }
  
  /**
   * Get MSDF index by name
   */
  getMaskIndex(name: string): number {
    return this.maskManager?.getMaskIndex(name) ?? 0;
  }
  
  /**
   * Get MSDF texture dimensions by name
   */
  getMaskDimensions(name: string): { width: number; height: number } {
    const msdf = this.maskManager?.getMask(name);
    if (msdf) {
      return { width: msdf.width, height: msdf.height };
    }
    return { width: 256, height: 256 };  // Default
  }
  
  /**
   * Get MSDF pixel range
   */
  getMsdfPxRange(): number {
    return this.maskManager?.getPxRange() ?? 4.0;
  }
  
  /**
   * Set the sample point for spectrum readout
   */
  setSamplePoint(x: number, y: number): void {
    this.sampleX = x;
    this.sampleY = y;
  }
  
  async sampleSpectrum(x: number, y: number): Promise<Float32Array> {
    // Just update the sample point - spectrum will be read during next render
    this.sampleX = x;
    this.sampleY = y;
    return this.lastSpectrum;
  }
  
  destroy(): void {
    this.pipeline?.destroy();
    this.maskManager?.destroy();
    this.context?.device.destroy();
  }
}

/**
 * CPU fallback renderer (for browsers without WebGPU)
 */
export class CPURenderer implements Renderer {
  private width = 0;
  private height = 0;
  private shapes: GPUShape[] = [];
  private materials: Float32Array[] = [];
  private backgroundMode: BackgroundMode = 'normal';
  private emissionEnabled = true;
  private lastSpectrum: Float32Array = new Float32Array(320).fill(1.0);
  private lastGlobalMax: number = 1.0;
  
  async init(): Promise<boolean> {
    console.log('[CPURenderer] Using CPU fallback');
    return true;
  }
  
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }
  
  setMaterials(materials: Float32Array[]): void {
    this.materials = materials;
  }
  
  setShapes(shapes: GPUShape[]): void {
    this.shapes = shapes;
  }
  
  setBackgroundMode(mode: BackgroundMode): void {
    this.backgroundMode = mode;
  }
  
  setEmissionEnabled(enabled: boolean): void {
    this.emissionEnabled = enabled;
  }
  
  async render(): Promise<ImageData> {
    // CPU implementation would use the physics module
    // For now, return a placeholder
    const imageData = new ImageData(this.width, this.height);
    
    // Fill with background color based on mode
    const bgColor = this.backgroundMode === 'dark' ? 0 : 255;
    for (let i = 0; i < this.width * this.height; i++) {
      imageData.data[i * 4 + 0] = bgColor;
      imageData.data[i * 4 + 1] = bgColor;
      imageData.data[i * 4 + 2] = bgColor;
      imageData.data[i * 4 + 3] = 255;
    }
    
    return imageData;
  }
  
  async sampleSpectrum(x: number, y: number): Promise<Float32Array> {
    // Return cached spectrum for now
    return this.lastSpectrum;
  }
  
  getGlobalMaxIntensity(): number {
    return this.lastGlobalMax;
  }
  
  async loadMasks(_maskNames: string[]): Promise<void> {
    // CPU fallback doesn't use GPU masks
    console.log('[CPUFallbackRenderer] MSDF loading not supported in CPU mode');
  }
  
  getMaskIndex(_name: string): number {
    return 0; // CPU fallback returns default index
  }
  
  getMaskDimensions(_name: string): { width: number; height: number } {
    return { width: 256, height: 256 };  // Default
  }
  
  getMsdfPxRange(): number {
    return 4.0;  // Default
  }
  
  destroy(): void {
    // Nothing to clean up
  }
}

/**
 * Create the best available renderer
 */
export async function createRenderer(): Promise<Renderer> {
  // Try WebGPU first
  const gpuRenderer = new WebGPURenderer();
  if (await gpuRenderer.init()) {
    return gpuRenderer;
  }
  
  // Fall back to CPU
  console.warn('[createRenderer] WebGPU not available, using CPU fallback');
  const cpuRenderer = new CPURenderer();
  await cpuRenderer.init();
  return cpuRenderer;
}
