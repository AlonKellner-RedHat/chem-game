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
  const texture = device.createTexture({
    label: `MSDF: ${label}`,
    size: { width, height, depthOrArrayLayers: 1 },
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | 
           GPUTextureUsage.COPY_DST | 
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
 */
export class MaskManager {
  private device: GPUDevice;
  private msdfs: Map<string, LoadedMSDF> = new Map();
  private loadingPromises: Map<string, Promise<LoadedMSDF>> = new Map();
  private basePath: string;
  private metadata: MSDFMetadata | null = null;
  private metadataPromise: Promise<MSDFMetadata> | null = null;

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

    // Get shape-specific metadata if available
    const shapeInfo = metadata.shapes.find(s => s.name === name);

    const loaded: LoadedMSDF = {
      name,
      width: imageBitmap.width,
      height: imageBitmap.height,
      texture,
      pxRange: metadata.pxRange,
    };
    
    this.msdfs.set(name, loaded);

    console.log(
      `[MaskManager] Loaded MSDF: ${name} (${loaded.width}x${loaded.height}, pxRange=${loaded.pxRange})`
    );
    return loaded;
  }

  /**
   * Load multiple MSDF textures
   */
  async loadMasks(names: string[]): Promise<LoadedMSDF[]> {
    return Promise.all(names.map(name => this.loadMask(name)));
  }

  /**
   * Get a loaded MSDF by name
   */
  getMask(name: string): LoadedMSDF | undefined {
    return this.msdfs.get(name);
  }

  /**
   * Get all loaded MSDFs as an array
   */
  getAllMasks(): LoadedMSDF[] {
    return Array.from(this.msdfs.values());
  }

  /**
   * Get MSDF index by name
   * Returns 0 (default solid mask) if not found
   */
  getMaskIndex(name: string): number {
    const msdfs = this.getAllMasks();
    const index = msdfs.findIndex(m => m.name === name);
    if (index < 0) {
      console.warn(`[MaskManager] MSDF not found: ${name}, using default`);
      return 0;
    }
    return index;
  }

  /**
   * Get the pxRange used for MSDF generation
   */
  getPxRange(): number {
    return this.metadata?.pxRange ?? 4.0;
  }

  /**
   * Destroy all textures
   */
  destroy(): void {
    for (const msdf of this.msdfs.values()) {
      msdf.texture.destroy();
    }
    this.msdfs.clear();
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
