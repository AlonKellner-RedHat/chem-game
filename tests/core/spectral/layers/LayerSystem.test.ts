import { describe, it, expect } from 'vitest';
import { LayerSystem } from '../../../../src/core/spectral/layers/LayerSystem';
import { Layer } from '../../../../src/core/spectral/layers/Layer';
import { RectangleGeometry } from '../../../../src/core/spectral/geometry/RectangleGeometry';
import { IntensityFilter } from '../../../../src/core/spectral/filters/IntensityFilter';
import { NothingFilter } from '../../../../src/core/spectral/filters/NothingFilter';

describe('LayerSystem', () => {
  it('should add and retrieve layers', () => {
    const system = new LayerSystem();
    const layer1 = new Layer('layer1', 1);
    const layer2 = new Layer('layer2', 0);

    system.addLayer(layer1);
    system.addLayer(layer2);

    expect(system.getLayers()).toHaveLength(2);
    expect(system.getLayer('layer1')).toBe(layer1);
    expect(system.getLayer('layer2')).toBe(layer2);
  });

  it('should sort layers by order', () => {
    const system = new LayerSystem();
    const layer1 = new Layer('layer1', 2);
    const layer2 = new Layer('layer2', 0);
    const layer3 = new Layer('layer3', 1);

    system.addLayer(layer1);
    system.addLayer(layer2);
    system.addLayer(layer3);

    const layers = system.getLayers();
    expect(layers[0].order).toBe(0);
    expect(layers[1].order).toBe(1);
    expect(layers[2].order).toBe(2);
  });

  it('should return filters for pixel from all layers', () => {
    const system = new LayerSystem();
    const layer1 = new Layer('layer1', 0);
    const layer2 = new Layer('layer2', 1);

    const geometry1 = new RectangleGeometry(100, 100, 200, 200);
    const geometry2 = new RectangleGeometry(100, 100, 100, 100);
    const filter1 = new IntensityFilter(0.5);
    const filter2 = new IntensityFilter(0.8);

    layer1.addShape(geometry1, filter1);
    layer2.addShape(geometry2, filter2);

    system.addLayer(layer1);
    system.addLayer(layer2);

    const filters = system.getFiltersForPixel(100, 100);
    expect(filters).toHaveLength(2);
    expect(filters[0]).toBe(filter1); // First layer
    expect(filters[1]).toBe(filter2); // Second layer
  });

  it('should return nothing filters for pixels outside all shapes', () => {
    const system = new LayerSystem();
    const layer1 = new Layer('layer1', 0);
    const layer2 = new Layer('layer2', 1);

    const geometry = new RectangleGeometry(100, 100, 200, 200);
    const filter = new IntensityFilter(0.5);

    layer1.addShape(geometry, filter);
    layer2.addShape(geometry, filter);

    system.addLayer(layer1);
    system.addLayer(layer2);

    const filters = system.getFiltersForPixel(500, 500); // Outside all shapes
    expect(filters).toHaveLength(2);
    expect(filters[0]).toBeInstanceOf(NothingFilter);
    expect(filters[1]).toBeInstanceOf(NothingFilter);
  });

  it('should support anti-aliasing', () => {
    const system = new LayerSystem();
    const layer = new Layer('layer1', 0, 2.0);
    const geometry = new RectangleGeometry(100, 100, 200, 200);
    const filter = new IntensityFilter(0.5);

    layer.addShape(geometry, filter);
    system.addLayer(layer);

    const filters = system.getFiltersForPixel(0, 100, true); // On edge
    expect(filters).toHaveLength(1);
    expect(filters[0]).toBeDefined();
  });

  it('should clear all layers', () => {
    const system = new LayerSystem();
    const layer = new Layer('layer1', 0);
    system.addLayer(layer);

    system.clear();
    expect(system.getLayers()).toHaveLength(0);
  });
});

