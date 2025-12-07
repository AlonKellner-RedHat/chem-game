import { GameScene } from "../../../scenes/GameScene";
import { BaseModeStrategy } from "./ModeStrategy";

/**
 * Mode 3E: Direct Canvas Draw (No Texture)
 * Test if the issue is with texture upload or canvas itself
 * Get GPU-rendered canvas
 * Create a Phaser Image directly from canvas (using scene.add.image())
 * Display the Image directly (skip RenderTexture)
 * Tests: Is the canvas itself displayable, or is it the texture upload?
 */
export class Mode3E_DirectCanvasDraw extends BaseModeStrategy {
  private directImage: Phaser.GameObjects.Image | null = null;

  getDescription(): string {
    return "Mode 3E: Direct canvas display - test if canvas is displayable without texture upload";
  }

  execute(scene: GameScene, renderTexture: Phaser.GameObjects.RenderTexture | null): boolean {
    try {
      // Clean up previous direct image
      if (this.directImage) {
        this.directImage.destroy();
        this.directImage = null;
      }

      // Hide the renderTexture for this test
      if (renderTexture) {
        renderTexture.setVisible(false);
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
      console.log("[Mode3E] Calling gpuRenderer.render() with bounds:", bounds);
      const renderResult = this.gpuRenderer!.render(
        scene,
        bounds,
        200, 200, 150, // square
        400, 200, 75,  // circle
        600, 200, 150, // triangle
        this.grid!
      );

      if (!renderResult || !renderResult.canvas) {
        console.error("[Mode3E] render() failed or returned no canvas");
        return false;
      }

      const canvas = renderResult.canvas;

      if (canvas.width === 0 || canvas.height === 0) {
        console.error("[Mode3E] Canvas has zero dimensions");
        return false;
      }

      console.log("[Mode3E] Canvas dimensions:", canvas.width, "x", canvas.height);
      console.log("[Mode3E] Creating Phaser Image directly from canvas (skipping RenderTexture)");

      const textureKey = "__gpu_test_mode3e";
      if (scene.textures.exists(textureKey)) {
        scene.textures.remove(textureKey);
      }
      scene.textures.addCanvas(textureKey, canvas);

      // Verify texture is ready
      const texture = scene.textures.get(textureKey);
      if (!texture || !texture.frames || Object.keys(texture.frames).length === 0) {
        console.error("[Mode3E] Texture not ready after addCanvas");
        return false;
      }
      console.log("[Mode3E] Texture ready, frame count:", Object.keys(texture.frames).length);

      // Create Image directly (not using RenderTexture)
      this.directImage = scene.add.image(0, 0, textureKey);
      this.directImage.setDisplaySize(width, height);
      this.directImage.setOrigin(0, 0);
      this.directImage.setVisible(true);
      this.directImage.setDepth(-1000);
      scene.children.bringToTop(this.directImage);

      console.log("[Mode3E] Direct Image created and displayed");

      // Check if image has valid texture
      const hasContent =
        this.directImage.texture &&
        (this.directImage.texture as any).width > 0 &&
        (this.directImage.texture as any).height > 0;
      
      return hasContent;
    } catch (error) {
      console.error("[Mode3E] Error:", error);
      return false;
    }
  }
}

