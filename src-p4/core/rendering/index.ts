/**
 * Rendering Module
 * 
 * WebGPU-based spectral rendering.
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
  loadMaskFile,
  parseMaskFile,
  createMaskTexture,
  type MaskData,
  type LoadedMask,
} from './MaskLoader';
