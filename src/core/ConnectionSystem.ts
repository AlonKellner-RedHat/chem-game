import { Connection } from '../types';
import { GameObject } from './GameObject';
import { Grid } from './Grid';

export class ConnectionSystem {
  private grid: Grid;

  constructor(grid: Grid) {
    this.grid = grid;
  }

  /**
   * Render all connections as small circles at the midpoint of connecting edges
   */
  public renderConnections(
    graphics: Phaser.GameObjects.Graphics,
    connections: Connection[],
    objects: Map<string, GameObject>
  ): void {
    for (const conn of connections) {
      const fromObj = objects.get(conn.from);
      const toObj = objects.get(conn.to);

      if (!fromObj || !toObj) continue;

      // Get connecting edge positions
      const edgePositions = this.getConnectingEdgePositions(fromObj, toObj);
      if (!edgePositions) continue;

      // Calculate midpoint of the connecting edge
      const midX = (edgePositions.fromX + edgePositions.toX) / 2;
      const midY = (edgePositions.fromY + edgePositions.toY) / 2;
      const radius = 8; // Circle radius

      // Draw bright cyan circle with glow effect
      // Outer glow (larger, semi-transparent)
      graphics.fillStyle(0x00ffff, 0.4);
      graphics.fillCircle(midX, midY, radius + 3);

      // Main bright circle (fully opaque)
      graphics.fillStyle(0x00ffff, 1.0);
      graphics.fillCircle(midX, midY, radius);

      // Add a darker outline for better visibility
      graphics.lineStyle(2, 0x0088cc, 1.0);
      graphics.strokeCircle(midX, midY, radius);
    }
  }

  /**
   * Get the connecting edge positions between two objects
   * Returns the edge points where they connect
   */
  private getConnectingEdgePositions(
    obj1: GameObject,
    obj2: GameObject
  ): { fromX: number; fromY: number; toX: number; toY: number } | null {
    const cellSize = this.grid.cellSize;
    const obj1PixelSize = obj1.getPixelSize(cellSize);
    const obj2PixelSize = obj2.getPixelSize(cellSize);
    
    const obj1World = this.grid.gridToWorld(obj1.gridX, obj1.gridY);
    const obj2World = this.grid.gridToWorld(obj2.gridX, obj2.gridY);
    
    // Determine which edges connect
    // obj1 is above obj2 (obj1's bottom connects to obj2's top)
    if (obj1.gridY < obj2.gridY && obj1.gridX === obj2.gridX) {
      const midX = obj1World.x + obj1PixelSize.width / 2;
      return {
        fromX: midX,
        fromY: obj1World.y + obj1PixelSize.height, // Bottom of obj1
        toX: midX,
        toY: obj2World.y, // Top of obj2
      };
    }
    
    // obj2 is above obj1 (obj2's bottom connects to obj1's top)
    if (obj2.gridY < obj1.gridY && obj2.gridX === obj1.gridX) {
      const midX = obj2World.x + obj2PixelSize.width / 2;
      return {
        fromX: midX,
        fromY: obj2World.y + obj2PixelSize.height, // Bottom of obj2
        toX: midX,
        toY: obj1World.y, // Top of obj1
      };
    }
    
    // Default: center to center (fallback)
    return {
      fromX: obj1World.x + obj1PixelSize.width / 2,
      fromY: obj1World.y + obj1PixelSize.height / 2,
      toX: obj2World.x + obj2PixelSize.width / 2,
      toY: obj2World.y + obj2PixelSize.height / 2,
    };
  }

}

