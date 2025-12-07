import { LayerSystem } from '../layers/LayerSystem';
import { BackgroundLayer } from '../layers/BackgroundLayer';
import { PixelBuffer } from './PixelBuffer';
import { SpectrumPoint, RGB, Illuminant } from '../CIE';
import { CIE } from '../CIE';
import { NothingFilter } from '../filters/NothingFilter';
import { getProfiler } from '../../utils/RenderProfiler';

/**
 * PixelLayerRenderer - Renders pixels by applying filters from layers
 * Each pixel is calculated independently through all layers
 */
export class PixelLayerRenderer {
  private buffer: PixelBuffer;

  constructor() {
    this.buffer = new PixelBuffer();
  }

  /**
   * Render pixels in a region
   * @param layerSystem Layer system with all layers
   * @param backgroundSpectrum Base background spectral distribution
   * @param bounds Bounds of region to render
   * @param pixelSize Size of each pixel (for sub-pixel sampling)
   * @param uvMode Whether to use UV illuminant
   * @param useAntiAliasing Whether to use anti-aliasing at edges
   * @returns Map of pixel coordinates to RGB colors
   */
  render(
    layerSystem: LayerSystem,
    backgroundSpectrum: SpectrumPoint[],
    bounds: { min: { x: number; y: number }; max: { x: number; y: number } },
    pixelSize: number = 1.0,
    uvMode: boolean = false,
    useAntiAliasing: boolean = true
  ): Map<string, RGB> {
    this.buffer.clear();

    const backgroundLayer = layerSystem.getLayer('background') as BackgroundLayer;
    if (!backgroundLayer) {
      throw new Error('Background layer not found in layer system');
    }

    const profiler = getProfiler();
    const illuminant: Illuminant = uvMode ? 'UV' : 'D65';
    const result = new Map<string, RGB>();

    // First pass: calculate all pixel spectra (without scattering)
    profiler.start('cpuPath.pass1');
    const pixelsToProcess: Array<{ x: number; y: number }> = [];

    for (let x = bounds.min.x; x < bounds.max.x; x += pixelSize) {
      for (let y = bounds.min.y; y < bounds.max.y; y += pixelSize) {
        pixelsToProcess.push({ x, y });

        // Start with background spectrum
        let spectrum = backgroundSpectrum.map(p => ({ ...p }));

        // Apply filters from each layer in order (including background layer)
        const filters = layerSystem.getFiltersForPixel(x, y, useAntiAliasing);
        for (const filter of filters) {
          // Skip nothing filters (they don't change the spectrum)
          if (filter instanceof NothingFilter) {
            continue;
          }

          // Check if filter needs neighbors (scattering)
          if (filter.canScatter()) {
            // Will handle in second pass
            continue;
          }

          spectrum = filter.apply(spectrum, x, y);
        }

        // Store spectrum in buffer
        this.buffer.setSpectrum(x, y, spectrum);
      }
    }
    profiler.end('cpuPath.pass1');

    // Second pass: apply scattering filters and convert to LINEAR RGB
    // Store linear RGB for brightness comparison (NO gamma yet)
    profiler.start('cpuPath.pass2');
    const linearRGBs = new Map<string, { r: number; g: number; b: number }>();
    let maxLinearBrightness = 0;
    
    for (const { x, y } of pixelsToProcess) {
      let spectrum = this.buffer.getSpectrum(x, y);
      if (!spectrum) continue;

      // Apply scattering filters
      const filters = layerSystem.getFiltersForPixel(x, y, useAntiAliasing);
      for (const filter of filters) {
        if (filter.canScatter()) {
          const neighbors = this.buffer.getNeighbors(x, y, 1);
          spectrum = filter.apply(spectrum, x, y, neighbors);
        }
      }

      // Convert spectrum to RAW XYZ (NO Y-normalization)
      const xyz = CIE.spectrumToRawXYZ(spectrum, illuminant);
      
      // Convert to LINEAR RGB (NO gamma)
      const linearRGB = CIE.xyzToLinearRGB(xyz);
      linearRGBs.set(`${x},${y}`, linearRGB);
      
      // Track max brightness for normalization
      const brightness = Math.max(linearRGB.r, linearRGB.g, linearRGB.b);
      maxLinearBrightness = Math.max(maxLinearBrightness, brightness);
    }
    profiler.end('cpuPath.pass2');

    // Third pass: normalize by max brightness and apply gamma
    profiler.start('cpuPath.pass3');
    for (const { x, y } of pixelsToProcess) {
      const key = `${x},${y}`;
      const linearRGB = linearRGBs.get(key);
      if (!linearRGB) continue;
      
      // Apply normalization and gamma correction
      const rgb = CIE.linearRGBToSRGB(linearRGB, maxLinearBrightness);
      this.buffer.setRGB(x, y, rgb);
      result.set(key, rgb);
    }
    profiler.end('cpuPath.pass3');

    // Store pixel count for reporting
    if (profiler.isEnabled()) {
      // Store as metadata (we'll add this to the timing data structure)
      // const pixelCount = pixelsToProcess.length; // TODO: Add to timing data structure
    }

    return result;
  }

  // normalizeRGB removed - normalization now done in CIE.linearRGBToSRGB

  /**
   * Get buffer for external access (e.g., for debugging)
   */
  getBuffer(): PixelBuffer {
    return this.buffer;
  }
}

