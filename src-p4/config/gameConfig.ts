/**
 * Phaser 4 Game Configuration
 * 
 * Configuration for the Phaser 4 + WebGPU implementation.
 * Note: Phaser 4 uses a different config format than Phaser 3.
 */

export interface GameConfig {
  width: number;
  height: number;
  backgroundColor: string;
  parent: string;
  // Phaser 4 specific options will be added here
}

export const gameConfig: GameConfig = {
  width: 1280,
  height: 720,
  backgroundColor: '#ffffff',
  parent: 'game-container',
};


