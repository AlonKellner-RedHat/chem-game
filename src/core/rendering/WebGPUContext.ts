/**
 * WebGPU Context Manager
 * 
 * Handles WebGPU device/adapter initialization and resource management.
 */

export interface WebGPUContext {
  adapter: GPUAdapter;
  device: GPUDevice;
  format: GPUTextureFormat;
}

/**
 * Check if shader-f16 feature is supported
 */
export function hasF16Support(context: WebGPUContext): boolean {
  return context.device.features.has('shader-f16');
}

/**
 * Initialize WebGPU and return context
 */
export async function initWebGPU(): Promise<WebGPUContext | null> {
  // Check WebGPU support
  if (!navigator.gpu) {
    console.warn('[WebGPU] Not supported in this browser');
    return null;
  }
  
  // Request adapter
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance',
  });
  
  if (!adapter) {
    console.warn('[WebGPU] No adapter available');
    return null;
  }
  
  // Log adapter info (optional, may not be available in all browsers)
  console.log('[WebGPU] Adapter available');
  
  // Check for required/optional features
  const requiredFeatures: GPUFeatureName[] = [];
  
  // Check for float32-filterable support (needed for r32float texture sampling)
  if (adapter.features.has('float32-filterable')) {
    requiredFeatures.push('float32-filterable');
    console.log('[WebGPU] float32-filterable feature available');
  } else {
    console.warn('[WebGPU] float32-filterable not available - spectral textures may not work correctly');
  }
  
  // Check for shader-f16 support (for half-precision floats)
  if (adapter.features.has('shader-f16')) {
    requiredFeatures.push('shader-f16');
    console.log('[WebGPU] shader-f16 feature available - using half precision for spectrum');
  } else {
    console.warn('[WebGPU] shader-f16 not available - using full precision');
  }
  
  // Check for timestamp-query support (for GPU profiling)
  if (adapter.features.has('timestamp-query')) {
    requiredFeatures.push('timestamp-query');
    console.log('[WebGPU] timestamp-query feature available - GPU profiling enabled');
  } else {
    console.warn('[WebGPU] timestamp-query not available - GPU profiling disabled');
  }
  
  // Check adapter limits for storage buffers
  const adapterLimits = adapter.limits;
  // We need 10 storage buffers for the spectral pipeline (bindings 1-10)
  // Binding 0 is a uniform buffer (params), not counted as storage
  // High-res spectrum reuses the same bindings with different buffer references
  const requiredStorageBuffers = 10;
  
  if (adapterLimits.maxStorageBuffersPerShaderStage < requiredStorageBuffers) {
    console.warn(`[WebGPU] Adapter only supports ${adapterLimits.maxStorageBuffersPerShaderStage} storage buffers, but we need ${requiredStorageBuffers}`);
  } else {
    console.log(`[WebGPU] Adapter supports ${adapterLimits.maxStorageBuffersPerShaderStage} storage buffers per stage (need ${requiredStorageBuffers})`);
  }
  
  // Request device with higher storage buffer limit
  const device = await adapter.requestDevice({
    requiredFeatures,
    requiredLimits: {
      maxStorageBuffersPerShaderStage: Math.min(requiredStorageBuffers, adapterLimits.maxStorageBuffersPerShaderStage),
    },
  });
  
  // Handle device loss
  device.lost.then((info) => {
    console.error('[WebGPU] Device lost:', info.message);
    if (info.reason !== 'destroyed') {
      // Attempt recovery
      console.log('[WebGPU] Attempting device recovery...');
    }
  });
  
  // Get preferred canvas format
  const format = navigator.gpu.getPreferredCanvasFormat();
  
  console.log('[WebGPU] Initialized with format:', format);
  console.log('[WebGPU] Features enabled:', Array.from(device.features));
  
  return { adapter, device, format };
}

/**
 * Create a storage buffer
 */
export function createStorageBuffer(
  device: GPUDevice,
  data: Float32Array | Uint32Array,
  usage: GPUBufferUsageFlags = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
): GPUBuffer {
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage,
    mappedAtCreation: true,
  });
  
  if (data instanceof Float32Array) {
    new Float32Array(buffer.getMappedRange()).set(data);
  } else {
    new Uint32Array(buffer.getMappedRange()).set(data);
  }
  
  buffer.unmap();
  return buffer;
}

/**
 * Create a uniform buffer
 */
export function createUniformBuffer(
  device: GPUDevice,
  size: number
): GPUBuffer {
  return device.createBuffer({
    size,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
}

/**
 * Create a read-back buffer for GPU -> CPU transfer
 */
export function createReadbackBuffer(
  device: GPUDevice,
  size: number
): GPUBuffer {
  return device.createBuffer({
    size,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });
}

/**
 * Copy buffer and read data back to CPU
 */
export async function readBufferData(
  device: GPUDevice,
  sourceBuffer: GPUBuffer,
  size: number
): Promise<Float32Array> {
  const readbackBuffer = createReadbackBuffer(device, size);
  
  const commandEncoder = device.createCommandEncoder();
  commandEncoder.copyBufferToBuffer(sourceBuffer, 0, readbackBuffer, 0, size);
  device.queue.submit([commandEncoder.finish()]);
  
  await readbackBuffer.mapAsync(GPUMapMode.READ);
  const data = new Float32Array(readbackBuffer.getMappedRange().slice(0));
  readbackBuffer.unmap();
  readbackBuffer.destroy();
  
  return data;
}

/**
 * Create a 1D texture from Float32Array
 */
export function create1DTexture(
  device: GPUDevice,
  data: Float32Array,
  label?: string
): GPUTexture {
  const texture = device.createTexture({
    label,
    size: [data.length, 1, 1],
    format: 'r32float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  
  device.queue.writeTexture(
    { texture },
    data.buffer,
    { bytesPerRow: data.length * 4 },
    [data.length, 1, 1]
  );
  
  return texture;
}

/**
 * Create a 2D render texture
 */
export function createRenderTexture(
  device: GPUDevice,
  width: number,
  height: number,
  format: GPUTextureFormat = 'rgba8unorm'
): GPUTexture {
  return device.createTexture({
    size: [width, height],
    format,
    usage:
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC,
  });
}

