import { GameObject } from '../../GameObject';
import { InteractionRule, InteractionResult } from '../InteractionRule';

/**
 * Rule: Any object → Black Square: Object deleted
 * High priority (checked first)
 */
export class BlackSquareRule implements InteractionRule {
  readonly priority = 100; // High priority - placed object interactions first

  canApply(_held: GameObject, placed: GameObject, _context: import('../InteractionRule').InteractionContext): boolean {
    return placed.type === 'largeSquare' && placed.color === 0x000000;
  }

  apply(held: GameObject, _placed: GameObject, context: import('../InteractionRule').InteractionContext): InteractionResult {
    context.deleteObject(held.id);
    context.removeConnectionsForObject(held.id);
    return 'deleted';
  }
}

