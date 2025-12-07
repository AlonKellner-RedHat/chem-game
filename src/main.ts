import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';

// Check WebGL 2.0 support and log it (for diagnostic purposes)
const webgl2Supported = (() => {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('experimental-webgl2');
    return gl instanceof WebGL2RenderingContext;
  } catch (e) {
    return false;
  }
})();

console.log(`[Main] WebGL 2.0 support: ${webgl2Supported ? 'Yes' : 'No'}`);
console.log('[Main] Using Phaser\'s native WebGL context (configured via gameConfig.render.context.webgl)');

// Scenes are already registered in gameConfig
// Create Phaser game instance - Phaser will create WebGL 2.0 context based on config
new Phaser.Game(gameConfig);

console.log('Chemistry Simulator initialized');

