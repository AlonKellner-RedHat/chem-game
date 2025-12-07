import { GameObject } from './GameObject';
import { Point } from '../types';

export class Shapes {
  /**
   * Create a green square (small - 1x1 grid)
   * Watches cells above and below for connections (has both top and bottom edges)
   */
  static createGreenSquare(id: string, gridX: number, gridY: number): GameObject {
    const watchedPositions: Point[] = [
      { x: 0, y: -1 }, // Watches cell directly above (bottom edge connects to top edge)
      { x: 0, y: 1 }   // Watches cell directly below (top edge connects to bottom edge)
    ];
    return new GameObject(id, 'square', 0x00ff00, gridX, gridY, true, { width: 1, height: 1 }, watchedPositions);
  }

  /**
   * Create a magenta square (small - 1x1 grid)
   * Watches cells above and below for connections (has both top and bottom edges)
   * Has the same interaction logic as the green square (swaps colors)
   */
  static createMagentaSquare(id: string, gridX: number, gridY: number): GameObject {
    const watchedPositions: Point[] = [
      { x: 0, y: -1 }, // Watches cell directly above (bottom edge connects to top edge)
      { x: 0, y: 1 }   // Watches cell directly below (top edge connects to bottom edge)
    ];
    return new GameObject(id, 'square', 0xff00ff, gridX, gridY, true, { width: 1, height: 1 }, watchedPositions);
  }

  /**
   * Create a red circle (1x1 grid)
   */
  static createRedCircle(id: string, gridX: number, gridY: number): GameObject {
    return new GameObject(id, 'circle', 0xff0000, gridX, gridY, true, { width: 1, height: 1 });
  }

  /**
   * Create a blue triangle (1x1 grid)
   * Watches the cell directly below for connections
   */
  static createBlueTriangle(id: string, gridX: number, gridY: number): GameObject {
    const watchedPositions: Point[] = [{ x: 0, y: 1 }]; // Watches cell directly below
    return new GameObject(id, 'triangle', 0x0000ff, gridX, gridY, true, { width: 1, height: 1 }, watchedPositions);
  }

  /**
   * Create a yellow rectangle (tall - takes 1x2 grid cells)
   * Watches the cell directly below it for connections
   */
  static createYellowRectangle(id: string, gridX: number, gridY: number): GameObject {
    const watchedPositions: Point[] = [{ x: 0, y: 1 }]; // Watches cell directly below
    return new GameObject(id, 'rectangle', 0xffff00, gridX, gridY, true, { width: 1, height: 2 }, watchedPositions);
  }

  /**
   * Create a large black square (not pickable - takes 2x2 grid cells)
   */
  static createLargeBlackSquare(id: string, gridX: number, gridY: number): GameObject {
    return new GameObject(id, 'largeSquare', 0x000000, gridX, gridY, false, { width: 2, height: 2 });
  }
}

