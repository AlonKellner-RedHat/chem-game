import { GameScene } from "../../../scenes/GameScene";
import { BaseModeStrategy } from "./ModeStrategy";

/**
 * Mode 1: Baseline (Working)
 * Uses test pattern canvas with standard Mode 1 pattern
 * Purpose: Establish working baseline
 */
export class Mode1_Baseline extends BaseModeStrategy {
  getDescription(): string {
    return "Baseline - test pattern canvas with Mode 1 pattern (working)";
  }

  execute(scene: GameScene, renderTexture: Phaser.GameObjects.RenderTexture | null): boolean {
    try {
      if (!renderTexture) {
        console.error("[Mode1] RenderTexture not available");
        return false;
      }

      const { width, height } = scene.cameras.main;
      const canvas = this.createTestPattern(width, height);

      const textureKey = "__gpu_test_mode1";
      if (scene.textures.exists(textureKey)) {
        scene.textures.remove(textureKey);
      }
      scene.textures.addCanvas(textureKey, canvas);

      const tempImage = scene.add.image(0, 0, textureKey);
      
      // Set tempImage size to match canvas exactly
      tempImage.setDisplaySize(canvas.width, canvas.height);
      tempImage.setOrigin(0, 0);
      
      // Resize RenderTexture to match screen size
      renderTexture.setSize(width, height);
      renderTexture.clear();
      
      // Draw the image scaled to fill the RenderTexture
      renderTexture.draw(tempImage, 0, 0, width, height);
      tempImage.destroy();

      // Apply Mode 1 display pattern
      this.applyMode1DisplayPattern(scene, renderTexture, width, height);

      const hasContent =
        renderTexture.texture &&
        (renderTexture.texture as any).width > 0 &&
        (renderTexture.texture as any).height > 0;
      
      return hasContent;
    } catch (error) {
      console.error("[Mode1] Error:", error);
      return false;
    }
  }
}

