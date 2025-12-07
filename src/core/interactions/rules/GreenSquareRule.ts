import { GameObject } from '../../GameObject';
import { InteractionRule, InteractionResult, InteractionContext } from '../InteractionRule';

/**
 * Rule: Square → Any non-prioritized object: Swap colors
 * Lower priority (held object interactions)
 * Applies to any square, regardless of current color
 * Only swaps when placed on the same position (not when adjacent/connected)
 * Prioritized objects (yellow rectangle, black square) have higher priority rules that override this
 */
export class GreenSquareRule implements InteractionRule {
  readonly priority = 50; // Lower priority - held object interactions

  canApply(held: GameObject, _placed: GameObject, context: InteractionContext): boolean {
    // Square swaps with any object, but only when placed on the same position
    // If placed adjacent (watched position), they should just connect, not swap
    if (held.type !== 'square') return false;
    
    // Only swap when placing on the same position, not when adjacent
    return context.isPlacingOnSamePosition;
  }

  apply(held: GameObject, placed: GameObject, _context: InteractionContext): InteractionResult {
    const tempColor = held.color;
    held.color = placed.color;
    placed.color = tempColor;
    return 'interacted';
  }
}

