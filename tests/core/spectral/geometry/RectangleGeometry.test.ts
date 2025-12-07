import { describe, it, expect } from 'vitest';
import { RectangleGeometry } from '../../../../src/core/spectral/geometry/RectangleGeometry';

describe('RectangleGeometry', () => {
  it('should correctly identify points inside rectangle', () => {
    const rect = new RectangleGeometry(100, 100, 200, 200);

    // Center
    expect(rect.contains(100, 100)).toBe(true);
    // Corners
    expect(rect.contains(0, 0)).toBe(true);
    expect(rect.contains(200, 200)).toBe(true);
    // Edges
    expect(rect.contains(0, 100)).toBe(true);
    expect(rect.contains(100, 0)).toBe(true);
    // Outside
    expect(rect.contains(250, 100)).toBe(false);
    expect(rect.contains(100, 250)).toBe(false);
  });

  it('should calculate edge distance correctly', () => {
    const rect = new RectangleGeometry(100, 100, 200, 200);

    // Center point (50 units from all edges)
    expect(rect.getEdgeDistance(100, 100)).toBe(100);

    // Edge point
    expect(rect.getEdgeDistance(0, 100)).toBe(0);

    // Outside point
    const outsideDist = rect.getEdgeDistance(250, 100);
    expect(outsideDist).toBeLessThan(0);
    expect(Math.abs(outsideDist)).toBeCloseTo(50);
  });

  it('should support custom id', () => {
    const rect = new RectangleGeometry(100, 100, 200, 200, 'custom-rect');
    expect(rect.id).toBe('custom-rect');
  });
});

