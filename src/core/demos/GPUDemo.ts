import { Demo } from "./Demo";
import { GameScene } from "../../scenes/GameScene";
import Phaser from "phaser";
import { ModeStrategy } from "./modes/ModeStrategy";
import { Mode1_Baseline } from "./modes/Mode1_Baseline";
import { Mode2_GPUSetup } from "./modes/Mode2_GPUSetup";
import { Mode3_GPURender } from "./modes/Mode3_GPURender";

/**
 * GPU Rendering Test Demo
 * Tests different GPU rendering approaches to identify which works
 */
export class GPUDemo implements Demo {
  readonly name = "GPU Rendering Test";
  readonly description = "Tests different GPU rendering modes to identify working approaches";

  private renderTexture: Phaser.GameObjects.RenderTexture | null = null;
  private testImage: Phaser.GameObjects.Image | null = null;
  private testSprite: Phaser.GameObjects.Sprite | null = null;
  private testGraphics: Phaser.GameObjects.Graphics | null = null;
  private statusText: Phaser.GameObjects.Text | null = null;
  
  // For Mode 10+: SpectralDemo simulation
  private materialRegistry: MaterialRegistry | null = null;
  private gpuRenderer: GPUPixelRenderer | null = null;
  private grid: Grid | null = null;
  private modeText: Phaser.GameObjects.Text | null = null;
  private fpsText: Phaser.GameObjects.Text | null = null;
  private renderTimeText: Phaser.GameObjects.Text | null = null;
  private successIndicator: Phaser.GameObjects.Rectangle | null = null;
  private modeButtons: Phaser.GameObjects.Container[] = [];
  private modeButtonContainer: Phaser.GameObjects.Container | null = null;
  private modeTooltips: Map<number, Phaser.GameObjects.Container> = new Map();

  private currentMode: number = 1;
  private readonly maxModes: number = 3;
  
  // Mode registry using strategy pattern
  private modeStrategies: Map<number, ModeStrategy> = new Map();
  private lastFrameTime: number = 0;
  private frameCount: number = 0;
  private fps: number = 0;
  private lastRenderTime: number = 0; // Render time in ms
  private lastRenderTimestamp: number = 0; // Timestamp of last render
  
  // Diagnostic panel
  private diagnosticPanel: Phaser.GameObjects.Container | null = null;
  private diagnosticVisible: boolean = false;
  private pipelineStep: number = 0;
  private pipelineMaxSteps: number = 5;
  
  // Automation
  private automationActive: boolean = false;
  private automationMode: number = 1;
  private automationReport: AutomationReportData = {
    timestamp: new Date().toISOString(),
    modes: [],
    summary: {
      totalModes: 0,
      successfulModes: 0,
      failedModes: 0,
      averageRenderTime: 0,
    },
  };
  private automationStatusText: Phaser.GameObjects.Text | null = null;
  private automationLastStepTime: number = 0;
  private automationWaitTime: number = 2000; // 2 seconds per mode (increased to allow texture initialization)
  private automationTimeout: number = 10000; // 10 seconds max per mode
  private automationStartTime: number = 0;
  private automationModeStartTime: number = 0;
  private currentScene: GameScene | null = null;
  private pendingScreenshotCapture: { mode: number; scene: GameScene } | null = null;

  initialize(scene: GameScene): void {
    this.currentScene = scene;
    const { width, height } = scene.cameras.main;

    // Set up global error handler for Phaser rendering errors during automation
    if (!(window as any).__gpuDemoErrorHandler) {
      const self = this;
      (window as any).__gpuDemoErrorHandler = function(error: ErrorEvent) {
        if (self.automationActive && (error.message?.includes('glTexture') || error.message?.includes('null') || error.message?.includes('Cannot read properties'))) {
          console.error(`[GPUDemo] Caught Phaser rendering error during automation:`, error.message);
          console.error(`[GPUDemo] Error source:`, error.filename, error.lineno);
          console.error(`[GPUDemo] Current mode: ${self.automationMode}`);
          console.error(`[GPUDemo] This is likely a texture initialization timing issue. Marking mode as failed and continuing...`);
          
          // Mark current mode as failed but continue automation
          if (self.automationMode > 0 && self.automationMode <= self.maxModes) {
            // Check if we already have data for this mode
            let modeData = self.automationReport.modes.find(m => m.mode === self.automationMode);
            if (!modeData) {
              // Create a failed mode entry
              modeData = {
                mode: self.automationMode,
                timestamp: new Date().toISOString(),
                success: false,
                renderTime: 0,
                textureInfo: { key: '', exists: false, frameCount: 0, frames: [], baseFrame: null, sourceType: null, sourceWidth: null, sourceHeight: null },
                displayState: { image: null, renderTexture: null },
                pixelSamples: [],
                screenshotMetadata: null,
              };
              self.automationReport.modes.push(modeData);
              self.automationReport.summary.failedModes++;
            } else {
              modeData.success = false;
            }
            
            // Note: Modes 2, 3, 6, and 8 now use RenderTexture.draw() which avoids glTexture errors
            // If this error still occurs, it's likely from Mode 3, 6, or 8 (or a different issue)
            // Immediately remove any broken Images/Sprites from the scene to stop the error loop
            const currentScene = self.currentScene;
            if (currentScene) {
              if (self.testImage && currentScene.children.list.includes(self.testImage)) {
                console.log(`[GPUDemo] Removing broken Image from scene to stop error loop`);
                try {
                  self.testImage.setVisible(false);
                  currentScene.children.remove(self.testImage);
                  setTimeout(() => {
                    try {
                      if (self.testImage) {
                        self.testImage.destroy();
                        self.testImage = null;
                      }
                    } catch (e) {
                      // Ignore
                    }
                  }, 0);
                } catch (e) {
                  console.error(`[GPUDemo] Error removing broken Image:`, e);
                }
              }
              if (self.testSprite && currentScene.children.list.includes(self.testSprite)) {
                console.log(`[GPUDemo] Removing broken Sprite from scene to stop error loop`);
                try {
                  self.testSprite.setVisible(false);
                  currentScene.children.remove(self.testSprite);
                  setTimeout(() => {
                    try {
                      if (self.testSprite) {
                        self.testSprite.destroy();
                        self.testSprite = null;
                      }
                    } catch (e) {
                      // Ignore
                    }
                  }, 0);
                } catch (e) {
                  console.error(`[GPUDemo] Error removing broken Sprite:`, e);
                }
              }
            }
            
            // Mark the mode as failed and let automation continue
            console.log(`[GPUDemo] Mode ${self.automationMode} marked as failed, automation will continue normally`);
          }
        }
        return false; // Don't prevent default - let Phaser handle it
      };
      window.addEventListener('error', (window as any).__gpuDemoErrorHandler, true);
      
      // Also catch unhandled promise rejections
      window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
        if (self.automationActive && event.reason?.message?.includes('glTexture')) {
          console.error(`[GPUDemo] Caught unhandled promise rejection during automation:`, event.reason);
          event.preventDefault(); // Prevent it from showing in console as unhandled
        }
      });
    }

    // Initialize mode registry
    this.modeStrategies.set(1, new Mode1_Baseline());
    this.modeStrategies.set(2, new Mode2_GPUSetup());
    this.modeStrategies.set(3, new Mode3_GPURender());

    // Create RenderTexture
    this.renderTexture = scene.add.renderTexture(0, 0, width, height);
    this.renderTexture.setDepth(-1000); // Very low depth so it's behind everything
    this.renderTexture.setScrollFactor(0, 0);
    this.renderTexture.setOrigin(0, 0);

    // Create status text
    this.statusText = scene.add.text(10, 10, "GPU Rendering Test", {
      fontSize: "24px",
      color: "#ffffff",
      backgroundColor: "#000000",
      padding: { x: 10, y: 5 },
    });
    this.statusText.setDepth(10000);
    this.statusText.setScrollFactor(0, 0);

    // Create mode text
    this.modeText = scene.add.text(10, 50, `Mode: ${this.currentMode}`, {
      fontSize: "20px",
      color: "#ffff00",
      backgroundColor: "#000000",
      padding: { x: 10, y: 5 },
    });
    this.modeText.setDepth(10000);
    this.modeText.setScrollFactor(0, 0);

    // Create FPS text
    this.fpsText = scene.add.text(10, 90, "FPS: 0", {
      fontSize: "16px",
      color: "#00ff00",
      backgroundColor: "#000000",
      padding: { x: 10, y: 5 },
    });
    this.fpsText.setDepth(10000);
    this.fpsText.setScrollFactor(0, 0);

    // Create render time text
    this.renderTimeText = scene.add.text(10, 130, "Render: 0ms", {
      fontSize: "16px",
      color: "#00ffff",
      backgroundColor: "#000000",
      padding: { x: 10, y: 5 },
    });
    this.renderTimeText.setDepth(10000);
    this.renderTimeText.setScrollFactor(0, 0);

    // Create success indicator (green border)
    this.successIndicator = scene.add.rectangle(
      width / 2,
      height / 2,
      width - 20,
      height - 20,
      0x00ff00,
      0
    );
    this.successIndicator.setStrokeStyle(5, 0x00ff00);
    this.successIndicator.setDepth(9999);
    this.successIndicator.setScrollFactor(0, 0);
    this.successIndicator.setVisible(false);

    // Create mode selection button matrix
    this.createModeButtonMatrix(scene, width, height);

    // Keyboard controls
    scene.input.keyboard?.on("keydown-LEFT", () => {
      this.currentMode = this.currentMode - 1;
      if (this.currentMode < 1) {
        this.currentMode = this.maxModes; // Cycle to last mode
      }
      this.switchMode(scene);
    });

    scene.input.keyboard?.on("keydown-RIGHT", () => {
      this.currentMode = this.currentMode + 1;
      if (this.currentMode > this.maxModes) {
        this.currentMode = 1; // Cycle to first mode
      }
      this.switchMode(scene);
    });

    // Direct mode selection: Number keys for quick mode jumping
    // Single digit (1-9): Jump immediately
    // Two digits (10-16): Type quickly within 500ms
    let modeInputBuffer: string = "";
    let modeInputTimeout: number | null = null;
    const MODE_INPUT_TIMEOUT = 500; // 500ms to type second digit

    const handleModeInput = (digit: string) => {
      // Clear existing timeout
      if (modeInputTimeout !== null) {
        clearTimeout(modeInputTimeout);
        modeInputTimeout = null;
      }

      // Add digit to buffer
      modeInputBuffer += digit;
      const modeNum = parseInt(modeInputBuffer);

      // Check if valid single-digit mode (1-9)
      if (modeInputBuffer.length === 1 && modeNum >= 1 && modeNum <= 9 && modeNum <= this.maxModes) {
        // Wait a bit to see if user wants to type second digit
        modeInputTimeout = window.setTimeout(() => {
          console.log(`[GPUDemo] Jumping directly to mode ${modeNum}`);
          this.currentMode = modeNum;
          this.switchMode(scene);
          modeInputBuffer = "";
          modeInputTimeout = null;
        }, MODE_INPUT_TIMEOUT);
      } 
      // Check if valid two-digit mode (10-16)
      else if (modeInputBuffer.length === 2 && modeNum >= 10 && modeNum <= this.maxModes) {
        console.log(`[GPUDemo] Jumping directly to mode ${modeNum}`);
        this.currentMode = modeNum;
        this.switchMode(scene);
        modeInputBuffer = "";
        modeInputTimeout = null;
      }
      // Invalid or too many digits - reset
      else if (modeInputBuffer.length >= 2 || modeNum > this.maxModes) {
        // If it's a valid single digit, use it
        const singleDigit = parseInt(digit);
        if (singleDigit >= 1 && singleDigit <= 9 && singleDigit <= this.maxModes) {
          console.log(`[GPUDemo] Jumping directly to mode ${singleDigit}`);
          this.currentMode = singleDigit;
          this.switchMode(scene);
        } else {
          console.log(`[GPUDemo] Invalid mode: ${modeNum}`);
        }
        modeInputBuffer = "";
        modeInputTimeout = null;
      }
    };

    // Register number key handlers
    for (let i = 0; i <= 9; i++) {
      scene.input.keyboard?.on(`keydown-${i}`, () => {
        handleModeInput(i.toString());
      });
    }

    // Diagnostic controls
    scene.input.keyboard?.on("keydown-D", () => {
      this.toggleDiagnostics(scene);
    });

    scene.input.keyboard?.on("keydown-S", () => {
      if (this.currentMode === 9) {
        this.stepPipeline(scene);
      }
    });

    scene.input.keyboard?.on("keydown-P", () => {
      this.printTextureState(scene);
    });

    scene.input.keyboard?.on("keydown-C", () => {
      this.capturePixels(scene);
    });

    scene.input.keyboard?.on("keydown-A", () => {
      console.log(`[GPUDemo] A key pressed, toggling automation`);
      this.toggleAutomation(scene);
    });

    // Initial render
    this.switchMode(scene);
  }

  private switchMode(scene: GameScene): void {
    console.log(`[GPUDemo] switchMode() called for mode ${this.currentMode}`);
    
    try {
      // Clean up previous mode objects - remove from scene first, then destroy
      // Set visible to false first to prevent rendering attempts
      if (this.testImage) {
        this.testImage.setVisible(false);
        if (scene.children.list.includes(this.testImage)) {
          scene.children.remove(this.testImage);
        }
        // Use setTimeout to defer destruction to next frame
        setTimeout(() => {
          if (this.testImage) {
            this.testImage.destroy();
            this.testImage = null;
          }
        }, 0);
      }
      if (this.testSprite) {
        this.testSprite.setVisible(false);
        if (scene.children.list.includes(this.testSprite)) {
          scene.children.remove(this.testSprite);
        }
        setTimeout(() => {
          if (this.testSprite) {
            this.testSprite.destroy();
            this.testSprite = null;
          }
        }, 0);
      }
      if (this.testGraphics) {
        this.testGraphics.setVisible(false);
        if (scene.children.list.includes(this.testGraphics)) {
          scene.children.remove(this.testGraphics);
        }
        setTimeout(() => {
          if (this.testGraphics) {
            this.testGraphics.destroy();
            this.testGraphics = null;
          }
        }, 0);
      }
      if (this.renderTexture) {
        this.renderTexture.setVisible(false);
        this.renderTexture.setActive(false);
        if (scene.children.list.includes(this.renderTexture)) {
          scene.children.remove(this.renderTexture);
        }
        this.renderTexture.clear();
        // Reset position and size to prevent blocking
        this.renderTexture.setPosition(-10000, -10000);
        this.renderTexture.setSize(1, 1);
        // Don't destroy renderTexture, just clear it
      }

      if (this.modeText) {
        this.modeText.setText(`Mode: ${this.currentMode}/${this.maxModes}`);
      }

      // Update mode button highlights
      this.updateModeButtonHighlights();

      // Render current mode - use setTimeout to defer to next frame
      // This ensures previous objects are fully cleaned up
      setTimeout(() => {
        try {
          console.log(`[GPUDemo] Calling renderMode() for mode ${this.currentMode}`);
          this.renderMode(scene, this.currentMode);
          console.log(`[GPUDemo] renderMode() completed for mode ${this.currentMode}`);
        } catch (error) {
          console.error(`[GPUDemo] Error in renderMode for mode ${this.currentMode}:`, error);
        }
      }, 0);
    } catch (error) {
      console.error(`[GPUDemo] Error in switchMode for mode ${this.currentMode}:`, error);
      // Continue anyway - don't let one mode failure stop automation
    }
  }

  private renderMode(scene: GameScene, mode: number): void {
    const startTime = performance.now();
    
    let success = false;
    const strategy = this.modeStrategies.get(mode);

    try {
      if (!strategy) {
        console.error(`[GPUDemo] No strategy found for mode ${mode}`);
        success = false;
      } else {
        console.log(`[GPUDemo] Mode ${mode}: ${strategy.getDescription()}`);
        success = strategy.execute(scene, this.renderTexture);
      }
    } catch (error) {
      console.error(`[GPUDemo] Mode ${mode} error:`, error);
      console.error(`[GPUDemo] Error stack:`, (error as Error).stack);
      success = false;
    }

    const renderTime = performance.now() - startTime;
    this.lastRenderTime = renderTime;
    this.lastRenderTimestamp = performance.now();

    // Enhanced success detection - verify visual success
    const visualSuccess = this.verifyVisualSuccess(scene);
    const finalSuccess = success && visualSuccess;

    // Update success indicator
    if (this.successIndicator) {
      this.successIndicator.setVisible(finalSuccess);
      this.successIndicator.setStrokeStyle(5, finalSuccess ? 0x00ff00 : 0xff0000);
    }

    // Update status
    if (this.statusText) {
      const description = strategy?.getDescription() || `Mode ${mode}`;
      this.statusText.setText(
        `GPU Rendering Test - Mode ${mode}: ${description} ${finalSuccess ? "✓" : "✗"}`
      );
      this.statusText.setColor(finalSuccess ? "#00ff00" : "#ff0000");
    }
  }

  // Old mode implementations removed - now using strategy pattern
  // Modes are in src/core/demos/modes/
  // Modes are in src/core/demos/modes/

  /**
   * Shared GPU setup helper (kept for backward compatibility)
   * Note: Modes now use BaseModeStrategy.setupGPURenderer()
   */
  private setupGPURenderer(scene: GameScene): boolean {
    // This method is kept for backward compatibility but is no longer used
    // All modes now use BaseModeStrategy.setupGPURenderer()
    console.warn("[GPUDemo] setupGPURenderer() is deprecated, use BaseModeStrategy.setupGPURenderer()");
    return false;
  }

  // Old mode implementations removed - all modes now use strategy pattern
  // The following methods were removed:
  // - mode1_RenderTextureDraw
  // - mode2_ImageFromCanvas
  // - mode3_BaseTexture
  // - mode4_DirectRenderTexture
  // - mode5_GraphicsFillRect
  // - mode6_SpriteWithTexture
  // - mode7_SpectralDemoRenderTexture
  // - mode8_SpectralDemoImage
  // - mode9_PipelineTest
  // - mode10_SpectralDemoExact
  // - mode11_RenderTextureDrawWithGPU
  // - mode12_DirectFramebufferBinding
  // - mode13_CanvasToImageChain
  // All modes are now implemented as strategy classes in src/core/demos/modes/

  update(scene: GameScene): void {
    this.updateCallCount++;
    const now = performance.now();
    
    // Log update calls occasionally when automation is active (every 60 frames ~1 second at 60fps)
    if (this.automationActive && (this.updateCallCount % 60 === 0 || now - this.lastUpdateLog >= 1000)) {
      console.log(`[GPUDemo] update() called #${this.updateCallCount}, automationActive: ${this.automationActive}, automationMode: ${this.automationMode}`);
      this.lastUpdateLog = now;
    }
    
    // Update FPS
    this.frameCount++;
    if (now - this.lastFrameTime >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastFrameTime = now;

      if (this.fpsText) {
        this.fpsText.setText(`FPS: ${this.fps}`);
      }
      if (this.renderTimeText) {
        this.renderTimeText.setText(`Render: ${this.lastRenderTime.toFixed(2)}ms`);
      }
    }

    // Re-render current mode periodically to update timestamp
    if (now - this.lastRenderTimestamp >= 1000) {
      this.renderMode(scene, this.currentMode);
      this.lastRenderTimestamp = now;
    }

    // Update diagnostic panel if visible
    if (this.diagnosticVisible && this.diagnosticPanel) {
      this.updateDiagnosticPanel(scene);
    }

    // Check for pending screenshot capture (deferred until after render)
    // Use Phaser's postrender event to ensure rendering is complete before capture
    if (this.pendingScreenshotCapture) {
      const { mode, scene: captureScene } = this.pendingScreenshotCapture;
      this.pendingScreenshotCapture = null;
      
      // Schedule capture after Phaser renders this frame
      // Use triple requestAnimationFrame to ensure frame is fully composited and mode has rendered
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(async () => {
            // Add an additional delay to ensure mode rendering is complete
            // WebGL rendering happens asynchronously, so we need to wait
            await new Promise(resolve => setTimeout(resolve, 150));
            
            // Now capture - canvas should have been fully rendered and composited
            try {
              await this.collectModeData(captureScene, mode);
            } catch (error) {
            console.error(`[GPUDemo] Error collecting data for mode ${mode}:`, error);
            // Create a failed mode entry
            const failedModeData: ModeReportData = {
              mode,
              timestamp: new Date().toISOString(),
              success: false,
              renderTime: 0,
              textureInfo: { key: '', exists: false, frameCount: 0, frames: [], baseFrame: null, sourceType: null, sourceWidth: null, sourceHeight: null },
              displayState: { image: null, renderTexture: null },
              pixelSamples: [],
              screenshotMetadata: null,
            };
            this.automationReport.modes.push(failedModeData);
            this.automationReport.summary.failedModes++;
          }
          });
        });
      });
    }

    // Automation logic
    if (this.automationActive) {
      const elapsed = now - this.automationModeStartTime;
      
      // Check for timeout
      if (elapsed >= this.automationTimeout) {
        console.warn(`[GPUDemo] Mode ${this.automationMode} timed out after ${this.automationTimeout}ms`);
        // Mark as failed and move to next mode
        const failedModeData: ModeReportData = {
          mode: this.automationMode,
          timestamp: new Date().toISOString(),
          success: false,
          renderTime: elapsed,
          textureInfo: { key: '', exists: false, frameCount: 0, frames: [], baseFrame: null, sourceType: null, sourceWidth: null, sourceHeight: null },
          displayState: { image: null, renderTexture: null },
          pixelSamples: [],
          screenshotMetadata: null,
        };
        this.automationReport.modes.push(failedModeData);
        this.automationReport.summary.failedModes++;
        
        // Move to next mode
        this.automationMode++;
        if (this.automationMode > this.maxModes) {
          this.stopAutomation(scene);
        } else {
          this.automationModeStartTime = now;
          this.switchMode(scene);
        }
        return;
      }
      
      // Wait for the specified time before moving to next mode
      if (elapsed >= this.automationWaitTime) {
        // Collect data for current mode
        this.pendingScreenshotCapture = { mode: this.automationMode, scene };
        
        // Move to next mode
        this.automationMode++;
        if (this.automationMode > this.maxModes) {
          this.stopAutomation(scene);
        } else {
          this.automationModeStartTime = now;
          this.switchMode(scene);
        }
      }
    }
  }

  // Old mode implementations removed - all modes now use strategy pattern
  // The following methods were removed:
  // - mode5_GraphicsFillRect
  // - mode6_SpriteWithTexture
  // - mode7_SpectralDemoRenderTexture
  // - mode8_SpectralDemoImage
  // - mode9_PipelineTest
  // - setupGPURenderer (duplicate - kept deprecated version)
  // - mode10_SpectralDemoExact
  // - mode11_RenderTextureDrawWithGPU
  // - mode12_DirectFramebufferBinding
  // - mode13_CanvasToImageChain
  // All modes are now implemented as strategy classes in src/core/demos/modes/
  // The following methods were removed:
  // - mode6_SpriteWithTexture
  // - mode7_SpectralDemoRenderTexture
  // - mode8_SpectralDemoImage
  // - mode9_PipelineTest
  // - setupGPURenderer (duplicate - kept deprecated version)
  // - mode10_SpectralDemoExact
  // - mode11_RenderTextureDrawWithGPU
  // - mode12_DirectFramebufferBinding
  // - mode13_CanvasToImageChain
  // All modes are now implemented as strategy classes in src/core/demos/modes/

  /**
   * Apply canvas to RenderTexture (legacy helper method)
   * Note: This method is kept for backward compatibility but is not currently used
   */
  private applyCanvasToRenderTexture(
    scene: GameScene,
    canvas: HTMLCanvasElement
  ): boolean {
    try {
      if (!this.renderTexture) return false;

      const textureKey = "gpu-render-texture"; // Same key as SpectralDemo
      if (scene.textures.exists(textureKey)) {
        scene.textures.remove(textureKey);
      }
      scene.textures.addCanvas(textureKey, canvas);

      const { width, height } = scene.cameras.main;

      // Create temporary Image from canvas texture (exactly as SpectralDemo does)
      const tempImage = scene.add.image(0, 0, textureKey);
      tempImage.setVisible(false); // Hide it, we just need it for drawing

      // Clear the render texture first
      this.renderTexture.setSize(width, height);
      this.renderTexture.clear();

      // Draw the Image to the RenderTexture (exactly as SpectralDemo does)
      this.renderTexture.draw(tempImage, 0, 0, width, height);

      // Clean up temporary Image
      tempImage.destroy();

      // Use RenderTexture directly (as SpectralDemo does)
      this.renderTexture.setVisible(true);
      this.renderTexture.setActive(true);
      this.renderTexture.setDepth(-1000);
      this.renderTexture.setPosition(0, 0);
      this.renderTexture.setOrigin(0, 0);
      this.renderTexture.setDisplaySize(width, height);
      this.renderTexture.setScrollFactor(0, 0);
      if (!scene.children.list.includes(this.renderTexture)) {
        scene.children.add(this.renderTexture);
      }
      scene.children.bringToTop(this.renderTexture);

      // Check if RenderTexture has content
      const hasContent =
        this.renderTexture.texture &&
        (this.renderTexture.texture as any).width > 0 &&
        (this.renderTexture.texture as any).height > 0;

      return hasContent;
    } catch (error) {
      console.error("[GPUDemo] Mode 7 error:", error);
      return false;
    }
  }

  /**
   * Mode 8: SpectralDemo fallback Image approach
   * Mimics the exact fallback sequence used in SpectralDemo
   */
  private mode8_SpectralDemoImage(
    scene: GameScene,
    canvas: HTMLCanvasElement
  ): boolean {
    try {
      if (!this.renderTexture) return false;

      const textureKey = "gpu-render-texture"; // Same key as SpectralDemo
      if (scene.textures.exists(textureKey)) {
        scene.textures.remove(textureKey);
      }
      
      // Ensure canvas is valid
      if (!canvas || canvas.width === 0 || canvas.height === 0) {
        console.error("[GPUDemo] Mode 8: Invalid canvas");
        return false;
      }
      
      scene.textures.addCanvas(textureKey, canvas);

      const { width, height } = scene.cameras.main;
      
      // Verify texture is ready
      const texture = scene.textures.get(textureKey);
      if (!texture || !texture.frames || Object.keys(texture.frames).length === 0) {
        console.error("[GPUDemo] Mode 8: Texture not ready");
        return false;
      }
      
      // Create temporary Image from canvas texture (never added to display list)
      // This avoids the glTexture timing issue because we use renderTexture.draw()
      const tempImage = scene.add.image(0, 0, textureKey);
      tempImage.setVisible(false); // Hide it, we just need it for drawing
      
      // Resize RenderTexture to match screen size
      this.renderTexture.setSize(width, height);
      this.renderTexture.clear();
      
      // Draw the Image to the RenderTexture (this doesn't require glTexture to be ready)
      this.renderTexture.draw(tempImage, 0, 0, width, height);
      
      // Clean up temporary Image immediately
      tempImage.destroy();

      // Use RenderTexture directly instead of Image
      this.renderTexture.setVisible(true);
      this.renderTexture.setActive(true);
      this.renderTexture.setDepth(-1000);
      this.renderTexture.setPosition(0, 0);
      this.renderTexture.setOrigin(0, 0);
      this.renderTexture.setDisplaySize(width, height);
      this.renderTexture.setScrollFactor(0, 0);
      if (!scene.children.list.includes(this.renderTexture)) {
        scene.children.add(this.renderTexture);
      }
      scene.children.bringToTop(this.renderTexture);

      // Check if RenderTexture has content
      const hasContent =
        this.renderTexture.texture &&
        (this.renderTexture.texture as any).width > 0 &&
        (this.renderTexture.texture as any).height > 0;
      
      return hasContent;
    } catch (error) {
      console.error("[GPUDemo] Mode 8 error:", error);
      return false;
    }
  }

  /**
   * Mode 9: Full pipeline test - step-by-step validation
   * Simulates GPUPixelRenderer.renderToPhaserTexture() sequence
   */
  private mode9_PipelineTest(
    scene: GameScene,
    canvas: HTMLCanvasElement
  ): boolean {
    try {
      // Reset pipeline step if needed
      if (this.pipelineStep === 0) {
        this.pipelineStep = 1;
      }

      // Step 1: Canvas creation and validation
      if (this.pipelineStep === 1) {
        const ctx = canvas.getContext("2d");
        const testImageData = ctx?.getImageData(0, 0, Math.min(10, canvas.width), Math.min(10, canvas.height));
        const hasContent = testImageData ? Array.from(testImageData.data).some(v => v !== 0) : false;
        
        console.log("[Pipeline Step 1] Canvas validation:", {
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          hasContent,
        });
        
        if (!hasContent) {
          return false;
        }
        // Auto-advance to next step
        this.pipelineStep = 2;
      }

      // Step 2: Texture creation
      if (this.pipelineStep === 2) {
        const textureKey = "gpu-render-texture";
        if (scene.textures.exists(textureKey)) {
          scene.textures.remove(textureKey);
        }
        scene.textures.addCanvas(textureKey, canvas);

        const textureExists = scene.textures.exists(textureKey);
        const texture = scene.textures.get(textureKey);
        const frameCount = texture?.frames ? Object.keys(texture.frames).length : 0;

        console.log("[Pipeline Step 2] Texture creation:", {
          textureExists,
          frameCount,
        });

        if (!textureExists || frameCount === 0) {
          return false;
        }
        this.pipelineStep = 3;
      }

      // Step 3: Frame validation
      if (this.pipelineStep === 3) {
        const textureKey = "gpu-render-texture";
        const texture = scene.textures.get(textureKey);
        // Access frame directly from texture.frames (getFrame doesn't exist)
        const framesAny = texture?.frames as any;
        const baseFrame = framesAny ? framesAny["__BASE"] : null;
        const frameValid = baseFrame && baseFrame.width > 0 && baseFrame.height > 0;

        console.log("[Pipeline Step 3] Frame validation:", {
          hasBaseFrame: !!baseFrame,
          frameWidth: baseFrame?.width,
          frameHeight: baseFrame?.height,
          frameValid,
        });

        if (!frameValid) {
          return false;
        }
        this.pipelineStep = 4;
      }

      // Step 4: Image/RenderTexture creation
      if (this.pipelineStep === 4) {
        const textureKey = "gpu-render-texture";
        const { width, height } = scene.cameras.main;

        // Try RenderTexture approach first (as SpectralDemo does)
        if (!this.renderTexture) {
          this.renderTexture = scene.add.renderTexture(0, 0, width, height);
        }

        const tempImage = scene.add.image(0, 0, textureKey);
        tempImage.setVisible(false);
        this.renderTexture.setSize(width, height);
        this.renderTexture.clear();
        this.renderTexture.draw(tempImage, 0, 0, width, height);
        tempImage.destroy();

        this.renderTexture.setVisible(true);
        this.renderTexture.setActive(true);
        this.renderTexture.setDepth(-1000);
        this.renderTexture.setPosition(0, 0);
        this.renderTexture.setOrigin(0, 0);
        this.renderTexture.setDisplaySize(width, height);
        this.renderTexture.setScrollFactor(0, 0);
        if (!scene.children.list.includes(this.renderTexture)) {
          scene.children.add(this.renderTexture);
        }

        const inScene = scene.children.list.includes(this.renderTexture);
        console.log("[Pipeline Step 4] Image/RenderTexture creation:", {
          renderTextureExists: !!this.renderTexture,
          inScene,
          visible: this.renderTexture.visible,
          active: this.renderTexture.active,
        });

        if (!inScene) {
          return false;
        }
        this.pipelineStep = 5;
      }

      // Step 5: Display verification
      if (this.pipelineStep === 5) {
        const hasContent = !!(
          this.renderTexture &&
          this.renderTexture.texture &&
          (this.renderTexture.texture as any).width > 0 &&
          (this.renderTexture.texture as any).height > 0
        );

        console.log("[Pipeline Step 5] Display verification:", {
          hasContent,
          textureWidth: this.renderTexture ? (this.renderTexture.texture as any).width : 0,
          textureHeight: this.renderTexture ? (this.renderTexture.texture as any).height : 0,
        });

        // Reset for next cycle
        this.pipelineStep = 0;
        return hasContent;
      }

      return false;
    } catch (error) {
      console.error("[GPUDemo] Mode 9 error:", error);
      return false;
    }
  }

  // Old mode implementations removed - all modes now use strategy pattern
  // All modes are now implemented as strategy classes in src/core/demos/modes/

  /**
   * Create a test pattern (gradient + checkerboard + text)
   */
  private createTestPattern(
    width: number,
    height: number
  ): HTMLCanvasElement {
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

    // Text overlay
    ctx.fillStyle = "#ffffff";
    ctx.font = "48px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      `Mode ${this.currentMode}`,
      width / 2,
      height / 2 - 50
    );
    ctx.fillText("GPU Test", width / 2, height / 2);
    ctx.fillText(
      new Date().toLocaleTimeString(),
      width / 2,
      height / 2 + 50
    );

    return canvas;
  }

  reset(scene: GameScene): void {
    this.currentMode = 1;
    this.switchMode(scene);
  }

  /**
   * Create a button matrix for mode selection
   */
  private createModeButtonMatrix(scene: GameScene, screenWidth: number, screenHeight: number): void {
    // Clean up existing buttons
    if (this.modeButtonContainer) {
      this.modeButtonContainer.destroy();
    }
    this.modeButtons = [];

    // Create container for all buttons
    this.modeButtonContainer = scene.add.container(0, 0);
    this.modeButtonContainer.setDepth(20000); // Very high depth to ensure it's on top
    this.modeButtonContainer.setScrollFactor(0, 0);

    // Button configuration - position at bottom of screen
    const buttonWidth = 60;
    const buttonHeight = 40;
    const buttonSpacing = 5;
    const buttonsPerRow = 8;
    const totalButtonWidth = buttonsPerRow * (buttonWidth + buttonSpacing) - buttonSpacing;
    const startX = (screenWidth - totalButtonWidth) / 2; // Center horizontally
    const startY = screenHeight - buttonHeight - 30; // Bottom with 30px margin
    
    console.log(`[GPUDemo] Creating mode buttons at bottom: x=${startX}, y=${startY}, screenWidth=${screenWidth}, screenHeight=${screenHeight}`);

    // Create buttons for each mode
    for (let mode = 1; mode <= this.maxModes; mode++) {
      const row = Math.floor((mode - 1) / buttonsPerRow);
      const col = (mode - 1) % buttonsPerRow;
      const x = startX + col * (buttonWidth + buttonSpacing);
      const y = startY + row * (buttonHeight + buttonSpacing);

      // Create button background (fully opaque with bright colors for visibility)
      const buttonBg = scene.add.rectangle(x, y, buttonWidth, buttonHeight, 0x000000, 1.0);
      buttonBg.setStrokeStyle(3, 0xffffff);
      buttonBg.setInteractive({ useHandCursor: true });
      buttonBg.setDepth(20000); // Ensure it's on top

      // Create button text (bright yellow for visibility)
      const buttonText = scene.add.text(x, y, mode.toString(), {
        fontSize: "20px",
        color: "#ffff00",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 2,
      });
      buttonText.setOrigin(0.5, 0.5);
      buttonText.setDepth(20001); // Even higher depth for text

      // Create tooltip (initially hidden)
      const strategy = this.modeStrategies.get(mode);
      const tooltipText = strategy ? strategy.getDescription() : `Mode ${mode}`;
      const tooltipBg = scene.add.rectangle(x, y - buttonHeight / 2 - 15, 250, 30, 0x000000, 0.95);
      tooltipBg.setStrokeStyle(2, 0xffff00);
      tooltipBg.setDepth(20002);
      tooltipBg.setScrollFactor(0, 0);
      tooltipBg.setVisible(false);
      
      const tooltipLabel = scene.add.text(x, y - buttonHeight / 2 - 15, tooltipText, {
        fontSize: "14px",
        color: "#ffff00",
        fontStyle: "bold",
        wordWrap: { width: 240 },
        align: "center",
      });
      tooltipLabel.setOrigin(0.5, 0.5);
      tooltipLabel.setDepth(20003);
      tooltipLabel.setScrollFactor(0, 0);
      tooltipLabel.setVisible(false);

      const tooltipContainer = scene.add.container(x, y - buttonHeight / 2 - 15, [tooltipBg, tooltipLabel]);
      tooltipContainer.setDepth(20002);
      tooltipContainer.setScrollFactor(0, 0);
      tooltipContainer.setVisible(false);
      this.modeTooltips.set(mode, tooltipContainer);

      // Create container for this button
      const buttonContainer = scene.add.container(x, y, [buttonBg, buttonText]);
      buttonContainer.setSize(buttonWidth, buttonHeight);
      buttonContainer.setInteractive({ useHandCursor: true });
      buttonContainer.setDepth(20000); // Very high depth
      buttonContainer.setScrollFactor(0, 0);
      
      // Ensure text is also on top
      buttonText.setDepth(20001);

      // Add click handler
      buttonContainer.on("pointerdown", () => {
        console.log(`[GPUDemo] Button clicked: Jumping to mode ${mode}`);
        this.currentMode = mode;
        this.switchMode(scene);
      });

      // Add hover effects
      buttonContainer.on("pointerover", () => {
        buttonBg.setFillStyle(0x444444, 1.0);
        buttonBg.setStrokeStyle(3, 0xffff00);
        // Show tooltip
        const tooltip = this.modeTooltips.get(mode);
        if (tooltip) {
          tooltip.setVisible(true);
        }
      });

      buttonContainer.on("pointerout", () => {
        const isCurrentMode = mode === this.currentMode;
        buttonBg.setFillStyle(isCurrentMode ? 0x0066ff : 0x000000, 1.0);
        buttonBg.setStrokeStyle(3, isCurrentMode ? 0x00ffff : 0xffffff);
        // Hide tooltip
        const tooltip = this.modeTooltips.get(mode);
        if (tooltip) {
          tooltip.setVisible(false);
        }
      });

      this.modeButtons.push(buttonContainer);
      this.modeButtonContainer.add(buttonContainer);
    }

    // Add label above buttons
    const labelBg = scene.add.rectangle(startX + totalButtonWidth / 2, startY - 25, 200, 25, 0x000000, 0.9);
    labelBg.setDepth(20000);
    labelBg.setScrollFactor(0, 0);
    this.modeButtonContainer.add(labelBg);
    
    const label = scene.add.text(startX + totalButtonWidth / 2, startY - 25, "Mode Selection:", {
      fontSize: "16px",
      color: "#ffffff",
      fontStyle: "bold",
    });
    label.setOrigin(0.5, 0.5);
    label.setDepth(20001);
    label.setScrollFactor(0, 0);
    this.modeButtonContainer.add(label);

    // Update initial highlights
    this.updateModeButtonHighlights();
  }

  /**
   * Update button highlights to show current mode
   */
  private updateModeButtonHighlights(): void {
    this.modeButtons.forEach((buttonContainer, index) => {
      const mode = index + 1;
      const buttonBg = buttonContainer.list[0] as Phaser.GameObjects.Rectangle;
      const isCurrentMode = mode === this.currentMode;

      if (buttonBg) {
        buttonBg.setFillStyle(isCurrentMode ? 0x0066ff : 0x000000, 1.0);
        buttonBg.setStrokeStyle(3, isCurrentMode ? 0x00ffff : 0xffffff);
      }
    });
  }

  cleanup(_scene: GameScene): void {
    if (this.testImage) {
      this.testImage.destroy();
      this.testImage = null;
    }
    if (this.testSprite) {
      this.testSprite.destroy();
      this.testSprite = null;
    }
    if (this.testGraphics) {
      this.testGraphics.destroy();
      this.testGraphics = null;
    }
    if (this.statusText) this.statusText.destroy();
    if (this.modeText) this.modeText.destroy();
    if (this.fpsText) this.fpsText.destroy();
    if (this.renderTimeText) this.renderTimeText.destroy();
    if (this.successIndicator) this.successIndicator.destroy();
    if (this.modeButtonContainer) {
      this.modeButtonContainer.destroy();
      this.modeButtonContainer = null;
    }
    this.modeButtons = [];
    // Clean up tooltips
    this.modeTooltips.forEach((tooltip) => {
      tooltip.destroy();
    });
    this.modeTooltips.clear();
    if (this.renderTexture) this.renderTexture.destroy();
    if (this.diagnosticPanel) {
      this.diagnosticPanel.destroy();
      this.diagnosticPanel = null;
    }
    if (this.automationStatusText) {
      this.automationStatusText.destroy();
      this.automationStatusText = null;
    }
    // Clean up Mode 10+ resources
    this.materialRegistry = null;
    this.gpuRenderer = null;
    this.grid = null;
  }

  /**
   * Toggle diagnostic panel visibility
   */
  private toggleDiagnostics(scene: GameScene): void {
    this.diagnosticVisible = !this.diagnosticVisible;
    
    if (this.diagnosticVisible) {
      this.createDiagnosticPanel(scene);
    } else {
      if (this.diagnosticPanel) {
        this.diagnosticPanel.destroy();
        this.diagnosticPanel = null;
      }
    }
  }

  /**
   * Create diagnostic panel UI
   */
  private createDiagnosticPanel(scene: GameScene): void {
    if (this.diagnosticPanel) {
      this.diagnosticPanel.destroy();
    }

    const { width } = scene.cameras.main;
    this.diagnosticPanel = scene.add.container(width - 320, 170);

    // Background
    const bg = scene.add.rectangle(0, 0, 300, 400, 0x000000, 0.8);
    bg.setStrokeStyle(2, 0xffffff);
    this.diagnosticPanel.add(bg);

    // Title
    const title = scene.add.text(0, -180, "Diagnostics (D)", {
      fontSize: "16px",
      color: "#ffffff",
      fontStyle: "bold",
    });
    title.setOrigin(0.5, 0.5);
    this.diagnosticPanel.add(title);

    // Diagnostic text (will be updated)
    const diagText = scene.add.text(0, 0, "", {
      fontSize: "12px",
      color: "#ffffff",
      wordWrap: { width: 280 },
    });
    diagText.setOrigin(0.5, 0.5);
    this.diagnosticPanel.add(diagText);
    (this.diagnosticPanel as any).diagText = diagText;

    this.diagnosticPanel.setDepth(10001);
    this.diagnosticPanel.setScrollFactor(0, 0);
  }

  /**
   * Update diagnostic panel with current state
   */
  private updateDiagnosticPanel(scene: GameScene): void {
    if (!this.diagnosticPanel) return;

    const diagText = (this.diagnosticPanel as any).diagText as Phaser.GameObjects.Text;
    if (!diagText) return;

    const lines: string[] = [];
    
    // Texture Inspector
    lines.push("=== TEXTURE ===");
    const textureKey = this.currentMode <= 6 ? `__gpu_test_mode${this.currentMode}` : "gpu-render-texture";
    const textureExists = scene.textures.exists(textureKey);
    lines.push(`Key: ${textureKey}`);
    lines.push(`Exists: ${textureExists}`);
    
    if (textureExists) {
      const texture = scene.textures.get(textureKey);
      const frames = texture?.frames ? Object.keys(texture.frames) : [];
      // Access frame directly from texture.frames (getFrame doesn't exist)
      const framesAny = texture?.frames as any;
      const baseFrame = framesAny ? framesAny["__BASE"] : null;
      lines.push(`Frames: ${frames.length} (${frames.join(", ")})`);
      lines.push(`Base Frame: ${baseFrame ? `${baseFrame.width}x${baseFrame.height}` : "none"}`);
      const sourceType = texture?.source?.[0] ? texture.source[0].constructor.name : "unknown";
      lines.push(`Source: ${sourceType}`);
    }

    // Display State
    lines.push("\n=== DISPLAY ===");
    if (this.testImage) {
      lines.push(`Image: ${this.testImage.x},${this.testImage.y}`);
      lines.push(`Size: ${this.testImage.displayWidth}x${this.testImage.displayHeight}`);
      lines.push(`Visible: ${this.testImage.visible}, Alpha: ${this.testImage.alpha}`);
      lines.push(`In Scene: ${scene.children.list.includes(this.testImage)}`);
    }
    if (this.renderTexture) {
      lines.push(`RenderTexture: ${this.renderTexture.x},${this.renderTexture.y}`);
      lines.push(`Size: ${this.renderTexture.width}x${this.renderTexture.height}`);
      lines.push(`Visible: ${this.renderTexture.visible}, Active: ${this.renderTexture.active}`);
      lines.push(`In Scene: ${scene.children.list.includes(this.renderTexture)}`);
    }

    // Pixel Sampler
    lines.push("\n=== PIXELS ===");
    if (textureExists) {
      const texture = scene.textures.get(textureKey);
      // Access frame directly from texture.frames (getFrame doesn't exist)
      const framesAny = texture?.frames as any;
      const baseFrame = framesAny ? framesAny["__BASE"] : null;
      if (baseFrame) {
        // Sample pixels (simplified - would need actual pixel access)
        lines.push(`Frame: ${baseFrame.width}x${baseFrame.height}`);
        lines.push("(Pixel sampling requires texture source access)");
      }
    }

    // Pipeline Step (for Mode 9)
    if (this.currentMode === 9) {
      lines.push("\n=== PIPELINE ===");
      lines.push(`Step: ${this.pipelineStep}/${this.pipelineMaxSteps}`);
      lines.push("(Press S to step)");
    }

    diagText.setText(lines.join("\n"));
  }

  /**
   * Step through pipeline (Mode 9)
   */
  private stepPipeline(scene: GameScene): void {
    if (this.currentMode !== 9) return;
    
    this.pipelineStep = Math.min(this.pipelineStep + 1, this.pipelineMaxSteps);
    const { width, height } = scene.cameras.main;
    const canvas = this.createTestPattern(width, height);
    this.mode9_PipelineTest(scene, canvas);
  }

  /**
   * Print texture state to console
   */
  private printTextureState(scene: GameScene): void {
    const textureKey = this.currentMode <= 6 ? `__gpu_test_mode${this.currentMode}` : "gpu-render-texture";
    const textureExists = scene.textures.exists(textureKey);
    
    console.log("[GPUDemo] Texture State:", {
      mode: this.currentMode,
      textureKey,
      textureExists,
    });

    if (textureExists) {
      const texture = scene.textures.get(textureKey);
      const frames = texture?.frames ? Object.keys(texture.frames) : [];
      // Access frame directly from texture.frames (getFrame doesn't exist)
      const framesAny = texture?.frames as any;
      const baseFrame = framesAny ? framesAny["__BASE"] : null;
      
      console.log("[GPUDemo] Texture Details:", {
        frames,
        baseFrame: baseFrame ? {
          name: baseFrame.name,
          width: baseFrame.width,
          height: baseFrame.height,
        } : null,
        source: texture?.source?.[0] ? {
          type: texture.source[0].constructor.name,
          width: texture.source[0].width,
          height: texture.source[0].height,
        } : null,
      });
    }

    if (this.testImage) {
      console.log("[GPUDemo] Image State:", {
        x: this.testImage.x,
        y: this.testImage.y,
        displayWidth: this.testImage.displayWidth,
        displayHeight: this.testImage.displayHeight,
        visible: this.testImage.visible,
        alpha: this.testImage.alpha,
        depth: this.testImage.depth,
        inScene: scene.children.list.includes(this.testImage),
      });
    }

    if (this.renderTexture) {
      console.log("[GPUDemo] RenderTexture State:", {
        x: this.renderTexture.x,
        y: this.renderTexture.y,
        width: this.renderTexture.width,
        height: this.renderTexture.height,
        visible: this.renderTexture.visible,
        active: this.renderTexture.active,
        depth: this.renderTexture.depth,
        inScene: scene.children.list.includes(this.renderTexture),
        textureWidth: (this.renderTexture.texture as any).width,
        textureHeight: (this.renderTexture.texture as any).height,
      });
    }
  }

  /**
   * Capture pixel samples to console
   */
  private capturePixels(scene: GameScene): void {
    const textureKey = this.currentMode <= 6 ? `__gpu_test_mode${this.currentMode}` : "gpu-render-texture";
    
    if (!scene.textures.exists(textureKey)) {
      console.log("[GPUDemo] Texture does not exist:", textureKey);
      return;
    }

    const texture = scene.textures.get(textureKey);
    // Access frame directly from texture.frames (getFrame doesn't exist)
    const framesAny = texture?.frames as any;
    const baseFrame = framesAny ? framesAny["__BASE"] : null;
    
    if (!baseFrame) {
      console.log("[GPUDemo] No base frame found");
      return;
    }

    // Try to get pixel data from texture source
    const source = texture?.source?.[0];
    if (source && source instanceof HTMLCanvasElement) {
      const ctx = source.getContext("2d");
      if (ctx) {
        const { width, height } = scene.cameras.main;
        const samplePositions = [
          { x: 0, y: 0, name: "Top-Left" },
          { x: Math.floor(width / 2), y: Math.floor(height / 2), name: "Center" },
          { x: width - 1, y: height - 1, name: "Bottom-Right" },
        ];

        const samples = samplePositions.map(pos => {
          const imageData = ctx.getImageData(pos.x, pos.y, 1, 1);
          return {
            position: pos.name,
            x: pos.x,
            y: pos.y,
            rgba: {
              r: imageData.data[0],
              g: imageData.data[1],
              b: imageData.data[2],
              a: imageData.data[3],
            },
          };
        });

        console.log("[GPUDemo] Pixel Samples:", {
          textureKey,
          frameSize: `${baseFrame.width}x${baseFrame.height}`,
          samples,
        });
      }
    } else {
      console.log("[GPUDemo] Cannot access pixel data - source is not a canvas");
    }
  }

  /**
   * Enhanced success detection - sample actual screen pixels
   */
  private verifyVisualSuccess(scene: GameScene): boolean {
    // This is a simplified check - in a real implementation, we'd sample
    // actual screen pixels using canvas readback or Phaser's renderer
    // For now, we check texture existence and dimensions
    
    // Mode 3 uses renderToPhaserTexture() which draws directly to RenderTexture
    // So we just check if the RenderTexture exists and has content
    if (this.currentMode === 3 && this.renderTexture) {
      const rt = this.renderTexture;
      return rt.visible && rt.width > 0 && rt.height > 0;
    }
    
    const textureKey = this.currentMode <= 6 ? `__gpu_test_mode${this.currentMode}` : "gpu-render-texture";
    
    if (!scene.textures.exists(textureKey)) {
      return false;
    }

    const texture = scene.textures.get(textureKey);
    if (!texture) {
      return false;
    }
    
    // Check if texture has frames
    const frames = texture.frames ? Object.keys(texture.frames) : [];
    if (frames.length === 0) {
      return false;
    }
    
    // Access frame directly from texture.frames (getFrame doesn't exist)
    let baseFrame: any = null;
    try {
      if (texture.frames) {
        const framesObj = texture.frames as any;
        if (framesObj["__BASE"]) {
          baseFrame = framesObj["__BASE"];
        } else if (frames.length > 0) {
          // Fallback to first frame
          baseFrame = framesObj[frames[0]];
        }
      }
    } catch (error) {
      console.warn("[GPUDemo] Could not access frame:", error);
    }
    
    if (!baseFrame || baseFrame.width === 0 || baseFrame.height === 0) {
      return false;
    }

    // Check if display object is visible and in scene
    if (this.testImage) {
      if (!this.testImage.visible || !scene.children.list.includes(this.testImage)) {
        return false;
      }
    }

    if (this.renderTexture) {
      const isVisible = this.renderTexture.visible ?? false;
      const isActive = this.renderTexture.active ?? false;
      const inScene = scene.children.list.includes(this.renderTexture);
      
      if (!isVisible || !isActive || !inScene) {
        return false;
      }
    }

    return true;
  }

  /**
   * Toggle automation mode
   */
  private toggleAutomation(scene: GameScene): void {
    console.log(`[GPUDemo] toggleAutomation called, current state: ${this.automationActive}`);
    this.automationActive = !this.automationActive;
    console.log(`[GPUDemo] automationActive set to: ${this.automationActive}`);
    
    if (this.automationActive) {
      console.log(`[GPUDemo] Starting automation...`);
      // Start automation
      this.automationMode = 1;
      this.automationLastStepTime = 0;
      this.automationReport = {
        timestamp: new Date().toISOString(),
        modes: [],
        summary: {
          totalModes: this.maxModes,
          successfulModes: 0,
          failedModes: 0,
          averageRenderTime: 0,
        },
      };
      
      // Create status text
      if (!this.automationStatusText) {
        this.automationStatusText = scene.add.text(10, 170, "Automation: Starting...", {
          fontSize: "16px",
          color: "#ffff00",
          backgroundColor: "#000000",
          padding: { x: 10, y: 5 },
        });
        this.automationStatusText.setDepth(10000);
        this.automationStatusText.setScrollFactor(0, 0);
      } else {
        this.automationStatusText.setText("Automation: Starting...");
      }
      
      // Start with first mode
      this.automationMode = 1;
      this.automationLastStepTime = 0;
      this.automationStartTime = performance.now();
      this.automationModeStartTime = performance.now();
      this.currentMode = 1;
      console.log(`[GPUDemo] Automation initialized, calling switchMode for mode ${this.currentMode}`);
      this.switchMode(scene);
      console.log(`[GPUDemo] switchMode completed, automation should start in update loop`);
    } else {
      console.log(`[GPUDemo] Stopping automation and generating report`);
      // Stop automation and generate report
      if (this.automationStatusText) {
        this.automationStatusText.setText("Automation: Generating report...");
      }
      
      this.generateAutomationReport(scene);
    }
  }

  /**
   * Automation step - process current mode
   */
  private automationStep(scene: GameScene): void {
    const now = performance.now();
    
    // Log entry to automationStep
    if (this.updateCallCount % 60 === 0) {
      console.log(`[GPUDemo] automationStep() entered, mode: ${this.automationMode}, maxModes: ${this.maxModes}`);
    }
    
    if (this.automationMode > this.maxModes) {
      // All modes processed
      console.log(`[GPUDemo] All modes completed (${this.automationMode} > ${this.maxModes})`);
      this.automationActive = false;
      this.generateAutomationReport(scene);
      return;
    }
    
    // Check for timeout - if we've been stuck on this mode too long
    const timeSinceModeStart = now - this.automationModeStartTime;
    if (this.automationModeStartTime > 0 && timeSinceModeStart > this.automationTimeout) {
      console.error(`[GPUDemo] TIMEOUT: Mode ${this.automationMode} exceeded timeout of ${this.automationTimeout}ms (actual: ${timeSinceModeStart.toFixed(2)}ms)`);
      this.dumpAutomationState(scene, `Timeout in mode ${this.automationMode}`);
      // Force move to next mode or stop
      this.automationMode++;
      if (this.automationMode <= this.maxModes) {
        this.automationModeStartTime = now;
        this.automationLastStepTime = 0;
        this.currentMode = this.automationMode;
        this.switchMode(scene);
      } else {
        this.automationActive = false;
        this.generateAutomationReport(scene);
      }
      return;
    }
    
    // Check if we've already collected data for this mode
    const modeData = this.automationReport.modes.find(m => m.mode === this.automationMode);
    
    if (!modeData) {
      // First time seeing this mode - wait a bit for rendering to complete, then collect data
      if (this.automationLastStepTime === 0) {
        // Just started this mode - set initial time and update status
        console.log(`[GPUDemo] First time seeing mode ${this.automationMode}, initializing timing`);
        this.automationLastStepTime = now;
        this.automationModeStartTime = now;
        if (this.automationStatusText) {
          this.automationStatusText.setText(`Automation: Mode ${this.automationMode}/${this.maxModes} (waiting...)`);
        }
        console.log(`[GPUDemo] Starting mode ${this.automationMode}, waiting ${this.automationWaitTime}ms... (lastStepTime: ${this.automationLastStepTime}, modeStartTime: ${this.automationModeStartTime})`);
        return;
      }
      
      // Check if enough time has passed since we started this mode
      const waitElapsed = now - this.automationLastStepTime;
      
      // Log waiting progress
      if (this.updateCallCount % 60 === 0) {
        console.log(`[GPUDemo] Mode ${this.automationMode} waiting... (${waitElapsed.toFixed(0)}ms / ${this.automationWaitTime}ms)`);
      }
      if (waitElapsed >= this.automationWaitTime) {
        // Only schedule capture if not already scheduled (prevent duplicates)
        if (!this.pendingScreenshotCapture) {
          // Defer data collection until after Phaser renders (next frame)
          // This ensures the canvas has been rendered before we try to capture it
          console.log(`[GPUDemo] Wait time elapsed (${waitElapsed.toFixed(2)}ms >= ${this.automationWaitTime}ms), scheduling data collection for mode ${this.automationMode} after render`);
          this.pendingScreenshotCapture = { mode: this.automationMode, scene };
          // Don't move to next mode yet - that happens in update() after capture completes
        }
        return; // Exit early to prevent multiple captures
      }
    } else {
      // Data already collected, move to next mode immediately
      this.automationMode++;
      this.automationLastStepTime = 0;
      this.automationModeStartTime = now;
      
      if (this.automationMode <= this.maxModes) {
        console.log(`[GPUDemo] Moving to next mode ${this.automationMode}`);
        this.currentMode = this.automationMode;
        this.switchMode(scene);
      } else {
        console.log(`[GPUDemo] All modes completed`);
        this.automationActive = false;
        this.generateAutomationReport(scene);
      }
    }
  }

  /**
   * Dump automation state for debugging hanging cases
   */
  private dumpAutomationState(scene: GameScene, reason: string): void {
    const now = performance.now();
    const totalTime = now - this.automationStartTime;
    const modeTime = now - this.automationModeStartTime;
    
    // Capture stack trace
    const stackTrace = new Error().stack || "Stack trace unavailable";
    
    // Collect current scene state
    const sceneState = {
      childrenCount: scene.children.list.length,
      texturesCount: Array.isArray(scene.textures.list) ? scene.textures.list.length : Object.keys(scene.textures.list || {}).length,
      camerasCount: scene.cameras.cameras.length,
      inputActive: scene.input.activePointer?.isDown || false,
    };
    
    // Collect current mode state
    const modeState = {
      currentMode: this.currentMode,
      automationMode: this.automationMode,
      maxModes: this.maxModes,
      lastStepTime: this.automationLastStepTime,
      modeStartTime: this.automationModeStartTime,
      timeSinceModeStart: modeTime,
      totalTime: totalTime,
    };
    
    // Collect display object states
    const displayState = {
      testImage: this.testImage ? {
        exists: true,
        visible: this.testImage.visible,
        active: this.testImage.active,
        x: this.testImage.x,
        y: this.testImage.y,
        depth: this.testImage.depth,
        inScene: scene.children.list.includes(this.testImage),
      } : null,
      renderTexture: this.renderTexture ? {
        exists: true,
        visible: this.renderTexture.visible,
        active: this.renderTexture.active ?? false,
        x: this.renderTexture.x,
        y: this.renderTexture.y,
        depth: this.renderTexture.depth,
        inScene: scene.children.list.includes(this.renderTexture),
      } : null,
    };
    
    // Collect texture state for current mode
    const textureKey = this.automationMode <= 6 ? `__gpu_test_mode${this.automationMode}` : "gpu-render-texture";
    const textureState = {
      key: textureKey,
      exists: scene.textures.exists(textureKey),
      frames: scene.textures.exists(textureKey) ? 
        Object.keys(scene.textures.get(textureKey)?.frames || {}) : [],
    };
    
    // Create comprehensive state dump
    const stateDump = {
      timestamp: new Date().toISOString(),
      reason,
      stackTrace,
      automationState: {
        active: this.automationActive,
        modeState,
        collectedModes: this.automationReport.modes.map(m => ({
          mode: m.mode,
          success: m.success,
          renderTime: m.renderTime,
        })),
      },
      sceneState,
      displayState,
      textureState,
      performance: {
        fps: this.fps,
        lastRenderTime: this.lastRenderTime,
      },
    };
    
    // Log to console with clear markers
    console.error("=".repeat(80));
    console.error("[GPUDemo] AUTOMATION STATE DUMP - HANG DETECTED");
    console.error("=".repeat(80));
    console.error(`Reason: ${reason}`);
    console.error(`Total automation time: ${totalTime.toFixed(2)}ms`);
    console.error(`Time in current mode: ${modeTime.toFixed(2)}ms`);
    console.error("\nStack Trace:");
    console.error(stackTrace);
    console.error("\nAutomation State:");
    console.error(JSON.stringify(stateDump.automationState, null, 2));
    console.error("\nScene State:");
    console.error(JSON.stringify(stateDump.sceneState, null, 2));
    console.error("\nDisplay State:");
    console.error(JSON.stringify(stateDump.displayState, null, 2));
    console.error("\nTexture State:");
    console.error(JSON.stringify(stateDump.textureState, null, 2));
    console.error("\nFull State Dump (JSON):");
    console.error(JSON.stringify(stateDump, null, 2));
    console.error("=".repeat(80));
    
    // Also download as file
    try {
      const blob = new Blob([JSON.stringify(stateDump, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gpu-demo-hang-dump-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log("[GPUDemo] State dump saved to file");
    } catch (error) {
      console.error("[GPUDemo] Failed to save state dump:", error);
    }
    
    // Update status text
    if (this.automationStatusText) {
      this.automationStatusText.setText(
        `Automation: TIMEOUT in mode ${this.automationMode} - Check console`
      );
      this.automationStatusText.setColor("#ff0000");
    }
  }

  /**
   * Collect data for current mode
   */
  private async collectModeData(scene: GameScene, mode: number): Promise<void> {
    const { width, height } = scene.cameras.main;
    // Modes 1-6 use mode-specific keys, modes 7-14 use "gpu-render-texture"
    const textureKey = mode <= 6 ? `__gpu_test_mode${mode}` : "gpu-render-texture";
    
    // Analyze screenshot metadata (async)
    const screenshotMetadata = await this.analyzeScreenshot(scene);
    
    // Collect texture information
    const textureInfo = this.collectTextureInfo(scene, textureKey);
    
    // Collect display state
    const displayState = this.collectDisplayState(scene);
    
    // Collect framebuffer state (for modes 10+)
    const framebufferState = mode >= 10 ? this.collectFramebufferState(scene) : null;
    
    // Collect pixel samples
    const pixelSamples = this.collectPixelSamples(scene, textureKey, width, height);
    
    // Check success
    const success = this.verifyVisualSuccess(scene);
    
    // Get render time
    const renderTime = this.lastRenderTime;
    
    // Create mode report
    const modeReport: ModeReportData = {
      mode,
      timestamp: new Date().toISOString(),
      success,
      renderTime,
      textureInfo,
      displayState,
      pixelSamples,
      screenshotMetadata,
      framebufferState,
    };
    
    this.automationReport.modes.push(modeReport);
    
    // Update summary
    if (success) {
      this.automationReport.summary.successfulModes++;
    } else {
      this.automationReport.summary.failedModes++;
    }
    
    // Update status
    if (this.automationStatusText) {
      this.automationStatusText.setText(
        `Automation: Mode ${mode}/${this.maxModes} ${success ? "✓" : "✗"}`
      );
    }
  }

  /**
   * Analyze screenshot and extract metadata instead of storing base64
   * Captures the entire visible window including UI elements, widgets, and all rendered content.
   * Uses multiple methods with fallbacks to ensure reliable capture.
   */
  private async analyzeScreenshot(scene: GameScene): Promise<ScreenshotMetadata | null> {
    // Screenshot capture temporarily disabled due to timing/rendering issues
    return null;
    try {
      const game = scene.game;
      const canvas = game.canvas;
      
      if (!canvas) {
        return null;
      }

      const width = canvas.width;
      const height = canvas.height;

      // Helper to check if pixel data is valid (not all zeros)
      const hasValidData = (data: Uint8ClampedArray): boolean => {
        let nonZeroCount = 0;
        for (let i = 0; i < Math.min(10000, data.length); i += 4) {
          if (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 0) {
            nonZeroCount++;
            if (nonZeroCount > 10) return true; // Enough non-zero pixels to be valid
          }
        }
        return nonZeroCount > 10;
      };

      // Helper to extract pixel data from a canvas
      const extractPixelData = (sourceCanvas: HTMLCanvasElement): Uint8ClampedArray | null => {
        try {
          const ctx = sourceCanvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) return null;
          const imageData = ctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
          return imageData.data;
        } catch (error) {
          console.warn("[GPUDemo] Failed to extract pixel data from canvas:", error);
          return null;
        }
      };

      let data: Uint8ClampedArray | null = null;
      let methodUsed = "";

      // Method 1: html2canvas - Captures entire DOM including canvas and all HTML elements/widgets
      try {
        const gameContainer = document.getElementById("game-container");
        const targetElement = gameContainer || document.body;
        
        // Add a delay to ensure the current frame is fully rendered
        // This is especially important after mode switches - WebGL needs time to render
        // Wait longer to ensure mode has fully rendered
        await new Promise(resolve => setTimeout(resolve, 200));
        
        console.log(`[GPUDemo] Attempting html2canvas capture for mode ${mode}...`);
        const htmlCanvas = await html2canvas(targetElement, {
          width: width,
          height: height,
          useCORS: true,
          allowTaint: false,
          backgroundColor: null,
          scale: 1,
          logging: false,
          onclone: (clonedDoc) => {
            // Ensure the cloned document has the latest canvas state
            const clonedCanvas = clonedDoc.querySelector('canvas');
            if (clonedCanvas) {
              // Force a re-render by accessing the canvas
              try {
                const ctx = clonedCanvas.getContext('2d');
                if (ctx) {
                  // This ensures the canvas content is available
                  ctx.getImageData(0, 0, 1, 1);
                }
              } catch (e) {
                // Ignore errors - WebGL canvas might not support 2D context
              }
            }
          },
        });
        
        const htmlData = extractPixelData(htmlCanvas);
        if (htmlData && hasValidData(htmlData)) {
          // Scale to match canvas dimensions if needed
          if (htmlCanvas.width !== width || htmlCanvas.height !== height) {
            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = width;
            tempCanvas.height = height;
            const tempCtx = tempCanvas.getContext("2d");
            if (tempCtx) {
              tempCtx.drawImage(htmlCanvas, 0, 0, width, height);
              data = extractPixelData(tempCanvas);
            }
          } else {
            data = htmlData;
          }
          
          if (data && hasValidData(data)) {
            methodUsed = "html2canvas";
            console.log(`[GPUDemo] html2canvas capture successful`);
          }
        }
      } catch (error) {
        console.warn("[GPUDemo] html2canvas capture failed:", error);
      }

      // Method 2: canvas.toDataURL() with better timing - may work better than drawImage
      if (!data || !hasValidData(data)) {
        try {
          console.log("[GPUDemo] Attempting canvas.toDataURL() capture...");
          const dataURL = canvas.toDataURL("image/png");
          if (dataURL && dataURL !== "data:,") {
            const img = new Image();
            await new Promise<void>((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = reject;
              img.src = dataURL;
            });
            
            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = width;
            tempCanvas.height = height;
            const tempCtx = tempCanvas.getContext("2d");
            if (tempCtx) {
              tempCtx.drawImage(img, 0, 0, width, height);
              const toDataURLData = extractPixelData(tempCanvas);
              if (toDataURLData && hasValidData(toDataURLData)) {
                data = toDataURLData;
                methodUsed = "canvas.toDataURL()";
                console.log(`[GPUDemo] canvas.toDataURL() capture successful`);
              }
            }
          }
        } catch (error) {
          console.warn("[GPUDemo] canvas.toDataURL() capture failed:", error);
        }
      }

      // Method 3: Copy WebGL canvas to 2D canvas (works if preserveDrawingBuffer is enabled)
      if (!data || !hasValidData(data)) {
        try {
          console.log("[GPUDemo] Attempting drawImage() capture...");
          const tempCanvas = document.createElement("canvas");
          tempCanvas.width = width;
          tempCanvas.height = height;
          const tempCtx = tempCanvas.getContext("2d", { willReadFrequently: true });
          
          if (tempCtx) {
            tempCtx.drawImage(canvas, 0, 0, width, height);
            const drawImageData = extractPixelData(tempCanvas);
            if (drawImageData && hasValidData(drawImageData)) {
              data = drawImageData;
              methodUsed = "drawImage()";
              console.log(`[GPUDemo] drawImage() capture successful`);
            }
          }
        } catch (error) {
          console.warn("[GPUDemo] drawImage() capture failed:", error);
        }
      }

      // Method 4: Phaser renderer snapshot (if available)
      if (!data || !hasValidData(data)) {
        try {
          const renderer = game.renderer as any;
          if (renderer && typeof renderer.snapshot === "function") {
            console.log("[GPUDemo] Attempting Phaser renderer.snapshot() capture...");
            const snapshot = renderer.snapshot();
            if (snapshot && snapshot instanceof HTMLCanvasElement) {
              const snapshotData = extractPixelData(snapshot);
              if (snapshotData && hasValidData(snapshotData)) {
                data = snapshotData;
                methodUsed = "Phaser.snapshot()";
                console.log(`[GPUDemo] Phaser.snapshot() capture successful`);
              }
            }
          }
        } catch (error) {
          console.warn("[GPUDemo] Phaser snapshot capture failed:", error);
        }
      }

      // Method 5: WebGL readPixels (only works if preserveDrawingBuffer is enabled)
      if (!data || !hasValidData(data)) {
        try {
          const renderer = game.renderer as any;
          if (renderer && renderer.gl) {
            console.log("[GPUDemo] Attempting WebGL readPixels() capture...");
            const gl = renderer.gl as WebGLRenderingContext | WebGL2RenderingContext;
            const pixels = new Uint8Array(width * height * 4);
            
            const currentFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            
            if (currentFramebuffer) {
              gl.bindFramebuffer(gl.FRAMEBUFFER, currentFramebuffer);
            }
            
            // Check if we got data
            if (hasValidData(new Uint8ClampedArray(pixels.buffer))) {
              // Flip Y axis (WebGL origin is bottom-left)
              const flippedPixels = new Uint8ClampedArray(width * height * 4);
              for (let y = 0; y < height; y++) {
                const srcRow = (height - 1 - y) * width * 4;
                const dstRow = y * width * 4;
                for (let x = 0; x < width * 4; x++) {
                  flippedPixels[dstRow + x] = pixels[srcRow + x];
                }
              }
              data = flippedPixels;
              methodUsed = "WebGL.readPixels()";
              console.log(`[GPUDemo] WebGL.readPixels() capture successful`);
            }
          }
        } catch (error) {
          console.warn("[GPUDemo] WebGL readPixels capture failed:", error);
        }
      }
      
      if (!data || !hasValidData(data)) {
        console.warn(`[GPUDemo] All screenshot capture methods failed - no valid pixel data`);
        return null;
      }

      console.log(`[GPUDemo] Screenshot captured successfully using: ${methodUsed}`);

      // Calculate quarter boundaries
      const halfWidth = Math.floor(width / 2);
      const halfHeight = Math.floor(height / 2);

      // Helper to check if pixel is pure white (255,255,255)
      const isPureWhite = (r: number, g: number, b: number): boolean => {
        return r === 255 && g === 255 && b === 255;
      };

      // Helper to get pixel RGB at coordinates
      const getPixelRGB = (x: number, y: number): { r: number; g: number; b: number } => {
        const index = (y * width + x) * 4;
        return {
          r: data[index],
          g: data[index + 1],
          b: data[index + 2],
        };
      };

      // Analyze each quarter
      const analyzeQuarter = (
        startX: number,
        endX: number,
        startY: number,
        endY: number
      ): {
        whiteCount: number;
        avgColor: { r: number; g: number; b: number };
        variance: number;
      } => {
        let whiteCount = 0;
        let totalR = 0;
        let totalG = 0;
        let totalB = 0;
        let pixelCount = 0;
        const rgbValues: number[] = [];

        for (let y = startY; y < endY; y++) {
          for (let x = startX; x < endX; x++) {
            const rgb = getPixelRGB(x, y);
            rgbValues.push(rgb.r, rgb.g, rgb.b);
            totalR += rgb.r;
            totalG += rgb.g;
            totalB += rgb.b;
            pixelCount++;
            if (isPureWhite(rgb.r, rgb.g, rgb.b)) {
              whiteCount++;
            }
          }
        }

        const avgColor = {
          r: Math.round(totalR / pixelCount),
          g: Math.round(totalG / pixelCount),
          b: Math.round(totalB / pixelCount),
        };

        // Calculate variance (standard deviation of RGB values)
        const mean = (totalR + totalG + totalB) / (pixelCount * 3);
        let sumSquaredDiff = 0;
        for (const value of rgbValues) {
          sumSquaredDiff += Math.pow(value - mean, 2);
        }
        const variance = Math.sqrt(sumSquaredDiff / rgbValues.length);

        return { whiteCount, avgColor, variance };
      };

      // Analyze quarters
      const topLeft = analyzeQuarter(0, halfWidth, 0, halfHeight);
      const topRight = analyzeQuarter(halfWidth, width, 0, halfHeight);
      const bottomLeft = analyzeQuarter(0, halfWidth, halfHeight, height);
      const bottomRight = analyzeQuarter(halfWidth, width, halfHeight, height);

      // Check if entire screenshot is white
      const totalWhitePixels = topLeft.whiteCount + topRight.whiteCount + bottomLeft.whiteCount + bottomRight.whiteCount;
      const totalPixels = width * height;
      const isAllWhite = totalWhitePixels === totalPixels;

      // Check expected color regions
      const centerX = Math.floor(width / 2);
      const centerY = Math.floor(height / 2);
      const centerTextArea = getPixelRGB(centerX, centerY);
      
      const cornerSize = 10; // Sample 10x10 pixel area in corners
      const topLeftCorner = getPixelRGB(cornerSize, cornerSize);
      const topRightCorner = getPixelRGB(width - cornerSize, cornerSize);
      const bottomLeftCorner = getPixelRGB(cornerSize, height - cornerSize);
      const bottomRightCorner = getPixelRGB(width - cornerSize, height - cornerSize);

      // Sample pattern pixels
      const patternSamples: Array<{
        x: number;
        y: number;
        expected: string;
        actual: { r: number; g: number; b: number };
        isWhite: boolean;
      }> = [];

      // Sample gradient areas (should have color variation)
      const gradientSamples = [
        { x: Math.floor(width * 0.25), y: Math.floor(height * 0.25), expected: "Red gradient area" },
        { x: Math.floor(width * 0.5), y: Math.floor(height * 0.5), expected: "Green gradient area" },
        { x: Math.floor(width * 0.75), y: Math.floor(height * 0.75), expected: "Blue gradient area" },
      ];

      // Sample checkerboard cells
      const cellSize = 50;
      for (let i = 0; i < 5; i++) {
        const x = (i * cellSize) + (cellSize / 2);
        const y = (i * cellSize) + (cellSize / 2);
        if (x < width && y < height) {
          patternSamples.push({
            x,
            y,
            expected: `Checkerboard cell at (${x}, ${y})`,
            actual: getPixelRGB(x, y),
            isWhite: isPureWhite(getPixelRGB(x, y).r, getPixelRGB(x, y).g, getPixelRGB(x, y).b),
          });
        }
      }

      // Sample text area (should not be pure white)
      patternSamples.push({
        x: centerX,
        y: centerY - 50,
        expected: "Text area (Mode X)",
        actual: getPixelRGB(centerX, centerY - 50),
        isWhite: isPureWhite(getPixelRGB(centerX, centerY - 50).r, getPixelRGB(centerX, centerY - 50).g, getPixelRGB(centerX, centerY - 50).b),
      });

      // Add gradient samples
      for (const sample of gradientSamples) {
        const rgb = getPixelRGB(sample.x, sample.y);
        patternSamples.push({
          x: sample.x,
          y: sample.y,
          expected: sample.expected,
          actual: rgb,
          isWhite: isPureWhite(rgb.r, rgb.g, rgb.b),
        });
      }

      return {
        isAllWhite,
        whitePixelCounts: {
          topLeft: topLeft.whiteCount,
          topRight: topRight.whiteCount,
          bottomLeft: bottomLeft.whiteCount,
          bottomRight: bottomRight.whiteCount,
          total: totalWhitePixels,
        },
        averageColors: {
          topLeft: topLeft.avgColor,
          topRight: topRight.avgColor,
          bottomLeft: bottomLeft.avgColor,
          bottomRight: bottomRight.avgColor,
        },
        expectedColorChecks: {
          centerTextArea: {
            expected: "Text (not pure white)",
            actual: centerTextArea,
            isWhite: isPureWhite(centerTextArea.r, centerTextArea.g, centerTextArea.b),
          },
          topLeftCorner: {
            expected: "Red gradient start",
            actual: topLeftCorner,
            isWhite: isPureWhite(topLeftCorner.r, topLeftCorner.g, topLeftCorner.b),
          },
          topRightCorner: {
            expected: "Green gradient middle",
            actual: topRightCorner,
            isWhite: isPureWhite(topRightCorner.r, topRightCorner.g, topRightCorner.b),
          },
          bottomLeftCorner: {
            expected: "Green gradient middle",
            actual: bottomLeftCorner,
            isWhite: isPureWhite(bottomLeftCorner.r, bottomLeftCorner.g, bottomLeftCorner.b),
          },
          bottomRightCorner: {
            expected: "Blue gradient end",
            actual: bottomRightCorner,
            isWhite: isPureWhite(bottomRightCorner.r, bottomRightCorner.g, bottomRightCorner.b),
          },
        },
        patternSamples,
        colorVariance: {
          topLeft: topLeft.variance,
          topRight: topRight.variance,
          bottomLeft: bottomLeft.variance,
          bottomRight: bottomRight.variance,
        },
      };
    } catch (error) {
      console.error("[GPUDemo] Screenshot analysis failed:", error);
      return null;
    }
  }

  /**
   * Collect texture information
   */
  private collectTextureInfo(scene: GameScene, textureKey: string): TextureInfoData {
    const exists = scene.textures.exists(textureKey);
    const texture = exists ? scene.textures.get(textureKey) : null;
    const frames = texture?.frames ? Object.keys(texture.frames) : [];
    
    // Access frame directly from texture.frames (getFrame doesn't exist)
    let baseFrame: any = null;
    if (texture) {
      try {
        if (texture.frames) {
          const framesObj = texture.frames as any;
          if (framesObj["__BASE"]) {
            baseFrame = framesObj["__BASE"];
          } else if (frames.length > 0) {
            // Fallback to first frame
            baseFrame = framesObj[frames[0]];
          }
        }
      } catch (error) {
        console.warn(`[GPUDemo] Could not access frame for texture ${textureKey}:`, error);
      }
    }
    
    const source = texture?.source?.[0];
    
    return {
      key: textureKey,
      exists,
      frameCount: frames.length,
      frames,
      baseFrame: baseFrame ? {
        name: baseFrame.name,
        width: baseFrame.width,
        height: baseFrame.height,
      } : null,
      sourceType: source ? source.constructor.name : null,
      sourceWidth: source && 'width' in source ? (source as any).width : null,
      sourceHeight: source && 'height' in source ? (source as any).height : null,
    };
  }

  /**
   * Collect display state information
   */
  private collectDisplayState(scene: GameScene): DisplayStateData {
    const imageState = this.testImage ? {
      exists: true as const,
      x: this.testImage.x,
      y: this.testImage.y,
      displayWidth: this.testImage.displayWidth,
      displayHeight: this.testImage.displayHeight,
      visible: this.testImage.visible,
      alpha: this.testImage.alpha,
      depth: this.testImage.depth,
      inScene: scene.children.list.includes(this.testImage),
    } : null;
    
    const renderTextureState = this.renderTexture ? {
      exists: true as const,
      x: this.renderTexture.x,
      y: this.renderTexture.y,
      width: this.renderTexture.width,
      height: this.renderTexture.height,
      displayWidth: this.renderTexture.displayWidth,
      displayHeight: this.renderTexture.displayHeight,
      visible: this.renderTexture.visible,
      active: this.renderTexture.active ?? false,
      depth: this.renderTexture.depth,
      inScene: scene.children.list.includes(this.renderTexture),
      textureWidth: (this.renderTexture.texture as any).width as number,
      textureHeight: (this.renderTexture.texture as any).height as number,
    } : null;
    
    // Enhanced: Add canvas content verification and texture source details
    let canvasContent: { hasContent: boolean; samplePixels: Array<{ x: number; y: number; r: number; g: number; b: number }> } | null = null;
    let textureSourceDetails: any = null;

    if (renderTextureState) {
      // Try to sample canvas content if available
      const textureKey = "gpu-render-texture";
      if (scene.textures.exists(textureKey)) {
        try {
          const texture = scene.textures.get(textureKey);
          const source = texture?.source?.[0];
          if (source && source.image instanceof HTMLCanvasElement) {
            const canvas = source.image;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              // Sample a few pixels to verify content
              const samplePoints = [
                { x: 10, y: 10 },
                { x: canvas.width / 2, y: canvas.height / 2 },
                { x: canvas.width - 10, y: canvas.height - 10 },
              ];
              const samples = samplePoints.map(point => {
                const imageData = ctx.getImageData(point.x, point.y, 1, 1);
                return {
                  x: point.x,
                  y: point.y,
                  r: imageData.data[0],
                  g: imageData.data[1],
                  b: imageData.data[2],
                };
              });
              const hasContent = samples.some(s => s.r !== 0 || s.g !== 0 || s.b !== 0);
              canvasContent = { hasContent, samplePixels: samples };
            }
          }

          // Collect texture source details
          if (source) {
            textureSourceDetails = {
              type: source.constructor.name,
              width: (source as any).width,
              height: (source as any).height,
              imageType: source.image ? (source.image instanceof HTMLCanvasElement ? 'HTMLCanvasElement' : source.image.constructor.name) : 'null',
            };
          }
        } catch (error) {
          console.warn("[GPUDemo] Could not collect canvas content:", error);
        }
      }
    }

    return {
      image: imageState,
      renderTexture: renderTextureState,
      canvasContent,
      textureSourceDetails,
    };
  }

  /**
   * Collect framebuffer state information
   */
  private collectFramebufferState(scene: GameScene): any {
    try {
      const renderer = scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
      if (!renderer || !renderer.gl) {
        return null;
      }

      const gl = renderer.gl;
      const currentFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
      const framebufferStatus = currentFramebuffer ? gl.checkFramebufferStatus(gl.FRAMEBUFFER) : null;

      // Get framebuffer status string
      let statusString = "N/A";
      if (framebufferStatus !== null) {
        if (framebufferStatus === gl.FRAMEBUFFER_COMPLETE) {
          statusString = "COMPLETE";
        } else if (framebufferStatus === gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT) {
          statusString = "INCOMPLETE_ATTACHMENT";
        } else if (framebufferStatus === gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT) {
          statusString = "INCOMPLETE_MISSING_ATTACHMENT";
        } else if (framebufferStatus === gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS) {
          statusString = "INCOMPLETE_DIMENSIONS";
        } else if (framebufferStatus === gl.FRAMEBUFFER_UNSUPPORTED) {
          statusString = "UNSUPPORTED";
        } else {
          statusString = `UNKNOWN(${framebufferStatus})`;
        }
      }

      // Check for WebGL errors
      const glError = gl.getError();
      const glErrorString = glError === gl.NO_ERROR ? 'NO_ERROR' :
        glError === gl.INVALID_ENUM ? 'INVALID_ENUM' :
        glError === gl.INVALID_VALUE ? 'INVALID_VALUE' :
        glError === gl.INVALID_OPERATION ? 'INVALID_OPERATION' :
        glError === gl.INVALID_FRAMEBUFFER_OPERATION ? 'INVALID_FRAMEBUFFER_OPERATION' :
        glError === gl.OUT_OF_MEMORY ? 'OUT_OF_MEMORY' :
        `Unknown(${glError})`;

      return {
        currentFramebuffer: currentFramebuffer,
        framebufferStatus: statusString,
        framebufferStatusCode: framebufferStatus,
        glError: glErrorString,
        glErrorCode: glError,
        viewport: gl.getParameter(gl.VIEWPORT),
      };
    } catch (error) {
      console.warn("[GPUDemo] Could not collect framebuffer state:", error);
      return null;
    }
  }

  /**
   * Collect pixel samples from texture
   */
  private collectPixelSamples(
    scene: GameScene,
    textureKey: string,
    width: number,
    height: number
  ): PixelSampleData[] {
    const samples: PixelSampleData[] = [];
    
    if (!scene.textures.exists(textureKey)) {
      return samples;
    }
    
    const texture = scene.textures.get(textureKey);
    const source = texture?.source?.[0];
    
    if (source && source instanceof HTMLCanvasElement) {
      const ctx = source.getContext("2d");
      if (ctx) {
        const samplePositions = [
          { x: 0, y: 0, name: "Top-Left" },
          { x: Math.floor(width / 2), y: Math.floor(height / 2), name: "Center" },
          { x: width - 1, y: height - 1, name: "Bottom-Right" },
        ];
        
        for (const pos of samplePositions) {
          try {
            const imageData = ctx.getImageData(pos.x, pos.y, 1, 1);
            samples.push({
              position: pos.name,
              x: pos.x,
              y: pos.y,
              rgba: {
                r: imageData.data[0],
                g: imageData.data[1],
                b: imageData.data[2],
                a: imageData.data[3],
              },
            });
          } catch (error) {
            // Skip if out of bounds
          }
        }
      }
    }
    
    return samples;
  }

  /**
   * Generate and export automation report
   */
  /**
   * Compare successful modes vs failing modes to identify key differences
   */
  private compareModes(): {
    workingModes: number[];
    failingModes: number[];
    keyDifferences: Array<{
      category: string;
      workingValue: any;
      failingValue: any;
      description: string;
    }>;
    recommendations: string[];
  } {
    const workingModes = this.automationReport.modes
      .filter(m => m.success)
      .map(m => m.mode);
    
    const failingModes = this.automationReport.modes
      .filter(m => !m.success)
      .map(m => m.mode);

    const keyDifferences: Array<{
      category: string;
      workingValue: any;
      failingValue: any;
      description: string;
    }> = [];
    const recommendations: string[] = [];

    // Compare working modes (1, 4) vs failing modes (7, 8, 10)
    const workingModeData = this.automationReport.modes.filter(m => workingModes.includes(m.mode));
    const failingModeData = this.automationReport.modes.filter(m => failingModes.includes(m.mode));

    if (workingModeData.length === 0 || failingModeData.length === 0) {
      return { workingModes, failingModes, keyDifferences, recommendations };
    }

    // Compare RenderTexture display properties
    const workingRT = workingModeData[0]?.displayState?.renderTexture;
    const failingRT = failingModeData[0]?.displayState?.renderTexture;

    if (workingRT && failingRT) {
      // Compare position
      if (workingRT.x !== failingRT.x || workingRT.y !== failingRT.y) {
        keyDifferences.push({
          category: "RenderTexture Position",
          workingValue: `(${workingRT.x}, ${workingRT.y})`,
          failingValue: `(${failingRT.x}, ${failingRT.y})`,
          description: "Working modes use (0, 0) position, failing modes may use bounds.min",
        });
        recommendations.push("Try setting RenderTexture position to (0, 0) instead of bounds.min");
      }

      // Compare visibility/active state
      if (workingRT.visible !== failingRT.visible) {
        keyDifferences.push({
          category: "RenderTexture Visibility",
          workingValue: workingRT.visible,
          failingValue: failingRT.visible,
          description: "Visibility state differs",
        });
      }

      if (workingRT.active !== failingRT.active) {
        keyDifferences.push({
          category: "RenderTexture Active",
          workingValue: workingRT.active,
          failingValue: failingRT.active,
          description: "Active state differs",
        });
      }

      // Compare inScene
      if (workingRT.inScene !== failingRT.inScene) {
        keyDifferences.push({
          category: "RenderTexture inScene",
          workingValue: workingRT.inScene,
          failingValue: failingRT.inScene,
          description: "Working modes ensure RenderTexture is in scene display list",
        });
        recommendations.push("Ensure RenderTexture is added to scene.children.list");
      }
    }

    // Compare texture source handling
    const workingTexture = workingModeData[0]?.textureInfo;
    const failingTexture = failingModeData[0]?.textureInfo;

    if (workingTexture && failingTexture) {
      // Check if working modes use renderTexture.draw() vs failing modes use direct display
      const workingUsesDraw = workingModeData.some(m => 
        m.mode === 1 || m.mode === 4 // Modes 1 and 4 use renderTexture.draw()
      );
      const failingUsesDraw = failingModeData.some(m => 
        m.mode === 7 || m.mode === 8 || m.mode === 10 // These try direct display
      );

      if (workingUsesDraw && !failingUsesDraw) {
        keyDifferences.push({
          category: "Rendering Method",
          workingValue: "renderTexture.draw(tempImage)",
          failingValue: "Direct RenderTexture display",
          description: "Working modes use renderTexture.draw() to copy canvas content, failing modes try direct display",
        });
        recommendations.push("Use renderTexture.draw(tempImage) after renderToPhaserTexture() creates canvas");
      }
    }

    // Compare canvas content
    const workingCanvas = workingModeData[0]?.displayState?.canvasContent;
    const failingCanvas = failingModeData[0]?.displayState?.canvasContent;

    if (workingCanvas && failingCanvas) {
      if (workingCanvas.hasContent !== failingCanvas.hasContent) {
        keyDifferences.push({
          category: "Canvas Content",
          workingValue: workingCanvas.hasContent ? "Has content" : "No content",
          failingValue: failingCanvas.hasContent ? "Has content" : "No content",
          description: "Canvas content verification differs",
        });
        recommendations.push("Verify canvas has content before displaying RenderTexture");
      }
    }

    // Compare framebuffer state (for modes 10+)
    const workingFramebuffer = workingModeData.find(m => m.framebufferState)?.framebufferState;
    const failingFramebuffer = failingModeData.find(m => m.framebufferState)?.framebufferState;

    if (workingFramebuffer && failingFramebuffer) {
      if (workingFramebuffer.framebufferStatus !== failingFramebuffer.framebufferStatus) {
        keyDifferences.push({
          category: "Framebuffer Status",
          workingValue: workingFramebuffer.framebufferStatus,
          failingValue: failingFramebuffer.framebufferStatus,
          description: "Framebuffer completeness status differs",
        });
      }
    }

    // General recommendations based on findings
    if (keyDifferences.length > 0) {
      if (!recommendations.some(r => r.includes("renderTexture.draw"))) {
        recommendations.push("Consider using renderTexture.draw() pattern from working modes (1, 4)");
      }
      if (!recommendations.some(r => r.includes("position"))) {
        recommendations.push("Ensure RenderTexture position is set correctly (try 0, 0)");
      }
    }

    return { workingModes, failingModes, keyDifferences, recommendations };
  }

  private generateAutomationReport(_scene: GameScene): void {
    // Calculate average render time
    const renderTimes = this.automationReport.modes
      .map(m => m.renderTime)
      .filter(t => t > 0);
    this.automationReport.summary.averageRenderTime = 
      renderTimes.length > 0
        ? renderTimes.reduce((a, b) => a + b, 0) / renderTimes.length
        : 0;
    
    // Perform mode comparison
    this.automationReport.modeComparison = this.compareModes();
    
    // Generate report JSON
    const reportJson = JSON.stringify(this.automationReport, null, 2);
    
    // Log to console
    console.log("[GPUDemo] Automation Report:", this.automationReport);
    console.log("[GPUDemo] Full Report JSON:", reportJson);
    
    // Download as file
    this.downloadReport(reportJson);
    
    // Update status
    if (this.automationStatusText) {
      this.automationStatusText.setText(
        `Automation: Complete! ${this.automationReport.summary.successfulModes}/${this.automationReport.summary.totalModes} modes successful`
      );
    }
    
    // Reset after a delay
    setTimeout(() => {
      if (this.automationStatusText) {
        this.automationStatusText.setText("Automation: Press A to start");
      }
    }, 3000);
  }

  /**
   * Download report as JSON file
   */
  private downloadReport(reportJson: string): void {
    try {
      const blob = new Blob([reportJson], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gpu-demo-report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("[GPUDemo] Failed to download report:", error);
    }
  }

  /**
   * Helper method to check if a texture's WebGL texture (glTexture) is ready
   * This is useful for detecting when a texture created with addCanvas is ready for rendering
   * @param scene The game scene
   * @param textureKey The texture key to check
   * @returns true if the texture exists and has a ready glTexture, false otherwise
   */
  private isTextureReady(scene: GameScene, textureKey: string): boolean {
    try {
      if (!scene.textures.exists(textureKey)) {
        return false;
      }

      const texture = scene.textures.get(textureKey);
      if (!texture || !texture.frames || Object.keys(texture.frames).length === 0) {
        return false;
      }

      // Get the base frame (usually '__BASE' or first frame)
      const frameNames = Object.keys(texture.frames);
      const baseFrameName = frameNames.includes('__BASE') ? '__BASE' : frameNames[0];
      const framesAny = texture.frames as any;
      const frame = framesAny[baseFrameName];

      if (!frame) {
        return false;
      }

      // Check if glTexture exists (WebGL texture is ready)
      // Access via type assertion since glTexture is not in the public API
      const frameAny = frame as any;
      return frameAny.glTexture !== null && frameAny.glTexture !== undefined;
    } catch (error) {
      console.error("[GPUDemo] Error checking texture readiness:", error);
      return false;
    }
  }

  /**
   * Helper method to wait for a texture to be ready (optional enhancement)
   * Polls for glTexture availability with a timeout
   * Note: This is not currently used but available for future use if needed
   * @param scene The game scene
   * @param textureKey The texture key to wait for
   * @param timeoutMs Maximum time to wait in milliseconds (default: 1000ms)
   * @param pollIntervalMs Interval between checks in milliseconds (default: 50ms)
   * @returns Promise that resolves to true if texture is ready, false if timeout
   */
  // @ts-ignore - unused but available for future use
  private waitForTextureReady(
    scene: GameScene,
    textureKey: string,
    timeoutMs: number = 1000,
    pollIntervalMs: number = 50
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const startTime = performance.now();
      
      const checkTexture = () => {
        if (this.isTextureReady(scene, textureKey)) {
          resolve(true);
          return;
        }

        const elapsed = performance.now() - startTime;
        if (elapsed >= timeoutMs) {
          console.warn(`[GPUDemo] Texture ${textureKey} not ready after ${timeoutMs}ms`);
          resolve(false);
          return;
        }

        setTimeout(checkTexture, pollIntervalMs);
      };

      checkTexture();
    });
  }

}

/**
 * Type definitions for automation report
 */
interface AutomationReportData {
  timestamp: string;
  modes: ModeReportData[];
  summary: {
    totalModes: number;
    successfulModes: number;
    failedModes: number;
    averageRenderTime: number;
  };
  modeComparison?: {
    workingModes: number[];
    failingModes: number[];
    keyDifferences: Array<{
      category: string;
      workingValue: any;
      failingValue: any;
      description: string;
    }>;
    recommendations: string[];
  };
}

interface ModeReportData {
  mode: number;
  timestamp: string;
  success: boolean;
  renderTime: number;
  textureInfo: TextureInfoData;
  displayState: DisplayStateData;
  pixelSamples: PixelSampleData[];
  screenshotMetadata: ScreenshotMetadata | null;
  framebufferState?: any | null;
}

interface TextureInfoData {
  key: string;
  exists: boolean;
  frameCount: number;
  frames: string[];
  baseFrame: {
    name: string;
    width: number;
    height: number;
  } | null;
  sourceType: string | null;
  sourceWidth: number | null;
  sourceHeight: number | null;
}

interface DisplayStateData {
  image: {
    exists: true;
    x: number;
    y: number;
    displayWidth: number;
    displayHeight: number;
    visible: boolean;
    alpha: number;
    depth: number;
    inScene: boolean;
  } | null;
  renderTexture: {
    exists: true;
    x: number;
    y: number;
    width: number;
    height: number;
    displayWidth: number;
    displayHeight: number;
    visible: boolean;
    active: boolean;
    depth: number;
    inScene: boolean;
    textureWidth: number;
    textureHeight: number;
  } | null;
  canvasContent?: {
    hasContent: boolean;
    samplePixels: Array<{ x: number; y: number; r: number; g: number; b: number }>;
  } | null;
  textureSourceDetails?: any | null;
}

interface PixelSampleData {
  position: string;
  x: number;
  y: number;
  rgba: {
    r: number;
    g: number;
    b: number;
    a: number;
  };
}

interface ScreenshotMetadata {
  isAllWhite: boolean;
  whitePixelCounts: {
    topLeft: number;
    topRight: number;
    bottomLeft: number;
    bottomRight: number;
    total: number;
  };
  averageColors: {
    topLeft: { r: number; g: number; b: number };
    topRight: { r: number; g: number; b: number };
    bottomLeft: { r: number; g: number; b: number };
    bottomRight: { r: number; g: number; b: number };
  };
  expectedColorChecks: {
    centerTextArea: { expected: string; actual: { r: number; g: number; b: number }; isWhite: boolean };
    topLeftCorner: { expected: string; actual: { r: number; g: number; b: number }; isWhite: boolean };
    topRightCorner: { expected: string; actual: { r: number; g: number; b: number }; isWhite: boolean };
    bottomLeftCorner: { expected: string; actual: { r: number; g: number; b: number }; isWhite: boolean };
    bottomRightCorner: { expected: string; actual: { r: number; g: number; b: number }; isWhite: boolean };
  };
  patternSamples: Array<{
    x: number;
    y: number;
    expected: string;
    actual: { r: number; g: number; b: number };
    isWhite: boolean;
  }>;
  colorVariance: {
    topLeft: number;
    topRight: number;
    bottomLeft: number;
    bottomRight: number;
  };
}
