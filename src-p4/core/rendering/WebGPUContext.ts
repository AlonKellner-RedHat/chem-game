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
  
  // Check for float32-filterable support (needed for r32float texture sampling)
  const requiredFeatures: GPUFeatureName[] = [];
  if (adapter.features.has('float32-filterable')) {
    requiredFeatures.push('float32-filterable');
    console.log('[WebGPU] float32-filterable feature available');
  } else {
    console.warn('[WebGPU] float32-filterable not available - spectral textures may not work correctly');
  }
  
  // Request device
  const device = await adapter.requestDevice({
    requiredFeatures,
    requiredLimits: {},
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

