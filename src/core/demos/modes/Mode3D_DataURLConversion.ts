import { GameScene } from "../../../scenes/GameScene";
import { BaseModeStrategy } from "./ModeStrategy";

/**
 * Mode 3D: Data URL Conversion
 * Test if converting to data URL and back fixes the issue
 * Get GPU-rendered canvas
 * Convert to data URL using toDataURL()
 * Create Image from data URL
 * Draw Image to new canvas
 * Use new canvas for texture
 * Tests: Does data URL conversion force a clean state?
 */
export class Mode3D_DataURLConversion extends BaseModeStrategy {
  private frameWaitCount: number = 0;
  private pendingImage: HTMLImageElement | null = null;
  private pendingGpuCanvas: HTMLCanvasElement | null = null;
  private pendingWidth: number = 0;
  private pendingHeight: number = 0;

  getDescription(): string {
    return "Mode 3D: Data URL conversion - test if data URL conversion forces clean state";
  }

  execute(scene: GameScene, renderTexture: Phaser.GameObjects.RenderTexture | null): boolean {
    try {
      if (!renderTexture) {
        console.error("[Mode3D] RenderTexture not available");
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
      console.log("[Mode3D] Calling gpuRenderer.render() with bounds:", bounds);
      const renderResult = this.gpuRenderer!.render(
        scene,
        bounds,
        200, 200, 150, // square
        400, 200, 75,  // circle
        600, 200, 150, // triangle
        this.grid!
      );

      if (!renderResult || !renderResult.canvas) {
        console.error("[Mode3D] render() failed or returned no canvas");
        return false;
      }

      const gpuCanvas = renderResult.canvas;

      if (gpuCanvas.width === 0 || gpuCanvas.height === 0) {
        console.error("[Mode3D] GPU canvas has zero dimensions");
        return false;
      }

      // First frame: setup and start image loading
      if (this.frameWaitCount === 0) {
        this.pendingGpuCanvas = gpuCanvas;
        this.pendingWidth = width;
        this.pendingHeight = height;

        console.log("[Mode3D] GPU canvas dimensions:", gpuCanvas.width, "x", gpuCanvas.height);
        console.log("[Mode3D] Converting to data URL and loading image");

        // Convert to data URL
        const dataURL = gpuCanvas.toDataURL();
        console.log("[Mode3D] Converted to data URL, length:", dataURL.length);

        // Create Image from data URL (async)
        this.pendingImage = new Image();
        this.pendingImage.onload = () => {
          console.log("[Mode3D] Image loaded from data URL");
        };
        this.pendingImage.onerror = (error) => {
          console.error("[Mode3D] Failed to load image from data URL:", error);
          this.reset();
        };
        this.pendingImage.src = dataURL;
        
        this.frameWaitCount++;
        return false; // Wait for image to load
      }

      // Wait for image to load
      if (!this.pendingImage || !this.pendingImage.complete) {
        this.frameWaitCount++;
        console.log(`[Mode3D] Waiting for image to load... (frame ${this.frameWaitCount})`);
        return false;
      }

      if (this.pendingImage.width === 0 || this.pendingImage.height === 0) {
        console.error("[Mode3D] Loaded image has zero dimensions");
        this.reset();
        return false;
      }

      // Image is loaded, now draw it to new canvas
      console.log("[Mode3D] Image loaded, drawing to new canvas");
      const newCanvas = document.createElement("canvas");
      newCanvas.width = this.pendingGpuCanvas!.width;
      newCanvas.height = this.pendingGpuCanvas!.height;
      const newCtx = newCanvas.getContext("2d");
      
      if (!newCtx) {
        console.error("[Mode3D] Failed to get 2D context for new canvas");
        this.reset();
        return false;
      }

      newCtx.drawImage(this.pendingImage, 0, 0);
      console.log("[Mode3D] Drew Image to new canvas");

      const textureKey = "__gpu_test_mode3d";
      if (scene.textures.exists(textureKey)) {
        scene.textures.remove(textureKey);
      }
      scene.textures.addCanvas(textureKey, newCanvas);

      // Verify texture is ready
      const texture = scene.textures.get(textureKey);
      if (!texture || !texture.frames || Object.keys(texture.frames).length === 0) {
        console.error("[Mode3D] Texture not ready after addCanvas");
        this.reset();
        return false;
      }
      console.log("[Mode3D] Texture ready, frame count:", Object.keys(texture.frames).length);

      const tempImage = scene.add.image(0, 0, textureKey);
      tempImage.setVisible(false);
      
      tempImage.setDisplaySize(newCanvas.width, newCanvas.height);
      tempImage.setOrigin(0, 0);
      
      renderTexture.setSize(this.pendingWidth, this.pendingHeight);
      renderTexture.clear();
      
      renderTexture.draw(tempImage, 0, 0, this.pendingWidth, this.pendingHeight);
      tempImage.destroy();

      this.applyMode1DisplayPattern(scene, renderTexture, this.pendingWidth, this.pendingHeight);

      // Reset for next execution
      this.reset();

      const hasContent =
        renderTexture.texture &&
        (renderTexture.texture as any).width > 0 &&
        (renderTexture.texture as any).height > 0;
      
      return hasContent;
    } catch (error) {
      console.error("[Mode3D] Error:", error);
      this.reset();
      return false;
    }
  }

  private reset(): void {
    this.frameWaitCount = 0;
    this.pendingImage = null;
    this.pendingGpuCanvas = null;
    this.pendingWidth = 0;
    this.pendingHeight = 0;
  }
}

