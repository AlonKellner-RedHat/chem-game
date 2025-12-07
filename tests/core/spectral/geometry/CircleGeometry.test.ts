import { describe, it, expect } from 'vitest';
import { CircleGeometry } from '../../../../src/core/spectral/geometry/CircleGeometry';

describe('CircleGeometry', () => {
  it('should correctly identify points inside circle', () => {
    const circle = new CircleGeometry(100, 100, 50);

    // Center
    expect(circle.contains(100, 100)).toBe(true);
    // On edge
    expect(circle.contains(150, 100)).toBe(true);
    expect(circle.contains(100, 150)).toBe(true);
    // Inside
    expect(circle.contains(120, 100)).toBe(true);
    // Outside
    expect(circle.contains(200, 100)).toBe(false);
    expect(circle.contains(100, 200)).toBe(false);
  });

  it('should calculate edge distance correctly', () => {
    const circle = new CircleGeometry(100, 100, 50);

    // Center point (50 units from edge)
    expect(circle.getEdgeDistance(100, 100)).toBe(50);

    // On edge
    expect(circle.getEdgeDistance(150, 100)).toBeCloseTo(0, 1);

    // Outside point
    const outsideDist = circle.getEdgeDistance(200, 100);
    expect(outsideDist).toBeLessThan(0);
    expect(Math.abs(outsideDist)).toBeCloseTo(50);
  });

  it('should support custom id', () => {
    const circle = new CircleGeometry(100, 100, 50, 'custom-circle');
    expect(circle.id).toBe('custom-circle');
  });
});

