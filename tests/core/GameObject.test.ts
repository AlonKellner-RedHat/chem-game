import { describe, it, expect } from 'vitest';
import { GameObject } from '../../src/core/GameObject';

describe('GameObject', () => {
  it('should create a game object with correct properties', () => {
    const obj = new GameObject('test1', 'square', 0xff0000, 5, 5, true);
    expect(obj.id).toBe('test1');
    expect(obj.type).toBe('square');
    expect(obj.color).toBe(0xff0000);
    expect(obj.gridX).toBe(5);
    expect(obj.gridY).toBe(5);
    expect(obj.isPickable).toBe(true);
    expect(obj.originalPosition).toEqual({ x: 5, y: 5 });
  });

  it('should place object at new grid position', () => {
    const obj = new GameObject('test1', 'square', 0xff0000, 5, 5, true);
    obj.place(7, 8);
    expect(obj.gridX).toBe(7);
    expect(obj.gridY).toBe(8);
  });

  it('should reset object to original position', () => {
    const obj = new GameObject('test1', 'square', 0xff0000, 5, 5, true);
    obj.place(7, 8);
    obj.reset();
    expect(obj.gridX).toBe(5);
    expect(obj.gridY).toBe(5);
  });

  it('should throw error when trying to pick up non-pickable object', () => {
    const obj = new GameObject('test1', 'square', 0xff0000, 5, 5, false);
    expect(() => obj.pickup()).toThrow();
  });

  it('should get bounds correctly', () => {
    const obj = new GameObject('test1', 'square', 0xff0000, 5, 5, true, { width: 40, height: 40 });
    const bounds = obj.getBounds(100, 200);
    expect(bounds.left).toBe(80);
    expect(bounds.right).toBe(120);
    expect(bounds.top).toBe(180);
    expect(bounds.bottom).toBe(220);
  });
});

