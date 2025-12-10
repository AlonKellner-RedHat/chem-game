/**
 * GPU Demo
 * 
 * Diagnostic demo for testing GPU rendering pipeline.
 */

import { Demo } from './Demo';
import { GameScene } from '../../scenes/GameScene';
import { ToggleButton } from '../ui';

type DiagnosticMode = 'pattern' | 'gradient' | 'spectrum' | 'shapes';

// Base design dimensions
const BASE_WIDTH = 1280;
const BASE_HEIGHT = 720;

export class GPUDemo implements Demo {
  readonly name = 'GPU Demo';
  readonly description = 'GPU rendering pipeline diagnostics';
  
  private mode: DiagnosticMode = 'pattern';
  private uiContainer: HTMLElement | null = null;
  private uiScaleWrapper: HTMLElement | null = null;
  private modeButtons: ToggleButton[] = [];
  
  initialize(scene: GameScene): void {
    console.log('[GPUDemo] Initialized');
    
    this.createUI(scene);
    this.render(scene);
  }
  
  update(scene: GameScene): void {
    this.render(scene);
  }
  
  cleanup(scene: GameScene): void {
    console.log('[GPUDemo] Cleaned up');
    
    for (const button of this.modeButtons) {
      button.destroy();
    }
    this.modeButtons = [];
    
    this.uiScaleWrapper?.remove();
    this.uiScaleWrapper = null;
    this.uiContainer?.remove();
    this.uiContainer = null;
  }
  
  resize(scene: GameScene, width: number, height: number): void {
    this.updateUIScale(scene);
  }
  
  private updateUIScale(scene: GameScene): void {
    if (!this.uiContainer || !this.uiScaleWrapper) return;
    
    const { width, height } = scene.getDimensions();
    const scale = Math.min(width / BASE_WIDTH, height / BASE_HEIGHT);
    
    this.uiContainer.style.width = `${width}px`;
    this.uiContainer.style.height = `${height}px`;
    this.uiScaleWrapper.style.transform = `scale(${scale})`;
  }
  
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
      top: 10px;
      left: 10px;
      display: flex;
      gap: 8px;
      transform-origin: top left;
      pointer-events: auto;
    `;
    this.uiContainer.appendChild(this.uiScaleWrapper);
    
    // Apply initial scale
    this.updateUIScale(scene);
    
    const modes: DiagnosticMode[] = ['pattern', 'gradient', 'spectrum', 'shapes'];
    
    for (const mode of modes) {
      const button = new ToggleButton(this.uiScaleWrapper, {
        enabled: mode === this.mode,
        labelOn: mode.charAt(0).toUpperCase() + mode.slice(1),
        labelOff: mode.charAt(0).toUpperCase() + mode.slice(1),
        onToggle: () => {
          this.mode = mode;
          // Update button states
          for (const btn of this.modeButtons) {
            btn.setEnabled(btn === button, false);
          }
        },
      });
      this.modeButtons.push(button);
    }
  }
  
  private render(scene: GameScene): void {
    const ctx = scene.getContext();
    const { width, height } = scene.getDimensions();
    
    switch (this.mode) {
      case 'pattern':
        this.renderPattern(ctx, width, height);
        break;
      case 'gradient':
        this.renderGradient(ctx, width, height);
        break;
      case 'spectrum':
        this.renderSpectrum(ctx, width, height);
        break;
      case 'shapes':
        this.renderShapes(ctx, width, height);
        break;
    }
    
    // Mode label
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, height - 40, 200, 30);
    ctx.fillStyle = '#fff';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Mode: ${this.mode}`, 20, height - 20);
  }
  
  private renderPattern(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // Checkerboard pattern
    const size = 50;
    
    for (let x = 0; x < width; x += size) {
      for (let y = 0; y < height; y += size) {
        const isWhite = ((x / size) + (y / size)) % 2 === 0;
        ctx.fillStyle = isWhite ? '#fff' : '#000';
        ctx.fillRect(x, y, size, size);
      }
    }
  }
  
  private renderGradient(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // RGB gradient
    for (let x = 0; x < width; x++) {
      const hue = (x / width) * 360;
      ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
      ctx.fillRect(x, 0, 1, height);
    }
  }
  
  private renderSpectrum(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // Visible spectrum approximation
    for (let x = 0; x < width; x++) {
      const wavelength = 380 + (x / width) * (700 - 380);
      const [r, g, b] = this.wavelengthToRGB(wavelength);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, 0, 1, height);
    }
  }
  
  private renderShapes(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    // Background
    ctx.fillStyle = '#e5e5e5';
    ctx.fillRect(0, 0, width, height);
    
    // Square
    ctx.fillStyle = 'rgba(0, 100, 200, 0.7)';
    ctx.fillRect(100, 200, 200, 200);
    
    // Circle
    ctx.fillStyle = 'rgba(200, 0, 100, 0.7)';
    ctx.beginPath();
    ctx.arc(500, 300, 100, 0, Math.PI * 2);
    ctx.fill();
    
    // Triangle
    ctx.fillStyle = 'rgba(200, 200, 0, 0.7)';
    ctx.beginPath();
    ctx.moveTo(800, 200);
    ctx.lineTo(900, 400);
    ctx.lineTo(700, 400);
    ctx.closePath();
    ctx.fill();
  }
  
  private wavelengthToRGB(wavelength: number): [number, number, number] {
    let r = 0, g = 0, b = 0;
    
    if (wavelength >= 380 && wavelength < 440) {
      r = -(wavelength - 440) / (440 - 380);
      g = 0;
      b = 1;
    } else if (wavelength >= 440 && wavelength < 490) {
      r = 0;
      g = (wavelength - 440) / (490 - 440);
      b = 1;
    } else if (wavelength >= 490 && wavelength < 510) {
      r = 0;
      g = 1;
      b = -(wavelength - 510) / (510 - 490);
    } else if (wavelength >= 510 && wavelength < 580) {
      r = (wavelength - 510) / (580 - 510);
      g = 1;
      b = 0;
    } else if (wavelength >= 580 && wavelength < 645) {
      r = 1;
      g = -(wavelength - 645) / (645 - 580);
      b = 0;
    } else if (wavelength >= 645 && wavelength <= 700) {
      r = 1;
      g = 0;
      b = 0;
    }
    
    return [
      Math.round(r * 255),
      Math.round(g * 255),
      Math.round(b * 255),
    ];
  }
}


