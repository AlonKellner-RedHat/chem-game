import { GameScene } from "../../../scenes/GameScene";
import { BaseModeStrategy } from "./ModeStrategy";

/**
 * Mode 3F: Texture Refresh/Update
 * Test if texture needs explicit refresh after addCanvas
 * Get GPU-rendered canvas
 * Add to texture
 * Call texture.refresh() or similar update method
 * Wait one frame before drawing
 * Tests: Does texture need time/refresh to upload properly?
 */
export class Mode3F_TextureRefresh extends BaseModeStrategy {
  private frameWaitCount: number = 0;
  private readonly requiredFrames: number = 1;
  private pendingCanvas: HTMLCanvasElement | null = null;
  private pendingWidth: number = 0;
  private pendingHeight: number = 0;

  getDescription(): string {
    return "Mode 3F: Texture refresh - test if texture needs refresh or frame wait";
  }

  execute(scene: GameScene, renderTexture: Phaser.GameObjects.RenderTexture | null): boolean {
    try {
      if (!renderTexture) {
        console.error("[Mode3F] RenderTexture not available");
        return false;
      }

      // First frame: setup and add canvas to texture
      if (this.frameWaitCount === 0) {
        if (!this.setupGPURenderer(scene)) {
          return false;
        }

        const { width, height } = scene.cameras.main;
        this.pendingWidth = width;
        this.pendingHeight = height;
        const bounds = {
          min: { x: 0, y: 0 },
          max: { x: width, y: height },
        };

        // Use GPU render() to get canvas
        console.log("[Mode3F] Calling gpuRenderer.render() with bounds:", bounds);
        const renderResult = this.gpuRenderer!.render(
          scene,
          bounds,
          200, 200, 150, // square
          400, 200, 75,  // circle
          600, 200, 150, // triangle
          this.grid!
        );

        if (!renderResult || !renderResult.canvas) {
          console.error("[Mode3F] render() failed or returned no canvas");
          return false;
        }

        this.pendingCanvas = renderResult.canvas;

        if (this.pendingCanvas.width === 0 || this.pendingCanvas.height === 0) {
          console.error("[Mode3F] Canvas has zero dimensions");
          return false;
        }

        console.log("[Mode3F] Canvas dimensions:", this.pendingCanvas.width, "x", this.pendingCanvas.height);
        console.log("[Mode3F] Adding canvas to texture and waiting for refresh");

        const textureKey = "__gpu_test_mode3f";
        if (scene.textures.exists(textureKey)) {
          scene.textures.remove(textureKey);
        }
        scene.textures.addCanvas(textureKey, this.pendingCanvas);

        // Try to refresh the texture
        const texture = scene.textures.get(textureKey);
        if (texture) {
          // Call refresh if available
          if (typeof (texture as any).refresh === 'function') {
            (texture as any).refresh();
            console.log("[Mode3F] Called texture.refresh()");
          }
          
          // Also try updateSource if available
          if (typeof (texture as any).updateSource === 'function') {
            (texture as any).updateSource();
            console.log("[Mode3F] Called texture.updateSource()");
          }
        }

        // Verify texture is ready
        if (!texture || !texture.frames || Object.keys(texture.frames).length === 0) {
          console.error("[Mode3F] Texture not ready after addCanvas");
          return false;
        }
        console.log("[Mode3F] Texture ready, frame count:", Object.keys(texture.frames).length);
        console.log("[Mode3F] Waiting", this.requiredFrames, "frame(s) before drawing...");
        
        this.frameWaitCount++;
        return false; // Not ready yet, will be called again next frame
      }

      // Second frame: draw after waiting
      if (this.frameWaitCount < this.requiredFrames) {
        this.frameWaitCount++;
        console.log(`[Mode3F] Frame ${this.frameWaitCount}/${this.requiredFrames} - waiting...`);
        return false; // Not ready yet, will be called again next frame
      }

      // Now draw after waiting
      console.log("[Mode3F] Frame wait complete, drawing to RenderTexture");
      const textureKey = "__gpu_test_mode3f";
      const texture = scene.textures.get(textureKey);
      
      if (!texture) {
        console.error("[Mode3F] Texture not found after frame wait");
        this.reset();
        return false;
      }

      if (!this.pendingCanvas) {
        console.error("[Mode3F] Pending canvas not found");
        this.reset();
        return false;
      }

      const tempImage = scene.add.image(0, 0, textureKey);
      tempImage.setVisible(false);
      
      tempImage.setDisplaySize(this.pendingCanvas.width, this.pendingCanvas.height);
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
      console.error("[Mode3F] Error:", error);
      this.reset();
      return false;
    }
  }

  private reset(): void {
    this.frameWaitCount = 0;
    this.pendingCanvas = null;
    this.pendingWidth = 0;
    this.pendingHeight = 0;
  }
}
