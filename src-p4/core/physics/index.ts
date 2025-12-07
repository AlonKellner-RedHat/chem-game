/**
 * Spectral Physics Module
 * 
 * Platform-agnostic spectral physics calculations.
 * This is the single source of truth for both GPU and CPU paths.
 */

// Re-export constants
export * from './constants';

// Re-export config types and utilities
export * from './config';

// Re-export individual physics modules
export { getPlanckRadiance, getWienPeakWavelength, hasVisibleEmission } from './planck';
export { getKirchhoffEmission, computeSpectrumValue, getEmissionOnly } from './kirchhoff';
export { getCIE_X, getCIE_Y, getCIE_Z, getCIE_XYZ, generateCIETextures } from './cie';
export { getBackgroundIntensity, generateBackgroundSpectrum } from './backgrounds';
export { integrateToXYZ, fastIntegrateToXYZ, generateD65Spectrum } from './integration';
export { xyzToSRGB, xyzToLinearRGB, xyzTo8BitSRGB, gammaCorrect, normalizeXYZ } from './srgb';

// Import for engine implementation
import {
  SpectralPhysicsConfig,
  SharedPhysicsConfig,
  createDefaultConfig,
  mergeConfig,
} from './config';
import { computeSpectrumValue as calcSpectrum } from './kirchhoff';
import { getBackgroundIntensity } from './backgrounds';
import { fastIntegrateToXYZ } from './integration';
import { xyzToSRGB, normalizeXYZ } from './srgb';

/**
 * SpectralPhysicsEngine interface
 */
export interface SpectralPhysicsEngine {
  getConfig(): SpectralPhysicsConfig;
  updateSharedConfig(updates: Partial<SharedPhysicsConfig>): void;
  updateRenderConfig(updates: { spectralResolution?: number }): void;
  updatePlotConfig(updates: { spectralResolution?: number; wavelengthStep?: number }): void;
  computeRGB(
    transmission: number | ((wavelength: number) => number),
    temperature: number
  ): [number, number, number];
  computeSpectrum(
    transmission: number | ((wavelength: number) => number),
    temperature: number
  ): Float32Array;
  getBackgroundAt(wavelength: number): number;
}

/**
 * Create a new SpectralPhysicsEngine instance
 */
export interface PartialSpectralPhysicsConfig {
  shared?: Partial<SharedPhysicsConfig>;
  render?: Partial<{ spectralResolution: number }>;
  plot?: Partial<{ spectralResolution: number; wavelengthStep: number }>;
}

export function createPhysicsEngine(
  initialConfig?: PartialSpectralPhysicsConfig
): SpectralPhysicsEngine {
  let config = createDefaultConfig();
  
  if (initialConfig) {
    if (initialConfig.shared) {
      config.shared = { ...config.shared, ...initialConfig.shared };
    }
    if (initialConfig.render?.spectralResolution !== undefined) {
      config.render.spectralResolution = initialConfig.render.spectralResolution;
    }
    if (initialConfig.plot?.spectralResolution !== undefined) {
      config.plot.spectralResolution = initialConfig.plot.spectralResolution;
    }
    if (initialConfig.plot?.wavelengthStep !== undefined) {
      config.plot.wavelengthStep = initialConfig.plot.wavelengthStep;
    }
  }
  
  return {
    getConfig(): SpectralPhysicsConfig {
      return { ...config };
    },
    
    updateSharedConfig(updates: Partial<SharedPhysicsConfig>): void {
      config = mergeConfig(config, { shared: updates });
    },
    
    updateRenderConfig(updates: { spectralResolution?: number }): void {
      if (updates.spectralResolution !== undefined) {
        config.render.spectralResolution = updates.spectralResolution;
      }
    },
    
    updatePlotConfig(updates: { spectralResolution?: number; wavelengthStep?: number }): void {
      if (updates.spectralResolution !== undefined) {
        config.plot.spectralResolution = updates.spectralResolution;
      }
      if (updates.wavelengthStep !== undefined) {
        config.plot.wavelengthStep = updates.wavelengthStep;
      }
    },
    
    computeRGB(
      transmission: number | ((wavelength: number) => number),
      temperature: number
    ): [number, number, number] {
      const { shared, render } = config;
      
      const getTrans = typeof transmission === 'function'
        ? transmission
        : () => transmission;
      
      const xyz = fastIntegrateToXYZ((wavelength: number) => {
        const bg = getBackgroundIntensity(wavelength, shared.backgroundMode);
        const trans = getTrans(wavelength);
        return calcSpectrum(bg, trans, wavelength, temperature, shared.enableEmission);
      }, render.spectralResolution);
      
      const normalized = normalizeXYZ(xyz, xyz[1] || 1);
      return xyzToSRGB(normalized);
    },
    
    computeSpectrum(
      transmission: number | ((wavelength: number) => number),
      temperature: number
    ): Float32Array {
      const { shared, plot } = config;
      
      const resolution = plot.spectralResolution;
      const step = plot.wavelengthStep || 
        (shared.wavelengthMax - shared.wavelengthMin) / (resolution - 1);
      
      const spectrum = new Float32Array(resolution);
      
      const getTrans = typeof transmission === 'function'
        ? transmission
        : () => transmission;
      
      for (let i = 0; i < resolution; i++) {
        const wavelength = shared.wavelengthMin + i * step;
        const bg = getBackgroundIntensity(wavelength, shared.backgroundMode);
        const trans = getTrans(wavelength);
        spectrum[i] = calcSpectrum(bg, trans, wavelength, temperature, shared.enableEmission);
      }
      
      return spectrum;
    },
    
    getBackgroundAt(wavelength: number): number {
      return getBackgroundIntensity(wavelength, config.shared.backgroundMode);
    },
  };
}

let sharedEngine: SpectralPhysicsEngine | null = null;

export function getSharedPhysicsEngine(): SpectralPhysicsEngine {
  if (!sharedEngine) {
    sharedEngine = createPhysicsEngine();
  }
  return sharedEngine;
}

