/**
 * Phaser Bridge
 * 
 * Bridges WebGPU compute output to Phaser rendering.
 * Currently implements a Canvas2D fallback since Phaser 4 is in RC.
 * 
 * Once Phaser 4 is stable, this will be updated to use native
 * Phaser 4 WebGPU textures.
 */

import { SpectralComputePipeline, GPUShape, ComputeParams, DebugCollector } from './SpectralCompute';
import { initWebGPU, WebGPUContext } from './WebGPUContext';
import { MaskManager, LoadedMSDF } from './MaskLoader';
import { BackgroundMode } from '../physics/config';
import { profiler } from './Profiler';

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
  
  /** Get the compute pipeline (for profiling integration) */
  getComputePipeline(): SpectralComputePipeline | null;
  
  /** Set material transmission spectra */
  setMaterials(materials: Float32Array[]): void;
  
  /** Set shapes to render */
  setShapes(shapes: GPUShape[]): void;
  
  /** Set background mode */
  setBackgroundMode(mode: BackgroundMode): void;
  
  /** Enable/disable emission */
  setEmissionEnabled(enabled: boolean): void;
  
  /** Set emission spread factor (fraction of emission that spreads sideways) */
  setEmissionSpreadFactor?(factor: number): void;
  
  /** Set emission aura blur sigma (in pixels) */
  setEmissionAuraSigma?(sigma: number): void;
  
  /** Render and return ImageData */
  render(): Promise<ImageData>;
  
  /** Get spectrum at a point */
  sampleSpectrum(x: number, y: number): Promise<Float32Array>;
  
  /** Get global max Y (luminance) from last render (for screen normalization) */
  getGlobalMaxIntensity(): number;
  
  /** Get global max spectral intensity from last render (for plot normalization) */
  getGlobalMaxSpectral(): number;
  
  /** Load MSDF files for shapes */
  loadMasks(maskNames: string[]): Promise<void>;
  
  /** Get MSDF index by name */
  getMaskIndex(name: string): number;
  
  /** Get MSDF texture dimensions by name */
  getMaskDimensions(name: string): { width: number; height: number };
  
  /** Get MSDF pixel range */
  getMsdfPxRange(): number;
  
  /** Get debug collector for layer order investigation */
  getDebugCollector(): DebugCollector | null;
  
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
  private emissionSpreadFactor = 0.3;  // Fraction of emission that spreads sideways (aura)
  private emissionAuraSigma = 3.0;     // Gaussian sigma for emission aura blur
  
  // Spectrum sampling state
  private sampleX = -1;
  private sampleY = -1;
  private lastSpectrum: Float32Array = new Float32Array(0);
  
  // Global max intensity from last render
  private lastGlobalMax: number = 1.0;      // Max Y (luminance) for screen
  private lastGlobalMaxSpectral: number = 1.0; // Max spectral intensity for plot
  
  // Caching state for spectrum - avoid recomputing when nothing changed
  private cachedSampleX = -1;
  private cachedSampleY = -1;
  private cachedShapesHash = '';
  private cachedBackgroundMode: BackgroundMode = 'normal';
  private cachedEmissionEnabled = true;
  private spectrumCacheValid = false;
  
  // Spectrum throttling - unconditional N-frame throttle
  private spectrumFrameCounter = 0;
  private spectrumThrottleFrames = 10;  // Compute spectrum every 10th frame (perf optimization)
  private lastComputedX = -1;
  private lastComputedY = -1;
  
  // Stationary detection - track when mouse stops moving
  private stationaryFrameCount = 0;
  private stationaryThreshold = 3;  // Must be stationary for N frames before considered "stopped"
  
  // Progressive resolution - draft during movement, full when stationary
  private static readonly DRAFT_RESOLUTION = 450;   // Fast preview during movement (10% of full)
  private static readonly FULL_RESOLUTION = 4500;   // High quality when stationary (900nm / 4500 = 0.2nm)
  private isDraftSpectrum = true;  // True if current spectrum is draft quality
  
  async init(): Promise<boolean> {
    this.context = await initWebGPU();
    if (!this.context) {
      return false;
    }
    
    this.pipeline = new SpectralComputePipeline(this.context.device);
    await this.pipeline.initialize();
    
    // Set profiler device capabilities
    profiler.setDeviceCapabilities(
      this.context.device.features.has('shader-f16'),
      this.context.device.features.has('timestamp-query')
    );
    
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
    // Invalidate spectrum cache when materials change
    this.invalidateSpectrumCache();
  }
  
  setShapes(shapes: GPUShape[]): void {
    this.shapes = shapes;
    // Invalidate spectrum cache when shapes change
    this.invalidateSpectrumCache();
  }
  
  setBackgroundMode(mode: BackgroundMode): void {
    this.backgroundMode = mode;
    // Invalidate spectrum cache when background changes
    this.invalidateSpectrumCache();
  }
  
  setEmissionEnabled(enabled: boolean): void {
    this.emissionEnabled = enabled;
    // Invalidate spectrum cache when emission setting changes
    this.invalidateSpectrumCache();
  }
  
  /**
   * Set emission spread factor (fraction of emission that spreads sideways)
   */
  setEmissionSpreadFactor(factor: number): void {
    this.emissionSpreadFactor = Math.max(0, Math.min(1, factor));
  }
  
  /**
   * Set emission aura blur sigma (in pixels)
   */
  setEmissionAuraSigma(sigma: number): void {
    this.emissionAuraSigma = Math.max(0, sigma);
  }
  
  /**
   * Compute a hash of shapes configuration for cache invalidation
   */
  private computeShapesHash(): string {
    // Simple hash based on shape properties that affect spectrum
    // Include particle densities which affect scattering
    return this.shapes.map(s => 
      `${s.x},${s.y},${s.width},${s.height},${s.materialIndex},${s.maskIndex},${s.temperature},${s.smallParticleDensity},${s.largeParticleDensity}`
    ).join('|');
  }
  
  /**
   * Check if spectrum cache is valid
   */
  private isSpectrumCacheValid(): boolean {
    if (!this.spectrumCacheValid) return false;
    if (this.sampleX !== this.cachedSampleX) return false;
    if (this.sampleY !== this.cachedSampleY) return false;
    if (this.backgroundMode !== this.cachedBackgroundMode) return false;
    if (this.emissionEnabled !== this.cachedEmissionEnabled) return false;
    if (this.computeShapesHash() !== this.cachedShapesHash) return false;
    return true;
  }
  
  /**
   * Update the spectrum cache
   */
  private updateSpectrumCache(): void {
    this.cachedSampleX = this.sampleX;
    this.cachedSampleY = this.sampleY;
    this.cachedBackgroundMode = this.backgroundMode;
    this.cachedEmissionEnabled = this.emissionEnabled;
    this.cachedShapesHash = this.computeShapesHash();
    this.spectrumCacheValid = true;
  }
  
  /**
   * Invalidate the spectrum cache (call when shapes/settings change)
   */
  invalidateSpectrumCache(): void {
    this.spectrumCacheValid = false;
    this.isDraftSpectrum = true;  // Reset to draft when cache invalidated
  }
  
  /**
   * Check if spectrum should be computed this frame based on throttling
   * Uses unconditional N-frame throttle - no exceptions for movement
   */
  private shouldComputeSpectrum(): boolean {
    // Increment frame counter
    this.spectrumFrameCounter++;
    
    // Only compute every N frames - no exceptions
    if (this.spectrumFrameCounter >= this.spectrumThrottleFrames) {
      this.spectrumFrameCounter = 0;
      return true;
    }
    
    return false;
  }
  
  /**
   * Check if mouse has been stationary for several frames
   * Used to determine when to upgrade from draft to full resolution
   */
  private isStationary(): boolean {
    const dx = Math.abs(this.sampleX - this.lastComputedX);
    const dy = Math.abs(this.sampleY - this.lastComputedY);
    
    // Within 1 pixel = considered same position
    if (dx <= 1 && dy <= 1) {
      this.stationaryFrameCount++;
      return this.stationaryFrameCount > this.stationaryThreshold;
    }
    
    // Mouse moved - reset counter
    this.stationaryFrameCount = 0;
    return false;
  }
  
  /**
   * Update tracking after spectrum was computed
   */
  private recordSpectrumComputed(): void {
    // Frame counter is reset in shouldComputeSpectrum()
    this.lastComputedX = this.sampleX;
    this.lastComputedY = this.sampleY;
  }

  async render(): Promise<ImageData> {
    if (!this.pipeline || this.width === 0 || this.height === 0) {
      return new ImageData(1, 1);
    }
    
    // Start profiling frame
    profiler.startFrame();
    
    const isSampling = this.sampleX >= 0 && this.sampleY >= 0;
    
    // Determine if we should compute spectrum this frame
    // Use both caching (scene unchanged) and throttling (frame skipping)
    const cacheValid = this.isSpectrumCacheValid();
    const throttleAllows = this.shouldComputeSpectrum();
    const stationary = this.isStationary();
    
    // Decide what to compute and at what resolution:
    // - If cache invalid and throttle allows: compute (draft if moving, full if stationary)
    // - If cache valid but stationary with draft: upgrade to full resolution
    let shouldCompute = false;
    let useFullResolution = false;
    
    if (isSampling && throttleAllows) {
      if (!cacheValid) {
        // Scene/position changed - compute spectrum
        shouldCompute = true;
        // Use full resolution only if stationary, otherwise draft for speed
        useFullResolution = stationary;
      } else if (stationary && this.isDraftSpectrum) {
        // Cache valid but we have draft and are stationary - upgrade to full
        shouldCompute = true;
        useFullResolution = true;
      }
    }
    
    // For profiler, record cache hit only when we truly skip computation
    profiler.recordCacheHit(!shouldCompute && isSampling);
    
    // Select resolution based on movement state
    const plotResolution = useFullResolution 
      ? WebGPURenderer.FULL_RESOLUTION 
      : WebGPURenderer.DRAFT_RESOLUTION;
    
    const params: ComputeParams = {
      width: this.width,
      height: this.height,
      wavelengthMin: 100,  // Extended to show band gap absorption
      wavelengthMax: 1000,
      // Always use 16 samples for color integration (fast)
      spectralResolution: 16,
      backgroundMode: this.backgroundMode,
      enableEmission: this.emissionEnabled,
      // Only pass sample point if we should compute spectrum
      sampleX: shouldCompute ? this.sampleX : -1,
      sampleY: shouldCompute ? this.sampleY : -1,
      msdfPxRange: this.getMsdfPxRange(),
      // Progressive resolution: draft during movement, full when stationary
      plotResolution,
      // Average spectrum over 5-pixel radius circle
      averageRadius: 5,
      // Compute spectrum for 11x11 box around sample point
      boxSize: 11,
      // Emission aura parameters
      emissionSpreadFactor: this.emissionSpreadFactor,
      emissionAuraSigma: this.emissionAuraSigma,
    };
    
    // Update profiler config
    profiler.updateConfig({
      boxSize: params.boxSize,
      plotResolution: params.plotResolution,
      averageRadius: params.averageRadius,
      colorResolution: params.spectralResolution,
      screenWidth: this.width,
      screenHeight: this.height,
    });
    
    // Two-pass compute with global normalization
    const result = await this.pipeline.compute(params, this.shapes);
    this.lastGlobalMax = result.globalMaxIntensity;
    this.lastGlobalMaxSpectral = result.globalMaxSpectral;
    
    // Record pass timings from pipeline
    profiler.recordPassTimings(this.pipeline.getPassTimings());
    
    // Read back RGB data
    const readbackStart = performance.now();
    const rgbData = await this.pipeline.readRGBOutput();
    
    // If we computed spectrum this frame, read it and update tracking
    if (shouldCompute) {
      this.lastSpectrum = await this.pipeline.readSpectrumOutput();
      this.updateSpectrumCache();
      this.recordSpectrumComputed();
      this.isDraftSpectrum = !useFullResolution;
    }
    const readbackEnd = performance.now();
    profiler.recordReadbackTime(readbackEnd - readbackStart);
    
    // Convert to ImageData (RGBA)
    const imageData = new ImageData(this.width, this.height);
    for (let i = 0; i < this.width * this.height; i++) {
      imageData.data[i * 4 + 0] = Math.round(rgbData[i * 4 + 0] * 255);
      imageData.data[i * 4 + 1] = Math.round(rgbData[i * 4 + 1] * 255);
      imageData.data[i * 4 + 2] = Math.round(rgbData[i * 4 + 2] * 255);
      imageData.data[i * 4 + 3] = 255;
    }
    
    // End profiling frame
    profiler.endFrame();
    
    return imageData;
  }
  
  /**
   * Get global max Y (luminance) from last render - for screen normalization
   */
  getGlobalMaxIntensity(): number {
    return this.lastGlobalMax;
  }
  
  /**
   * Get the debug collector for layer order investigation
   */
  getDebugCollector() {
    return this.pipeline?.debugCollector ?? null;
  }
  
  /**
   * Get the compute pipeline for profiling integration
   */
  getComputePipeline(): SpectralComputePipeline | null {
    return this.pipeline;
  }
  
  /**
   * Get global max spectral intensity from last render - for plot normalization
   */
  getGlobalMaxSpectral(): number {
    return this.lastGlobalMaxSpectral;
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
  private lastGlobalMaxSpectral: number = 1.0;
  
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
  
  setEmissionSpreadFactor(_factor: number): void {
    // No-op for CPU fallback
  }
  
  setEmissionAuraSigma(_sigma: number): void {
    // No-op for CPU fallback
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
  
  getGlobalMaxSpectral(): number {
    return this.lastGlobalMaxSpectral;
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
  
  getDebugCollector(): DebugCollector | null {
    return null;  // CPU renderer doesn't support debug collection
  }
  
  getComputePipeline(): SpectralComputePipeline | null {
    return null;  // CPU renderer doesn't have a compute pipeline
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
