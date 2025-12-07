import { Demo } from "./Demo";
import { GameScene } from "../../scenes/GameScene";
import { MaterialRegistry } from "../spectral/registry/MaterialRegistry";
import { EffectRegistry } from "../spectral/registry/EffectRegistry";
import { WaterMaterial } from "../spectral/materials/WaterMaterial";
import { CrystalMaterial } from "../spectral/materials/CrystalMaterial";
import { GasMaterial } from "../spectral/materials/GasMaterial";
import { ChemicalAbsorptionEffect } from "../spectral/effects/ChemicalAbsorptionEffect";
import { ParticleScatteringEffect } from "../spectral/effects/ParticleScatteringEffect";
import { BlackbodyEmissionEffect } from "../spectral/effects/BlackbodyEmissionEffect";
import { SolutionProperties } from "../spectral/SolutionProperties";
import { SpectralRenderer } from "../spectral/SpectralRenderer";
import { PerPixelSpectralRenderer } from "../spectral/PerPixelSpectralRenderer";
import { RGB } from "../spectral/CIE";
import {
  linearToLogarithmic,
  logarithmicToLinear,
} from "../utils/LogarithmicScale";
import { LayerSystem } from "../spectral/layers/LayerSystem";
import { BackgroundLayer } from "../spectral/layers/BackgroundLayer";
import { Layer } from "../spectral/layers/Layer";
import { PixelLayerRenderer } from "../spectral/renderers/PixelLayerRenderer";
import { GPUPixelRenderer } from "../spectral/renderers/GPUPixelRenderer";
import { MaterialFilter } from "../spectral/filters/MaterialFilter";
import { RectangleGeometry } from "../spectral/geometry/RectangleGeometry";
import { CircleGeometry } from "../spectral/geometry/CircleGeometry";
import { TriangleGeometry } from "../spectral/geometry/TriangleGeometry";
import { Grid } from "../Grid";
import Phaser from "phaser";
import { getProfiler } from "../utils/RenderProfiler";
import {
  calculateUniformBackgroundSpectrum,
  calculateRGBBackgroundSpectrum,
  calculateUVBackgroundSpectrum,
  calculateUVRGBBackgroundSpectrum,
  wavelengthToColor,
  type SpectrumPoint,
  type WavelengthColor,
} from "./spectral/SpectralCalculations";
import { SpectralDemoState } from "./spectral/SpectralDemoState";

/**
 * Spectral Coloring Demo
 * Demonstrates physics-based spectral coloring with square and circle
 */
export class SpectralDemo implements Demo {
  readonly name = "Spectral Coloring";
  readonly description =
    "Physics-based spectral absorption and scattering demo";

  private materialRegistry: MaterialRegistry;
  private effectRegistry: EffectRegistry;
  private state: SpectralDemoState;
  private renderer: SpectralRenderer;
  private perPixelRenderer: PerPixelSpectralRenderer;

  // Pixel-by-pixel rendering system
  private layerSystem: LayerSystem;
  private pixelRenderer: PixelLayerRenderer;
  private gpuRenderer: GPUPixelRenderer | null = null;
  private pixelGraphics!: Phaser.GameObjects.Graphics;
  private pixelImage: Phaser.GameObjects.Image | null = null;
  private gpuRenderTexture: Phaser.GameObjects.RenderTexture | null = null;
  private cachedBounds: { min: { x: number; y: number }; max: { x: number; y: number } } | null = null;
  private grid!: Grid;
  private useGPU: boolean = true; // Enable GPU rendering when available
  
  // State management is now handled by SpectralDemoState

  // Visual elements (kept for compatibility, but not used for rendering)
  private squareGraphics!: Phaser.GameObjects.Graphics;
  private circleGraphics!: Phaser.GameObjects.Graphics;

  // Spectral display
  private spectralDisplayGraphics!: Phaser.GameObjects.Graphics;
  private spectralDisplayContainer!: Phaser.GameObjects.Container;
  private spectralDisplayText!: Phaser.GameObjects.Text;

  // UI controls - store references for cleanup
  private uiElements: Phaser.GameObjects.GameObject[] = [];

  // Shape positions and properties are now managed by SpectralDemoState
  private triangleGraphics!: Phaser.GameObjects.Graphics;
  
  // Render throttling
  private renderThrottleTimer: number | null = null;
  
  // Debug flag
  private debugDisableGPU: boolean = false;

  // Spectral display range selection
  private spectralMinWavelength: number = 200; // Minimum visible wavelength (nm)
  private spectralMaxWavelength: number = 1000; // Maximum visible wavelength (nm)
  private rangeSliderMinHandle!: Phaser.GameObjects.Arc;
  private rangeSliderMaxHandle!: Phaser.GameObjects.Arc;
  private rangeSliderBg!: Phaser.GameObjects.Rectangle;
  private isDraggingMin: boolean = false;
  private isDraggingMax: boolean = false;

  // Baseline max transmission for Y-axis normalization (tile background max)
  private spectralBaselineMax: number = 1.0;

  // Current spectral display state (to preserve when sliders change)
  private currentSpectralState: {
    inSquare: boolean;
    inCircle: boolean;
    inTriangle: boolean;
    inBackground: boolean;
    onGridLine: boolean;
  } = {
    inSquare: false,
    inCircle: false,
    inTriangle: false,
    inBackground: true,
    onGridLine: false,
  };

  // Locked position for spectral display (when user clicks to lock)
  private lockedSpectralState: {
    inSquare: boolean;
    inCircle: boolean;
    inTriangle: boolean;
    inBackground: boolean;
    onGridLine: boolean;
    locked: boolean;
  } = {
    inSquare: false,
    inCircle: false,
    inTriangle: false,
    inBackground: true,
    onGridLine: false,
    locked: false,
  };

  constructor() {
    // Initialize registries
    this.materialRegistry = new MaterialRegistry();
    this.effectRegistry = new EffectRegistry();

    // Register effects
    this.effectRegistry.register(new ChemicalAbsorptionEffect());
    this.effectRegistry.register(new ParticleScatteringEffect());
    this.effectRegistry.register(new BlackbodyEmissionEffect());

    // Register materials
    this.materialRegistry.register(new WaterMaterial());
    this.materialRegistry.register(new CrystalMaterial());
    this.materialRegistry.register(new GasMaterial());

    // Initialize solution properties with defaults
    const squareProperties = this.createDefaultProperties("water");
    const circleProperties = this.createDefaultProperties("crystal");
    const triangleProperties = this.createDefaultProperties("gas");
    
    // Initialize state manager
    this.state = new SpectralDemoState(squareProperties, circleProperties, triangleProperties);

    // Initialize renderer
    this.renderer = new SpectralRenderer();
    this.perPixelRenderer = new PerPixelSpectralRenderer();

    // Initialize pixel rendering system
    this.layerSystem = new LayerSystem();
    this.pixelRenderer = new PixelLayerRenderer();

    // Initialize GPU renderer (will be activated when WebGL context is available)
    this.gpuRenderer = new GPUPixelRenderer();
  }

  private createDefaultProperties(materialId: string): SolutionProperties {
    const material = this.materialRegistry.get(materialId);
    const concentrations = new Map<string, number>();

    if (material) {
      // Start with clear material (no concentrations)
      material.molecules.forEach((molecule) => {
        concentrations.set(molecule.id, 0.0);
      });
    }

    return {
      moleculeConcentrations: concentrations,
      temperature: 298, // Room temperature
      pressure: 1.0, // 1 atm
      depth: 0.01, // 0.01 m = 1 cm
      bubbleDensity: 0.0,
      particleDensity: 0.0,
      particleSize: 0.0,
      phase: "liquid",
    };
  }

  initialize(scene: GameScene): void {
    // Get grid from scene
    this.grid = (scene as any).grid as Grid;
    if (!this.grid) {
      throw new Error("Grid not found in scene");
    }

    // Store shape positions - move higher to make room for control panels below
    const screenHeight = scene.cameras.main.height;
    this.state.updateState({
      squareX: 200,
      squareY: screenHeight * 0.25, // 25% from top (was 50%)
      squareSize: 200,
      circleX: 100, // Overlaps square from left side
      circleY: screenHeight * 0.25, // 25% from top
      circleRadius: 150,
      triangleX: 300,
      triangleY: screenHeight * 0.25, // 25% from top
      triangleSize: 180,
    });

    // Create graphics for pixel rendering
    this.pixelGraphics = scene.add.graphics();
    this.pixelGraphics.setDepth(0); // Render behind UI elements (UI uses 1001+)

    // Set up layer system
    this.setupLayerSystem();

    // Render pixels
    this.renderPixels(scene);

    // Pixel rendering is handled by renderPixels() above
    // Old shape rendering code removed - now using pixel-by-pixel rendering

    // Create graphics for shapes (kept for compatibility, but not used for rendering)
    this.squareGraphics = scene.add.graphics();
    this.circleGraphics = scene.add.graphics();
    this.triangleGraphics = scene.add.graphics();

    // Create spectral display
    this.createSpectralDisplay(scene);

    // Create UI controls
    this.createUIControls(scene);
    
    // DEBUG: Log UI elements after creation
    console.log('[DEBUG] UI elements created:', {
      totalUIElements: this.uiElements.length,
      uiElementDepths: this.uiElements.map((el, idx) => ({
        index: idx,
        type: el.constructor.name,
        depth: (el as any).depth,
        visible: (el as any).visible,
      })),
    });

    // Set up mouse tracking
    const handleGlobalPointerMove = (pointer: Phaser.Input.Pointer) => {
      // Handle range slider dragging first
      if (this.isDraggingMin || this.isDraggingMax) {
        this.updateRangeFromSlider(scene, pointer.x);
        return; // Don't update hover when dragging slider
      }

      // Check if mouse is over control panel area (where sliders are)
      const { height } = scene.cameras.main;
      const raiseAmount = height * 0.1;
      const panelY = height - 220 - raiseAmount;
      const isOverControlPanel =
        pointer.y >= panelY - 50 && pointer.y <= panelY + 250;

      // Don't update hover if over control panels (to prevent resetting state when dragging sliders)
      if (isOverControlPanel) {
        return;
      }

      // Only update hover if not dragging slider and not locked
      if (!this.lockedSpectralState.locked) {
        this.updateMouseHover(scene, pointer.x, pointer.y);
      }
    };

    const handleGlobalPointerUp = () => {
      this.isDraggingMin = false;
      this.isDraggingMax = false;
    };

    scene.input.on("pointermove", handleGlobalPointerMove);
    scene.input.on("pointerup", handleGlobalPointerUp);

    // Also check on pointer down (in case mouse is already over shape)
    scene.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      // Only update hover if not clicking on slider
      if (!this.isDraggingMin && !this.isDraggingMax) {
        // Check if clicking on UI elements
        // Don't lock/unlock when clicking on sliders - they should preserve the lock
        // Only unlock when clicking on buttons (UV Mode button, etc.)
        const { width, height } = scene.cameras.main;
        const inUI = pointer.x > width - 280;

        // Check if clicking on a button (UV Mode button is at top right)
        const isButtonClick = pointer.y < 50 && pointer.x > width - 200;

        // Check if clicking on control panel sliders (at the bottom)
        const raiseAmount = height * 0.1;
        const panelY = height - 220 - raiseAmount;
        const isControlPanelClick =
          pointer.y >= panelY - 50 && pointer.y <= panelY + 250;

        if (!inUI && !isControlPanelClick) {
          // Lock the spectral display to this position (only if not clicking on control panels)
          this.lockSpectralDisplay(scene, pointer.x, pointer.y);
        } else if (isButtonClick) {
          // Clicking on a button - unlock if currently locked
          if (this.lockedSpectralState.locked) {
            this.unlockSpectralDisplay();
            // Update display to show unlocked state
            this.updateSpectralDisplayWithCurrentState(scene);
          }
        }
        // If clicking on sliders (control panels), keep the lock and don't update state
      }
    });

    // Initialize spectral display with default position (background tile, not grid line)
    this.updateSpectralDisplay(scene, false, false, false, true, false);

    // Make sure range slider is visible
    if (this.rangeSliderBg) {
      this.rangeSliderBg.setVisible(true);
    }
    if (this.rangeSliderMinHandle) {
      this.rangeSliderMinHandle.setVisible(true);
    }
    if (this.rangeSliderMaxHandle) {
      this.rangeSliderMaxHandle.setVisible(true);
    }
  }

  private createSpectralDisplay(scene: GameScene): void {
    const { width, height } = scene.cameras.main;

    // Create container for spectral display (right edge, vertically centered, raised by 15%)
    const displayWidth = 400;
    const displayHeight = 300;
    const displayX = width - displayWidth - 20; // Right edge with margin
    const raiseAmount = height * 0.15; // Raise by 15% of grid height
    const displayY = height / 2 - displayHeight / 2 - raiseAmount; // Vertically centered, raised by 15%
    this.spectralDisplayContainer = scene.add.container(displayX, displayY);
    this.spectralDisplayContainer.setDepth(2000);
    this.spectralDisplayContainer.setScrollFactor(0);
    this.spectralDisplayContainer.setVisible(true); // Always visible
    this.uiElements.push(this.spectralDisplayContainer);

    // Background
    const bg = scene.add.rectangle(
      0,
      0,
      displayWidth,
      displayHeight,
      0xffffff,
      0.95
    );
    bg.setOrigin(0, 0);
    bg.setStrokeStyle(2, 0x000000);
    this.spectralDisplayContainer.add(bg);

    // Title
    const title = scene.add.text(10, 10, "Spectral Distribution", {
      fontSize: "16px",
      color: "#000000",
      fontStyle: "bold",
    });
    title.setOrigin(0, 0);
    this.spectralDisplayContainer.add(title);

    // Lock indicator text (will be updated when locked/unlocked)
    const lockIndicator = scene.add.text(displayWidth - 100, 10, "", {
      fontSize: "12px",
      color: "#666666",
    });
    lockIndicator.setOrigin(0, 0);
    this.spectralDisplayContainer.add(lockIndicator);
    (this.spectralDisplayContainer as any)._lockIndicator = lockIndicator;

    // Graphics for spectrum graph
    this.spectralDisplayGraphics = scene.add.graphics();
    this.spectralDisplayGraphics.setDepth(2001);
    this.spectralDisplayGraphics.setScrollFactor(0);
    this.uiElements.push(this.spectralDisplayGraphics);

    // Info text
    this.spectralDisplayText = scene.add.text(10, 280, "", {
      fontSize: "12px",
      color: "#000000",
    });
    this.spectralDisplayText.setOrigin(0, 0);
    this.spectralDisplayText.setDepth(2001);
    this.spectralDisplayText.setScrollFactor(0);
    this.uiElements.push(this.spectralDisplayText);

    // Create range selection slider
    this.createRangeSlider(
      scene,
      displayX,
      displayY,
      displayWidth,
      displayHeight
    );
  }

  private createRangeSlider(
    scene: GameScene,
    displayX: number,
    displayY: number,
    displayWidth: number,
    displayHeight: number
  ): void {
    const sliderY = displayY + displayHeight + 10; // Position below the display
    const sliderX = displayX + 10;
    const sliderWidth = displayWidth - 20;
    const sliderHeight = 8;
    const handleRadius = 8;

    // Slider background
    this.rangeSliderBg = scene.add.rectangle(
      sliderX,
      sliderY,
      sliderWidth,
      sliderHeight,
      0xcccccc
    );
    this.rangeSliderBg.setOrigin(0, 0.5);
    this.rangeSliderBg.setInteractive({ useHandCursor: true });
    this.rangeSliderBg.setDepth(2002);
    this.rangeSliderBg.setScrollFactor(0);
    this.uiElements.push(this.rangeSliderBg);

    // Min handle (left knob)
    this.rangeSliderMinHandle = scene.add.circle(
      sliderX,
      sliderY,
      handleRadius,
      0x4a90e2
    );
    this.rangeSliderMinHandle.setInteractive({ useHandCursor: true });
    this.rangeSliderMinHandle.setDepth(2003);
    this.rangeSliderMinHandle.setScrollFactor(0);
    this.uiElements.push(this.rangeSliderMinHandle);

    // Max handle (right knob)
    this.rangeSliderMaxHandle = scene.add.circle(
      sliderX + sliderWidth,
      sliderY,
      handleRadius,
      0x4a90e2
    );
    this.rangeSliderMaxHandle.setInteractive({ useHandCursor: true });
    this.rangeSliderMaxHandle.setDepth(2003);
    this.rangeSliderMaxHandle.setScrollFactor(0);
    this.uiElements.push(this.rangeSliderMaxHandle);

    // Update handle positions based on current range
    this.updateRangeSliderHandles();

    // Min handle drag - use pointerdown to start dragging
    this.rangeSliderMinHandle.on(
      "pointerdown",
      (pointer: Phaser.Input.Pointer) => {
        this.isDraggingMin = true;
        this.updateRangeFromSlider(scene, pointer.x);
      }
    );

    // Max handle drag - use pointerdown to start dragging
    this.rangeSliderMaxHandle.on(
      "pointerdown",
      (pointer: Phaser.Input.Pointer) => {
        this.isDraggingMax = true;
        this.updateRangeFromSlider(scene, pointer.x);
      }
    );

    // Slider background click (move nearest handle)
    this.rangeSliderBg.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      const localX = pointer.x - sliderX;
      const baseMinWavelength = 200;
      const baseMaxWavelength = 1000;
      const clickedWavelength =
        baseMinWavelength +
        (localX / sliderWidth) * (baseMaxWavelength - baseMinWavelength);

      // Move nearest handle
      const distToMin = Math.abs(
        clickedWavelength - this.spectralMinWavelength
      );
      const distToMax = Math.abs(
        clickedWavelength - this.spectralMaxWavelength
      );

      if (distToMin < distToMax) {
        this.isDraggingMin = true;
        this.updateRangeFromSlider(scene, pointer.x);
      } else {
        this.isDraggingMax = true;
        this.updateRangeFromSlider(scene, pointer.x);
      }
    });
  }

  private updateRangeSliderHandles(): void {
    if (
      !this.rangeSliderMinHandle ||
      !this.rangeSliderMaxHandle ||
      !this.rangeSliderBg
    )
      return;

    const baseMinWavelength = 200;
    const baseMaxWavelength = 1000;
    const baseRange = baseMaxWavelength - baseMinWavelength;
    const sliderWidth = this.rangeSliderBg.width;
    const sliderX = this.rangeSliderBg.x;

    // Convert wavelengths to slider positions
    const minPos =
      sliderX +
      ((this.spectralMinWavelength - baseMinWavelength) / baseRange) *
        sliderWidth;
    const maxPos =
      sliderX +
      ((this.spectralMaxWavelength - baseMinWavelength) / baseRange) *
        sliderWidth;

    this.rangeSliderMinHandle.x = minPos;
    this.rangeSliderMaxHandle.x = maxPos;
  }

  private updateRangeFromSlider(scene: GameScene, pointerX: number): void {
    if (!this.rangeSliderBg) return;

    const baseMinWavelength = 200;
    const baseMaxWavelength = 1000;
    const baseRange = baseMaxWavelength - baseMinWavelength;
    const sliderWidth = this.rangeSliderBg.width;
    const sliderX = this.rangeSliderBg.x;

    // Convert pointer position to wavelength
    const localX = Math.max(0, Math.min(sliderWidth, pointerX - sliderX));
    const wavelength = baseMinWavelength + (localX / sliderWidth) * baseRange;

    // Minimum visible range: 1% of 2000 values = 8nm
    const minVisibleRange = baseRange * 0.01; // 8nm

    if (this.isDraggingMin) {
      // Clamp min wavelength
      const newMin = Math.max(
        baseMinWavelength,
        Math.min(this.spectralMaxWavelength - minVisibleRange, wavelength)
      );
      this.spectralMinWavelength = newMin;
    } else if (this.isDraggingMax) {
      // Clamp max wavelength
      const newMax = Math.min(
        baseMaxWavelength,
        Math.max(this.spectralMinWavelength + minVisibleRange, wavelength)
      );
      this.spectralMaxWavelength = newMax;
    }

    // Ensure minimum range
    const currentRange =
      this.spectralMaxWavelength - this.spectralMinWavelength;
    if (currentRange < minVisibleRange) {
      if (this.isDraggingMin) {
        this.spectralMinWavelength =
          this.spectralMaxWavelength - minVisibleRange;
      } else if (this.isDraggingMax) {
        this.spectralMaxWavelength =
          this.spectralMinWavelength + minVisibleRange;
      }
    }

    // Clamp to limits
    this.spectralMinWavelength = Math.max(
      baseMinWavelength,
      this.spectralMinWavelength
    );
    this.spectralMaxWavelength = Math.min(
      baseMaxWavelength,
      this.spectralMaxWavelength
    );

    // Update handle positions
    this.updateRangeSliderHandles();

    // Redraw spectrum with current state (preserve position)
    this.updateSpectralDisplayWithCurrentState(scene);
  }

  /**
   * Lock the spectral display to a specific position
   */
  private lockSpectralDisplay(
    scene: GameScene,
    mouseX: number,
    mouseY: number
  ): void {
    // Convert screen coordinates to world coordinates
    const camera = scene.cameras.main;
    const worldPoint = camera.getWorldPoint(mouseX, mouseY);
    const worldX = worldPoint.x;
    const worldY = worldPoint.y;

    // Check if mouse is over square (water)
    const inSquare =
      worldX >= this.state.squareX - this.state.squareSize / 2 &&
      worldX <= this.state.squareX + this.state.squareSize / 2 &&
      worldY >= this.state.squareY - this.state.squareSize / 2 &&
      worldY <= this.state.squareY + this.state.squareSize / 2;

    // Check if mouse is over circle (crystal)
    const dx = worldX - this.state.circleX;
    const dy = worldY - this.state.circleY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const inCircle = distance <= this.state.circleRadius;

    // Check if mouse is over triangle (gas)
    const inTriangle = this.isPointInTriangle(worldX, worldY);

    // Don't lock if mouse is over UI controls
    const { width } = scene.cameras.main;
    const inUI = mouseX > width - 280;

    const inBackground = !inSquare && !inCircle && !inTriangle;
    const onGridLine = this.isOnGridLine(worldX, worldY);
    if ((inSquare || inCircle || inTriangle || inBackground) && !inUI) {
      // Lock to this position
      this.lockedSpectralState = {
        inSquare,
        inCircle,
        inTriangle,
        inBackground,
        onGridLine,
        locked: true,
      };
      this.currentSpectralState = {
        inSquare,
        inCircle,
        inTriangle,
        inBackground,
        onGridLine,
      };
      // Calculate and display spectrum at this position
      this.updateSpectralDisplay(
        scene,
        inSquare,
        inCircle,
        inTriangle,
        inBackground,
        onGridLine
      );
    }
  }

  /**
   * Unlock the spectral display (allows it to follow mouse again)
   */
  private unlockSpectralDisplay(): void {
    this.lockedSpectralState.locked = false;
  }

  private updateMouseHover(
    scene: GameScene,
    mouseX: number,
    mouseY: number
  ): void {
    // If locked, don't update on hover
    if (this.lockedSpectralState.locked) {
      return;
    }

    // Convert screen coordinates to world coordinates
    const camera = scene.cameras.main;
    const worldPoint = camera.getWorldPoint(mouseX, mouseY);
    const worldX = worldPoint.x;
    const worldY = worldPoint.y;

    // Check if mouse is over square
    const inSquare =
      worldX >= this.state.squareX - this.state.squareSize / 2 &&
      worldX <= this.state.squareX + this.state.squareSize / 2 &&
      worldY >= this.state.squareY - this.state.squareSize / 2 &&
      worldY <= this.state.squareY + this.state.squareSize / 2;

    // Check if mouse is over circle
    const distToCircle = Math.sqrt(
      Math.pow(worldX - this.state.circleX, 2) + Math.pow(worldY - this.state.circleY, 2)
    );
    const inCircle = distToCircle <= this.state.circleRadius;

    // Check if mouse is over triangle (gas)
    const inTriangle = this.isPointInTriangle(worldX, worldY);

    // Don't show if mouse is over UI controls (use screen coordinates for UI)
    const { width } = scene.cameras.main;
    const inUI = mouseX > width - 280;

    const inBackground = !inSquare && !inCircle && !inTriangle;
    const onGridLine = this.isOnGridLine(worldX, worldY);
    if ((inSquare || inCircle || inTriangle || inBackground) && !inUI) {
      // Store current state
      this.currentSpectralState = {
        inSquare,
        inCircle,
        inTriangle,
        inBackground,
        onGridLine,
      };
      // Calculate spectrum at this position
      this.updateSpectralDisplay(
        scene,
        inSquare,
        inCircle,
        inTriangle,
        inBackground,
        onGridLine
      );
      // Display is always visible now
    }
  }

  private isPointInTriangle(x: number, y: number): boolean {
    // Triangle vertices (stored in class properties)
    const v1 = { x: this.state.triangleX, y: this.state.triangleY - this.state.triangleSize / 2 }; // Top
    const v2 = {
      x: this.state.triangleX - this.state.triangleSize / 2,
      y: this.state.triangleY + this.state.triangleSize / 2,
    }; // Bottom left
    const v3 = {
      x: this.state.triangleX + this.state.triangleSize / 2,
      y: this.state.triangleY + this.state.triangleSize / 2,
    }; // Bottom right

    // Barycentric coordinates method
    const d1 = (x - v2.x) * (v1.y - v2.y) - (v1.x - v2.x) * (y - v2.y);
    const d2 = (x - v3.x) * (v2.y - v3.y) - (v2.x - v3.x) * (y - v3.y);
    const d3 = (x - v1.x) * (v3.y - v1.y) - (v3.x - v1.x) * (y - v1.y);

    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0;

    return !(hasNeg && hasPos);
  }

  /**
   * Check if a world position is on a grid line
   * Grid lines are 2 pixels wide (1 pixel on each side of the grid cell boundary)
   */
  private isOnGridLine(worldX: number, worldY: number): boolean {
    const cellSize = this.grid.cellSize;
    const halfLineWidth = 1.0; // 2 pixels wide total
    
    const gridX = Math.floor(worldX / cellSize) * cellSize;
    const distToVertical = Math.min(
      Math.abs(worldX - gridX),
      Math.abs(worldX - (gridX + cellSize))
    );
    
    const gridY = Math.floor(worldY / cellSize) * cellSize;
    const distToHorizontal = Math.min(
      Math.abs(worldY - gridY),
      Math.abs(worldY - (gridY + cellSize))
    );
    
    return distToVertical <= halfLineWidth || distToHorizontal <= halfLineWidth;
  }

  /**
   * Update spectral display with the current stored state (used when sliders change)
   */
  private updateSpectralDisplayWithCurrentState(scene: GameScene): void {
    // If locked, use locked state; otherwise use current state
    const state = this.lockedSpectralState.locked
      ? this.lockedSpectralState
      : this.currentSpectralState;
    this.updateSpectralDisplay(
      scene,
      state.inSquare,
      state.inCircle,
      state.inTriangle,
      state.inBackground,
      state.onGridLine
    );
  }

  private updateSpectralDisplay(
    scene: GameScene,
    inSquare: boolean,
    inCircle: boolean,
    inTriangle: boolean,
    inBackground: boolean,
    onGridLine: boolean = false
  ): void {
    // Update lock indicator
    const lockIndicator = (this.spectralDisplayContainer as any)._lockIndicator;
    if (lockIndicator) {
      if (this.lockedSpectralState.locked) {
        lockIndicator.setText("🔒 Locked");
        lockIndicator.setColor("#4a90e2");
      } else {
        lockIndicator.setText("");
      }
    }
    // Start with background spectrum
    let spectrum: Array<{ wavelength: number; transmission: number }>;

    if (this.state.uvMode) {
      // UV mode: background is UV-weighted
      spectrum = this.calculateUVBackgroundSpectrum();
    } else {
      // Normal mode: uniform white light background
      spectrum = this.calculateUniformBackgroundSpectrum();
    }

    // Apply square transformation if mouse is in square
    if (inSquare) {
      const squareMaterial = this.materialRegistry.get("water");
      if (squareMaterial) {
        const squareSpectrum = this.renderer.calculateFullSpectrum(
          squareMaterial,
          this.state.squareProperties
        );
        // Combine: multiply transmissions
        spectrum = spectrum.map((point, i) => ({
          wavelength: point.wavelength,
          transmission: point.transmission * squareSpectrum[i].transmission,
        }));
      }
    }

    // Apply circle transformation if mouse is in circle (after square)
    if (inCircle) {
      const circleMaterial = this.materialRegistry.get("crystal");
      if (circleMaterial) {
        const circleSpectrum = this.renderer.calculateFullSpectrum(
          circleMaterial,
          this.state.circleProperties
        );
        // Combine: multiply transmissions
        spectrum = spectrum.map((point, i) => ({
          wavelength: point.wavelength,
          transmission: point.transmission * circleSpectrum[i].transmission,
        }));
      }
    }

    // Apply triangle transformation if mouse is in triangle (after square and circle)
    if (inTriangle) {
      const triangleMaterial = this.materialRegistry.get("gas");
      if (triangleMaterial) {
        const triangleSpectrum = this.renderer.calculateFullSpectrum(
          triangleMaterial,
          this.state.triangleProperties
        );
        // Combine: multiply transmissions
        spectrum = spectrum.map((point, i) => ({
          wavelength: point.wavelength,
          transmission: point.transmission * triangleSpectrum[i].transmission,
        }));
      }
    }

    // Apply grid line intensity reduction (60% brightness)
    if (onGridLine) {
      spectrum = spectrum.map(point => ({
        wavelength: point.wavelength,
        transmission: point.transmission * 0.6,
      }));
    }

    // Draw graph
    this.drawSpectrumGraph(
      scene,
      spectrum,
      inSquare,
      inCircle,
      inTriangle,
      inBackground,
      onGridLine
    );
  }

  /**
   * Calculate fade factor for UV/IR regions
   * Visible (380-700nm): 1.0
   * UV fade: reverse quadratic from 1.0 at 380nm to near 0 at ~250nm (well before 200nm edge)
   *   (starts slow near visible, decays faster as going deeper into UV)
   * IR fade: reverse quadratic from 1.0 at 700nm to near 0 at ~850nm (well before 1000nm edge)
   *   (starts slow near visible, decays faster as going deeper into IR)
   */
  // calculateFadeFactor moved to SpectralCalculations utility
  // calculateFadeFactor moved to SpectralCalculations utility (no longer needed here)

  /**
   * Calculate uniform background spectrum for spectral display tool (high resolution)
   * Uniform over visible (380-700nm), fades in UV/IR
   */
  private calculateUniformBackgroundSpectrum(): SpectrumPoint[] {
    return calculateUniformBackgroundSpectrum();
  }

  /**
   * Calculate uniform background spectrum for RGB rendering (low resolution)
   * Uniform over visible (380-700nm), fades in UV/IR
   * Uses ~100 points matching calculateRGBSpectrum resolution
   * @internal Used by PerPixelSpectralRenderer for RGB calculations
   */
  private calculateRGBBackgroundSpectrum(): SpectrumPoint[] {
    return calculateRGBBackgroundSpectrum();
  }

  /**
   * Calculate UV background spectrum for spectral display tool (high resolution)
   * Uniform over UV range (200-400nm) where UV cutoffs occur and UV light starts inducing emission
   * Fades in visible and IR regions - most visible light should not be present
   */
  private calculateUVBackgroundSpectrum(): SpectrumPoint[] {
    return calculateUVBackgroundSpectrum();
  }

  /**
   * Calculate UV background spectrum for RGB rendering (low resolution)
   * Uniform over UV range (200-400nm), fades in visible/IR - most visible light should not be present
   * Uses ~100 points matching calculateRGBSpectrum resolution
   */
  private calculateUVRGBBackgroundSpectrum(): SpectrumPoint[] {
    return calculateUVRGBBackgroundSpectrum();
  }

  private drawSpectrumGraph(
    scene: GameScene,
    spectrum: Array<{ wavelength: number; transmission: number }>,
    inSquare: boolean,
    inCircle: boolean,
    inTriangle: boolean,
    inBackground: boolean,
    onGridLine: boolean = false
  ): void {
    const { width, height } = scene.cameras.main;
    const displayWidth = 400;
    const displayHeight = 300;
    const displayX = width - displayWidth - 20; // Right edge with margin
    const raiseAmount = height * 0.15; // Raise by 15% of grid height
    const displayY = height / 2 - displayHeight / 2 - raiseAmount; // Vertically centered, raised by 15%
    const graphX = displayX + 10; // Inside container, with margin
    const graphY = displayY + 40; // Below title
    const graphWidth = 380;
    const graphHeight = 200;

    // Calculate baseline max from background tile spectrum (for consistent Y-axis)
    // This ensures tile background shows at 100% and grid line shows at 60%
    if (inBackground && !onGridLine && !inSquare && !inCircle && !inTriangle) {
      // When viewing pure tile background, update the baseline max
      const maxTransmission = Math.max(...spectrum.map(p => p.transmission));
      this.spectralBaselineMax = Math.max(this.spectralBaselineMax, maxTransmission);
    }
    
    // Use baseline max for normalization (constant Y-axis scale)
    const yAxisMax = this.spectralBaselineMax;

    // Use selected wavelength range from slider
    const minWavelength = this.spectralMinWavelength;
    const maxWavelength = this.spectralMaxWavelength;

    this.spectralDisplayGraphics.clear();
    this.spectralDisplayGraphics.setPosition(graphX, graphY);

    // Draw rainbow color band above the graph
    const colorBandHeight = 15;
    const colorBandY = -colorBandHeight - 5; // Above the graph with small gap

    // Draw gradient from UV (left) through visible spectrum to IR (right)
    const numSegments = 200; // Number of color segments for smooth gradient
    const segmentWidth = graphWidth / numSegments;

    for (let i = 0; i < numSegments; i++) {
      const x = i * segmentWidth;
      const wavelength =
        minWavelength + (i / numSegments) * (maxWavelength - minWavelength);
      const { color, alpha } = this.wavelengthToColor(wavelength);

      this.spectralDisplayGraphics.fillStyle(color, alpha);
      this.spectralDisplayGraphics.fillRect(
        x,
        colorBandY,
        segmentWidth + 1,
        colorBandHeight
      );
    }

    // Draw axes
    this.spectralDisplayGraphics.lineStyle(2, 0x000000);
    this.spectralDisplayGraphics.moveTo(0, graphHeight);
    this.spectralDisplayGraphics.lineTo(graphWidth, graphHeight); // X-axis
    this.spectralDisplayGraphics.moveTo(0, graphHeight);
    this.spectralDisplayGraphics.lineTo(0, colorBandY); // Y-axis (extended to include color band)

    // Draw grid lines (adaptive spacing based on zoom)
    this.spectralDisplayGraphics.lineStyle(1, 0xcccccc, 0.5);
    const range = maxWavelength - minWavelength;
    let gridSpacing = 100; // Default 100nm spacing

    // Adjust grid spacing based on zoom level
    if (range < 200) gridSpacing = 10;
    else if (range < 400) gridSpacing = 20;
    else if (range < 600) gridSpacing = 50;

    const startWl = Math.ceil(minWavelength / gridSpacing) * gridSpacing;
    const endWl = Math.floor(maxWavelength / gridSpacing) * gridSpacing;

    for (let wl = startWl; wl <= endWl; wl += gridSpacing) {
      const x = ((wl - minWavelength) / range) * graphWidth;
      if (x >= 0 && x <= graphWidth) {
        this.spectralDisplayGraphics.moveTo(x, 0);
        this.spectralDisplayGraphics.lineTo(x, graphHeight);
      }
    }
    for (let t = 0.2; t <= 1.0; t += 0.2) {
      const y = graphHeight - t * graphHeight;
      this.spectralDisplayGraphics.moveTo(0, y);
      this.spectralDisplayGraphics.lineTo(graphWidth, y);
    }
    this.spectralDisplayGraphics.strokePath();

    // Draw spectrum line
    this.spectralDisplayGraphics.lineStyle(2, 0x0000ff);
    let firstPoint = true;

    for (let i = 0; i < spectrum.length; i++) {
      const point = spectrum[i];
      let x =
        ((point.wavelength - minWavelength) / (maxWavelength - minWavelength)) *
        graphWidth;
      // Normalize Y by baseline max so tile is at 100% and grid line is at 60%
      let y = graphHeight - (point.transmission / yAxisMax) * graphHeight;

      // Clamp coordinates to graph boundaries to prevent line exceeding plot limits
      x = Math.max(0, Math.min(graphWidth, x));
      y = Math.max(0, Math.min(graphHeight, y));

      // Color code by wavelength (rainbow)
      const wavelength = point.wavelength;
      let color = 0x0000ff;
      if (wavelength < 450)
        color = 0x8000ff; // Violet
      else if (wavelength < 490)
        color = 0x0000ff; // Blue
      else if (wavelength < 570)
        color = 0x00ff00; // Green
      else if (wavelength < 590)
        color = 0xffff00; // Yellow
      else if (wavelength < 620)
        color = 0xff8000; // Orange
      else color = 0xff0000; // Red

      this.spectralDisplayGraphics.lineStyle(2, color);

      if (firstPoint) {
        this.spectralDisplayGraphics.moveTo(x, y);
        firstPoint = false;
      } else {
        this.spectralDisplayGraphics.lineTo(x, y);
      }
    }
    this.spectralDisplayGraphics.strokePath();

    // Find absorption peaks (local minima in transmission)
    const peaks: Array<{ wavelength: number; transmission: number }> = [];
    for (let i = 1; i < spectrum.length - 1; i++) {
      if (
        spectrum[i].transmission < spectrum[i - 1].transmission &&
        spectrum[i].transmission < spectrum[i + 1].transmission &&
        spectrum[i].transmission < 0.8 // Significant absorption
      ) {
        peaks.push(spectrum[i]);
      }
    }

    // Draw absorption peak markers
    this.spectralDisplayGraphics.fillStyle(0xff0000);
    peaks.forEach((peak) => {
      const x =
        ((peak.wavelength - minWavelength) / (maxWavelength - minWavelength)) *
        graphWidth;
      const y = graphHeight - (peak.transmission / yAxisMax) * graphHeight;
      this.spectralDisplayGraphics.fillCircle(x, y, 3);
    });

    // Update info text position
    // Position info text relative to container (using variables already declared above)
    this.spectralDisplayText.setPosition(displayX + 10, displayY + 250);

    let infoText = "";
    const positions: string[] = [];
    if (inSquare) positions.push("Square");
    if (inCircle) positions.push("Circle");
    if (inTriangle) positions.push("Triangle");
    if (inBackground) positions.push("Background");

    if (positions.length > 0) {
      infoText = `Position: ${positions.join(" + ")}`;
    } else {
      infoText = "Position: Unknown";
    }

    if (peaks.length > 0) {
      infoText += `\nAbsorption Peaks: ${peaks
        .slice(0, 3)
        .map((p) => `${Math.round(p.wavelength)}nm`)
        .join(", ")}`;
    }

    // Calculate average transmission
    const avgTransmission =
      spectrum.reduce((sum, p) => sum + p.transmission, 0) / spectrum.length;
    infoText += `\nAvg Transmission: ${avgTransmission.toFixed(3)}`;

    this.spectralDisplayText.setText(infoText);
  }

  /**
   * Convert wavelength (nm) to RGB color for rainbow band
   * Fades into UV (dark violet/black) and IR (dark red/black)
   * Returns both color and alpha for proper fading
   */
  private wavelengthToColor(wavelength: number): WavelengthColor {
    return wavelengthToColor(wavelength);
  }

  /**
   * Calculate normalized colors for all elements with brightness normalization
   * All colors are stored as spectral distributions, converted to RGB, then normalized
   * NOTE: This method is kept for compatibility but is no longer used for rendering
   * Pixel rendering handles normalization internally
   */
  // @ts-ignore - kept for compatibility, no longer used
  private calculateNormalizedColors(): {
    backgroundRGB: RGB;
    squareRGB: RGB;
    circleRGB: RGB;
    triangleRGB: RGB;
    maxBrightness: number;
  } {
    // Get background spectrum (RGB resolution for performance)
    // Use UV spectrum if in UV mode, otherwise visible spectrum
    const backgroundSpectrum = this.state.uvMode
      ? this.calculateUVRGBBackgroundSpectrum()
      : this.calculateRGBBackgroundSpectrum();

    // Calculate raw RGB for each element (without normalization)
    const backgroundRGB = this.perPixelRenderer.spectrumToRGB(
      backgroundSpectrum,
      this.state.uvMode ? "UV" : "D65"
    );

    const squareMaterial = this.materialRegistry.get("water");
    const squareSpectrum = squareMaterial
      ? this.perPixelRenderer.calculatePixelSpectrum(
          backgroundSpectrum,
          [{ material: squareMaterial, properties: this.state.squareProperties }],
          this.state.uvMode
        )
      : backgroundSpectrum;
    const squareRGB = this.perPixelRenderer.spectrumToRGB(
      squareSpectrum,
      this.state.uvMode ? "UV" : "D65"
    );

    const circleMaterial = this.materialRegistry.get("crystal");
    const circleSpectrum = circleMaterial
      ? this.perPixelRenderer.calculatePixelSpectrum(
          backgroundSpectrum,
          [{ material: circleMaterial, properties: this.state.circleProperties }],
          this.state.uvMode
        )
      : backgroundSpectrum;
    const circleRGB = this.perPixelRenderer.spectrumToRGB(
      circleSpectrum,
      this.state.uvMode ? "UV" : "D65"
    );

    const triangleMaterial = this.materialRegistry.get("gas");
    const triangleSpectrum = triangleMaterial
      ? this.perPixelRenderer.calculatePixelSpectrum(
          backgroundSpectrum,
          [{ material: triangleMaterial, properties: this.state.triangleProperties }],
          this.state.uvMode
        )
      : backgroundSpectrum;
    const triangleRGB = this.perPixelRenderer.spectrumToRGB(
      triangleSpectrum,
      this.state.uvMode ? "UV" : "D65"
    );

    // Find max brightness across all elements
    const maxBrightness = Math.max(
      backgroundRGB.r,
      backgroundRGB.g,
      backgroundRGB.b,
      squareRGB.r,
      squareRGB.g,
      squareRGB.b,
      circleRGB.r,
      circleRGB.g,
      circleRGB.b,
      triangleRGB.r,
      triangleRGB.g,
      triangleRGB.b
    );

    // Normalize all colors
    return {
      backgroundRGB: this.perPixelRenderer.normalizeRGB(
        backgroundRGB,
        maxBrightness
      ),
      squareRGB: this.perPixelRenderer.normalizeRGB(squareRGB, maxBrightness),
      circleRGB: this.perPixelRenderer.normalizeRGB(circleRGB, maxBrightness),
      triangleRGB: this.perPixelRenderer.normalizeRGB(
        triangleRGB,
        maxBrightness
      ),
      maxBrightness,
    };
  }

  // rgbToPhaserColor removed - no longer needed with pixel rendering

  /**
   * Set up the layer system with background, square, circle, and triangle layers
   */
  private setupLayerSystem(): void {
    if (!this.grid) {
      console.error('Grid not available, cannot setup layer system');
      return;
    }

    this.layerSystem.clear();

    // Background layer (tiles at 100%, lines at 60%, 2 pixels wide)
    const backgroundLayer = new BackgroundLayer(this.grid, 2.0);
    this.layerSystem.addLayer(backgroundLayer);

    // Square layer (water material)
    const squareLayer = new Layer("square", 1);
    const squareMaterial = this.materialRegistry.get("water");
    if (squareMaterial) {
      const squareGeometry = new RectangleGeometry(
        this.state.squareX,
        this.state.squareY,
        this.state.squareSize,
        this.state.squareSize,
        "square"
      );
      const squareFilter = new MaterialFilter(
        squareMaterial,
        this.state.squareProperties,
        "square-filter"
      );
      squareLayer.addShape(squareGeometry, squareFilter);
    }
    this.layerSystem.addLayer(squareLayer);

    // Circle layer (crystal material)
    const circleLayer = new Layer("circle", 2);
    const circleMaterial = this.materialRegistry.get("crystal");
    if (circleMaterial) {
      const circleGeometry = new CircleGeometry(
        this.state.circleX,
        this.state.circleY,
        this.state.circleRadius,
        "circle"
      );
      const circleFilter = new MaterialFilter(
        circleMaterial,
        this.state.circleProperties,
        "circle-filter"
      );
      circleLayer.addShape(circleGeometry, circleFilter);
    }
    this.layerSystem.addLayer(circleLayer);

    // Triangle layer (gas material)
    const triangleLayer = new Layer("triangle", 3);
    const triangleMaterial = this.materialRegistry.get("gas");
    if (triangleMaterial) {
      const triangleGeometry = new TriangleGeometry(
        this.state.triangleX,
        this.state.triangleY,
        this.state.triangleSize,
        "triangle"
      );
      const triangleFilter = new MaterialFilter(
        triangleMaterial,
        this.state.triangleProperties,
        "triangle-filter"
      );
      triangleLayer.addShape(triangleGeometry, triangleFilter);
    }
    this.layerSystem.addLayer(triangleLayer);
  }

  // checkDirtyState is now handled by SpectralDemoState

  /**
   * Render pixels using the layer system
   * Attempts GPU rendering first, falls back to CPU if GPU not available
   */
  private renderPixels(scene: GameScene, force: boolean = false): void {
    // Check if state has changed - skip render if nothing changed
    if (!force && !this.state.checkDirtyState()) {
      return; // Skip render, nothing changed
    }
    
    this.state.markClean(); // Mark as clean after checking
    
    const profiler = getProfiler();
    profiler.startRender();
    
    try {
      profiler.start('total');
      const camera = scene.cameras.main;
      
      // Check if camera is ready (has valid dimensions)
      if (!camera || camera.worldView.width <= 0 || camera.worldView.height <= 0) {
        // Camera not ready yet - skip render (will be called again when ready)
        if (profiler.isEnabled()) {
          console.log('[Render] Camera not ready yet, skipping render');
        }
        return;
      }
      
      const bounds = {
        min: { x: camera.worldView.x, y: camera.worldView.y },
        max: {
          x: camera.worldView.x + camera.worldView.width,
          y: camera.worldView.y + camera.worldView.height,
        },
      };

      // Validate bounds (double-check)
      if (bounds.max.x <= bounds.min.x || bounds.max.y <= bounds.min.y) {
        // Camera not ready yet - this is normal during initialization
        // renderPixels will be called again when properties change or scene updates
        return;
      }

      // Get background spectrum
      profiler.start('backgroundSpectrum');
      const backgroundSpectrum = this.state.uvMode
        ? this.calculateUVRGBBackgroundSpectrum()
        : this.calculateRGBBackgroundSpectrum();
      profiler.end('backgroundSpectrum');

      profiler.start('setupLayerSystem');
      this.setupLayerSystem();
      profiler.end('setupLayerSystem');

          // Try GPU rendering if available (1:1 pixel resolution)
          // DEBUG: Allow disabling GPU for testing
          if (this.gpuRenderer && this.useGPU && !this.debugDisableGPU) {
        profiler.start('gpuPath');
        // Initialize GPU renderer if not already initialized
        const renderer = scene.game
          .renderer as Phaser.Renderer.WebGL.WebGLRenderer;
        if (renderer && renderer.gl) {
          // Use Phaser's WebGL context (should be WebGL 2.0 if configured correctly)
          const gl = renderer.gl;
          
          // Verify WebGL version for logging
          if (gl instanceof WebGL2RenderingContext) {
            console.log('[GPU] Using Phaser\'s native WebGL 2.0 context');
          } else {
            console.log('[GPU] Using Phaser\'s WebGL 1.0 context (WebGL 2.0 may not be supported or config not applied)');
          }
          
          if (!this.gpuRenderer.isAvailable()) {
            try {
              console.log('[GPU] Initializing GPU renderer...');
              this.gpuRenderer.initialize(gl);
              console.log('[GPU] GPU renderer initialized successfully');
            } catch (error) {
              console.error(
                "[GPU] GPU renderer initialization failed, falling back to CPU:",
                error
              );
              if (error instanceof Error) {
                console.error("[GPU] Error message:", error.message);
                console.error("[GPU] Error stack:", error.stack);
              }
              this.useGPU = false; // Disable GPU for this session
            }
          }

          if (this.gpuRenderer.isAvailable()) {
            // Get materials
            const squareMaterial = this.materialRegistry.get("water");
            const circleMaterial = this.materialRegistry.get("crystal");
            const triangleMaterial = this.materialRegistry.get("gas");

            if (squareMaterial && circleMaterial && triangleMaterial) {
              try {
                // Update material textures (profiling inside)
                this.gpuRenderer.updateMaterialTextures(
                  squareMaterial,
                  this.state.squareProperties,
                  circleMaterial,
                  this.state.circleProperties,
                  triangleMaterial,
                  this.state.triangleProperties,
                  backgroundSpectrum
                );

                // Attempt GPU render using optimized direct texture rendering
                profiler.start('gpuPath.pixelDrawing');
                
                // Create or resize RenderTexture if bounds changed
                const width = Math.ceil(bounds.max.x - bounds.min.x);
                const height = Math.ceil(bounds.max.y - bounds.min.y);
                
                if (!this.gpuRenderTexture || 
                    !this.cachedBounds ||
                    this.cachedBounds.max.x - this.cachedBounds.min.x !== width ||
                    this.cachedBounds.max.y - this.cachedBounds.min.y !== height) {
                  // Create or recreate RenderTexture
                  if (this.gpuRenderTexture) {
                    this.gpuRenderTexture.destroy();
                  }
                  // Create RenderTexture at screen coordinates (0, 0) with scroll factor 0
                  this.gpuRenderTexture = scene.add.renderTexture(0, 0, width, height);
                  this.gpuRenderTexture.setScrollFactor(0, 0);
                  this.gpuRenderTexture.setDepth(-1000);
                  this.gpuRenderTexture.setOrigin(0, 0);
                  this.cachedBounds = { min: { ...bounds.min }, max: { ...bounds.max } };
                } else {
                  // Update position if bounds moved
                  this.gpuRenderTexture.setPosition(bounds.min.x, bounds.min.y);
                }
                
                // Ensure RenderTexture is in clean state before rendering
                this.gpuRenderTexture.setSize(width, height);
                this.gpuRenderTexture.clear();
                
                // Render directly to RenderTexture (optimized - no readPixels)
                const renderSuccess = this.gpuRenderer.renderToPhaserTexture(
                  scene,
                  this.gpuRenderTexture,
                  bounds,
                  this.state.squareX,
                  this.state.squareY,
                  this.state.squareSize,
                  this.state.circleX,
                  this.state.circleY,
                  this.state.circleRadius,
                  this.state.triangleX,
                  this.state.triangleY,
                  this.state.triangleSize,
                  this.grid
                );
                
                if (renderSuccess) {
                  // GPU rendering succeeded - display the RenderTexture
                  try {
                    // Clear pixelGraphics (used for CPU fallback)
                    this.pixelGraphics.clear();
                    
                    // DEBUG: Log render state
                    console.log('[DEBUG] GPU render successful:', {
                      bounds: { min: bounds.min, max: bounds.max },
                      width,
                      height,
                      textureKey: this.gpuRenderTexture.texture.key,
                      pixelImageExists: !!this.pixelImage,
                      renderTextureVisible: this.gpuRenderTexture.visible,
                    });
                    
                    // Check if RenderTexture was drawn to directly (via renderTexture.draw())
                    // If so, we can use it directly without creating an Image
                    const renderTextureHasContent = this.gpuRenderTexture.texture && 
                      (this.gpuRenderTexture.texture as any).width > 0 && 
                      (this.gpuRenderTexture.texture as any).height > 0;
                    
                    if (renderTextureHasContent && !this.pixelImage) {
                      // TEST: Use RenderTexture directly instead of Image
                      console.log('[DEBUG] Using RenderTexture directly (renderTexture.draw() was used)');
                      
                      // Ensure RenderTexture is in the scene's display list
                      if (!scene.children.list.includes(this.gpuRenderTexture)) {
                        console.warn('[DEBUG] RenderTexture not in scene display list, adding it');
                        scene.children.add(this.gpuRenderTexture);
                      }
                      
                      this.gpuRenderTexture.setVisible(true);
                      this.gpuRenderTexture.setActive(true);
                      this.gpuRenderTexture.setDepth(-1000);
                      this.gpuRenderTexture.setScrollFactor(0, 0);
                      this.gpuRenderTexture.setOrigin(0, 0);
                      this.gpuRenderTexture.setPosition(0, 0);
                      
                      // Force RenderTexture to update its display
                      this.gpuRenderTexture.setAlpha(1.0);
                      
                      // Note: Removed bringToTop() as it overrides depth and puts RenderTexture above UI
                      // Depth setting (-1000) should handle proper layering
                      
                      console.log('[DEBUG] RenderTexture configured:', {
                        x: this.gpuRenderTexture.x,
                        y: this.gpuRenderTexture.y,
                        width: this.gpuRenderTexture.width,
                        height: this.gpuRenderTexture.height,
                        visible: this.gpuRenderTexture.visible,
                        active: this.gpuRenderTexture.active,
                        alpha: this.gpuRenderTexture.alpha,
                        depth: this.gpuRenderTexture.depth,
                        textureKey: this.gpuRenderTexture.texture.key,
                        textureWidth: (this.gpuRenderTexture.texture as any).width,
                        textureHeight: (this.gpuRenderTexture.texture as any).height,
                        inScene: scene.children.list.includes(this.gpuRenderTexture),
                        sceneChildrenCount: scene.children.list.length,
                        renderListIndex: scene.children.list.indexOf(this.gpuRenderTexture),
                      });
                      
                      profiler.end('gpuPath.pixelDrawing');
                      profiler.end('gpuPath');
                      profiler.end('total');
                      profiler.endRender();
                      return;
                    }
                    
                    // Fallback: Create or update Image from the texture
                    // The texture is registered in Phaser's texture manager via addCanvas
                    const textureKey = 'gpu-render-texture';
                    
                    if (!this.pixelImage) {
                      // Verify texture exists
                      if (!scene.textures.exists(textureKey)) {
                        console.error('[DEBUG] Texture does not exist after renderToPhaserTexture:', textureKey);
                        console.log('[DEBUG] Available textures:', Object.keys(scene.textures.list));
                        
                        // TEST: Try manual BaseTexture creation as fallback
                        console.log('[DEBUG] Attempting manual BaseTexture creation as fallback');
                        try {
                          // Get the canvas from GPUPixelRenderer (we need to access it)
                          // For now, this is a test - we'll need to modify GPUPixelRenderer to return the canvas
                          // Or we can try creating BaseTexture from a data URL
                          console.warn('[DEBUG] BaseTexture approach requires canvas access - skipping for now');
                        } catch (baseTextureError) {
                          console.error('[DEBUG] BaseTexture creation failed:', baseTextureError);
                        }
                        
                        profiler.end('gpuPath.pixelDrawing');
                        profiler.end('gpuPath');
                        profiler.end('total');
                        profiler.endRender();
                        return;
                      }
                      
                      console.log('[DEBUG] Creating Image from texture:', textureKey);
                      
                      // TEST: Get frame explicitly and create Image with explicit frame name
                      const texture = scene.textures.get(textureKey);
                      if (texture) {
                        const explicitFrame = (texture as any).getFrame('__BASE');
                        console.log('[DEBUG] Explicit frame before Image creation:', {
                          frameExists: !!explicitFrame,
                          frameName: explicitFrame?.name,
                          frameWidth: explicitFrame?.width,
                          frameHeight: explicitFrame?.height,
                        });
                        
                        if (explicitFrame && explicitFrame.width > 0 && explicitFrame.height > 0) {
                          // Create Image with explicit frame name
                          console.log('[DEBUG] Creating Image with explicit __BASE frame');
                          this.pixelImage = scene.add.image(0, 0, textureKey, '__BASE');
                        } else {
                          // Manual BaseTexture creation is not supported via public API
                          // Fallback: Create Image without explicit frame
                          console.warn('[DEBUG] Explicit frame invalid, creating Image without frame name');
                          this.pixelImage = scene.add.image(0, 0, textureKey);
                        }
                      } else {
                        // Fallback: Create Image without explicit frame
                        console.warn('[DEBUG] Texture not found in manager, creating Image without frame name');
                        this.pixelImage = scene.add.image(0, 0, textureKey);
                      }
                      
                      // Detailed frame validation with comprehensive logging
                      // Reuse texture variable declared above (line 1784)
                      const frame = this.pixelImage.frame;
                      const frameValid = frame && frame.width > 0 && frame.height > 0;
                      
                      // Log detailed frame information
                      console.log('[DEBUG] Image frame details:', {
                        frameExists: !!frame,
                        frameIsNull: frame === null,
                        frameName: frame?.name,
                        frameWidth: frame?.width,
                        frameHeight: frame?.height,
                        frameCutX: frame?.cutX,
                        frameCutY: frame?.cutY,
                        frameCutWidth: frame?.cutWidth,
                        frameCutHeight: frame?.cutHeight,
                        frameX: frame?.x,
                        frameY: frame?.y,
                        frameValid: frameValid,
                        textureKey: this.pixelImage.texture?.key,
                        textureFrames: this.pixelImage.texture?.frames ? Object.keys(this.pixelImage.texture.frames) : [],
                        textureSource: this.pixelImage.texture?.source?.[0] ? {
                          exists: true,
                          type: this.pixelImage.texture.source[0].constructor.name,
                          width: this.pixelImage.texture.source[0].width,
                          height: this.pixelImage.texture.source[0].height,
                          image: this.pixelImage.texture.source[0].image ? (this.pixelImage.texture.source[0].image instanceof HTMLCanvasElement ? 'HTMLCanvasElement' : this.pixelImage.texture.source[0].image.constructor.name) : 'null',
                        } : { exists: false },
                        textureFromManager: (() => {
                          const textureForValidation = scene.textures.get(textureKey);
                          return textureForValidation ? {
                            exists: true,
                            frames: Object.keys(textureForValidation.frames || {}),
                            baseFrame: (textureForValidation as any).getFrame('__BASE') ? {
                              name: (textureForValidation as any).getFrame('__BASE')!.name,
                              width: (textureForValidation as any).getFrame('__BASE')!.width,
                              height: (textureForValidation as any).getFrame('__BASE')!.height,
                            } : null,
                          } : { exists: false };
                        })(),
                      });
                      
                      if (!frameValid) {
                        console.error('[DEBUG] Image frame invalid, attempting refresh');
                        console.error('[DEBUG] Frame object:', frame);
                        console.error('[DEBUG] Texture object:', this.pixelImage.texture);
                        const textureForValidation = scene.textures.get(textureKey);
                        console.error('[DEBUG] Texture from manager:', textureForValidation);
                        
                        // Try to get frame explicitly from texture manager
                        if (textureForValidation) {
                          const explicitFrame = (textureForValidation as any).getFrame('__BASE');
                          console.log('[DEBUG] Explicit __BASE frame from texture manager:', {
                            exists: !!explicitFrame,
                            name: explicitFrame?.name,
                            width: explicitFrame?.width,
                            height: explicitFrame?.height,
                          });
                        }
                        
                        // Force refresh by setting texture again
                        this.pixelImage.setTexture(textureKey, 0);
                        
                        // Check again after refresh
                        const frameAfter = this.pixelImage.frame;
                        const frameValidAfter = frameAfter && frameAfter.width > 0 && frameAfter.height > 0;
                        
                        console.log('[DEBUG] After texture refresh:', {
                          frameAfterExists: !!frameAfter,
                          frameAfterWidth: frameAfter?.width,
                          frameAfterHeight: frameAfter?.height,
                          frameValidAfter: frameValidAfter,
                        });
                        
                        if (!frameValidAfter) {
                          console.error('[DEBUG] Frame still invalid after refresh!');
                        }
                      }
                      
                      this.pixelImage.setOrigin(0, 0);
                      this.pixelImage.setDisplaySize(width, height);
                      this.pixelImage.setScrollFactor(0, 0);
                      this.pixelImage.setDepth(-1000);
                      
                      // TEST: Visibility states - test with alpha and tint to verify Image is rendering
                      // Temporarily set alpha to 0.5 to see if Image is rendering but transparent
                      // this.pixelImage.setAlpha(0.5);
                      // Test with tint to see if Image bounds are correct
                      // this.pixelImage.setTint(0xff0000); // Red tint
                      
                      // DEBUG: Temporarily hide Image to test if UI appears
                      // Uncomment to test if UI is behind the Image
                      // this.pixelImage.setVisible(false);
                      this.pixelImage.setVisible(true);
                      this.pixelImage.setAlpha(1.0);
                      
                      // Verify display dimensions match canvas dimensions
                      console.log('[DEBUG] Image display dimensions:', {
                        displayWidth: this.pixelImage.displayWidth,
                        displayHeight: this.pixelImage.displayHeight,
                        canvasWidth: width,
                        canvasHeight: height,
                        dimensionsMatch: this.pixelImage.displayWidth === width && this.pixelImage.displayHeight === height,
                        frameWidth: this.pixelImage.frame?.width,
                        frameHeight: this.pixelImage.frame?.height,
                      });
                      
                      // Force update the display list
                      scene.children.bringToTop(this.pixelImage);
                      
                      // DEBUG: Add visual border
                      const debugBorder = scene.add.rectangle(0, 0, width, height, 0xff0000, 0.3);
                      debugBorder.setOrigin(0, 0);
                      debugBorder.setDepth(-1);
                      debugBorder.setScrollFactor(0, 0);
                      debugBorder.setStrokeStyle(2, 0xff0000);
                      debugBorder.setFillStyle(0xff0000, 0.1);
                      
                      console.log('[DEBUG] Image created:', {
                        x: this.pixelImage.x,
                        y: this.pixelImage.y,
                        displayWidth: this.pixelImage.displayWidth,
                        displayHeight: this.pixelImage.displayHeight,
                        depth: this.pixelImage.depth,
                        visible: this.pixelImage.visible,
                        alpha: this.pixelImage.alpha,
                        textureKey: this.pixelImage.texture.key,
                        hasFrame: !!frame,
                        frameName: frame?.name,
                        frameWidth: frame?.width,
                        frameHeight: frame?.height,
                        frameValid: frameValid,
                        textureSource: this.pixelImage.texture?.source?.[0] ? 'exists' : 'missing',
                        inScene: scene.children.list.includes(this.pixelImage),
                        sceneChildrenCount: scene.children.list.length,
                      });
                      
                      if (!frameValid) {
                        console.error('[DEBUG] Image frame is invalid! Frame:', frame);
                        console.error('[DEBUG] Texture info:', {
                          texture: this.pixelImage.texture,
                          textureFrames: this.pixelImage.texture?.frames ? Object.keys(this.pixelImage.texture.frames) : [],
                        });
                      }
                      
                      // DEBUG: Temporarily hide Image to test if UI appears
                      // Uncomment this line to test if UI is behind the Image:
                      this.pixelImage.setVisible(false);
                      console.log('[DEBUG] Temporarily hiding Image to test UI visibility');
                      
                      // DEBUG: Temporarily set to very high depth to see if it appears
                      // this.pixelImage.setDepth(10000);
                      // console.log('[DEBUG] Temporarily set Image depth to 10000 to test visibility');
                      
                      // DEBUG: Also try setting to very low depth to see if it's behind something
                      // But first test with high depth
                    } else {
                      // Update existing image - refresh texture reference
                      console.log('[DEBUG] Updating Image texture');
                      
                      // Force refresh: remove from scene, update texture, re-add
                      const wasVisible = this.pixelImage.visible;
                      const wasDepth = this.pixelImage.depth;
                      scene.children.remove(this.pixelImage);
                      
                      if (scene.textures.exists(textureKey)) {
                        // Set texture with frame index 0 to ensure it uses the default frame
                        this.pixelImage.setTexture(textureKey, 0);
                        console.log('[DEBUG] Texture set on Image, frame:', this.pixelImage.frame?.name);
                      } else {
                        console.error('[DEBUG] Texture does not exist when updating Image!');
                      }
                      
                      // Re-add to scene
                      scene.children.add(this.pixelImage);
                      
                      this.pixelImage.setPosition(0, 0);
                      this.pixelImage.setDisplaySize(width, height);
                      this.pixelImage.setScrollFactor(0, 0);
                      this.pixelImage.setDepth(wasDepth);
                      this.pixelImage.setVisible(wasVisible);
                      this.pixelImage.setAlpha(1.0);
                      
                      // DEBUG: Temporarily set to very high depth to see if it appears
                      this.pixelImage.setDepth(10000);
                      
                      const frame = this.pixelImage.frame;
                      const frameValid = frame && frame.width > 0 && frame.height > 0;
                      
                      console.log('[DEBUG] Image updated and refreshed:', {
                        x: this.pixelImage.x,
                        y: this.pixelImage.y,
                        visible: this.pixelImage.visible,
                        alpha: this.pixelImage.alpha,
                        textureKey: this.pixelImage.texture.key,
                        frameName: frame?.name,
                        frameWidth: frame?.width,
                        frameHeight: frame?.height,
                        frameValid: frameValid,
                        depth: this.pixelImage.depth,
                        inScene: scene.children.list.includes(this.pixelImage),
                        textureSource: this.pixelImage.texture?.source?.[0] ? 'exists' : 'missing',
                      });
                      
                      if (!frameValid) {
                        console.error('[DEBUG] Image frame is invalid after update! Frame:', frame);
                        console.error('[DEBUG] Texture info:', {
                          texture: this.pixelImage.texture,
                          textureFrames: this.pixelImage.texture?.frames ? Object.keys(this.pixelImage.texture.frames) : [],
                        });
                      }
                      
                      // DEBUG: Temporarily hide Image to see if UI appears
                      // this.pixelImage.setVisible(false);
                      // console.log('[DEBUG] Temporarily hiding Image to test UI visibility');
                    }
                    
                    profiler.end('gpuPath.pixelDrawing');
                    profiler.end('gpuPath');
                    profiler.end('total');
                    profiler.endRender();
                    
                    // DEBUG: Log UI element states after render
                    console.log('[DEBUG] UI elements after render:', {
                      totalUIElements: this.uiElements.length,
                      uiElementStates: this.uiElements.map((el, idx) => ({
                        index: idx,
                        type: el.constructor.name,
                        visible: (el as any).visible,
                        active: el.active,
                        depth: (el as any).depth,
                        alpha: (el as any).alpha,
                      })),
                    });
                    
                    profiler.report();
                    
                    // Auto-export after 5 renders
                    if (profiler.getRenderCount() % 5 === 0) {
                      profiler.exportJSON();
                    }
                    
                    return; // Skip CPU rendering
                  } catch (pixelError) {
                    console.error("Error displaying GPU result:", pixelError);
                    profiler.end('gpuPath.pixelDrawing');
                    // Fall through to CPU rendering
                  }
                } else {
                  if (profiler.isEnabled()) {
                    console.warn(
                      `GPU renderToPhaserTexture returned false, falling back to CPU`
                    );
                  }
                  profiler.end('gpuPath.pixelDrawing');
                }
              } catch (error) {
                console.error("[GPU] GPU rendering failed, falling back to CPU:", error);
                if (error instanceof Error) {
                  console.error("[GPU] Error message:", error.message);
                  console.error("[GPU] Error stack:", error.stack);
                }
                // Continue to CPU fallback
              }
            } else {
              console.warn("Materials not found, falling back to CPU rendering");
            }
          }
        }
        profiler.end('gpuPath');
      }

      // Fall back to CPU rendering (or use if GPU not available)
      profiler.start('cpuPath');
      // For CPU rendering, use a reasonable pixel size to avoid performance issues
      // Calculate pixel size based on screen size to balance quality and performance
      const screenWidth = bounds.max.x - bounds.min.x;
      const screenHeight = bounds.max.y - bounds.min.y;
      const totalPixels = screenWidth * screenHeight;
      
      // Use 1:1 for small screens, but scale up pixel size for larger screens to avoid freezing
      // Target: ~500k pixels max for CPU rendering
      const maxPixels = 500000;
      const cpuPixelSize = totalPixels > maxPixels 
        ? Math.ceil(Math.sqrt(totalPixels / maxPixels))
        : 1.0;
      
      if (profiler.isEnabled()) {
        console.log(`CPU rendering at ${cpuPixelSize}x${cpuPixelSize} pixel size (${Math.ceil(screenWidth / cpuPixelSize)}x${Math.ceil(screenHeight / cpuPixelSize)} pixels)`);
      }
      
      // Check if layer system is set up
      if (!this.layerSystem) {
        console.error('Layer system not initialized');
        return;
      }

      // Profiling inside render()
      const pixelMap = this.pixelRenderer.render(
        this.layerSystem,
        backgroundSpectrum,
        bounds,
        cpuPixelSize,
        this.state.uvMode,
        true // Use anti-aliasing
      );

      // Draw pixels to graphics
      profiler.start('cpuPath.pixelDrawing');
      this.pixelGraphics.clear();
      // Hide GPU image if it exists (CPU fallback)
      if (this.pixelImage) {
        this.pixelImage.setVisible(false);
      }
      for (const [key, rgb] of pixelMap.entries()) {
        const [x, y] = key.split(",").map(Number);
        const color = (rgb.r << 16) | (rgb.g << 8) | rgb.b;
        this.pixelGraphics.fillStyle(color, 1.0);
        this.pixelGraphics.fillRect(x, y, cpuPixelSize, cpuPixelSize);
      }
      profiler.end('cpuPath.pixelDrawing');
      profiler.end('cpuPath');
      
      profiler.end('total');
      profiler.endRender();
      profiler.report();
      
      // Auto-export after 5 renders
      // Debug: export profile every 5th render
      if (profiler.getRenderCount() % 5 === 0) {
        profiler.exportJSON();
      }
    } catch (error) {
      console.error('Error in renderPixels:', error);
      profiler.end('total');
      profiler.endRender();
      // Don't re-throw - just log the error so the game doesn't break
    }
  }

  // Old shape rendering methods removed - now using pixel-by-pixel rendering
  // These methods are no longer used but kept for reference:
  // - updateSquareColor()
  // - updateCircleColor()
  // - updateTriangleColor()

  // drawTriangle removed - no longer needed with pixel rendering

  private createUIControls(scene: GameScene): void {
    const { width, height } = scene.cameras.main;

    // Position all control panels side by side along the bottom
    // Raise by 10% of grid height
    const raiseAmount = height * 0.1;
    const panelY = height - 220 - raiseAmount; // Position near bottom, raised by 10%
    const panelSpacing = width / 3; // Divide screen into 3 equal sections
    const panelWidth = panelSpacing - 20; // Leave some margin between panels
    const panelXStart = 10; // Start from left with small margin

    // Square controls - left panel
    this.createControlPanel(
      scene,
      "Square (Water)",
      panelXStart,
      panelY,
      this.state.squareProperties,
      "water",
      () => {
        this.setupLayerSystem();
        this.renderPixels(scene);
        this.updateSpectralDisplayWithCurrentState(scene);
      },
      panelWidth
    );

    // Circle controls - middle panel
    this.createControlPanel(
      scene,
      "Circle (Crystal)",
      panelXStart + panelSpacing,
      panelY,
      this.state.circleProperties,
      "crystal",
      () => {
        this.setupLayerSystem();
        this.renderPixels(scene);
        this.updateSpectralDisplayWithCurrentState(scene);
      },
      panelWidth
    );

    // Triangle controls - right panel
    this.createControlPanel(
      scene,
      "Triangle (Gas)",
      panelXStart + panelSpacing * 2,
      panelY,
      this.state.triangleProperties,
      "gas",
      () => {
        this.setupLayerSystem();
        this.renderPixels(scene);
        this.updateSpectralDisplayWithCurrentState(scene);
      },
      panelWidth
    );

    // UV Mode toggle - position at top right
    const uvModeButton = scene.add.text(width - 150, 10, "UV Mode: OFF", {
      fontSize: "14px",
      color: "#000000",
      backgroundColor: "#cccccc",
      padding: { x: 8, y: 4 },
    });
    uvModeButton.setOrigin(0, 0);
    uvModeButton.setDepth(1001);
    uvModeButton.setScrollFactor(0);
    uvModeButton.setInteractive({ useHandCursor: true });
    uvModeButton.on("pointerdown", () => {
      this.state.uvMode = !this.state.uvMode;
      this.state.markDirty(); // Mark as dirty when UV mode changes
      uvModeButton.setText(`UV Mode: ${this.state.uvMode ? "ON" : "OFF"}`);
      uvModeButton.setBackgroundColor(this.state.uvMode ? "#4a90e2" : "#cccccc");
      // Re-render pixels with new UV mode
      this.setupLayerSystem();
      this.renderPixels(scene);
      // Update spectral display with current state
      this.updateSpectralDisplayWithCurrentState(scene);
    });
    this.uiElements.push(uvModeButton);

    // Add keyboard shortcut for exporting profiling data (P key)
    const profiler = getProfiler();
    if (profiler.isEnabled()) {
      scene.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
        if (event.key === 'p' || event.key === 'P') {
          profiler.exportJSON();
        }
      });
      console.log('[Performance] Profiling enabled. Press P to export JSON profile.');
    }
  }

  private createControlPanel(
    scene: GameScene,
    title: string,
    x: number,
    y: number,
    properties: SolutionProperties,
    materialId: string,
    onUpdate: () => void,
    panelWidth: number = 260
  ): void {
    const material = this.materialRegistry.get(materialId);
    if (!material) return;

    // Add background panel for visibility
    const estimatedHeight = 200; // Approximate height
    const bg = scene.add.rectangle(
      x - 5,
      y - 5,
      panelWidth,
      estimatedHeight,
      0xffffff,
      0.95
    );
    bg.setOrigin(0, 0);
    bg.setStrokeStyle(2, 0x000000);
    bg.setDepth(1000);
    bg.setScrollFactor(0);
    this.uiElements.push(bg);

    let currentY = y;

    // Title
    const titleText = scene.add.text(x, currentY, title, {
      fontSize: "14px",
      color: "#000000",
      fontStyle: "bold",
      backgroundColor: "#e0e0e0",
      padding: { x: 6, y: 3 },
    });
    titleText.setOrigin(0, 0);
    titleText.setDepth(1001);
    titleText.setScrollFactor(0); // Fixed to camera
    this.uiElements.push(titleText);
    currentY += 30;

    // Molecule concentration sliders
    material.molecules.forEach((molecule) => {
      const label = scene.add.text(x, currentY, `${molecule.name}:`, {
        fontSize: "10px",
        color: "#000000",
      });
      label.setOrigin(0, 0);
      label.setDepth(1001);
      label.setScrollFactor(0);
      this.uiElements.push(label);
      currentY += 16;

      const currentValue =
        properties.moleculeConcentrations.get(molecule.id) || 0;
      const valueText = scene.add.text(
        x + 120,
        currentY - 16,
        `${currentValue.toFixed(4)} M`,
        {
          fontSize: "10px",
          color: "#000000",
        }
      );
      valueText.setOrigin(0, 0);
      valueText.setDepth(1001);
      valueText.setScrollFactor(0);
      this.uiElements.push(valueText);

      // Slider background - adjust width to fit panel
      const sliderWidth = Math.min(150, panelWidth - 140);
      const sliderBg = scene.add.rectangle(
        x,
        currentY,
        sliderWidth,
        6,
        0xcccccc
      );
      sliderBg.setOrigin(0, 0.5);
      sliderBg.setInteractive({ useHandCursor: true });
      sliderBg.setDepth(1001);
      sliderBg.setScrollFactor(0);
      this.uiElements.push(sliderBg);

      // Slider handle
      const handle = scene.add.circle(x, currentY, 5, 0x4a90e2);
      handle.setInteractive({ useHandCursor: true });
      handle.setDepth(1002);
      handle.setScrollFactor(0);
      this.uiElements.push(handle);

      // Logarithmic scale: 0.0001 M to 0.1 M
      const minConc = 0.0001;
      const maxConc = 0.1;
      const currentPosition = logarithmicToLinear(
        currentValue,
        minConc,
        maxConc
      );
      handle.x = x + currentPosition * sliderWidth;

      // Update function
      const updateSlider = (pointer: Phaser.Input.Pointer) => {
        this.state.markDirty(); // Mark as dirty when slider changes
        
        // Throttle render calls during rapid slider updates
        // Only render once per frame during dragging
        if (this.renderThrottleTimer === null) {
          this.renderThrottleTimer = requestAnimationFrame(() => {
            this.renderPixels(scene, true);
            this.renderThrottleTimer = null;
          });
        }
        // Get screen position (since slider is fixed to camera)
        const screenX = pointer.x;
        const localX = Math.max(0, Math.min(sliderWidth, screenX - x));
        const position = localX / sliderWidth; // 0-1
        const newValue = linearToLogarithmic(position, minConc, maxConc);
        properties.moleculeConcentrations.set(molecule.id, newValue);
        valueText.setText(`${newValue.toFixed(4)} M`);
        const newPosition = logarithmicToLinear(newValue, minConc, maxConc);
        handle.x = x + newPosition * sliderWidth;
        // Clamp handle position to slider bounds
        handle.x = Math.max(x, Math.min(x + sliderWidth, handle.x));
        onUpdate();
      };

      sliderBg.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        updateSlider(pointer);
        scene.input.on("pointermove", updateSlider);
        scene.input.once("pointerup", () => {
          scene.input.off("pointermove", updateSlider);
        });
      });

      handle.on("pointerdown", () => {
        const moveHandler = (movePointer: Phaser.Input.Pointer) => {
          updateSlider(movePointer);
        };
        scene.input.on("pointermove", moveHandler);
        scene.input.once("pointerup", () => {
          scene.input.off("pointermove", moveHandler);
        });
      });

      currentY += 30;
    });

    // Temperature slider
    const tempLabel = scene.add.text(x, currentY, "Temperature:", {
      fontSize: "10px",
      color: "#000000",
    });
    tempLabel.setOrigin(0, 0);
    tempLabel.setDepth(1001);
    tempLabel.setScrollFactor(0);
    this.uiElements.push(tempLabel);
    currentY += 16;

    const tempValueText = scene.add.text(
      x + 120,
      currentY - 16,
      `${Math.round(properties.temperature)} K`,
      {
        fontSize: "10px",
        color: "#000000",
      }
    );
    tempValueText.setOrigin(0, 0);
    tempValueText.setDepth(1001);
    tempValueText.setScrollFactor(0);
    this.uiElements.push(tempValueText);

    const tempSliderWidth = Math.min(150, panelWidth - 140);
    const tempSliderBg = scene.add.rectangle(
      x,
      currentY,
      tempSliderWidth,
      6,
      0xcccccc
    );
    tempSliderBg.setOrigin(0, 0.5);
    tempSliderBg.setInteractive({ useHandCursor: true });
    tempSliderBg.setDepth(1001);
    tempSliderBg.setScrollFactor(0);
    this.uiElements.push(tempSliderBg);

    const tempHandle = scene.add.circle(x, currentY, 5, 0x4a90e2);
    tempHandle.setInteractive({ useHandCursor: true });
    tempHandle.setDepth(1002);
    tempHandle.setScrollFactor(0);
    this.uiElements.push(tempHandle);

    // Temperature range: 1 K to 2000 K (logarithmic)
    const minTemp = 1;
    const maxTemp = 2000;
    const currentTempPosition = logarithmicToLinear(
      properties.temperature,
      minTemp,
      maxTemp
    );
    tempHandle.x = x + currentTempPosition * tempSliderWidth;

    const updateTemp = (pointer: Phaser.Input.Pointer) => {
      const screenX = pointer.x;
      const localX = Math.max(0, Math.min(tempSliderWidth, screenX - x));
      const position = localX / tempSliderWidth; // 0-1
      const newTemp = linearToLogarithmic(position, minTemp, maxTemp);
      properties.temperature = Math.max(minTemp, Math.min(maxTemp, newTemp));
      this.state.markDirty(); // Mark as dirty when property changes
      const displayTemp = Math.max(1, Math.round(properties.temperature));
      tempValueText.setText(`${displayTemp} K`);
      const newPosition = logarithmicToLinear(
        properties.temperature,
        minTemp,
        maxTemp
      );
      tempHandle.x = x + newPosition * tempSliderWidth;
      // Clamp handle position to slider bounds
      tempHandle.x = Math.max(x, Math.min(x + tempSliderWidth, tempHandle.x));
      onUpdate();
    };

    tempSliderBg.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      updateTemp(pointer);
      scene.input.on("pointermove", updateTemp);
      scene.input.once("pointerup", () => {
        scene.input.off("pointermove", updateTemp);
      });
    });

    tempHandle.on("pointerdown", () => {
      const moveHandler = (movePointer: Phaser.Input.Pointer) => {
        updateTemp(movePointer);
      };
      scene.input.on("pointermove", moveHandler);
      scene.input.once("pointerup", () => {
        scene.input.off("pointermove", moveHandler);
      });
    });

    currentY += 30;

    // Depth slider
    const depthLabel = scene.add.text(x, currentY, "Depth:", {
      fontSize: "10px",
      color: "#000000",
    });
    depthLabel.setOrigin(0, 0);
    depthLabel.setDepth(1001);
    depthLabel.setScrollFactor(0);
    this.uiElements.push(depthLabel);
    currentY += 16;

    // Format depth display
    const formatDepth = (depthM: number): string => {
      if (depthM >= 1000) {
        return `${(depthM / 1000).toFixed(2)} km`;
      } else if (depthM >= 1) {
        return `${depthM.toFixed(2)} m`;
      } else if (depthM >= 0.01) {
        return `${(depthM * 100).toFixed(0)} cm`;
      } else {
        return `${(depthM * 1000).toFixed(0)} mm`;
      }
    };

    const depthValueText = scene.add.text(
      x + 120,
      currentY - 16,
      formatDepth(properties.depth),
      {
        fontSize: "10px",
        color: "#000000",
      }
    );
    depthValueText.setOrigin(0, 0);
    depthValueText.setDepth(1001);
    depthValueText.setScrollFactor(0);
    this.uiElements.push(depthValueText);

    const depthSliderWidth = Math.min(150, panelWidth - 140);
    const depthSliderBg = scene.add.rectangle(
      x,
      currentY,
      depthSliderWidth,
      6,
      0xcccccc
    );
    depthSliderBg.setOrigin(0, 0.5);
    depthSliderBg.setInteractive({ useHandCursor: true });
    depthSliderBg.setDepth(1001);
    depthSliderBg.setScrollFactor(0);
    this.uiElements.push(depthSliderBg);

    const depthHandle = scene.add.circle(x, currentY, 5, 0x4a90e2);
    depthHandle.setInteractive({ useHandCursor: true });
    depthHandle.setDepth(1002);
    depthHandle.setScrollFactor(0);
    this.uiElements.push(depthHandle);

    // Logarithmic scale: 0.01 m to 1000 m
    const minDepth = 0.01;
    const maxDepth = 1000;
    const currentDepthPosition = logarithmicToLinear(
      properties.depth,
      minDepth,
      maxDepth
    );
    depthHandle.x = x + currentDepthPosition * depthSliderWidth;

    const updateDepth = (pointer: Phaser.Input.Pointer) => {
      const screenX = pointer.x;
      const localX = Math.max(0, Math.min(depthSliderWidth, screenX - x));
      const position = localX / depthSliderWidth; // 0-1
      const newDepth = linearToLogarithmic(position, minDepth, maxDepth);
      properties.depth = Math.max(minDepth, Math.min(maxDepth, newDepth));
      this.state.markDirty(); // Mark as dirty when property changes
      depthValueText.setText(formatDepth(properties.depth));
      const newPosition = logarithmicToLinear(
        properties.depth,
        minDepth,
        maxDepth
      );
      depthHandle.x = x + newPosition * depthSliderWidth;
      // Clamp handle position to slider bounds
      depthHandle.x = Math.max(
        x,
        Math.min(x + depthSliderWidth, depthHandle.x)
      );
      onUpdate();
    };

    depthSliderBg.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      updateDepth(pointer);
      scene.input.on("pointermove", updateDepth);
      scene.input.once("pointerup", () => {
        scene.input.off("pointermove", updateDepth);
      });
    });

    depthHandle.on("pointerdown", () => {
      const moveHandler = (movePointer: Phaser.Input.Pointer) => {
        updateDepth(movePointer);
      };
      scene.input.on("pointermove", moveHandler);
      scene.input.once("pointerup", () => {
        scene.input.off("pointermove", moveHandler);
      });
    });

    // All elements are added directly to scene, no container needed
  }

  reset(scene: GameScene): void {
    // Reset all properties to defaults
    this.state.squareProperties = this.createDefaultProperties("water");
    this.state.circleProperties = this.createDefaultProperties("crystal");
    this.state.triangleProperties = this.createDefaultProperties("gas");
    this.state.uvMode = false;

    // Re-initialize the demo (recreates graphics and UI)
    this.cleanup(scene);
    this.initialize(scene);
  }

  cleanup(scene: GameScene): void {
    // Remove input listeners
    scene.input.off("pointermove");
    scene.input.off("pointerdown");

    // Cleanup graphics
    if (this.squareGraphics) {
      this.squareGraphics.destroy();
    }
    if (this.circleGraphics) {
      this.circleGraphics.destroy();
    }
    if (this.triangleGraphics) {
      this.triangleGraphics.destroy();
    }
    if (this.spectralDisplayGraphics) {
      this.spectralDisplayGraphics.destroy();
    }
    // Cleanup UI elements
    this.uiElements.forEach((element) => {
      element.destroy();
    });
    this.uiElements = [];
    
    // Cleanup GPU render texture - must remove from scene to prevent blank screen
    if (this.gpuRenderTexture) {
      this.gpuRenderTexture.setVisible(false);
      if (scene.children.list.includes(this.gpuRenderTexture)) {
        scene.children.remove(this.gpuRenderTexture);
      }
      this.gpuRenderTexture.destroy();
      this.gpuRenderTexture = null;
      this.cachedBounds = null;
    }
  }

  getTriangleProperties(): SolutionProperties {
    return this.state.triangleProperties;
  }

  getMaterialRegistry(): MaterialRegistry {
    return this.materialRegistry;
  }

  /**
   * Get grid colors for spectral rendering
   * Grid tiles use normalized background RGB, lines use 60% brightness
   */
  getGridColors(): { backgroundColor: RGB; lineColor: RGB } | undefined {
    // With pixel-by-pixel rendering, grid is rendered as part of the pixel rendering
    // This method is kept for compatibility but returns undefined to use default grid rendering
    // The actual grid colors are now part of the pixel rendering (background layer)
    return undefined;
  }

  getEffectRegistry(): EffectRegistry {
    return this.effectRegistry;
  }

  getSquareProperties(): SolutionProperties {
    return this.state.squareProperties;
  }

  getCircleProperties(): SolutionProperties {
    return this.state.circleProperties;
  }
}
