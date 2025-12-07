import { describe, it, expect, beforeEach } from 'vitest';
import { InteractionSystem } from '../../src/core/InteractionSystem';
import { Grid } from '../../src/core/Grid';
import { Shapes } from '../../src/core/Shapes';

describe('GameFlow Integration Tests', () => {
  let system: InteractionSystem;
  let grid: Grid;

  beforeEach(() => {
    grid = new Grid(50);
    system = new InteractionSystem(grid);
  });

  it('should complete full pickup -> place -> interact flow', () => {
    const greenSquare = Shapes.createGreenSquare('green', 5, 5);
    const redCircle = Shapes.createRedCircle('red', 7, 7);
    system.registerObject(greenSquare);
    system.registerObject(redCircle);
    
    // Pick up green square
    const success1 = system.pickupObject(5 * 50 + 25, 5 * 50 + 25);
    expect(success1).toBe(true);
    expect(system.getHeldObject()).toBe(greenSquare);
    
    // Place on red circle (should swap colors)
    const success2 = system.placeObject(7 * 50 + 25, 7 * 50 + 25);
    expect(success2).toBe(true);
    expect(system.getHeldObject()).toBeNull();
    expect(greenSquare.color).toBe(0xff0000);
    expect(redCircle.color).toBe(0x00ff00);
  });

  it('should handle multiple interactions in sequence', () => {
    const greenSquare = Shapes.createGreenSquare('green', 5, 5);
    const redCircle = Shapes.createRedCircle('red', 7, 7);
    const blueTriangle = Shapes.createBlueTriangle('blue', 9, 9);
    system.registerObject(greenSquare);
    system.registerObject(redCircle);
    system.registerObject(blueTriangle);
    
    // First interaction: green square -> red circle (swap)
    system.pickupObject(5 * 50 + 25, 5 * 50 + 25);
    system.placeObject(7 * 50 + 25, 7 * 50 + 25);
    expect(greenSquare.color).toBe(0xff0000); // Now red
    expect(redCircle.color).toBe(0x00ff00); // Now green
    
    // Second interaction: blue triangle -> green square (now red after swap)
    // Blue triangle rule: triangle becomes same color as placed object
    // Green square is now red (0xff0000) and at position (7, 7) after the swap
    system.pickupObject(9 * 50 + 25, 9 * 50 + 25);
    system.placeObject(7 * 50 + 25, 7 * 50 + 25); // Place on square's new position
    // Triangle should become the same color as the square (which is now red)
    expect(blueTriangle.color).toBe(0xff0000); // Triangle becomes red (same as square)
  });

  it('should handle reset after multiple interactions', () => {
    const greenSquare = Shapes.createGreenSquare('green', 5, 5);
    const redCircle = Shapes.createRedCircle('red', 7, 7);
    system.registerObject(greenSquare);
    system.registerObject(redCircle);
    
    // Interact (swap colors)
    system.pickupObject(5 * 50 + 25, 5 * 50 + 25);
    system.placeObject(7 * 50 + 25, 7 * 50 + 25);
    expect(greenSquare.color).toBe(0xff0000); // Swapped to red
    expect(redCircle.color).toBe(0x00ff00); // Swapped to green
    
    // Reset (positions reset, but colors stay swapped - reset only resets positions)
    system.reset();
    
    // Positions should be reset
    expect(greenSquare.gridX).toBe(5);
    expect(greenSquare.gridY).toBe(5);
    expect(redCircle.gridX).toBe(7);
    expect(redCircle.gridY).toBe(7);
    // Note: Colors are not reset by the reset() method, only positions
  });

  it('should create and maintain connections correctly', () => {
    const greenSquare = Shapes.createGreenSquare('green', 5, 10);
    const yellowRect = Shapes.createYellowRectangle('yellow', 5, 12);
    system.registerObject(greenSquare);
    system.registerObject(yellowRect);
    
    // Place square above rectangle
    system.pickupObject(5 * 50 + 25, 10 * 50 + 25);
    system.placeObject(5 * 50 + 25, 11 * 50 + 25);
    
    let connections = system.getConnections();
    expect(connections.length).toBe(1);
    
    // Move square away (connection should remain until reset)
    system.pickupObject(5 * 50 + 25, 11 * 50 + 25);
    system.placeObject(7 * 50 + 25, 11 * 50 + 25);
    
    // Connection should still exist (system doesn't auto-remove)
    connections = system.getConnections();
    expect(connections.length).toBe(1);
    
    // Reset should clear connections
    system.reset();
    connections = system.getConnections();
    expect(connections.length).toBe(0);
  });
});

