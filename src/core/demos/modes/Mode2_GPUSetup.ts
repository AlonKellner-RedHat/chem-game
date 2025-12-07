import { GameScene } from "../../../scenes/GameScene";
import { BaseModeStrategy } from "./ModeStrategy";

/**
 * Mode 2: GPU Renderer Setup
 * Add GPU renderer initialization and material registry setup
 * Still use test pattern canvas (not GPU-rendered)
 * Change: Adds GPU infrastructure without using it
 * Tests: Does GPU setup interfere?
 */
export class Mode2_GPUSetup extends BaseModeStrategy {
  getDescription(): string {
    return "Add GPU renderer and material registry setup (still use test pattern)";
  }

  execute(scene: GameScene, renderTexture: Phaser.GameObjects.RenderTexture | null): boolean {
    try {
      if (!renderTexture) {
        console.error("[Mode2] RenderTexture not available");
        return false;
      }

      // Setup GPU renderer (but don't use it yet)
      if (!this.setupGPURenderer(scene)) {
        return false;
      }

      // Still use test pattern canvas
      const { width, height } = scene.cameras.main;
      const canvas = this.createTestPattern(width, height);

      const textureKey = "__gpu_test_mode2";
      if (scene.textures.exists(textureKey)) {
        scene.textures.remove(textureKey);
      }
      scene.textures.addCanvas(textureKey, canvas);

      const tempImage = scene.add.image(0, 0, textureKey);
      
      tempImage.setDisplaySize(canvas.width, canvas.height);
      tempImage.setOrigin(0, 0);
      
      renderTexture.setSize(width, height);
      renderTexture.clear();
      
      renderTexture.draw(tempImage, 0, 0, width, height);
      tempImage.destroy();

      this.applyMode1DisplayPattern(scene, renderTexture, width, height);

      const hasContent =
        renderTexture.texture &&
        (renderTexture.texture as any).width > 0 &&
        (renderTexture.texture as any).height > 0;
      
      return hasContent;
    } catch (error) {
      console.error("[Mode2] Error:", error);
      return false;
    }
  }
}

