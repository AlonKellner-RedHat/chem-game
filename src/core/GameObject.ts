import { Point, ShapeType, ObjectColor } from '../types';

export class GameObject {
  public id: string;
  public type: ShapeType;
  public color: ObjectColor;
  public gridX: number; // Top-left corner grid position
  public gridY: number; // Top-left corner grid position
  public isPickable: boolean;
  public originalPosition: Point;
  public originalColor: ObjectColor;
  public gridSize: { width: number; height: number }; // Size in grid cells (e.g., 1x1, 1x2, 2x2)
  public watchedPositions: Point[] = []; // Relative positions (dx, dy) that this object watches for interactions

  constructor(
    id: string,
    type: ShapeType,
    color: ObjectColor,
    gridX: number,
    gridY: number,
    isPickable: boolean = true,
    gridSize: { width: number; height: number } = { width: 1, height: 1 },
    watchedPositions: Point[] = []
  ) {
    this.id = id;
    this.type = type;
    this.color = color;
    this.gridX = gridX;
    this.gridY = gridY;
    this.isPickable = isPickable;
    this.originalPosition = { x: gridX, y: gridY };
    this.originalColor = color;
    this.gridSize = gridSize;
    this.watchedPositions = watchedPositions;
  }

  /**
   * Get pixel size based on grid size and cell size
   */
  public getPixelSize(cellSize: number): { width: number; height: number } {
    return {
      width: this.gridSize.width * cellSize,
      height: this.gridSize.height * cellSize,
    };
  }

  /**
   * Pick up the object (removes it from grid)
   */
  public pickup(): void {
    if (!this.isPickable) {
      throw new Error(`Object ${this.id} cannot be picked up`);
    }
  }

  /**
   * Place the object at a grid position
   */
  public place(gridX: number, gridY: number): void {
    this.gridX = gridX;
    this.gridY = gridY;
  }

  /**
   * Reset object to original position and color
   */
  public reset(): void {
    this.gridX = this.originalPosition.x;
    this.gridY = this.originalPosition.y;
    this.color = this.originalColor;
  }

  /**
   * Get all grid cells occupied by this object
   * Returns array of grid coordinates {x, y}
   */
  public getOccupiedCells(): Point[] {
    const cells: Point[] = [];
    for (let dx = 0; dx < this.gridSize.width; dx++) {
      for (let dy = 0; dy < this.gridSize.height; dy++) {
        cells.push({ x: this.gridX + dx, y: this.gridY + dy });
      }
    }
    return cells;
  }

  /**
   * Get all grid cells watched by this object (positions it can interact with)
   * Returns array of absolute grid coordinates {x, y}
   */
  public getWatchedCells(): Point[] {
    const watched: Point[] = [];
    for (const relativePos of this.watchedPositions) {
      watched.push({ x: this.gridX + relativePos.x, y: this.gridY + relativePos.y });
    }
    return watched;
  }

  /**
   * Check if a grid position is watched by this object
   * Returns the relative position if watched, null otherwise
   */
  public isWatchingPosition(gridX: number, gridY: number): Point | null {
    const relativeX = gridX - this.gridX;
    const relativeY = gridY - this.gridY;
    
    for (const watched of this.watchedPositions) {
      if (watched.x === relativeX && watched.y === relativeY) {
        return watched;
      }
    }
    return null;
  }

  /**
   * Check if a grid position is occupied by this object
   */
  public occupiesPosition(gridX: number, gridY: number): boolean {
    const occupied = this.getOccupiedCells();
    return occupied.some(cell => cell.x === gridX && cell.y === gridY);
  }
}

