/**
 * Spectral Physics Configuration
 * 
 * Defines configuration types for the spectral physics engine.
 * The config is split into shared settings (identical for both paths)
 * and path-specific settings (can differ between render and plot).
 */

import {
  WAVELENGTH_MIN,
  WAVELENGTH_MAX,
  VISIBLE_MIN,
  VISIBLE_MAX,
  DRAPER_POINT,
  D65_TEMPERATURE,
} from './constants';

/**
 * Background illumination modes
 */
export type BackgroundMode = 'normal' | 'uv' | 'dark';

/**
 * Output mode for spectrum calculation
 */
export type OutputMode = 'rgb' | 'spectrum';

/**
 * Shared configuration that applies to both rendering and plotting paths.
 * Changes to these values affect both paths identically.
 */
export interface SharedPhysicsConfig {
  /** Minimum wavelength for spectrum calculations (nm) */
  wavelengthMin: number;
  
  /** Maximum wavelength for spectrum calculations (nm) */
  wavelengthMax: number;
  
  /** Start of visible spectrum (nm) */
  visibleMin: number;
  
  /** End of visible spectrum (nm) */
  visibleMax: number;
  
  /** Temperature threshold for visible emission (K) */
  draperPoint: number;
  
  /** D65 reference temperature for normalization (K) */
  d65ReferenceTemp: number;
  
  /** Whether to calculate thermal emission */
  enableEmission: boolean;
  
  /** Whether to apply scattering effects (future) */
  enableScattering: boolean;
  
  /** Background illumination mode */
  backgroundMode: BackgroundMode;
}

/**
 * Configuration specific to the RGB rendering path.
 * Optimized for speed - uses fewer wavelength samples.
 */
export interface RenderPathConfig {
  /** Number of wavelength samples for integration (16-32 typical) */
  spectralResolution: number;
  
  /** Output format (always 'rgb' for rendering) */
  outputMode: 'rgb';
}

/**
 * Configuration specific to the spectrum plotting path.
 * Optimized for accuracy - uses many wavelength samples.
 */
export interface PlotPathConfig {
  /** Number of wavelength samples (320-5334 typical) */
  spectralResolution: number;
  
  /** Output format (always 'spectrum' for plotting) */
  outputMode: 'spectrum';
  
  /** Optional custom wavelength step size (nm) */
  wavelengthStep?: number;
}

/**
 * Combined configuration for the spectral physics engine.
 */
export interface SpectralPhysicsConfig {
  /** Shared settings (identical for both paths) */
  shared: SharedPhysicsConfig;
  
  /** Render path specific settings */
  render: RenderPathConfig;
  
  /** Plot path specific settings */
  plot: PlotPathConfig;
}

/**
 * Create default shared configuration
 */
export function createDefaultSharedConfig(): SharedPhysicsConfig {
  return {
    wavelengthMin: WAVELENGTH_MIN,
    wavelengthMax: WAVELENGTH_MAX,
    visibleMin: VISIBLE_MIN,
    visibleMax: VISIBLE_MAX,
    draperPoint: DRAPER_POINT,
    d65ReferenceTemp: D65_TEMPERATURE,
    enableEmission: true,
    enableScattering: false,
    backgroundMode: 'normal',
  };
}

/**
 * Create default render path configuration
 */
export function createDefaultRenderConfig(): RenderPathConfig {
  return {
    spectralResolution: 32,  // 32 samples across 100-1000nm for UV fluorescence
    outputMode: 'rgb',
  };
}

/**
 * Create default plot path configuration
 */
export function createDefaultPlotConfig(): PlotPathConfig {
  return {
    spectralResolution: 320,
    outputMode: 'spectrum',
  };
}

/**
 * Create complete default configuration
 */
export function createDefaultConfig(): SpectralPhysicsConfig {
  return {
    shared: createDefaultSharedConfig(),
    render: createDefaultRenderConfig(),
    plot: createDefaultPlotConfig(),
  };
}

/**
 * Merge partial config updates into existing config
 */
export function mergeConfig(
  base: SpectralPhysicsConfig,
  updates: {
    shared?: Partial<SharedPhysicsConfig>;
    render?: Partial<RenderPathConfig>;
    plot?: Partial<PlotPathConfig>;
  }
): SpectralPhysicsConfig {
  return {
    shared: { ...base.shared, ...updates.shared },
    render: { ...base.render, ...updates.render },
    plot: { ...base.plot, ...updates.plot },
  };
}




