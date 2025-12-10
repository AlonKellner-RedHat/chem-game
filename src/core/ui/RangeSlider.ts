/**
 * Range Slider Component
 * 
 * A double-handled slider for selecting a range (min/max values).
 * Used for zoom/pan controls like wavelength range selection.
 */

export interface RangeSliderOptions {
  /** Absolute minimum value */
  min: number;
  /** Absolute maximum value */
  max: number;
  /** Initial range start */
  valueMin: number;
  /** Initial range end */
  valueMax: number;
  /** Minimum allowed range size (prevents handles from overlapping) */
  minRange?: number;
  /** Width in pixels */
  width?: number;
  /** Label text */
  label?: string;
  /** Format function for value display */
  formatValue?: (value: number) => string;
  /** Callback when range changes */
  onChange?: (min: number, max: number) => void;
}

/**
 * RangeSlider class
 */
export class RangeSlider {
  private container: HTMLElement;
  private track: HTMLElement;
  private handleMin: HTMLElement;
  private handleMax: HTMLElement;
  private rangeBar: HTMLElement;
  private valueDisplay: HTMLElement;
  
  private options: Required<RangeSliderOptions>;
  private valueMin: number;
  private valueMax: number;
  private dragging: 'min' | 'max' | null = null;
  
  constructor(parent: HTMLElement, options: RangeSliderOptions) {
    this.options = {
      min: options.min,
      max: options.max,
      valueMin: options.valueMin,
      valueMax: options.valueMax,
      minRange: options.minRange ?? (options.max - options.min) * 0.05,
      width: options.width ?? 200,
      label: options.label ?? '',
      formatValue: options.formatValue ?? ((v) => v.toFixed(0)),
      onChange: options.onChange ?? (() => {}),
    };
    
    this.valueMin = this.options.valueMin;
    this.valueMax = this.options.valueMax;
    
    // Create container
    this.container = document.createElement('div');
    this.container.style.cssText = `
      display: flex;
      flex-direction: column;
      margin: 8px 0;
      user-select: none;
    `;
    
    // Create label row
    const labelRow = document.createElement('div');
    labelRow.style.cssText = `
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
      font-size: 12px;
      color: #ccc;
    `;
    
    const labelElement = document.createElement('span');
    labelElement.textContent = this.options.label;
    
    this.valueDisplay = document.createElement('span');
    this.updateValueDisplay();
    
    labelRow.appendChild(labelElement);
    labelRow.appendChild(this.valueDisplay);
    this.container.appendChild(labelRow);
    
    // Create track
    this.track = document.createElement('div');
    this.track.style.cssText = `
      width: ${this.options.width}px;
      height: 8px;
      background: #333;
      border-radius: 4px;
      position: relative;
      cursor: pointer;
    `;
    
    // Create range bar (highlighted area between handles)
    this.rangeBar = document.createElement('div');
    this.rangeBar.style.cssText = `
      position: absolute;
      height: 100%;
      background: #4a90e2;
      border-radius: 4px;
      pointer-events: none;
    `;
    this.track.appendChild(this.rangeBar);
    
    // Create min handle
    this.handleMin = document.createElement('div');
    this.handleMin.style.cssText = `
      width: 14px;
      height: 14px;
      background: #fff;
      border: 2px solid #4a90e2;
      border-radius: 50%;
      position: absolute;
      top: -3px;
      cursor: grab;
      transform: translateX(-50%);
      z-index: 2;
    `;
    this.track.appendChild(this.handleMin);
    
    // Create max handle
    this.handleMax = document.createElement('div');
    this.handleMax.style.cssText = `
      width: 14px;
      height: 14px;
      background: #fff;
      border: 2px solid #4a90e2;
      border-radius: 50%;
      position: absolute;
      top: -3px;
      cursor: grab;
      transform: translateX(-50%);
      z-index: 2;
    `;
    this.track.appendChild(this.handleMax);
    
    this.container.appendChild(this.track);
    parent.appendChild(this.container);
    
    // Update positions
    this.updateHandles();
    
    // Setup events
    this.setupEvents();
  }
  
  /**
   * Get current range
   */
  getRange(): { min: number; max: number } {
    return { min: this.valueMin, max: this.valueMax };
  }
  
  /**
   * Set range programmatically
   */
  setRange(min: number, max: number, notify: boolean = true): void {
    this.valueMin = Math.max(this.options.min, Math.min(this.options.max - this.options.minRange, min));
    this.valueMax = Math.max(this.valueMin + this.options.minRange, Math.min(this.options.max, max));
    this.updateHandles();
    
    if (notify) {
      this.options.onChange(this.valueMin, this.valueMax);
    }
  }
  
  /**
   * Reset to full range
   */
  reset(): void {
    this.setRange(this.options.min, this.options.max);
  }
  
  /**
   * Destroy the component
   */
  destroy(): void {
    this.container.remove();
  }
  
  /**
   * Update value display
   */
  private updateValueDisplay(): void {
    const minStr = this.options.formatValue(this.valueMin);
    const maxStr = this.options.formatValue(this.valueMax);
    this.valueDisplay.textContent = `${minStr} - ${maxStr}`;
  }
  
  /**
   * Update handle positions
   */
  private updateHandles(): void {
    const range = this.options.max - this.options.min;
    const minPos = ((this.valueMin - this.options.min) / range) * 100;
    const maxPos = ((this.valueMax - this.options.min) / range) * 100;
    
    this.handleMin.style.left = `${minPos}%`;
    this.handleMax.style.left = `${maxPos}%`;
    
    // Update range bar
    this.rangeBar.style.left = `${minPos}%`;
    this.rangeBar.style.width = `${maxPos - minPos}%`;
    
    this.updateValueDisplay();
  }
  
  /**
   * Convert position (0-1) to value
   */
  private positionToValue(position: number): number {
    return this.options.min + position * (this.options.max - this.options.min);
  }
  
  /**
   * Setup mouse events
   */
  private setupEvents(): void {
    const handleMove = (e: MouseEvent) => {
      if (!this.dragging) return;
      
      const rect = this.track.getBoundingClientRect();
      const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const value = this.positionToValue(position);
      
      if (this.dragging === 'min') {
        this.valueMin = Math.max(
          this.options.min,
          Math.min(this.valueMax - this.options.minRange, value)
        );
      } else {
        this.valueMax = Math.max(
          this.valueMin + this.options.minRange,
          Math.min(this.options.max, value)
        );
      }
      
      this.updateHandles();
      this.options.onChange(this.valueMin, this.valueMax);
    };
    
    const handleUp = () => {
      this.dragging = null;
      this.handleMin.style.cursor = 'grab';
      this.handleMax.style.cursor = 'grab';
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    
    const startDrag = (handle: 'min' | 'max') => (e: MouseEvent) => {
      e.preventDefault();
      this.dragging = handle;
      const handleEl = handle === 'min' ? this.handleMin : this.handleMax;
      handleEl.style.cursor = 'grabbing';
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
    };
    
    this.handleMin.addEventListener('mousedown', startDrag('min'));
    this.handleMax.addEventListener('mousedown', startDrag('max'));
    
    // Click on track to move nearest handle
    this.track.addEventListener('click', (e) => {
      if (this.dragging) return;
      
      const rect = this.track.getBoundingClientRect();
      const position = (e.clientX - rect.left) / rect.width;
      const value = this.positionToValue(position);
      
      // Move the nearest handle
      const distToMin = Math.abs(value - this.valueMin);
      const distToMax = Math.abs(value - this.valueMax);
      
      if (distToMin < distToMax) {
        this.valueMin = Math.max(
          this.options.min,
          Math.min(this.valueMax - this.options.minRange, value)
        );
      } else {
        this.valueMax = Math.max(
          this.valueMin + this.options.minRange,
          Math.min(this.options.max, value)
        );
      }
      
      this.updateHandles();
      this.options.onChange(this.valueMin, this.valueMax);
    });
  }
}

