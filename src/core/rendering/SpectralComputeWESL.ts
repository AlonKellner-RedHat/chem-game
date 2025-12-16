/**
 * SpectralCompute WESL Loader
 *
 * Loads and links the modular WESL shader modules.
 * Provides the same interface as the original monolithic SpectralCompute.ts
 * but uses the new modular WESL architecture.
 *
 * Usage:
 *   import { createSpectralComputeModule } from './SpectralComputeWESL';
 *   const shaderModule = await createSpectralComputeModule(device);
 *
 * The WESL module can be imported with:
 *   - ?static: Build-time linking (faster startup, static conditions)
 *   - ?link: Runtime linking (dynamic conditions, hot reload)
 */

// Import the WESL configuration for static linking
// This will be processed by wesl-plugin at build time
// import wgsl from './SpectralCompute.wesl?static';

// For runtime linking, use:
// import linkConfig from './SpectralCompute.wesl?link';
// import { link } from 'wesl';

/**
 * Create a WebGPU shader module from the WESL sources.
 *
 * This function handles the WESL linking and creates a ready-to-use
 * shader module for the spectral compute pipeline.
 *
 * @param device - WebGPU device
 * @returns Promise<GPUShaderModule>
 */
export async function createSpectralComputeModule(device: GPUDevice): Promise<GPUShaderModule> {
  // Static linking: WESL is compiled at build time
  // This is the recommended approach for production

  // TODO: When WESL linker is integrated, uncomment:
  // import wgsl from './SpectralCompute.wesl?static';
  // return device.createShaderModule({ code: wgsl });

  // For now, fall back to the original monolithic WGSL
  // This allows gradual migration
  const { default: legacyWgsl } = await import('./SpectralCompute.wgsl?raw');
  return device.createShaderModule({
    code: legacyWgsl,
    label: 'SpectralCompute (legacy)',
  });
}

/**
 * Create a shader module with runtime linking and custom conditions.
 *
 * Use this for dynamic shader configurations (e.g., mobile GPU optimizations,
 * feature flags, debug modes).
 *
 * @param device - WebGPU device
 * @param conditions - Runtime condition flags
 * @returns Promise<GPUShaderModule>
 */
export async function createSpectralComputeModuleWithConditions(
  device: GPUDevice,
  conditions: Record<string, boolean> = {}
): Promise<GPUShaderModule> {
  // TODO: When WESL linker is integrated, implement runtime linking:
  // import linkConfig from './SpectralCompute.wesl?link';
  // import { link } from 'wesl';
  //
  // const wgsl = await link({
  //   ...linkConfig,
  //   conditions,
  // });
  // return device.createShaderModule({ code: wgsl });

  // For now, fall back to static linking
  return createSpectralComputeModule(device);
}

/**
 * Available entry points in the spectral compute pipeline.
 *
 * These correspond to the @compute entry points in the WESL modules:
 * - entry/main.wesl: main, integrateSpectrum
 * - entry/spectrum.wesl: computeSpectrumBox, averageSpectrum, finalCombine
 * - entry/blur_passes.wesl: blurHorizontal, blurVertical, etc.
 * - entry/combine.wesl: combineScattered, initBackgroundSpectrum, applyAmbientLight
 */
export const ENTRY_POINTS = {
  // Main rendering
  main: 'main',
  integrateSpectrum: 'integrateSpectrum',

  // High-res spectrum
  computeSpectrumBox: 'computeSpectrumBox',
  averageSpectrum: 'averageSpectrum',
  finalCombine: 'finalCombine',

  // Blur passes
  blurHorizontal: 'blurHorizontal',
  blurVertical: 'blurVertical',
  blurTransmittedH: 'blurTransmittedH',
  blurTransmittedV: 'blurTransmittedV',

  // Combination
  combineScattered: 'combineScattered',
  initBackgroundSpectrum: 'initBackgroundSpectrum',
  applyAmbientLight: 'applyAmbientLight',
} as const;

export type EntryPoint = (typeof ENTRY_POINTS)[keyof typeof ENTRY_POINTS];
