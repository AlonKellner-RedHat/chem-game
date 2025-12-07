import { GameObject } from '../GameObject';

/**
 * Base interface for connection rules
 * Follows Open-Closed Principle: open for extension, closed for modification
 */
export interface ConnectionRule {
  /**
   * Priority of this rule (higher = checked first)
   * Rules with same priority are checked in registration order
   */
  readonly priority: number;

  /**
   * Check if this rule applies to connect the two objects
   * @param obj1 First object (typically the one watching)
   * @param obj2 Second object (typically the one being watched)
   * @param obj1WatchingObj2 True if obj1 is watching obj2's position
   * @param obj2WatchingObj1 True if obj2 is watching obj1's position
   * @returns True if this rule should create a connection
   */
  canApply(
    obj1: GameObject,
    obj2: GameObject,
    obj1WatchingObj2: boolean,
    obj2WatchingObj1: boolean
  ): boolean;
}

