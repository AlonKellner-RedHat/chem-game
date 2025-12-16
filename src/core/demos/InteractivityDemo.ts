/**
 * Interactivity Demo
 *
 * Demonstrates object placement and connection systems.
 */

import type { GameScene } from '../../scenes/GameScene';
import type { Demo } from './Demo';

interface DemoObject {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  shape: 'square' | 'circle' | 'triangle' | 'rectangle';
}

// Base design dimensions
const BASE_WIDTH = 1280;
const BASE_HEIGHT = 720;

export class InteractivityDemo implements Demo {
  readonly name = 'Interactivity';
  readonly description = 'Object placement and connection systems';

  private objects: DemoObject[] = [];
  private selectedObject: DemoObject | null = null;
  private baseGridSize = 50;

  initialize(scene: GameScene): void {
    console.log('[InteractivityDemo] Initialized');

    // Create demo objects
    this.objects = [
      { id: 'greenSquare', x: 5, y: 5, width: 1, height: 1, color: '#22c55e', shape: 'square' },
      { id: 'magentaSquare', x: 6, y: 5, width: 1, height: 1, color: '#ec4899', shape: 'square' },
      { id: 'redCircle', x: 7, y: 5, width: 1, height: 1, color: '#ef4444', shape: 'circle' },
      { id: 'blueTriangle', x: 9, y: 5, width: 1, height: 1, color: '#3b82f6', shape: 'triangle' },
      { id: 'yellowRect', x: 5, y: 8, width: 2, height: 1, color: '#eab308', shape: 'rectangle' },
      { id: 'blackSquare', x: 7, y: 8, width: 2, height: 2, color: '#1a1a1a', shape: 'square' },
    ];

    // Setup mouse interaction
    const canvas = scene.getCanvas();

    canvas.addEventListener('mousedown', (e) => this.onMouseDown(e, scene));
    canvas.addEventListener('mousemove', (e) => this.onMouseMove(e, scene));
    canvas.addEventListener('mouseup', () => this.onMouseUp(scene));

    this.render(scene);
  }

  update(scene: GameScene): void {
    this.render(scene);
  }

  cleanup(scene: GameScene): void {
    console.log('[InteractivityDemo] Cleaned up');
    this.objects = [];
    this.selectedObject = null;
  }

  resize(scene: GameScene, width: number, height: number): void {
    // Re-render on resize
    this.render(scene);
  }

  private getScale(scene: GameScene): number {
    const { width } = scene.getDimensions();
    return width / BASE_WIDTH;
  }

  private getScaledGridSize(scene: GameScene): number {
    return this.baseGridSize * this.getScale(scene);
  }

  private onMouseDown(e: MouseEvent, scene: GameScene): void {
    const canvas = scene.getCanvas();
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const gridSize = this.getScaledGridSize(scene);

    // Find clicked object
    for (const obj of this.objects) {
      const objX = obj.x * gridSize;
      const objY = obj.y * gridSize;
      const objW = obj.width * gridSize;
      const objH = obj.height * gridSize;

      if (x >= objX && x < objX + objW && y >= objY && y < objY + objH) {
        this.selectedObject = obj;
        return;
      }
    }
  }

  private onMouseMove(e: MouseEvent, scene: GameScene): void {
    if (!this.selectedObject) return;

    const canvas = scene.getCanvas();
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const gridSize = this.getScaledGridSize(scene);

    // Snap to grid
    this.selectedObject.x = Math.floor(x / gridSize);
    this.selectedObject.y = Math.floor(y / gridSize);
  }

  private onMouseUp(scene: GameScene): void {
    this.selectedObject = null;
  }

  private render(scene: GameScene): void {
    const ctx = scene.getContext();
    const { width, height } = scene.getDimensions();
    const scale = this.getScale(scene);
    const gridSize = this.getScaledGridSize(scene);

    // Clear
    ctx.fillStyle = '#e5e5e5';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;

    for (let x = 0; x <= width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    for (let y = 0; y <= height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw objects
    for (const obj of this.objects) {
      const x = obj.x * gridSize;
      const y = obj.y * gridSize;
      const w = obj.width * gridSize;
      const h = obj.height * gridSize;
      const padding = 2 * scale;

      ctx.fillStyle = obj.color;

      if (obj.shape === 'circle') {
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, w / 2 - padding, h / 2 - padding, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (obj.shape === 'triangle') {
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y + padding);
        ctx.lineTo(x + w - padding, y + h - padding);
        ctx.lineTo(x + padding, y + h - padding);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(x + padding, y + padding, w - padding * 2, h - padding * 2);
      }

      // Selection highlight
      if (obj === this.selectedObject) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3 * scale;
        ctx.strokeRect(x + scale, y + scale, w - scale * 2, h - scale * 2);
      }
    }

    // Instructions (scaled)
    const boxWidth = 300 * scale;
    const boxHeight = 30 * scale;
    const fontSize = 14 * scale;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10 * scale, height - 40 * scale, boxWidth, boxHeight);
    ctx.fillStyle = '#fff';
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText('Click and drag objects to move them', 20 * scale, height - 20 * scale);
  }
}
