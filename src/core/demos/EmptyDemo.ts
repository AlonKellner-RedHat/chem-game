/**
 * Empty Demo
 *
 * Minimal placeholder demo for testing scene lifecycle.
 */

import type { GameScene } from '../../scenes/GameScene';
import type { Demo } from './Demo';

// Base design dimensions
const BASE_WIDTH = 1280;

export class EmptyDemo implements Demo {
  readonly name = 'Empty';
  readonly description = 'Minimal placeholder demo';
  readonly usesGpuRenderer = false;

  initialize(scene: GameScene): void {
    console.log('[EmptyDemo] Initialized');
    this.render(scene);
  }

  resize(scene: GameScene, width: number, height: number): void {
    this.render(scene);
  }

  cleanup(scene: GameScene): void {
    console.log('[EmptyDemo] Cleaned up');
  }

  private render(scene: GameScene): void {
    const ctx = scene.getContext();
    const { width, height } = scene.getDimensions();
    const scale = width / BASE_WIDTH;

    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#fff';
    ctx.font = `${24 * scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Empty Demo', width / 2, height / 2 - 20 * scale);
    ctx.font = `${14 * scale}px sans-serif`;
    ctx.fillText('Press M to open menu', width / 2, height / 2 + 20 * scale);
  }
}
