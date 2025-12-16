/**
 * Spectral Demo
 *
 * Core spectral coloring demo with absorption and transmission.
 */

import type { GameScene } from '../../scenes/GameScene';
import { toPixelRect } from '../geometry/CoordinateTransformer';
import {
  createCrystalMaterial,
  createDefaultProperties,
  createGasMaterial,
  createWaterMaterial,
  type Material,
  type MaterialProperties,
} from '../materials';
import type { BackgroundMode } from '../physics/config';
import type { GPUShape } from '../rendering';
import { profiler } from '../rendering/Profiler';
import { ControlPanel, RadioButtonGroup, SpectralGraph } from '../ui';
import type { Demo } from './Demo';

export interface ShapeConfig {
  id: string;
  name: string;
  maskName: string; // Name of mask file (without .mask extension)

  // Normalized coordinates (0-1 range, relative to screen dimensions)
  // These define the shape's position and size as percentages
  nx: number; // Normalized x position (0 = left edge, 1 = right edge)
  ny: number; // Normalized y position (0 = top edge, 1 = bottom edge)
  nw: number; // Normalized width (0 = zero, 1 = full screen width)
  nh: number; // Normalized height (0 = zero, 1 = full screen height)

  // Pixel coordinates (computed from normalized coords and screen size)
  x: number;
  y: number;
  width: number;
  height: number;

  layer: number; // Render order (0 = background)
  material: Material;
  properties: MaterialProperties;
  // Scattering particle densities (particles/cm³)
  smallParticleDensity: number; // Rayleigh scattering (nanoparticles)
  largeParticleDensity: number; // Mie scattering (microparticles)
}

// Base design dimensions (UI is designed at this size)
const BASE_WIDTH = 1280;
const BASE_HEIGHT = 720;

export class SpectralDemo implements Demo {
  readonly name: string = 'Spectral Coloring';
  readonly description: string = 'Physics-based spectral absorption and transmission';

  // Configuration
  protected enableEmission = false;
  protected enableDarkMode = false;

  // Shapes
  protected shapes: ShapeConfig[] = [];
  protected backgroundMode: BackgroundMode = 'normal';
  protected uvMode = false;

  // UI
  protected controlPanels: ControlPanel[] = [];
  protected spectralGraph: SpectralGraph | null = null;
  protected ambientModeRadio: RadioButtonGroup<BackgroundMode> | null = null;
  protected uiContainer: HTMLElement | null = null;
  protected uiScaleWrapper: HTMLElement | null = null;
  protected measurementIndicator: HTMLElement | null = null;
  protected profilingOverlay: HTMLElement | null = null;
  protected profilingVisible = false;

  // Masks
  protected masksLoaded = false;
  protected masksLoadingPromise: Promise<void> | null = null; // Prevent race conditions
  protected renderInProgress = false;
  protected debugReportInProgress = false; // Block auto-renders during debug capture

  // State
  protected needsRender = true;
  protected mouseX = -1;
  protected mouseY = -1;
  protected lockedX = -1;
  protected lockedY = -1;
  protected isSpectrumLocked = false;
  protected mouseMoveHandler: ((e: MouseEvent) => void) | null = null;
  protected keyHandler: ((e: KeyboardEvent) => void) | null = null;

  initialize(scene: GameScene): void {
    console.log(`[${this.name}] Initialized`);

    // Get actual screen dimensions from canvas
    const canvas = scene.getCanvas();
    const screenWidth = canvas.width;
    const screenHeight = canvas.height;

    // Create materials
    const waterMaterial = createWaterMaterial();
    const crystalMaterial = createCrystalMaterial();
    const gasMaterial = createGasMaterial();

    // Background layer materials - opaque (0% transmission), only visible via ambient reflection
    //
    // The background layer consists of two shapes with multiplicative compounding:
    // 1. bg-base: Full-screen with 100% reflection (no mask)
    // 2. bg-grid: Circle-grid with variable reflection (MSDF + alpha gradients)
    //
    // With multiplicative compounding:
    // - Outside circles: 100% × 100% = 100% reflection
    // - Inside circles: 100% × (60% × reflectionFactor) = varies by alpha gradient

    // Full-screen background material: 100% reflection, 0% transmission
    const bgBaseMaterial: Material = {
      id: 'bg-base',
      name: 'Background Base',
      molecules: [],
      bandGap: 0,
      uvCutoff: 0,
      baseAbsorption: { id: 'none', getExtinction: () => 0 },
      baseMolarConcentration: 1,
      getBaseMoleFraction: () => 1.0,
      generateTransmissionSpectrum: (_minWl: number, _maxWl: number, resolution: number) => {
        // 0% transmission - completely opaque to backlight
        return new Float32Array(resolution).fill(0.0);
      },
      generateFluorescenceTextures: (_minWl: number, _maxWl: number, resolution: number) => {
        return {
          excitation: new Float32Array(resolution).fill(0),
          emission: new Float32Array(resolution).fill(0),
          totalQuantumYield: 0,
        };
      },
      generateReflectionSpectrum: (_minWl: number, _maxWl: number, resolution: number) => {
        // 100% reflection - full brightness from ambient light
        return new Float32Array(resolution).fill(1.0);
      },
    };

    // Circle-grid overlay material: 60% reflection, 0% transmission
    const bgGridMaterial: Material = {
      id: 'bg-grid',
      name: 'Background Grid',
      molecules: [],
      bandGap: 0,
      uvCutoff: 0,
      baseAbsorption: { id: 'none', getExtinction: () => 0 },
      baseMolarConcentration: 1,
      getBaseMoleFraction: () => 1.0,
      generateTransmissionSpectrum: (_minWl: number, _maxWl: number, resolution: number) => {
        // 0% transmission - completely opaque to backlight
        return new Float32Array(resolution).fill(0.0);
      },
      generateFluorescenceTextures: (_minWl: number, _maxWl: number, resolution: number) => {
        return {
          excitation: new Float32Array(resolution).fill(0),
          emission: new Float32Array(resolution).fill(0),
          totalQuantumYield: 0,
        };
      },
      generateReflectionSpectrum: (_minWl: number, _maxWl: number, resolution: number) => {
        // 60% reflection - darker pattern overlaid on base
        return new Float32Array(resolution).fill(0.6);
      },
    };

    // Create shapes with normalized coordinates (0-1 range)
    // Pixel coordinates are computed from normalized coords on init and resize
    this.shapes = [
      // Background layer (layer 0): Two shapes with multiplicative compounding
      // bg-base provides full ambient reflection outside circles
      // bg-grid provides the circle pattern with alpha gradient modulation
      {
        id: 'bg-base',
        name: 'Background Base',
        maskName: '', // No mask = full coverage (reflection factor = 1.0 everywhere)
        // Normalized: full screen
        nx: 0,
        ny: 0,
        nw: 1,
        nh: 1,
        // Pixel coords (computed below)
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        layer: 0, // Background layer
        material: bgBaseMaterial,
        properties: createDefaultProperties(bgBaseMaterial),
        smallParticleDensity: 0,
        largeParticleDensity: 0,
      },
      {
        id: 'bg-grid',
        name: 'Background Grid',
        maskName: 'diagonal-circle-grid', // Diagonal grid with alpha gradients (RTL + radial from bottom-left)
        // Normalized: full screen
        nx: 0,
        ny: 0,
        nw: 1,
        nh: 1,
        // Pixel coords (computed below)
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        layer: 0, // Same layer - compounds multiplicatively with bg-base
        material: bgGridMaterial,
        properties: createDefaultProperties(bgGridMaterial),
        smallParticleDensity: 0,
        largeParticleDensity: 0,
      },
      // Foreground shapes (layer 1+)
      {
        id: 'square',
        name: 'Square (Water)',
        maskName: 'rectangle',
        // Normalized: x:20/1280, y:80/720, 200/1280 x 200/720
        nx: 0.015625,
        ny: 0.111111,
        nw: 0.15625,
        nh: 0.277778,
        // Pixel coords (computed below)
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        layer: 1, // Back layer
        material: waterMaterial,
        properties: createDefaultProperties(waterMaterial),
        smallParticleDensity: 0, // Start with no scattering, user can adjust
        largeParticleDensity: 0,
      },
      {
        id: 'circle',
        name: 'Circle (Crystal)',
        maskName: 'circle',
        // Normalized: x:150/1280, y:80/720, 200/1280 x 200/720
        nx: 0.117188,
        ny: 0.111111,
        nw: 0.15625,
        nh: 0.277778,
        // Pixel coords (computed below)
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        layer: 2, // Middle layer
        material: crystalMaterial,
        properties: createDefaultProperties(crystalMaterial),
        smallParticleDensity: 0, // Start with no scattering, user can adjust
        largeParticleDensity: 0,
      },
      {
        id: 'triangle',
        name: 'Triangle (Gas)',
        maskName: 'triangle',
        // Normalized: x:280/1280, y:80/720, 200/1280 x 200/720
        nx: 0.21875,
        ny: 0.111111,
        nw: 0.15625,
        nh: 0.277778,
        // Pixel coords (computed below)
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        layer: 3, // Front layer
        material: gasMaterial,
        properties: createDefaultProperties(gasMaterial),
        smallParticleDensity: 0, // No scattering for gas (particles too sparse)
        largeParticleDensity: 0,
      },
    ];

    // Compute pixel coordinates from normalized coordinates
    this.updateShapePixelCoordinates(screenWidth, screenHeight);

    // Create UI
    this.createUI(scene);

    // Setup mouse tracking for spectrum sampling
    // (canvas already declared at top of initialize)
    this.mouseMoveHandler = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      this.mouseX = Math.floor((e.clientX - rect.left) * scaleX);
      this.mouseY = Math.floor((e.clientY - rect.top) * scaleY);
    };
    canvas.addEventListener('mousemove', this.mouseMoveHandler);

    // Setup keyboard handler
    this.keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') {
        this.reset?.(scene);
      } else if (e.key === 'l' || e.key === 'L') {
        // Toggle spectrum lock
        if (this.isSpectrumLocked) {
          // Unlock
          this.isSpectrumLocked = false;
          this.lockedX = -1;
          this.lockedY = -1;
          this.spectralGraph?.setLockedPosition(null, null);
        } else {
          // Lock at current mouse position
          if (this.mouseX >= 0 && this.mouseY >= 0) {
            this.isSpectrumLocked = true;
            this.lockedX = this.mouseX;
            this.lockedY = this.mouseY;
            this.spectralGraph?.setLockedPosition(this.lockedX, this.lockedY);
          }
        }
      } else if (e.key === 'p' || e.key === 'P') {
        // Toggle profiling overlay
        this.profilingVisible = !this.profilingVisible;
        if (this.profilingOverlay) {
          this.profilingOverlay.style.display = this.profilingVisible ? 'block' : 'none';
        }
        // Set profiler logging mode
        profiler.setLoggingMode(this.profilingVisible ? 'summary' : 'silent');

        // Set compute pipeline reference when opening overlay
        if (this.profilingVisible) {
          const pipeline = scene.getRenderer()?.getComputePipeline();
          if (pipeline) {
            profiler.setComputePipeline(pipeline);
          }
        }
      } else if (e.key === 'g' || e.key === 'G') {
        // Toggle GPU profiling (detailed dispatch-level analysis)
        if (this.profilingVisible) {
          const newState = !profiler.isGPUProfilingEnabled();
          profiler.setGPUProfilingEnabled(newState);
        }
      } else if (e.key === 'd' || e.key === 'D') {
        // Download profiling report (only if overlay is visible)
        if (this.profilingVisible) {
          profiler.downloadReport();
        }
      }
    };
    document.addEventListener('keydown', this.keyHandler);

    // Initial render (async, but we don't need to wait)
    this.updateRenderer(scene);
  }

  update(scene: GameScene): void {
    // Skip auto-renders during debug report generation
    if (this.debugReportInProgress) return;

    if (this.needsRender && !this.renderInProgress) {
      this.renderInProgress = true;
      this.updateRenderer(scene).finally(() => {
        this.renderInProgress = false;
      });
      this.needsRender = false;
    }

    // Update spectrum graph with current mouse position
    this.updateSpectrumGraph(scene);

    // Update profiling overlay if visible
    if (this.profilingVisible && this.profilingOverlay) {
      this.updateProfilingOverlay();
    }
  }

  /**
   * Reset the demo to initial state
   */
  reset(scene: GameScene): void {
    // Reset all shape properties to defaults
    for (const shape of this.shapes) {
      const defaults = createDefaultProperties(shape.material);
      shape.properties = defaults;
    }

    // Reset UI sliders (only for foreground shapes with panels)
    let panelIndex = 0;
    for (const shape of this.shapes) {
      if (shape.layer === 0) continue; // Skip background shapes

      const panel = this.controlPanels[panelIndex];
      if (!panel) continue;

      // Reset mole fraction sliders
      for (const molecule of shape.material.molecules) {
        panel.setSliderValue(molecule.id, shape.properties.moleFractions[molecule.id] || 0.0001);
      }

      // Reset depth slider
      panel.setSliderValue('depth', shape.properties.pathLength);

      // Reset temperature slider if present
      if (this.enableEmission) {
        panel.setSliderValue('temperature', shape.properties.temperature);
      }

      // Reset pressure slider for gas materials
      if (shape.material.id === 'gas') {
        panel.setSliderValue('pressure', shape.properties.pressure);
      }

      // Reset scattering sliders for condensed materials
      if (shape.material.id === 'water' || shape.material.id === 'crystal') {
        panel.setSliderValue('smallParticles', shape.smallParticleDensity);
        panel.setSliderValue('largeParticles', shape.largeParticleDensity);
      }

      panelIndex++;
    }

    // Reset background mode
    this.backgroundMode = 'normal';
    this.uvMode = false;
    this.ambientModeRadio?.setValue('normal', false);

    // Reset spectrum lock
    this.isSpectrumLocked = false;
    this.lockedX = -1;
    this.lockedY = -1;
    this.spectralGraph?.setLockedPosition(null, null);

    // Reset spectral graph zoom/range
    this.spectralGraph?.resetZoom();

    this.needsRender = true;
    console.log(`[${this.name}] Reset to initial state`);
  }

  /**
   * Update the spectrum graph with data at mouse or locked position
   */
  protected async updateSpectrumGraph(scene: GameScene): Promise<void> {
    if (!this.spectralGraph) return;

    const renderer = scene.getRenderer();
    if (!renderer) return;

    // Use global max spectral intensity for plot normalization
    // This ensures the plot scales with the scene when shapes exceed D65 temperature
    this.spectralGraph.setGlobalMax(renderer.getGlobalMaxSpectral());

    // Use locked position if locked, otherwise use mouse position
    const sampleX = this.isSpectrumLocked ? this.lockedX : this.mouseX;
    const sampleY = this.isSpectrumLocked ? this.lockedY : this.mouseY;

    // Update measurement indicator position and style
    this.updateMeasurementIndicator(scene, sampleX, sampleY);

    // Sample spectrum at position
    if (sampleX >= 0 && sampleY >= 0) {
      const { width, height } = scene.getDimensions();
      if (sampleX < width && sampleY < height) {
        const spectrum = await renderer.sampleSpectrum(sampleX, sampleY);
        if (spectrum.length > 0) {
          this.spectralGraph.setSpectrum(spectrum);
        }
      }
    }
  }

  /**
   * Update the measurement indicator circle position and appearance
   */
  protected updateMeasurementIndicator(scene: GameScene, x: number, y: number): void {
    if (!this.measurementIndicator) return;

    const { width, height } = scene.getDimensions();

    // Hide indicator if position is invalid
    if (x < 0 || y < 0 || x >= width || y >= height) {
      this.measurementIndicator.style.display = 'none';
      return;
    }

    // Show indicator
    this.measurementIndicator.style.display = 'block';

    // Scale the position from canvas coordinates to UI coordinates (base dimensions)
    const scaleX = BASE_WIDTH / width;
    const scaleY = BASE_HEIGHT / height;
    const uiX = x * scaleX;
    const uiY = y * scaleY;

    // Update position
    this.measurementIndicator.style.left = `${uiX}px`;
    this.measurementIndicator.style.top = `${uiY}px`;

    // Update style based on locked state
    if (this.isSpectrumLocked) {
      // Locked: more prominent indicator with solid border
      this.measurementIndicator.style.borderColor = 'rgba(100, 200, 255, 0.9)';
      this.measurementIndicator.style.background = 'rgba(100, 200, 255, 0.3)';
      this.measurementIndicator.style.borderWidth = '2px';
      this.measurementIndicator.style.boxShadow = '0 0 8px rgba(100, 200, 255, 0.5)';
    } else {
      // Unlocked: subtle indicator
      this.measurementIndicator.style.borderColor = 'rgba(255, 255, 255, 0.8)';
      this.measurementIndicator.style.background = 'rgba(255, 255, 255, 0.2)';
      this.measurementIndicator.style.borderWidth = '2px';
      this.measurementIndicator.style.boxShadow = '0 0 4px rgba(0, 0, 0, 0.5)';
    }
  }

  /**
   * Update the profiling overlay display
   */
  protected updateProfilingOverlay(): void {
    if (!this.profilingOverlay) return;

    const lines = profiler.getDisplayText();
    let html = '';

    for (const line of lines) {
      // Parse color hints from format "text [color]"
      const match = line.match(/^(.+) \[(green|yellow|red)\]$/);
      if (match) {
        const colorMap: { [key: string]: string } = {
          green: '#4f4',
          yellow: '#ff4',
          red: '#f44',
        };
        html += `<div style="color: ${colorMap[match[2]] || '#fff'}">${match[1]}</div>`;
      } else if (line === '---') {
        html +=
          '<hr style="border: none; border-top: 1px solid rgba(255,255,255,0.2); margin: 4px 0;">';
      } else {
        html += `<div>${line}</div>`;
      }
    }

    this.profilingOverlay.innerHTML = html;
  }

  cleanup(scene: GameScene): void {
    console.log(`[${this.name}] Cleaned up`);

    // Remove event listeners
    const canvas = scene.getCanvas();
    if (this.mouseMoveHandler) {
      canvas.removeEventListener('mousemove', this.mouseMoveHandler);
      this.mouseMoveHandler = null;
    }
    if (this.keyHandler) {
      document.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }

    // Remove UI
    for (const panel of this.controlPanels) {
      panel.destroy();
    }
    this.controlPanels = [];

    this.spectralGraph?.destroy();
    this.spectralGraph = null;

    this.ambientModeRadio?.destroy();
    this.ambientModeRadio = null;

    this.measurementIndicator?.remove();
    this.measurementIndicator = null;

    this.profilingOverlay?.remove();
    this.profilingOverlay = null;

    this.uiScaleWrapper?.remove();
    this.uiScaleWrapper = null;
    this.uiContainer?.remove();
    this.uiContainer = null;

    this.shapes = [];
  }

  protected createUI(scene: GameScene): void {
    const canvas = scene.getCanvas();
    const parent = canvas.parentElement!;

    // Create UI container that matches canvas position
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

    // Create scaled wrapper for UI elements (designed at BASE_WIDTH x BASE_HEIGHT)
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

    // Create control panels for each shape (using base dimensions)
    const panelY = BASE_HEIGHT - 250;

    // Only create control panels for foreground shapes (layer > 0)
    let panelIndex = 0;
    for (let i = 0; i < this.shapes.length; i++) {
      const shape = this.shapes[i];
      if (shape.layer > 0) {
        const panel = this.createControlPanel(scene, shape, 10 + panelIndex * 270, panelY);
        this.controlPanels.push(panel);
        panelIndex++;
      }
    }

    // Create controls container (positioned to the left of the spectral graph)
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      position: absolute;
      top: 10px;
      right: 420px;
      pointer-events: auto;
    `;
    this.uiScaleWrapper.appendChild(buttonContainer);

    // Ambient mode radio buttons
    // Build options based on whether dark mode is enabled
    const ambientOptions: Array<{ value: BackgroundMode; label: string }> = [
      { value: 'normal', label: 'Visible' },
      { value: 'uv', label: 'UV' },
    ];

    if (this.enableDarkMode) {
      ambientOptions.push({ value: 'dark', label: 'Dark' });
    }

    this.ambientModeRadio = new RadioButtonGroup<BackgroundMode>(buttonContainer, {
      name: 'ambient-mode',
      options: ambientOptions,
      selectedValue: 'normal',
      label: 'Ambient Light',
      onChange: (value) => {
        this.backgroundMode = value;
        this.uvMode = value === 'uv';
        this.needsRender = true;
      },
    });

    // Debug report button (for layer order investigation)
    const debugButton = document.createElement('button');
    debugButton.textContent = 'Generate Debug Report';
    debugButton.style.cssText = `
      margin: 5px;
      padding: 8px 12px;
      background: #ff6b6b;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    `;
    debugButton.onclick = () => this.generateDebugReport(scene);
    buttonContainer.appendChild(debugButton);

    // Spectral graph (top right corner)
    const graphContainer = document.createElement('div');
    graphContainer.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      pointer-events: auto;
    `;
    this.uiScaleWrapper.appendChild(graphContainer);

    this.spectralGraph = new SpectralGraph(graphContainer, {
      width: 400,
      height: 200,
      wavelengthMin: 100, // Extended to show band gap absorption
      wavelengthMax: 1000,
      title: 'Spectral Distribution (hover over canvas)',
    });

    // Create measurement indicator circle (shows averaging area)
    // This indicator shows where the spectrum is being sampled from
    // Radius of 5 matches the averageRadius parameter in the shader
    this.measurementIndicator = document.createElement('div');
    this.measurementIndicator.style.cssText = `
      position: absolute;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      border: 2px solid rgba(255, 255, 255, 0.8);
      background: rgba(255, 255, 255, 0.2);
      transform: translate(-50%, -50%);
      pointer-events: none;
      display: none;
      box-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
      transition: border-color 0.2s, background 0.2s;
    `;
    this.uiScaleWrapper.appendChild(this.measurementIndicator);

    // Create profiling overlay (hidden by default, toggle with P key)
    this.profilingOverlay = document.createElement('div');
    this.profilingOverlay.style.cssText = `
      position: absolute;
      bottom: 10px;
      left: 10px;
      background: rgba(0, 0, 0, 0.85);
      color: #fff;
      font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
      font-size: 11px;
      padding: 10px;
      border-radius: 4px;
      pointer-events: none;
      display: none;
      line-height: 1.4;
      min-width: 200px;
      border: 1px solid rgba(255, 255, 255, 0.2);
    `;
    this.uiScaleWrapper.appendChild(this.profilingOverlay);
  }

  /**
   * Update UI scale based on current canvas size
   */
  protected updateUIScale(scene: GameScene): void {
    if (!this.uiContainer || !this.uiScaleWrapper) return;

    const { width, height } = scene.getDimensions();
    const scale = Math.min(width / BASE_WIDTH, height / BASE_HEIGHT);

    // Update container size to match canvas
    this.uiContainer.style.width = `${width}px`;
    this.uiContainer.style.height = `${height}px`;

    // Apply scale transform
    this.uiScaleWrapper.style.transform = `scale(${scale})`;
  }

  /**
   * Update shape pixel coordinates from normalized coordinates
   * Called on initialize and resize to maintain relative positions
   */
  protected updateShapePixelCoordinates(width: number, height: number): void {
    for (const shape of this.shapes) {
      const pixels = toPixelRect(
        { nx: shape.nx, ny: shape.ny, nw: shape.nw, nh: shape.nh },
        width,
        height
      );
      shape.x = pixels.x;
      shape.y = pixels.y;
      shape.width = pixels.width;
      shape.height = pixels.height;
    }
  }

  /**
   * Handle resize events
   */
  resize(scene: GameScene, width: number, height: number): void {
    // Update shape pixel coordinates for new screen size
    this.updateShapePixelCoordinates(width, height);
    this.updateUIScale(scene);
    this.needsRender = true;
  }

  protected createControlPanel(
    scene: GameScene,
    shape: ShapeConfig,
    x: number,
    y: number
  ): ControlPanel {
    const container = document.createElement('div');
    container.style.cssText = `
      position: absolute;
      left: ${x}px;
      top: ${y}px;
      pointer-events: auto;
    `;
    this.uiScaleWrapper!.appendChild(container);

    const panel = new ControlPanel(container, {
      title: shape.name,
      width: 250,
    });

    // Add depth/path length slider first (up to 10 meters)
    panel.addSlider('depth', {
      min: 0,
      max: 1000,
      value: shape.properties.pathLength,
      logarithmic: true,
      label: 'Depth (cm)',
      onChange: (value) => {
        shape.properties.pathLength = value;
        this.needsRender = true;
      },
    });

    // Add sliders for each molecule mole fraction (percentage)
    // Format as percentage with appropriate precision
    const formatPercent = (value: number): string => {
      const percent = value * 100;
      if (percent < 0.001) return '0%';
      if (percent < 0.1) return `${percent.toFixed(3)}%`;
      if (percent < 1) return `${percent.toFixed(2)}%`;
      if (percent < 10) return `${percent.toFixed(1)}%`;
      return `${percent.toFixed(0)}%`;
    };

    for (const molecule of shape.material.molecules) {
      panel.addSlider(molecule.id, {
        min: 0,
        max: 0.1, // Up to 10% mole fraction
        value: shape.properties.moleFractions[molecule.id] || 0.0001,
        logarithmic: true,
        label: molecule.name,
        formatValue: formatPercent,
        onChange: (value) => {
          shape.properties.moleFractions[molecule.id] = value;
          this.needsRender = true;
        },
      });
    }

    // Temperature slider for emission and line broadening
    if (this.enableEmission) {
      panel.addSlider('temperature', {
        min: 0,
        max: 13000,
        value: shape.properties.temperature,
        logarithmic: true,
        label: 'Temperature (K)',
        onChange: (value) => {
          shape.properties.temperature = value;
          this.needsRender = true;
        },
      });
    }

    // Pressure slider for gas materials (collisional broadening)
    // Only show for gas since pressure broadening is negligible in liquids/solids
    if (shape.material.id === 'gas') {
      panel.addSlider('pressure', {
        min: 0,
        max: 50, // 0 = vacuum, 50 = high-pressure lamp conditions
        value: shape.properties.pressure,
        logarithmic: true,
        label: 'Pressure (atm)',
        onChange: (value) => {
          shape.properties.pressure = value;
          this.needsRender = true;
        },
      });
    }

    // Scattering sliders for condensed materials (water/crystal, not gas)
    // Rayleigh scattering: small particles << wavelength (nanoparticles, blue sky effect)
    // Mie scattering: large particles ~ wavelength (microparticles, milk/fog effect)
    if (shape.material.id === 'water' || shape.material.id === 'crystal') {
      // Format particle count in billions
      const formatBillions = (value: number): string => {
        const billions = value / 1e9;
        if (billions < 0.001) return '0';
        if (billions < 1) return `${billions.toFixed(2)}B`;
        if (billions < 1000) return `${billions.toFixed(1)}B`;
        return `${(billions / 1000).toFixed(1)}T`; // Trillions
      };

      panel.addSlider('smallParticles', {
        min: 0,
        max: 1e14, // particles/cm³ (100,000 billion)
        value: shape.smallParticleDensity,
        logarithmic: true,
        label: 'Nanoparticles (Rayleigh)',
        formatValue: formatBillions,
        onChange: (value) => {
          shape.smallParticleDensity = value;
          this.needsRender = true;
        },
      });

      panel.addSlider('largeParticles', {
        min: 0,
        max: 1e10, // particles/cm³ (10 billion)
        value: shape.largeParticleDensity,
        logarithmic: true,
        label: 'Microparticles (Mie)',
        formatValue: formatBillions,
        onChange: (value) => {
          shape.largeParticleDensity = value;
          this.needsRender = true;
        },
      });
    }

    return panel;
  }

  protected async updateRenderer(scene: GameScene): Promise<void> {
    const renderer = scene.getRenderer();
    if (!renderer) return;

    // Load masks if not already loaded (with race condition protection)
    if (!this.masksLoaded) {
      // If loading is already in progress, wait for it
      if (this.masksLoadingPromise) {
        await this.masksLoadingPromise;
      } else {
        // Start loading
        this.masksLoadingPromise = (async () => {
          // Collect unique masks from shapes (filter out empty names - those use full coverage)
          const shapeMasks = [
            ...new Set(this.shapes.map((s) => s.maskName).filter((name) => name !== '')),
          ];

          // Build mask list: include basic shapes, ambient pattern, and all shape masks
          // The MaskManager will automatically categorize them by resolution:
          // - Small (256x256): circle, rectangle, triangle
          // - Large (1280x720): circle-grid, diagonal-circle-grid
          // Note: Shapes without a maskName use full coverage (no texture needed)
          const allMasks: string[] = [
            'circle',
            'rectangle',
            'triangle', // Basic shapes
            'diagonal-circle-grid', // Ambient pattern
            'circle-grid', // Background grid
          ];

          // Add any additional masks from shapes that aren't in the list
          for (const mask of shapeMasks) {
            if (mask && !allMasks.includes(mask)) {
              allMasks.push(mask);
            }
          }

          await renderer.loadMasks(allMasks);
          this.masksLoaded = true;

          console.log('[SpectralDemo] Loaded masks:', allMasks);
        })();

        await this.masksLoadingPromise;
      }
    }

    // ============================================================
    // DUAL-TEXTURE BIN INTEGRATION
    // ============================================================
    // Generate two sets of textures at different resolutions:
    // - High-res (4500 samples, 0.2nm bins): For spectral plot
    // - Low-res (32 samples, 29nm bins): For rendering
    // Both are bin-integrated for energy conservation.

    const PLOT_SAMPLES = 4500; // High-res for spectral plot
    const RENDER_SAMPLES = 32; // Low-res for rendering (matches shader sample count)

    // High-res textures for spectral plot
    const highResSpectra: Float32Array[] = [];
    for (const shape of this.shapes) {
      const spectrum = shape.material.generateTransmissionSpectrum(
        100,
        1000,
        PLOT_SAMPLES,
        shape.properties
      );
      highResSpectra.push(spectrum);
    }

    // Low-res textures for rendering
    const lowResSpectra: Float32Array[] = [];
    for (const shape of this.shapes) {
      const spectrum = shape.material.generateTransmissionSpectrum(
        100,
        1000,
        RENDER_SAMPLES,
        shape.properties
      );
      lowResSpectra.push(spectrum);
    }

    // Upload both texture sets
    renderer.setMaterials(highResSpectra); // High-res for spectrum plot
    if (renderer.setRenderingMaterials) {
      renderer.setRenderingMaterials(lowResSpectra); // Low-res for rendering
    }

    // Upload fluorescence textures (both resolutions)
    const highResFluor = this.generateFluorescenceTextures(PLOT_SAMPLES);
    const lowResFluor = this.generateFluorescenceTextures(RENDER_SAMPLES);

    renderer.setFluorescenceData(highResFluor.excitationSpectra, highResFluor.emissionSpectra);
    if (renderer.setRenderingFluorescenceData) {
      renderer.setRenderingFluorescenceData(
        lowResFluor.excitationSpectra,
        lowResFluor.emissionSpectra
      );
    }

    // Upload reflection textures for ambient light (both resolutions)
    const highResReflection = this.generateReflectionTextures(PLOT_SAMPLES);
    const lowResReflection = this.generateReflectionTextures(RENDER_SAMPLES);

    if (renderer.setReflectionData) {
      renderer.setReflectionData(highResReflection);
    }
    if (renderer.setRenderingReflectionData) {
      renderer.setRenderingReflectionData(lowResReflection);
    }

    // Convert shapes to GPU format
    const gpuShapes: GPUShape[] = this.shapes.map((shape, index) => {
      const maskIdx = renderer.getMaskIndex(shape.maskName);
      const maskDims = renderer.getMaskDimensions(shape.maskName);
      console.log(
        `[SpectralDemo] Shape ${shape.id}: pos=(${shape.x},${shape.y}) size=${shape.width}x${shape.height}, renderLayer=${shape.layer} -> msdf=${maskIdx.hasMsdf}(${maskIdx.msdfArrayIndex}:${maskIdx.msdfLayerIndex}), alpha=${maskIdx.hasAlpha}(${maskIdx.alphaArrayIndex}:${maskIdx.alphaLayerIndex}), texSize=${maskDims.width}x${maskDims.height}`
      );
      return {
        x: shape.x,
        y: shape.y,
        width: shape.width,
        height: shape.height,
        temperature: this.enableEmission ? shape.properties.temperature : 300,
        layer: shape.layer,
        materialIndex: index,
        msdfArrayIndex: maskIdx.msdfArrayIndex,
        msdfLayerIndex: maskIdx.msdfLayerIndex,
        texWidth: maskDims.width,
        texHeight: maskDims.height,
        alphaArrayIndex: maskIdx.alphaArrayIndex,
        alphaLayerIndex: maskIdx.alphaLayerIndex,
        hasMsdf: maskIdx.hasMsdf,
        hasAlpha: maskIdx.hasAlpha,
        // Scattering particle densities
        smallParticleDensity: shape.smallParticleDensity,
        largeParticleDensity: shape.largeParticleDensity,
        // Fluorescence quantum yield for UV-excited emission
        fluorescenceQuantumYield: this.calculateTotalQuantumYield(shape),
      };
    });

    renderer.setShapes(gpuShapes);
    renderer.setBackgroundMode(this.backgroundMode);
    renderer.setEmissionEnabled(this.enableEmission);
  }

  /**
   * Generate debug report for layer order investigation
   * Tests emission from each shape and captures layer processing data
   */
  protected async generateDebugReport(scene: GameScene): Promise<void> {
    const renderer = scene.getRenderer();
    if (!renderer) {
      console.error('[DEBUG-REPORT] No renderer available');
      return;
    }

    console.log('[DEBUG-REPORT] Starting debug report generation...');

    // Get the debug collector from the renderer
    const debugCollector = renderer.getDebugCollector();
    if (!debugCollector) {
      console.error('[DEBUG-REPORT] Debug collector not available');
      return;
    }

    // Block auto-renders during debug capture
    this.debugReportInProgress = true;

    // Clear previous reports
    debugCollector.clear();
    debugCollector.enabled = true;

    // Use known overlap coordinates for testing:
    // Square<>Circle intersection: (196, 181)
    // Circle<>Triangle intersection: (330, 209)
    // For now, use the square<>circle intersection as the primary test pixel
    debugCollector.testPixelX = 196;
    debugCollector.testPixelY = 181;

    const foregroundShapes = this.shapes.filter((s) => s.layer > 0);

    console.log(
      `[DEBUG-REPORT] Test pixel: (${debugCollector.testPixelX}, ${debugCollector.testPixelY})`
    );
    console.log(`[DEBUG-REPORT] Shapes containing this pixel:`);
    for (const shape of foregroundShapes) {
      const inX =
        debugCollector.testPixelX >= shape.x && debugCollector.testPixelX < shape.x + shape.width;
      const inY =
        debugCollector.testPixelY >= shape.y && debugCollector.testPixelY < shape.y + shape.height;
      console.log(
        `  - ${shape.name} (layer ${shape.layer}): ${inX && inY ? 'YES' : 'NO'} (pos: ${shape.x},${shape.y} size: ${shape.width}x${shape.height})`
      );
    }

    // Store original temperatures and background
    const originalTemps = this.shapes.map((s) => s.properties.temperature);
    const originalBackground = this.backgroundMode;

    // Ensure dark mode for emission visibility
    this.backgroundMode = 'dark';

    // Helper to run a single test
    const runTest = async (testName: string, hotLayer: number) => {
      console.log(`[DEBUG-REPORT] Running test: ${testName}`);

      // Set temperatures
      for (const shape of this.shapes) {
        shape.properties.temperature = shape.layer === hotLayer ? 3000 : 300;
      }

      // Build shape config with CURRENT temperatures
      const shapeConfig = this.shapes.map((s) => ({
        name: s.name || s.id,
        layer: s.layer,
        position: [s.x, s.y] as [number, number],
        temperature: s.properties.temperature,
      }));

      // IMPORTANT: Update renderer state BEFORE starting capture
      // This ensures materials are uploaded to GPU before we capture
      await this.updateRenderer(scene);

      // Do a "warm-up" render WITHOUT capture to ensure GPU state is stable
      // Disable debug collector BEFORE render to ensure no async callbacks pollute capture
      debugCollector.enabled = false;
      debugCollector.currentReport = null; // Clear any partial data
      await renderer.render();

      // Wait for ALL GPU work to complete (including async buffer reads)
      // This is critical - the render has async operations that continue after the await
      await new Promise((resolve) => setTimeout(resolve, 100));

      // NOW start capture and render with clean state
      debugCollector.enabled = true;
      debugCollector.startCapture(testName, 'dark', true, shapeConfig);

      // Trigger the render that will be captured
      await renderer.render();

      // Finish capture
      debugCollector.finishCapture();

      console.log(`[DEBUG-REPORT] Test ${testName} complete`);
    };

    // Test 1: Hot square (layer 1)
    await runTest('hot_layer1_square', 1);

    // Test 2: Hot circle (layer 2)
    await runTest('hot_layer2_circle', 2);

    // Test 3: Hot triangle (layer 3) if exists
    const hasLayer3 = this.shapes.some((s) => s.layer === 3);
    if (hasLayer3) {
      await runTest('hot_layer3_triangle', 3);
    }

    // Restore original state
    this.shapes.forEach((s, i) => (s.properties.temperature = originalTemps[i]));
    this.backgroundMode = originalBackground;
    debugCollector.enabled = false;
    this.debugReportInProgress = false; // Allow auto-renders again

    // Re-render with original settings
    await this.updateRenderer(scene);
    await renderer.render();

    // Generate and download report
    const reportJSON = debugCollector.generateReportJSON();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `layer-debug-report-${timestamp}.json`;

    // Download the file
    const blob = new Blob([reportJSON], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);

    console.log(`[DEBUG-REPORT] Report saved: ${filename}`);
    console.log('[DEBUG-REPORT] Reports generated:', debugCollector.getAllReports().length);
  }

  /**
   * Calculate total quantum yield for a shape based on its material and mole fractions
   */
  private calculateTotalQuantumYield(shape: ShapeConfig): number {
    const fluorData = shape.material.generateFluorescenceTextures(100, 1000, 100, shape.properties);
    return fluorData.totalQuantumYield;
  }

  /**
   * Generate fluorescence textures for all materials
   *
   * @param resolution - Number of wavelength samples (default 32 for rendering)
   */
  private generateFluorescenceTextures(resolution = 32): {
    excitationSpectra: Float32Array[];
    emissionSpectra: Float32Array[];
  } {
    const excitationSpectra: Float32Array[] = [];
    const emissionSpectra: Float32Array[] = [];

    for (const shape of this.shapes) {
      const data = shape.material.generateFluorescenceTextures(
        100,
        1000,
        resolution,
        shape.properties
      );
      excitationSpectra.push(data.excitation);
      emissionSpectra.push(data.emission);
    }

    return { excitationSpectra, emissionSpectra };
  }

  /**
   * Generate reflection textures for all shapes (for ambient light simulation)
   * Returns an array of reflection spectra (one per shape)
   *
   * @param resolution - Number of wavelength samples (default 32 for rendering)
   */
  private generateReflectionTextures(resolution = 32): Float32Array[] {
    const reflectionSpectra: Float32Array[] = [];

    for (const shape of this.shapes) {
      const spectrum = shape.material.generateReflectionSpectrum(
        100,
        1000,
        resolution,
        shape.properties
      );
      reflectionSpectra.push(spectrum);
    }

    return reflectionSpectra;
  }
}
