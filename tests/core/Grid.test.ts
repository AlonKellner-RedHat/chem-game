import { describe, it, expect } from 'vitest';
import { Grid } from '../../src/core/Grid';

describe('Grid', () => {
  it('should convert world coordinates to grid coordinates', () => {
    const grid = new Grid(50);
    const gridPos = grid.worldToGrid(125, 175);
    expect(gridPos.x).toBe(2);
    expect(gridPos.y).toBe(3);
  });

  it('should convert grid coordinates to world coordinates (center of cell)', () => {
    const grid = new Grid(50);
    const worldPos = grid.gridToWorld(2, 3);
    expect(worldPos.x).toBe(125); // 2 * 50 + 25
    expect(worldPos.y).toBe(175); // 3 * 50 + 25
  });

  it('should get all adjacent cells (8-directional)', () => {
    const grid = new Grid(50);
    const adjacent = grid.getAdjacentCells(5, 5);
    expect(adjacent.length).toBe(8);
    
    // Check all 8 directions
    const expected = [
      { x: 4, y: 4 }, // top-left
      { x: 5, y: 4 }, // top
      { x: 6, y: 4 }, // top-right
      { x: 4, y: 5 }, // left
      { x: 6, y: 5 }, // right
      { x: 4, y: 6 }, // bottom-left
      { x: 5, y: 6 }, // bottom
      { x: 6, y: 6 }, // bottom-right
    ];
    
    for (const expectedPos of expected) {
      expect(adjacent).toContainEqual(expectedPos);
    }
  });

  it('should get cell directly above', () => {
    const grid = new Grid(50);
    const above = grid.getCellAbove(5, 5);
    expect(above).toEqual({ x: 5, y: 4 });
  });
});
