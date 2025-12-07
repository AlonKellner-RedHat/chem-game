import { GameScene } from "../../../scenes/GameScene";
import { BaseModeStrategy } from "./ModeStrategy";

/**
 * Mode 3A: Skip getImageData() Validation
 * Test if calling getImageData() before addCanvas() causes the issue
 * Remove the getImageData() validation call
 * Add canvas directly to texture without reading pixels first
 * Tests: Is getImageData() tainting the canvas?
 */
export class Mode3A_SkipImageDataCheck extends BaseModeStrategy {
  getDescription(): string {
    return "Mode 3A: Skip getImageData() validation - test if getImageData() taints canvas";
  }

  execute(scene: GameScene, renderTexture: Phaser.GameObjects.RenderTexture | null): boolean {
    try {
      if (!renderTexture) {
        console.error("[Mode3A] RenderTexture not available");
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

      // Use GPU render() to get canvas
      console.log("[Mode3A] Calling gpuRenderer.render() with bounds:", bounds);
      const renderResult = this.gpuRenderer!.render(
        scene,
        bounds,
        200, 200, 150, // square
        400, 200, 75,  // circle
        600, 200, 150, // triangle
        this.grid!
      );

      if (!renderResult || !renderResult.canvas) {
        console.error("[Mode3A] render() failed or returned no canvas");
        return false;
      }

      const canvas = renderResult.canvas;

      // Validate canvas has dimensions (but DON'T call getImageData())
      if (canvas.width === 0 || canvas.height === 0) {
        console.error("[Mode3A] Canvas has zero dimensions");
        return false;
      }

      console.log("[Mode3A] Canvas dimensions:", canvas.width, "x", canvas.height);
      console.log("[Mode3A] Skipping getImageData() check - adding canvas directly to texture");

      const textureKey = "__gpu_test_mode3a";
      if (scene.textures.exists(textureKey)) {
        scene.textures.remove(textureKey);
      }
      scene.textures.addCanvas(textureKey, canvas);

      // Verify texture is ready
      const texture = scene.textures.get(textureKey);
      if (!texture || !texture.frames || Object.keys(texture.frames).length === 0) {
        console.error("[Mode3A] Texture not ready after addCanvas");
        return false;
      }
      console.log("[Mode3A] Texture ready, frame count:", Object.keys(texture.frames).length);

      const tempImage = scene.add.image(0, 0, textureKey);
      tempImage.setVisible(false);
      
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
      console.error("[Mode3A] Error:", error);
      return false;
    }
  }
}

