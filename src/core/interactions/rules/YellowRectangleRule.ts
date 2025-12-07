import { GameObject } from '../../GameObject';
import { InteractionRule, InteractionResult } from '../InteractionRule';

/**
 * Rule: Any object → Yellow Rectangle: Object color randomized
 * High priority (checked first)
 */
export class YellowRectangleRule implements InteractionRule {
  readonly priority = 100; // High priority - placed object interactions first

  canApply(_held: GameObject, placed: GameObject, _context: import('../InteractionRule').InteractionContext): boolean {
    return placed.type === 'rectangle' && placed.color === 0xffff00;
  }

  apply(held: GameObject, _placed: GameObject, _context: import('../InteractionRule').InteractionContext): InteractionResult {
    held.color = this.randomColor();
    return 'interacted';
  }

  private randomColor(): number {
    const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}

