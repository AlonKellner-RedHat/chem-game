/**
 * Spectral Demo
 * 
 * Core spectral coloring demo with absorption and transmission.
 */

import { Demo } from './Demo';
import { GameScene } from '../../scenes/GameScene';
import { GPUShape } from '../rendering';
import { ControlPanel, SpectralGraph, ToggleButton } from '../ui';
import {
  createWaterMaterial,
  createCrystalMaterial,
  createGasMaterial,
  createDefaultProperties,
  Material,
  MaterialProperties,
} from '../materials';
import { BackgroundMode } from '../physics/config';

interface ShapeConfig {
  id: string;
  name: string;
  maskName: string;  // Name of mask file (without .mask extension)
  x: number;
  y: number;
  width: number;
  height: number;
  layer: number;     // Render order (0 = background)
  material: Material;
  properties: MaterialProperties;
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
  protected uvButton: ToggleButton | null = null;
  protected darkButton: ToggleButton | null = null;
  protected uiContainer: HTMLElement | null = null;
  protected uiScaleWrapper: HTMLElement | null = null;
  
  // Masks
  protected masksLoaded = false;
  protected renderInProgress = false;
  
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
    
    // Create materials
    const waterMaterial = createWaterMaterial();
    const crystalMaterial = createCrystalMaterial();
    const gasMaterial = createGasMaterial();
    
    // Create a simple tint material for background (66% transmission = slight dimming)
    const tintMaterial: Material = {
      id: 'tint',
      name: 'Background Tint',
      molecules: [],  // No absorption peaks - just flat transmission
      bandGap: 0,     // No band gap (transparent in visible)
      uvCutoff: 0,    // No UV cutoff
      generateTransmissionSpectrum: (minWl: number, maxWl: number, resolution: number) => {
        // Flat 66% transmission across all wavelengths
        return new Float32Array(resolution).fill(0.66);
      },
    };
    
    // Create shapes (background layer first, then foreground)
    this.shapes = [
      // Background circle grid (layer 0)
      {
        id: 'bg-grid',
        name: 'Background Grid',
        maskName: 'circle-grid',
        x: 0,
        y: 0,
        width: 1280,
        height: 720,
        layer: 0,  // Background layer
        material: tintMaterial,
        properties: createDefaultProperties(tintMaterial),
      },
      // Foreground shapes (layer 1)
      {
        id: 'square',
        name: 'Square (Water)',
        maskName: 'rectangle',
        x: 20,
        y: 80,
        width: 200,
        height: 200,
        layer: 1,
        material: waterMaterial,
        properties: createDefaultProperties(waterMaterial),
      },
      {
        id: 'circle',
        name: 'Circle (Crystal)',
        maskName: 'circle',
        x: 150,
        y: 80,
        width: 200,
        height: 200,
        layer: 1,
        material: crystalMaterial,
        properties: createDefaultProperties(crystalMaterial),
      },
      {
        id: 'triangle',
        name: 'Triangle (Gas)',
        maskName: 'triangle',
        x: 280,
        y: 80,
        width: 200,
        height: 200,
        layer: 1,
        material: gasMaterial,
        properties: createDefaultProperties(gasMaterial),
      },
    ];
    
    // Create UI
    this.createUI(scene);
    
    // Setup mouse tracking for spectrum sampling
    const canvas = scene.getCanvas();
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
      }
    };
    document.addEventListener('keydown', this.keyHandler);
    
    // Initial render (async, but we don't need to wait)
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
    
    // Update spectrum graph with current mouse position
    this.updateSpectrumGraph(scene);
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
      if (shape.layer === 0) continue;  // Skip background shapes
      
      const panel = this.controlPanels[panelIndex];
      if (!panel) continue;
      
      // Reset concentration sliders
      for (const molecule of shape.material.molecules) {
        panel.setSliderValue(molecule.id, shape.properties.concentrations[molecule.id] || 0.01);
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
      
      panelIndex++;
    }
    
    // Reset background mode
    this.backgroundMode = 'normal';
    this.uvMode = false;
    this.uvButton?.setEnabled(false, false);
    this.darkButton?.setEnabled(false, false);
    
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
    
    // Use 1.0 as plot max since intensity values are in 0-1 range
    // (globalMaxIntensity is now integrated Y luminance, not suitable for plot)
    this.spectralGraph.setGlobalMax(1.0);
    
    // Use locked position if locked, otherwise use mouse position
    const sampleX = this.isSpectrumLocked ? this.lockedX : this.mouseX;
    const sampleY = this.isSpectrumLocked ? this.lockedY : this.mouseY;
    
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
    
    this.uvButton?.destroy();
    this.darkButton?.destroy();
    this.uvButton = null;
    this.darkButton = null;
    
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
    
    // Create toggle buttons container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      pointer-events: auto;
    `;
    this.uiScaleWrapper.appendChild(buttonContainer);
    
    // UV mode button
    this.uvButton = new ToggleButton(buttonContainer, {
      enabled: false,
      labelOn: 'UV Mode: ON',
      labelOff: 'UV Mode: OFF',
      onToggle: (enabled) => {
        this.uvMode = enabled;
        this.backgroundMode = enabled ? 'uv' : 'normal';
        this.needsRender = true;
      },
    });
    
    // Dark mode button (for advanced demo)
    if (this.enableDarkMode) {
      this.darkButton = new ToggleButton(buttonContainer, {
        enabled: false,
        labelOn: 'Dark Mode: ON',
        labelOff: 'Dark Mode: OFF',
        onToggle: (enabled) => {
          this.backgroundMode = enabled ? 'dark' : (this.uvMode ? 'uv' : 'normal');
          this.needsRender = true;
        },
      });
    }
    
    // Spectral graph
    const graphContainer = document.createElement('div');
    graphContainer.style.cssText = `
      position: absolute;
      top: 60px;
      right: 10px;
      pointer-events: auto;
    `;
    this.uiScaleWrapper.appendChild(graphContainer);
    
    this.spectralGraph = new SpectralGraph(graphContainer, {
      width: 400,
      height: 200,
      wavelengthMin: 200,
      wavelengthMax: 1000,
      title: 'Spectral Distribution (hover over canvas)',
    });
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
   * Handle resize events
   */
  resize(scene: GameScene, width: number, height: number): void {
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
    
    // Add sliders for each molecule concentration
    for (const molecule of shape.material.molecules) {
      panel.addSlider(molecule.id, {
        min: 0,
        max: 1.0,
        value: shape.properties.concentrations[molecule.id] || 0.01,
        logarithmic: true,
        label: molecule.name,
        onChange: (value) => {
          shape.properties.concentrations[molecule.id] = value;
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
        max: 50,  // 0 = vacuum, 50 = high-pressure lamp conditions
        value: shape.properties.pressure,
        logarithmic: true,
        label: 'Pressure (atm)',
        onChange: (value) => {
          shape.properties.pressure = value;
          this.needsRender = true;
        },
      });
    }
    
    return panel;
  }
  
  protected async updateRenderer(scene: GameScene): Promise<void> {
    const renderer = scene.getRenderer();
    if (!renderer) return;
    
    // Load masks if not already loaded
    if (!this.masksLoaded) {
      const maskNames = [...new Set(this.shapes.map(s => s.maskName))];
      await renderer.loadMasks(maskNames);
      this.masksLoaded = true;
    }
    
    // Generate transmission spectra for materials
    const spectra: Float32Array[] = [];
    for (const shape of this.shapes) {
      const spectrum = shape.material.generateTransmissionSpectrum(
        200, 1000, 5000,  // High resolution to capture narrow features like Na D-lines
        shape.properties
      );
      spectra.push(spectrum);
    }
    
    renderer.setMaterials(spectra);
    
    // Convert shapes to GPU format
    const gpuShapes: GPUShape[] = this.shapes.map((shape, index) => {
      const maskIndex = renderer.getMaskIndex(shape.maskName);
      const maskDims = renderer.getMaskDimensions(shape.maskName);
      console.log(`[SpectralDemo] Shape ${shape.id}: maskName=${shape.maskName} -> maskIndex=${maskIndex}, texSize=${maskDims.width}x${maskDims.height}`);
      return {
        x: shape.x,
        y: shape.y,
        width: shape.width,
        height: shape.height,
        temperature: this.enableEmission ? shape.properties.temperature : 300,
        layer: shape.layer,
        materialIndex: index,
        maskIndex,
        texWidth: maskDims.width,
        texHeight: maskDims.height,
      };
    });
    
    renderer.setShapes(gpuShapes);
    renderer.setBackgroundMode(this.backgroundMode);
    renderer.setEmissionEnabled(this.enableEmission);
  }
}

