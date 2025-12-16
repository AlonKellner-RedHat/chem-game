/**
 * Slider Component
 *
 * Reusable horizontal slider with optional logarithmic scale.
 */

export interface SliderOptions {
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** Initial value */
  value: number;
  /** Use logarithmic scale */
  logarithmic?: boolean;
  /** Label text */
  label?: string;
  /** Width in pixels */
  width?: number;
  /** Callback when value changes */
  onChange?: (value: number) => void;
  /** Custom value formatter for display */
  formatValue?: (value: number) => string;
}

/**
 * Convert linear position (0-1) to value
 * For logarithmic mode, uses log(x+1) style to allow 0 at leftmost position
 */
function positionToValue(position: number, min: number, max: number, logarithmic: boolean): number {
  if (logarithmic) {
    // Use log(x+1) style: position 0 = min, position 1 = max
    // Maps [0,1] -> [min, max] with logarithmic feel
    // At position 0: returns min (which can be 0)
    // At position 1: returns max
    const range = max - min;
    // Use exponential curve: value = min + range * (e^(k*position) - 1) / (e^k - 1)
    // where k controls the curve steepness (higher = more logarithmic feel)
    const k = 4; // Steepness factor
    const expPos = (Math.exp(k * position) - 1) / (Math.exp(k) - 1);
    return min + range * expPos;
  }
  return min + position * (max - min);
}

/**
 * Convert value to linear position (0-1)
 */
function valueToPosition(value: number, min: number, max: number, logarithmic: boolean): number {
  if (logarithmic) {
    // Inverse of the exponential mapping
    const range = max - min;
    if (range === 0) return 0;
    const normalizedValue = (value - min) / range;
    const k = 4;
    // Inverse: position = log(1 + normalizedValue * (e^k - 1)) / k
    const expK = Math.exp(k) - 1;
    return Math.log(1 + normalizedValue * expK) / k;
  }
  return (value - min) / (max - min);
}

/**
 * SliderComponent class
 */
export class SliderComponent {
  private container: HTMLElement;
  private track: HTMLElement;
  private handle: HTMLElement;
  private valueDisplay: HTMLElement;
  private labelElement: HTMLElement | null = null;

  private options: Required<SliderOptions>;
  private value: number;
  private isDragging = false;

  constructor(parent: HTMLElement, options: SliderOptions) {
    this.options = {
      min: options.min,
      max: options.max,
      value: options.value,
      logarithmic: options.logarithmic ?? false,
      label: options.label ?? '',
      width: options.width ?? 200,
      onChange: options.onChange ?? (() => {}),
      formatValue: options.formatValue,
    } as Required<SliderOptions>;

    this.value = this.options.value;

    // Create container
    this.container = document.createElement('div');
    this.container.style.cssText = `
      display: flex;
      flex-direction: column;
      margin: 8px 0;
      user-select: none;
    `;

    // Create label row
    if (this.options.label) {
      const labelRow = document.createElement('div');
      labelRow.style.cssText = `
        display: flex;
        justify-content: space-between;
        margin-bottom: 4px;
        font-size: 12px;
        color: #ccc;
      `;

      this.labelElement = document.createElement('span');
      this.labelElement.textContent = this.options.label;

      this.valueDisplay = document.createElement('span');
      this.valueDisplay.textContent = this.formatValue(this.value);

      labelRow.appendChild(this.labelElement);
      labelRow.appendChild(this.valueDisplay);
      this.container.appendChild(labelRow);
    } else {
      this.valueDisplay = document.createElement('span');
    }

    // Create track
    this.track = document.createElement('div');
    this.track.style.cssText = `
      width: ${this.options.width}px;
      height: 8px;
      background: #444;
      border-radius: 4px;
      position: relative;
      cursor: pointer;
    `;

    // Create handle
    this.handle = document.createElement('div');
    this.handle.style.cssText = `
      width: 16px;
      height: 16px;
      background: #4a90e2;
      border-radius: 50%;
      position: absolute;
      top: -4px;
      cursor: grab;
      transform: translateX(-50%);
    `;

    this.track.appendChild(this.handle);
    this.container.appendChild(this.track);
    parent.appendChild(this.container);

    // Update handle position
    this.updateHandle();

    // Setup events
    this.setupEvents();
  }

  /**
   * Get current value
   */
  getValue(): number {
    return this.value;
  }

  /**
   * Set value programmatically
   */
  setValue(value: number, notify = true): void {
    this.value = Math.max(this.options.min, Math.min(this.options.max, value));
    this.updateHandle();

    if (notify) {
      this.options.onChange(this.value);
    }
  }

  /**
   * Update label
   */
  setLabel(label: string): void {
    if (this.labelElement) {
      this.labelElement.textContent = label;
    }
  }

  /**
   * Destroy the component
   */
  destroy(): void {
    this.container.remove();
  }

  /**
   * Format value for display
   */
  private formatValue(value: number): string {
    // Use custom formatter if provided
    if (this.options.formatValue) {
      return this.options.formatValue(value);
    }
    // Default formatting
    if (this.options.logarithmic) {
      if (value < 0.01) {
        return value.toExponential(1);
      }
      return value.toFixed(3);
    }
    return value.toFixed(1);
  }

  /**
   * Update handle position
   */
  private updateHandle(): void {
    const position = valueToPosition(
      this.value,
      this.options.min,
      this.options.max,
      this.options.logarithmic
    );

    this.handle.style.left = `${position * 100}%`;
    this.valueDisplay.textContent = this.formatValue(this.value);
  }

  /**
   * Setup mouse events
   */
  private setupEvents(): void {
    const handleMove = (e: MouseEvent) => {
      if (!this.isDragging) return;

      const rect = this.track.getBoundingClientRect();
      const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

      this.value = positionToValue(
        position,
        this.options.min,
        this.options.max,
        this.options.logarithmic
      );

      this.updateHandle();
      this.options.onChange(this.value);
    };

    const handleUp = () => {
      this.isDragging = false;
      this.handle.style.cursor = 'grab';
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };

    this.handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.isDragging = true;
      this.handle.style.cursor = 'grabbing';
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
    });

    this.track.addEventListener('click', (e) => {
      const rect = this.track.getBoundingClientRect();
      const position = (e.clientX - rect.left) / rect.width;

      this.value = positionToValue(
        position,
        this.options.min,
        this.options.max,
        this.options.logarithmic
      );

      this.updateHandle();
      this.options.onChange(this.value);
    });
  }
}
