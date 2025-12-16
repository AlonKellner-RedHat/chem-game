/**
 * Phaser 4 + WebGPU Entry Point
 *
 * This is the main entry point for the Phaser 4 implementation.
 * It initializes the game with WebGPU rendering support.
 */

import { getAllDemos, getDefaultDemo } from './core/demos';
import { GameScene } from './scenes/GameScene';
import { MenuScene } from './scenes/MenuScene';

// Initialize game
async function init() {
  console.log('[P4] Initializing...');

  // Get container
  const container = document.getElementById('game-container');
  if (!container) {
    console.error('[P4] Game container not found');
    return;
  }

  // Create game scene
  const gameScene = new GameScene(container);
  await gameScene.initialize();

  // Initial resize to fit container
  const resizeGame = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    gameScene.resize(width, height);
  };
  resizeGame();

  // Listen for window resize
  window.addEventListener('resize', resizeGame);

  // Create menu scene
  const demos = getAllDemos();
  const menuScene = new MenuScene(container, gameScene, demos);

  // Load default demo
  const defaultDemo = getDefaultDemo();
  gameScene.loadDemo(defaultDemo);

  // Setup keyboard shortcut for menu
  document.addEventListener('keydown', (e) => {
    if (e.key === 'm' || e.key === 'M') {
      menuScene.toggle();
    }
  });

  console.log('[P4] Ready - Press M to open menu');
}

init().catch(console.error);
