/**
 * GPU Test Helpers (wesl-test integration)
 *
 * This module provides utilities for GPU-accelerated shader testing.
 * Only import this file in tests that require WebGPU support.
 *
 * Note: This module will fail to load if WebGPU is not available.
 * Tests should check for WebGPU availability before importing.
 */

import { getGPUDevice, testCompute } from 'wesl-test';

// Re-export wesl-test functions for convenience
export { testCompute, getGPUDevice };

/**
 * GPU device singleton for tests
 * Initialize once per test file using beforeAll()
 */
let gpuDevice: GPUDevice | null = null;

/**
 * Initialize the GPU device for testing.
 * Call this in beforeAll() of your test file.
 *
 * @returns The GPU device, or null if WebGPU is not available
 */
export async function initGPUDevice(): Promise<GPUDevice | null> {
  if (gpuDevice) {
    return gpuDevice;
  }

  try {
    gpuDevice = await getGPUDevice();
    return gpuDevice;
  } catch (error) {
    console.warn('[wesl-test] WebGPU not available:', error);
    return null;
  }
}

/**
 * Clean up the GPU device.
 * Call this in afterAll() of your test file.
 */
export function cleanupGPUDevice(): void {
  if (gpuDevice) {
    gpuDevice.destroy();
    gpuDevice = null;
  }
}

/**
 * Get the current GPU device (must be initialized first)
 */
export function getDevice(): GPUDevice | null {
  return gpuDevice;
}

/**
 * Skip test if WebGPU is not available
 */
export function skipIfNoGPU(device: GPUDevice | null): void {
  if (!device) {
    throw new Error('WebGPU not available - skipping GPU test');
  }
}

/**
 * Helper to run a compute shader test with common setup
 *
 * @param src - WGSL source code
 * @param size - Number of results to read back (default: 1)
 * @returns Array of f32 results from the test::results buffer
 */
export async function runComputeTest(src: string, size = 1): Promise<number[]> {
  const device = await initGPUDevice();
  if (!device) {
    throw new Error('WebGPU not available');
  }

  const result = await testCompute({ device, src, size });
  return Array.from(result);
}
