import { GameScene } from "../../../scenes/GameScene";
import { BaseModeStrategy } from "./ModeStrategy";

/**
 * Mode 3B: Canvas Copy (Fresh Canvas)
 * Test if creating a fresh canvas and copying pixels fixes the issue
 * Get GPU-rendered canvas
 * Create a NEW canvas with same dimensions
 * Draw the GPU canvas onto the new canvas using drawImage()
 * Use the new canvas for texture
 * Tests: Does copying to a fresh canvas fix texture upload?
 */
export class Mode3B_CanvasCopy extends BaseModeStrategy {
  getDescription(): string {
    return "Mode 3B: Copy GPU canvas to fresh canvas - test if copying fixes texture upload";
  }

  execute(scene: GameScene, renderTexture: Phaser.GameObjects.RenderTexture | null): boolean {
    try {
      if (!renderTexture) {
        console.error("[Mode3B] RenderTexture not available");
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
      console.log("[Mode3B] Calling gpuRenderer.render() with bounds:", bounds);
      const renderResult = this.gpuRenderer!.render(
        scene,
        bounds,
        200, 200, 150, // square
        400, 200, 75,  // circle
        600, 200, 150, // triangle
        this.grid!
      );

      if (!renderResult || !renderResult.canvas) {
        console.error("[Mode3B] render() failed or returned no canvas");
        return false;
      }

      const gpuCanvas = renderResult.canvas;

      if (gpuCanvas.width === 0 || gpuCanvas.height === 0) {
        console.error("[Mode3B] GPU canvas has zero dimensions");
        return false;
      }

      console.log("[Mode3B] GPU canvas dimensions:", gpuCanvas.width, "x", gpuCanvas.height);
      console.log("[Mode3B] Creating fresh canvas and copying GPU canvas to it");

      // Create a fresh canvas and copy the GPU canvas to it
      const freshCanvas = document.createElement("canvas");
      freshCanvas.width = gpuCanvas.width;
      freshCanvas.height = gpuCanvas.height;
      const freshCtx = freshCanvas.getContext("2d");
      
      if (!freshCtx) {
        console.error("[Mode3B] Failed to get 2D context for fresh canvas");
        return false;
      }

      // Copy the GPU canvas to the fresh canvas
      freshCtx.drawImage(gpuCanvas, 0, 0);
      console.log("[Mode3B] Copied GPU canvas to fresh canvas");

      const textureKey = "__gpu_test_mode3b";
      if (scene.textures.exists(textureKey)) {
        scene.textures.remove(textureKey);
      }
      scene.textures.addCanvas(textureKey, freshCanvas);

      // Verify texture is ready
      const texture = scene.textures.get(textureKey);
      if (!texture || !texture.frames || Object.keys(texture.frames).length === 0) {
        console.error("[Mode3B] Texture not ready after addCanvas");
        return false;
      }
      console.log("[Mode3B] Texture ready, frame count:", Object.keys(texture.frames).length);

      const tempImage = scene.add.image(0, 0, textureKey);
      tempImage.setVisible(false);
      
      tempImage.setDisplaySize(freshCanvas.width, freshCanvas.height);
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
      console.error("[Mode3B] Error:", error);
      return false;
    }
  }
}

