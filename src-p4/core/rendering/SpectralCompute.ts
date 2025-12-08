/**
 * Spectral Compute Pipeline
 * 
 * Manages the WebGPU compute pipeline for spectral calculations.
 * Uses MSDF textures for resolution-independent shape rendering.
 */

import {
  createStorageBuffer,
  createUniformBuffer,
  create1DTexture,
  readBufferData,
} from './WebGPUContext';
import { generateCIETextures } from '../physics/cie';
import { BackgroundMode } from '../physics/config';
import shaderCode from './SpectralCompute.wgsl?raw';

/**
 * Shape definition for GPU (matches WGSL Shape struct)
 */
export interface GPUShape {
  x: number;            // Position X
  y: number;            // Position Y
  width: number;        // Bounding box width
  height: number;       // Bounding box height
  temperature: number;  // For emission calculations
  layer: number;        // Render order (0 = background, higher = foreground)
  materialIndex: number; // Index into material textures
  maskIndex: number;    // Index into MSDF textures
  texWidth: number;     // MSDF texture width (for screenPxRange calculation)
  texHeight: number;    // MSDF texture height
}

/**
 * Spectral compute pipeline parameters
 */
export interface ComputeParams {
  width: number;
  height: number;
  wavelengthMin: number;
  wavelengthMax: number;
  spectralResolution: number;
  backgroundMode: BackgroundMode;
  enableEmission: boolean;
  sampleX?: number;
  sampleY?: number;
  msdfPxRange?: number;  // MSDF pixel range (default: 4.0)
}

/**
 * Result of compute including global max for normalization
 */
export interface ComputeResult {
  globalMaxIntensity: number;
}

/**
 * Material transmission spectrum
 */
export type TransmissionSpectrum = Float32Array;

/**
 * SpectralComputePipeline class
 */
export class SpectralComputePipeline {
  private device: GPUDevice;
  private pipeline: GPUComputePipeline | null = null;
  
  // Buffers
  private paramsBuffer: GPUBuffer | null = null;
  private shapesBuffer: GPUBuffer | null = null;
  private rgbOutputBuffer: GPUBuffer | null = null;
  private spectrumOutputBuffer: GPUBuffer | null = null;
  private maxPerPixelBuffer: GPUBuffer | null = null;
  
  // Global max intensity from last render (for plot normalization)
  private lastGlobalMaxIntensity: number = 1.0;
  
  // Textures
  private materialTextures: GPUTexture[] = [];
  private msdfTextures: GPUTexture[] = [];
  private cieTextures: { x: GPUTexture; y: GPUTexture; z: GPUTexture } | null = null;
  private cieScalesBuffer: GPUBuffer | null = null;
  
  // Samplers
  private textureSampler: GPUSampler | null = null;
  private msdfSampler: GPUSampler | null = null;
  
  // Bind groups
  private bindGroup0: GPUBindGroup | null = null;
  private bindGroup1: GPUBindGroup | null = null;
  private bindGroup2: GPUBindGroup | null = null;
  private bindGroup3: GPUBindGroup | null = null;
  
  // Maximum spectral resolution (buffer is always allocated at this size)
  private static readonly MAX_SPECTRAL_RESOLUTION = 5000;
  
  // Current dimensions
  private width = 0;
  private height = 0;
  private spectralResolution = SpectralComputePipeline.MAX_SPECTRAL_RESOLUTION;
  
  constructor(device: GPUDevice) {
    this.device = device;
  }
  
  /**
   * Initialize the compute pipeline
   */
  async initialize(): Promise<void> {
    // Create shader module
    const shaderModule = this.device.createShaderModule({
      label: 'Spectral Compute Shader',
      code: shaderCode,
    });
    
    // Create pipeline
    this.pipeline = this.device.createComputePipeline({
      label: 'Spectral Compute Pipeline',
      layout: 'auto',
      compute: {
        module: shaderModule,
        entryPoint: 'main',
      },
    });
    
    // Create sampler for material and CIE textures
    this.textureSampler = this.device.createSampler({
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
      magFilter: 'linear',
      minFilter: 'linear',
    });
    
    // Create sampler for MSDF textures (linear for smooth AA)
    this.msdfSampler = this.device.createSampler({
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
      magFilter: 'linear',
      minFilter: 'linear',
    });
    
    // Initialize CIE textures
    this.initCIETextures();
    
    // Initialize default material textures (full transmission)
    this.initDefaultMaterialTextures();
    
    // Initialize default MSDF textures (solid - all inside)
    this.initDefaultMSDFTextures();
    
    console.log('[SpectralCompute] Pipeline initialized');
  }
  
  /**
   * Initialize default material textures (full transmission)
   */
  private initDefaultMaterialTextures(): void {
    // Create 3 default material textures with full transmission
    for (let i = 0; i < 3; i++) {
      const defaultSpectrum = new Float32Array(100).fill(1.0);
      this.materialTextures.push(
        create1DTexture(this.device, defaultSpectrum, `Default Material ${i}`)
      );
    }
  }
  
  /**
   * Initialize CIE color matching function textures
   */
  private initCIETextures(): void {
    const resolution = 321; // 380-700nm at 1nm
    const cieData = generateCIETextures(380, 700, resolution);
    
    this.cieTextures = {
      x: create1DTexture(this.device, cieData.x, 'CIE X'),
      y: create1DTexture(this.device, cieData.y, 'CIE Y'),
      z: create1DTexture(this.device, cieData.z, 'CIE Z'),
    };
    
    // Create scales buffer
    this.cieScalesBuffer = createUniformBuffer(this.device, 16);
    this.device.queue.writeBuffer(
      this.cieScalesBuffer,
      0,
      new Float32Array([cieData.scales.x, cieData.scales.y, cieData.scales.z, 0])
    );
  }
  
  /**
   * Initialize default MSDF textures (solid - distance 0 = fully inside)
   * Format: rgba8unorm with all channels at 0.0 (inside the shape)
   */
  private initDefaultMSDFTextures(): void {
    // Create 4 default solid MSDF textures (all pixels inside shape)
    for (let i = 0; i < 4; i++) {
      const texture = this.device.createTexture({
        label: `Default MSDF ${i}`,
        size: { width: 1, height: 1, depthOrArrayLayers: 1 },
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      
      // Fill with value that represents "fully inside" 
      // MSDF: 0.0 = inside, 0.5 = edge, 1.0 = outside
      // So 0 (0.0 when sampled) = fully inside
      this.device.queue.writeTexture(
        { texture },
        new Uint8Array([0, 0, 0, 255]),  // RGB=0 (inside), A=255
        { bytesPerRow: 4, rowsPerImage: 1 },
        { width: 1, height: 1, depthOrArrayLayers: 1 }
      );
      
      this.msdfTextures.push(texture);
    }
  }
  
  /**
   * Set MSDF textures from loaded MSDF data
   * Note: We don't destroy old textures immediately as they may still be in use
   * by pending GPU commands. They will be garbage collected.
   */
  setMaskTextures(textures: GPUTexture[]): void {
    // Store new textures (old ones will be garbage collected)
    this.msdfTextures = textures;
    
    // Ensure we have at least 4 textures (pad with solid MSDF if needed)
    while (this.msdfTextures.length < 4) {
      const texture = this.device.createTexture({
        label: `Padding MSDF ${this.msdfTextures.length}`,
        size: { width: 1, height: 1, depthOrArrayLayers: 1 },
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      this.device.queue.writeTexture(
        { texture },
        new Uint8Array([0, 0, 0, 255]),  // Inside
        { bytesPerRow: 4, rowsPerImage: 1 },
        { width: 1, height: 1, depthOrArrayLayers: 1 }
      );
      this.msdfTextures.push(texture);
    }
    
    // Invalidate bind group
    this.bindGroup3 = null;
  }
  
  /**
   * Set material transmission spectra
   * Note: We don't destroy old textures immediately as they may still be in use
   * by pending GPU commands. They will be garbage collected.
   */
  setMaterials(materials: TransmissionSpectrum[]): void {
    // Create new textures (old ones will be garbage collected)
    this.materialTextures = materials.map((spectrum, i) =>
      create1DTexture(this.device, spectrum, `Material ${i}`)
    );
    
    // Invalidate bind group
    this.bindGroup1 = null;
  }
  
  /**
   * Resize output buffers
   */
  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) {
      return;
    }
    
    this.width = width;
    this.height = height;
    
    // Destroy old buffers
    this.rgbOutputBuffer?.destroy();
    this.spectrumOutputBuffer?.destroy();
    this.maxPerPixelBuffer?.destroy();
    
    // Create new output buffers
    const pixelCount = width * height;
    
    this.rgbOutputBuffer = this.device.createBuffer({
      label: 'RGB Output',
      size: pixelCount * 4 * 4, // vec4<f32> per pixel
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    
    this.spectrumOutputBuffer = this.device.createBuffer({
      label: 'Spectrum Output',
      size: SpectralComputePipeline.MAX_SPECTRAL_RESOLUTION * 4, // f32 per wavelength (max size)
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    
    this.maxPerPixelBuffer = this.device.createBuffer({
      label: 'Max Per Pixel',
      size: pixelCount * 4, // f32 per pixel
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    
    // Invalidate bind group
    this.bindGroup0 = null;
  }
  
  /**
   * Execute two-pass compute for global normalization
   * Pass 0: Compute spectral data, find max intensity per pixel
   * Pass 1: Normalize by global max and convert to RGB
   * 
   * @returns ComputeResult with global max intensity
   */
  async compute(params: ComputeParams, shapes: GPUShape[]): Promise<ComputeResult> {
    if (!this.pipeline) {
      throw new Error('Pipeline not initialized');
    }
    
    // Resize if needed
    this.resize(params.width, params.height);
    
    // Track current resolution for readback (buffer is always max size)
    this.spectralResolution = params.spectralResolution;
    
    // Update shapes buffer
    this.updateShapesBuffer(shapes);
    
    const workgroupsX = Math.ceil(params.width / 8);
    const workgroupsY = Math.ceil(params.height / 8);
    
    // === PASS 0: Compute spectral data and find max per pixel ===
    this.updateParamsBuffer(params, 0, 1.0); // isNormalizationPass=0, globalMax=1.0 (unused)
    
    // Ensure bind groups are created (after params buffer is created)
    // Force recreation of all bind groups to ensure consistency
    this.ensureBindGroups();
    
    // Verify all bind groups are valid
    if (!this.bindGroup0 || !this.bindGroup1 || !this.bindGroup2 || !this.bindGroup3) {
      console.error('[SpectralCompute] Bind groups not created properly:', {
        bindGroup0: !!this.bindGroup0,
        bindGroup1: !!this.bindGroup1,
        bindGroup2: !!this.bindGroup2,
        bindGroup3: !!this.bindGroup3,
      });
      throw new Error('Failed to create bind groups');
    }
    
    const commandEncoder0 = this.device.createCommandEncoder();
    const passEncoder0 = commandEncoder0.beginComputePass();
    passEncoder0.setPipeline(this.pipeline);
    passEncoder0.setBindGroup(0, this.bindGroup0);
    passEncoder0.setBindGroup(1, this.bindGroup1);
    passEncoder0.setBindGroup(2, this.bindGroup2);
    passEncoder0.setBindGroup(3, this.bindGroup3);
    passEncoder0.dispatchWorkgroups(workgroupsX, workgroupsY);
    passEncoder0.end();
    this.device.queue.submit([commandEncoder0.finish()]);
    
    // Read max per pixel back to CPU and find global max
    const maxData = await this.readMaxPerPixel();
    let globalMax = 0.001; // Minimum to avoid division by zero
    for (let i = 0; i < maxData.length; i++) {
      if (maxData[i] > globalMax) {
        globalMax = maxData[i];
      }
    }
    
    this.lastGlobalMaxIntensity = globalMax;
    
    // === PASS 1: Normalize by global max and convert to RGB ===
    this.updateParamsBuffer(params, 1, globalMax); // isNormalizationPass=1, globalMax
    
    // Re-ensure bind groups in case they were invalidated during async operations
    this.ensureBindGroups();
    
    const commandEncoder1 = this.device.createCommandEncoder();
    const passEncoder1 = commandEncoder1.beginComputePass();
    passEncoder1.setPipeline(this.pipeline);
    passEncoder1.setBindGroup(0, this.bindGroup0!);
    passEncoder1.setBindGroup(1, this.bindGroup1!);
    passEncoder1.setBindGroup(2, this.bindGroup2!);
    passEncoder1.setBindGroup(3, this.bindGroup3!);
    passEncoder1.dispatchWorkgroups(workgroupsX, workgroupsY);
    passEncoder1.end();
    this.device.queue.submit([commandEncoder1.finish()]);
    
    return { globalMaxIntensity: globalMax };
  }
  
  /**
   * Get the global max intensity from the last render
   */
  getLastGlobalMaxIntensity(): number {
    return this.lastGlobalMaxIntensity;
  }
  
  /**
   * Read RGB output back to CPU
   */
  async readRGBOutput(): Promise<Float32Array> {
    if (!this.rgbOutputBuffer) {
      throw new Error('No output buffer');
    }
    
    return readBufferData(
      this.device,
      this.rgbOutputBuffer,
      this.width * this.height * 4 * 4
    );
  }
  
  /**
   * Read spectrum output at sample point
   */
  async readSpectrumOutput(): Promise<Float32Array> {
    if (!this.spectrumOutputBuffer) {
      throw new Error('No spectrum buffer');
    }
    
    return readBufferData(
      this.device,
      this.spectrumOutputBuffer,
      this.spectralResolution * 4
    );
  }
  
  /**
   * Read max intensity per pixel (for finding global max)
   */
  private async readMaxPerPixel(): Promise<Float32Array> {
    if (!this.maxPerPixelBuffer) {
      throw new Error('No max buffer');
    }
    
    return readBufferData(
      this.device,
      this.maxPerPixelBuffer,
      this.width * this.height * 4
    );
  }
  
  /**
   * Get RGB buffer for direct binding
   */
  getRGBBuffer(): GPUBuffer | null {
    return this.rgbOutputBuffer;
  }
  
  /**
   * Update params uniform buffer
   */
  private updateParamsBuffer(
    params: ComputeParams,
    isNormalizationPass: number = 0,
    globalMaxIntensity: number = 1.0
  ): void {
    if (!this.paramsBuffer) {
      this.paramsBuffer = createUniformBuffer(this.device, 64);
    }
    
    const backgroundModeIndex =
      params.backgroundMode === 'normal' ? 0 :
      params.backgroundMode === 'uv' ? 1 : 2;
    
    const data = new ArrayBuffer(64);
    const view = new DataView(data);
    
    view.setUint32(0, params.width, true);
    view.setUint32(4, params.height, true);
    view.setFloat32(8, params.wavelengthMin, true);
    view.setFloat32(12, params.wavelengthMax, true);
    view.setUint32(16, params.spectralResolution, true);
    view.setUint32(20, backgroundModeIndex, true);
    view.setUint32(24, params.enableEmission ? 1 : 0, true);
    view.setInt32(28, params.sampleX ?? -1, true);
    view.setInt32(32, params.sampleY ?? -1, true);
    view.setUint32(36, isNormalizationPass, true);
    view.setFloat32(40, globalMaxIntensity, true);
    view.setFloat32(44, params.msdfPxRange ?? 4.0, true);  // MSDF pixel range
    
    this.device.queue.writeBuffer(this.paramsBuffer, 0, data);
  }
  
  /**
   * Update shapes storage buffer
   * Shape struct size: 48 bytes (12 fields * 4 bytes each)
   */
  private updateShapesBuffer(shapes: GPUShape[]): void {
    // Shape struct in WGSL:
    // x, y, width, height, temperature (5 f32)
    // layer, materialIndex, maskIndex (3 u32)
    // texWidth, texHeight (2 f32)
    // _padding1, _padding2 (2 u32)
    // Total: 12 * 4 = 48 bytes
    const shapeSize = 48;
    const data = new ArrayBuffer(Math.max(shapes.length, 1) * shapeSize);
    const view = new DataView(data);
    
    for (let i = 0; i < shapes.length; i++) {
      const offset = i * shapeSize;
      const shape = shapes[i];
      
      view.setFloat32(offset + 0, shape.x, true);
      view.setFloat32(offset + 4, shape.y, true);
      view.setFloat32(offset + 8, shape.width, true);
      view.setFloat32(offset + 12, shape.height, true);
      view.setFloat32(offset + 16, shape.temperature, true);
      view.setUint32(offset + 20, shape.layer, true);
      view.setUint32(offset + 24, shape.materialIndex, true);
      view.setUint32(offset + 28, shape.maskIndex, true);
      view.setFloat32(offset + 32, shape.texWidth ?? 256, true);
      view.setFloat32(offset + 36, shape.texHeight ?? 256, true);
      // _padding1, _padding2 at 40, 44 (leave as 0)
    }
    
    // Recreate buffer if size changed
    if (!this.shapesBuffer || this.shapesBuffer.size < data.byteLength) {
      this.shapesBuffer?.destroy();
      this.shapesBuffer = this.device.createBuffer({
        label: 'Shapes',
        size: data.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      this.bindGroup0 = null;
    }
    
    this.device.queue.writeBuffer(this.shapesBuffer, 0, data);
  }
  
  /**
   * Ensure bind groups are created
   */
  private ensureBindGroups(): void {
    if (!this.pipeline) {
      console.error('[SpectralCompute] ensureBindGroups called but pipeline is null');
      return;
    }
    
    // Bind group 0: params, shapes, outputs
    if (!this.bindGroup0) {
      if (!this.paramsBuffer || !this.shapesBuffer || !this.rgbOutputBuffer || 
          !this.spectrumOutputBuffer || !this.maxPerPixelBuffer) {
        console.error('[SpectralCompute] Cannot create bindGroup0 - missing buffers');
        return;
      }
      this.bindGroup0 = this.device.createBindGroup({
        label: 'Bind Group 0 (Buffers)',
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.paramsBuffer } },
          { binding: 1, resource: { buffer: this.shapesBuffer } },
          { binding: 2, resource: { buffer: this.rgbOutputBuffer } },
          { binding: 3, resource: { buffer: this.spectrumOutputBuffer } },
          { binding: 4, resource: { buffer: this.maxPerPixelBuffer } },
        ],
      });
    }
    
    // Bind group 1: material textures
    if (!this.bindGroup1) {
      // Ensure we have at least 3 material textures
      while (this.materialTextures.length < 3) {
        const defaultSpectrum = new Float32Array(100).fill(1.0);
        this.materialTextures.push(
          create1DTexture(this.device, defaultSpectrum, `Fallback Material ${this.materialTextures.length}`)
        );
      }
      
      if (!this.textureSampler) {
        console.error('[SpectralCompute] Cannot create bindGroup1 - missing sampler');
        return;
      }
      
      this.bindGroup1 = this.device.createBindGroup({
        label: 'Bind Group 1 (Materials)',
        layout: this.pipeline.getBindGroupLayout(1),
        entries: [
          { binding: 0, resource: this.materialTextures[0].createView() },
          { binding: 1, resource: this.materialTextures[1].createView() },
          { binding: 2, resource: this.materialTextures[2].createView() },
          { binding: 3, resource: this.textureSampler! },
        ],
      });
    }
    
    // Bind group 2: CIE textures
    if (!this.bindGroup2) {
      if (!this.cieTextures || !this.cieScalesBuffer || !this.textureSampler) {
        console.error('[SpectralCompute] Cannot create bindGroup2 - missing CIE resources');
        return;
      }
      this.bindGroup2 = this.device.createBindGroup({
        label: 'Bind Group 2 (CIE)',
        layout: this.pipeline.getBindGroupLayout(2),
        entries: [
          { binding: 0, resource: this.cieTextures.x.createView() },
          { binding: 1, resource: this.cieTextures.y.createView() },
          { binding: 2, resource: this.cieTextures.z.createView() },
          { binding: 3, resource: this.textureSampler },
          { binding: 4, resource: { buffer: this.cieScalesBuffer } },
        ],
      });
    }
    
    // Bind group 3: MSDF textures
    if (!this.bindGroup3) {
      // Ensure we have at least 4 MSDF textures
      while (this.msdfTextures.length < 4) {
        const texture = this.device.createTexture({
          label: `Fallback MSDF ${this.msdfTextures.length}`,
          size: { width: 1, height: 1, depthOrArrayLayers: 1 },
          format: 'rgba8unorm',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        this.device.queue.writeTexture(
          { texture },
          new Uint8Array([0, 0, 0, 255]),  // Inside
          { bytesPerRow: 4, rowsPerImage: 1 },
          { width: 1, height: 1, depthOrArrayLayers: 1 }
        );
        this.msdfTextures.push(texture);
      }
      
      if (!this.msdfSampler) {
        console.error('[SpectralCompute] Cannot create bindGroup3 - missing MSDF sampler');
        return;
      }
      
      this.bindGroup3 = this.device.createBindGroup({
        label: 'Bind Group 3 (MSDF)',
        layout: this.pipeline.getBindGroupLayout(3),
        entries: [
          { binding: 0, resource: this.msdfTextures[0].createView() },
          { binding: 1, resource: this.msdfTextures[1].createView() },
          { binding: 2, resource: this.msdfTextures[2].createView() },
          { binding: 3, resource: this.msdfTextures[3].createView() },
          { binding: 4, resource: this.msdfSampler },
        ],
      });
    }
  }
  
  /**
   * Destroy all resources
   */
  destroy(): void {
    this.paramsBuffer?.destroy();
    this.shapesBuffer?.destroy();
    this.rgbOutputBuffer?.destroy();
    this.spectrumOutputBuffer?.destroy();
    this.maxPerPixelBuffer?.destroy();
    this.cieScalesBuffer?.destroy();
    
    for (const tex of this.materialTextures) {
      tex.destroy();
    }
    
    for (const tex of this.msdfTextures) {
      tex.destroy();
    }
    
    this.cieTextures?.x.destroy();
    this.cieTextures?.y.destroy();
    this.cieTextures?.z.destroy();
  }
}
