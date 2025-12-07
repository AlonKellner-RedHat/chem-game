import { GameScene } from "../../../scenes/GameScene";
import { MaterialRegistry } from "../../spectral/registry/MaterialRegistry";
import { WaterMaterial } from "../../spectral/materials/WaterMaterial";
import { CrystalMaterial } from "../../spectral/materials/CrystalMaterial";
import { GasMaterial } from "../../spectral/materials/GasMaterial";
import { GPUPixelRenderer } from "../../spectral/renderers/GPUPixelRenderer";
import { Grid } from "../../Grid";
import { calculateRGBBackgroundSpectrum } from "../spectral/SpectralCalculations";
import { SolutionProperties } from "../../spectral/SolutionProperties";

/**
 * Strategy interface for GPU demo modes
 * Follows Open-Closed Principle - new modes can be added without modifying existing code
 */
export interface ModeStrategy {
  /**
   * Execute the mode and return whether it succeeded
   * @param scene The game scene
   * @param renderTexture The shared RenderTexture instance
   * @returns true if the mode executed successfully
   */
  execute(scene: GameScene, renderTexture: Phaser.GameObjects.RenderTexture | null): boolean;

  /**
   * Get a description of what this mode tests
   */
  getDescription(): string;
}

/**
 * Base class for modes with common utilities
 */
export abstract class BaseModeStrategy implements ModeStrategy {
  protected materialRegistry: MaterialRegistry | null = null;
  protected gpuRenderer: GPUPixelRenderer | null = null;
  protected grid: Grid | null = null;

  abstract execute(scene: GameScene, renderTexture: Phaser.GameObjects.RenderTexture | null): boolean;
  abstract getDescription(): string;

  /**
   * Setup GPU renderer and materials (shared across modes)
   */
  protected setupGPURenderer(scene: GameScene): boolean {

    // Initialize material registry
    if (!this.materialRegistry) {
      this.materialRegistry = new MaterialRegistry();
      this.materialRegistry.register(new WaterMaterial());
      this.materialRegistry.register(new CrystalMaterial());
      this.materialRegistry.register(new GasMaterial());
    }

    // Initialize GPU renderer
    if (!this.gpuRenderer) {
      this.gpuRenderer = new GPUPixelRenderer();
      const renderer = scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
      if (renderer && renderer.gl) {
        try {
          this.gpuRenderer.initialize(renderer.gl);
        } catch (error) {
          console.error("[ModeStrategy] GPU renderer initialization failed:", error);
          return false;
        }
      } else {
        console.error("[ModeStrategy] No WebGL context available");
        return false;
      }
    }

    // Initialize grid
    if (!this.grid) {
      this.grid = new Grid(20); // cellSize = 20
    }

    if (!this.gpuRenderer.isAvailable()) {
      console.error("[ModeStrategy] GPU renderer not available");
      return false;
    }

    // Get materials
    const squareMaterial = this.materialRegistry.get("water");
    const circleMaterial = this.materialRegistry.get("crystal");
    const triangleMaterial = this.materialRegistry.get("gas");

    if (!squareMaterial || !circleMaterial || !triangleMaterial) {
      console.error("[ModeStrategy] Materials not found");
      return false;
    }

    // Create default properties
    const createDefaultProperties = (): SolutionProperties => ({
      moleculeConcentrations: new Map(),
      temperature: 298,
      pressure: 1.0,
      depth: 0.01,
      bubbleDensity: 0.0,
      particleDensity: 0.0,
      particleSize: 0.0,
      phase: "liquid",
    });

    const backgroundSpectrum = calculateRGBBackgroundSpectrum();

    // Update material textures
    this.gpuRenderer.updateMaterialTextures(
      squareMaterial,
      createDefaultProperties(),
      circleMaterial,
      createDefaultProperties(),
      triangleMaterial,
      createDefaultProperties(),
      backgroundSpectrum
    );

    return true;
  }

  /**
   * Create a test pattern canvas (for baseline modes)
   */
  protected createTestPattern(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;

    // Gradient background (red to blue)
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#ff0000");
    gradient.addColorStop(0.5, "#00ff00");
    gradient.addColorStop(1, "#0000ff");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Checkerboard pattern overlay
    const cellSize = 50;
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    for (let y = 0; y < height; y += cellSize) {
      for (let x = 0; x < width; x += cellSize) {
        if ((x / cellSize + y / cellSize) % 2 === 0) {
          ctx.fillRect(x, y, cellSize, cellSize);
        }
      }
    }

    return canvas;
  }

  /**
   * Apply Mode 1 pattern to display RenderTexture (proven working approach)
   */
  protected applyMode1DisplayPattern(
    scene: GameScene,
    renderTexture: Phaser.GameObjects.RenderTexture,
    width: number,
    height: number
  ): void {
    renderTexture.setDisplaySize(width, height);
    renderTexture.setVisible(true);
    renderTexture.setActive(true);
    renderTexture.setDepth(-1000);
    renderTexture.setPosition(0, 0);
    renderTexture.setOrigin(0, 0);
    if (!scene.children.list.includes(renderTexture)) {
      scene.children.add(renderTexture);
    }
    // Note: Removed bringToTop() as it was overriding depth and putting RenderTexture above UI
  }
}

