import { GameScene } from "../../../scenes/GameScene";
import { BaseModeStrategy } from "./ModeStrategy";

/**
 * Mode 6: RenderTexture Position
 * Set RenderTexture position to bounds.min.x, bounds.min.y (not 0,0)
 * Keep everything else from Mode 5
 * Change: RenderTexture position
 * Tests: Does position cause blank screen?
 */
export class Mode6_RenderTexturePosition extends BaseModeStrategy {
  getDescription(): string {
    return "Set RenderTexture position to bounds.min instead of 0,0";
  }

  execute(scene: GameScene, renderTexture: Phaser.GameObjects.RenderTexture | null): boolean {
    try {
      if (!renderTexture) {
        console.error("[Mode6] RenderTexture not available");
        return false;
      }

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

      const renderResult = this.gpuRenderer!.render(
        scene,
        bounds,
        200, 200, 150, // square
        400, 200, 75,  // circle
        600, 200, 150, // triangle
        this.grid!
      );

      if (!renderResult || !renderResult.canvas) {
        console.error("[Mode6] render() failed or returned no canvas");
        return false;
      }

      const canvas = renderResult.canvas;

      const textureKey = "__gpu_test_mode6";
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

      // Change: Position to bounds.min instead of 0,0
      renderTexture.setDisplaySize(width, height);
      renderTexture.setVisible(true);
      renderTexture.setActive(true);
      renderTexture.setDepth(-1000);
      renderTexture.setPosition(bounds.min.x, bounds.min.y); // CHANGE HERE
      renderTexture.setOrigin(0, 0);
      if (!scene.children.list.includes(renderTexture)) {
        scene.children.add(renderTexture);
      }
      scene.children.bringToTop(renderTexture);

      const hasContent =
        renderTexture.texture &&
        (renderTexture.texture as any).width > 0 &&
        (renderTexture.texture as any).height > 0;
      
      return hasContent;
    } catch (error) {
      console.error("[Mode6] Error:", error);
      return false;
    }
  }
}

