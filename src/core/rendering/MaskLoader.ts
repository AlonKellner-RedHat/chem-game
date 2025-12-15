/**
 * MSDF Loader
 * 
 * Loads Multi-Channel Signed Distance Field (MSDF) textures for shape rendering.
 * 
 * MSDF textures are PNG files with RGB channels encoding signed distances:
 * - R, G, B: Distance channels for corner-aware rendering
 * - 0.5 (128) = edge, <0.5 = inside, >0.5 = outside
 * 
 * The median of R, G, B gives the true signed distance.
 * 
 * Textures are organized into two arrays by resolution:
 * - Small array (256x256): Basic shapes like circle, rectangle, triangle
 * - Large array (1280x720): Screen-sized patterns like grids
 */

export interface MSDFMetadata {
  pxRange: number;
  shapes: {
    name: string;
    width: number;
    height: number;
  }[];
}

export interface LoadedMSDF {
  name: string;
  width: number;
  height: number;
  texture: GPUTexture;
  pxRange: number;
}

/**
 * Mask index result containing array and layer indices
 */
export interface MaskIndex {
  arrayIndex: number;  // 0 = small (256x256), 1 = large (1280x720)
  layerIndex: number;  // Layer within the array
}

// Resolution thresholds for categorizing masks
const SMALL_MAX_WIDTH = 512;
const SMALL_MAX_HEIGHT = 512;

/**
 * Load PNG image as ImageBitmap
 */
async function loadImageBitmap(url: string): Promise<ImageBitmap> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load MSDF image: ${url} (${response.status})`);
  }
  
  const blob = await response.blob();
  return createImageBitmap(blob);
}

/**
 * Create GPU texture from ImageBitmap
 */
function createMSDFTexture(
  device: GPUDevice,
  imageBitmap: ImageBitmap,
  label: string
): GPUTexture {
  const { width, height } = imageBitmap;
  
  // Create texture with rgba8unorm format (standard for images)
  // Include COPY_SRC for copying into texture arrays
  const texture = device.createTexture({
    label: `MSDF: ${label}`,
    size: { width, height, depthOrArrayLayers: 1 },
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | 
           GPUTextureUsage.COPY_DST | 
           GPUTextureUsage.COPY_SRC |
           GPUTextureUsage.RENDER_ATTACHMENT,
  });
  
  // Copy image data to texture
  device.queue.copyExternalImageToTexture(
    { source: imageBitmap },
    { texture },
    { width, height }
  );
  
  return texture;
}

/**
 * MSDF Manager - handles loading and caching MSDF textures
 * 
 * Organizes textures into two arrays by resolution for efficient GPU binding:
 * - Array 0 (small): 256x256 textures for basic shapes
 * - Array 1 (large): 1280x720 textures for screen-sized patterns
 */
export class MaskManager {
  private device: GPUDevice;
  private msdfs: Map<string, LoadedMSDF> = new Map();
  private loadingPromises: Map<string, Promise<LoadedMSDF>> = new Map();
  private basePath: string;
  private metadata: MSDFMetadata | null = null;
  private metadataPromise: Promise<MSDFMetadata> | null = null;
  
  // Track masks by resolution category for texture arrays
  private smallMasks: string[] = [];  // Array index 0
  private largeMasks: string[] = [];  // Array index 1
  
  // Resolution for each array
  private smallResolution = { width: 256, height: 256 };
  private largeResolution = { width: 1280, height: 720 };

  constructor(device: GPUDevice, basePath: string = '/msdf') {
    this.device = device;
    this.basePath = basePath;
  }

  /**
   * Load metadata file to get pxRange and shape info
   */
  private async loadMetadata(): Promise<MSDFMetadata> {
    if (this.metadata) {
      return this.metadata;
    }
    
    // If already loading, return existing promise
    if (this.metadataPromise) {
      return this.metadataPromise;
    }
    
    this.metadataPromise = (async () => {
      const url = `${this.basePath}/metadata.json`;
      const response = await fetch(url);
      if (!response.ok) {
        // Default metadata if file doesn't exist
        console.warn(`[MaskManager] Metadata not found at ${url}, using defaults`);
        this.metadata = { pxRange: 4.0, shapes: [] };
        return this.metadata;
      }
      
      this.metadata = await response.json();
      console.log(`[MaskManager] Loaded metadata: pxRange=${this.metadata!.pxRange}`);
      return this.metadata!;
    })();
    
    return this.metadataPromise;
  }

  /**
   * Determine if a mask is "small" (256x256) or "large" (1280x720)
   */
  private isSmallMask(width: number, height: number): boolean {
    return width <= SMALL_MAX_WIDTH && height <= SMALL_MAX_HEIGHT;
  }

  /**
   * Load an MSDF texture file
   */
  async loadMask(name: string): Promise<LoadedMSDF> {
    // Check cache
    const cached = this.msdfs.get(name);
    if (cached) {
      return cached;
    }
    
    // Check if already loading
    const loadingPromise = this.loadingPromises.get(name);
    if (loadingPromise) {
      return loadingPromise;
    }

    // Start loading
    const promise = this.doLoadMask(name);
    this.loadingPromises.set(name, promise);
    
    try {
      const result = await promise;
      return result;
    } finally {
      this.loadingPromises.delete(name);
    }
  }
  
  private async doLoadMask(name: string): Promise<LoadedMSDF> {
    // Ensure metadata is loaded
    const metadata = await this.loadMetadata();

    // Load PNG file
    const url = `${this.basePath}/${name}.png`;
    console.log(`[MaskManager] Loading MSDF: ${url}`);

    const imageBitmap = await loadImageBitmap(url);
    const texture = createMSDFTexture(this.device, imageBitmap, name);

    const loaded: LoadedMSDF = {
      name,
      width: imageBitmap.width,
      height: imageBitmap.height,
      texture,
      pxRange: metadata.pxRange,
    };
    
    this.msdfs.set(name, loaded);

    // Categorize by resolution
    if (this.isSmallMask(loaded.width, loaded.height)) {
      if (!this.smallMasks.includes(name)) {
        this.smallMasks.push(name);
      }
    } else {
      if (!this.largeMasks.includes(name)) {
        this.largeMasks.push(name);
      }
    }

    console.log(
      `[MaskManager] Loaded MSDF: ${name} (${loaded.width}x${loaded.height}, ` +
      `category=${this.isSmallMask(loaded.width, loaded.height) ? 'small' : 'large'}, ` +
      `pxRange=${loaded.pxRange})`
    );
    return loaded;
  }

  /**
   * Load multiple MSDF textures.
   * Masks are automatically categorized by resolution.
   * IMPORTANT: Order is deterministic based on request order, not completion order.
   */
  async loadMasks(names: string[]): Promise<LoadedMSDF[]> {
    // Load all masks in parallel for speed
    const results = await Promise.all(names.map(name => this.loadMask(name)));
    
    // Rebuild category arrays in deterministic order based on request order
    // This ensures layer indices are predictable regardless of network timing
    this.smallMasks = [];
    this.largeMasks = [];
    
    for (const name of names) {
      const mask = this.msdfs.get(name);
      if (mask) {
        if (this.isSmallMask(mask.width, mask.height)) {
          if (!this.smallMasks.includes(name)) {
            this.smallMasks.push(name);
          }
        } else {
          if (!this.largeMasks.includes(name)) {
            this.largeMasks.push(name);
          }
        }
      }
    }
    
    console.log('[MaskManager] Small masks (ordered):', this.smallMasks);
    console.log('[MaskManager] Large masks (ordered):', this.largeMasks);
    
    return results;
  }

  /**
   * Get a loaded MSDF by name
   */
  getMask(name: string): LoadedMSDF | undefined {
    return this.msdfs.get(name);
  }

  /**
   * Get all loaded MSDFs as an array.
   */
  getAllMasks(): LoadedMSDF[] {
    return Array.from(this.msdfs.values());
  }

  /**
   * Get small masks (256x256) in order for texture array building
   */
  getSmallMasks(): LoadedMSDF[] {
    return this.smallMasks
      .map(name => this.msdfs.get(name))
      .filter((m): m is LoadedMSDF => m !== undefined);
  }

  /**
   * Get large masks (1280x720) in order for texture array building
   */
  getLargeMasks(): LoadedMSDF[] {
    return this.largeMasks
      .map(name => this.msdfs.get(name))
      .filter((m): m is LoadedMSDF => m !== undefined);
  }

  /**
   * Get the expected resolution for small masks
   */
  getSmallResolution(): { width: number; height: number } {
    return this.smallResolution;
  }

  /**
   * Get the expected resolution for large masks
   */
  getLargeResolution(): { width: number; height: number } {
    return this.largeResolution;
  }

  /**
   * Get MSDF index by name.
   * Returns { arrayIndex, layerIndex } for texture array lookup.
   */
  getMaskIndex(name: string): MaskIndex {
    // Check small masks first
    const smallIndex = this.smallMasks.indexOf(name);
    if (smallIndex >= 0) {
      return { arrayIndex: 0, layerIndex: smallIndex };
    }
    
    // Check large masks
    const largeIndex = this.largeMasks.indexOf(name);
    if (largeIndex >= 0) {
      return { arrayIndex: 1, layerIndex: largeIndex };
    }
    
    console.warn(`[MaskManager] MSDF not found: ${name}, using default (small[0])`);
    return { arrayIndex: 0, layerIndex: 0 };
  }

  /**
   * Get the pxRange used for MSDF generation
   */
  getPxRange(): number {
    return this.metadata?.pxRange ?? 4.0;
  }

  /**
   * Get count of small masks
   */
  getSmallMaskCount(): number {
    return this.smallMasks.length;
  }

  /**
   * Get count of large masks
   */
  getLargeMaskCount(): number {
    return this.largeMasks.length;
  }

  /**
   * Destroy all textures
   */
  destroy(): void {
    for (const msdf of this.msdfs.values()) {
      msdf.texture.destroy();
    }
    this.msdfs.clear();
    this.smallMasks = [];
    this.largeMasks = [];
    this.metadata = null;
  }
}

// Re-export types with old names for compatibility
export type MaskData = {
  width: number;
  height: number;
  data: Float32Array;
};

export type LoadedMask = LoadedMSDF;
