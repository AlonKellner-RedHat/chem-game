import { GameScene } from "../../../scenes/GameScene";
import { BaseModeStrategy } from "./ModeStrategy";

/**
 * Mode 4: GPU Materials
 * Use actual materials (water, crystal, gas) in GPU render
 * Keep everything else same as Mode 3
 * Change: Materials (default → actual materials)
 * Tests: Do materials cause issues?
 */
export class Mode4_GPUMaterials extends BaseModeStrategy {
  getDescription(): string {
    return "Use actual materials (water, crystal, gas) in GPU render";
  }

  execute(scene: GameScene, renderTexture: Phaser.GameObjects.RenderTexture | null): boolean {
    try {
      if (!renderTexture) {
        console.error("[Mode4] RenderTexture not available");
        return false;
      }

      // setupGPURenderer already uses actual materials, so this is same as Mode 3
      // But we make it explicit that we're using materials
      if (!this.setupGPURenderer(scene)) {
        return false;
      }

      const { width, height } = scene.cameras.main;
      const bounds = {
        min: { x: 0, y: 0 },
        max: { x: width, y: height },
      };

      const renderResult = this.gpuRenderer!.render(
        scene,
        bounds,
        200, 200, 150, // square
        400, 200, 75,  // circle
        600, 200, 150, // triangle
        this.grid!
      );

      if (!renderResult || !renderResult.canvas) {
        console.error("[Mode4] render() failed or returned no canvas");
        return false;
      }

      const canvas = renderResult.canvas;

      const textureKey = "__gpu_test_mode4";
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
      console.error("[Mode4] Error:", error);
      return false;
    }
  }
}

