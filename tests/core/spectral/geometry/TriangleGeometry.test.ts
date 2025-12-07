import { describe, it, expect } from 'vitest';
import { TriangleGeometry } from '../../../../src/core/spectral/geometry/TriangleGeometry';

describe('TriangleGeometry', () => {
  it('should correctly identify points inside triangle', () => {
    const triangle = new TriangleGeometry(100, 100, 200);

    // Center (should be inside)
    expect(triangle.contains(100, 100)).toBe(true);
    // Top vertex
    expect(triangle.contains(100, 0)).toBe(true);
    // Bottom left vertex
    expect(triangle.contains(0, 200)).toBe(true);
    // Bottom right vertex
    expect(triangle.contains(200, 200)).toBe(true);
    // Outside
    expect(triangle.contains(100, 250)).toBe(false);
    expect(triangle.contains(250, 100)).toBe(false);
  });

  it('should calculate edge distance correctly', () => {
    const triangle = new TriangleGeometry(100, 100, 200);

    // Center point (should be positive, inside)
    const centerDist = triangle.getEdgeDistance(100, 100);
    expect(centerDist).toBeGreaterThan(0);

    // Outside point (should be negative)
    const outsideDist = triangle.getEdgeDistance(100, 250);
    expect(outsideDist).toBeLessThan(0);
  });

  it('should support custom id', () => {
    const triangle = new TriangleGeometry(100, 100, 200, 'custom-triangle');
    expect(triangle.id).toBe('custom-triangle');
  });
});

