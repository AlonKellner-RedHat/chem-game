import { GameScene } from "../../../scenes/GameScene";
import { BaseModeStrategy } from "./ModeStrategy";

/**
 * Mode 7: RenderTexture Creation Pattern
 * Create/recreate RenderTexture based on bounds changes (like SpectralDemo)
 * Keep position from Mode 6
 * Change: RenderTexture lifecycle management
 * Tests: Does recreation pattern cause issues?
 */
export class Mode7_RenderTextureLifecycle extends BaseModeStrategy {
  private cachedBounds: { min: { x: number; y: number }; max: { x: number; y: number } } | null = null;

  getDescription(): string {
    return "Use SpectralDemo RenderTexture creation/recreation pattern";
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

      // Change: Create/recreate RenderTexture based on bounds (like SpectralDemo)
      let currentRenderTexture = renderTexture;
      if (!currentRenderTexture || 
          !this.cachedBounds ||
          this.cachedBounds.max.x - this.cachedBounds.min.x !== width ||
          this.cachedBounds.max.y - this.cachedBounds.min.y !== height) {
        // Create or recreate RenderTexture
        if (currentRenderTexture) {
          currentRenderTexture.destroy();
        }
        currentRenderTexture = scene.add.renderTexture(0, 0, width, height);
        currentRenderTexture.setScrollFactor(0, 0);
        currentRenderTexture.setDepth(-1000);
        currentRenderTexture.setOrigin(0, 0);
        this.cachedBounds = { min: { ...bounds.min }, max: { ...bounds.max } };
      } else {
        // Update position if bounds moved
        currentRenderTexture.setPosition(bounds.min.x, bounds.min.y);
      }

      const renderResult = this.gpuRenderer!.render(
        scene,
        bounds,
        200, 200, 150, // square
        400, 200, 75,  // circle
        600, 200, 150, // triangle
        this.grid!
      );

      if (!renderResult || !renderResult.canvas) {
        console.error("[Mode7] render() failed or returned no canvas");
        return false;
      }

      const canvas = renderResult.canvas;

      const textureKey = "__gpu_test_mode7";
      if (scene.textures.exists(textureKey)) {
        scene.textures.remove(textureKey);
      }
      scene.textures.addCanvas(textureKey, canvas);

      const tempImage = scene.add.image(0, 0, textureKey);
      
      tempImage.setDisplaySize(canvas.width, canvas.height);
      tempImage.setOrigin(0, 0);
      
      currentRenderTexture.setSize(width, height);
      currentRenderTexture.clear();
      
      currentRenderTexture.draw(tempImage, 0, 0, width, height);
      tempImage.destroy();

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
      console.error("[Mode7] Error:", error);
      return false;
    }
  }
}

