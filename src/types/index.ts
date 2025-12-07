export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  min: Point;
  max: Point;
}

export type ShapeType = 'square' | 'circle' | 'triangle' | 'rectangle' | 'largeSquare';

export type ObjectColor = number; // Phaser color value

export interface Connection {
  from: string; // object id
  to: string; // object id
}
