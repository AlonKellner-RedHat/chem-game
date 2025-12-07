import { GameScene } from "../../../scenes/GameScene";
import { BaseModeStrategy } from "./ModeStrategy";

/**
 * Mode 10: Full SpectralDemo Path
 * Exact SpectralDemo implementation
 * All elements combined
 * Change: Complete SpectralDemo approach
 * Tests: Final verification
 */
export class Mode10_FullSpectralDemo extends BaseModeStrategy {
  private cachedBounds: { min: { x: number; y: number }; max: { x: number; y: number } } | null = null;

  getDescription(): string {
    return "Full SpectralDemo path - all elements combined";
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

      // Exact SpectralDemo RenderTexture creation pattern
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

      // Use renderToPhaserTexture
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
        console.error("[Mode10] renderToPhaserTexture failed");
        return false;
      }

      // Exact SpectralDemo display pattern
      if (!scene.children.list.includes(currentRenderTexture)) {
        scene.children.add(currentRenderTexture);
      }

      currentRenderTexture.setVisible(true);
      currentRenderTexture.setActive(true);
      currentRenderTexture.setDepth(-1000);
      currentRenderTexture.setScrollFactor(0, 0);
      currentRenderTexture.setOrigin(0, 0);
      currentRenderTexture.setPosition(0, 0);
      currentRenderTexture.setAlpha(1.0);
      scene.children.bringToTop(currentRenderTexture);

      const hasContent =
        currentRenderTexture.texture &&
        (currentRenderTexture.texture as any).width > 0 &&
        (currentRenderTexture.texture as any).height > 0;
      
      return hasContent;
    } catch (error) {
      console.error("[Mode10] Error:", error);
      return false;
    }
  }
}

