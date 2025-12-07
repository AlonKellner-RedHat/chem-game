/**
 * Menu Scene
 * 
 * Demo selection overlay.
 */

import { Demo } from '../core/demos/Demo';
import { GameScene } from './GameScene';

// Base design dimensions
const BASE_WIDTH = 1280;
const BASE_HEIGHT = 720;

/**
 * Menu item
 */
interface MenuItem {
  demo: Demo;
  element: HTMLElement;
}

/**
 * MenuScene class
 */
export class MenuScene {
  private container: HTMLElement;
  private overlay: HTMLElement | null = null;
  private scaleWrapper: HTMLElement | null = null;
  private items: MenuItem[] = [];
  private gameScene: GameScene;
  private demos: Demo[];
  private onSelect: ((demo: Demo) => void) | null = null;
  private resizeHandler: (() => void) | null = null;
  
  constructor(container: HTMLElement, gameScene: GameScene, demos: Demo[]) {
    this.container = container;
    this.gameScene = gameScene;
    this.demos = demos;
  }
  
  /**
   * Show the menu
   */
  show(onSelect?: (demo: Demo) => void): void {
    if (this.overlay) {
      return; // Already visible
    }
    
    this.onSelect = onSelect || null;
    this.createOverlay();
  }
  
  /**
   * Hide the menu
   */
  hide(): void {
    if (this.overlay) {
      if (this.resizeHandler) {
        window.removeEventListener('resize', this.resizeHandler);
        this.resizeHandler = null;
      }
      this.overlay.remove();
      this.overlay = null;
      this.scaleWrapper = null;
      this.items = [];
    }
  }
  
  /**
   * Toggle visibility
   */
  toggle(onSelect?: (demo: Demo) => void): void {
    if (this.overlay) {
      this.hide();
    } else {
      this.show(onSelect);
    }
  }
  
  /**
   * Create the overlay UI
   */
  private createOverlay(): void {
    // Create overlay container
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      overflow: hidden;
    `;
    
    // Create scaled wrapper for menu content
    this.scaleWrapper = document.createElement('div');
    this.scaleWrapper.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      transform-origin: center center;
    `;
    this.overlay.appendChild(this.scaleWrapper);
    
    // Apply initial scale
    this.updateScale();
    
    // Listen for resize
    this.resizeHandler = () => this.updateScale();
    window.addEventListener('resize', this.resizeHandler);
    
    // Title
    const title = document.createElement('h1');
    title.textContent = 'Select Demo';
    title.style.cssText = `
      color: white;
      font-family: sans-serif;
      margin-bottom: 24px;
    `;
    this.scaleWrapper.appendChild(title);
    
    // Demo buttons
    const currentDemo = this.gameScene.getCurrentDemo();
    
    for (const demo of this.demos) {
      const isCurrent = currentDemo?.name === demo.name;
      const button = this.createButton(demo, isCurrent);
      this.scaleWrapper.appendChild(button.element);
      this.items.push(button);
    }
    
    // Close button
    const closeButton = document.createElement('button');
    closeButton.textContent = 'Close (M)';
    closeButton.style.cssText = `
      margin-top: 24px;
      padding: 8px 16px;
      font-size: 16px;
      background: #666;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    `;
    closeButton.onclick = () => this.hide();
    this.scaleWrapper.appendChild(closeButton);
    
    // Click outside to close
    this.overlay.onclick = (e) => {
      if (e.target === this.overlay) {
        this.hide();
      }
    };
    
    this.container.appendChild(this.overlay);
  }
  
  /**
   * Update scale based on container size
   */
  private updateScale(): void {
    if (!this.scaleWrapper) return;
    
    const { width, height } = this.gameScene.getDimensions();
    const scale = Math.min(width / BASE_WIDTH, height / BASE_HEIGHT);
    this.scaleWrapper.style.transform = `scale(${scale})`;
  }
  
  /**
   * Create a demo button
   */
  private createButton(demo: Demo, isCurrent: boolean): MenuItem {
    const button = document.createElement('button');
    button.style.cssText = `
      width: 400px;
      padding: 16px;
      margin: 8px;
      font-size: 18px;
      background: ${isCurrent ? '#4a90e2' : '#333'};
      color: white;
      border: 2px solid ${isCurrent ? '#6bb3ff' : '#555'};
      border-radius: 8px;
      cursor: pointer;
      text-align: left;
    `;
    
    const title = document.createElement('div');
    title.textContent = demo.name;
    title.style.fontWeight = 'bold';
    button.appendChild(title);
    
    if (demo.description) {
      const desc = document.createElement('div');
      desc.textContent = demo.description;
      desc.style.cssText = 'font-size: 14px; color: #ccc; margin-top: 4px;';
      button.appendChild(desc);
    }
    
    button.onmouseover = () => {
      if (!isCurrent) {
        button.style.background = '#444';
      }
    };
    
    button.onmouseout = () => {
      if (!isCurrent) {
        button.style.background = '#333';
      }
    };
    
    button.onclick = () => {
      this.gameScene.loadDemo(demo);
      this.onSelect?.(demo);
      this.hide();
    };
    
    return { demo, element: button };
  }
}


