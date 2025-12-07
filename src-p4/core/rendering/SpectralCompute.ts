/**
 * Spectral Compute Pipeline
 * 
 * Manages the WebGPU compute pipeline for spectral calculations.
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
  width: number;        // Bounding box width (matches mask size)
  height: number;       // Bounding box height (matches mask size)
  temperature: number;  // For emission calculations
  layer: number;        // Render order (0 = background, higher = foreground)
  materialIndex: number; // Index into material textures
  maskIndex: number;    // Index into mask textures
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
  private maskTextures: GPUTexture[] = [];
  private cieTextures: { x: GPUTexture; y: GPUTexture; z: GPUTexture } | null = null;
  private cieScalesBuffer: GPUBuffer | null = null;
  
  // Samplers
  private textureSampler: GPUSampler | null = null;
  private maskSampler: GPUSampler | null = null;
  
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
    
    // Create sampler for mask textures (nearest for sharp edges)
    this.maskSampler = this.device.createSampler({
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
      magFilter: 'nearest',
      minFilter: 'nearest',
    });
    
    // Initialize CIE textures
    this.initCIETextures();
    
    // Initialize default mask textures (solid white)
    this.initDefaultMaskTextures();
    
    console.log('[SpectralCompute] Pipeline initialized');
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
   * Initialize default mask textures (solid white 1x1 textures)
   */
  private initDefaultMaskTextures(): void {
    // Create 4 default solid white mask textures
    for (let i = 0; i < 4; i++) {
      const texture = this.device.createTexture({
        label: `Default Mask ${i}`,
        size: { width: 1, height: 1, depthOrArrayLayers: 1 },
        format: 'r32float',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      
      // Fill with 1.0 (fully inside)
      this.device.queue.writeTexture(
        { texture },
        new Float32Array([1.0]),
        { bytesPerRow: 4, rowsPerImage: 1 },
        { width: 1, height: 1, depthOrArrayLayers: 1 }
      );
      
      this.maskTextures.push(texture);
    }
  }
  
  /**
   * Set mask textures from loaded mask data
   */
  setMaskTextures(textures: GPUTexture[]): void {
    // Destroy old textures (except defaults which are managed separately)
    // Note: We replace all textures, so destroy all existing ones
    for (const tex of this.maskTextures) {
      tex.destroy();
    }
    
    // Store new textures
    this.maskTextures = textures;
    
    // Ensure we have at least 4 textures (pad with solid white if needed)
    while (this.maskTextures.length < 4) {
      const texture = this.device.createTexture({
        label: `Padding Mask ${this.maskTextures.length}`,
        size: { width: 1, height: 1, depthOrArrayLayers: 1 },
        format: 'r32float',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      this.device.queue.writeTexture(
        { texture },
        new Float32Array([1.0]),
        { bytesPerRow: 4, rowsPerImage: 1 },
        { width: 1, height: 1, depthOrArrayLayers: 1 }
      );
      this.maskTextures.push(texture);
    }
    
    // Invalidate bind group
    this.bindGroup3 = null;
  }
  
  /**
   * Set material transmission spectra
   */
  setMaterials(materials: TransmissionSpectrum[]): void {
    // Destroy old textures
    for (const tex of this.materialTextures) {
      tex.destroy();
    }
    
    // Create new textures
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
    this.ensureBindGroups();
    
    const commandEncoder0 = this.device.createCommandEncoder();
    const passEncoder0 = commandEncoder0.beginComputePass();
    passEncoder0.setPipeline(this.pipeline);
    passEncoder0.setBindGroup(0, this.bindGroup0!);
    passEncoder0.setBindGroup(1, this.bindGroup1!);
    passEncoder0.setBindGroup(2, this.bindGroup2!);
    passEncoder0.setBindGroup(3, this.bindGroup3!);
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
    // Note: We don't need to recreate bind groups - the buffer object is the same, 
    // only its contents changed, which the GPU will read from the updated buffer
    
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
    // Padding at offset 44 (1 u32)
    
    this.device.queue.writeBuffer(this.paramsBuffer, 0, data);
  }
  
  /**
   * Update shapes storage buffer
   */
  private updateShapesBuffer(shapes: GPUShape[]): void {
    const shapeSize = 32; // 8 * 4 bytes (matches WGSL Shape struct)
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
    if (!this.pipeline) return;
    
    // Bind group 0: params, shapes, outputs
    if (!this.bindGroup0) {
      this.bindGroup0 = this.device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.paramsBuffer! } },
          { binding: 1, resource: { buffer: this.shapesBuffer! } },
          { binding: 2, resource: { buffer: this.rgbOutputBuffer! } },
          { binding: 3, resource: { buffer: this.spectrumOutputBuffer! } },
          { binding: 4, resource: { buffer: this.maxPerPixelBuffer! } },
        ],
      });
    }
    
    // Bind group 1: material textures
    if (!this.bindGroup1) {
      // Ensure we have at least 3 material textures
      while (this.materialTextures.length < 3) {
        const defaultSpectrum = new Float32Array(100).fill(1.0);
        this.materialTextures.push(
          create1DTexture(this.device, defaultSpectrum, `Default Material ${this.materialTextures.length}`)
        );
      }
      
      this.bindGroup1 = this.device.createBindGroup({
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
    if (!this.bindGroup2 && this.cieTextures) {
      this.bindGroup2 = this.device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(2),
        entries: [
          { binding: 0, resource: this.cieTextures.x.createView() },
          { binding: 1, resource: this.cieTextures.y.createView() },
          { binding: 2, resource: this.cieTextures.z.createView() },
          { binding: 3, resource: this.textureSampler! },
          { binding: 4, resource: { buffer: this.cieScalesBuffer! } },
        ],
      });
    }
    
    // Bind group 3: Mask textures
    if (!this.bindGroup3) {
      // Ensure we have at least 4 mask textures
      while (this.maskTextures.length < 4) {
        const texture = this.device.createTexture({
          label: `Padding Mask ${this.maskTextures.length}`,
          size: { width: 1, height: 1, depthOrArrayLayers: 1 },
          format: 'r32float',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        this.device.queue.writeTexture(
          { texture },
          new Float32Array([1.0]),
          { bytesPerRow: 4, rowsPerImage: 1 },
          { width: 1, height: 1, depthOrArrayLayers: 1 }
        );
        this.maskTextures.push(texture);
      }
      
      this.bindGroup3 = this.device.createBindGroup({
        layout: this.pipeline.getBindGroupLayout(3),
        entries: [
          { binding: 0, resource: this.maskTextures[0].createView() },
          { binding: 1, resource: this.maskTextures[1].createView() },
          { binding: 2, resource: this.maskTextures[2].createView() },
          { binding: 3, resource: this.maskTextures[3].createView() },
          { binding: 4, resource: this.maskSampler! },
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
    
    for (const tex of this.maskTextures) {
      tex.destroy();
    }
    
    this.cieTextures?.x.destroy();
    this.cieTextures?.y.destroy();
    this.cieTextures?.z.destroy();
  }
}


