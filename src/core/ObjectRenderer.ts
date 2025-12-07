import { GameObject } from './GameObject';
import { Grid } from './Grid';

export class ObjectRenderer {
  private grid: Grid;

  constructor(grid: Grid) {
    this.grid = grid;
  }

  /**
   * Render a game object
   * Objects are positioned at their top-left grid cell and span their gridSize
   */
  public renderObject(graphics: Phaser.GameObjects.Graphics, obj: GameObject, alpha: number = 1.0): void {
    const pixelSize = obj.getPixelSize(this.grid.cellSize);
    // Position at top-left of first grid cell (gridX, gridY)
    const worldPos = this.grid.gridToWorld(obj.gridX, obj.gridY);
    const centerX = worldPos.x + pixelSize.width / 2;
    const centerY = worldPos.y + pixelSize.height / 2;
    
    graphics.fillStyle(obj.color, alpha);
    graphics.lineStyle(2, 0x333333, alpha);

    switch (obj.type) {
      case 'square':
      case 'largeSquare':
        graphics.fillRect(worldPos.x, worldPos.y, pixelSize.width, pixelSize.height);
        graphics.strokeRect(worldPos.x, worldPos.y, pixelSize.width, pixelSize.height);
        break;

      case 'circle':
        graphics.fillCircle(centerX, centerY, Math.min(pixelSize.width, pixelSize.height) / 2);
        graphics.strokeCircle(centerX, centerY, Math.min(pixelSize.width, pixelSize.height) / 2);
        break;

      case 'triangle':
        this.drawTriangle(
          graphics,
          centerX,
          centerY,
          pixelSize.width,
          pixelSize.height,
          obj.color,
          alpha
        );
        break;

      case 'rectangle':
        graphics.fillRect(worldPos.x, worldPos.y, pixelSize.width, pixelSize.height);
        graphics.strokeRect(worldPos.x, worldPos.y, pixelSize.width, pixelSize.height);
        break;
    }
  }

  /**
   * Render held object at mouse position
   */
  public renderHeldObject(
    graphics: Phaser.GameObjects.Graphics,
    obj: GameObject,
    mouseX: number,
    mouseY: number
  ): void {
    const pixelSize = obj.getPixelSize(this.grid.cellSize);
    graphics.fillStyle(obj.color, 1.0);
    graphics.lineStyle(2, 0x333333, 1.0);

    switch (obj.type) {
      case 'square':
      case 'largeSquare':
        graphics.fillRect(
          mouseX - pixelSize.width / 2,
          mouseY - pixelSize.height / 2,
          pixelSize.width,
          pixelSize.height
        );
        graphics.strokeRect(
          mouseX - pixelSize.width / 2,
          mouseY - pixelSize.height / 2,
          pixelSize.width,
          pixelSize.height
        );
        break;

      case 'circle':
        const radius = Math.min(pixelSize.width, pixelSize.height) / 2;
        graphics.fillCircle(mouseX, mouseY, radius);
        graphics.strokeCircle(mouseX, mouseY, radius);
        break;

      case 'triangle':
        this.drawTriangle(graphics, mouseX, mouseY, pixelSize.width, pixelSize.height, obj.color, 1.0);
        break;

      case 'rectangle':
        graphics.fillRect(
          mouseX - pixelSize.width / 2,
          mouseY - pixelSize.height / 2,
          pixelSize.width,
          pixelSize.height
        );
        graphics.strokeRect(
          mouseX - pixelSize.width / 2,
          mouseY - pixelSize.height / 2,
          pixelSize.width,
          pixelSize.height
        );
        break;
    }
  }

  /**
   * Draw a triangle
   */
  private drawTriangle(
    graphics: Phaser.GameObjects.Graphics,
    centerX: number,
    centerY: number,
    width: number,
    height: number,
    color: number,
    alpha: number
  ): void {
    const topX = centerX;
    const topY = centerY - height / 2;
    const bottomLeftX = centerX - width / 2;
    const bottomLeftY = centerY + height / 2;
    const bottomRightX = centerX + width / 2;
    const bottomRightY = centerY + height / 2;

    graphics.fillStyle(color, alpha);
    graphics.lineStyle(2, 0x333333, alpha);

    graphics.beginPath();
    graphics.moveTo(topX, topY);
    graphics.lineTo(bottomLeftX, bottomLeftY);
    graphics.lineTo(bottomRightX, bottomRightY);
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();
  }
}

