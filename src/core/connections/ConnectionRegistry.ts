import { GameObject } from '../GameObject';
import { ConnectionRule } from './ConnectionRule';

/**
 * Registry for connection rules
 * Manages rules with priorities and applies them in order
 */
export class ConnectionRegistry {
  private rules: ConnectionRule[] = [];

  /**
   * Register a connection rule
   * Rules are sorted by priority (highest first), then by registration order
   */
  public register(rule: ConnectionRule): void {
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
  public unregister(rule: ConnectionRule): void {
    const index = this.rules.indexOf(rule);
    if (index >= 0) {
      this.rules.splice(index, 1);
    }
  }

  /**
   * Find and apply the first matching connection rule
   * @param obj1 First object
   * @param obj2 Second object
   * @param obj1WatchingObj2 True if obj1 is watching obj2's position
   * @param obj2WatchingObj1 True if obj2 is watching obj1's position
   * @returns True if objects should be connected
   */
  public shouldConnect(
    obj1: GameObject,
    obj2: GameObject,
    obj1WatchingObj2: boolean,
    obj2WatchingObj1: boolean
  ): boolean {
    for (const rule of this.rules) {
      if (rule.canApply(obj1, obj2, obj1WatchingObj2, obj2WatchingObj1)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get all registered rules (for debugging/inspection)
   */
  public getAllRules(): readonly ConnectionRule[] {
    return [...this.rules];
  }

  /**
   * Clear all rules
   */
  public clear(): void {
    this.rules = [];
  }
}

