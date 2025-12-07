import { GameObject } from '../../GameObject';
import { InteractionRule, InteractionResult, InteractionContext } from '../InteractionRule';

/**
 * Rule: Circle → Any object: Placed object becomes the same color as the circle
 * Lower priority (held object interactions)
 * Applies to any circle, regardless of current color
 * The circle's current color is applied to the placed object
 */
export class RedCircleRule implements InteractionRule {
  readonly priority = 50; // Lower priority - held object interactions

  canApply(held: GameObject, placed: GameObject, _context: InteractionContext): boolean {
    // Circle makes placed object the same color as the circle, but only if placed object is not prioritized
    // Prioritized objects (yellow rectangle, black square) have higher priority rules
    return (
      held.type === 'circle' &&
      placed.type !== 'rectangle' &&
      placed.type !== 'largeSquare'
    );
  }

  apply(held: GameObject, placed: GameObject, _context: InteractionContext): InteractionResult {
    // Make placed object the same color as the circle's current color
    placed.color = held.color;
    return 'interacted';
  }
}

