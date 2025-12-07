import { GameScene } from "../../../scenes/GameScene";
import { BaseModeStrategy } from "./ModeStrategy";

/**
 * Mode 3: GPU Render using renderToPhaserTexture()
 * Use gpuRenderer.renderToPhaserTexture() to render directly to RenderTexture
 * This avoids the canvas intermediate step that causes blank screens
 */
export class Mode3_GPURender extends BaseModeStrategy {
  getDescription(): string {
    return "Use renderToPhaserTexture() to render directly to RenderTexture";
  }

  execute(scene: GameScene, renderTexture: Phaser.GameObjects.RenderTexture | null): boolean {
    try {
      if (!renderTexture) {
        console.error("[Mode3] RenderTexture not available");
        return false;
      }

      if (!this.setupGPURenderer(scene)) {
        return false;
      }

      const { width, height } = scene.cameras.main;
      const bounds = {
        min: { x: 0, y: 0 },
        max: { x: width, y: height },
      };

      // Before calling renderToPhaserTexture(), ensure clean state
      renderTexture.setSize(width, height);
      renderTexture.clear();

      // Use renderToPhaserTexture() to render directly to RenderTexture
      console.log("[Mode3] Calling gpuRenderer.renderToPhaserTexture() with bounds:", bounds);
      const renderSuccess = this.gpuRenderer!.renderToPhaserTexture(
        scene,
        renderTexture,
        bounds,
        200, 200, 150, // square
        400, 200, 75,  // circle
        600, 200, 150, // triangle
        this.grid!
      );

      if (!renderSuccess) {
        console.error("[Mode3] renderToPhaserTexture() failed");
        return false;
      }

      // Apply Mode 1 display pattern
      this.applyMode1DisplayPattern(scene, renderTexture, width, height);

      const hasContent =
        renderTexture.texture &&
        (renderTexture.texture as any).width > 0 &&
        (renderTexture.texture as any).height > 0;
      
      return hasContent;
    } catch (error) {
      console.error("[Mode3] Error:", error);
      return false;
    }
  }
}

