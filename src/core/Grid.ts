import { Point } from '../types';
import { RGB } from './spectral/CIE';

export class Grid {
  public cellSize: number;

  constructor(cellSize: number = 50) {
    this.cellSize = cellSize;
  }

  /**
   * Convert world coordinates to grid coordinates
   */
  public worldToGrid(worldX: number, worldY: number): Point {
    return {
      x: Math.floor(worldX / this.cellSize),
      y: Math.floor(worldY / this.cellSize),
    };
  }

  /**
   * Convert grid coordinates to world coordinates (top-left of cell)
   */
  public gridToWorld(gridX: number, gridY: number): Point {
    return {
      x: gridX * this.cellSize,
      y: gridY * this.cellSize,
    };
  }

  /**
   * Convert grid coordinates to world coordinates (center of cell)
   */
  public gridToWorldCenter(gridX: number, gridY: number): Point {
    return {
      x: gridX * this.cellSize + this.cellSize / 2,
      y: gridY * this.cellSize + this.cellSize / 2,
    };
  }

  /**
   * Get all adjacent cells (8-directional)
   */
  public getAdjacentCells(gridX: number, gridY: number): Point[] {
    const adjacent: Point[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        adjacent.push({ x: gridX + dx, y: gridY + dy });
      }
    }
    return adjacent;
  }

  /**
   * Get the cell directly above (same column, lower Y)
   */
  public getCellAbove(gridX: number, gridY: number): Point | null {
    return { x: gridX, y: gridY - 1 };
  }

  /**
   * Check if a pixel is on a grid line
   * @param x X coordinate (world space)
   * @param y Y coordinate (world space)
   * @param lineWidth Width of grid line in pixels
   * @returns true if pixel is on or near a grid line
   */
  public isOnGridLine(x: number, y: number, lineWidth: number = 1.0): boolean {
    const halfLineWidth = lineWidth / 2;

    // Check if near vertical grid line
    const gridX = Math.floor(x / this.cellSize) * this.cellSize;
    const distToVerticalLine = Math.min(
      Math.abs(x - gridX),
      Math.abs(x - (gridX + this.cellSize))
    );
    if (distToVerticalLine <= halfLineWidth) {
      return true;
    }

    // Check if near horizontal grid line
    const gridY = Math.floor(y / this.cellSize) * this.cellSize;
    const distToHorizontalLine = Math.min(
      Math.abs(y - gridY),
      Math.abs(y - (gridY + this.cellSize))
    );
    if (distToHorizontalLine <= halfLineWidth) {
      return true;
    }

    return false;
  }

  /**
   * Render the grid using Phaser Graphics
   * @param graphics Phaser graphics object
   * @param bounds Bounds of visible area
   * @param backgroundColor Optional RGB color for grid tiles (background)
   * @param lineColor Optional RGB color for grid lines (same as background but dimmer)
   */
  public render(
    graphics: Phaser.GameObjects.Graphics,
    bounds: { min: Point; max: Point },
    backgroundColor?: RGB,
    lineColor?: RGB
  ): void {
    graphics.clear();

    // Convert RGB to Phaser color format (0xRRGGBB)
    const bgColor = backgroundColor
      ? (backgroundColor.r << 16) | (backgroundColor.g << 8) | backgroundColor.b
      : 0xffffff;
    const lnColor = lineColor
      ? (lineColor.r << 16) | (lineColor.g << 8) | lineColor.b
      : 0xcccccc;

    // Draw grid tiles (background)
    if (backgroundColor) {
      graphics.fillStyle(bgColor, 1.0);
      const startX = Math.floor(bounds.min.x / this.cellSize) * this.cellSize;
      const endX = Math.ceil(bounds.max.x / this.cellSize) * this.cellSize;
      const startY = Math.floor(bounds.min.y / this.cellSize) * this.cellSize;
      const endY = Math.ceil(bounds.max.y / this.cellSize) * this.cellSize;
      
      for (let x = startX; x < endX; x += this.cellSize) {
        for (let y = startY; y < endY; y += this.cellSize) {
          graphics.fillRect(x, y, this.cellSize, this.cellSize);
        }
      }
    }

    // Draw grid lines (same color as background but dimmer, or default gray)
    graphics.lineStyle(1, lnColor, lineColor ? 1.0 : 0.6);

    // Draw vertical lines
    const startX = Math.floor(bounds.min.x / this.cellSize) * this.cellSize;
    const endX = Math.ceil(bounds.max.x / this.cellSize) * this.cellSize;
    for (let x = startX; x <= endX; x += this.cellSize) {
      graphics.moveTo(x, bounds.min.y);
      graphics.lineTo(x, bounds.max.y);
    }

    // Draw horizontal lines
    const startY = Math.floor(bounds.min.y / this.cellSize) * this.cellSize;
    const endY = Math.ceil(bounds.max.y / this.cellSize) * this.cellSize;
    for (let y = startY; y <= endY; y += this.cellSize) {
      graphics.moveTo(bounds.min.x, y);
      graphics.lineTo(bounds.max.x, y);
    }

    graphics.strokePath();
  }
}

