/**
 * Game Scene
 *
 * Main scene that manages demo rendering and interactions.
 * This is a framework-agnostic implementation that can work
 * with Canvas2D now and Phaser 4 later.
 */

import type { Demo } from '../core/demos/Demo';
import { createRenderer, type Renderer } from '../core/rendering/PhaserBridge';

/**
 * Scene state
 */
export interface SceneState {
  width: number;
  height: number;
  isInitialized: boolean;
  currentDemo: Demo | null;
}

/**
 * GameScene class
 *
 * Manages the game canvas and demo lifecycle.
 */
export class GameScene {
  private wrapper: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private renderer: Renderer | null = null;
  private state: SceneState;
  private animationId: number | null = null;

  constructor(container: HTMLElement) {
    // Create wrapper div to hold canvas and UI overlays
    // This wrapper gets centered by flexbox and UI is positioned relative to it
    this.wrapper = document.createElement('div');
    this.wrapper.style.cssText = `
      position: relative;
      display: inline-block;
    `;
    container.appendChild(this.wrapper);

    // Create canvas inside wrapper
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1280;
    this.canvas.height = 720;
    this.canvas.style.display = 'block';
    this.wrapper.appendChild(this.canvas);

    // Get 2D context for display
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context');
    }
    this.ctx = ctx;

    // Initialize state
    this.state = {
      width: this.canvas.width,
      height: this.canvas.height,
      isInitialized: false,
      currentDemo: null,
    };
  }

  /**
   * Initialize the scene
   */
  async initialize(): Promise<void> {
    // Create renderer
    this.renderer = await createRenderer();
    this.renderer.resize(this.state.width, this.state.height);

    this.state.isInitialized = true;
    console.log('[GameScene] Initialized');

    // Start render loop
    this.startRenderLoop();
  }

  /**
   * Load a demo
   */
  loadDemo(demo: Demo): void {
    // Cleanup current demo
    if (this.state.currentDemo) {
      this.state.currentDemo.cleanup(this);
    }

    // Initialize new demo
    this.state.currentDemo = demo;
    demo.initialize(this);

    console.log(`[GameScene] Loaded demo: ${demo.name}`);
  }

  /**
   * Get current demo
   */
  getCurrentDemo(): Demo | null {
    return this.state.currentDemo;
  }

  /**
   * Get renderer
   */
  getRenderer(): Renderer | null {
    return this.renderer;
  }

  /**
   * Get canvas dimensions
   */
  getDimensions(): { width: number; height: number } {
    return { width: this.state.width, height: this.state.height };
  }

  /**
   * Get canvas for direct manipulation
   */
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /**
   * Get 2D context
   */
  getContext(): CanvasRenderingContext2D {
    return this.ctx;
  }

  /**
   * Resize the scene to fit the container
   */
  resize(width: number, height: number): void {
    // Maintain 16:9 aspect ratio
    const aspectRatio = 16 / 9;
    let newWidth = width;
    let newHeight = height;

    if (width / height > aspectRatio) {
      // Too wide, constrain by height
      newWidth = Math.floor(height * aspectRatio);
    } else {
      // Too tall, constrain by width
      newHeight = Math.floor(width / aspectRatio);
    }

    // Update canvas size
    this.canvas.width = newWidth;
    this.canvas.height = newHeight;

    // Update state
    this.state.width = newWidth;
    this.state.height = newHeight;

    // Resize renderer
    if (this.renderer) {
      this.renderer.resize(newWidth, newHeight);
    }

    // Notify current demo of resize
    if (this.state.currentDemo?.resize) {
      this.state.currentDemo.resize(this, newWidth, newHeight);
    }
  }

  /**
   * Start the render loop
   */
  private startRenderLoop(): void {
    const loop = async () => {
      await this.update();
      this.animationId = requestAnimationFrame(loop);
    };

    this.animationId = requestAnimationFrame(loop);
  }

  /**
   * Update and render
   */
  private async update(): Promise<void> {
    if (!this.state.isInitialized || !this.renderer) {
      return;
    }

    // Update current demo
    if (this.state.currentDemo?.update) {
      this.state.currentDemo.update(this);
    }

    // Only use GPU renderer if the demo requires it (default: true)
    const usesGpu = this.state.currentDemo?.usesGpuRenderer ?? true;
    if (usesGpu) {
      // Render via GPU and display
      const imageData = await this.renderer.render();
      this.ctx.putImageData(imageData, 0, 0);
    }
  }

  /**
   * Destroy the scene
   */
  destroy(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }

    if (this.state.currentDemo) {
      this.state.currentDemo.cleanup(this);
    }

    this.renderer?.destroy();
    this.wrapper.remove();
  }
}
