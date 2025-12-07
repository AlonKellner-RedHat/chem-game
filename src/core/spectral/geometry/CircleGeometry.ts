import { ShapeGeometry } from './ShapeGeometry';

/**
 * CircleGeometry - Circle shape geometry
 */
export class CircleGeometry implements ShapeGeometry {
  readonly id: string;
  private readonly centerX: number;
  private readonly centerY: number;
  private readonly radius: number;

  constructor(centerX: number, centerY: number, radius: number, id?: string) {
    this.centerX = centerX;
    this.centerY = centerY;
    this.radius = radius;
    this.id = id || 'circle';
  }

  contains(x: number, y: number): boolean {
    const dx = x - this.centerX;
    const dy = y - this.centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance <= this.radius;
  }

  getEdgeDistance(x: number, y: number): number {
    const dx = x - this.centerX;
    const dy = y - this.centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return this.radius - distance; // Positive inside, negative outside
  }
}

