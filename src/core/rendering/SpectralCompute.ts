/**
 * Spectral Compute Pipeline
 *
 * Manages the WebGPU compute pipeline for spectral calculations.
 * Uses MSDF textures for resolution-independent shape rendering.
 *
 * ============================================================================
 * UNIFIED ARCHITECTURE: Single Code Path for Rendering & Spectrum
 * ============================================================================
 *
 * Both pipelines share the SAME shader entry points with mode-based params:
 *
 * 1. RENDERING MODE (16 wavelength samples, full screen):
 *    - updateParamsBuffer(..., mode='render')
 *    - Uses params: bufferWidth=width, bufferHeight=height, sampleCount=16
 *    - Outputs to rgbOutput for display
 *
 * 2. SPECTRUM MODE (5000 wavelength samples, 30×30 box):
 *    - updateParamsBuffer(..., mode='spectrum')
 *    - Uses params: bufferWidth=boxSize, bufferHeight=boxSize, sampleCount=plotResolution
 *    - Outputs to spectrumOutput for plotting
 *
 * All physics functions are shared - changes automatically affect both modes.
 * No duplicate _HighRes entry points needed.
 *
 * ============================================================================
 *
 * Multi-pass architecture for performance:
 * - Pass 0 (computeSpectral): Layer-by-layer color computation (16 wavelengths)
 * - Pass 1 (integrateSpectrum): Integration and normalization
 * - Pass 2 (Spectrum): Layer-by-layer spectrum computation (5000 wavelengths)
 * - Pass 3 (averageSpectrum): GPU averaging over circular region
 */

import {
  createStorageBuffer,
  createUniformBuffer,
  create1DTexture,
  readBufferData,
} from "./WebGPUContext";
import { generateCIETextures } from "../physics/cie";
import { BackgroundMode } from "../physics/config";
import shaderCode from "./SpectralCompute.wgsl?raw";
import { GPUProfiler, ProfilingReport } from "./GPUProfiler";
import { OptimizationConfig } from "./OptimizationConfig";

/**
 * Shape definition for GPU (matches WGSL Shape struct)
 */
export interface GPUShape {
  x: number; // Position X
  y: number; // Position Y
  width: number; // Bounding box width
  height: number; // Bounding box height
  temperature: number; // For emission calculations
  layer: number; // Render order (0 = background, higher = foreground)
  materialIndex: number; // Index into material textures
  maskIndex: number; // Index into MSDF textures
  texWidth: number; // MSDF texture width (for screenPxRange calculation)
  texHeight: number; // MSDF texture height
  smallParticleDensity: number; // Rayleigh scattering particle density (particles/cm³)
  largeParticleDensity: number; // Mie scattering particle density (particles/cm³)
}

/**
 * Spectral compute pipeline parameters
 */
export interface ComputeParams {
  width: number;
  height: number;
  wavelengthMin: number;
  wavelengthMax: number;
  spectralResolution: number; // Low-res samples for color integration (16)
  backgroundMode: BackgroundMode;
  enableEmission: boolean;
  sampleX?: number;
  sampleY?: number;
  msdfPxRange?: number; // MSDF pixel range (default: 4.0)
  numMaterials?: number; // Number of materials in the palette
  plotResolution?: number; // High-res samples for spectrum output (default: 5000)
  averageRadius?: number; // Radius in pixels to average spectrum over (default: 5)
  boxSize?: number; // Size of spectrum computation box (default: 30)
  emissionSpreadFactor?: number; // Fraction of emission that spreads sideways (default: 0.3)
  emissionAuraSigma?: number; // Gaussian sigma for emission aura blur (default: 3.0)
  atmosphericScatterSigma?: number; // Global atmospheric scatter blur sigma in pixels (default: 5.0)
  skipBlur?: boolean; // Skip blur passes for draft mode (faster but less accurate)
}

/**
 * Result of compute including global max for normalization
 */
export interface ComputeResult {
  globalMaxIntensity: number; // Max Y (luminance) - used for screen normalization
  globalMaxSpectral: number; // Max spectral intensity - used for plot normalization
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

// ============================================================================
// DEBUG LAYER ORDER INVESTIGATION
// ============================================================================

/**
 * Debug data captured for a single layer during processing
 */
export interface DebugLayerData {
  layerIndex: number;
  shapeCount: number;
  shapesBufferSize: number; // Actual buffer size in bytes
  expectedBufferSize: number; // Expected: shapeCount * 48
  arrayLengthWouldReturn: number; // What arrayLength(&shapes) would return in shader
  shapes: Array<{
    name: string;
    layer: number;
    temperature: number;
    materialIndex: number;
  }>;
  beforeAbsorption: { buffer: string; sampleValues: number[] };
  afterAbsorption: { buffer: string; sampleValues: number[] };
  afterCombine: { buffer: string; sampleValues: number[] };
}

/**
 * Complete debug report for layer order investigation
 */
export interface DebugReport {
  timestamp: string;
  testCase: string; // e.g., "hot_square", "hot_circle"
  testPixel: { x: number; y: number };
  backgroundMode: string;
  enableEmission: boolean;
  shapeConfig: Array<{
    name: string;
    layer: number;
    position: [number, number];
    temperature: number;
  }>;
  layerOrder: number[]; // e.g., [0, 1, 2, 3]
  layers: DebugLayerData[];
  finalSpectralInput: number[]; // Sample values before integration
  finalRGB?: { r: number; g: number; b: number }; // At test pixel (if available)
  spectralPlotValues?: number[]; // First 100 wavelengths (if available)
}

/**
 * Debug collector for layer order investigation
 */
export class DebugCollector {
  public enabled: boolean = false;
  public testPixelX: number = 150;
  public testPixelY: number = 180;

  public currentReport: Partial<DebugReport> | null = null; // Made public for external clear
  private allReports: DebugReport[] = [];

  /**
   * Start collecting debug data for a new test case
   */
  startCapture(
    testCase: string,
    backgroundMode: string,
    enableEmission: boolean,
    shapeConfig: DebugReport["shapeConfig"]
  ): void {
    if (!this.enabled) return;

    this.currentReport = {
      timestamp: new Date().toISOString(),
      testCase,
      testPixel: { x: this.testPixelX, y: this.testPixelY },
      backgroundMode,
      enableEmission,
      shapeConfig,
      layerOrder: [],
      layers: [],
    };
  }

  /**
   * Record layer order as layers are processed
   */
  recordLayerOrder(layerIndices: number[]): void {
    if (!this.enabled || !this.currentReport) return;
    this.currentReport.layerOrder = layerIndices;
  }

  /**
   * Start recording data for a specific layer
   */
  startLayer(
    layerIndex: number,
    shapes: DebugLayerData["shapes"],
    bufferInfo?: {
      shapesBufferSize: number;
      expectedBufferSize: number;
      arrayLengthWouldReturn: number;
    }
  ): void {
    if (!this.enabled || !this.currentReport) return;

    const layerData: DebugLayerData = {
      layerIndex,
      shapeCount: shapes.length,
      shapesBufferSize: bufferInfo?.shapesBufferSize ?? 0,
      expectedBufferSize: bufferInfo?.expectedBufferSize ?? 0,
      arrayLengthWouldReturn: bufferInfo?.arrayLengthWouldReturn ?? 0,
      shapes,
      beforeAbsorption: { buffer: "", sampleValues: [] },
      afterAbsorption: { buffer: "", sampleValues: [] },
      afterCombine: { buffer: "", sampleValues: [] },
    };

    this.currentReport.layers = this.currentReport.layers || [];
    this.currentReport.layers.push(layerData);
  }

  /**
   * Record buffer state at a specific point
   */
  recordBufferState(
    phase: "beforeAbsorption" | "afterAbsorption" | "afterCombine",
    bufferName: string,
    sampleValues: number[]
  ): void {
    if (!this.enabled || !this.currentReport) return;

    const layers = this.currentReport.layers;
    if (!layers || layers.length === 0) return;

    const currentLayer = layers[layers.length - 1];
    currentLayer[phase] = { buffer: bufferName, sampleValues };
  }

  /**
   * Record final spectral input before integration
   */
  recordFinalSpectralInput(values: number[]): void {
    if (!this.enabled || !this.currentReport) return;
    this.currentReport.finalSpectralInput = values;
  }

  /**
   * Record final RGB output at test pixel
   */
  recordFinalRGB(r: number, g: number, b: number): void {
    if (!this.enabled || !this.currentReport) return;
    this.currentReport.finalRGB = { r, g, b };
  }

  /**
   * Record spectral plot values
   */
  recordSpectralPlotValues(values: number[]): void {
    if (!this.enabled || !this.currentReport) return;
    this.currentReport.spectralPlotValues = values.slice(0, 100); // First 100 wavelengths
  }

  /**
   * Finish capture and store the report
   */
  finishCapture(): DebugReport | null {
    if (!this.enabled || !this.currentReport) return null;

    const report = this.currentReport as DebugReport;
    this.allReports.push(report);
    this.currentReport = null;
    return report;
  }

  /**
   * Get all collected reports
   */
  getAllReports(): DebugReport[] {
    return this.allReports;
  }

  /**
   * Clear all reports
   */
  clear(): void {
    this.allReports = [];
    this.currentReport = null;
  }

  /**
   * Generate combined report as JSON string
   */
  generateReportJSON(): string {
    return JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        testPixel: { x: this.testPixelX, y: this.testPixelY },
        reports: this.allReports,
      },
      null,
      2
    );
  }
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
  private blurTransmittedHPipeline: GPUComputePipeline | null = null; // Dual-path: blur->mask
  private blurTransmittedVPipeline: GPUComputePipeline | null = null; // Dual-path: blur->mask
  private integrateSpectrumPipeline: GPUComputePipeline | null = null;
  private combineScatteredPipeline: GPUComputePipeline | null = null;
  private blurEmissionAuraHPipeline: GPUComputePipeline | null = null;
  private blurEmissionAuraVPipeline: GPUComputePipeline | null = null;

  // High-res spectrum now uses unified pipelines with mode='spectrum' params
  // All _HighRes pipelines have been removed - use same pipelines with different params
  private finalCombinePipeline: GPUComputePipeline | null = null;

  // Explicit bind group layouts (shared across all pipelines)
  // NOTE: WebGPU has a maximum of 4 bind groups
  private bindGroupLayout0: GPUBindGroupLayout | null = null; // Buffers (including spectral)
  private bindGroupLayout1: GPUBindGroupLayout | null = null; // Material palette
  private bindGroupLayout2: GPUBindGroupLayout | null = null; // CIE textures
  private bindGroupLayout3: GPUBindGroupLayout | null = null; // MSDF textures
  private pipelineLayout: GPUPipelineLayout | null = null;
  private blurPipelineLayout: GPUPipelineLayout | null = null; // Same as pipelineLayout (uses extended bind group 0)

  // Buffers
  private paramsBuffer: GPUBuffer | null = null;
  private shapesBuffer: GPUBuffer | null = null;
  private maxPerPixelBuffer: GPUBuffer | null = null;
  private spectrumBoxBuffer: GPUBuffer | null = null;

  // Double-buffered output buffers (compute to one, read from other)
  private rgbOutputBuffers: [GPUBuffer | null, GPUBuffer | null] = [null, null];
  private spectrumOutputBuffers: [GPUBuffer | null, GPUBuffer | null] = [
    null,
    null,
  ];
  private currentBufferIndex: 0 | 1 = 0;
  private frameCount: number = 0; // Track frames for first-frame handling

  // Spectral buffers for per-layer scattering blur (ping-pong)
  // Each buffer stores 16 wavelength intensities per pixel
  private spectralBufferA: GPUBuffer | null = null;
  private spectralBufferB: GPUBuffer | null = null;
  private scatteringSigmaBuffer: GPUBuffer | null = null; // Per-pixel blur sigma
  private scatterSourceBuffer: GPUBuffer | null = null; // Scattered light to be blurred
  private emissionAuraBuffer: GPUBuffer | null = null; // Emission aura to be blurred
  private static readonly SPECTRAL_SAMPLES = 16;

  // High-resolution spectral buffers for spectrum plot (30×30×5000)
  // These use the same physics as rendering but at higher spectral resolution
  // SHARED ARCHITECTURE: Both pipelines use identical physics, just different resolutions
  private spectrumHighResA: GPUBuffer | null = null; // Ping-pong buffer A
  private spectrumHighResB: GPUBuffer | null = null; // Ping-pong buffer B
  private spectrumHighResScatter: GPUBuffer | null = null; // Scatter source for blur
  private spectrumHighResEmissionAura: GPUBuffer | null = null; // Emission aura for blur
  private spectrumHighResSigma: GPUBuffer | null = null; // Per-pixel sigma for high-res
  private spectrumHighResSwapped: boolean = false; // Track ping-pong state
  private useHighResBuffers: boolean = false; // Whether bind group should use high-res buffers
  private static readonly SPECTRUM_BOX_SIZE = 30; // Size of spectrum sampling box
  private static readonly SPECTRUM_RESOLUTION = 4500; // Wavelength samples for spectrum (900nm / 4500 = 0.2nm per sample)

  // Global max intensity from last render (for plot normalization)
  private lastGlobalMaxIntensity: number = 1.0; // Max Y (luminance) for screen
  private lastGlobalMaxSpectral: number = 1.0; // Max spectral intensity for plot

  // Debug layer order investigation
  public debugCollector: DebugCollector = new DebugCollector();

  // GPU Profiler for performance analysis
  private profiler: GPUProfiler;
  private profilingEnabled: boolean = false;

  // Atmospheric scatter sigma - global blur sigma for all scattering (default: 5.0 pixels)
  // This is a simplified model where all shapes share the same scatter blur sigma
  // The blur radius is constant (MAX_BLUR_RADIUS=16), sigma controls the Gaussian falloff
  // The amount of scattered light still varies per-shape based on particle density
  private atmosphericScatterSigma: number = 5.0;
  
  // Optimization configuration for shader performance
  private optimizationConfig: OptimizationConfig = OptimizationConfig.default();
  private lastProfilingParams: {
    width: number;
    height: number;
    spectralSamples: number;
    plotResolution: number;
  } | null = null;

  // Textures
  private materialPaletteTexture: GPUTexture | null = null;
  private numMaterials: number = 0;
  private msdfTextures: GPUTexture[] = [];
  private cieTextures: { x: GPUTexture; y: GPUTexture; z: GPUTexture } | null =
    null;
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
  private static readonly MAX_SPECTRAL_RESOLUTION = 4500;
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
    this.hasTimestampSupport = device.features.has("timestamp-query");
    this.profiler = new GPUProfiler(device);
  }

  /**
   * Initialize the compute pipeline
   */
  async initialize(): Promise<void> {
    // Create shader module (shared by all pipelines)
    const shaderModule = this.device.createShaderModule({
      label: "Spectral Compute Shader",
      code: shaderCode,
    });

    // Create explicit bind group layouts (shared across all pipelines)
    this.createBindGroupLayouts();

    // Create pipeline layout with explicit bind group layouts
    this.pipelineLayout = this.device.createPipelineLayout({
      label: "Spectral Pipeline Layout",
      bindGroupLayouts: [
        this.bindGroupLayout0!,
        this.bindGroupLayout1!,
        this.bindGroupLayout2!,
        this.bindGroupLayout3!,
      ],
    });

    // Create color pipeline (main entry point)
    this.colorPipeline = this.device.createComputePipeline({
      label: "Color Compute Pipeline",
      layout: this.pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: "main",
      },
    });

    // Create spectrum box pipeline
    this.spectrumBoxPipeline = this.device.createComputePipeline({
      label: "Spectrum Box Pipeline",
      layout: this.pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: "computeSpectrumBox",
      },
    });

    // Create averaging pipeline
    this.averagePipeline = this.device.createComputePipeline({
      label: "Spectrum Average Pipeline",
      layout: this.pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: "averageSpectrum",
      },
    });

    // Create blur pipeline layout (uses same bind groups as main pipeline)
    // Spectral buffers are now in bind group 0 (bindings 6-8)
    this.blurPipelineLayout = this.device.createPipelineLayout({
      label: "Blur Pipeline Layout",
      bindGroupLayouts: [
        this.bindGroupLayout0!,
        this.bindGroupLayout1!,
        this.bindGroupLayout2!,
        this.bindGroupLayout3!,
      ],
    });

    // Create per-layer scattering blur pipelines
    this.initBackgroundPipeline = this.device.createComputePipeline({
      label: "Init Background Spectrum Pipeline",
      layout: this.blurPipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: "initBackgroundSpectrum",
      },
    });

    this.layerAbsorptionPipeline = this.device.createComputePipeline({
      label: "Layer Absorption Pipeline",
      layout: this.blurPipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: "applyLayerAbsorption",
      },
    });

    this.blurHorizontalPipeline = this.device.createComputePipeline({
      label: "Blur Horizontal Pipeline",
      layout: this.blurPipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: "blurHorizontal",
      },
    });

    this.blurVerticalPipeline = this.device.createComputePipeline({
      label: "Blur Vertical Pipeline",
      layout: this.blurPipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: "blurVertical",
      },
    });

    // Dual-path scattering: blur transmitted image (blur->mask path)
    this.blurTransmittedHPipeline = this.device.createComputePipeline({
      label: "Blur Transmitted H Pipeline",
      layout: this.blurPipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: "blurTransmittedH",
      },
    });

    this.blurTransmittedVPipeline = this.device.createComputePipeline({
      label: "Blur Transmitted V Pipeline",
      layout: this.blurPipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: "blurTransmittedV",
      },
    });

    this.integrateSpectrumPipeline = this.device.createComputePipeline({
      label: "Integrate Spectrum Pipeline",
      layout: this.blurPipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: "integrateSpectrum",
      },
    });

    this.combineScatteredPipeline = this.device.createComputePipeline({
      label: "Combine Scattered Pipeline",
      layout: this.blurPipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: "combineScattered",
      },
    });

    this.blurEmissionAuraHPipeline = this.device.createComputePipeline({
      label: "Blur Emission Aura H Pipeline",
      layout: this.blurPipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: "blurEmissionAuraH",
      },
    });

    this.blurEmissionAuraVPipeline = this.device.createComputePipeline({
      label: "Blur Emission Aura V Pipeline",
      layout: this.blurPipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: "blurEmissionAuraV",
      },
    });

    // High-res spectrum now uses unified pipelines with mode='spectrum' params
    // Only finalCombine needs a separate pipeline (writes to spectrumBox)
    this.finalCombinePipeline = this.device.createComputePipeline({
      label: "Final Combine Pipeline",
      layout: this.blurPipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: "finalCombine",
      },
    });

    // Check if float32-filterable is enabled
    const hasFloat32Filterable = this.device.features.has("float32-filterable");

    // Create sampler for material and CIE textures (r32float)
    // Use filtering only if float32-filterable is available
    this.textureSampler = this.device.createSampler({
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
      magFilter: hasFloat32Filterable ? "linear" : "nearest",
      minFilter: hasFloat32Filterable ? "linear" : "nearest",
    });

    // Create sampler for MSDF textures (linear for smooth AA - rgba8unorm is always filterable)
    this.msdfSampler = this.device.createSampler({
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
      magFilter: "linear",
      minFilter: "linear",
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

    console.log("[SpectralCompute] Pipeline initialized");
    console.log(
      `[SpectralCompute] Timestamp queries: ${this.hasTimestampSupport ? "enabled" : "disabled"}`
    );
    console.log(
      `[SpectralCompute] f16 support: ${this.device.features.has("shader-f16") ? "enabled" : "disabled"}`
    );
  }

  /**
   * Initialize timestamp query resources
   */
  private initTimestampQueries(): void {
    // 8 timestamps: start/end for each of 4 passes
    this.timestampQuerySet = this.device.createQuerySet({
      type: "timestamp",
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
    const hasFloat32Filterable = this.device.features.has("float32-filterable");
    const floatSampleType = hasFloat32Filterable
      ? "float"
      : "unfilterable-float";
    const floatSamplerType = hasFloat32Filterable
      ? "filtering"
      : "non-filtering";

    // Bind group 0: params, shapes, outputs, spectrum box, spectral buffers
    this.bindGroupLayout0 = this.device.createBindGroupLayout({
      label: "Bind Group Layout 0 (Buffers)",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "uniform" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "read-only-storage" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
        {
          binding: 4,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
        {
          binding: 5,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
        // Spectral buffers for scattering blur (bindings 6-10)
        // NOTE: High-res spectrum reuses these same bindings with different buffer references
        {
          binding: 6,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        }, // Spectral input
        {
          binding: 7,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        }, // Spectral output
        {
          binding: 8,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        }, // Scattering sigma
        {
          binding: 9,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        }, // Scatter source
        {
          binding: 10,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        }, // Emission aura
      ],
    });

    // Bind group 1: material palette texture (r32float)
    this.bindGroupLayout1 = this.device.createBindGroupLayout({
      label: "Bind Group Layout 1 (Material Palette)",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          texture: { sampleType: floatSampleType as GPUTextureSampleType },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          sampler: { type: floatSamplerType as GPUSamplerBindingType },
        },
      ],
    });

    // Bind group 2: CIE textures (r32float)
    this.bindGroupLayout2 = this.device.createBindGroupLayout({
      label: "Bind Group Layout 2 (CIE)",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          texture: { sampleType: floatSampleType as GPUTextureSampleType },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          texture: { sampleType: floatSampleType as GPUTextureSampleType },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          texture: { sampleType: floatSampleType as GPUTextureSampleType },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,
          sampler: { type: floatSamplerType as GPUSamplerBindingType },
        },
        {
          binding: 4,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "uniform" },
        },
      ],
    });

    // Bind group 3: MSDF textures (rgba8unorm - always filterable)
    this.bindGroupLayout3 = this.device.createBindGroupLayout({
      label: "Bind Group Layout 3 (MSDF)",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          texture: { sampleType: "float" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          texture: { sampleType: "float" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          texture: { sampleType: "float" },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,
          texture: { sampleType: "float" },
        },
        {
          binding: 4,
          visibility: GPUShaderStage.COMPUTE,
          sampler: { type: "filtering" },
        },
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
      x: create1DTexture(this.device, cieData.x, "CIE X"),
      y: create1DTexture(this.device, cieData.y, "CIE Y"),
      z: create1DTexture(this.device, cieData.z, "CIE Z"),
    };

    // Create scales buffer
    this.cieScalesBuffer = createUniformBuffer(this.device, 16);
    this.device.queue.writeBuffer(
      this.cieScalesBuffer,
      0,
      new Float32Array([
        cieData.scales.x,
        cieData.scales.y,
        cieData.scales.z,
        0,
      ])
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
        format: "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });

      // Fill with value that represents "fully inside"
      // MSDF: 0.0 = inside, 0.5 = edge, 1.0 = outside
      // So 0 (0.0 when sampled) = fully inside
      this.device.queue.writeTexture(
        { texture },
        new Uint8Array([0, 0, 0, 255]), // RGB=0 (inside), A=255
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
    // SPECTRUM_BOX_SIZE² pixels × plotResolution wavelengths × 2 bytes (f16 for reduced memory bandwidth)
    // Use SPECTRUM_BOX_SIZE (30) to match the high-res buffer allocation
    const spectrumBoxSize = SpectralComputePipeline.SPECTRUM_BOX_SIZE;
    const bufferSize =
      spectrumBoxSize * spectrumBoxSize * this.plotResolution * 2;

    this.spectrumBoxBuffer = this.device.createBuffer({
      label: "Spectrum Box (f16)",
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    console.log(
      `[SpectralCompute] Spectrum box buffer (f16): ${(bufferSize / 1024 / 1024).toFixed(2)} MB`
    );
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
        format: "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      this.device.queue.writeTexture(
        { texture },
        new Uint8Array([0, 0, 0, 255]), // Inside
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

      for (
        let wavelengthIdx = 0;
        wavelengthIdx < spectrumWidth;
        wavelengthIdx++
      ) {
        textureData[rowOffset + wavelengthIdx] = spectrum[wavelengthIdx] ?? 1.0;
      }
    }

    // Create the 2D palette texture
    // Note: old texture will be garbage collected
    this.materialPaletteTexture = this.device.createTexture({
      label: `Material Palette (${numMaterials} materials)`,
      size: {
        width: spectrumWidth,
        height: numMaterials,
        depthOrArrayLayers: 1,
      },
      format: "r32float",
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
      this.profiler.trackBuffer(
        this.rgbOutputBuffers[i]!,
        `RGB Output ${i}`,
        "storage",
        "vec4<f32>"
      );
    }

    // Create two spectrum output buffers
    for (let i = 0; i < 2; i++) {
      this.spectrumOutputBuffers[i] = this.device.createBuffer({
        label: `Spectrum Output ${i}`,
        size: SpectralComputePipeline.MAX_SPECTRAL_RESOLUTION * 4, // f32 per wavelength
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      });
      this.profiler.trackBuffer(
        this.spectrumOutputBuffers[i]!,
        `Spectrum Output ${i}`,
        "storage",
        "f32"
      );
    }

    // Max per pixel buffer (single - only used for CPU reduction)
    this.maxPerPixelBuffer = this.device.createBuffer({
      label: "Max Per Pixel",
      size: pixelCount * 4, // f32 per pixel
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    this.profiler.trackBuffer(
      this.maxPerPixelBuffer,
      "Max Per Pixel",
      "storage",
      "f32"
    );

    // Spectral buffers for per-layer scattering blur (ping-pong)
    // Each stores 16 wavelength intensities per pixel using f16 for memory efficiency
    this.spectralBufferA?.destroy();
    this.spectralBufferB?.destroy();
    this.scatteringSigmaBuffer?.destroy();

    const spectralBufferSize =
      pixelCount * SpectralComputePipeline.SPECTRAL_SAMPLES * 2; // f16 = 2 bytes

    this.spectralBufferA = this.device.createBuffer({
      label: "Spectral Buffer A",
      size: spectralBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    this.profiler.trackBuffer(
      this.spectralBufferA,
      "Spectral Buffer A",
      "ping-pong",
      "f16"
    );

    this.spectralBufferB = this.device.createBuffer({
      label: "Spectral Buffer B",
      size: spectralBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    this.profiler.trackBuffer(
      this.spectralBufferB,
      "Spectral Buffer B",
      "ping-pong",
      "f16"
    );

    // Per-pixel scattering sigma buffer (one f32 per pixel, maximum sigma across wavelengths)
    this.scatteringSigmaBuffer = this.device.createBuffer({
      label: "Scattering Sigma Buffer",
      size: pixelCount * 4, // f32 per pixel
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    this.profiler.trackBuffer(
      this.scatteringSigmaBuffer,
      "Scattering Sigma",
      "storage",
      "f32"
    );

    // Scatter source buffer (light to be blurred)
    this.scatterSourceBuffer?.destroy();
    this.scatterSourceBuffer = this.device.createBuffer({
      label: "Scatter Source Buffer",
      size: spectralBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    this.profiler.trackBuffer(
      this.scatterSourceBuffer,
      "Scatter Source",
      "storage",
      "f16"
    );

    // Emission aura buffer (isotropic emission blur)
    this.emissionAuraBuffer?.destroy();
    this.emissionAuraBuffer = this.device.createBuffer({
      label: "Emission Aura Buffer",
      size: spectralBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    this.profiler.trackBuffer(
      this.emissionAuraBuffer,
      "Emission Aura",
      "storage",
      "f16"
    );

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
   * Swap high-res spectral buffers for ping-pong blur processing
   */
  private swapHighResSpectralBuffers(): void {
    this.spectrumHighResSwapped = !this.spectrumHighResSwapped;
    // Invalidate bind group since buffer references changed
    this.bindGroup0 = null;
  }

  /**
   * Ensure high-resolution spectrum buffers are allocated.
   * Called lazily when spectrum probing starts.
   *
   * SHARED ARCHITECTURE: These buffers mirror the rendering buffers
   * but at higher spectral resolution (5000 vs 16 samples).
   */
  private ensureHighResBuffers(): void {
    if (this.spectrumHighResA) return; // Already allocated

    const boxPixels =
      SpectralComputePipeline.SPECTRUM_BOX_SIZE *
      SpectralComputePipeline.SPECTRUM_BOX_SIZE;
    const bufferSize =
      boxPixels * SpectralComputePipeline.SPECTRUM_RESOLUTION * 2; // f16 = 2 bytes

    console.log(`[DEBUG-SPECTRUM] Allocating high-res buffers:`);
    console.log(
      `[DEBUG-SPECTRUM]   Box size: ${SpectralComputePipeline.SPECTRUM_BOX_SIZE}x${SpectralComputePipeline.SPECTRUM_BOX_SIZE} = ${boxPixels} pixels`
    );
    console.log(
      `[DEBUG-SPECTRUM]   Spectral resolution: ${SpectralComputePipeline.SPECTRUM_RESOLUTION} wavelengths`
    );
    console.log(
      `[DEBUG-SPECTRUM]   Buffer size per buffer: ${bufferSize} bytes (${(bufferSize / 1024 / 1024).toFixed(2)} MB)`
    );
    console.log(
      `[DEBUG-SPECTRUM]   Total: ${((bufferSize * 4) / 1024 / 1024).toFixed(2)} MB`
    );

    // Ping-pong buffers for layer processing
    this.spectrumHighResA = this.device.createBuffer({
      label: "Spectrum High-Res A",
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    this.spectrumHighResB = this.device.createBuffer({
      label: "Spectrum High-Res B",
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    // Scatter source buffer for blur
    this.spectrumHighResScatter = this.device.createBuffer({
      label: "Spectrum High-Res Scatter",
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    // Emission aura buffer for Gaussian blur
    this.spectrumHighResEmissionAura = this.device.createBuffer({
      label: "Spectrum High-Res Emission Aura",
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    // Per-pixel sigma buffer (one f32 per pixel)
    this.spectrumHighResSigma = this.device.createBuffer({
      label: "Spectrum High-Res Sigma",
      size: boxPixels * 4, // f32 per pixel
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    this.spectrumHighResSwapped = false;
  }

  /**
   * Debug helper to read back f16 buffer data and report statistics
   * Now checks both UV range (indices 0-99) and visible range (indices ~1125)
   */
  private async debugReadbackBuffer(
    buffer: GPUBuffer,
    label: string,
    sampleCount: number = 100
  ): Promise<void> {
    const readbackBuffer = this.device.createBuffer({
      label: `Debug Readback ${label}`,
      size: buffer.size,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(buffer, 0, readbackBuffer, 0, buffer.size);
    this.device.queue.submit([encoder.finish()]);

    await readbackBuffer.mapAsync(GPUMapMode.READ);
    const data = new Uint16Array(readbackBuffer.getMappedRange());

    // Helper to convert f16 to f32
    const f16ToF32 = (f16: number): number => {
      const sign = (f16 >> 15) & 1;
      const exp = (f16 >> 10) & 0x1f;
      const frac = f16 & 0x3ff;
      if (exp === 0) return (sign ? -1 : 1) * Math.pow(2, -14) * (frac / 1024);
      if (exp === 31) return frac ? NaN : sign ? -Infinity : Infinity;
      return (sign ? -1 : 1) * Math.pow(2, exp - 15) * (1 + frac / 1024);
    };

    // Check first 100 values (UV range, wavelengths 200-216nm - expected 0 for normal mode)
    let min = Infinity,
      max = -Infinity,
      sum = 0,
      nonZeroCount = 0;
    const uvSamples: number[] = [];
    for (let i = 0; i < Math.min(data.length, sampleCount); i++) {
      const f32 = f16ToF32(data[i]);
      uvSamples.push(f32);
      if (!isNaN(f32) && isFinite(f32)) {
        min = Math.min(min, f32);
        max = Math.max(max, f32);
        sum += f32;
        if (f32 !== 0) nonZeroCount++;
      }
    }

    // Check visible range (indices 1125-1225, wavelengths ~380-396nm - expected 1.0 for background)
    // These are pixel (0,0) wavelengths in the visible range
    const visibleStart = 1125;
    let visMin = Infinity,
      visMax = -Infinity,
      visSum = 0,
      visNonZero = 0;
    const visSamples: number[] = [];
    for (
      let i = visibleStart;
      i < Math.min(data.length, visibleStart + 100);
      i++
    ) {
      const f32 = f16ToF32(data[i]);
      visSamples.push(f32);
      if (!isNaN(f32) && isFinite(f32)) {
        visMin = Math.min(visMin, f32);
        visMax = Math.max(visMax, f32);
        visSum += f32;
        if (f32 !== 0) visNonZero++;
      }
    }

    // Also check a few scattered pixels to see if ANY data exists
    // Check pixel (5,5) which should definitely be in bounds
    // NOTE: Use params.boxSize (11) not SPECTRUM_BOX_SIZE (30) since that's what shader uses
    const paramBoxSize = this.boxSize; // This matches params.boxSize sent to shader
    const pixel55Start = (5 * paramBoxSize + 5) * this.plotResolution + 1500; // visible wavelength
    let scatteredNonZero = 0;
    const scatteredSamples: number[] = [];
    for (
      let i = pixel55Start;
      i < Math.min(data.length, pixel55Start + 20);
      i++
    ) {
      const f32 = f16ToF32(data[i]);
      scatteredSamples.push(f32);
      if (f32 !== 0) scatteredNonZero++;
    }

    console.log(`[DEBUG-SPECTRUM] Buffer readback: ${label}`);
    console.log(
      `[DEBUG-SPECTRUM]   Size: ${buffer.size} bytes, ${data.length} f16 values`
    );
    console.log(
      `[DEBUG-SPECTRUM]   UV range (idx 0-99, ~200-216nm): nonZero=${nonZeroCount}/100, min=${min.toExponential(3)}, max=${max.toExponential(3)}`
    );
    console.log(
      `[DEBUG-SPECTRUM]   Visible range (idx 1125-1225, ~380nm): nonZero=${visNonZero}/100, min=${visMin.toExponential(3)}, max=${visMax.toExponential(3)}`
    );
    console.log(
      `[DEBUG-SPECTRUM]   Pixel (5,5) visible: nonZero=${scatteredNonZero}/20, values:`,
      scatteredSamples.slice(0, 5).map((v) => v.toExponential(3))
    );

    readbackBuffer.unmap();
    readbackBuffer.destroy();
  }

  /**
   * Debug helper to read back spectrumOutput (f32 array)
   */
  private async debugReadbackSpectrumOutput(): Promise<void> {
    const buffer = this.spectrumOutputBuffers[this.currentBufferIndex];
    if (!buffer) return;

    const readbackBuffer = this.device.createBuffer({
      label: "Debug Readback spectrumOutput",
      size: buffer.size,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(buffer, 0, readbackBuffer, 0, buffer.size);
    this.device.queue.submit([encoder.finish()]);

    await readbackBuffer.mapAsync(GPUMapMode.READ);
    const data = new Float32Array(readbackBuffer.getMappedRange());

    let min = Infinity,
      max = -Infinity,
      sum = 0,
      nonZeroCount = 0;
    for (let i = 0; i < Math.min(data.length, 100); i++) {
      const v = data[i];
      if (!isNaN(v) && isFinite(v)) {
        min = Math.min(min, v);
        max = Math.max(max, v);
        sum += v;
        if (v !== 0) nonZeroCount++;
      }
    }

    console.log(`[DEBUG-SPECTRUM] spectrumOutput readback:`);
    console.log(`[DEBUG-SPECTRUM]   Size: ${data.length} f32 values`);
    console.log(
      `[DEBUG-SPECTRUM]   First 100: min=${min.toExponential(3)}, max=${max.toExponential(3)}, avg=${(sum / 100).toExponential(3)}`
    );
    console.log(`[DEBUG-SPECTRUM]   Non-zero: ${nonZeroCount}/100`);
    console.log(
      `[DEBUG-SPECTRUM]   First 20 values:`,
      Array.from(data.slice(0, 20)).map((v) => v.toExponential(3))
    );

    readbackBuffer.unmap();
    readbackBuffer.destroy();
  }

  /**
   * Debug helper to read spectral values at a specific pixel for layer order investigation
   * Reads wavelength samples for a specific (x, y) pixel from an f16 spectral buffer
   *
   * @param buffer - The f16 spectral buffer to read from
   * @param pixelX - X coordinate of the pixel
   * @param pixelY - Y coordinate of the pixel
   * @param width - Buffer width (params.width for render, boxSize for spectrum)
   * @param sampleCount - Number of wavelength samples (16 for render, 5000 for spectrum)
   * @returns Array of f32 values for each wavelength sample
   */
  private async debugReadPixelSpectrum(
    buffer: GPUBuffer,
    pixelX: number,
    pixelY: number,
    width: number,
    sampleCount: number
  ): Promise<number[]> {
    // Calculate byte offset for this pixel
    // Buffer layout: (y * width + x) * sampleCount * 2 bytes (f16)
    const pixelOffset = (pixelY * width + pixelX) * sampleCount * 2;
    const byteSize = sampleCount * 2;

    // Ensure we don't read past buffer end
    if (pixelOffset + byteSize > buffer.size) {
      console.warn(
        `[DEBUG-LAYERS] Pixel (${pixelX}, ${pixelY}) out of bounds for buffer`
      );
      return [];
    }

    // Create readback buffer
    const readbackBuffer = this.device.createBuffer({
      label: `Debug Pixel Readback (${pixelX}, ${pixelY})`,
      size: byteSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    // Copy the specific pixel's data
    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(
      buffer,
      pixelOffset,
      readbackBuffer,
      0,
      byteSize
    );
    this.device.queue.submit([encoder.finish()]);

    await this.device.queue.onSubmittedWorkDone();
    await readbackBuffer.mapAsync(GPUMapMode.READ);
    const data = new Uint16Array(readbackBuffer.getMappedRange());

    // Convert f16 to f32
    const f16ToF32 = (f16: number): number => {
      const sign = (f16 >> 15) & 1;
      const exp = (f16 >> 10) & 0x1f;
      const frac = f16 & 0x3ff;
      if (exp === 0) return (sign ? -1 : 1) * Math.pow(2, -14) * (frac / 1024);
      if (exp === 31) return frac ? NaN : sign ? -Infinity : Infinity;
      return (sign ? -1 : 1) * Math.pow(2, exp - 15) * (1 + frac / 1024);
    };

    const result: number[] = [];
    for (let i = 0; i < data.length; i++) {
      result.push(f16ToF32(data[i]));
    }

    readbackBuffer.unmap();
    readbackBuffer.destroy();

    return result;
  }

  /**
   * Destroy high-resolution spectrum buffers to free memory.
   * Called when spectrum probing is no longer needed.
   */
  private destroyHighResBuffers(): void {
    this.spectrumHighResA?.destroy();
    this.spectrumHighResB?.destroy();
    this.spectrumHighResScatter?.destroy();
    this.spectrumHighResEmissionAura?.destroy();
    this.spectrumHighResSigma?.destroy();

    this.spectrumHighResA = null;
    this.spectrumHighResB = null;
    this.spectrumHighResScatter = null;
    this.spectrumHighResEmissionAura = null;
    this.spectrumHighResSigma = null;

    console.log("[SpectralCompute] High-res spectrum buffers destroyed");
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
    return shapes.some(
      (s) =>
        (s.smallParticleDensity ?? 0) > 0 || (s.largeParticleDensity ?? 0) > 0
    );
  }

  /**
   * Get the global atmospheric scatter sigma
   *
   * SIMPLIFIED MODEL: All shapes share the same blur radius (sigma).
   * This is more efficient and visually consistent for atmospheric haze effects.
   * The amount of scattered light still varies per-shape based on particle density.
   *
   * @param _shapes - Unused, kept for API compatibility (may be used for future per-layer overrides)
   * @returns Global atmospheric scatter sigma in pixels
   */
  private computeGlobalMaxSigma(_shapes: GPUShape[]): number {
    return this.atmosphericScatterSigma;
  }

  /**
   * Set the global atmospheric scatter sigma (Gaussian blur falloff)
   * @param sigma - Blur sigma in pixels (default: 5.0)
   * Note: Blur radius is fixed at MAX_BLUR_RADIUS (16 pixels), sigma controls falloff shape
   */
  setAtmosphericScatterSigma(sigma: number): void {
    this.atmosphericScatterSigma = Math.max(0, sigma);
  }

  /**
   * Get the current atmospheric scatter sigma
   */
  getAtmosphericScatterSigma(): number {
    return this.atmosphericScatterSigma;
  }

  /**
   * Set the optimization configuration for shader performance
   * @param config - OptimizationConfig with desired optimization flags
   */
  setOptimizations(config: OptimizationConfig): void {
    this.optimizationConfig = config;
    // Note: WGSL optimizations are always-on in the current implementation
    // The config is stored for future use when runtime toggling is needed
  }

  /**
   * Get the current optimization configuration
   */
  getOptimizations(): OptimizationConfig {
    return this.optimizationConfig;
  }

  /**
   * Execute per-layer spectral pipeline
   * This is the unified pipeline that handles all rendering with proper
   * layer-by-layer processing for scattering and emission effects.
   */
  /**
   * SHARED ARCHITECTURE: Rendering pipeline (16 wavelength samples).
   *
   * This method orchestrates the rendering pipeline. The HIGH-RES SPECTRUM
   * PIPELINE (in compute() method) mirrors this structure exactly.
   *
   * When modifying the layer processing loop here, update the high-res
   * loop in compute() to maintain alignment.
   *
   * Both pipelines call computeLayerPhysics() in WGSL for physics calculations.
   */
  private async computeSpectral(
    params: ComputeParams,
    shapes: GPUShape[],
    workgroupsX: number,
    workgroupsY: number
  ): Promise<{ globalMaxY: number; globalMaxSpectral: number }> {
    // Apply atmospheric scatter sigma from params if provided
    if (params.atmosphericScatterSigma !== undefined) {
      this.atmosphericScatterSigma = params.atmosphericScatterSigma;
    }

    // Sort shapes by layer
    const layerGroups = this.sortShapesByLayer(shapes);

    // DEBUG: Record layer order if debug is enabled
    const debugEnabled = this.debugCollector.enabled;
    if (debugEnabled) {
      const layerOrder = Array.from(layerGroups.keys());
      this.debugCollector.recordLayerOrder(layerOrder);
      console.log("[DEBUG-LAYERS] Layer order:", layerOrder);
    }

    // Reset spectral buffer state
    this.spectralBufferSwapped = false;
    this.bindGroup0 = null;

    // === Initialize background spectrum ===
    // Writes to spectralOutput, then combine copies to spectralInput for first layer
    this.updateParamsBuffer(params, 0, 1.0, 0);

    if (!this.ensureBindGroups()) {
      // Resources not ready yet (e.g., textures still loading), skip this frame
      console.warn("[SpectralCompute] Bind groups not ready, skipping frame");
      return { globalMaxY: 1.0, globalMaxSpectral: 1.0 };
    }

    if (
      !this.initBackgroundPipeline ||
      !this.bindGroup0 ||
      !this.bindGroup1 ||
      !this.bindGroup2 ||
      !this.bindGroup3
    ) {
      console.warn(
        "[SpectralCompute] Pipelines or bind groups not initialized, skipping frame",
        {
          initBackgroundPipeline: !!this.initBackgroundPipeline,
          bindGroup0: !!this.bindGroup0,
          bindGroup1: !!this.bindGroup1,
          bindGroup2: !!this.bindGroup2,
          bindGroup3: !!this.bindGroup3,
        }
      );
      return { globalMaxY: 1.0, globalMaxSpectral: 1.0 };
    }

    // Double-check bind groups are valid objects
    if (
      !this.bindGroup0 ||
      !this.bindGroup1 ||
      !this.bindGroup2 ||
      !this.bindGroup3
    ) {
      console.error("[SpectralCompute] Bind group became null between checks!");
      return { globalMaxY: 1.0, globalMaxSpectral: 1.0 };
    }

    // Final safety check before dispatch
    if (
      !this.bindGroup0 ||
      !this.bindGroup1 ||
      !this.bindGroup2 ||
      !this.bindGroup3
    ) {
      console.warn(
        "[SpectralCompute] Bind group became null after ensureBindGroups! Skipping frame.",
        {
          bg0: !!this.bindGroup0,
          bg1: !!this.bindGroup1,
          bg2: !!this.bindGroup2,
          bg3: !!this.bindGroup3,
        }
      );
      return { globalMaxY: 1.0, globalMaxSpectral: 1.0 };
    }

    // Profile: initBackgroundSpectrum
    if (this.profilingEnabled) {
      this.profiler.beginPass("initBackgroundSpectrum");
      this.profiler.beginDispatch(
        "initBackgroundSpectrum",
        "initBackgroundSpectrum"
      );
    }

    const initEncoder = this.device.createCommandEncoder();
    const initPass = initEncoder.beginComputePass();
    initPass.setPipeline(this.initBackgroundPipeline);
    initPass.setBindGroup(0, this.bindGroup0);
    initPass.setBindGroup(1, this.bindGroup1);
    initPass.setBindGroup(2, this.bindGroup2);
    initPass.setBindGroup(3, this.bindGroup3);
    initPass.dispatchWorkgroups(workgroupsX, workgroupsY);
    initPass.end();
    this.device.queue.submit([initEncoder.finish()]);

    // Profile: end initBackgroundSpectrum dispatch (sync for accurate timing)
    if (this.profilingEnabled) {
      await this.device.queue.onSubmittedWorkDone();
      const pixelCount = params.width * params.height;
      const bytesWritten =
        pixelCount * SpectralComputePipeline.SPECTRAL_SAMPLES * 2; // f16 output
      this.profiler.endDispatch(
        [workgroupsX, workgroupsY, 1],
        [8, 8, 1],
        0,
        bytesWritten
      );
      this.profiler.endPass();
    }

    // Swap buffers: output becomes input for first layer
    this.swapSpectralBuffers();

    // === Process each layer back-to-front ===
    for (const [layerIndex, layerShapes] of layerGroups) {
      // Compute global max scatter sigma for this layer
      const layerMaxSigma = this.computeGlobalMaxSigma(layerShapes);
      const hasScattering = this.layerHasScattering(layerShapes);

      // Profile: begin layer
      if (this.profilingEnabled) {
        this.profiler.beginLayer(
          layerIndex,
          layerShapes.length,
          hasScattering,
          layerMaxSigma
        );
      }

      // Update shapes buffer with only this layer's shapes
      this.updateShapesBuffer(layerShapes);
      this.updateParamsBuffer(params, 0, 1.0, layerMaxSigma);
      this.bindGroup0 = null; // Invalidate since shapes/params changed
      if (!this.ensureBindGroups()) {
        // Materials not loaded yet, return defaults
        return { globalMaxY: 1.0, globalMaxSpectral: 1.0 };
      }

      // DEBUG: Start recording this layer (after buffer update so we can verify sizes)
      if (debugEnabled) {
        const shapeInfo = layerShapes.map((s) => ({
          name: `shape_${s.maskIndex}`,
          layer: s.layer,
          temperature: s.temperature,
          materialIndex: s.materialIndex,
        }));
        const expectedSize = layerShapes.length * 48;
        const actualSize = this.shapesBuffer?.size ?? 0;
        const arrayLengthResult = actualSize / 48;

        console.log(
          `[DEBUG-LAYERS] Layer ${layerIndex}: shapes=${layerShapes.length}, ` +
            `bufferSize=${actualSize}, expected=${expectedSize}, ` +
            `arrayLength=${arrayLengthResult}, match=${actualSize === expectedSize}`
        );

        this.debugCollector.startLayer(layerIndex, shapeInfo, {
          shapesBufferSize: actualSize,
          expectedBufferSize: expectedSize,
          arrayLengthWouldReturn: arrayLengthResult,
        });
      }

      // DEBUG: Capture spectralInput BEFORE absorption (what this layer receives from previous)
      if (debugEnabled) {
        await this.device.queue.onSubmittedWorkDone();
        const inputBuffer = this.spectralBufferSwapped
          ? this.spectralBufferB!
          : this.spectralBufferA!;
        const inputValues = await this.debugReadPixelSpectrum(
          inputBuffer,
          this.debugCollector.testPixelX,
          this.debugCollector.testPixelY,
          params.width,
          SpectralComputePipeline.SPECTRAL_SAMPLES
        );
        this.debugCollector.recordBufferState(
          "beforeAbsorption",
          this.spectralBufferSwapped ? "BufferB" : "BufferA",
          inputValues
        );
        console.log(
          `[DEBUG-LAYERS] Layer ${layerIndex} input (first 4):`,
          inputValues.slice(0, 4).map((v) => v.toExponential(3))
        );
      }

      // Apply layer absorption/emission
      // Reads from spectralInput, writes to:
      // - spectralOutput: transmitted + direct emission
      // - scatterSource: scattered light (to be blurred)

      // Profile: applyLayerAbsorption
      if (this.profilingEnabled) {
        this.profiler.beginPass("applyLayerAbsorption");
        this.profiler.beginDispatch(
          "applyLayerAbsorption",
          "applyLayerAbsorption",
          { layer: layerIndex }
        );
      }

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

      // Profile: end applyLayerAbsorption
      if (this.profilingEnabled) {
        const pixelCount = params.width * params.height;
        const bytesRead =
          pixelCount * SpectralComputePipeline.SPECTRAL_SAMPLES * 2; // f16 input
        const bytesWritten =
          pixelCount * SpectralComputePipeline.SPECTRAL_SAMPLES * 2 * 3; // output, scatter, emission
        this.profiler.endDispatch(
          [workgroupsX, workgroupsY, 1],
          [8, 8, 1],
          bytesRead,
          bytesWritten
        );
        this.profiler.endPass();
      }

      // DEBUG: Capture spectralOutput AFTER absorption (transmitted + emission)
      if (debugEnabled) {
        await this.device.queue.onSubmittedWorkDone();
        const outputBuffer = this.spectralBufferSwapped
          ? this.spectralBufferA!
          : this.spectralBufferB!;
        const outputValues = await this.debugReadPixelSpectrum(
          outputBuffer,
          this.debugCollector.testPixelX,
          this.debugCollector.testPixelY,
          params.width,
          SpectralComputePipeline.SPECTRAL_SAMPLES
        );
        this.debugCollector.recordBufferState(
          "afterAbsorption",
          this.spectralBufferSwapped ? "BufferA" : "BufferB",
          outputValues
        );
        console.log(
          `[DEBUG-LAYERS] Layer ${layerIndex} after absorption (first 4):`,
          outputValues.slice(0, 4).map((v) => v.toExponential(3))
        );
      }

      // === Dual-path scattering blur ===
      // Path 1 (blur→mask): Blur full transmitted image, background bleeds INTO shapes
      // Path 2 (mask→blur): Blur aura source, shape light bleeds OUT
      // Always run blur passes - shader handles sigma=0 by copying (sets up buffers for combine)

      const pixelCount = params.width * params.height;
      const spectralBufferBytes =
        pixelCount * SpectralComputePipeline.SPECTRAL_SAMPLES * 2;

      // Path 1: Blur full transmitted image
      // blurTransmittedH: spectralOutput → spectralInput (H-blurred)
      if (this.profilingEnabled) {
        this.profiler.beginPass("blurTransmittedH");
        this.profiler.beginDispatch("blurTransmittedH", "blurTransmittedH", {
          layer: layerIndex,
        });
      }
      const blurTransHEncoder = this.device.createCommandEncoder();
      const blurTransHPass = blurTransHEncoder.beginComputePass();
      blurTransHPass.setPipeline(this.blurTransmittedHPipeline!);
      blurTransHPass.setBindGroup(0, this.bindGroup0!);
      blurTransHPass.setBindGroup(1, this.bindGroup1!);
      blurTransHPass.setBindGroup(2, this.bindGroup2!);
      blurTransHPass.setBindGroup(3, this.bindGroup3!);
      blurTransHPass.dispatchWorkgroups(workgroupsX, workgroupsY);
      blurTransHPass.end();
      this.device.queue.submit([blurTransHEncoder.finish()]);
      if (this.profilingEnabled) {
        this.profiler.endDispatch(
          [workgroupsX, workgroupsY, 1],
          [8, 8, 1],
          spectralBufferBytes,
          spectralBufferBytes
        );
        this.profiler.endPass();
      }

      // blurTransmittedV: spectralInput → emissionAura (blurred full, temp storage)
      if (this.profilingEnabled) {
        this.profiler.beginPass("blurTransmittedV");
        this.profiler.beginDispatch("blurTransmittedV", "blurTransmittedV", {
          layer: layerIndex,
        });
      }
      const blurTransVEncoder = this.device.createCommandEncoder();
      const blurTransVPass = blurTransVEncoder.beginComputePass();
      blurTransVPass.setPipeline(this.blurTransmittedVPipeline!);
      blurTransVPass.setBindGroup(0, this.bindGroup0!);
      blurTransVPass.setBindGroup(1, this.bindGroup1!);
      blurTransVPass.setBindGroup(2, this.bindGroup2!);
      blurTransVPass.setBindGroup(3, this.bindGroup3!);
      blurTransVPass.dispatchWorkgroups(workgroupsX, workgroupsY);
      blurTransVPass.end();
      this.device.queue.submit([blurTransVEncoder.finish()]);
      if (this.profilingEnabled) {
        this.profiler.endDispatch(
          [workgroupsX, workgroupsY, 1],
          [8, 8, 1],
          spectralBufferBytes,
          spectralBufferBytes
        );
        this.profiler.endPass();
      }

      // Path 2: Blur aura source (already computed in absorption pass)
      // blurHorizontal: scatterSource → spectralInput (H-blurred aura)
      if (this.profilingEnabled) {
        this.profiler.beginPass("blurHorizontal");
        this.profiler.beginDispatch("blurHorizontal", "blurHorizontal", {
          layer: layerIndex,
        });
      }
      const hBlurEncoder = this.device.createCommandEncoder();
      const hBlurPass = hBlurEncoder.beginComputePass();
      hBlurPass.setPipeline(this.blurHorizontalPipeline!);
      hBlurPass.setBindGroup(0, this.bindGroup0!);
      hBlurPass.setBindGroup(1, this.bindGroup1!);
      hBlurPass.setBindGroup(2, this.bindGroup2!);
      hBlurPass.setBindGroup(3, this.bindGroup3!);
      hBlurPass.dispatchWorkgroups(workgroupsX, workgroupsY);
      hBlurPass.end();
      this.device.queue.submit([hBlurEncoder.finish()]);
      if (this.profilingEnabled) {
        this.profiler.endDispatch(
          [workgroupsX, workgroupsY, 1],
          [8, 8, 1],
          spectralBufferBytes,
          spectralBufferBytes
        );
        this.profiler.endPass();
      }

      // blurVertical: spectralInput → scatterSource (blurred aura)
      if (this.profilingEnabled) {
        this.profiler.beginPass("blurVertical");
        this.profiler.beginDispatch("blurVertical", "blurVertical", {
          layer: layerIndex,
        });
      }
      const vBlurEncoder = this.device.createCommandEncoder();
      const vBlurPass = vBlurEncoder.beginComputePass();
      vBlurPass.setPipeline(this.blurVerticalPipeline!);
      vBlurPass.setBindGroup(0, this.bindGroup0!);
      vBlurPass.setBindGroup(1, this.bindGroup1!);
      vBlurPass.setBindGroup(2, this.bindGroup2!);
      vBlurPass.setBindGroup(3, this.bindGroup3!);
      vBlurPass.dispatchWorkgroups(workgroupsX, workgroupsY);
      vBlurPass.end();
      this.device.queue.submit([vBlurEncoder.finish()]);
      if (this.profilingEnabled) {
        this.profiler.endDispatch(
          [workgroupsX, workgroupsY, 1],
          [8, 8, 1],
          spectralBufferBytes,
          spectralBufferBytes
        );
        this.profiler.endPass();
      }

      // Note: Emission aura buffer is now used for blurred transmitted (dual-path scatter).
      // Emission aura blur is currently disabled in favor of the new scattering model.
      // TODO: Re-enable emission aura as a separate effect if needed.
      const emissionAuraSigma = params.emissionAuraSigma ?? 3.0;
      void emissionAuraSigma; // Suppress unused warning

      // Combine: spectralOutput + scatterSource + emissionAura → spectralInput (for next layer)
      if (this.profilingEnabled) {
        this.profiler.beginPass("combineScattered");
        this.profiler.beginDispatch("combineScattered", "combineScattered", {
          layer: layerIndex,
        });
      }
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
      if (this.profilingEnabled) {
        this.profiler.endDispatch(
          [workgroupsX, workgroupsY, 1],
          [8, 8, 1],
          spectralBufferBytes * 3,
          spectralBufferBytes
        );
        this.profiler.endPass();
      }

      // DEBUG: Capture spectralInput AFTER combine (final result for this layer)
      if (debugEnabled) {
        await this.device.queue.onSubmittedWorkDone();
        const combineBuffer = this.spectralBufferSwapped
          ? this.spectralBufferB!
          : this.spectralBufferA!;
        const combineValues = await this.debugReadPixelSpectrum(
          combineBuffer,
          this.debugCollector.testPixelX,
          this.debugCollector.testPixelY,
          params.width,
          SpectralComputePipeline.SPECTRAL_SAMPLES
        );
        this.debugCollector.recordBufferState(
          "afterCombine",
          this.spectralBufferSwapped ? "BufferB" : "BufferA",
          combineValues
        );
        console.log(
          `[DEBUG-LAYERS] Layer ${layerIndex} after combine (first 4):`,
          combineValues.slice(0, 4).map((v) => v.toExponential(3))
        );
      }

      // Profile: end layer (wait for GPU to complete for accurate timing)
      if (this.profilingEnabled) {
        await this.device.queue.onSubmittedWorkDone();
        this.profiler.endLayer();
      }
    }

    // DEBUG: Capture final spectralInput before integration
    if (debugEnabled) {
      await this.device.queue.onSubmittedWorkDone();
      const finalBuffer = this.spectralBufferSwapped
        ? this.spectralBufferB!
        : this.spectralBufferA!;
      const finalValues = await this.debugReadPixelSpectrum(
        finalBuffer,
        this.debugCollector.testPixelX,
        this.debugCollector.testPixelY,
        params.width,
        SpectralComputePipeline.SPECTRAL_SAMPLES
      );
      this.debugCollector.recordFinalSpectralInput(finalValues);
      console.log(
        "[DEBUG-LAYERS] Final spectral input (first 4):",
        finalValues.slice(0, 4).map((v) => v.toExponential(3))
      );
    }

    // Restore full shapes buffer for spectrum integration
    this.updateShapesBuffer(shapes);
    this.bindGroup0 = null;
    if (!this.ensureBindGroups()) {
      // Materials not loaded yet, return defaults
      return { globalMaxY: 1.0, globalMaxSpectral: 1.0 };
    }

    // === Integrate spectrum to XYZ (Pass 0) ===
    this.updateParamsBuffer(params, 0, 1.0, 0);

    // Safety check before integration dispatch
    if (
      !this.bindGroup0 ||
      !this.bindGroup1 ||
      !this.bindGroup2 ||
      !this.bindGroup3
    ) {
      console.warn(
        "[SpectralCompute] Bind group null before integration pass! Skipping.",
        {
          bg0: !!this.bindGroup0,
          bg1: !!this.bindGroup1,
          bg2: !!this.bindGroup2,
          bg3: !!this.bindGroup3,
        }
      );
      return { globalMaxY: 1.0, globalMaxSpectral: 1.0 };
    }

    // Profile: integrateSpectrum (pass 0)
    if (this.profilingEnabled) {
      this.profiler.beginPass("integrateSpectrum_Pass0");
      this.profiler.beginDispatch("integrateSpectrum", "integrateSpectrum");
    }

    const intEncoder = this.device.createCommandEncoder();
    const intPass = intEncoder.beginComputePass();
    intPass.setPipeline(this.integrateSpectrumPipeline!);
    intPass.setBindGroup(0, this.bindGroup0);
    intPass.setBindGroup(1, this.bindGroup1);
    intPass.setBindGroup(2, this.bindGroup2);
    intPass.setBindGroup(3, this.bindGroup3);
    intPass.dispatchWorkgroups(workgroupsX, workgroupsY);
    intPass.end();
    this.device.queue.submit([intEncoder.finish()]);

    if (this.profilingEnabled) {
      const pixelCount = params.width * params.height;
      const bytesRead =
        pixelCount * SpectralComputePipeline.SPECTRAL_SAMPLES * 2;
      const bytesWritten = pixelCount * 16 + pixelCount * 4; // vec4<f32> RGB + f32 max
      this.profiler.endDispatch(
        [workgroupsX, workgroupsY, 1],
        [8, 8, 1],
        bytesRead,
        bytesWritten
      );
      this.profiler.endPass();
    }

    // Read max per pixel for normalization (Y/luminance for screen)
    const maxData = await this.readMaxPerPixel();
    let globalMaxY = 0.001;
    for (let i = 0; i < maxData.length; i++) {
      if (maxData[i] > globalMaxY) {
        globalMaxY = maxData[i];
      }
    }

    // Also read max spectral intensity from rgbOutput.w (for plot normalization)
    const rgbData = await this.readRGBOutputWrite();
    let globalMaxSpectral = 0.001;
    // rgbOutput is vec4<f32> per pixel, .w is at index i*4+3
    for (let i = 0; i < this.width * this.height; i++) {
      const maxIntensity = rgbData[i * 4 + 3]; // .w component
      if (maxIntensity > globalMaxSpectral) {
        globalMaxSpectral = maxIntensity;
      }
    }

    // Re-ensure bind groups after async buffer reads (they may have been invalidated)
    if (!this.ensureBindGroups()) {
      return { globalMaxY, globalMaxSpectral };
    }

    // === Normalize pass ===
    this.updateParamsBuffer(params, 1, globalMaxY, 0);

    // Safety check before normalize dispatch
    if (
      !this.bindGroup0 ||
      !this.bindGroup1 ||
      !this.bindGroup2 ||
      !this.bindGroup3
    ) {
      console.warn(
        "[SpectralCompute] Bind group null before normalize pass! Returning."
      );
      return { globalMaxY, globalMaxSpectral };
    }

    // Profile: integrateSpectrum (normalize pass)
    if (this.profilingEnabled) {
      this.profiler.beginPass("integrateSpectrum_Normalize");
      this.profiler.beginDispatch(
        "integrateSpectrum_Normalize",
        "integrateSpectrum"
      );
    }

    const normEncoder = this.device.createCommandEncoder();
    const normPass = normEncoder.beginComputePass();
    normPass.setPipeline(this.integrateSpectrumPipeline!);
    normPass.setBindGroup(0, this.bindGroup0);
    normPass.setBindGroup(1, this.bindGroup1);
    normPass.setBindGroup(2, this.bindGroup2);
    normPass.setBindGroup(3, this.bindGroup3);
    normPass.dispatchWorkgroups(workgroupsX, workgroupsY);
    normPass.end();
    this.device.queue.submit([normEncoder.finish()]);
    await this.device.queue.onSubmittedWorkDone();

    if (this.profilingEnabled) {
      const pixelCount = params.width * params.height;
      const bytesReadWrite = pixelCount * 16; // vec4<f32> RGB in/out
      this.profiler.endDispatch(
        [workgroupsX, workgroupsY, 1],
        [8, 8, 1],
        bytesReadWrite,
        bytesReadWrite
      );
      this.profiler.endPass();
    }

    return { globalMaxY, globalMaxSpectral };
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
  async compute(
    params: ComputeParams,
    shapes: GPUShape[]
  ): Promise<ComputeResult> {
    if (!this.colorPipeline) {
      throw new Error("Pipeline not initialized");
    }

    // Start profiling session
    if (this.profilingEnabled) {
      this.profiler.startSession(this.frameCount);
      this.lastProfilingParams = {
        width: params.width,
        height: params.height,
        spectralSamples: params.spectralResolution,
        plotResolution:
          params.plotResolution ??
          SpectralComputePipeline.MAX_SPECTRAL_RESOLUTION,
      };
    }

    // Update settings
    const newPlotResolution =
      params.plotResolution ?? SpectralComputePipeline.MAX_SPECTRAL_RESOLUTION;
    const newBoxSize =
      params.boxSize ?? SpectralComputePipeline.DEFAULT_BOX_SIZE;

    // Resize spectrum box buffer if boxSize or plotResolution changed
    const needsBufferResize = 
      newBoxSize !== this.boxSize || 
      newPlotResolution !== this.plotResolution;
    
    if (needsBufferResize) {
      this.boxSize = newBoxSize;
      this.plotResolution = newPlotResolution;
      this.spectrumBoxBuffer?.destroy();
      this.initSpectrumBoxBuffer();
      // Also resize high-res buffers for new resolution
      this.destroyHighResBuffers();
      this.bindGroup0 = null;
    }

    // Resize if needed
    this.resize(params.width, params.height);

    // Update shapes buffer
    this.updateShapesBuffer(shapes);

    const isSampling =
      (params.sampleX ?? -1) >= 0 && (params.sampleY ?? -1) >= 0;

    const workgroupsX = Math.ceil(params.width / 8);
    const workgroupsY = Math.ceil(params.height / 8);

    this.lastPassTimings = [];

    // === Use unified per-layer spectral pipeline ===
    const pass0Start = performance.now();
    const { globalMaxY, globalMaxSpectral } = await this.computeSpectral(
      params,
      shapes,
      workgroupsX,
      workgroupsY
    );
    this.lastGlobalMaxIntensity = globalMaxY;
    this.lastGlobalMaxSpectral = globalMaxSpectral;

    const pass0End = performance.now();
    this.lastPassTimings.push({
      name: "Pass 0 (Spectral)",
      startTime: pass0Start,
      endTime: pass0End,
      duration: pass0End - pass0Start,
    });

    // Note: Normalization is handled inside computeSpectral()

    // === HIGH-RES SPECTRUM PIPELINE (only if sampling) ===
    // SHARED ARCHITECTURE: This pipeline mirrors the rendering pipeline exactly,
    // using the same physics via computeLayerPhysics(), but at 5000 wavelengths.
    if (isSampling && this.averagePipeline) {
      const spectrumBoxSize = SpectralComputePipeline.SPECTRUM_BOX_SIZE;
      console.log(
        "[DEBUG-SPECTRUM] === Starting high-res spectrum pipeline ==="
      );
      console.log(
        "[DEBUG-SPECTRUM] Sample position:",
        params.sampleX,
        params.sampleY
      );
      console.log(
        "[DEBUG-SPECTRUM] SPECTRUM_BOX_SIZE:",
        spectrumBoxSize,
        "Plot resolution:",
        this.plotResolution
      );

      // Calculate expected pixel positions using SPECTRUM_BOX_SIZE
      const halfBox = Math.floor(spectrumBoxSize / 2);
      const pixel00Screen = {
        x: (params.sampleX ?? 0) - halfBox,
        y: (params.sampleY ?? 0) - halfBox,
      };
      console.log(
        "[DEBUG-SPECTRUM] Pixel (0,0) screen pos:",
        pixel00Screen,
        "inBounds:",
        pixel00Screen.x >= 0 &&
          pixel00Screen.x < params.width &&
          pixel00Screen.y >= 0 &&
          pixel00Screen.y < params.height
      );

      const pass2Start = performance.now();

      // CRITICAL: Update params buffer with spectrum mode (uses SPECTRUM_BOX_SIZE)
      this.updateParamsBuffer(params, 0, 1.0, 0, "spectrum");
      console.log(
        "[DEBUG-SPECTRUM] Updated params buffer for high-res pipeline (mode=spectrum)"
      );

      // Ensure high-res buffers are allocated
      this.ensureHighResBuffers();
      console.log("[DEBUG-SPECTRUM] High-res buffers allocated:", {
        A: !!this.spectrumHighResA,
        B: !!this.spectrumHighResB,
        scatter: !!this.spectrumHighResScatter,
        emission: !!this.spectrumHighResEmissionAura,
        sigma: !!this.spectrumHighResSigma,
      });

      // Switch to high-res buffer mode for spectrum computation
      this.useHighResBuffers = true;
      this.spectrumHighResSwapped = false; // Reset ping-pong state
      this.bindGroup0 = null;
      console.log(
        "[DEBUG-SPECTRUM] Switched to high-res buffer mode, swapped=false"
      );

      const bindGroupsReady = this.ensureBindGroups();
      console.log(
        "[DEBUG-SPECTRUM] ensureBindGroups returned:",
        bindGroupsReady
      );
      console.log("[DEBUG-SPECTRUM] Bind groups state:", {
        bg0: !!this.bindGroup0,
        bg1: !!this.bindGroup1,
        bg2: !!this.bindGroup2,
        bg3: !!this.bindGroup3,
      });

      if (
        !bindGroupsReady ||
        !this.bindGroup0 ||
        !this.bindGroup1 ||
        !this.bindGroup2 ||
        !this.bindGroup3
      ) {
        console.warn(
          "[DEBUG-SPECTRUM] High-res bind groups not ready, skipping spectrum"
        );
        this.useHighResBuffers = false;
        // Skip to end of spectrum computation
      } else {
        // Use SPECTRUM_BOX_SIZE (30) for workgroup calculation, not this.boxSize
        const spectrumBoxSize = SpectralComputePipeline.SPECTRUM_BOX_SIZE;
        const boxWorkgroupsX = Math.ceil(spectrumBoxSize / 8);
        const boxWorkgroupsY = Math.ceil(spectrumBoxSize / 8);
        console.log(
          "[DEBUG-SPECTRUM] Workgroups:",
          boxWorkgroupsX,
          "x",
          boxWorkgroupsY,
          "(boxSize:",
          spectrumBoxSize,
          ")"
        );

        let dispatchCount = 0;
        // Helper to dispatch a high-res pass - captures bind groups at dispatch time
        const dispatchHighRes = (
          pipeline: GPUComputePipeline,
          label: string
        ) => {
          dispatchCount++;
          // Verify bind groups before each dispatch
          if (
            !this.bindGroup0 ||
            !this.bindGroup1 ||
            !this.bindGroup2 ||
            !this.bindGroup3
          ) {
            console.error(
              `[DEBUG-SPECTRUM] Bind groups null before dispatch: ${label}`
            );
            return;
          }
          if (!pipeline) {
            console.error(`[DEBUG-SPECTRUM] Pipeline is null: ${label}`);
            return;
          }
          console.log(`[DEBUG-SPECTRUM] Dispatch #${dispatchCount}: ${label}`);
          const encoder = this.device.createCommandEncoder({ label });
          const pass = encoder.beginComputePass();
          pass.setPipeline(pipeline);
          pass.setBindGroup(0, this.bindGroup0);
          pass.setBindGroup(1, this.bindGroup1);
          pass.setBindGroup(2, this.bindGroup2);
          pass.setBindGroup(3, this.bindGroup3);
          pass.dispatchWorkgroups(boxWorkgroupsX, boxWorkgroupsY);
          pass.end();
          this.device.queue.submit([encoder.finish()]);
        };

        // Step 1: Initialize high-res background spectrum (uses unified pipeline with mode='spectrum')
        this.updateParamsBuffer(params, 0, 1.0, 0, "spectrum");
        this.bindGroup0 = null;
        this.ensureBindGroups();
        dispatchHighRes(
          this.initBackgroundPipeline!,
          "High-Res Init Background"
        );

        // Swap buffers: output becomes input for first layer (matches rendering pipeline)
        this.swapHighResSpectralBuffers();
        this.bindGroup0 = null;
        this.ensureBindGroups();

        // DEBUG: Check if background was written to input buffer (now swapped)
        await this.device.queue.onSubmittedWorkDone();
        // After swap, spectralInput contains the background
        const inputBufferAfterInit = this.spectrumHighResSwapped
          ? this.spectrumHighResB!
          : this.spectrumHighResA!;
        console.log(
          "[DEBUG-SPECTRUM] Reading from buffer:",
          inputBufferAfterInit.label,
          "size:",
          inputBufferAfterInit.size
        );
        await this.debugReadbackBuffer(
          inputBufferAfterInit,
          "AFTER init - shader write (should have background)"
        );

        // Step 2: Process each layer (mirrors rendering pipeline)
        const layerMap = this.sortShapesByLayer(shapes);
        const sortedLayers = Array.from(layerMap.keys()).sort((a, b) => a - b);
        console.log(
          "[DEBUG-SPECTRUM] Processing",
          sortedLayers.length,
          "layers:",
          sortedLayers
        );

        for (let layerIdx = 0; layerIdx < sortedLayers.length; layerIdx++) {
          const layer = sortedLayers[layerIdx];
          const isLastLayer = layerIdx === sortedLayers.length - 1;
          const layerShapes = layerMap.get(layer)!;
          console.log(
            `[DEBUG-SPECTRUM] Layer ${layer}: ${layerShapes.length} shapes (last=${isLastLayer})`
          );

          // Compute layer's scatter sigma (mirrors rendering pipeline)
          const layerMaxSigma = this.computeGlobalMaxSigma(layerShapes);
          console.log(
            `[DEBUG-SPECTRUM] Layer ${layer}: scatter sigma = ${layerMaxSigma}`
          );

          // Update shapes and params buffers (uses unified pipeline with mode='spectrum')
          this.updateShapesBuffer(layerShapes);
          this.updateParamsBuffer(params, 0, 1.0, layerMaxSigma, "spectrum");
          this.bindGroup0 = null; // Invalidate since shapes/params changed
          this.ensureBindGroups();

          // DEBUG: Check what's in spectralInput BEFORE absorption reads from it
          await this.device.queue.onSubmittedWorkDone();
          const inputBeforeAbs = this.spectrumHighResSwapped
            ? this.spectrumHighResB!
            : this.spectrumHighResA!;
          console.log(
            `[DEBUG-SPECTRUM] BEFORE Layer ${layer} absorption, spectralInput=${inputBeforeAbs.label}, swapped=${this.spectrumHighResSwapped}`
          );
          await this.debugReadbackBuffer(
            inputBeforeAbs,
            `spectralInput BEFORE Layer ${layer} absorption`
          );

          // Apply layer absorption/emission (uses unified pipeline with spectrum params)
          dispatchHighRes(
            this.layerAbsorptionPipeline!,
            `High-Res Layer ${layer} Absorption`
          );

          // DEBUG: Check buffer contents after absorption
          await this.device.queue.onSubmittedWorkDone();
          const inputAfterAbs = this.spectrumHighResSwapped
            ? this.spectrumHighResB!
            : this.spectrumHighResA!;
          const outputAfterAbs = this.spectrumHighResSwapped
            ? this.spectrumHighResA!
            : this.spectrumHighResB!;
          console.log(
            `[DEBUG-SPECTRUM] After Layer ${layer} absorption, swapped=${this.spectrumHighResSwapped}`
          );
          await this.debugReadbackBuffer(
            outputAfterAbs,
            `spectralOutput after Layer ${layer} absorption`
          );

          // === Dual-path scattering blur (uses unified pipelines with spectrum params) ===
          // Skip blur passes in draft mode for performance (~8ms saved per layer)
          const skipBlur = params.skipBlur ?? false;
          
          if (!skipBlur) {
            // Path 1 (blur→mask): Blur full transmitted, background bleeds INTO shapes
            dispatchHighRes(
              this.blurTransmittedHPipeline!,
              `High-Res Layer ${layer} BlurTrans H`
            );
            dispatchHighRes(
              this.blurTransmittedVPipeline!,
              `High-Res Layer ${layer} BlurTrans V`
            );

            // Path 2 (mask→blur): Blur aura source, shape light bleeds OUT
            dispatchHighRes(
              this.blurHorizontalPipeline!,
              `High-Res Layer ${layer} Blur H`
            );
            dispatchHighRes(
              this.blurVerticalPipeline!,
              `High-Res Layer ${layer} Blur V`
            );

            // Note: Emission aura buffer is now used for blurred transmitted (dual-path scatter).
            // Emission aura blur is currently disabled in favor of the new scattering model.
            const emissionAuraSigma = params.emissionAuraSigma ?? 3.0;
            void emissionAuraSigma; // Suppress unused warning

            // Combine scattered with transmitted (uses unified pipeline with spectrum params)
            dispatchHighRes(
              this.combineScatteredPipeline!,
              `High-Res Layer ${layer} Combine`
            );
          } else {
            // Draft mode: Skip blur/combine, absorption output is layer result
            console.log(`[DEBUG-SPECTRUM] Layer ${layer}: Skipping blur (draft mode)`);
          }

          // DEBUG: Check buffer contents after each layer's combine
          await this.device.queue.onSubmittedWorkDone();
          const inputAfterCombine = this.spectrumHighResSwapped
            ? this.spectrumHighResB!
            : this.spectrumHighResA!;
          const outputAfterCombine = this.spectrumHighResSwapped
            ? this.spectrumHighResA!
            : this.spectrumHighResB!;
          console.log(
            `[DEBUG-SPECTRUM] After Layer ${layer} combine, swapped=${this.spectrumHighResSwapped}`
          );
          await this.debugReadbackBuffer(
            inputAfterCombine,
            `spectralInput after Layer ${layer} combine`
          );
          await this.debugReadbackBuffer(
            outputAfterCombine,
            `spectralOutput after Layer ${layer} combine`
          );

          // No swap needed between layers - combine writes to spectralInput,
          // and next layer absorption reads from spectralInput
          console.log(`[DEBUG-SPECTRUM] Layer ${layer} done`);
        }

        // Restore full shapes for bind group
        this.updateShapesBuffer(shapes);
        this.ensureBindGroups();

        // Step 3: Final combine to spectrumBox
        console.log(
          "[DEBUG-SPECTRUM] Final combine - buffer state: swapped=",
          this.spectrumHighResSwapped
        );

        // DEBUG: Check spectral buffers before final combine
        const inputBeforeFinal = this.spectrumHighResSwapped
          ? this.spectrumHighResB!
          : this.spectrumHighResA!;
        const outputBeforeFinal = this.spectrumHighResSwapped
          ? this.spectrumHighResA!
          : this.spectrumHighResB!;
        console.log(
          "[DEBUG-SPECTRUM] Before final combine: input=" +
            inputBeforeFinal.label +
            ", output=" +
            outputBeforeFinal.label
        );
        await this.debugReadbackBuffer(
          inputBeforeFinal,
          "spectralInput before Final"
        );
        await this.debugReadbackBuffer(
          outputBeforeFinal,
          "spectralOutput before Final"
        );

        dispatchHighRes(this.finalCombinePipeline!, "High-Res Final Combine");
        await this.device.queue.onSubmittedWorkDone();

        // DEBUG: Check spectrumBox after final combine
        console.log(
          "[DEBUG-SPECTRUM] spectrumBoxBuffer size:",
          this.spectrumBoxBuffer?.size
        );
        if (this.spectrumBoxBuffer) {
          const readbackBuffer = this.device.createBuffer({
            label: "Debug Readback spectrumBox",
            size: this.spectrumBoxBuffer.size,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
          });
          const encoder = this.device.createCommandEncoder();
          encoder.copyBufferToBuffer(
            this.spectrumBoxBuffer,
            0,
            readbackBuffer,
            0,
            this.spectrumBoxBuffer.size
          );
          this.device.queue.submit([encoder.finish()]);
          await readbackBuffer.mapAsync(GPUMapMode.READ);
          const data = new Uint16Array(readbackBuffer.getMappedRange());
          let nonZero = 0;
          const first10: number[] = [];
          for (let i = 0; i < Math.min(data.length, 100); i++) {
            const f16 = data[i];
            const sign = (f16 >> 15) & 1;
            const exp = (f16 >> 10) & 0x1f;
            const frac = f16 & 0x3ff;
            let f32: number;
            if (exp === 0)
              f32 = (sign ? -1 : 1) * Math.pow(2, -14) * (frac / 1024);
            else if (exp === 31) f32 = frac ? NaN : sign ? -Infinity : Infinity;
            else
              f32 = (sign ? -1 : 1) * Math.pow(2, exp - 15) * (1 + frac / 1024);
            if (i < 10) first10.push(f32);
            if (f32 !== 0) nonZero++;
          }
          console.log(
            "[DEBUG-SPECTRUM] spectrumBox after final combine: nonZero=" +
              nonZero +
              "/100, first 10:",
            first10.map((v) => v.toExponential(3))
          );
          readbackBuffer.unmap();
          readbackBuffer.destroy();
        }

        console.log(
          "[DEBUG-SPECTRUM] High-res pipeline complete, total dispatches:",
          dispatchCount
        );
      } // End of else block for bind groups ready check

      // Switch back to normal buffer mode
      this.useHighResBuffers = false;
      this.bindGroup0 = null;

      const pass2End = performance.now();
      this.lastPassTimings.push({
        name: "Pass 2 (High-Res Spectrum)",
        startTime: pass2Start,
        endTime: pass2End,
        duration: pass2End - pass2Start,
      });

      // PASS 3: Average spectrum (GPU reduction)
      console.log("[DEBUG-SPECTRUM] === Starting averaging pass ===");
      console.log(
        "[DEBUG-SPECTRUM] useHighResBuffers:",
        this.useHighResBuffers
      );
      console.log("[DEBUG-SPECTRUM] plotResolution:", this.plotResolution);

      const pass3Start = performance.now();

      // Update params with spectrum mode so averageSpectrum has correct bufferWidth (SPECTRUM_BOX_SIZE)
      this.updateParamsBuffer(params, 0, 1.0, 0, "spectrum");
      this.bindGroup0 = null;
      this.ensureBindGroups();

      const avgWorkgroups = Math.ceil(this.plotResolution / 256);
      console.log("[DEBUG-SPECTRUM] Averaging workgroups:", avgWorkgroups);
      console.log("[DEBUG-SPECTRUM] Bind groups for averaging:", {
        bg0: !!this.bindGroup0,
        bg1: !!this.bindGroup1,
        bg2: !!this.bindGroup2,
        bg3: !!this.bindGroup3,
      });

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
      console.log("[DEBUG-SPECTRUM] Averaging pass complete");

      // DEBUG: Check final spectrum output
      await this.debugReadbackSpectrumOutput();

      const pass3End = performance.now();
      this.lastPassTimings.push({
        name: "Pass 3 (Average)",
        startTime: pass3Start,
        endTime: pass3End,
        duration: pass3End - pass3Start,
      });
    }

    // Swap to next buffer for double-buffering (next frame writes to other buffer)
    this.swapBuffers();

    // End profiling session
    if (this.profilingEnabled) {
      this.profiler.endSession();
    }

    return { globalMaxIntensity: globalMaxY, globalMaxSpectral };
  }

  /**
   * Get the global max Y (luminance) from the last render - used for screen normalization
   */
  getLastGlobalMaxIntensity(): number {
    return this.lastGlobalMaxIntensity;
  }

  /**
   * Get the global max spectral intensity from the last render - used for plot normalization
   */
  getLastGlobalMaxSpectral(): number {
    return this.lastGlobalMaxSpectral;
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

    return readBufferData(this.device, buffer, this.plotResolution * 4);
  }

  /**
   * Read max intensity per pixel (for finding global max)
   */
  private async readMaxPerPixel(): Promise<Float32Array> {
    if (!this.maxPerPixelBuffer) {
      throw new Error("No max buffer");
    }

    return readBufferData(
      this.device,
      this.maxPerPixelBuffer,
      this.width * this.height * 4
    );
  }

  /**
   * Read RGB output from the WRITE buffer (current frame's result)
   * Used during pass 0 to extract max spectral intensity from .w component
   */
  private async readRGBOutputWrite(): Promise<Float32Array> {
    const { writeIndex } = this.getBufferIndices();
    const buffer = this.rgbOutputBuffers[writeIndex];

    if (!buffer) {
      return new Float32Array(this.width * this.height * 4);
    }

    return readBufferData(
      this.device,
      buffer,
      this.width * this.height * 4 * 4
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
   * - bufferWidth: u32 (76)      // Unified: width for render, boxSize for spectrum
   * - bufferHeight: u32 (80)     // Unified: height for render, boxSize for spectrum
   * - sampleCount: u32 (84)      // Unified: 16 for render, plotResolution for spectrum
   * - coordOffsetX: i32 (88)     // Unified: 0 for render, sampleX - boxSize/2 for spectrum
   * - coordOffsetY: i32 (92)     // Unified: 0 for render, sampleY - boxSize/2 for spectrum
   * Total: 96 bytes (aligned to 16 bytes)
   */
  private updateParamsBuffer(
    params: ComputeParams,
    isNormalizationPass: number = 0,
    globalMaxIntensity: number = 1.0,
    globalMaxScatterSigma: number = 0.0,
    mode: "render" | "spectrum" = "render"
  ): void {
    if (!this.paramsBuffer) {
      this.paramsBuffer = createUniformBuffer(this.device, 96);
    }

    const backgroundModeIndex =
      params.backgroundMode === "normal"
        ? 0
        : params.backgroundMode === "uv"
          ? 1
          : 2;

    // Compute unified params based on mode
    // For spectrum mode, use SPECTRUM_BOX_SIZE (30) - the buffer allocation size
    const isSpectrum = mode === "spectrum";
    const spectrumBoxSize = SpectralComputePipeline.SPECTRUM_BOX_SIZE;
    const bufferWidth = isSpectrum ? spectrumBoxSize : params.width;
    const bufferHeight = isSpectrum ? spectrumBoxSize : params.height;
    const sampleCount = isSpectrum ? (params.plotResolution ?? 4500) : 16;
    const coordOffsetX = isSpectrum
      ? (params.sampleX ?? 0) - Math.floor(spectrumBoxSize / 2)
      : 0;
    const coordOffsetY = isSpectrum
      ? (params.sampleY ?? 0) - Math.floor(spectrumBoxSize / 2)
      : 0;

    const data = new ArrayBuffer(96);
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
    view.setUint32(52, params.plotResolution ?? 4500, true);
    view.setUint32(56, params.averageRadius ?? 5, true);
    view.setUint32(60, this.boxSize, true);
    view.setFloat32(64, globalMaxScatterSigma, true);
    view.setFloat32(68, params.emissionSpreadFactor ?? 0.3, true);
    view.setFloat32(72, params.emissionAuraSigma ?? 3.0, true);
    // Unified pipeline params
    view.setUint32(76, bufferWidth, true);
    view.setUint32(80, bufferHeight, true);
    view.setUint32(84, sampleCount, true);
    view.setInt32(88, coordOffsetX, true);
    view.setInt32(92, coordOffsetY, true);

    // Debug logging for spectrum params
    if ((params.sampleX ?? -1) >= 0) {
      console.log("[DEBUG-SPECTRUM] updateParamsBuffer:", {
        width: params.width,
        height: params.height,
        sampleX: params.sampleX,
        sampleY: params.sampleY,
        plotResolution: params.plotResolution ?? 4500,
        boxSize: this.boxSize,
        averageRadius: params.averageRadius ?? 5,
        enableEmission: params.enableEmission,
        backgroundMode: params.backgroundMode,
        mode,
        bufferWidth,
        bufferHeight,
        sampleCount,
        coordOffsetX,
        coordOffsetY,
      });
    }

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

    // Recreate buffer if size changed IN EITHER DIRECTION
    // This ensures arrayLength(&shapes) always returns the correct count
    // and prevents stale shape data from affecting layer processing
    if (!this.shapesBuffer || this.shapesBuffer.size !== data.byteLength) {
      this.shapesBuffer?.destroy();
      this.shapesBuffer = this.device.createBuffer({
        label: "Shapes",
        size: data.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      this.bindGroup0 = null;
    }

    this.device.queue.writeBuffer(this.shapesBuffer, 0, data);
  }

  /**
   * Ensure bind groups are created using explicit layouts
   * @returns true if all bind groups are ready, false otherwise
   */
  private ensureBindGroups(): boolean {
    // Bind group 0: params, shapes, outputs, spectrum box
    // Uses current write buffer for double-buffering
    if (!this.bindGroup0) {
      const { writeIndex } = this.getBufferIndices();
      const rgbBuffer = this.rgbOutputBuffers[writeIndex];
      const spectrumBuffer = this.spectrumOutputBuffers[writeIndex];

      if (
        !this.paramsBuffer ||
        !this.shapesBuffer ||
        !rgbBuffer ||
        !spectrumBuffer ||
        !this.maxPerPixelBuffer ||
        !this.spectrumBoxBuffer ||
        !this.bindGroupLayout0
      ) {
        console.error(
          "[SpectralCompute] Cannot create bindGroup0 - missing buffers or layout"
        );
        return false;
      }

      // Determine spectral buffer order based on swap state
      // Determine which buffers to use based on whether we're computing high-res spectrum
      let inputBuffer: GPUBuffer;
      let outputBuffer: GPUBuffer;
      let sigmaBuffer: GPUBuffer;
      let scatterSrcBuffer: GPUBuffer;
      let emissionAuraBuffer: GPUBuffer;

      if (this.useHighResBuffers && this.spectrumHighResA) {
        // High-res spectrum mode: use dedicated high-res buffers
        const highResSwap = this.spectrumHighResSwapped;
        inputBuffer = highResSwap
          ? this.spectrumHighResB!
          : this.spectrumHighResA!;
        outputBuffer = highResSwap
          ? this.spectrumHighResA!
          : this.spectrumHighResB!;
        sigmaBuffer = this.spectrumHighResSigma || this.maxPerPixelBuffer!;
        scatterSrcBuffer =
          this.spectrumHighResScatter || this.maxPerPixelBuffer!;
        emissionAuraBuffer =
          this.spectrumHighResEmissionAura || this.maxPerPixelBuffer!;
        console.log(
          "[DEBUG-SPECTRUM] Creating bind group with HIGH-RES buffers:",
          {
            swapped: highResSwap,
            inputLabel: inputBuffer.label,
            outputLabel: outputBuffer.label,
            inputSize: inputBuffer.size,
            outputSize: outputBuffer.size,
          }
        );
      } else {
        // Normal rendering mode: use regular spectral buffers
        const spectralInputBuffer = this.spectralBufferSwapped
          ? this.spectralBufferB
          : this.spectralBufferA;
        const spectralOutputBuffer = this.spectralBufferSwapped
          ? this.spectralBufferA
          : this.spectralBufferB;
        inputBuffer = spectralInputBuffer || this.maxPerPixelBuffer!;
        outputBuffer = spectralOutputBuffer || this.maxPerPixelBuffer!;
        sigmaBuffer = this.scatteringSigmaBuffer || this.maxPerPixelBuffer!;
        scatterSrcBuffer = this.scatterSourceBuffer || this.maxPerPixelBuffer!;
        emissionAuraBuffer = this.emissionAuraBuffer || this.maxPerPixelBuffer!;
      }

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
          // NOTE: High-res spectrum swaps actual buffer references via useHighResBuffers flag
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

      if (
        !this.textureSampler ||
        !this.materialPaletteTexture ||
        !this.bindGroupLayout1
      ) {
        console.warn("[SpectralCompute] Cannot create bindGroup1 - missing:", {
          textureSampler: !!this.textureSampler,
          materialPaletteTexture: !!this.materialPaletteTexture,
          bindGroupLayout1: !!this.bindGroupLayout1,
        });
        return false;
      }

      this.bindGroup1 = this.device.createBindGroup({
        label: "Bind Group 1 (Material Palette)",
        layout: this.bindGroupLayout1,
        entries: [
          { binding: 0, resource: this.materialPaletteTexture.createView() },
          { binding: 1, resource: this.textureSampler },
        ],
      });
    }

    // Bind group 2: CIE textures
    if (!this.bindGroup2) {
      if (
        !this.cieTextures ||
        !this.cieScalesBuffer ||
        !this.textureSampler ||
        !this.bindGroupLayout2
      ) {
        console.error(
          "[SpectralCompute] Cannot create bindGroup2 - missing CIE resources or layout"
        );
        return false;
      }
      this.bindGroup2 = this.device.createBindGroup({
        label: "Bind Group 2 (CIE)",
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
          format: "rgba8unorm",
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        this.device.queue.writeTexture(
          { texture },
          new Uint8Array([0, 0, 0, 255]), // Inside
          { bytesPerRow: 4, rowsPerImage: 1 },
          { width: 1, height: 1, depthOrArrayLayers: 1 }
        );
        this.msdfTextures.push(texture);
      }

      if (!this.msdfSampler || !this.bindGroupLayout3) {
        console.error(
          "[SpectralCompute] Cannot create bindGroup3 - missing MSDF sampler or layout"
        );
        return false;
      }

      this.bindGroup3 = this.device.createBindGroup({
        label: "Bind Group 3 (MSDF)",
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

    // All bind groups are ready
    return true;
  }

  /**
   * Get the number of materials in the current palette
   */
  getNumMaterials(): number {
    return this.numMaterials;
  }

  // ============================================================================
  // GPU Profiling Methods
  // ============================================================================

  /**
   * Enable GPU profiling for performance analysis
   * @param enabled Whether to enable profiling
   * @param includeRawSessions Whether to include raw session data in reports
   */
  setProfilingEnabled(
    enabled: boolean,
    includeRawSessions: boolean = false
  ): void {
    this.profilingEnabled = enabled;
    this.profiler.setEnabled(enabled);
    this.profiler.setIncludeRawSessions(includeRawSessions);

    if (enabled) {
      console.log("[SpectralCompute] GPU profiling enabled");
    } else {
      console.log("[SpectralCompute] GPU profiling disabled");
    }
  }

  /**
   * Check if profiling is enabled
   */
  isProfilingEnabled(): boolean {
    return this.profilingEnabled;
  }

  /**
   * Get the number of profiling sessions recorded
   */
  getProfilingSessionCount(): number {
    return this.profiler.getSessionCount();
  }

  /**
   * Generate a comprehensive profiling report
   * @returns ProfilingReport with all collected metrics and analysis
   * @throws Error if no sessions have been recorded
   */
  generateProfilingReport(): ProfilingReport {
    if (!this.lastProfilingParams) {
      throw new Error(
        "No profiling data available. Enable profiling and run at least one compute pass."
      );
    }

    return this.profiler.generateReport(
      [this.lastProfilingParams.width, this.lastProfilingParams.height],
      this.lastProfilingParams.spectralSamples,
      this.lastProfilingParams.plotResolution
    );
  }

  /**
   * Clear all profiling sessions
   */
  clearProfilingSessions(): void {
    this.profiler.clearSessions();
  }

  /**
   * Export profiling report as JSON string
   * @returns JSON string of the profiling report
   */
  exportProfilingReportJSON(): string {
    const report = this.generateProfilingReport();
    return JSON.stringify(report, null, 2);
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

    // Destroy high-res spectrum buffers
    this.destroyHighResBuffers();

    this.materialPaletteTexture?.destroy();

    for (const tex of this.msdfTextures) {
      tex.destroy();
    }

    this.cieTextures?.x.destroy();
    this.cieTextures?.y.destroy();
    this.cieTextures?.z.destroy();

    // Destroy profiler resources
    this.profiler.destroy();
  }
}
