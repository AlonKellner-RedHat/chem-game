/**
 * Thermodynamics Demo
 *
 * Demo for the molar thermodynamics system with spectral rendering.
 * Showcases:
 * - Mole-based composition
 * - Container model with geometry
 * - Spectral rendering integration
 * - Property readouts (placeholders for future calculators)
 *
 * Design: docs/thermodynamics/19_Demo_Specification.md
 */

import type { GameScene } from '../../scenes/GameScene';
import { createWaterMaterial, type Material } from '../materials';
import type { MaterialProperties } from '../materials/Material';
import type { BackgroundMode } from '../physics/config';
import type { GPUShape } from '../rendering';
import {
  Container,
  type ContainerGeometry,
  createComposition,
  ETHANOL,
  getMoleFraction,
  initializeDefaultRegistry,
  isDefaultRegistryInitialized,
  SubstanceRegistry,
  WATER,
} from '../thermodynamics';
import { ControlPanel } from '../ui';
import type { Demo } from './Demo';

// Base design dimensions
const BASE_WIDTH = 1280;
const BASE_HEIGHT = 720;

/**
 * Container visualization configuration
 */
interface ContainerViz {
  id: string;
  name: string;
  container: Container;
  /** Normalized position (0-1) */
  nx: number;
  ny: number;
  /** Normalized size (0-1) */
  nw: number;
  nh: number;
  /** Pixel position (calculated) */
  x: number;
  y: number;
  width: number;
  height: number;
  /** GPU material */
  material: Material;
  /** Layer for rendering order */
  layer: number;
}

/**
 * Thermodynamics Demo
 */
export class ThermodynamicsDemo implements Demo {
  readonly name = 'Thermodynamics';
  readonly description = 'Molar thermodynamics simulation with spectral rendering';
  readonly usesGpuRenderer = true; // Uses GPU spectral rendering

  // State
  private substanceRegistry: SubstanceRegistry | null = null;
  private containers: ContainerViz[] = [];
  private backgroundMode: BackgroundMode = 'normal';
  private masksLoaded = false;
  private needsRender = true;
  private renderInProgress = false;

  // UI
  private uiContainer: HTMLElement | null = null;
  private uiScaleWrapper: HTMLElement | null = null;
  private controlPanels: ControlPanel[] = [];
  private panelWrappers: HTMLElement[] = [];
  private propertyPanel: HTMLElement | null = null;

  initialize(scene: GameScene): void {
    console.log('[ThermodynamicsDemo] Initialized');

    // Initialize substance registry
    if (!isDefaultRegistryInitialized()) {
      initializeDefaultRegistry();
    }
    this.substanceRegistry = new SubstanceRegistry();
    this.substanceRegistry.register(WATER);
    this.substanceRegistry.register(ETHANOL);

    // Get screen dimensions
    const canvas = scene.getCanvas();
    const screenWidth = canvas.width;
    const screenHeight = canvas.height;

    // Create containers with different compositions
    this.createContainers();

    // Calculate pixel positions
    this.updatePixelCoordinates(screenWidth, screenHeight);

    // Create UI
    this.createUI(scene);

    // Initial render
    this.updateRenderer(scene);
  }

  update(scene: GameScene): void {
    if (this.needsRender && !this.renderInProgress) {
      this.renderInProgress = true;
      this.updateRenderer(scene).finally(() => {
        this.renderInProgress = false;
      });
      this.needsRender = false;
    }

    // Update property display
    this.updatePropertyPanel();
  }

  resize(scene: GameScene, width: number, height: number): void {
    this.updatePixelCoordinates(width, height);
    this.updateUIScale(scene);
    this.needsRender = true;
  }

  cleanup(scene: GameScene): void {
    console.log('[ThermodynamicsDemo] Cleaned up');

    // Clean up UI
    for (const panel of this.controlPanels) {
      panel.destroy();
    }
    this.controlPanels = [];

    for (const wrapper of this.panelWrappers) {
      wrapper.remove();
    }
    this.panelWrappers = [];

    this.propertyPanel?.remove();
    this.propertyPanel = null;

    this.uiScaleWrapper?.remove();
    this.uiScaleWrapper = null;

    this.uiContainer?.remove();
    this.uiContainer = null;

    // Clean up containers
    this.containers = [];
  }

  // ============================================================================
  // Container Setup
  // ============================================================================

  private createContainers(): void {
    if (!this.substanceRegistry) return;

    const waterMaterial = createWaterMaterial();

    // Container geometries (beaker-like)
    const beakerGeometry: ContainerGeometry = {
      width: 6, // cm
      height: 10, // cm
      depth: 6, // cm
      crossSection: Math.PI * 3 * 3, // cm² (circular cross-section, r=3cm)
      capacity: 0.25, // L (250 mL)
    };

    // Container 1: Pure water
    const waterContainer = new Container(
      {
        id: 'water-beaker',
        name: 'Pure Water',
        geometry: beakerGeometry,
        initialComposition: createComposition({ H2O: 10.0 }), // 10 mol ≈ 180g ≈ 180mL
      },
      this.substanceRegistry
    );

    // Container 2: Pure ethanol
    const ethanolContainer = new Container(
      {
        id: 'ethanol-beaker',
        name: 'Pure Ethanol',
        geometry: beakerGeometry,
        initialComposition: createComposition({ C2H5OH: 3.0 }), // 3 mol ≈ 138g ≈ 175mL
      },
      this.substanceRegistry
    );

    // Container 3: Water-ethanol mixture
    const mixtureContainer = new Container(
      {
        id: 'mixture-beaker',
        name: 'Water-Ethanol Mix',
        geometry: beakerGeometry,
        initialComposition: createComposition({ H2O: 5.0, C2H5OH: 1.5 }), // ~50:50 by volume
      },
      this.substanceRegistry
    );

    // Create visualization configs
    this.containers = [
      {
        id: 'water-beaker',
        name: 'Pure Water',
        container: waterContainer,
        nx: 0.1,
        ny: 0.15,
        nw: 0.2,
        nh: 0.5,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        material: waterMaterial,
        layer: 1,
      },
      {
        id: 'ethanol-beaker',
        name: 'Pure Ethanol',
        container: ethanolContainer,
        nx: 0.4,
        ny: 0.15,
        nw: 0.2,
        nh: 0.5,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        material: waterMaterial, // Using water material for now (ethanol has similar optical properties)
        layer: 1,
      },
      {
        id: 'mixture-beaker',
        name: 'Water-Ethanol Mix',
        container: mixtureContainer,
        nx: 0.7,
        ny: 0.15,
        nw: 0.2,
        nh: 0.5,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        material: waterMaterial,
        layer: 1,
      },
    ];
  }

  private updatePixelCoordinates(screenWidth: number, screenHeight: number): void {
    for (const viz of this.containers) {
      viz.x = Math.floor(viz.nx * screenWidth);
      viz.y = Math.floor(viz.ny * screenHeight);
      viz.width = Math.floor(viz.nw * screenWidth);
      viz.height = Math.floor(viz.nh * screenHeight);
    }
  }

  // ============================================================================
  // GPU Renderer Integration
  // ============================================================================

  private async updateRenderer(scene: GameScene): Promise<void> {
    const renderer = scene.getRenderer();
    if (!renderer) return;

    // Load masks if needed
    if (!this.masksLoaded) {
      await renderer.loadMasks(['rectangle', 'circle']);
      this.masksLoaded = true;
    }

    const RENDER_SAMPLES = 32;

    // Generate material properties from container compositions
    const spectra: Float32Array[] = [];
    const gpuShapes: GPUShape[] = [];

    for (const viz of this.containers) {
      // Get spectral output from container
      const spectralOutput = viz.container.getSpectralOutput();

      // Build material properties from composition
      const state = viz.container.state;
      const properties: MaterialProperties = {
        moleFractions: {},
        pathLength: spectralOutput.pathLength,
        temperature: viz.container.temperature,
        pressure: viz.container.pressure / 101.325, // kPa to atm
      };

      // Generate spectrum
      const spectrum = viz.material.generateTransmissionSpectrum(
        100,
        1000,
        RENDER_SAMPLES,
        properties
      );
      spectra.push(spectrum);

      // Get mask indices
      const maskIndex = renderer.getMaskIndex('rectangle');
      const maskDims = renderer.getMaskDimensions('rectangle');

      // Create GPU shape with all required properties
      const gpuShape: GPUShape = {
        x: viz.x,
        y: viz.y,
        width: viz.width,
        height: viz.height * state.fillFraction, // Scale by fill level
        temperature: viz.container.temperature,
        layer: viz.layer,
        materialIndex: spectra.length - 1,
        msdfArrayIndex: maskIndex.msdfArrayIndex,
        msdfLayerIndex: maskIndex.msdfLayerIndex,
        texWidth: maskDims.width,
        texHeight: maskDims.height,
        alphaArrayIndex: maskIndex.alphaArrayIndex,
        alphaLayerIndex: maskIndex.alphaLayerIndex,
        hasMsdf: maskIndex.hasMsdf,
        hasAlpha: maskIndex.hasAlpha,
        smallParticleDensity: 0,
        largeParticleDensity: 0,
        fluorescenceQuantumYield: 0,
      };
      gpuShapes.push(gpuShape);
    }

    // Upload to renderer
    renderer.setMaterials(spectra);
    if (renderer.setRenderingMaterials) {
      renderer.setRenderingMaterials(spectra);
    }

    // Empty fluorescence data
    const emptyFluor = new Float32Array(RENDER_SAMPLES);
    renderer.setFluorescenceData(
      this.containers.map(() => emptyFluor),
      this.containers.map(() => emptyFluor)
    );

    // Empty reflection data
    if (renderer.setReflectionData) {
      renderer.setReflectionData(this.containers.map(() => emptyFluor));
    }
    if (renderer.setRenderingReflectionData) {
      renderer.setRenderingReflectionData(this.containers.map(() => emptyFluor));
    }

    renderer.setShapes(gpuShapes);
    renderer.setBackgroundMode(this.backgroundMode);
    renderer.setEmissionEnabled(false);
  }

  // ============================================================================
  // UI
  // ============================================================================

  private createUI(scene: GameScene): void {
    const canvas = scene.getCanvas();
    const parent = canvas.parentElement!;

    // Create container that matches canvas size
    this.uiContainer = document.createElement('div');
    this.uiContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: ${canvas.width}px;
      height: ${canvas.height}px;
      pointer-events: none;
      overflow: hidden;
    `;
    parent.style.position = 'relative';
    parent.appendChild(this.uiContainer);

    // Create scaled wrapper
    this.uiScaleWrapper = document.createElement('div');
    this.uiScaleWrapper.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: ${BASE_WIDTH}px;
      height: ${BASE_HEIGHT}px;
      transform-origin: top left;
      pointer-events: none;
    `;
    this.uiContainer.appendChild(this.uiScaleWrapper);

    // Apply initial scale
    this.updateUIScale(scene);

    // Create title
    const title = document.createElement('div');
    title.style.cssText = `
      position: absolute;
      top: 10px;
      left: 20px;
      font-family: "JetBrains Mono", monospace;
      font-size: 24px;
      font-weight: bold;
      color: #eee;
      text-shadow: 1px 1px 3px rgba(0,0,0,0.5);
      pointer-events: none;
    `;
    title.textContent = 'Thermodynamics Demo';
    this.uiScaleWrapper.appendChild(title);

    // Create subtitle
    const subtitle = document.createElement('div');
    subtitle.style.cssText = `
      position: absolute;
      top: 40px;
      left: 20px;
      font-family: "JetBrains Mono", monospace;
      font-size: 14px;
      color: #aaa;
      pointer-events: none;
    `;
    subtitle.textContent = 'Molar Properties Simulation · Press M for menu';
    this.uiScaleWrapper.appendChild(subtitle);

    // Create control panels for each container
    this.createContainerControls(scene);

    // Create property panel
    this.createPropertyPanel();
  }

  private updateUIScale(scene: GameScene): void {
    if (!this.uiContainer || !this.uiScaleWrapper) return;

    const { width, height } = scene.getDimensions();
    const scale = Math.min(width / BASE_WIDTH, height / BASE_HEIGHT);

    this.uiContainer.style.width = `${width}px`;
    this.uiContainer.style.height = `${height}px`;
    this.uiScaleWrapper.style.transform = `scale(${scale})`;
  }

  private createContainerControls(scene: GameScene): void {
    if (!this.uiScaleWrapper) return;

    // Create a control panel under each container
    for (let i = 0; i < this.containers.length; i++) {
      const viz = this.containers[i];
      const panelX = viz.nx * BASE_WIDTH;
      const panelY = (viz.ny + viz.nh) * BASE_HEIGHT + 10;

      // Create positioned wrapper for the panel
      const wrapper = document.createElement('div');
      wrapper.style.cssText = `
        position: absolute;
        left: ${panelX}px;
        top: ${panelY}px;
        pointer-events: auto;
      `;
      this.uiScaleWrapper.appendChild(wrapper);
      this.panelWrappers.push(wrapper);

      const panel = new ControlPanel(wrapper, {
        title: viz.name,
        width: viz.nw * BASE_WIDTH,
      });

      // Water mole slider
      panel.addSlider('water', {
        min: 0,
        max: 15,
        value: viz.container.composition.moles.get('H2O') ?? 0,
        logarithmic: false,
        label: 'Water (mol)',
        onChange: (value) => {
          this.updateContainerComposition(i, 'H2O', value);
        },
      });

      // Ethanol mole slider
      panel.addSlider('ethanol', {
        min: 0,
        max: 5,
        value: viz.container.composition.moles.get('C2H5OH') ?? 0,
        logarithmic: false,
        label: 'Ethanol (mol)',
        onChange: (value) => {
          this.updateContainerComposition(i, 'C2H5OH', value);
        },
      });

      this.controlPanels.push(panel);
    }
  }

  private updateContainerComposition(
    containerIndex: number,
    substanceId: string,
    moles: number
  ): void {
    const viz = this.containers[containerIndex];
    if (!viz) return;

    // Get current composition and update
    const currentMoles = new Map(viz.container.composition.moles);
    if (moles > 0.001) {
      currentMoles.set(substanceId, moles);
    } else {
      currentMoles.delete(substanceId);
    }

    // Create new composition
    const newComp: Record<string, number> = {};
    for (const [id, m] of currentMoles) {
      newComp[id] = m;
    }

    viz.container.setComposition(createComposition(newComp));
    this.needsRender = true;
  }

  private createPropertyPanel(): void {
    if (!this.uiScaleWrapper) return;

    this.propertyPanel = document.createElement('div');
    this.propertyPanel.style.cssText = `
      position: absolute;
      bottom: 20px;
      left: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.7);
      border-radius: 8px;
      padding: 15px 20px;
      font-family: "JetBrains Mono", monospace;
      font-size: 12px;
      color: #ccc;
      pointer-events: none;
    `;
    this.uiScaleWrapper.appendChild(this.propertyPanel);

    this.updatePropertyPanel();
  }

  private updatePropertyPanel(): void {
    if (!this.propertyPanel) return;

    const rows: string[] = [];
    rows.push('<div style="display: flex; gap: 40px; flex-wrap: wrap;">');

    for (const viz of this.containers) {
      const state = viz.container.state;
      const waterFrac = getMoleFraction(state.composition, 'H2O');
      const ethanolFrac = getMoleFraction(state.composition, 'C2H5OH');

      rows.push(`
        <div style="min-width: 200px;">
          <div style="color: #fff; font-weight: bold; margin-bottom: 8px;">${viz.name}</div>
          <div>Fill: ${(state.fillFraction * 100).toFixed(1)}%</div>
          <div>Water: ${(waterFrac * 100).toFixed(1)}%</div>
          <div>Ethanol: ${(ethanolFrac * 100).toFixed(1)}%</div>
          <div style="color: #888; margin-top: 4px;">T: ${state.temperature.toFixed(1)} K</div>
          <div style="color: #888;">P: ${state.pressure.toFixed(1)} kPa</div>
          <div style="color: #666; font-style: italic; margin-top: 4px;">
            Volume: <span style="color: #4a9eff;">TBD</span> ·
            Density: <span style="color: #4a9eff;">TBD</span>
          </div>
        </div>
      `);
    }

    rows.push('</div>');
    rows.push('<div style="margin-top: 10px; color: #666; font-size: 11px;">');
    rows.push(
      'Property calculations will be added as thermodynamics calculators are registered (OCP extension points).'
    );
    rows.push('</div>');

    this.propertyPanel.innerHTML = rows.join('');
  }
}
