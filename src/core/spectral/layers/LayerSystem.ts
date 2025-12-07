import { Layer } from './Layer';
import { PixelFilter } from '../filters/PixelFilter';

/**
 * LayerSystem - Manages multiple layers and applies them in order
 * Each pixel goes through all layers, with each layer contributing one filter
 * 
 * OCP: New layer types can be added without modifying existing code
 */
export class LayerSystem {
  private layers: Layer[] = [];

  /**
   * Add a layer to the system
   * Layers are applied in order (lower order = applied first)
   */
  addLayer(layer: Layer): void {
    this.layers.push(layer);
    // Sort by order
    this.layers.sort((a, b) => a.order - b.order);
  }

  /**
   * Get all filters for a pixel (one per layer, in order)
   * @param x X coordinate (world space)
   * @param y Y coordinate (world space)
   * @param useAntiAliasing Whether to use anti-aliasing at edges
   * @returns Array of filters, one per layer
   */
  getFiltersForPixel(x: number, y: number, useAntiAliasing: boolean = false): PixelFilter[] {
    return this.layers.map(layer => {
      if (useAntiAliasing) {
        return layer.getFilterWithAntiAliasing(x, y);
      } else {
        return layer.getFilter(x, y);
      }
    });
  }

  /**
   * Get all layers in order
   */
  getLayers(): Layer[] {
    return [...this.layers];
  }

  /**
   * Get layer by id
   */
  getLayer(id: string): Layer | null {
    return this.layers.find(layer => layer.id === id) || null;
  }

  /**
   * Clear all layers
   */
  clear(): void {
    this.layers = [];
  }
}

