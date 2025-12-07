import { GameObject } from '../GameObject';

/**
 * Result of an interaction
 */
export type InteractionResult = 'deleted' | 'interacted' | 'no_interaction';

/**
 * Context provided to interaction rules for performing actions
 */
export interface InteractionContext {
  /**
   * Delete an object from the system
   */
  deleteObject(id: string): void;
  
  /**
   * Remove connections involving an object
   */
  removeConnectionsForObject(id: string): void;
  
  /**
   * Place an object at a grid position
   */
  placeObject(obj: import('../GameObject').GameObject, gridX: number, gridY: number): void;
  
  /**
   * Check if the held object is being placed on the same position as the placed object
   * (occupying the same grid cell, not just adjacent)
   */
  isPlacingOnSamePosition: boolean;
}

/**
 * Base interface for interaction rules
 * Follows Open-Closed Principle: open for extension, closed for modification
 */
export interface InteractionRule {
  /**
   * Priority of this rule (higher = checked first)
   * Rules with same priority are checked in registration order
   */
  readonly priority: number;

  /**
   * Check if this rule applies to the given held and placed objects
   * @param held The object being held
   * @param placed The object being placed on
   * @param context Context for performing system actions and checking placement type
   */
  canApply(held: GameObject, placed: GameObject, context: InteractionContext): boolean;

  /**
   * Execute the interaction
   * @param held The object being held
   * @param placed The object being placed on
   * @param context Context for performing system actions
   * @returns The result of the interaction
   */
  apply(held: GameObject, placed: GameObject, context: InteractionContext): InteractionResult;
}

