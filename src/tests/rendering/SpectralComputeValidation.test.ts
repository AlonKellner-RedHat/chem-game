/**
 * E2E Validation Tests for SpectralComputePipeline
 *
 * These tests actually execute compute passes and check for
 * WebGPU validation errors (buffer aliasing, bind group issues, etc.)
 * that shader compilation tests cannot catch.
 *
 * The pushErrorScope/popErrorScope pattern captures validation errors
 * that would otherwise only appear in the browser console.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ComputeParams,
  type GPUShape,
  SpectralComputePipeline,
} from '../../core/rendering/SpectralCompute';

// Helper to get WebGPU and set up global constants
// The webgpu package (Dawn) provides these via globals export
async function getGPUAndSetupGlobals(): Promise<GPU | null> {
  // Try browser first - globals are already available
  if (typeof navigator !== 'undefined' && navigator.gpu) {
    return navigator.gpu;
  }

  // Try Node.js webgpu package (uses Dawn)
  try {
    const webgpu = await import('webgpu');

    // Polyfill WebGPU global constants that SpectralCompute uses
    // These are available in browsers but not in Node.js by default
    const globals = webgpu.globals as Record<string, unknown>;
    if (globals.GPUBufferUsage && typeof globalThis.GPUBufferUsage === 'undefined') {
      (globalThis as Record<string, unknown>).GPUBufferUsage = globals.GPUBufferUsage;
    }
    if (globals.GPUShaderStage && typeof globalThis.GPUShaderStage === 'undefined') {
      (globalThis as Record<string, unknown>).GPUShaderStage = globals.GPUShaderStage;
    }
    if (globals.GPUTextureUsage && typeof globalThis.GPUTextureUsage === 'undefined') {
      (globalThis as Record<string, unknown>).GPUTextureUsage = globals.GPUTextureUsage;
    }
    if (globals.GPUMapMode && typeof globalThis.GPUMapMode === 'undefined') {
      (globalThis as Record<string, unknown>).GPUMapMode = globals.GPUMapMode;
    }

    const instance = webgpu.create([]);
    return instance as unknown as GPU;
  } catch (error) {
    console.warn('[SpectralCompute Validation] Failed to load webgpu package:', error);
    return null;
  }
}

describe('SpectralCompute Validation', () => {
  let gpu: GPU | null = null;
  let adapter: GPUAdapter | null = null;
  let device: GPUDevice | null = null;

  beforeAll(async () => {
    gpu = await getGPUAndSetupGlobals();
    if (!gpu) {
      console.warn('[SpectralCompute Validation] WebGPU not available, tests will be skipped');
      return;
    }

    adapter = await gpu.requestAdapter();
    if (!adapter) {
      console.warn('[SpectralCompute Validation] No GPU adapter available');
      return;
    }

    // Request device with shader-f16 feature (required by SpectralComputePipeline)
    // Also request higher storage buffer limits (pipeline uses 10 buffers)
    const requiredFeatures: GPUFeatureName[] = [];
    if (adapter.features.has('shader-f16')) {
      requiredFeatures.push('shader-f16');
    }

    // SpectralCompute uses 10 storage buffers in bind group 0
    // Default limit is 8, so we need to request the adapter's max
    const adapterLimits = adapter.limits;
    const maxStorageBuffers = Math.min(
      adapterLimits.maxStorageBuffersPerShaderStage,
      10 // We need at least 10
    );

    device = await adapter.requestDevice({
      requiredFeatures,
      requiredLimits: {
        maxStorageBuffersPerShaderStage: maxStorageBuffers,
      },
    });
  });

  afterAll(() => {
    device?.destroy();
  });

  it('should not have buffer aliasing in bind groups', async () => {
    if (!device) {
      console.warn('[SpectralCompute Validation] Skipping: WebGPU device not available');
      return;
    }

    // Push error scope to capture validation errors during pipeline setup and execution
    device.pushErrorScope('validation');

    let pipeline: SpectralComputePipeline | null = null;
    let computeError: Error | null = null;

    try {
      // Initialize pipeline
      pipeline = new SpectralComputePipeline(device);
      await pipeline.initialize();

      // Small dimensions for fast testing
      const width = 128;
      const height = 128;

      // Create minimal shape to trigger compute passes
      const shapes: GPUShape[] = [
        {
          x: 0,
          y: 0,
          width: width,
          height: height,
          temperature: 300,
          layer: 0,
          materialIndex: 0,
          msdfArrayIndex: 0,
          msdfLayerIndex: -1, // No MSDF
          texWidth: 256,
          texHeight: 256,
          alphaArrayIndex: 0,
          alphaLayerIndex: -1, // No alpha
          hasMsdf: false,
          hasAlpha: false,
          smallParticleDensity: 0,
          largeParticleDensity: 0,
          fluorescenceQuantumYield: 0,
        },
      ];

      // Create compute params
      const params: ComputeParams = {
        width,
        height,
        wavelengthMin: 380,
        wavelengthMax: 700,
        spectralResolution: 16,
        backgroundMode: 'normal',
        enableEmission: false,
        msdfPxRange: 4.0,
        numMaterials: 1,
        skipBlur: true, // Skip blur for faster test
      };

      // This triggers bind group creation and dispatch
      // If there's buffer aliasing, WebGPU will report a validation error
      await pipeline.compute(params, shapes);
    } catch (error) {
      computeError = error as Error;
    } finally {
      // Clean up pipeline
      pipeline?.destroy();
    }

    // Pop error scope and check for validation errors
    const validationError = await device.popErrorScope();

    // Report any errors for debugging
    if (validationError) {
      console.error(
        '[SpectralCompute Validation] WebGPU validation error:',
        validationError.message
      );
    }
    if (computeError) {
      console.error('[SpectralCompute Validation] Compute error:', computeError.message);
    }

    // Assert no validation errors (buffer aliasing would cause one)
    expect(validationError).toBeNull();
    expect(computeError).toBeNull();
  });

  it('should handle multiple compute calls without validation errors', async () => {
    if (!device) {
      console.warn('[SpectralCompute Validation] Skipping: WebGPU device not available');
      return;
    }

    device.pushErrorScope('validation');

    let pipeline: SpectralComputePipeline | null = null;

    try {
      pipeline = new SpectralComputePipeline(device);
      await pipeline.initialize();

      const width = 64;
      const height = 64;

      const shapes: GPUShape[] = [
        {
          x: 0,
          y: 0,
          width: width,
          height: height,
          temperature: 300,
          layer: 0,
          materialIndex: 0,
          msdfArrayIndex: 0,
          msdfLayerIndex: -1,
          texWidth: 256,
          texHeight: 256,
          alphaArrayIndex: 0,
          alphaLayerIndex: -1,
          hasMsdf: false,
          hasAlpha: false,
          smallParticleDensity: 0,
          largeParticleDensity: 0,
          fluorescenceQuantumYield: 0,
        },
      ];

      const params: ComputeParams = {
        width,
        height,
        wavelengthMin: 380,
        wavelengthMax: 700,
        spectralResolution: 16,
        backgroundMode: 'normal',
        enableEmission: false,
        skipBlur: true,
      };

      // Multiple compute calls to test bind group reuse
      await pipeline.compute(params, shapes);
      await pipeline.compute(params, shapes);
      await pipeline.compute(params, shapes);
    } finally {
      pipeline?.destroy();
    }

    const validationError = await device.popErrorScope();

    if (validationError) {
      console.error(
        '[SpectralCompute Validation] Validation error on multiple calls:',
        validationError.message
      );
    }

    expect(validationError).toBeNull();
  });

  it('should handle scattering without buffer aliasing', async () => {
    if (!device) {
      console.warn('[SpectralCompute Validation] Skipping: WebGPU device not available');
      return;
    }

    device.pushErrorScope('validation');

    let pipeline: SpectralComputePipeline | null = null;

    try {
      pipeline = new SpectralComputePipeline(device);
      await pipeline.initialize();

      const width = 64;
      const height = 64;

      // Shape with scattering enabled - this exercises the scatterSourceBuffer path
      const shapes: GPUShape[] = [
        {
          x: 0,
          y: 0,
          width: width,
          height: height,
          temperature: 300,
          layer: 0,
          materialIndex: 0,
          msdfArrayIndex: 0,
          msdfLayerIndex: -1,
          texWidth: 256,
          texHeight: 256,
          alphaArrayIndex: 0,
          alphaLayerIndex: -1,
          hasMsdf: false,
          hasAlpha: false,
          smallParticleDensity: 1e8, // Enable Rayleigh scattering
          largeParticleDensity: 1e6, // Enable Mie scattering
          fluorescenceQuantumYield: 0,
        },
      ];

      const params: ComputeParams = {
        width,
        height,
        wavelengthMin: 380,
        wavelengthMax: 700,
        spectralResolution: 16,
        backgroundMode: 'normal',
        enableEmission: false,
        atmosphericScatterSigma: 5.0, // Enable scattering blur
        skipBlur: false, // Run blur passes
      };

      await pipeline.compute(params, shapes);
    } finally {
      pipeline?.destroy();
    }

    const validationError = await device.popErrorScope();

    if (validationError) {
      console.error(
        '[SpectralCompute Validation] Validation error with scattering:',
        validationError.message
      );
    }

    expect(validationError).toBeNull();
  });
});
