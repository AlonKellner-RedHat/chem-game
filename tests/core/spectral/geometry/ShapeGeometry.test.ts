import { describe, it, expect } from 'vitest';
import { ShapeGeometry } from '../../../../src/core/spectral/geometry/ShapeGeometry';

describe('ShapeGeometry interface', () => {
  it('should have required methods', () => {
    const geometry: ShapeGeometry = {
      id: 'test-shape',
      contains: (x: number, y: number) => x >= 0 && x <= 100 && y >= 0 && y <= 100,
      getEdgeDistance: (x: number, y: number) => {
        const distToLeft = x;
        const distToRight = 100 - x;
        const distToTop = y;
        const distToBottom = 100 - y;
        return Math.min(distToLeft, distToRight, distToTop, distToBottom);
      },
    };

    expect(geometry.id).toBe('test-shape');
    expect(geometry.contains).toBeDefined();
    expect(geometry.getEdgeDistance).toBeDefined();
  });

  it('should correctly identify points inside shape', () => {
    const geometry: ShapeGeometry = {
      id: 'test',
      contains: (x: number, y: number) => x >= 0 && x <= 100 && y >= 0 && y <= 100,
      getEdgeDistance: () => 1,
    };

    expect(geometry.contains(50, 50)).toBe(true);
    expect(geometry.contains(0, 0)).toBe(true);
    expect(geometry.contains(100, 100)).toBe(true);
    expect(geometry.contains(150, 50)).toBe(false);
    expect(geometry.contains(50, 150)).toBe(false);
  });

  it('should calculate edge distance correctly', () => {
    const geometry: ShapeGeometry = {
      id: 'test',
      contains: (x: number, y: number) => x >= 0 && x <= 100 && y >= 0 && y <= 100,
      getEdgeDistance: (x: number, y: number) => {
        const distToLeft = x;
        const distToRight = 100 - x;
        const distToTop = y;
        const distToBottom = 100 - y;
        return Math.min(distToLeft, distToRight, distToTop, distToBottom);
      },
    };

    // Center point
    expect(geometry.getEdgeDistance(50, 50)).toBe(50);

    // Edge point
    expect(geometry.getEdgeDistance(0, 50)).toBe(0);

    // Corner point
    expect(geometry.getEdgeDistance(0, 0)).toBe(0);

    // Outside point (should be negative)
    expect(geometry.getEdgeDistance(150, 50)).toBeLessThan(0);
  });
});

