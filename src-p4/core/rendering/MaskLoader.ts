/**
 * Mask Loader
 * 
 * Loads binary mask files and creates GPU textures for shape rendering.
 * 
 * File Format:
 * - Header (16 bytes): width (u32), height (u32), reserved (8 bytes)
 * - Data: width × height float32 values (0.0 to 1.0)
 */

export interface MaskData {
  width: number;
  height: number;
  data: Float32Array;
}

export interface LoadedMask {
  name: string;
  data: MaskData;
  texture: GPUTexture;
}

/**
 * Parse binary mask file data
 */
export function parseMaskFile(buffer: ArrayBuffer): MaskData {
  const headerView = new DataView(buffer, 0, 16);
  const width = headerView.getUint32(0, true);  // little-endian
  const height = headerView.getUint32(4, true);
  
  // Data starts after 16-byte header
  const dataBuffer = buffer.slice(16);
  const data = new Float32Array(dataBuffer);
  
  if (data.length !== width * height) {
    throw new Error(
      `Mask data size mismatch: expected ${width * height}, got ${data.length}`
    );
  }
  
  return { width, height, data };
}

/**
 * Load mask file from URL
 */
export async function loadMaskFile(url: string): Promise<MaskData> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load mask: ${url} (${response.status})`);
  }
  
  const buffer = await response.arrayBuffer();
  return parseMaskFile(buffer);
}

/**
 * Create GPU texture from mask data
 */
export function createMaskTexture(
  device: GPUDevice,
  maskData: MaskData,
  label: string
): GPUTexture {
  const { width, height, data } = maskData;
  
  // Create texture with r32float format (single channel float)
  const texture = device.createTexture({
    label: `Mask: ${label}`,
    size: { width, height, depthOrArrayLayers: 1 },
    format: 'r32float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  
  // Write data to texture
  device.queue.writeTexture(
    { texture },
    data as unknown as BufferSource,
    { bytesPerRow: width * 4, rowsPerImage: height },
    { width, height, depthOrArrayLayers: 1 }
  );
  
  return texture;
}

/**
 * Mask Manager - handles loading and caching masks
 */
export class MaskManager {
  private device: GPUDevice;
  private masks: Map<string, LoadedMask> = new Map();
  private basePath: string;
  
  constructor(device: GPUDevice, basePath: string = '/masks') {
    this.device = device;
    this.basePath = basePath;
  }
  
  /**
   * Load a mask file and create GPU texture
   */
  async loadMask(name: string): Promise<LoadedMask> {
    // Check cache
    const cached = this.masks.get(name);
    if (cached) {
      return cached;
    }
    
    // Load from file
    const url = `${this.basePath}/${name}.mask`;
    console.log(`[MaskManager] Loading mask: ${url}`);
    
    const data = await loadMaskFile(url);
    const texture = createMaskTexture(this.device, data, name);
    
    const loaded: LoadedMask = { name, data, texture };
    this.masks.set(name, loaded);
    
    console.log(`[MaskManager] Loaded mask: ${name} (${data.width}x${data.height})`);
    return loaded;
  }
  
  /**
   * Load multiple masks
   */
  async loadMasks(names: string[]): Promise<LoadedMask[]> {
    return Promise.all(names.map(name => this.loadMask(name)));
  }
  
  /**
   * Get a loaded mask by name
   */
  getMask(name: string): LoadedMask | undefined {
    return this.masks.get(name);
  }
  
  /**
   * Get all loaded masks as an array (for creating texture array)
   */
  getAllMasks(): LoadedMask[] {
    return Array.from(this.masks.values());
  }
  
  /**
   * Get mask index by name
   */
  getMaskIndex(name: string): number {
    const masks = this.getAllMasks();
    return masks.findIndex(m => m.name === name);
  }
  
  /**
   * Destroy all textures
   */
  destroy(): void {
    for (const mask of this.masks.values()) {
      mask.texture.destroy();
    }
    this.masks.clear();
  }
}

