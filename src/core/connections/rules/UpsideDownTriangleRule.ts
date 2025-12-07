import { GameObject } from '../../GameObject';
import { ConnectionRule } from '../ConnectionRule';

/**
 * Example rule: Upside-down triangle can only connect to the bottom of a rectangle
 * This demonstrates how to create specific connection rules for new shapes
 * 
 * To use this rule, you would:
 * 1. Create an upside-down triangle shape type
 * 2. Register this rule: interactionSystem.registerConnectionRule(new UpsideDownTriangleRule())
 */
export class UpsideDownTriangleRule implements ConnectionRule {
  readonly priority = 100; // High priority - specific rule overrides general rules

  canApply(
    obj1: GameObject,
    obj2: GameObject,
    _obj1WatchingObj2: boolean,
    _obj2WatchingObj1: boolean
  ): boolean {
    // Check if obj1 is an upside-down triangle (you would add this type)
    // if (obj1.type !== 'upsideDownTriangle') return false;

    // Upside-down triangle connects to bottom of rectangle
    // obj1 (triangle) is below obj2 (rectangle)
    if (obj1.gridY > obj2.gridY && obj1.gridX === obj2.gridX) {
      // obj2 must be a rectangle
      // if (obj2.type === 'rectangle' && obj2WatchingObj1) {
      //   return true;
      // }
    }

    // Reverse: rectangle above upside-down triangle
    if (obj2.gridY > obj1.gridY && obj2.gridX === obj1.gridX) {
      // obj1 must be a rectangle, obj2 must be upside-down triangle
      // if (obj1.type === 'rectangle' && obj1.type === 'upsideDownTriangle' && obj1WatchingObj2) {
      //   return true;
      // }
    }

    // This is a template - uncomment and adjust when you add the upside-down triangle type
    return false;
  }
}

