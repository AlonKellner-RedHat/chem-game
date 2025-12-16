/**
 * Mask Loader
 *
 * Loads shape mask textures including:
 * - MSDF (Multi-Channel Signed Distance Field) for sharp edges
 * - Alpha (grayscale) for intensity modulation
 *
 * Shape files are organized in subdirectories:
 *   /shapes/{shapeName}/msdf.png  - MSDF texture (optional)
 *   /shapes/{shapeName}/alpha.png - Alpha texture (optional)
 *
 * Behavior when files are missing:
 * - No MSDF: All pixels are considered inside the shape (coverage = 1.0)
 * - No Alpha: Alpha value is 1.0 everywhere
 * - Neither: Full coverage with alpha 1.0
 *
 * Textures are organized into arrays by resolution:
 * - Small array (256x256): Basic shapes like circle, rectangle, triangle
 * - Large array (1280x720): Screen-sized patterns like grids
 */

export interface MaskMetadata {
  pxRange: number;
  shapes: {
    name: string;
    width: number;
    height: number;
    hasMsdf: boolean;
    hasAlpha: boolean;
  }[];
}

export interface LoadedTexture {
  name: string;
  width: number;
  height: number;
  texture: GPUTexture;
}

export interface LoadedShape {
  name: string;
  width: number;
  height: number;
  pxRange: number;
  msdfTexture: GPUTexture | null;
  alphaTexture: GPUTexture | null;
  hasMsdf: boolean;
  hasAlpha: boolean;
}

/**
 * Mask index result containing array and layer indices for both MSDF and alpha
 */
export interface MaskIndex {
  // MSDF texture indices
  msdfArrayIndex: number; // 0 = small (256x256), 1 = large (1280x720)
  msdfLayerIndex: number; // Layer within the array (-1 if no MSDF)
  // Alpha texture indices
  alphaArrayIndex: number; // 0 = small, 1 = large
  alphaLayerIndex: number; // Layer within the array (-1 if no alpha)
  // Flags
  hasMsdf: boolean;
  hasAlpha: boolean;
}

// Resolution thresholds for categorizing masks
const SMALL_MAX_WIDTH = 512;
const SMALL_MAX_HEIGHT = 512;

/**
 * Try to load PNG image as ImageBitmap, returns null if not found
 */
async function tryLoadImageBitmap(url: string): Promise<ImageBitmap | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    const blob = await response.blob();
    return createImageBitmap(blob);
  } catch {
    return null;
  }
}

/**
 * Create GPU texture from ImageBitmap
 */
function createTexture(device: GPUDevice, imageBitmap: ImageBitmap, label: string): GPUTexture {
  const { width, height } = imageBitmap;

  // Create texture with rgba8unorm format (standard for images)
  // Include COPY_SRC for copying into texture arrays
  const texture = device.createTexture({
    label,
    size: { width, height, depthOrArrayLayers: 1 },
    format: 'rgba8unorm',
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });

  // Copy image data to texture
  device.queue.copyExternalImageToTexture({ source: imageBitmap }, { texture }, { width, height });

  return texture;
}

/**
 * Mask Manager - handles loading and caching shape textures (MSDF + Alpha)
 *
 * Organizes textures into arrays by resolution for efficient GPU binding:
 * - Array 0 (small): 256x256 textures for basic shapes
 * - Array 1 (large): 1280x720 textures for screen-sized patterns
 *
 * Maintains separate arrays for MSDF and alpha textures.
 */
export class MaskManager {
  private device: GPUDevice;
  private shapes: Map<string, LoadedShape> = new Map();
  private loadingPromises: Map<string, Promise<LoadedShape>> = new Map();
  private basePath: string;
  private metadata: MaskMetadata | null = null;
  private metadataPromise: Promise<MaskMetadata> | null = null;

  // Track MSDF textures by resolution category
  private smallMsdfs: string[] = []; // Array index 0
  private largeMsdfs: string[] = []; // Array index 1

  // Track Alpha textures by resolution category
  private smallAlphas: string[] = []; // Array index 0
  private largeAlphas: string[] = []; // Array index 1

  // Resolution for each array
  private smallResolution = { width: 256, height: 256 };
  private largeResolution = { width: 1280, height: 720 };

  constructor(device: GPUDevice, basePath = '/shapes') {
    this.device = device;
    this.basePath = basePath;
  }

  /**
   * Load metadata file to get pxRange and shape info
   */
  private async loadMetadata(): Promise<MaskMetadata> {
    if (this.metadata) {
      return this.metadata;
    }

    // If already loading, return existing promise
    if (this.metadataPromise) {
      return this.metadataPromise;
    }

    this.metadataPromise = (async () => {
      const url = `${this.basePath}/metadata.json`;
      try {
        const response = await fetch(url);
        if (!response.ok) {
          // Default metadata if file doesn't exist
          console.warn(`[MaskManager] Metadata not found at ${url}, using defaults`);
          this.metadata = { pxRange: 4.0, shapes: [] };
          return this.metadata;
        }

        // Check Content-Type to detect HTML responses (SPA fallback)
        const contentType = response.headers.get('Content-Type') || '';
        if (!contentType.includes('application/json')) {
          // Server returned non-JSON (likely HTML from SPA fallback)
          console.warn(
            `[MaskManager] Expected JSON but got ${contentType} at ${url}, using defaults`
          );
          this.metadata = { pxRange: 4.0, shapes: [] };
          return this.metadata;
        }

        this.metadata = await response.json();
        console.log(`[MaskManager] Loaded metadata: pxRange=${this.metadata!.pxRange}`);
        return this.metadata!;
      } catch (error) {
        // Handle network errors or JSON parsing failures
        console.warn(`[MaskManager] Failed to load metadata from ${url}:`, error);
        this.metadata = { pxRange: 4.0, shapes: [] };
        return this.metadata;
      }
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
   * Load a shape's textures (MSDF and/or alpha)
   */
  async loadShape(name: string): Promise<LoadedShape> {
    // Check cache
    const cached = this.shapes.get(name);
    if (cached) {
      return cached;
    }

    // Check if already loading
    const loadingPromise = this.loadingPromises.get(name);
    if (loadingPromise) {
      return loadingPromise;
    }

    // Start loading
    const promise = this.doLoadShape(name);
    this.loadingPromises.set(name, promise);

    try {
      const result = await promise;
      return result;
    } finally {
      this.loadingPromises.delete(name);
    }
  }

  private async doLoadShape(name: string): Promise<LoadedShape> {
    // Ensure metadata is loaded
    const metadata = await this.loadMetadata();

    // Get shape info from metadata
    const shapeInfo = metadata.shapes.find((s) => s.name === name);
    const width = shapeInfo?.width ?? this.smallResolution.width;
    const height = shapeInfo?.height ?? this.smallResolution.height;
    const expectedHasMsdf = shapeInfo?.hasMsdf ?? true;
    const expectedHasAlpha = shapeInfo?.hasAlpha ?? false;

    // Load both files in parallel (from subdirectory)
    const msdfUrl = `${this.basePath}/${name}/msdf.png`;
    const alphaUrl = `${this.basePath}/${name}/alpha.png`;

    console.log(
      `[MaskManager] Loading shape: ${name} (expected: msdf=${expectedHasMsdf}, alpha=${expectedHasAlpha})`
    );

    const [msdfBitmap, alphaBitmap] = await Promise.all([
      expectedHasMsdf ? tryLoadImageBitmap(msdfUrl) : Promise.resolve(null),
      expectedHasAlpha ? tryLoadImageBitmap(alphaUrl) : Promise.resolve(null),
    ]);

    // Create textures if bitmaps loaded
    let msdfTexture: GPUTexture | null = null;
    let alphaTexture: GPUTexture | null = null;

    if (msdfBitmap) {
      msdfTexture = createTexture(this.device, msdfBitmap, `MSDF: ${name}`);
    }

    if (alphaBitmap) {
      alphaTexture = createTexture(this.device, alphaBitmap, `Alpha: ${name}`);
    }

    const loaded: LoadedShape = {
      name,
      width,
      height,
      pxRange: metadata.pxRange,
      msdfTexture,
      alphaTexture,
      hasMsdf: msdfTexture !== null,
      hasAlpha: alphaTexture !== null,
    };

    this.shapes.set(name, loaded);

    // Categorize by resolution and texture type
    const isSmall = this.isSmallMask(width, height);

    if (loaded.hasMsdf) {
      if (isSmall) {
        if (!this.smallMsdfs.includes(name)) {
          this.smallMsdfs.push(name);
        }
      } else {
        if (!this.largeMsdfs.includes(name)) {
          this.largeMsdfs.push(name);
        }
      }
    }

    if (loaded.hasAlpha) {
      if (isSmall) {
        if (!this.smallAlphas.includes(name)) {
          this.smallAlphas.push(name);
        }
      } else {
        if (!this.largeAlphas.includes(name)) {
          this.largeAlphas.push(name);
        }
      }
    }

    console.log(
      `[MaskManager] Loaded shape: ${name} (${width}x${height}, ` +
        `category=${isSmall ? 'small' : 'large'}, ` +
        `msdf=${loaded.hasMsdf}, alpha=${loaded.hasAlpha})`
    );

    // Debug: Log current alpha array state
    if (loaded.hasAlpha) {
      console.log(
        `[MaskManager] Alpha arrays after loading ${name}: ` +
          `smallAlphas=[${this.smallAlphas.join(', ')}], ` +
          `largeAlphas=[${this.largeAlphas.join(', ')}]`
      );
    }

    return loaded;
  }

  /**
   * Load multiple shapes.
   * IMPORTANT: Order is deterministic based on request order, not completion order.
   */
  async loadMasks(names: string[]): Promise<LoadedShape[]> {
    // Load all shapes in parallel for speed
    const results = await Promise.all(names.map((name) => this.loadShape(name)));

    // Rebuild category arrays in deterministic order based on request order
    // This ensures layer indices are predictable regardless of network timing
    this.smallMsdfs = [];
    this.largeMsdfs = [];
    this.smallAlphas = [];
    this.largeAlphas = [];

    for (const name of names) {
      const shape = this.shapes.get(name);
      if (shape) {
        const isSmall = this.isSmallMask(shape.width, shape.height);

        if (shape.hasMsdf) {
          if (isSmall) {
            if (!this.smallMsdfs.includes(name)) {
              this.smallMsdfs.push(name);
            }
          } else {
            if (!this.largeMsdfs.includes(name)) {
              this.largeMsdfs.push(name);
            }
          }
        }

        if (shape.hasAlpha) {
          if (isSmall) {
            if (!this.smallAlphas.includes(name)) {
              this.smallAlphas.push(name);
            }
          } else {
            if (!this.largeAlphas.includes(name)) {
              this.largeAlphas.push(name);
            }
          }
        }
      }
    }

    console.log('[MaskManager] Small MSDFs (ordered):', this.smallMsdfs);
    console.log('[MaskManager] Large MSDFs (ordered):', this.largeMsdfs);
    console.log('[MaskManager] Small Alphas (ordered):', this.smallAlphas);
    console.log('[MaskManager] Large Alphas (ordered):', this.largeAlphas);

    return results;
  }

  /**
   * Get a loaded shape by name
   */
  getShape(name: string): LoadedShape | undefined {
    return this.shapes.get(name);
  }

  /**
   * Get all loaded shapes as an array.
   */
  getAllShapes(): LoadedShape[] {
    return Array.from(this.shapes.values());
  }

  /**
   * Get small MSDF textures in order for texture array building
   */
  getSmallMsdfs(): GPUTexture[] {
    return this.smallMsdfs
      .map((name) => this.shapes.get(name)?.msdfTexture)
      .filter((t): t is GPUTexture => t !== null && t !== undefined);
  }

  /**
   * Get large MSDF textures in order for texture array building
   */
  getLargeMsdfs(): GPUTexture[] {
    return this.largeMsdfs
      .map((name) => this.shapes.get(name)?.msdfTexture)
      .filter((t): t is GPUTexture => t !== null && t !== undefined);
  }

  /**
   * Get small alpha textures in order for texture array building
   */
  getSmallAlphas(): GPUTexture[] {
    return this.smallAlphas
      .map((name) => this.shapes.get(name)?.alphaTexture)
      .filter((t): t is GPUTexture => t !== null && t !== undefined);
  }

  /**
   * Get large alpha textures in order for texture array building
   */
  getLargeAlphas(): GPUTexture[] {
    return this.largeAlphas
      .map((name) => this.shapes.get(name)?.alphaTexture)
      .filter((t): t is GPUTexture => t !== null && t !== undefined);
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
   * Get mask indices by name.
   * Returns indices for both MSDF and alpha texture arrays.
   */
  getMaskIndex(name: string): MaskIndex {
    const shape = this.shapes.get(name);
    const isSmall = shape ? this.isSmallMask(shape.width, shape.height) : true;

    // Default values (no textures)
    const result: MaskIndex = {
      msdfArrayIndex: isSmall ? 0 : 1,
      msdfLayerIndex: -1,
      alphaArrayIndex: isSmall ? 0 : 1,
      alphaLayerIndex: -1,
      hasMsdf: false,
      hasAlpha: false,
    };

    if (shape) {
      // Check MSDF indices
      if (shape.hasMsdf) {
        const smallMsdfIndex = this.smallMsdfs.indexOf(name);
        const largeMsdfIndex = this.largeMsdfs.indexOf(name);

        if (smallMsdfIndex >= 0) {
          result.msdfArrayIndex = 0;
          result.msdfLayerIndex = smallMsdfIndex;
          result.hasMsdf = true;
        } else if (largeMsdfIndex >= 0) {
          result.msdfArrayIndex = 1;
          result.msdfLayerIndex = largeMsdfIndex;
          result.hasMsdf = true;
        }
      }

      // Check alpha indices
      if (shape.hasAlpha) {
        const smallAlphaIndex = this.smallAlphas.indexOf(name);
        const largeAlphaIndex = this.largeAlphas.indexOf(name);

        console.log(
          `[MaskManager] getMaskIndex alpha lookup for ${name}: ` +
            `shape.hasAlpha=${shape.hasAlpha}, ` +
            `smallAlphaIndex=${smallAlphaIndex}, largeAlphaIndex=${largeAlphaIndex}, ` +
            `smallAlphas=[${this.smallAlphas.join(', ')}], ` +
            `largeAlphas=[${this.largeAlphas.join(', ')}]`
        );

        if (smallAlphaIndex >= 0) {
          result.alphaArrayIndex = 0;
          result.alphaLayerIndex = smallAlphaIndex;
          result.hasAlpha = true;
        } else if (largeAlphaIndex >= 0) {
          result.alphaArrayIndex = 1;
          result.alphaLayerIndex = largeAlphaIndex;
          result.hasAlpha = true;
        }
      }
    }

    return result;
  }

  /**
   * Get dimensions of a shape
   */
  getShapeDimensions(name: string): { width: number; height: number } {
    const shape = this.shapes.get(name);
    if (shape) {
      return { width: shape.width, height: shape.height };
    }
    return this.smallResolution;
  }

  /**
   * Get the pxRange used for MSDF generation
   */
  getPxRange(): number {
    return this.metadata?.pxRange ?? 4.0;
  }

  /**
   * Get count of small MSDF textures
   */
  getSmallMsdfCount(): number {
    return this.smallMsdfs.length;
  }

  /**
   * Get count of large MSDF textures
   */
  getLargeMsdfCount(): number {
    return this.largeMsdfs.length;
  }

  /**
   * Get count of small alpha textures
   */
  getSmallAlphaCount(): number {
    return this.smallAlphas.length;
  }

  /**
   * Get count of large alpha textures
   */
  getLargeAlphaCount(): number {
    return this.largeAlphas.length;
  }

  /**
   * Destroy all textures
   */
  destroy(): void {
    for (const shape of this.shapes.values()) {
      shape.msdfTexture?.destroy();
      shape.alphaTexture?.destroy();
    }
    this.shapes.clear();
    this.smallMsdfs = [];
    this.largeMsdfs = [];
    this.smallAlphas = [];
    this.largeAlphas = [];
    this.metadata = null;
  }
}

// Legacy type exports for compatibility
export type MSDFMetadata = MaskMetadata;
export type LoadedMSDF = LoadedShape;
export type LoadedMask = LoadedShape;

export type MaskData = {
  width: number;
  height: number;
  data: Float32Array;
};
