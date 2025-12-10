/**
 * Rendering Module
 * 
 * WebGPU-based spectral rendering with MSDF shape support.
 */

export {
  initWebGPU,
  createStorageBuffer,
  createUniformBuffer,
  createReadbackBuffer,
  readBufferData,
  create1DTexture,
  createRenderTexture,
  type WebGPUContext,
} from './WebGPUContext';

export {
  SpectralComputePipeline,
  type GPUShape,
  type ComputeParams,
  type ComputeResult,
  type TransmissionSpectrum,
} from './SpectralCompute';

export {
  MaskManager,
  type MSDFMetadata,
  type LoadedMSDF,
  type MaskData,
  type LoadedMask,
} from './MaskLoader';

export {
  createRenderer,
  WebGPURenderer,
  CPURenderer,
  type Renderer,
} from './PhaserBridge';

export {
  GPUProfiler,
  type ProfilingReport,
  type ProfilingSession,
  type PassProfile,
  type LayerProfile,
  type DispatchProfile,
  type BottleneckAnalysis,
  type Recommendation,
  type MemoryProfile,
  type BufferProfile,
  type BottleneckType,
} from './GPUProfiler';

export {
  OptimizationConfig,
  type OptimizationFlags,
  OptimizationPreset,
} from './OptimizationConfig';
