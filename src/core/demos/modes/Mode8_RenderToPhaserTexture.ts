import { GameScene } from "../../../scenes/GameScene";
import { BaseModeStrategy } from "./ModeStrategy";

/**
 * Mode 8: renderToPhaserTexture
 * Use renderToPhaserTexture() instead of render() + Mode 1 pattern
 * Keep bounds and position from Mode 7
 * Change: Rendering method (render() → renderToPhaserTexture)
 * Tests: Is renderToPhaserTexture the issue?
 */
export class Mode8_RenderToPhaserTexture extends BaseModeStrategy {
  private cachedBounds: { min: { x: number; y: number }; max: { x: number; y: number } } | null = null;

  getDescription(): string {
    return "Use renderToPhaserTexture() instead of render() + Mode 1 pattern";
  }

  execute(scene: GameScene, renderTexture: Phaser.GameObjects.RenderTexture | null): boolean {
    try {
      if (!this.setupGPURenderer(scene)) {
        return false;
      }

      const camera = scene.cameras.main;
      const bounds = {
        min: { x: camera.worldView.x, y: camera.worldView.y },
        max: {
          x: camera.worldView.x + camera.worldView.width,
          y: camera.worldView.y + camera.worldView.height,
        },
      };

      const width = Math.ceil(bounds.max.x - bounds.min.x);
      const height = Math.ceil(bounds.max.y - bounds.min.y);

      // Create/recreate RenderTexture (like Mode 7)
      let currentRenderTexture = renderTexture;
      if (!currentRenderTexture || 
          !this.cachedBounds ||
          this.cachedBounds.max.x - this.cachedBounds.min.x !== width ||
          this.cachedBounds.max.y - this.cachedBounds.min.y !== height) {
        if (currentRenderTexture) {
          currentRenderTexture.destroy();
        }
        currentRenderTexture = scene.add.renderTexture(0, 0, width, height);
        currentRenderTexture.setScrollFactor(0, 0);
        currentRenderTexture.setDepth(-1000);
        currentRenderTexture.setOrigin(0, 0);
        this.cachedBounds = { min: { ...bounds.min }, max: { ...bounds.max } };
      } else {
        currentRenderTexture.setPosition(bounds.min.x, bounds.min.y);
      }

      // Change: Use renderToPhaserTexture instead of render() + draw()
      const renderSuccess = this.gpuRenderer!.renderToPhaserTexture(
        scene,
        currentRenderTexture,
        bounds,
        200, 200, 150, // square
        400, 200, 75,  // circle
        600, 200, 150, // triangle
        this.grid!
      );

      if (!renderSuccess) {
        console.error("[Mode8] renderToPhaserTexture failed");
        return false;
      }

      // Still use Mode 1 display pattern
      currentRenderTexture.setDisplaySize(width, height);
      currentRenderTexture.setVisible(true);
      currentRenderTexture.setActive(true);
      currentRenderTexture.setPosition(bounds.min.x, bounds.min.y);
      currentRenderTexture.setOrigin(0, 0);
      if (!scene.children.list.includes(currentRenderTexture)) {
        scene.children.add(currentRenderTexture);
      }
      scene.children.bringToTop(currentRenderTexture);

      const hasContent =
        currentRenderTexture.texture &&
        (currentRenderTexture.texture as any).width > 0 &&
        (currentRenderTexture.texture as any).height > 0;
      
      return hasContent;
    } catch (error) {
      console.error("[Mode8] Error:", error);
      return false;
    }
  }
}

