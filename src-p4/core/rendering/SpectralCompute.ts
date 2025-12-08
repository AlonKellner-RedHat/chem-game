/**
 * Spectral Compute Pipeline
 * 
 * Manages the WebGPU compute pipeline for spectral calculations.
 * Uses MSDF textures for resolution-independent shape rendering.
 * 
 * Multi-pass architecture for performance:
 * - Pass 0 (main): Color computation for all pixels (16 wavelengths) - PARALLEL
 * - Pass 1 (main): Normalization pass
 * - Pass 2 (computeSpectrumBox): High-res spectrum for boxSize² pixels - PARALLEL
 * - Pass 3 (averageSpectrum): GPU averaging over circular region
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
  spectralResolution: number;   // Low-res samples for color integration (16)
  backgroundMode: BackgroundMode;
  enableEmission: boolean;
  sampleX?: number;
  sampleY?: number;
  msdfPxRange?: number;         // MSDF pixel range (default: 4.0)
  numMaterials?: number;        // Number of materials in the palette
  plotResolution?: number;      // High-res samples for spectrum output (default: 5000)
  averageRadius?: number;       // Radius in pixels to average spectrum over (default: 5)
  boxSize?: number;             // Size of spectrum computation box (default: 30)
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
 * Profiling data for a single compute pass
 */
export interface PassTiming {
  name: string;
  startTime: number;
  endTime: number;
  duration: number;
}

/**
 * SpectralComputePipeline class
 */
export class SpectralComputePipeline {
  private device: GPUDevice;
  
  // Pipelines for each entry point
  private colorPipeline: GPUComputePipeline | null = null;
  private spectrumBoxPipeline: GPUComputePipeline | null = null;
  private averagePipeline: GPUComputePipeline | null = null;
  
  // Explicit bind group layouts (shared across all pipelines)
  private bindGroupLayout0: GPUBindGroupLayout | null = null;
  private bindGroupLayout1: GPUBindGroupLayout | null = null;
  private bindGroupLayout2: GPUBindGroupLayout | null = null;
  private bindGroupLayout3: GPUBindGroupLayout | null = null;
  private pipelineLayout: GPUPipelineLayout | null = null;
  
  // Buffers
  private paramsBuffer: GPUBuffer | null = null;
  private shapesBuffer: GPUBuffer | null = null;
  private rgbOutputBuffer: GPUBuffer | null = null;
  private spectrumOutputBuffer: GPUBuffer | null = null;
  private maxPerPixelBuffer: GPUBuffer | null = null;
  private spectrumBoxBuffer: GPUBuffer | null = null;
  
  // Global max intensity from last render (for plot normalization)
  private lastGlobalMaxIntensity: number = 1.0;
  
  // Textures
  private materialPaletteTexture: GPUTexture | null = null;
  private numMaterials: number = 0;
  private msdfTextures: GPUTexture[] = [];
  private cieTextures: { x: GPUTexture; y: GPUTexture; z: GPUTexture } | null = null;
  private cieScalesBuffer: GPUBuffer | null = null;
  
  // Samplers
  private textureSampler: GPUSampler | null = null;
  private msdfSampler: GPUSampler | null = null;
  
  // Bind groups (shared across pipelines where possible)
  private bindGroup0: GPUBindGroup | null = null;
  private bindGroup1: GPUBindGroup | null = null;
  private bindGroup2: GPUBindGroup | null = null;
  private bindGroup3: GPUBindGroup | null = null;
  
  // Maximum spectral resolution (buffer is always allocated at this size)
  private static readonly MAX_SPECTRAL_RESOLUTION = 5000;
  private static readonly DEFAULT_BOX_SIZE = 30;
  
  // Current dimensions and settings
  private width = 0;
  private height = 0;
  private plotResolution = SpectralComputePipeline.MAX_SPECTRAL_RESOLUTION;
  private boxSize = SpectralComputePipeline.DEFAULT_BOX_SIZE;
  
  // Profiling
  private timestampQuerySet: GPUQuerySet | null = null;
  private timestampBuffer: GPUBuffer | null = null;
  private timestampReadBuffer: GPUBuffer | null = null;
  private hasTimestampSupport = false;
  private lastPassTimings: PassTiming[] = [];
  
  constructor(device: GPUDevice) {
    this.device = device;
    this.hasTimestampSupport = device.features.has('timestamp-query');
  }
  
  /**
   * Initialize the compute pipeline
   */
  async initialize(): Promise<void> {
    // Create shader module (shared by all pipelines)
    const shaderModule = this.device.createShaderModule({
      label: 'Spectral Compute Shader',
      code: shaderCode,
    });
    
    // Create explicit bind group layouts (shared across all pipelines)
    this.createBindGroupLayouts();
    
    // Create pipeline layout with explicit bind group layouts
    this.pipelineLayout = this.device.createPipelineLayout({
      label: 'Spectral Pipeline Layout',
      bindGroupLayouts: [
        this.bindGroupLayout0!,
        this.bindGroupLayout1!,
        this.bindGroupLayout2!,
        this.bindGroupLayout3!,
      ],
    });
    
    // Create color pipeline (main entry point)
    this.colorPipeline = this.device.createComputePipeline({
      label: 'Color Compute Pipeline',
      layout: this.pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: 'main',
      },
    });
    
    // Create spectrum box pipeline
    this.spectrumBoxPipeline = this.device.createComputePipeline({
      label: 'Spectrum Box Pipeline',
      layout: this.pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: 'computeSpectrumBox',
      },
    });
    
    // Create averaging pipeline
    this.averagePipeline = this.device.createComputePipeline({
      label: 'Spectrum Average Pipeline',
      layout: this.pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: 'averageSpectrum',
      },
    });
    
    // Check if float32-filterable is enabled
    const hasFloat32Filterable = this.device.features.has('float32-filterable');
    
    // Create sampler for material and CIE textures (r32float)
    // Use filtering only if float32-filterable is available
    this.textureSampler = this.device.createSampler({
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
      magFilter: hasFloat32Filterable ? 'linear' : 'nearest',
      minFilter: hasFloat32Filterable ? 'linear' : 'nearest',
    });
    
    // Create sampler for MSDF textures (linear for smooth AA - rgba8unorm is always filterable)
    this.msdfSampler = this.device.createSampler({
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
      magFilter: 'linear',
      minFilter: 'linear',
    });
    
    // Initialize timestamp queries if supported
    if (this.hasTimestampSupport) {
      this.initTimestampQueries();
    }
    
    // Initialize CIE textures
    this.initCIETextures();
    
    // Initialize default material palette (single material with full transmission)
    this.initDefaultMaterialPalette();
    
    // Initialize default MSDF textures (solid - all inside)
    this.initDefaultMSDFTextures();
    
    // Initialize spectrum box buffer
    this.initSpectrumBoxBuffer();
    
    console.log('[SpectralCompute] Pipeline initialized');
    console.log(`[SpectralCompute] Timestamp queries: ${this.hasTimestampSupport ? 'enabled' : 'disabled'}`);
    console.log(`[SpectralCompute] f16 support: ${this.device.features.has('shader-f16') ? 'enabled' : 'disabled'}`);
  }
  
  /**
   * Initialize timestamp query resources
   */
  private initTimestampQueries(): void {
    // 8 timestamps: start/end for each of 4 passes
    this.timestampQuerySet = this.device.createQuerySet({
      type: 'timestamp',
      count: 8,
    });
    
    this.timestampBuffer = this.device.createBuffer({
      size: 8 * 8, // 8 u64 timestamps
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    });
    
    this.timestampReadBuffer = this.device.createBuffer({
      size: 8 * 8,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
  }
  
  /**
   * Create explicit bind group layouts shared across all pipelines
   * This ensures all entry points can use the same bind groups
   */
  private createBindGroupLayouts(): void {
    // Check if float32-filterable is enabled (allows filtering on r32float textures)
    const hasFloat32Filterable = this.device.features.has('float32-filterable');
    const floatSampleType = hasFloat32Filterable ? 'float' : 'unfilterable-float';
    const floatSamplerType = hasFloat32Filterable ? 'filtering' : 'non-filtering';
    
    // Bind group 0: params, shapes, outputs, spectrum box
    this.bindGroupLayout0 = this.device.createBindGroupLayout({
      label: 'Bind Group Layout 0 (Buffers)',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    });
    
    // Bind group 1: material palette texture (r32float)
    this.bindGroupLayout1 = this.device.createBindGroupLayout({
      label: 'Bind Group Layout 1 (Material Palette)',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: floatSampleType as GPUTextureSampleType } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, sampler: { type: floatSamplerType as GPUSamplerBindingType } },
      ],
    });
    
    // Bind group 2: CIE textures (r32float)
    this.bindGroupLayout2 = this.device.createBindGroupLayout({
      label: 'Bind Group Layout 2 (CIE)',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: floatSampleType as GPUTextureSampleType } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: floatSampleType as GPUTextureSampleType } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: floatSampleType as GPUTextureSampleType } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, sampler: { type: floatSamplerType as GPUSamplerBindingType } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ],
    });
    
    // Bind group 3: MSDF textures (rgba8unorm - always filterable)
    this.bindGroupLayout3 = this.device.createBindGroupLayout({
      label: 'Bind Group Layout 3 (MSDF)',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, sampler: { type: 'filtering' } },
      ],
    });
  }
  
  /**
   * Initialize default material palette (single material with full transmission)
   */
  private initDefaultMaterialPalette(): void {
    // Create a 1x1 palette with full transmission
    const defaultSpectrum = new Float32Array(100).fill(1.0);
    this.createMaterialPalette([defaultSpectrum]);
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
   * Initialize spectrum box buffer for parallel spectrum computation
   */
  private initSpectrumBoxBuffer(): void {
    // boxSize² pixels × plotResolution wavelengths × 4 bytes (f32)
    const bufferSize = this.boxSize * this.boxSize * this.plotResolution * 4;
    
    this.spectrumBoxBuffer = this.device.createBuffer({
      label: 'Spectrum Box',
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    
    console.log(`[SpectralCompute] Spectrum box buffer: ${(bufferSize / 1024 / 1024).toFixed(2)} MB`);
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
   * Set material transmission spectra as a 2D palette texture
   * Each row in the texture represents one material's transmission spectrum
   */
  setMaterials(materials: TransmissionSpectrum[]): void {
    if (materials.length === 0) {
      // Create default palette with single full-transmission material
      const defaultSpectrum = new Float32Array(100).fill(1.0);
      this.createMaterialPalette([defaultSpectrum]);
    } else {
      this.createMaterialPalette(materials);
    }
    
    // Invalidate bind group
    this.bindGroup1 = null;
  }
  
  /**
   * Create material palette texture from array of spectra
   * Creates a 2D texture where X=wavelength, Y=material index
   */
  private createMaterialPalette(materials: TransmissionSpectrum[]): void {
    if (materials.length === 0) return;
    
    // All spectra should have the same length
    const spectrumWidth = materials[0].length;
    const numMaterials = materials.length;
    
    // Create 2D texture data: width = spectrum resolution, height = number of materials
    // Using r32float format for precision
    const textureData = new Float32Array(spectrumWidth * numMaterials);
    
    for (let materialIdx = 0; materialIdx < numMaterials; materialIdx++) {
      const spectrum = materials[materialIdx];
      const rowOffset = materialIdx * spectrumWidth;
      
      for (let wavelengthIdx = 0; wavelengthIdx < spectrumWidth; wavelengthIdx++) {
        textureData[rowOffset + wavelengthIdx] = spectrum[wavelengthIdx] ?? 1.0;
      }
    }
    
    // Create the 2D palette texture
    // Note: old texture will be garbage collected
    this.materialPaletteTexture = this.device.createTexture({
      label: `Material Palette (${numMaterials} materials)`,
      size: { width: spectrumWidth, height: numMaterials, depthOrArrayLayers: 1 },
      format: 'r32float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    
    this.device.queue.writeTexture(
      { texture: this.materialPaletteTexture },
      textureData,
      { bytesPerRow: spectrumWidth * 4, rowsPerImage: numMaterials },
      { width: spectrumWidth, height: numMaterials, depthOrArrayLayers: 1 }
    );
    
    this.numMaterials = numMaterials;
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
   * Execute multi-pass compute
   * Pass 0: Compute color (all pixels, 16 wavelengths)
   * Pass 1: Normalization
   * Pass 2: Spectrum box (parallel, boxSize² pixels, high-res)
   * Pass 3: Average spectrum
   * 
   * @returns ComputeResult with global max intensity
   */
  async compute(params: ComputeParams, shapes: GPUShape[]): Promise<ComputeResult> {
    if (!this.colorPipeline) {
      throw new Error('Pipeline not initialized');
    }
    
    // Update settings
    this.plotResolution = params.plotResolution ?? SpectralComputePipeline.MAX_SPECTRAL_RESOLUTION;
    const newBoxSize = params.boxSize ?? SpectralComputePipeline.DEFAULT_BOX_SIZE;
    
    // Resize spectrum box buffer if needed
    if (newBoxSize !== this.boxSize) {
      this.boxSize = newBoxSize;
      this.spectrumBoxBuffer?.destroy();
      this.initSpectrumBoxBuffer();
      this.bindGroup0 = null;
    }
    
    // Resize if needed
    this.resize(params.width, params.height);
    
    // Update shapes buffer
    this.updateShapesBuffer(shapes);
    
    const isSampling = (params.sampleX ?? -1) >= 0 && (params.sampleY ?? -1) >= 0;
    
    const workgroupsX = Math.ceil(params.width / 8);
    const workgroupsY = Math.ceil(params.height / 8);
    
    this.lastPassTimings = [];
    
    // === PASS 0: Compute color (16 wavelengths per pixel) ===
    const pass0Start = performance.now();
    this.updateParamsBuffer(params, 0, 1.0);
    this.ensureBindGroups();
    
    const commandEncoder0 = this.device.createCommandEncoder();
    const passEncoder0 = commandEncoder0.beginComputePass();
    passEncoder0.setPipeline(this.colorPipeline);
    passEncoder0.setBindGroup(0, this.bindGroup0!);
    passEncoder0.setBindGroup(1, this.bindGroup1!);
    passEncoder0.setBindGroup(2, this.bindGroup2!);
    passEncoder0.setBindGroup(3, this.bindGroup3!);
    passEncoder0.dispatchWorkgroups(workgroupsX, workgroupsY);
    passEncoder0.end();
    this.device.queue.submit([commandEncoder0.finish()]);
    
    // Read max per pixel back to CPU and find global max
    const maxData = await this.readMaxPerPixel();
    let globalMax = 0.001;
    for (let i = 0; i < maxData.length; i++) {
      if (maxData[i] > globalMax) {
        globalMax = maxData[i];
      }
    }
    this.lastGlobalMaxIntensity = globalMax;
    
    const pass0End = performance.now();
    this.lastPassTimings.push({
      name: 'Pass 0 (Color)',
      startTime: pass0Start,
      endTime: pass0End,
      duration: pass0End - pass0Start,
    });
    
    // === PASS 1: Normalize and convert to RGB ===
    const pass1Start = performance.now();
    this.updateParamsBuffer(params, 1, globalMax);
    
    const commandEncoder1 = this.device.createCommandEncoder();
    const passEncoder1 = commandEncoder1.beginComputePass();
    passEncoder1.setPipeline(this.colorPipeline);
    passEncoder1.setBindGroup(0, this.bindGroup0!);
    passEncoder1.setBindGroup(1, this.bindGroup1!);
    passEncoder1.setBindGroup(2, this.bindGroup2!);
    passEncoder1.setBindGroup(3, this.bindGroup3!);
    passEncoder1.dispatchWorkgroups(workgroupsX, workgroupsY);
    passEncoder1.end();
    this.device.queue.submit([commandEncoder1.finish()]);
    await this.device.queue.onSubmittedWorkDone();
    
    const pass1End = performance.now();
    this.lastPassTimings.push({
      name: 'Pass 1 (Normalize)',
      startTime: pass1Start,
      endTime: pass1End,
      duration: pass1End - pass1Start,
    });
    
    // === PASS 2 & 3: Spectrum computation (only if sampling) ===
    if (isSampling && this.spectrumBoxPipeline && this.averagePipeline) {
      // PASS 2: Compute spectrum box (parallel)
      const pass2Start = performance.now();
      this.updateParamsBuffer(params, 0, globalMax);
      this.ensureBindGroups();
      
      const boxWorkgroupsX = Math.ceil(this.boxSize / 8);
      const boxWorkgroupsY = Math.ceil(this.boxSize / 8);
      
      const commandEncoder2 = this.device.createCommandEncoder();
      const passEncoder2 = commandEncoder2.beginComputePass();
      passEncoder2.setPipeline(this.spectrumBoxPipeline);
      passEncoder2.setBindGroup(0, this.bindGroup0!);
      passEncoder2.setBindGroup(1, this.bindGroup1!);
      passEncoder2.setBindGroup(2, this.bindGroup2!);
      passEncoder2.setBindGroup(3, this.bindGroup3!);
      passEncoder2.dispatchWorkgroups(boxWorkgroupsX, boxWorkgroupsY);
      passEncoder2.end();
      this.device.queue.submit([commandEncoder2.finish()]);
      await this.device.queue.onSubmittedWorkDone();
      
      const pass2End = performance.now();
      this.lastPassTimings.push({
        name: 'Pass 2 (Spectrum Box)',
        startTime: pass2Start,
        endTime: pass2End,
        duration: pass2End - pass2Start,
      });
      
      // PASS 3: Average spectrum (GPU reduction)
      const pass3Start = performance.now();
      this.ensureBindGroups();
      
      const avgWorkgroups = Math.ceil(this.plotResolution / 256);
      
      const commandEncoder3 = this.device.createCommandEncoder();
      const passEncoder3 = commandEncoder3.beginComputePass();
      passEncoder3.setPipeline(this.averagePipeline);
      passEncoder3.setBindGroup(0, this.bindGroup0!);
      passEncoder3.setBindGroup(1, this.bindGroup1!);
      passEncoder3.setBindGroup(2, this.bindGroup2!);
      passEncoder3.setBindGroup(3, this.bindGroup3!);
      passEncoder3.dispatchWorkgroups(avgWorkgroups);
      passEncoder3.end();
      this.device.queue.submit([commandEncoder3.finish()]);
      await this.device.queue.onSubmittedWorkDone();
      
      const pass3End = performance.now();
      this.lastPassTimings.push({
        name: 'Pass 3 (Average)',
        startTime: pass3Start,
        endTime: pass3End,
        duration: pass3End - pass3Start,
      });
    }
    
    return { globalMaxIntensity: globalMax };
  }
  
  /**
   * Get the global max intensity from the last render
   */
  getLastGlobalMaxIntensity(): number {
    return this.lastGlobalMaxIntensity;
  }
  
  /**
   * Get pass timings from last compute
   */
  getPassTimings(): PassTiming[] {
    return this.lastPassTimings;
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
      this.plotResolution * 4
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
   * Buffer layout (must match WGSL Params struct):
   * - width: u32 (0)
   * - height: u32 (4)
   * - wavelengthMin: f32 (8)
   * - wavelengthMax: f32 (12)
   * - spectralResolution: u32 (16)
   * - backgroundMode: u32 (20)
   * - enableEmission: u32 (24)
   * - sampleX: i32 (28)
   * - sampleY: i32 (32)
   * - isNormalizationPass: u32 (36)
   * - globalMaxIntensity: f32 (40)
   * - msdfPxRange: f32 (44)
   * - numMaterials: u32 (48)
   * - plotResolution: u32 (52)
   * - averageRadius: u32 (56)
   * - boxSize: u32 (60)
   * Total: 64 bytes
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
    view.setFloat32(44, params.msdfPxRange ?? 4.0, true);
    view.setUint32(48, this.numMaterials, true);
    view.setUint32(52, params.plotResolution ?? 5000, true);
    view.setUint32(56, params.averageRadius ?? 5, true);
    view.setUint32(60, this.boxSize, true);
    
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
   * Ensure bind groups are created using explicit layouts
   */
  private ensureBindGroups(): void {
    // Bind group 0: params, shapes, outputs, spectrum box
    if (!this.bindGroup0) {
      if (!this.paramsBuffer || !this.shapesBuffer || !this.rgbOutputBuffer || 
          !this.spectrumOutputBuffer || !this.maxPerPixelBuffer || !this.spectrumBoxBuffer ||
          !this.bindGroupLayout0) {
        console.error('[SpectralCompute] Cannot create bindGroup0 - missing buffers or layout');
        return;
      }
      this.bindGroup0 = this.device.createBindGroup({
        label: 'Bind Group 0 (Buffers)',
        layout: this.bindGroupLayout0,
        entries: [
          { binding: 0, resource: { buffer: this.paramsBuffer } },
          { binding: 1, resource: { buffer: this.shapesBuffer } },
          { binding: 2, resource: { buffer: this.rgbOutputBuffer } },
          { binding: 3, resource: { buffer: this.spectrumOutputBuffer } },
          { binding: 4, resource: { buffer: this.maxPerPixelBuffer } },
          { binding: 5, resource: { buffer: this.spectrumBoxBuffer } },
        ],
      });
    }
    
    // Bind group 1: material palette texture
    if (!this.bindGroup1) {
      if (!this.materialPaletteTexture) {
        this.initDefaultMaterialPalette();
      }
      
      if (!this.textureSampler || !this.materialPaletteTexture || !this.bindGroupLayout1) {
        console.error('[SpectralCompute] Cannot create bindGroup1 - missing resources or layout');
        return;
      }
      
      this.bindGroup1 = this.device.createBindGroup({
        label: 'Bind Group 1 (Material Palette)',
        layout: this.bindGroupLayout1,
        entries: [
          { binding: 0, resource: this.materialPaletteTexture.createView() },
          { binding: 1, resource: this.textureSampler },
        ],
      });
    }
    
    // Bind group 2: CIE textures
    if (!this.bindGroup2) {
      if (!this.cieTextures || !this.cieScalesBuffer || !this.textureSampler || !this.bindGroupLayout2) {
        console.error('[SpectralCompute] Cannot create bindGroup2 - missing CIE resources or layout');
        return;
      }
      this.bindGroup2 = this.device.createBindGroup({
        label: 'Bind Group 2 (CIE)',
        layout: this.bindGroupLayout2,
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
      
      if (!this.msdfSampler || !this.bindGroupLayout3) {
        console.error('[SpectralCompute] Cannot create bindGroup3 - missing MSDF sampler or layout');
        return;
      }
      
      this.bindGroup3 = this.device.createBindGroup({
        label: 'Bind Group 3 (MSDF)',
        layout: this.bindGroupLayout3,
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
   * Get the number of materials in the current palette
   */
  getNumMaterials(): number {
    return this.numMaterials;
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
    this.spectrumBoxBuffer?.destroy();
    this.cieScalesBuffer?.destroy();
    this.timestampBuffer?.destroy();
    this.timestampReadBuffer?.destroy();
    this.timestampQuerySet?.destroy();
    
    this.materialPaletteTexture?.destroy();
    
    for (const tex of this.msdfTextures) {
      tex.destroy();
    }
    
    this.cieTextures?.x.destroy();
    this.cieTextures?.y.destroy();
    this.cieTextures?.z.destroy();
  }
}
