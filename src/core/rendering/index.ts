/**
 * Rendering Module
 *
 * WebGPU-based spectral rendering with MSDF shape support.
 */

export {
  type BottleneckAnalysis,
  type BottleneckType,
  type BufferProfile,
  type DispatchProfile,
  GPUProfiler,
  type LayerProfile,
  type MemoryProfile,
  type PassProfile,
  type ProfilingReport,
  type ProfilingSession,
  type Recommendation,
} from './GPUProfiler';
export {
  type LoadedMask,
  type LoadedMSDF,
  type MaskData,
  type MaskIndex,
  MaskManager,
  type MSDFMetadata,
} from './MaskLoader';
export {
  OptimizationConfig,
  type OptimizationFlags,
  OptimizationPreset,
} from './OptimizationConfig';

export {
  CPURenderer,
  createRenderer,
  type Renderer,
  WebGPURenderer,
} from './PhaserBridge';
export {
  type ComputeParams,
  type ComputeResult,
  type GPUShape,
  SpectralComputePipeline,
  type TransmissionSpectrum,
} from './SpectralCompute';
export {
  create1DTexture,
  createReadbackBuffer,
  createRenderTexture,
  createStorageBuffer,
  createUniformBuffer,
  initWebGPU,
  readBufferData,
  type WebGPUContext,
} from './WebGPUContext';
