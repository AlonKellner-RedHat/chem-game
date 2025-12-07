import { GameScene } from '../../scenes/GameScene';
import { RGB } from '../spectral/CIE';

/**
 * Base interface for all demos
 * Each demo defines its own initialization and cleanup logic
 */
export interface Demo {
  /**
   * Display name of the demo
   */
  readonly name: string;

  /**
   * Optional description of the demo
   */
  readonly description?: string;

  /**
   * Initialize the demo - set up objects, systems, etc.
   * @param scene The game scene to initialize in
   */
  initialize(scene: GameScene): void;

  /**
   * Clean up demo resources when switching away
   * @param scene The game scene to clean up in
   */
  cleanup(scene: GameScene): void;

  /**
   * Reset the demo to its initial state
   * @param scene The game scene to reset in
   */
  reset?(scene: GameScene): void;

  /**
   * Optional: Update method called every frame
   * @param scene The game scene
   */
  update?(scene: GameScene): void;

  /**
   * Optional: Get grid colors for spectral rendering
   * Returns normalized RGB colors for grid background and lines
   * @returns Object with backgroundColor and lineColor, or undefined to use defaults
   */
  getGridColors?(): { backgroundColor: RGB; lineColor: RGB } | undefined;
}

