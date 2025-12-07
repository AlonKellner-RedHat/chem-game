/**
 * ShapeGeometry interface for shape hit testing and edge distance calculation
 * Used for determining which filter applies to a pixel and for anti-aliasing
 * 
 * OCP: New shape types can be added without modifying existing code
 */
export interface ShapeGeometry {
  /**
   * Check if a point is inside the shape
   * @param x X coordinate (world space)
   * @param y Y coordinate (world space)
   * @returns true if point is inside shape, false otherwise
   */
  contains(x: number, y: number): boolean;

  /**
   * Get distance from point to nearest edge of shape
   * Positive = inside, negative = outside
   * @param x X coordinate (world space)
   * @param y Y coordinate (world space)
   * @returns Distance to edge (positive inside, negative outside)
   */
  getEdgeDistance(x: number, y: number): number;

  /**
   * Get shape identifier (for debugging/logging)
   */
  readonly id: string;
}

