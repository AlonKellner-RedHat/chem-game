import { ShapeGeometry } from './ShapeGeometry';

/**
 * TriangleGeometry - Triangle shape geometry (equilateral triangle pointing up)
 */
export class TriangleGeometry implements ShapeGeometry {
  readonly id: string;
  private readonly centerX: number;
  private readonly centerY: number;
  private readonly size: number;

  constructor(centerX: number, centerY: number, size: number, id?: string) {
    this.centerX = centerX;
    this.centerY = centerY;
    this.size = size;
    this.id = id || 'triangle';
  }

  contains(x: number, y: number): boolean {
    // Triangle vertices (equilateral, pointing up)
    const v1x = this.centerX;
    const v1y = this.centerY - this.size / 2; // Top
    const v2x = this.centerX - this.size / 2;
    const v2y = this.centerY + this.size / 2; // Bottom left
    const v3x = this.centerX + this.size / 2;
    const v3y = this.centerY + this.size / 2; // Bottom right

    // Barycentric coordinates method
    const denom = (v2y - v3y) * (v1x - v3x) + (v3x - v2x) * (v1y - v3y);
    const a = ((v2y - v3y) * (x - v3x) + (v3x - v2x) * (y - v3y)) / denom;
    const b = ((v3y - v1y) * (x - v3x) + (v1x - v3x) * (y - v3y)) / denom;
    const c = 1 - a - b;

    return a >= 0 && b >= 0 && c >= 0;
  }

  getEdgeDistance(x: number, y: number): number {
    // Triangle vertices
    const v1x = this.centerX;
    const v1y = this.centerY - this.size / 2; // Top
    const v2x = this.centerX - this.size / 2;
    const v2y = this.centerY + this.size / 2; // Bottom left
    const v3x = this.centerX + this.size / 2;
    const v3y = this.centerY + this.size / 2; // Bottom right

    // Calculate distance to each edge
    const distToEdge1 = this.distanceToLineSegment(x, y, v1x, v1y, v2x, v2y);
    const distToEdge2 = this.distanceToLineSegment(x, y, v2x, v2y, v3x, v3y);
    const distToEdge3 = this.distanceToLineSegment(x, y, v3x, v3y, v1x, v1y);

    const minDist = Math.min(distToEdge1, distToEdge2, distToEdge3);

    if (this.contains(x, y)) {
      return minDist; // Positive inside
    } else {
      return -minDist; // Negative outside
    }
  }

  /**
   * Calculate distance from point to line segment
   */
  private distanceToLineSegment(
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq === 0) {
      // Line segment is a point
      const dx2 = px - x1;
      const dy2 = py - y1;
      return Math.sqrt(dx2 * dx2 + dy2 * dy2);
    }

    // Project point onto line segment
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;

    // Distance from point to projection
    const dx2 = px - projX;
    const dy2 = py - projY;
    return Math.sqrt(dx2 * dx2 + dy2 * dy2);
  }
}

