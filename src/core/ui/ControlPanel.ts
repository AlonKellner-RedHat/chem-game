/**
 * Control Panel Component
 *
 * Container for multiple sliders and controls.
 */

import { SliderComponent, type SliderOptions } from './SliderComponent';

export interface ControlPanelOptions {
  /** Panel title */
  title: string;
  /** Width in pixels */
  width?: number;
  /** Background color */
  background?: string;
}

export interface ControlPanelSlider {
  id: string;
  options: SliderOptions;
}

/**
 * ControlPanel class
 */
export class ControlPanel {
  private container: HTMLElement;
  private contentArea: HTMLElement;
  private sliders: Map<string, SliderComponent> = new Map();
  private options: Required<ControlPanelOptions>;

  constructor(parent: HTMLElement, options: ControlPanelOptions) {
    this.options = {
      title: options.title,
      width: options.width ?? 250,
      background: options.background ?? 'rgba(0, 0, 0, 0.75)',
    };

    // Create container
    this.container = document.createElement('div');
    this.container.style.cssText = `
      background: ${this.options.background};
      border-radius: 8px;
      padding: 12px;
      width: ${this.options.width}px;
      font-family: sans-serif;
    `;

    // Title
    const title = document.createElement('div');
    title.textContent = this.options.title;
    title.style.cssText = `
      color: #fff;
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid #444;
    `;
    this.container.appendChild(title);

    // Content area
    this.contentArea = document.createElement('div');
    this.container.appendChild(this.contentArea);

    parent.appendChild(this.container);
  }

  /**
   * Add a slider to the panel
   */
  addSlider(id: string, options: SliderOptions): SliderComponent {
    const slider = new SliderComponent(this.contentArea, {
      ...options,
      width: this.options.width - 24, // Account for padding
    });

    this.sliders.set(id, slider);
    return slider;
  }

  /**
   * Get a slider by id
   */
  getSlider(id: string): SliderComponent | undefined {
    return this.sliders.get(id);
  }

  /**
   * Set a slider value by id
   */
  setSliderValue(id: string, value: number, notify = false): void {
    const slider = this.sliders.get(id);
    if (slider) {
      slider.setValue(value, notify);
    }
  }

  /**
   * Add a custom element
   */
  addElement(element: HTMLElement): void {
    this.contentArea.appendChild(element);
  }

  /**
   * Set panel visibility
   */
  setVisible(visible: boolean): void {
    this.container.style.display = visible ? 'block' : 'none';
  }

  /**
   * Destroy the panel
   */
  destroy(): void {
    for (const slider of this.sliders.values()) {
      slider.destroy();
    }
    this.sliders.clear();
    this.container.remove();
  }
}
