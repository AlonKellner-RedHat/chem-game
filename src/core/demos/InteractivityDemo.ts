import { Demo } from './Demo';
import { GameScene } from '../../scenes/GameScene';
import { Shapes } from '../Shapes';

/**
 * Interactivity Demo
 * Demonstrates the full interaction and connection systems
 */
export class InteractivityDemo implements Demo {
  readonly name = 'Interactivity';
  readonly description = 'Full interaction and connection systems with all shapes';

  initialize(scene: GameScene): void {
    const interactionSystem = scene.getInteractionSystem();
    
    // Green Square at (5, 5)
    const greenSquare = Shapes.createGreenSquare('greenSquare', 5, 5);
    interactionSystem.registerObject(greenSquare);

    // Magenta Square at (6, 5)
    const magentaSquare = Shapes.createMagentaSquare('magentaSquare', 6, 5);
    interactionSystem.registerObject(magentaSquare);

    // Red Circle at (7, 5)
    const redCircle = Shapes.createRedCircle('redCircle', 7, 5);
    interactionSystem.registerObject(redCircle);

    // Blue Triangle at (9, 5)
    const blueTriangle = Shapes.createBlueTriangle('blueTriangle', 9, 5);
    interactionSystem.registerObject(blueTriangle);

    // Yellow Rectangle at (5, 8)
    const yellowRectangle = Shapes.createYellowRectangle('yellowRectangle', 5, 8);
    interactionSystem.registerObject(yellowRectangle);

    // Large Black Square at (7, 8)
    const blackSquare = Shapes.createLargeBlackSquare('blackSquare', 7, 8);
    interactionSystem.registerObject(blackSquare);
  }

  reset(scene: GameScene): void {
    // Reset interaction system (this will restore all objects to original state)
    const interactionSystem = scene.getInteractionSystem();
    interactionSystem.reset();
  }

  cleanup(scene: GameScene): void {
    const interactionSystem = scene.getInteractionSystem();
    
    // Unregister all objects
    const objectIds = [
      'greenSquare',
      'magentaSquare',
      'redCircle',
      'blueTriangle',
      'yellowRectangle',
      'blackSquare',
    ];
    
    for (const id of objectIds) {
      interactionSystem.unregisterObject(id);
    }
  }
}

