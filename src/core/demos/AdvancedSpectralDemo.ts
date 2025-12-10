/**
 * Advanced Spectral Demo
 *
 * Full spectral coloring with emission, dark mode, and advanced features.
 */

import { SpectralDemo, ShapeConfig } from "./SpectralDemo";
import { GameScene } from "../../scenes/GameScene";
import { ControlPanel } from "../ui";

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
