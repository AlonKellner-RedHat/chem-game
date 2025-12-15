/**
 * Advanced Spectral Demo
 *
 * Full spectral coloring with emission, dark mode, and advanced features.
 */

import { SpectralDemo, ShapeConfig } from "./SpectralDemo";
import { GameScene } from "../../scenes/GameScene";
import { ControlPanel } from "../ui";
import { createGoldMaterial, createDefaultProperties } from "../materials";

export class AdvancedSpectralDemo extends SpectralDemo {
  readonly name = "Advanced Spectral Coloring";
  readonly description =
    "Physics-based spectral absorption, emission, and scattering";

  // Enable advanced features
  protected enableEmission = true;
  protected enableDarkMode = true;

  // Emission aura parameters
  protected emissionSpreadFactor = 0.3; // Default: 30% of emission spreads sideways
  protected emissionAuraSigma = 3.0; // Default: 3 pixel blur sigma

  override initialize(scene: GameScene): void {
    // Call parent to set up base shapes
    super.initialize(scene);

    // Get screen dimensions for pixel coordinate calculation
    const canvas = scene.getCanvas();
    const screenWidth = canvas.width;
    const screenHeight = canvas.height;

    // Add gold square to the demo with normalized coordinates
    const goldMaterial = createGoldMaterial();
    const goldShape: ShapeConfig = {
      id: "gold-square",
      name: "Gold Square",
      maskName: "rectangle",
      // Normalized: x:410/1280, y:120/720, 100/1280 x 100/720
      nx: 0.3203125, ny: 0.166667, nw: 0.078125, nh: 0.138889,
      // Pixel coords (computed below)
      x: 0, y: 0, width: 0, height: 0,
      layer: 4, // Front layer (after triangle which is layer 3)
      material: goldMaterial,
      properties: {
        ...createDefaultProperties(goldMaterial),
        pathLength: 1.0, // 1cm depth
      },
      smallParticleDensity: 0,
      largeParticleDensity: 0,
    };

    this.shapes.push(goldShape);

    // Compute pixel coordinates for the gold square
    this.updateShapePixelCoordinates(screenWidth, screenHeight);

    // Trigger re-render to include the new shape
    this.needsRender = true;
  }

  protected override async updateRenderer(scene: GameScene): Promise<void> {
    await super.updateRenderer(scene);

    const renderer = scene.getRenderer();
    if (!renderer) return;

    // Set emission aura parameters
    renderer.setEmissionSpreadFactor?.(this.emissionSpreadFactor);
    renderer.setEmissionAuraSigma?.(this.emissionAuraSigma);
  }

  protected override createControlPanel(
    scene: GameScene,
    shape: ShapeConfig,
    x: number,
    y: number
  ): ControlPanel {
    const panel = super.createControlPanel(scene, shape, x, y);

    // Add global emission aura controls (only to the first shape's panel)
    if (shape === this.shapes[0]) {
      panel.addSlider("emissionSpread", {
        min: 0,
        max: 1,
        value: this.emissionSpreadFactor,
        logarithmic: false,
        label: "Emission Spread",
        onChange: (value) => {
          this.emissionSpreadFactor = value;
          this.needsRender = true;
        },
      });

      panel.addSlider("emissionAuraSigma", {
        min: 0,
        max: 20,
        value: this.emissionAuraSigma,
        logarithmic: false,
        label: "Emission Aura Size",
        onChange: (value) => {
          this.emissionAuraSigma = value;
          this.needsRender = true;
        },
      });
    }

    return panel;
  }
}
