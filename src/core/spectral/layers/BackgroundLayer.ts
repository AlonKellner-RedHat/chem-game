import { Layer } from './Layer';
import { IntensityFilter } from '../filters/IntensityFilter';
import { Grid } from '../../Grid';

/**
 * BackgroundLayer - Special layer for background with grid tiles and lines
 * Tiles use 100% intensity, grid lines use 60% intensity
 */
export class BackgroundLayer extends Layer {
  private readonly grid: Grid;
  private readonly tileFilter: IntensityFilter;
  private readonly lineFilter: IntensityFilter;
  private readonly lineWidth: number;

  constructor(grid: Grid, lineWidth: number = 1.0) {
    super('background', 0); // Background is always layer 0
    this.grid = grid;
    this.tileFilter = new IntensityFilter(1.0, 'background-tile');
    this.lineFilter = new IntensityFilter(0.6, 'background-line');
    this.lineWidth = lineWidth;
  }

  /**
   * Get filter for a pixel based on whether it's on a grid line or tile
   * @param x X coordinate (world space)
   * @param y Y coordinate (world space)
   * @returns IntensityFilter for tile (100%) or line (60%)
   */
  getFilter(x: number, y: number): IntensityFilter {
    if (this.isOnGridLine(x, y)) {
      return this.lineFilter;
    } else {
      return this.tileFilter;
    }
  }

  /**
   * Check if a pixel is on a grid line
   * @param x X coordinate (world space)
   * @param y Y coordinate (world space)
   * @returns true if pixel is on or near a grid line
   */
  private isOnGridLine(x: number, y: number): boolean {
    const cellSize = this.grid.cellSize;
    const halfLineWidth = this.lineWidth / 2;

    // Check if near vertical grid line
    const gridX = Math.floor(x / cellSize) * cellSize;
    const distToVerticalLine = Math.min(
      Math.abs(x - gridX),
      Math.abs(x - (gridX + cellSize))
    );
    if (distToVerticalLine <= halfLineWidth) {
      return true;
    }

    // Check if near horizontal grid line
    const gridY = Math.floor(y / cellSize) * cellSize;
    const distToHorizontalLine = Math.min(
      Math.abs(y - gridY),
      Math.abs(y - (gridY + cellSize))
    );
    if (distToHorizontalLine <= halfLineWidth) {
      return true;
    }

    return false;
  }

  /**
   * Get tile filter (100% intensity)
   */
  getTileFilter(): IntensityFilter {
    return this.tileFilter;
  }

  /**
   * Get line filter (60% intensity)
   */
  getLineFilter(): IntensityFilter {
    return this.lineFilter;
  }
}

