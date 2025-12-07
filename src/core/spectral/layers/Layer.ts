import { PixelFilter } from '../filters/PixelFilter';
import { NothingFilter } from '../filters/NothingFilter';
import { ShapeGeometry } from '../geometry/ShapeGeometry';

/**
 * ShapeFilterPair - Associates a shape geometry with a filter
 */
export interface ShapeFilterPair {
  geometry: ShapeGeometry;
  filter: PixelFilter;
}

/**
 * Layer - Represents a single rendering layer with shapes
 * Each pixel gets exactly one filter from this layer (either from a shape or "nothing")
 * 
 * OCP: New layer types can be added without modifying existing code
 */
export class Layer {
  readonly id: string;
  readonly order: number; // 0 = background, 1+ = shape layers
  private readonly shapes: ShapeFilterPair[];
  private readonly nothingFilter: NothingFilter;
  private readonly antiAliasWidth: number; // Width of anti-aliasing region in pixels

  constructor(id: string, order: number, antiAliasWidth: number = 1.0) {
    this.id = id;
    this.order = order;
    this.shapes = [];
    this.nothingFilter = new NothingFilter();
    this.antiAliasWidth = antiAliasWidth;
  }

  /**
   * Add a shape with its filter to this layer
   */
  addShape(geometry: ShapeGeometry, filter: PixelFilter): void {
    this.shapes.push({ geometry, filter });
  }

  /**
   * Get filter for a pixel at (x, y)
   * Returns the filter from the first matching shape, or NothingFilter if no shape matches
   * 
   * @param x X coordinate (world space)
   * @param y Y coordinate (world space)
   * @returns Filter to apply to this pixel
   */
  getFilter(x: number, y: number): PixelFilter {
    // Check each shape in order (first match wins)
    for (const { geometry, filter } of this.shapes) {
      if (geometry.contains(x, y)) {
        return filter;
      }
    }

    // No shape matches - return nothing filter
    return this.nothingFilter;
  }

  /**
   * Get filter with anti-aliasing support
   * Blends between shape filter and nothing filter at edges
   * 
   * @param x X coordinate (world space)
   * @param y Y coordinate (world space)
   * @returns Filter to apply (may be blended)
   */
  getFilterWithAntiAliasing(x: number, y: number): PixelFilter {
    // Find the closest shape
    let closestShape: ShapeFilterPair | null = null;
    let closestDistance = Infinity;

    for (const { geometry, filter } of this.shapes) {
      const distance = geometry.getEdgeDistance(x, y);
      if (distance >= 0) {
        // Inside shape - use this filter
        return filter;
      }
      // Outside shape - track closest
      if (Math.abs(distance) < closestDistance) {
        closestDistance = Math.abs(distance);
        closestShape = { geometry, filter };
      }
    }

    // If no shape is close enough for anti-aliasing, return nothing filter
    if (!closestShape || closestDistance > this.antiAliasWidth) {
      return this.nothingFilter;
    }

    // Blend between shape filter and nothing filter
    // Use smoothstep for smooth transition
    const t = closestDistance / this.antiAliasWidth;
    const blendFactor = this.smoothstep(0, 1, t);

    // For now, return the shape filter (blending will be handled by renderer)
    // TODO: Return a blended filter or handle blending in renderer
    if (blendFactor < 0.5) {
      return closestShape.filter;
    } else {
      return this.nothingFilter;
    }
  }

  /**
   * Smoothstep function for smooth interpolation
   */
  private smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  /**
   * Get all shapes in this layer
   */
  getShapes(): ShapeFilterPair[] {
    return [...this.shapes];
  }

  /**
   * Clear all shapes from this layer
   */
  clear(): void {
    this.shapes.length = 0;
  }
}

