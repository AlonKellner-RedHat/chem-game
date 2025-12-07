import { SpectrumPoint } from '../CIE';

/**
 * Pixel spectrum data for neighbor access during scattering
 */
export interface PixelSpectrum {
  x: number;
  y: number;
  spectrum: SpectrumPoint[];
}

/**
 * PixelFilter interface for filters that modify pixel spectral distributions
 * Filters can absorb (reduce), emit (add), or scatter (mix with neighbors)
 * 
 * OCP: New filter types can be added without modifying existing code
 */
export interface PixelFilter {
  /**
   * Apply filter to a pixel's spectral distribution
   * @param spectrum Input spectral distribution
   * @param x Pixel X coordinate (world space)
   * @param y Pixel Y coordinate (world space)
   * @param neighbors Optional array of neighboring pixel spectra (for scattering)
   * @returns Modified spectral distribution
   */
  apply(
    spectrum: SpectrumPoint[],
    x: number,
    y: number,
    neighbors?: PixelSpectrum[]
  ): SpectrumPoint[];

  /**
   * Whether this filter requires neighbor access (scattering)
   * @returns true if filter needs neighbors, false otherwise
   */
  canScatter(): boolean;

  /**
   * Filter identifier (for debugging/logging)
   */
  readonly id: string;
}

