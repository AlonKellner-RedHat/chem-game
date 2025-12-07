import { GameObject } from '../../GameObject';
import { InteractionRule, InteractionResult, InteractionContext } from '../InteractionRule';

/**
 * Rule: Triangle → Any object: Triangle becomes same color as placed object
 * Lower priority (held object interactions)
 * Applies to any triangle, regardless of current color
 * Only applies when placed on the same position (not when adjacent/connected)
 */
export class BlueTriangleRule implements InteractionRule {
  readonly priority = 50; // Lower priority - held object interactions

  canApply(held: GameObject, placed: GameObject, context: InteractionContext): boolean {
    // Triangle copies placed object color, but only when placed on the same position
    // If placed adjacent (watched position), they should just connect, not change color
    if (held.type !== 'triangle') return false;
    
    // Only apply when placing on the same position, not when adjacent
    if (!context.isPlacingOnSamePosition) return false;
    
    // Don't apply to prioritized objects (yellow rectangle, black square)
    return placed.type !== 'rectangle' && placed.type !== 'largeSquare';
  }

  apply(held: GameObject, placed: GameObject, _context: InteractionContext): InteractionResult {
    held.color = placed.color;
    return 'interacted';
  }
}

