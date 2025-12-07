import Phaser from 'phaser';
import { GameScene } from '../scenes/GameScene';
import { MenuScene } from '../scenes/MenuScene';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  parent: 'game-container',
  backgroundColor: '#ffffff', // White lab background
  scene: [GameScene, MenuScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    // Request WebGL 2.0 for better shader features and performance
    // Falls back to WebGL 1.0 if not supported
    // context: {
    //   webgl: 2,
    // }, // Not supported in Phaser 3.90.0 RenderConfig type
    // Attempt to enable preserveDrawingBuffer for screenshot capture
    // Note: Phaser 3.90.0 may not support this directly via config
    // We'll try to set it programmatically after Phaser creates the context
  },
};
