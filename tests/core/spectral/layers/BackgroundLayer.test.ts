import { describe, it, expect } from 'vitest';
import { BackgroundLayer } from '../../../../src/core/spectral/layers/BackgroundLayer';
import { Grid } from '../../../../src/core/Grid';

describe('BackgroundLayer', () => {
  const grid = new Grid(50); // 50px cell size

  it('should have correct id and order', () => {
    const layer = new BackgroundLayer(grid);
    expect(layer.id).toBe('background');
    expect(layer.order).toBe(0);
  });

  it('should return tile filter for pixels on tiles', () => {
    const layer = new BackgroundLayer(grid);
    // Center of a cell (not on grid line)
    const filter = layer.getFilter(25, 25);
    expect(filter.getIntensity()).toBe(1.0);
  });

  it('should return line filter for pixels on grid lines', () => {
    const layer = new BackgroundLayer(grid);
    // On vertical grid line (x = 0, 50, 100, etc.)
    const filter1 = layer.getFilter(0, 25);
    expect(filter1.getIntensity()).toBe(0.6);

    // On horizontal grid line (y = 0, 50, 100, etc.)
    const filter2 = layer.getFilter(25, 0);
    expect(filter2.getIntensity()).toBe(0.6);
  });

  it('should detect grid lines with custom line width', () => {
    const layer = new BackgroundLayer(grid, 2.0); // 2px line width
    // Near vertical grid line (within 1px of x=0)
    const filter = layer.getFilter(1, 25);
    expect(filter.getIntensity()).toBe(0.6);
  });

  it('should provide access to tile and line filters', () => {
    const layer = new BackgroundLayer(grid);
    expect(layer.getTileFilter().getIntensity()).toBe(1.0);
    expect(layer.getLineFilter().getIntensity()).toBe(0.6);
  });

  it('should handle pixels at grid intersections', () => {
    const layer = new BackgroundLayer(grid);
    // At intersection of vertical and horizontal lines
    const filter = layer.getFilter(0, 0);
    expect(filter.getIntensity()).toBe(0.6);
  });
});

