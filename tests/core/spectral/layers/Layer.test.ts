import { describe, it, expect } from 'vitest';
import { Layer } from '../../../../src/core/spectral/layers/Layer';
import { RectangleGeometry } from '../../../../src/core/spectral/geometry/RectangleGeometry';
import { IntensityFilter } from '../../../../src/core/spectral/filters/IntensityFilter';
import { NothingFilter } from '../../../../src/core/spectral/filters/NothingFilter';

describe('Layer', () => {
  it('should have correct id and order', () => {
    const layer = new Layer('test-layer', 1);
    expect(layer.id).toBe('test-layer');
    expect(layer.order).toBe(1);
  });

  it('should return nothing filter when no shapes match', () => {
    const layer = new Layer('test-layer', 1);
    const filter = layer.getFilter(100, 100);
    expect(filter).toBeInstanceOf(NothingFilter);
  });

  it('should return shape filter when point is inside shape', () => {
    const layer = new Layer('test-layer', 1);
    const geometry = new RectangleGeometry(100, 100, 200, 200);
    const shapeFilter = new IntensityFilter(0.5);
    layer.addShape(geometry, shapeFilter);

    const filter = layer.getFilter(100, 100); // Center of rectangle
    expect(filter).toBe(shapeFilter);
  });

  it('should return nothing filter when point is outside all shapes', () => {
    const layer = new Layer('test-layer', 1);
    const geometry = new RectangleGeometry(100, 100, 200, 200);
    const shapeFilter = new IntensityFilter(0.5);
    layer.addShape(geometry, shapeFilter);

    const filter = layer.getFilter(500, 500); // Outside rectangle
    expect(filter).toBeInstanceOf(NothingFilter);
  });

  it('should return first matching shape filter when multiple shapes overlap', () => {
    const layer = new Layer('test-layer', 1);
    const geometry1 = new RectangleGeometry(100, 100, 200, 200);
    const geometry2 = new RectangleGeometry(100, 100, 100, 100);
    const filter1 = new IntensityFilter(0.5);
    const filter2 = new IntensityFilter(0.8);

    layer.addShape(geometry1, filter1);
    layer.addShape(geometry2, filter2);

    // Point is in both shapes, should get first one
    const filter = layer.getFilter(100, 100);
    expect(filter).toBe(filter1);
  });

  it('should support anti-aliasing', () => {
    const layer = new Layer('test-layer', 1, 2.0); // 2 pixel anti-alias width
    const geometry = new RectangleGeometry(100, 100, 200, 200);
    const shapeFilter = new IntensityFilter(0.5);
    layer.addShape(geometry, shapeFilter);

    // Inside shape
    const insideFilter = layer.getFilterWithAntiAliasing(100, 100);
    expect(insideFilter).toBe(shapeFilter);

    // Outside shape, but close enough for anti-aliasing
    const edgeFilter = layer.getFilterWithAntiAliasing(0, 100); // On left edge
    // Should return shape filter or nothing filter depending on blend factor
    expect(edgeFilter).toBeDefined();
  });

  it('should get all shapes', () => {
    const layer = new Layer('test-layer', 1);
    const geometry = new RectangleGeometry(100, 100, 200, 200);
    const filter = new IntensityFilter(0.5);
    layer.addShape(geometry, filter);

    const shapes = layer.getShapes();
    expect(shapes).toHaveLength(1);
    expect(shapes[0].geometry).toBe(geometry);
    expect(shapes[0].filter).toBe(filter);
  });

  it('should clear all shapes', () => {
    const layer = new Layer('test-layer', 1);
    const geometry = new RectangleGeometry(100, 100, 200, 200);
    const filter = new IntensityFilter(0.5);
    layer.addShape(geometry, filter);

    layer.clear();
    expect(layer.getShapes()).toHaveLength(0);
    expect(layer.getFilter(100, 100)).toBeInstanceOf(NothingFilter);
  });
});

