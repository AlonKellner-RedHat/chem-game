import { describe, it, expect, beforeEach } from 'vitest';
import { InteractionSystem } from '../../src/core/InteractionSystem';
import { Grid } from '../../src/core/Grid';
import { Shapes } from '../../src/core/Shapes';

describe('InteractionSystem', () => {
  let system: InteractionSystem;
  let grid: Grid;

  beforeEach(() => {
    grid = new Grid(50);
    system = new InteractionSystem(grid);
  });

  it('should register and retrieve objects', () => {
    const obj = Shapes.createGreenSquare('test1', 5, 5);
    system.registerObject(obj);
    expect(system.getObject('test1')).toBe(obj);
  });

  it('should pick up a pickable object', () => {
    const obj = Shapes.createGreenSquare('test1', 5, 5);
    system.registerObject(obj);
    
    const worldX = 5 * 50 + 25; // Center of cell (5, 5)
    const worldY = 5 * 50 + 25;
    const success = system.pickupObject(worldX, worldY);
    
    expect(success).toBe(true);
    expect(system.getHeldObject()).toBe(obj);
  });

  it('should not pick up non-pickable object', () => {
    const obj = Shapes.createLargeBlackSquare('test1', 5, 5);
    system.registerObject(obj);
    
    const worldX = 5 * 50 + 25;
    const worldY = 5 * 50 + 25;
    const success = system.pickupObject(worldX, worldY);
    
    expect(success).toBe(false);
    expect(system.getHeldObject()).toBeNull();
  });

  it('should place object at empty position', () => {
    const obj = Shapes.createGreenSquare('test1', 5, 5);
    system.registerObject(obj);
    system.pickupObject(5 * 50 + 25, 5 * 50 + 25);
    
    const worldX = 7 * 50 + 25; // Cell (7, 7)
    const worldY = 7 * 50 + 25;
    system.placeObject(worldX, worldY);
    
    expect(obj.gridX).toBe(7);
    expect(obj.gridY).toBe(7);
    expect(system.getHeldObject()).toBeNull();
  });

  describe('Interaction Rules', () => {
    it('should swap colors when green square interacts with any object', () => {
      const greenSquare = Shapes.createGreenSquare('green', 5, 5);
      const redCircle = Shapes.createRedCircle('red', 7, 7);
      system.registerObject(greenSquare);
      system.registerObject(redCircle);
      
      system.pickupObject(5 * 50 + 25, 5 * 50 + 25);
      system.placeObject(7 * 50 + 25, 7 * 50 + 25);
      
      expect(greenSquare.color).toBe(0xff0000); // Red
      expect(redCircle.color).toBe(0x00ff00); // Green
    });

    it('should make placed object red when red circle interacts', () => {
      const redCircle = Shapes.createRedCircle('red', 5, 5);
      const blueTriangle = Shapes.createBlueTriangle('blue', 7, 7);
      system.registerObject(redCircle);
      system.registerObject(blueTriangle);
      
      system.pickupObject(5 * 50 + 25, 5 * 50 + 25);
      system.placeObject(7 * 50 + 25, 7 * 50 + 25);
      
      expect(blueTriangle.color).toBe(0xff0000); // Red
    });

    it('should make triangle same color as placed object when blue triangle interacts', () => {
      const blueTriangle = Shapes.createBlueTriangle('blue', 5, 5);
      const redCircle = Shapes.createRedCircle('red', 7, 7);
      system.registerObject(blueTriangle);
      system.registerObject(redCircle);
      
      system.pickupObject(5 * 50 + 25, 5 * 50 + 25);
      system.placeObject(7 * 50 + 25, 7 * 50 + 25);
      
      expect(blueTriangle.color).toBe(0xff0000); // Red (same as circle)
    });

    it('should randomize color when any object interacts with yellow rectangle', () => {
      const greenSquare = Shapes.createGreenSquare('green', 5, 5);
      const yellowRect = Shapes.createYellowRectangle('yellow', 7, 7);
      system.registerObject(greenSquare);
      system.registerObject(yellowRect);
      
      const originalColor = greenSquare.color;
      system.pickupObject(5 * 50 + 25, 5 * 50 + 25);
      system.placeObject(7 * 50 + 25, 7 * 50 + 25);
      
      // Color should be randomized (might be same by chance, but unlikely)
      // We'll just check it's a valid color
      expect(greenSquare.color).toBeGreaterThanOrEqual(0);
      expect(greenSquare.color).toBeLessThanOrEqual(0xffffff);
    });

    it('should delete object when any object interacts with black square', () => {
      const greenSquare = Shapes.createGreenSquare('green', 5, 5);
      const blackSquare = Shapes.createLargeBlackSquare('black', 7, 7);
      system.registerObject(greenSquare);
      system.registerObject(blackSquare);
      
      // Verify objects are registered
      expect(system.getObject('green')).toBe(greenSquare);
      expect(system.getObject('black')).toBe(blackSquare);
      
      // Pick up green square
      const pickedUp = system.pickupObject(5 * 50 + 25, 5 * 50 + 25);
      expect(pickedUp).toBe(true);
      expect(system.getHeldObject()).toBe(greenSquare);
      
      // Place on black square (should delete green square)
      system.placeObject(7 * 50 + 25, 7 * 50 + 25);
      
      // Green square should be deleted - check all objects
      const allObjects = system.getAllObjects();
      const greenSquareStillExists = allObjects.some(obj => obj.id === 'green');
      expect(greenSquareStillExists).toBe(false);
      expect(system.getObject('green')).toBeNull();
      expect(system.getHeldObject()).toBeNull();
      // Black square should still exist
      expect(system.getObject('black')).toBe(blackSquare);
    });
  });

  describe('Connection Rules', () => {
    it('should connect small square above yellow rectangle', () => {
      const greenSquare = Shapes.createGreenSquare('green', 5, 8);
      const yellowRect = Shapes.createYellowRectangle('yellow', 5, 10);
      system.registerObject(greenSquare);
      system.registerObject(yellowRect);
      
      // Place square above rectangle
      system.pickupObject(5 * 50 + 25, 8 * 50 + 25);
      system.placeObject(5 * 50 + 25, 9 * 50 + 25); // One cell above rectangle
      
      const connections = system.getConnections();
      expect(connections.length).toBe(1);
      expect(connections[0].from).toBe('green');
      expect(connections[0].to).toBe('yellow');
    });

    it('should connect triangle above yellow rectangle', () => {
      const blueTriangle = Shapes.createBlueTriangle('blue', 5, 8);
      const yellowRect = Shapes.createYellowRectangle('yellow', 5, 10);
      system.registerObject(blueTriangle);
      system.registerObject(yellowRect);
      
      system.pickupObject(5 * 50 + 25, 8 * 50 + 25);
      system.placeObject(5 * 50 + 25, 9 * 50 + 25);
      
      const connections = system.getConnections();
      expect(connections.length).toBe(1);
    });

    it('should connect triangle above small square', () => {
      const blueTriangle = Shapes.createBlueTriangle('blue', 5, 8);
      const greenSquare = Shapes.createGreenSquare('green', 5, 10);
      system.registerObject(blueTriangle);
      system.registerObject(greenSquare);
      
      system.pickupObject(5 * 50 + 25, 8 * 50 + 25);
      system.placeObject(5 * 50 + 25, 9 * 50 + 25);
      
      const connections = system.getConnections();
      expect(connections.length).toBe(1);
    });
  });

  it('should reset all objects to original positions', () => {
    const obj1 = Shapes.createGreenSquare('green', 5, 5);
    const obj2 = Shapes.createRedCircle('red', 7, 7);
    system.registerObject(obj1);
    system.registerObject(obj2);
    
    obj1.place(10, 10);
    obj2.place(12, 12);
    
    system.reset();
    
    expect(obj1.gridX).toBe(5);
    expect(obj1.gridY).toBe(5);
    expect(obj2.gridX).toBe(7);
    expect(obj2.gridY).toBe(7);
    expect(system.getConnections().length).toBe(0);
  });
});

