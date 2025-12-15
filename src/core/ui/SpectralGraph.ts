/**
 * Spectral Graph Component
 * 
 * Displays a spectrum as a line graph with rainbow color band.
 * Includes zoom/pan controls via a range slider.
 */

import { RangeSlider } from './RangeSlider';

export interface SpectralGraphOptions {
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Minimum wavelength (nm) - data range */
  wavelengthMin: number;
  /** Maximum wavelength (nm) - data range */
  wavelengthMax: number;
  /** Show rainbow color band */
  showRainbow?: boolean;
  /** Title */
  title?: string;
  /** Enable zoom/pan slider */
  enableZoom?: boolean;
  /** Enable magnitude (Y-axis scale) slider */
  enableMagnitude?: boolean;
}

/**
 * Convert wavelength to approximate RGB color
 */
function wavelengthToRGB(wavelength: number): [number, number, number] {
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
  
  // Intensity correction at edges
  let intensity = 1;
  if (wavelength >= 380 && wavelength < 420) {
    intensity = 0.3 + 0.7 * (wavelength - 380) / (420 - 380);
  } else if (wavelength > 700 && wavelength <= 780) {
    intensity = 0.3 + 0.7 * (780 - wavelength) / (780 - 700);
  } else if (wavelength > 780 || wavelength < 380) {
    intensity = 0;
  }
  
  return [
    Math.round(r * intensity * 255),
    Math.round(g * intensity * 255),
    Math.round(b * intensity * 255),
  ];
}

/**
 * SpectralGraph class
 */
export class SpectralGraph {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private options: Required<SpectralGraphOptions>;
  private rangeSlider: RangeSlider | null = null;
  private magnitudeSlider: HTMLInputElement | null = null;
  private magnitudeDisplay: HTMLSpanElement | null = null;
  
  private spectrum: Float32Array | null = null;
  private isLocked = false;
  private lockedX: number | null = null;
  private lockedY: number | null = null;
  
  // View range (what's currently displayed, can be different from data range)
  private viewMin: number;
  private viewMax: number;
  
  // Global max for normalization (from renderer)
  private globalMax: number | null = null;
  
  // Magnitude multiplier for Y-axis scaling (logarithmic: 0.1x to 100x)
  private magnitudeMultiplier: number = 1.0;
  
  constructor(parent: HTMLElement, options: SpectralGraphOptions) {
    this.options = {
      width: options.width,
      height: options.height,
      wavelengthMin: options.wavelengthMin,
      wavelengthMax: options.wavelengthMax,
      showRainbow: options.showRainbow ?? true,
      title: options.title ?? 'Spectrum',
      enableZoom: options.enableZoom ?? true,
      enableMagnitude: options.enableMagnitude ?? true,
    };
    
    // Initialize view range to full data range
    this.viewMin = this.options.wavelengthMin;
    this.viewMax = this.options.wavelengthMax;
    
    // Create container
    this.container = document.createElement('div');
    this.container.style.cssText = `
      background: rgba(0, 0, 0, 0.8);
      border-radius: 8px;
      padding: 8px;
    `;
    
    // Title
    const title = document.createElement('div');
    title.textContent = this.options.title;
    title.style.cssText = `
      color: #fff;
      font-size: 14px;
      font-weight: bold;
      margin-bottom: 4px;
    `;
    this.container.appendChild(title);
    
    // Create canvas row (magnitude slider + canvas)
    const canvasRow = document.createElement('div');
    canvasRow.style.cssText = 'display: flex; align-items: stretch;';
    
    // Add vertical magnitude slider on the left if enabled
    if (this.options.enableMagnitude) {
      const magContainer = document.createElement('div');
      magContainer.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding-right: 4px;
        width: 24px;
      `;
      
      // Magnitude display at top
      this.magnitudeDisplay = document.createElement('span');
      this.magnitudeDisplay.textContent = '1×';
      this.magnitudeDisplay.style.cssText = 'color: #fff; font-size: 9px; margin-bottom: 2px;';
      magContainer.appendChild(this.magnitudeDisplay);
      
      // Vertical slider (rotated)
      // Logarithmic slider: -2 to 4 maps to 0.01x to 10,000x
      this.magnitudeSlider = document.createElement('input');
      this.magnitudeSlider.type = 'range';
      this.magnitudeSlider.min = '-2';
      this.magnitudeSlider.max = '4';
      this.magnitudeSlider.step = '0.1';
      this.magnitudeSlider.value = '0'; // 10^0 = 1x
      this.magnitudeSlider.style.cssText = `
        writing-mode: vertical-lr;
        direction: rtl;
        height: ${this.options.height - 20}px;
        width: 16px;
        cursor: pointer;
        accent-color: #4a90e2;
        margin: 0;
      `;
      
      this.magnitudeSlider.addEventListener('input', () => {
        const logValue = parseFloat(this.magnitudeSlider!.value);
        this.magnitudeMultiplier = Math.pow(10, logValue);
        this.updateMagnitudeDisplay();
        this.render();
      });
      
      magContainer.appendChild(this.magnitudeSlider);
      canvasRow.appendChild(magContainer);
    }
    
    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.options.width;
    this.canvas.height = this.options.height;
    this.canvas.style.display = 'block';
    
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }
    this.ctx = ctx;
    
    canvasRow.appendChild(this.canvas);
    this.container.appendChild(canvasRow);
    
    // Add range slider for zoom/pan if enabled
    if (this.options.enableZoom) {
      const sliderContainer = document.createElement('div');
      sliderContainer.style.cssText = 'margin-top: 4px;';
      this.container.appendChild(sliderContainer);
      
      this.rangeSlider = new RangeSlider(sliderContainer, {
        min: this.options.wavelengthMin,
        max: this.options.wavelengthMax,
        valueMin: this.options.wavelengthMin,
        valueMax: this.options.wavelengthMax,
        minRange: 8, // Minimum 8nm range (1% of 800nm) for fine spectral features
        width: this.options.width - 16,
        label: 'Wavelength Range (nm)',
        formatValue: (v) => `${Math.round(v)}`,
        onChange: (min, max) => {
          this.viewMin = min;
          this.viewMax = max;
          this.render();
        },
      });
    }
    
    // Add control buttons
    const buttonRow = document.createElement('div');
    buttonRow.style.cssText = `
      display: flex;
      gap: 8px;
      margin-top: 6px;
    `;
    
    const buttonStyle = `
      padding: 4px 10px;
      font-size: 11px;
      background: #333;
      color: #ccc;
      border: 1px solid #555;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.15s;
    `;
    
    // "Zoom Visible" button - sets wavelength range to visible spectrum
    const zoomVisibleBtn = document.createElement('button');
    zoomVisibleBtn.textContent = 'Zoom Visible';
    zoomVisibleBtn.style.cssText = buttonStyle;
    zoomVisibleBtn.addEventListener('mouseenter', () => {
      zoomVisibleBtn.style.background = '#444';
    });
    zoomVisibleBtn.addEventListener('mouseleave', () => {
      zoomVisibleBtn.style.background = '#333';
    });
    zoomVisibleBtn.addEventListener('click', () => {
      this.zoomToVisible();
    });
    buttonRow.appendChild(zoomVisibleBtn);
    
    // "Normalize" button - adjusts magnitude to fit max value in view
    const normalizeBtn = document.createElement('button');
    normalizeBtn.textContent = 'Normalize';
    normalizeBtn.style.cssText = buttonStyle;
    normalizeBtn.addEventListener('mouseenter', () => {
      normalizeBtn.style.background = '#444';
    });
    normalizeBtn.addEventListener('mouseleave', () => {
      normalizeBtn.style.background = '#333';
    });
    normalizeBtn.addEventListener('click', () => {
      this.normalizeToView();
    });
    buttonRow.appendChild(normalizeBtn);
    
    // "Reset" button - resets wavelength range and magnitude to defaults
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset';
    resetBtn.style.cssText = buttonStyle;
    resetBtn.addEventListener('mouseenter', () => {
      resetBtn.style.background = '#444';
    });
    resetBtn.addEventListener('mouseleave', () => {
      resetBtn.style.background = '#333';
    });
    resetBtn.addEventListener('click', () => {
      this.resetAll();
    });
    buttonRow.appendChild(resetBtn);
    
    this.container.appendChild(buttonRow);
    
    parent.appendChild(this.container);
    
    // Initial render
    this.render();
  }
  
  /**
   * Update spectrum data
   */
  setSpectrum(spectrum: Float32Array): void {
    this.spectrum = spectrum;
    this.render();
  }
  
  /**
   * Set the data wavelength range (updates slider bounds)
   */
  setRange(min: number, max: number): void {
    this.options.wavelengthMin = min;
    this.options.wavelengthMax = max;
    this.viewMin = min;
    this.viewMax = max;
    
    if (this.rangeSlider) {
      this.rangeSlider.setRange(min, max, false);
    }
    
    this.render();
  }
  
  /**
   * Set the view range (zoom level)
   */
  setViewRange(min: number, max: number): void {
    this.viewMin = Math.max(this.options.wavelengthMin, min);
    this.viewMax = Math.min(this.options.wavelengthMax, max);
    
    if (this.rangeSlider) {
      this.rangeSlider.setRange(this.viewMin, this.viewMax, false);
    }
    
    this.render();
  }
  
  /**
   * Reset zoom to full range
   */
  resetZoom(): void {
    this.viewMin = this.options.wavelengthMin;
    this.viewMax = this.options.wavelengthMax;
    
    if (this.rangeSlider) {
      this.rangeSlider.reset();
    }
    
    this.render();
  }
  
  /**
   * Reset all controls to initial values (wavelength range and magnitude)
   */
  resetAll(): void {
    // Reset wavelength range to full data range
    this.viewMin = this.options.wavelengthMin;
    this.viewMax = this.options.wavelengthMax;
    
    if (this.rangeSlider) {
      this.rangeSlider.reset();
    }
    
    // Reset magnitude to 1x
    this.magnitudeMultiplier = 1.0;
    if (this.magnitudeSlider) {
      this.magnitudeSlider.value = '0'; // 10^0 = 1x
    }
    this.updateMagnitudeDisplay();
    
    this.render();
  }
  
  /**
   * Zoom to visible spectrum range (380-700nm)
   */
  zoomToVisible(): void {
    const visMin = Math.max(380, this.options.wavelengthMin);
    const visMax = Math.min(700, this.options.wavelengthMax);
    
    this.viewMin = visMin;
    this.viewMax = visMax;
    
    if (this.rangeSlider) {
      this.rangeSlider.setRange(visMin, visMax, true);
    }
    
    this.render();
  }
  
  /**
   * Normalize magnitude so the max value in current view fills the plot
   */
  normalizeToView(): void {
    if (!this.spectrum || this.spectrum.length === 0) {
      return;
    }
    
    const { wavelengthMin, wavelengthMax } = this.options;
    const dataStep = (wavelengthMax - wavelengthMin) / (this.spectrum.length - 1);
    
    // Find max value in current view range
    let maxVal = 0;
    for (let i = 0; i < this.spectrum.length; i++) {
      const wavelength = wavelengthMin + i * dataStep;
      if (wavelength >= this.viewMin && wavelength <= this.viewMax) {
        maxVal = Math.max(maxVal, this.spectrum[i]);
      }
    }
    
    if (maxVal <= 0) {
      return; // No data to normalize
    }
    
    // Calculate the normalization factor
    // If using globalMax, we need to account for that
    const normFactor = this.globalMax !== null && this.globalMax > 0 
      ? this.globalMax 
      : maxVal;
    
    // Calculate multiplier needed to make maxVal reach the top (with small margin)
    const targetHeight = 0.95; // 95% of graph height
    const newMultiplier = (targetHeight / (maxVal / normFactor));
    
    // Clamp to valid range and set
    this.setMagnitude(newMultiplier);
  }
  
  /**
   * Set locked position indicator
   */
  setLockedPosition(x: number | null, y: number | null): void {
    this.lockedX = x;
    this.lockedY = y;
    this.isLocked = x !== null && y !== null;
    this.render();
  }
  
  /**
   * Set global max for normalization
   * When set, the plot will normalize to this value with 10% top margin
   * (global max appears at 90% of plot height)
   */
  setGlobalMax(max: number | null): void {
    this.globalMax = max;
    this.render();
  }
  
  /**
   * Set magnitude multiplier programmatically
   */
  setMagnitude(multiplier: number): void {
    this.magnitudeMultiplier = Math.max(0.01, Math.min(10000, multiplier));
    if (this.magnitudeSlider) {
      this.magnitudeSlider.value = Math.log10(this.magnitudeMultiplier).toString();
    }
    this.updateMagnitudeDisplay();
    this.render();
  }
  
  /**
   * Update the magnitude display text
   */
  private updateMagnitudeDisplay(): void {
    if (this.magnitudeDisplay) {
      if (this.magnitudeMultiplier >= 1000) {
        this.magnitudeDisplay.textContent = `${(this.magnitudeMultiplier / 1000).toFixed(0)}k×`;
      } else if (this.magnitudeMultiplier >= 10) {
        this.magnitudeDisplay.textContent = `${Math.round(this.magnitudeMultiplier)}×`;
      } else if (this.magnitudeMultiplier >= 1) {
        this.magnitudeDisplay.textContent = `${this.magnitudeMultiplier.toFixed(1)}×`;
      } else if (this.magnitudeMultiplier >= 0.1) {
        this.magnitudeDisplay.textContent = `${this.magnitudeMultiplier.toFixed(1)}×`;
      } else {
        this.magnitudeDisplay.textContent = `${this.magnitudeMultiplier.toFixed(2)}×`;
      }
    }
  }
  
  /**
   * Format Y-axis label based on value
   */
  private formatYLabel(value: number): string {
    if (value >= 1) {
      return value.toFixed(1);
    } else if (value >= 0.01) {
      return value.toFixed(2);
    } else if (value >= 0.001) {
      return value.toFixed(3);
    } else {
      return value.toExponential(1);
    }
  }
  
  /**
   * Destroy the component
   */
  destroy(): void {
    this.rangeSlider?.destroy();
    this.container.remove();
  }
  
  /**
   * Render the graph
   */
  private render(): void {
    const { width, height, wavelengthMin, wavelengthMax, showRainbow } = this.options;
    const ctx = this.ctx;
    
    // Use view range for display
    const displayMin = this.viewMin;
    const displayMax = this.viewMax;
    
    // Clear
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);
    
    // Rainbow band
    if (showRainbow) {
      const bandHeight = 20;
      const visMin = Math.max(380, displayMin);
      const visMax = Math.min(700, displayMax);
      
      for (let x = 0; x < width; x++) {
        const wavelength = displayMin + (x / width) * (displayMax - displayMin);
        if (wavelength >= visMin && wavelength <= visMax) {
          const [r, g, b] = wavelengthToRGB(wavelength);
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(x, 0, 1, bandHeight);
        }
      }
    }
    
    // Axes
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    
    // X axis
    const graphBottom = height - 20;
    ctx.beginPath();
    ctx.moveTo(30, graphBottom);
    ctx.lineTo(width - 10, graphBottom);
    ctx.stroke();
    
    // Y axis
    ctx.beginPath();
    ctx.moveTo(30, 25);
    ctx.lineTo(30, graphBottom);
    ctx.stroke();
    
    // X axis labels
    ctx.fillStyle = '#888';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    
    const xLabels = 5;
    for (let i = 0; i <= xLabels; i++) {
      const x = 30 + (i / xLabels) * (width - 40);
      const wavelength = displayMin + (i / xLabels) * (displayMax - displayMin);
      ctx.fillText(`${Math.round(wavelength)}`, x, height - 5);
    }
    
    // Y axis labels (adjusted for magnitude)
    ctx.textAlign = 'right';
    const yMax = 1.0 / this.magnitudeMultiplier;
    const yMid = 0.5 / this.magnitudeMultiplier;
    ctx.fillText(this.formatYLabel(yMax), 25, 30);
    ctx.fillText(this.formatYLabel(yMid), 25, (25 + graphBottom) / 2);
    ctx.fillText('0', 25, graphBottom);
    
    // Draw spectrum
    if (this.spectrum && this.spectrum.length > 0) {
      ctx.strokeStyle = '#4a90e2';
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      const graphTop = 25;
      const graphHeight = graphBottom - graphTop;
      const graphLeft = 30;
      const graphWidth = width - 40;
      
      // Data range from spectrum
      const dataRange = wavelengthMax - wavelengthMin;
      const dataStep = dataRange / (this.spectrum.length - 1);
      
      // Use global max if set, otherwise find local max in visible range
      let normFactor: number;
      let heightScale: number;
      
      if (this.globalMax !== null && this.globalMax > 0) {
        // Use global max with 10% top margin (global max at 90% height)
        normFactor = this.globalMax;
        heightScale = 0.9;
      } else {
        // Fallback: find max in visible range (fills full height)
        let maxVal = 0;
        for (let i = 0; i < this.spectrum.length; i++) {
          const wavelength = wavelengthMin + i * dataStep;
          if (wavelength >= displayMin && wavelength <= displayMax) {
            maxVal = Math.max(maxVal, this.spectrum[i]);
          }
        }
        normFactor = maxVal || 1;
        heightScale = 1.0;
      }
      
      let started = false;
      for (let i = 0; i < this.spectrum.length; i++) {
        const wavelength = wavelengthMin + i * dataStep;
        
        // Only draw points within view range
        if (wavelength >= displayMin && wavelength <= displayMax) {
          // Map wavelength to x position
          const xNorm = (wavelength - displayMin) / (displayMax - displayMin);
          const x = graphLeft + xNorm * graphWidth;
          // Normalize value, apply height scale and magnitude multiplier
          // Clamp to graph bounds to prevent drawing outside
          const scaledValue = (this.spectrum[i] / normFactor) * heightScale * this.magnitudeMultiplier;
          const clampedValue = Math.min(1.0, scaledValue); // Clip at top of graph
          const y = graphBottom - clampedValue * graphHeight;
          
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
      }
      
      ctx.stroke();
    }
    
    // Lock indicator
    if (this.isLocked) {
      ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
      ctx.beginPath();
      ctx.arc(width - 20, 35, 8, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#ff0';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🔒', width - 20, 38);
    }
  }
}


