/**
 * Toggle Button Component
 * 
 * Simple on/off toggle button.
 */

export interface ToggleOptions {
  /** Initial state */
  enabled: boolean;
  /** Label when on */
  labelOn: string;
  /** Label when off */
  labelOff: string;
  /** Callback when toggled */
  onToggle?: (enabled: boolean) => void;
}

/**
 * ToggleButton class
 */
export class ToggleButton {
  private button: HTMLElement;
  private enabled: boolean;
  private options: Required<ToggleOptions>;
  
  constructor(parent: HTMLElement, options: ToggleOptions) {
    this.options = {
      enabled: options.enabled,
      labelOn: options.labelOn,
      labelOff: options.labelOff,
      onToggle: options.onToggle ?? (() => {}),
    };
    
    this.enabled = this.options.enabled;
    
    // Create button
    this.button = document.createElement('button');
    this.button.style.cssText = `
      padding: 8px 16px;
      font-size: 14px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      margin: 4px;
      transition: background 0.2s;
    `;
    
    this.updateAppearance();
    
    this.button.addEventListener('click', () => {
      this.toggle();
    });
    
    parent.appendChild(this.button);
  }
  
  /**
   * Get current state
   */
  isEnabled(): boolean {
    return this.enabled;
  }
  
  /**
   * Set state programmatically
   */
  setEnabled(enabled: boolean, notify: boolean = true): void {
    this.enabled = enabled;
    this.updateAppearance();
    
    if (notify) {
      this.options.onToggle(this.enabled);
    }
  }
  
  /**
   * Toggle state
   */
  toggle(): void {
    this.setEnabled(!this.enabled);
  }
  
  /**
   * Destroy the component
   */
  destroy(): void {
    this.button.remove();
  }
  
  /**
   * Update button appearance
   */
  private updateAppearance(): void {
    this.button.textContent = this.enabled
      ? this.options.labelOn
      : this.options.labelOff;
    
    this.button.style.background = this.enabled ? '#4a90e2' : '#666';
    this.button.style.color = this.enabled ? '#fff' : '#ccc';
  }
}


