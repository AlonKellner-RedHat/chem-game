import { GameScene } from "../../../scenes/GameScene";
import { BaseModeStrategy } from "./ModeStrategy";

/**
 * Mode 3C: ImageData Roundtrip
 * Test if converting to ImageData and back fixes the issue
 * Get GPU-rendered canvas
 * Get ImageData from canvas
 * Create new canvas
 * Put ImageData into new canvas
 * Use new canvas for texture
 * Tests: Does ImageData roundtrip "refresh" the canvas state?
 */
export class Mode3C_ImageDataRoundtrip extends BaseModeStrategy {
  getDescription(): string {
    return "Mode 3C: ImageData roundtrip - test if ImageData conversion refreshes canvas state";
  }

  execute(scene: GameScene, renderTexture: Phaser.GameObjects.RenderTexture | null): boolean {
    try {
      if (!renderTexture) {
        console.error("[Mode3C] RenderTexture not available");
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
      console.log("[Mode3C] Calling gpuRenderer.render() with bounds:", bounds);
      const renderResult = this.gpuRenderer!.render(
        scene,
        bounds,
        200, 200, 150, // square
        400, 200, 75,  // circle
        600, 200, 150, // triangle
        this.grid!
      );

      if (!renderResult || !renderResult.canvas) {
        console.error("[Mode3C] render() failed or returned no canvas");
        return false;
      }

      const gpuCanvas = renderResult.canvas;

      if (gpuCanvas.width === 0 || gpuCanvas.height === 0) {
        console.error("[Mode3C] GPU canvas has zero dimensions");
        return false;
      }

      console.log("[Mode3C] GPU canvas dimensions:", gpuCanvas.width, "x", gpuCanvas.height);
      console.log("[Mode3C] Performing ImageData roundtrip");

      // Get ImageData from GPU canvas
      const gpuCtx = gpuCanvas.getContext("2d");
      if (!gpuCtx) {
        console.error("[Mode3C] Failed to get 2D context from GPU canvas");
        return false;
      }

      const imageData = gpuCtx.getImageData(0, 0, gpuCanvas.width, gpuCanvas.height);
      console.log("[Mode3C] Got ImageData from GPU canvas");

      // Create new canvas and put ImageData into it
      const newCanvas = document.createElement("canvas");
      newCanvas.width = gpuCanvas.width;
      newCanvas.height = gpuCanvas.height;
      const newCtx = newCanvas.getContext("2d");
      
      if (!newCtx) {
        console.error("[Mode3C] Failed to get 2D context for new canvas");
        return false;
      }

      newCtx.putImageData(imageData, 0, 0);
      console.log("[Mode3C] Put ImageData into new canvas");

      const textureKey = "__gpu_test_mode3c";
      if (scene.textures.exists(textureKey)) {
        scene.textures.remove(textureKey);
      }
      scene.textures.addCanvas(textureKey, newCanvas);

      // Verify texture is ready
      const texture = scene.textures.get(textureKey);
      if (!texture || !texture.frames || Object.keys(texture.frames).length === 0) {
        console.error("[Mode3C] Texture not ready after addCanvas");
        return false;
      }
      console.log("[Mode3C] Texture ready, frame count:", Object.keys(texture.frames).length);

      const tempImage = scene.add.image(0, 0, textureKey);
      tempImage.setVisible(false);
      
      tempImage.setDisplaySize(newCanvas.width, newCanvas.height);
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
      console.error("[Mode3C] Error:", error);
      return false;
    }
  }
}

