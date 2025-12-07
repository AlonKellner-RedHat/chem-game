import { GameObject } from '../../GameObject';
import { ConnectionRule } from '../ConnectionRule';

/**
 * General rule: Any top edge connects to any bottom edge
 * - Squares have both top and bottom edges
 * - Triangles have only bottom edge
 * - Rectangles have only top edge (at their top position)
 * Lower priority - specific rules should override this
 */
export class TopBottomEdgeRule implements ConnectionRule {
  readonly priority = 50; // Lower priority - general rule

  canApply(
    obj1: GameObject,
    obj2: GameObject,
    obj1WatchingObj2: boolean,
    obj2WatchingObj1: boolean
  ): boolean {
    // Check if objects are vertically adjacent (same X, different Y)
    if (obj1.gridX !== obj2.gridX) return false;

    // Check if obj1 is above obj2 (obj1's bottom connects to obj2's top)
    if (obj1.gridY < obj2.gridY) {
      // obj1 has a bottom edge (square or triangle)
      const obj1HasBottomEdge = obj1.type === 'square' || obj1.type === 'triangle';
      // obj2 has a top edge (square or rectangle)
      const obj2HasTopEdge = obj2.type === 'square' || obj2.type === 'rectangle';
      
      // obj1 must be watching obj2's position (bottom edge watching below)
      if (obj1WatchingObj2 && obj1HasBottomEdge && obj2HasTopEdge) {
        return true;
      }
    }
    
    // Check if obj2 is above obj1 (obj2's bottom connects to obj1's top)
    if (obj2.gridY < obj1.gridY) {
      // obj2 has a bottom edge (square or triangle)
      const obj2HasBottomEdge = obj2.type === 'square' || obj2.type === 'triangle';
      // obj1 has a top edge (square or rectangle)
      const obj1HasTopEdge = obj1.type === 'square' || obj1.type === 'rectangle';
      
      // obj2 must be watching obj1's position (bottom edge watching below)
      if (obj2WatchingObj1 && obj2HasBottomEdge && obj1HasTopEdge) {
        return true;
      }
    }
    
    return false;
  }
}

