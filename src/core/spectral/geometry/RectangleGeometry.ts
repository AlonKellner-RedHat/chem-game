import { ShapeGeometry } from './ShapeGeometry';

/**
 * RectangleGeometry - Rectangle/square shape geometry
 */
export class RectangleGeometry implements ShapeGeometry {
  readonly id: string;
  private readonly centerX: number;
  private readonly centerY: number;
  private readonly width: number;
  private readonly height: number;

  constructor(centerX: number, centerY: number, width: number, height: number, id?: string) {
    this.centerX = centerX;
    this.centerY = centerY;
    this.width = width;
    this.height = height;
    this.id = id || 'rectangle';
  }

  contains(x: number, y: number): boolean {
    const halfWidth = this.width / 2;
    const halfHeight = this.height / 2;
    return (
      x >= this.centerX - halfWidth &&
      x <= this.centerX + halfWidth &&
      y >= this.centerY - halfHeight &&
      y <= this.centerY + halfHeight
    );
  }

  getEdgeDistance(x: number, y: number): number {
    const halfWidth = this.width / 2;
    const halfHeight = this.height / 2;
    
    const distToLeft = x - (this.centerX - halfWidth);
    const distToRight = (this.centerX + halfWidth) - x;
    const distToTop = y - (this.centerY - halfHeight);
    const distToBottom = (this.centerY + halfHeight) - y;

    // Inside: return minimum distance to any edge (positive)
    // Outside: return negative distance to nearest edge
    if (this.contains(x, y)) {
      return Math.min(distToLeft, distToRight, distToTop, distToBottom);
    } else {
      // Outside: calculate distance to nearest edge
      const dx = Math.max(this.centerX - halfWidth - x, x - (this.centerX + halfWidth), 0);
      const dy = Math.max(this.centerY - halfHeight - y, y - (this.centerY + halfHeight), 0);
      return -Math.sqrt(dx * dx + dy * dy);
    }
  }
}

