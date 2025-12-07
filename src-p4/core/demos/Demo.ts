/**
 * Demo Interface
 * 
 * Base interface for all demos in the application.
 */

import { GameScene } from '../../scenes/GameScene';

/**
 * Demo interface
 */
export interface Demo {
  /** Display name of the demo */
  readonly name: string;
  
  /** Optional description */
  readonly description?: string;
  
  /**
   * Initialize the demo
   * Called when the demo is loaded
   */
  initialize(scene: GameScene): void;
  
  /**
   * Update the demo (called each frame)
   * Optional - only needed for animated demos
   */
  update?(scene: GameScene): void;
  
  /**
   * Reset the demo to initial state
   * Optional
   */
  reset?(scene: GameScene): void;
  
  /**
   * Handle resize events
   * Optional - called when the scene is resized
   */
  resize?(scene: GameScene, width: number, height: number): void;
  
  /**
   * Cleanup resources when demo is unloaded
   */
  cleanup(scene: GameScene): void;
}

/**
 * Base class with common functionality
 */
export abstract class BaseDemo implements Demo {
  abstract readonly name: string;
  abstract readonly description?: string;
  
  abstract initialize(scene: GameScene): void;
  abstract cleanup(scene: GameScene): void;
  
  update?(scene: GameScene): void;
  
  reset?(scene: GameScene): void {
    // Default: reinitialize
    this.cleanup(scene);
    this.initialize(scene);
  }
  
  resize?(scene: GameScene, width: number, height: number): void;
}


