/**
 * OptimizationConfig - Shader optimization configuration
 *
 * Follows OCP (Open-Closed Principle):
 * - Open for extension: New optimization flags can be added
 * - Closed for modification: Core behavior is controlled by config, not code changes
 *
 * This allows runtime control of shader optimizations without
 * recompiling or modifying shader code.
 */

/**
 * Individual optimization flags
 */
export interface OptimizationFlags {
  /** Hoist mask calculations outside wavelength loop (major speedup) */
  hoistedMasks: boolean;
  /** Early exit for pixels with zero shape coverage (major speedup) */
  earlyExit: boolean;
  /** Use downsampled scattering LUT instead of per-wavelength calculation */
  downsampledScattering: boolean;
  /** Use pre-computed scattering texture from CPU */
  precomputedScatteringTexture: boolean;
}

/**
 * Preset optimization profiles
 */
export enum OptimizationPreset {
  /** All optimizations enabled for maximum performance */
  Performance = 'performance',
  /** Some optimizations disabled for higher accuracy */
  Quality = 'quality',
  /** All optimizations disabled (baseline/debugging) */
  None = 'none',
  /** Custom configuration (modified from a preset) */
  Custom = 'custom',
}

/**
 * Serialized config format for JSON export/import
 */
interface SerializedConfig {
  flags: OptimizationFlags;
  scatteringLUTSize: number;
}

/**
 * Minimum and maximum bounds for scattering LUT size
 */
const MIN_LUT_SIZE = 8;
const MAX_LUT_SIZE = 1024;
const DEFAULT_LUT_SIZE = 64;

/**
 * OptimizationConfig manages shader optimization settings.
 *
 * Usage:
 * ```typescript
 * // Use a preset
 * const config = OptimizationConfig.performance();
 *
 * // Or customize
 * const config = OptimizationConfig.default();
 * config.setFlag('downsampledScattering', false);
 *
 * // Apply to pipeline
 * pipeline.setOptimizations(config);
 * ```
 */
export class OptimizationConfig {
  private flags: OptimizationFlags;
  private scatteringLUTSize: number;

  private constructor(flags: OptimizationFlags, lutSize: number = DEFAULT_LUT_SIZE) {
    this.flags = { ...flags };
    this.scatteringLUTSize = lutSize;
  }

  // ============================================================
  // Factory Methods
  // ============================================================

  /**
   * Create default config with all optimizations enabled
   */
  static default(): OptimizationConfig {
    return new OptimizationConfig({
      hoistedMasks: true,
      earlyExit: true,
      downsampledScattering: true,
      precomputedScatteringTexture: true,
    });
  }

  /**
   * Create performance-optimized config (all optimizations)
   */
  static performance(): OptimizationConfig {
    return OptimizationConfig.default();
  }

  /**
   * Create quality-focused config (some approximations disabled)
   */
  static quality(): OptimizationConfig {
    return new OptimizationConfig({
      hoistedMasks: true,
      earlyExit: true,
      downsampledScattering: false, // Use full per-wavelength calculation
      precomputedScatteringTexture: true,
    });
  }

  /**
   * Create config with all optimizations disabled (for debugging/baseline)
   */
  static none(): OptimizationConfig {
    return new OptimizationConfig({
      hoistedMasks: false,
      earlyExit: false,
      downsampledScattering: false,
      precomputedScatteringTexture: false,
    });
  }

  /**
   * Create config from serialized JSON
   */
  static fromJSON(json: SerializedConfig): OptimizationConfig {
    const config = new OptimizationConfig(json.flags, json.scatteringLUTSize);
    return config;
  }

  // ============================================================
  // Flag Accessors
  // ============================================================

  /**
   * Get a copy of all optimization flags
   */
  getFlags(): OptimizationFlags {
    return { ...this.flags };
  }

  /**
   * Set an individual optimization flag
   */
  setFlag<K extends keyof OptimizationFlags>(key: K, value: boolean): void {
    this.flags[key] = value;
  }

  /**
   * Get the scattering LUT size
   */
  getScatteringLUTSize(): number {
    return this.scatteringLUTSize;
  }

  /**
   * Set the scattering LUT size
   * @throws Error if size is outside valid bounds [8, 1024]
   */
  setScatteringLUTSize(size: number): void {
    if (size < MIN_LUT_SIZE || size > MAX_LUT_SIZE) {
      throw new Error(
        `Scattering LUT size must be between ${MIN_LUT_SIZE} and ${MAX_LUT_SIZE}, got ${size}`
      );
    }
    this.scatteringLUTSize = size;
  }

  // ============================================================
  // Shader Integration
  // ============================================================

  /**
   * Generate WGSL-compatible constant definitions for enabled optimizations.
   *
   * These can be prepended to shader code or used with shader compilation.
   * WGSL doesn't have preprocessor directives, so we use const declarations.
   */
  getShaderDefines(): string {
    const defines: string[] = [];

    if (this.flags.hoistedMasks) {
      defines.push('const ENABLE_HOISTED_MASKS: bool = true;');
    }
    if (this.flags.earlyExit) {
      defines.push('const ENABLE_EARLY_EXIT: bool = true;');
    }
    if (this.flags.downsampledScattering) {
      defines.push('const ENABLE_DOWNSAMPLED_SCATTERING: bool = true;');
      defines.push(`const SCATTER_LUT_SIZE: u32 = ${this.scatteringLUTSize}u;`);
    }
    if (this.flags.precomputedScatteringTexture) {
      defines.push('const ENABLE_PRECOMPUTED_SCATTERING: bool = true;');
    }

    return defines.join('\n');
  }

  // ============================================================
  // Serialization
  // ============================================================

  /**
   * Serialize config to JSON-compatible object
   */
  toJSON(): SerializedConfig {
    return {
      flags: { ...this.flags },
      scatteringLUTSize: this.scatteringLUTSize,
    };
  }

  // ============================================================
  // Preset Detection
  // ============================================================

  /**
   * Detect which preset this config matches, if any
   */
  getPreset(): OptimizationPreset {
    const f = this.flags;

    // Check for None preset
    if (
      !f.hoistedMasks &&
      !f.earlyExit &&
      !f.downsampledScattering &&
      !f.precomputedScatteringTexture
    ) {
      return OptimizationPreset.None;
    }

    // Check for Performance preset (all enabled)
    if (
      f.hoistedMasks &&
      f.earlyExit &&
      f.downsampledScattering &&
      f.precomputedScatteringTexture
    ) {
      return OptimizationPreset.Performance;
    }

    // Check for Quality preset
    if (
      f.hoistedMasks &&
      f.earlyExit &&
      !f.downsampledScattering &&
      f.precomputedScatteringTexture
    ) {
      return OptimizationPreset.Quality;
    }

    return OptimizationPreset.Custom;
  }
}
