import { SpectrumPoint, RGB } from '../CIE';
import { PixelSpectrum } from '../filters/PixelFilter';

/**
 * PixelBuffer - Stores pixel spectral data during rendering
 * Used for scattering (neighbor access) and brightness normalization
 */
export class PixelBuffer {
  private spectra: Map<string, SpectrumPoint[]> = new Map();
  private rgbValues: Map<string, RGB> = new Map();

  /**
   * Store spectrum for a pixel
   * @param x X coordinate (world space)
   * @param y Y coordinate (world space)
   * @param spectrum Spectral distribution
   */
  setSpectrum(x: number, y: number, spectrum: SpectrumPoint[]): void {
    const key = this.getKey(x, y);
    this.spectra.set(key, spectrum.map(p => ({ ...p }))); // Store copy
  }

  /**
   * Get spectrum for a pixel
   * @param x X coordinate (world space)
   * @param y Y coordinate (world space)
   * @returns Spectral distribution or null if not set
   */
  getSpectrum(x: number, y: number): SpectrumPoint[] | null {
    const key = this.getKey(x, y);
    const spectrum = this.spectra.get(key);
    return spectrum ? spectrum.map(p => ({ ...p })) : null; // Return copy
  }

  /**
   * Store RGB for a pixel
   * @param x X coordinate (world space)
   * @param y Y coordinate (world space)
   * @param rgb RGB color
   */
  setRGB(x: number, y: number, rgb: RGB): void {
    const key = this.getKey(x, y);
    this.rgbValues.set(key, { ...rgb });
  }

  /**
   * Get RGB for a pixel
   * @param x X coordinate (world space)
   * @param y Y coordinate (world space)
   * @returns RGB color or null if not set
   */
  getRGB(x: number, y: number): RGB | null {
    const key = this.getKey(x, y);
    return this.rgbValues.get(key) || null;
  }

  /**
   * Get neighbors' spectra for scattering
   * @param x X coordinate (world space)
   * @param y Y coordinate (world space)
   * @param radius Radius in pixels to search for neighbors
   * @returns Array of neighbor pixel spectra
   */
  getNeighbors(x: number, y: number, radius: number = 1): PixelSpectrum[] {
    const neighbors: PixelSpectrum[] = [];
    const radiusInt = Math.ceil(radius);

    for (let dx = -radiusInt; dx <= radiusInt; dx++) {
      for (let dy = -radiusInt; dy <= radiusInt; dy++) {
        if (dx === 0 && dy === 0) continue; // Skip self

        const nx = x + dx;
        const ny = y + dy;
        const spectrum = this.getSpectrum(nx, ny);

        if (spectrum) {
          neighbors.push({ x: nx, y: ny, spectrum });
        }
      }
    }

    return neighbors;
  }

  /**
   * Find maximum brightness across all RGB values
   * @returns Maximum RGB component value (0-255)
   */
  getMaxBrightness(): number {
    let maxBrightness = 0;

    for (const rgb of this.rgbValues.values()) {
      maxBrightness = Math.max(maxBrightness, rgb.r, rgb.g, rgb.b);
    }

    return maxBrightness;
  }

  /**
   * Clear all stored data
   */
  clear(): void {
    this.spectra.clear();
    this.rgbValues.clear();
  }

  /**
   * Get storage key for pixel coordinates
   */
  private getKey(x: number, y: number): string {
    return `${x},${y}`;
  }
}

