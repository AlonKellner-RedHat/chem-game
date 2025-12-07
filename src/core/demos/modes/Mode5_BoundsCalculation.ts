import { GameScene } from "../../../scenes/GameScene";
import { BaseModeStrategy } from "./ModeStrategy";

/**
 * Mode 5: Bounds Calculation
 * Use SpectralDemo bounds calculation (camera.worldView)
 * Keep canvas source and materials from Mode 4
 * Change: Bounds calculation method
 * Tests: Does bounds calculation affect rendering?
 */
export class Mode5_BoundsCalculation extends BaseModeStrategy {
  getDescription(): string {
    return "Use SpectralDemo bounds calculation (camera.worldView)";
  }

  execute(scene: GameScene, renderTexture: Phaser.GameObjects.RenderTexture | null): boolean {
    try {
      if (!renderTexture) {
        console.error("[Mode5] RenderTexture not available");
        return false;
      }

      if (!this.setupGPURenderer(scene)) {
        return false;
      }

      // Use SpectralDemo bounds calculation
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

      const renderResult = this.gpuRenderer!.render(
        scene,
        bounds,
        200, 200, 150, // square
        400, 200, 75,  // circle
        600, 200, 150, // triangle
        this.grid!
      );

      if (!renderResult || !renderResult.canvas) {
        console.error("[Mode5] render() failed or returned no canvas");
        return false;
      }

      const canvas = renderResult.canvas;

      const textureKey = "__gpu_test_mode5";
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

      // Still use Mode 1 display pattern (position 0,0)
      this.applyMode1DisplayPattern(scene, renderTexture, width, height);

      const hasContent =
        renderTexture.texture &&
        (renderTexture.texture as any).width > 0 &&
        (renderTexture.texture as any).height > 0;
      
      return hasContent;
    } catch (error) {
      console.error("[Mode5] Error:", error);
      return false;
    }
  }
}

