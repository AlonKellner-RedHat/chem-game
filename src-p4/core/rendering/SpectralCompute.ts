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
  smallParticleDensity: number;  // Rayleigh scattering particle density (particles/cm³)
  largeParticleDensity: number;  // Mie scattering particle density (particles/cm³)
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
  emissionSpreadFactor?: number; // Fraction of emission that spreads sideways (default: 0.3)
  emissionAuraSigma?: number;    // Gaussian sigma for emission aura blur (default: 3.0)
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
  
  // Scattering blur pipelines (per-layer processing)
  private initBackgroundPipeline: GPUComputePipeline | null = null;
  private layerAbsorptionPipeline: GPUComputePipeline | null = null;
  private blurHorizontalPipeline: GPUComputePipeline | null = null;
  private blurVerticalPipeline: GPUComputePipeline | null = null;
  private integrateSpectrumPipeline: GPUComputePipeline | null = null;
  private combineScatteredPipeline: GPUComputePipeline | null = null;
  private blurEmissionAuraHPipeline: GPUComputePipeline | null = null;
  private blurEmissionAuraVPipeline: GPUComputePipeline | null = null;
  
  // Explicit bind group layouts (shared across all pipelines)
  // NOTE: WebGPU has a maximum of 4 bind groups
  private bindGroupLayout0: GPUBindGroupLayout | null = null;  // Buffers (including spectral)
  private bindGroupLayout1: GPUBindGroupLayout | null = null;  // Material palette
  private bindGroupLayout2: GPUBindGroupLayout | null = null;  // CIE textures
  private bindGroupLayout3: GPUBindGroupLayout | null = null;  // MSDF textures
  private pipelineLayout: GPUPipelineLayout | null = null;
  private blurPipelineLayout: GPUPipelineLayout | null = null; // Same as pipelineLayout (uses extended bind group 0)
  
  // Buffers
  private paramsBuffer: GPUBuffer | null = null;
  private shapesBuffer: GPUBuffer | null = null;
  private maxPerPixelBuffer: GPUBuffer | null = null;
  private spectrumBoxBuffer: GPUBuffer | null = null;
  
  // Double-buffered output buffers (compute to one, read from other)
  private rgbOutputBuffers: [GPUBuffer | null, GPUBuffer | null] = [null, null];
  private spectrumOutputBuffers: [GPUBuffer | null, GPUBuffer | null] = [null, null];
  private currentBufferIndex: 0 | 1 = 0;
  private frameCount: number = 0;  // Track frames for first-frame handling
  
  // Spectral buffers for per-layer scattering blur (ping-pong)
  // Each buffer stores 16 wavelength intensities per pixel
  private spectralBufferA: GPUBuffer | null = null;
  private spectralBufferB: GPUBuffer | null = null;
  private scatteringSigmaBuffer: GPUBuffer | null = null; // Per-pixel blur sigma
  private scatterSourceBuffer: GPUBuffer | null = null;   // Scattered light to be blurred
  private emissionAuraBuffer: GPUBuffer | null = null;    // Emission aura to be blurred
  private static readonly SPECTRAL_SAMPLES = 16;
  
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
  private spectralBufferSwapped: boolean = false; // Track which buffer is input vs output
  
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
    
    // Create blur pipeline layout (uses same bind groups as main pipeline)
    // Spectral buffers are now in bind group 0 (bindings 6-8)
    this.blurPipelineLayout = this.device.createPipelineLayout({
      label: 'Blur Pipeline Layout',
      bindGroupLayouts: [
        this.bindGroupLayout0!,
        this.bindGroupLayout1!,
        this.bindGroupLayout2!,
        this.bindGroupLayout3!,
      ],
    });
    
    // Create per-layer scattering blur pipelines
    this.initBackgroundPipeline = this.device.createComputePipeline({
      label: 'Init Background Spectrum Pipeline',
      layout: this.blurPipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: 'initBackgroundSpectrum',
      },
    });
    
    this.layerAbsorptionPipeline = this.device.createComputePipeline({
      label: 'Layer Absorption Pipeline',
      layout: this.blurPipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: 'applyLayerAbsorption',
      },
    });
    
    this.blurHorizontalPipeline = this.device.createComputePipeline({
      label: 'Blur Horizontal Pipeline',
      layout: this.blurPipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: 'blurHorizontal',
      },
    });
    
    this.blurVerticalPipeline = this.device.createComputePipeline({
      label: 'Blur Vertical Pipeline',
      layout: this.blurPipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: 'blurVertical',
      },
    });
    
    this.integrateSpectrumPipeline = this.device.createComputePipeline({
      label: 'Integrate Spectrum Pipeline',
      layout: this.blurPipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: 'integrateSpectrum',
      },
    });
    
    this.combineScatteredPipeline = this.device.createComputePipeline({
      label: 'Combine Scattered Pipeline',
      layout: this.blurPipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: 'combineScattered',
      },
    });
    
    this.blurEmissionAuraHPipeline = this.device.createComputePipeline({
      label: 'Blur Emission Aura H Pipeline',
      layout: this.blurPipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: 'blurEmissionAuraH',
      },
    });
    
    this.blurEmissionAuraVPipeline = this.device.createComputePipeline({
      label: 'Blur Emission Aura V Pipeline',
      layout: this.blurPipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: 'blurEmissionAuraV',
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
    
    // Bind group 0: params, shapes, outputs, spectrum box, spectral buffers
    this.bindGroupLayout0 = this.device.createBindGroupLayout({
      label: 'Bind Group Layout 0 (Buffers)',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        // Spectral buffers for scattering blur (bindings 6-10)
        { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, // Spectral input
        { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, // Spectral output
        { binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, // Scattering sigma
        { binding: 9, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, // Scatter source
        { binding: 10, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, // Emission aura
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
    // boxSize² pixels × plotResolution wavelengths × 2 bytes (f16 for reduced memory bandwidth)
    const bufferSize = this.boxSize * this.boxSize * this.plotResolution * 2;
    
    this.spectrumBoxBuffer = this.device.createBuffer({
      label: 'Spectrum Box (f16)',
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    
    console.log(`[SpectralCompute] Spectrum box buffer (f16): ${(bufferSize / 1024 / 1024).toFixed(2)} MB`);
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
   * Resize output buffers (double-buffered)
   */
  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) {
      return;
    }
    
    this.width = width;
    this.height = height;
    
    // Destroy old buffers
    this.rgbOutputBuffers[0]?.destroy();
    this.rgbOutputBuffers[1]?.destroy();
    this.spectrumOutputBuffers[0]?.destroy();
    this.spectrumOutputBuffers[1]?.destroy();
    this.maxPerPixelBuffer?.destroy();
    
    // Create new output buffers (double-buffered for RGB and spectrum)
    const pixelCount = width * height;
    
    // Create two RGB output buffers
    for (let i = 0; i < 2; i++) {
      this.rgbOutputBuffers[i] = this.device.createBuffer({
        label: `RGB Output ${i}`,
        size: pixelCount * 4 * 4, // vec4<f32> per pixel
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      });
    }
    
    // Create two spectrum output buffers
    for (let i = 0; i < 2; i++) {
      this.spectrumOutputBuffers[i] = this.device.createBuffer({
        label: `Spectrum Output ${i}`,
        size: SpectralComputePipeline.MAX_SPECTRAL_RESOLUTION * 4, // f32 per wavelength
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      });
    }
    
    // Max per pixel buffer (single - only used for CPU reduction)
    this.maxPerPixelBuffer = this.device.createBuffer({
      label: 'Max Per Pixel',
      size: pixelCount * 4, // f32 per pixel
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    
    // Spectral buffers for per-layer scattering blur (ping-pong)
    // Each stores 16 wavelength intensities per pixel using f16 for memory efficiency
    this.spectralBufferA?.destroy();
    this.spectralBufferB?.destroy();
    this.scatteringSigmaBuffer?.destroy();
    
    const spectralBufferSize = pixelCount * SpectralComputePipeline.SPECTRAL_SAMPLES * 2; // f16 = 2 bytes
    
    this.spectralBufferA = this.device.createBuffer({
      label: 'Spectral Buffer A',
      size: spectralBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    
    this.spectralBufferB = this.device.createBuffer({
      label: 'Spectral Buffer B',
      size: spectralBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    
    // Per-pixel scattering sigma buffer (one f32 per pixel, maximum sigma across wavelengths)
    this.scatteringSigmaBuffer = this.device.createBuffer({
      label: 'Scattering Sigma Buffer',
      size: pixelCount * 4, // f32 per pixel
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    
    // Scatter source buffer (light to be blurred)
    this.scatterSourceBuffer?.destroy();
    this.scatterSourceBuffer = this.device.createBuffer({
      label: 'Scatter Source Buffer',
      size: spectralBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    
    // Emission aura buffer (isotropic emission blur)
    this.emissionAuraBuffer?.destroy();
    this.emissionAuraBuffer = this.device.createBuffer({
      label: 'Emission Aura Buffer',
      size: spectralBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    
    // Reset frame count on resize
    this.frameCount = 0;
    this.spectralBufferSwapped = false;
    
    // Invalidate bind groups (need recreation for new buffers)
    this.bindGroup0 = null;
  }
  
  /**
   * Get current write buffer index and read buffer index
   */
  private getBufferIndices(): { writeIndex: 0 | 1; readIndex: 0 | 1 } {
    const writeIndex = this.currentBufferIndex;
    const readIndex = (1 - this.currentBufferIndex) as 0 | 1;
    return { writeIndex, readIndex };
  }
  
  /**
   * Swap to the next buffer for double-buffering
   */
  private swapBuffers(): void {
    this.currentBufferIndex = (1 - this.currentBufferIndex) as 0 | 1;
    this.frameCount++;
    // Invalidate bind group since we're using different buffers
    this.bindGroup0 = null;
  }
  
  /**
   * Swap spectral buffers for ping-pong blur processing
   */
  private swapSpectralBuffers(): void {
    this.spectralBufferSwapped = !this.spectralBufferSwapped;
    // Invalidate bind group 0 since spectral buffers swapped
    this.bindGroup0 = null;
  }
  
  /**
   * Sort shapes by layer index for back-to-front processing
   */
  private sortShapesByLayer(shapes: GPUShape[]): Map<number, GPUShape[]> {
    const layerMap = new Map<number, GPUShape[]>();
    
    for (const shape of shapes) {
      const layer = shape.layer;
      if (!layerMap.has(layer)) {
        layerMap.set(layer, []);
      }
      layerMap.get(layer)!.push(shape);
    }
    
    // Return sorted by layer (ascending - back to front)
    return new Map([...layerMap.entries()].sort((a, b) => a[0] - b[0]));
  }
  
  /**
   * Check if any shape in a layer has scattering enabled
   */
  private layerHasScattering(shapes: GPUShape[]): boolean {
    return shapes.some(s => 
      (s.smallParticleDensity ?? 0) > 0 || (s.largeParticleDensity ?? 0) > 0
    );
  }
  
  /**
   * Compute global max scatter sigma for all shapes in a layer
   * Used to determine blur radius for full-screen aura effect
   */
  private computeGlobalMaxSigma(shapes: GPUShape[]): number {
    let maxSigma = 0;
    
    // Constants matching WGSL
    const RAYLEIGH_BLUR_SCALE = 1e-12;
    const MIE_BLUR_SCALE = 1e-8;
    
    for (const shape of shapes) {
      const smallDensity = shape.smallParticleDensity ?? 0;
      const largeDensity = shape.largeParticleDensity ?? 0;
      
      if (smallDensity <= 0 && largeDensity <= 0) continue;
      
      const pathLength = Math.max(shape.width, shape.height) * 0.01;
      
      // Compute for blue wavelength (380nm) which has max Rayleigh scatter
      const blueWavelength = 380;
      const rayleighFactor = Math.pow(550 / blueWavelength, 4);
      const rayleighBlur = smallDensity * rayleighFactor * RAYLEIGH_BLUR_SCALE;
      const mieBlur = largeDensity * MIE_BLUR_SCALE;
      
      const sigma = Math.sqrt(rayleighBlur + mieBlur) * pathLength;
      maxSigma = Math.max(maxSigma, sigma);
    }
    
    return maxSigma;
  }
  
  /**
   * Execute per-layer spectral pipeline
   * This is the unified pipeline that handles all rendering with proper
   * layer-by-layer processing for scattering and emission effects.
   */
  private async computeSpectral(
    params: ComputeParams, 
    shapes: GPUShape[],
    workgroupsX: number,
    workgroupsY: number
  ): Promise<number> {
    // Sort shapes by layer
    const layerGroups = this.sortShapesByLayer(shapes);
    
    // Reset spectral buffer state
    this.spectralBufferSwapped = false;
    this.bindGroup0 = null;
    
    // === Initialize background spectrum ===
    // Writes to spectralOutput, then combine copies to spectralInput for first layer
    this.updateParamsBuffer(params, 0, 1.0, 0);
    this.ensureBindGroups();
    
    if (!this.initBackgroundPipeline || !this.bindGroup0) {
      throw new Error('[SpectralCompute] Spectral pipelines not initialized');
    }
    
    const initEncoder = this.device.createCommandEncoder();
    const initPass = initEncoder.beginComputePass();
    initPass.setPipeline(this.initBackgroundPipeline);
    initPass.setBindGroup(0, this.bindGroup0!);
    initPass.setBindGroup(1, this.bindGroup1!);
    initPass.setBindGroup(2, this.bindGroup2!);
    initPass.setBindGroup(3, this.bindGroup3!);
    initPass.dispatchWorkgroups(workgroupsX, workgroupsY);
    initPass.end();
    this.device.queue.submit([initEncoder.finish()]);
    
    // Swap buffers: output becomes input for first layer
    this.swapSpectralBuffers();
    
    // === Process each layer back-to-front ===
    for (const [layerIndex, layerShapes] of layerGroups) {
      // Compute global max scatter sigma for this layer
      const layerMaxSigma = this.computeGlobalMaxSigma(layerShapes);
      
      // Update shapes buffer with only this layer's shapes
      this.updateShapesBuffer(layerShapes);
      this.updateParamsBuffer(params, 0, 1.0, layerMaxSigma);
      this.bindGroup0 = null; // Invalidate since shapes/params changed
      this.ensureBindGroups();
      
      // Apply layer absorption/emission
      // Reads from spectralInput, writes to:
      // - spectralOutput: transmitted + direct emission
      // - scatterSource: scattered light (to be blurred)
      const absEncoder = this.device.createCommandEncoder();
      const absPass = absEncoder.beginComputePass();
      absPass.setPipeline(this.layerAbsorptionPipeline!);
      absPass.setBindGroup(0, this.bindGroup0!);
      absPass.setBindGroup(1, this.bindGroup1!);
      absPass.setBindGroup(2, this.bindGroup2!);
      absPass.setBindGroup(3, this.bindGroup3!);
      absPass.dispatchWorkgroups(workgroupsX, workgroupsY);
      absPass.end();
      this.device.queue.submit([absEncoder.finish()]);
      
      // Apply scatter blur if this layer has scattering
      if (layerMaxSigma > 0) {
        // Horizontal blur: scatterSource → spectralInput (H-blurred)
        const hBlurEncoder = this.device.createCommandEncoder();
        const hBlurPass = hBlurEncoder.beginComputePass();
        hBlurPass.setPipeline(this.blurHorizontalPipeline!);
        hBlurPass.setBindGroup(0, this.bindGroup0!);
        hBlurPass.setBindGroup(1, this.bindGroup1!);
        hBlurPass.setBindGroup(2, this.bindGroup2!);
        hBlurPass.setBindGroup(3, this.bindGroup3!);
        hBlurPass.dispatchWorkgroups(Math.ceil(params.width / 256), params.height);
        hBlurPass.end();
        this.device.queue.submit([hBlurEncoder.finish()]);
        
        // Vertical blur: spectralInput (H-blurred) → scatterSource (fully blurred)
        const vBlurEncoder = this.device.createCommandEncoder();
        const vBlurPass = vBlurEncoder.beginComputePass();
        vBlurPass.setPipeline(this.blurVerticalPipeline!);
        vBlurPass.setBindGroup(0, this.bindGroup0!);
        vBlurPass.setBindGroup(1, this.bindGroup1!);
        vBlurPass.setBindGroup(2, this.bindGroup2!);
        vBlurPass.setBindGroup(3, this.bindGroup3!);
        vBlurPass.dispatchWorkgroups(params.width, Math.ceil(params.height / 256));
        vBlurPass.end();
        this.device.queue.submit([vBlurEncoder.finish()]);
      }
      
      // Apply emission aura blur if emission is enabled and spread factor > 0
      const emissionAuraSigma = params.emissionAuraSigma ?? 3.0;
      if (params.enableEmission && emissionAuraSigma > 0) {
        // Horizontal blur: emissionAura → spectralInput (H-blurred, temporarily)
        // Note: We need to save spectralInput if scatter blur was done, but the blur
        // writes to spectralInput which will be overwritten. The solution is to process
        // emission aura AFTER scatter blur is complete and stored in scatterSource.
        const hAuraEncoder = this.device.createCommandEncoder();
        const hAuraPass = hAuraEncoder.beginComputePass();
        hAuraPass.setPipeline(this.blurEmissionAuraHPipeline!);
        hAuraPass.setBindGroup(0, this.bindGroup0!);
        hAuraPass.setBindGroup(1, this.bindGroup1!);
        hAuraPass.setBindGroup(2, this.bindGroup2!);
        hAuraPass.setBindGroup(3, this.bindGroup3!);
        hAuraPass.dispatchWorkgroups(Math.ceil(params.width / 256), params.height);
        hAuraPass.end();
        this.device.queue.submit([hAuraEncoder.finish()]);
        
        // Vertical blur: spectralInput (H-blurred aura) → emissionAura (fully blurred)
        const vAuraEncoder = this.device.createCommandEncoder();
        const vAuraPass = vAuraEncoder.beginComputePass();
        vAuraPass.setPipeline(this.blurEmissionAuraVPipeline!);
        vAuraPass.setBindGroup(0, this.bindGroup0!);
        vAuraPass.setBindGroup(1, this.bindGroup1!);
        vAuraPass.setBindGroup(2, this.bindGroup2!);
        vAuraPass.setBindGroup(3, this.bindGroup3!);
        vAuraPass.dispatchWorkgroups(params.width, Math.ceil(params.height / 256));
        vAuraPass.end();
        this.device.queue.submit([vAuraEncoder.finish()]);
      }
      
      // Combine: spectralOutput + scatterSource + emissionAura → spectralInput (for next layer)
      const combineEncoder = this.device.createCommandEncoder();
      const combinePass = combineEncoder.beginComputePass();
      combinePass.setPipeline(this.combineScatteredPipeline!);
      combinePass.setBindGroup(0, this.bindGroup0!);
      combinePass.setBindGroup(1, this.bindGroup1!);
      combinePass.setBindGroup(2, this.bindGroup2!);
      combinePass.setBindGroup(3, this.bindGroup3!);
      combinePass.dispatchWorkgroups(workgroupsX, workgroupsY);
      combinePass.end();
      this.device.queue.submit([combineEncoder.finish()]);
    }
    
    // Restore full shapes buffer for spectrum integration
    this.updateShapesBuffer(shapes);
    this.bindGroup0 = null;
    this.ensureBindGroups();
    
    // === Integrate spectrum to XYZ (Pass 0) ===
    this.updateParamsBuffer(params, 0, 1.0, 0);
    
    const intEncoder = this.device.createCommandEncoder();
    const intPass = intEncoder.beginComputePass();
    intPass.setPipeline(this.integrateSpectrumPipeline!);
    intPass.setBindGroup(0, this.bindGroup0!);
    intPass.setBindGroup(1, this.bindGroup1!);
    intPass.setBindGroup(2, this.bindGroup2!);
    intPass.setBindGroup(3, this.bindGroup3!);
    intPass.dispatchWorkgroups(workgroupsX, workgroupsY);
    intPass.end();
    this.device.queue.submit([intEncoder.finish()]);
    
    // Read max per pixel for normalization
    const maxData = await this.readMaxPerPixel();
    let globalMax = 0.001;
    for (let i = 0; i < maxData.length; i++) {
      if (maxData[i] > globalMax) {
        globalMax = maxData[i];
      }
    }
    
    // === Normalize pass ===
    this.updateParamsBuffer(params, 1, globalMax, 0);
    
    const normEncoder = this.device.createCommandEncoder();
    const normPass = normEncoder.beginComputePass();
    normPass.setPipeline(this.integrateSpectrumPipeline!);
    normPass.setBindGroup(0, this.bindGroup0!);
    normPass.setBindGroup(1, this.bindGroup1!);
    normPass.setBindGroup(2, this.bindGroup2!);
    normPass.setBindGroup(3, this.bindGroup3!);
    normPass.dispatchWorkgroups(workgroupsX, workgroupsY);
    normPass.end();
    this.device.queue.submit([normEncoder.finish()]);
    await this.device.queue.onSubmittedWorkDone();
    
    return globalMax;
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
    
    // === Use unified per-layer spectral pipeline ===
    const pass0Start = performance.now();
    const globalMax = await this.computeSpectral(params, shapes, workgroupsX, workgroupsY);
    this.lastGlobalMaxIntensity = globalMax;
    
    const pass0End = performance.now();
    this.lastPassTimings.push({
      name: 'Pass 0 (Spectral)',
      startTime: pass0Start,
      endTime: pass0End,
      duration: pass0End - pass0Start,
    });
    
    // Note: Normalization is handled inside computeSpectral()
    
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
    
    // Swap to next buffer for double-buffering (next frame writes to other buffer)
    this.swapBuffers();
    
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
  /**
   * Read RGB output from the READ buffer (previous frame's result)
   * This enables double-buffered readback - compute to one buffer while reading from another
   */
  async readRGBOutput(): Promise<Float32Array> {
    const { readIndex } = this.getBufferIndices();
    const buffer = this.rgbOutputBuffers[readIndex];
    
    // On first frame, read buffer might be empty - return zeros
    if (!buffer || this.frameCount < 1) {
      return new Float32Array(this.width * this.height * 4);
    }
    
    return readBufferData(
      this.device,
      buffer,
      this.width * this.height * 4 * 4
    );
  }
  
  /**
   * Read spectrum output from the READ buffer (previous frame's result)
   */
  async readSpectrumOutput(): Promise<Float32Array> {
    const { readIndex } = this.getBufferIndices();
    const buffer = this.spectrumOutputBuffers[readIndex];
    
    // On first frame, read buffer might be empty - return zeros
    if (!buffer || this.frameCount < 1) {
      return new Float32Array(this.plotResolution);
    }
    
    return readBufferData(
      this.device,
      buffer,
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
  /**
   * Get current write RGB buffer for direct binding
   */
  getRGBBuffer(): GPUBuffer | null {
    const { writeIndex } = this.getBufferIndices();
    return this.rgbOutputBuffers[writeIndex];
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
   * - globalMaxScatterSigma: f32 (64)
   * - emissionSpreadFactor: f32 (68)
   * - emissionAuraSigma: f32 (72)
   * Total: 80 bytes (must be aligned to 16 bytes)
   */
  private updateParamsBuffer(
    params: ComputeParams,
    isNormalizationPass: number = 0,
    globalMaxIntensity: number = 1.0,
    globalMaxScatterSigma: number = 0.0
  ): void {
    if (!this.paramsBuffer) {
      this.paramsBuffer = createUniformBuffer(this.device, 80);
    }
    
    const backgroundModeIndex =
      params.backgroundMode === 'normal' ? 0 :
      params.backgroundMode === 'uv' ? 1 : 2;
    
    const data = new ArrayBuffer(80);
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
    view.setFloat32(64, globalMaxScatterSigma, true);
    view.setFloat32(68, params.emissionSpreadFactor ?? 0.3, true);
    view.setFloat32(72, params.emissionAuraSigma ?? 3.0, true);
    
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
    // smallParticleDensity, largeParticleDensity (2 f32)
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
      // Scattering particle densities (particles/cm³)
      view.setFloat32(offset + 40, shape.smallParticleDensity ?? 0, true);
      view.setFloat32(offset + 44, shape.largeParticleDensity ?? 0, true);
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
    // Uses current write buffer for double-buffering
    if (!this.bindGroup0) {
      const { writeIndex } = this.getBufferIndices();
      const rgbBuffer = this.rgbOutputBuffers[writeIndex];
      const spectrumBuffer = this.spectrumOutputBuffers[writeIndex];
      
      if (!this.paramsBuffer || !this.shapesBuffer || !rgbBuffer || 
          !spectrumBuffer || !this.maxPerPixelBuffer || !this.spectrumBoxBuffer ||
          !this.bindGroupLayout0) {
        console.error('[SpectralCompute] Cannot create bindGroup0 - missing buffers or layout');
        return;
      }
      
      // Determine spectral buffer order based on swap state
      const spectralInputBuffer = this.spectralBufferSwapped ? this.spectralBufferB : this.spectralBufferA;
      const spectralOutputBuffer = this.spectralBufferSwapped ? this.spectralBufferA : this.spectralBufferB;
      
      // Spectral buffers may not exist yet (before first resize with scattering)
      // Use placeholder buffers if needed
      const inputBuffer = spectralInputBuffer || this.maxPerPixelBuffer;
      const outputBuffer = spectralOutputBuffer || this.maxPerPixelBuffer;
      const sigmaBuffer = this.scatteringSigmaBuffer || this.maxPerPixelBuffer;
      const scatterSrcBuffer = this.scatterSourceBuffer || this.maxPerPixelBuffer;
      const emissionAuraBuffer = this.emissionAuraBuffer || this.maxPerPixelBuffer;
      
      this.bindGroup0 = this.device.createBindGroup({
        label: `Bind Group 0 (Buffers, write=${writeIndex}, spectralSwap=${this.spectralBufferSwapped})`,
        layout: this.bindGroupLayout0,
        entries: [
          { binding: 0, resource: { buffer: this.paramsBuffer } },
          { binding: 1, resource: { buffer: this.shapesBuffer } },
          { binding: 2, resource: { buffer: rgbBuffer } },
          { binding: 3, resource: { buffer: spectrumBuffer } },
          { binding: 4, resource: { buffer: this.maxPerPixelBuffer } },
          { binding: 5, resource: { buffer: this.spectrumBoxBuffer } },
          // Spectral buffers for scattering blur
          { binding: 6, resource: { buffer: inputBuffer } },
          { binding: 7, resource: { buffer: outputBuffer } },
          { binding: 8, resource: { buffer: sigmaBuffer } },
          { binding: 9, resource: { buffer: scatterSrcBuffer } },
          { binding: 10, resource: { buffer: emissionAuraBuffer } },
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
    
    // Destroy double-buffered outputs
    this.rgbOutputBuffers[0]?.destroy();
    this.rgbOutputBuffers[1]?.destroy();
    this.spectrumOutputBuffers[0]?.destroy();
    this.spectrumOutputBuffers[1]?.destroy();
    
    this.maxPerPixelBuffer?.destroy();
    this.spectrumBoxBuffer?.destroy();
    this.cieScalesBuffer?.destroy();
    this.timestampBuffer?.destroy();
    this.timestampReadBuffer?.destroy();
    this.timestampQuerySet?.destroy();
    
    // Destroy spectral buffers for scattering blur
    this.spectralBufferA?.destroy();
    this.spectralBufferB?.destroy();
    this.scatteringSigmaBuffer?.destroy();
    this.scatterSourceBuffer?.destroy();
    this.emissionAuraBuffer?.destroy();
    
    this.materialPaletteTexture?.destroy();
    
    for (const tex of this.msdfTextures) {
      tex.destroy();
    }
    
    this.cieTextures?.x.destroy();
    this.cieTextures?.y.destroy();
    this.cieTextures?.z.destroy();
  }
}
