import { GameObject } from '../GameObject';
import { InteractionRule, InteractionResult, InteractionContext } from './InteractionRule';

/**
 * Registry for interaction rules
 * Manages rules with priorities and applies them in order
 */
export class InteractionRegistry {
  private rules: InteractionRule[] = [];

  /**
   * Register an interaction rule
   * Rules are sorted by priority (highest first), then by registration order
   */
  public register(rule: InteractionRule): void {
    this.rules.push(rule);
    // Sort by priority (descending), maintaining registration order for same priority
    this.rules.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      // Same priority - maintain insertion order
      return 0;
    });
  }

  /**
   * Unregister a rule (useful for dynamic rule management)
   */
  public unregister(rule: InteractionRule): void {
    const index = this.rules.indexOf(rule);
    if (index >= 0) {
      this.rules.splice(index, 1);
    }
  }

  /**
   * Find and apply the first matching interaction rule
   * @returns The result of the interaction, or 'no_interaction' if no rule matched
   */
  public applyInteraction(held: GameObject, placed: GameObject, context: InteractionContext): InteractionResult {
    for (const rule of this.rules) {
      if (rule.canApply(held, placed, context)) {
        return rule.apply(held, placed, context);
      }
    }
    return 'no_interaction';
  }

  /**
   * Get all registered rules (for debugging/inspection)
   */
  public getAllRules(): readonly InteractionRule[] {
    return [...this.rules];
  }

  /**
   * Clear all rules
   */
  public clear(): void {
    this.rules = [];
  }
}

