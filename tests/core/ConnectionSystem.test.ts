import { describe, it, expect, beforeEach } from 'vitest';
import { ConnectionSystem } from '../../src/core/ConnectionSystem';
import { Grid } from '../../src/core/Grid';
import { GameObject } from '../../src/core/GameObject';
import { Connection } from '../../src/types';

describe('ConnectionSystem', () => {
  let system: ConnectionSystem;
  let grid: Grid;

  beforeEach(() => {
    grid = new Grid(50);
    system = new ConnectionSystem(grid);
  });

  it('should render connections between objects', () => {
    const obj1 = new GameObject('obj1', 'square', 0xff0000, 5, 5, true);
    const obj2 = new GameObject('obj2', 'circle', 0x00ff00, 7, 7, true);
    const objects = new Map<string, GameObject>();
    objects.set('obj1', obj1);
    objects.set('obj2', obj2);
    
    const connections: Connection[] = [
      { from: 'obj1', to: 'obj2' }
    ];
    
    // Create a mock graphics object
    const graphics = {
      lineStyle: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      strokePath: () => {},
    } as unknown as Phaser.GameObjects.Graphics;
    
    // Should not throw
    expect(() => {
      system.renderConnections(graphics, connections, objects);
    }).not.toThrow();
  });

  it('should handle missing objects gracefully', () => {
    const objects = new Map<string, GameObject>();
    const connections: Connection[] = [
      { from: 'obj1', to: 'obj2' }
    ];
    
    const graphics = {
      lineStyle: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      strokePath: () => {},
    } as unknown as Phaser.GameObjects.Graphics;
    
    // Should not throw when objects don't exist
    expect(() => {
      system.renderConnections(graphics, connections, objects);
    }).not.toThrow();
  });
});

