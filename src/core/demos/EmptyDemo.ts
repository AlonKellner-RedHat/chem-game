import { Demo } from './Demo';
import { GameScene } from '../../scenes/GameScene';

/**
 * Empty Demo
 * Just an empty grid with no objects or systems
 */
export class EmptyDemo implements Demo {
  readonly name = 'Empty';
  readonly description = 'Empty grid with no objects';

  initialize(_scene: GameScene): void {
    // Nothing to initialize - just an empty grid
  }

  reset(_scene: GameScene): void {
    // Empty demo has nothing to reset
  }

  cleanup(scene: GameScene): void {
    // Clean up any objects that might have been added
    const interactionSystem = scene.getInteractionSystem();
    const allObjects = interactionSystem.getAllObjects();
    for (const obj of allObjects) {
      interactionSystem.unregisterObject(obj.id);
    }
  }
}

