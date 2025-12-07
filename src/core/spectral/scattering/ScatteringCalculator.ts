import { ScatteringProperties, ScatteringResult, calculateBlurSigma, calculateWavelengthFactor } from './ScatteringProperties';

/**
 * GaussianKernel - pre-computed Gaussian blur kernel
 */
export interface GaussianKernel {
  weights: number[];
  offsets: number[];
  sigma: number;
  radius: number;
}

/**
 * ScatteringCalculator - calculates blur parameters from scattering properties
 * 
 * Scattering causes light to be redirected as it passes through a material.
 * This results in a blur effect on content seen THROUGH the material,
 * while keeping the material's edges sharp.
 */
export class ScatteringCalculator {
  /**
   * Calculate scattering result from properties
   * 
   * @param scattering Scattering properties
   * @param depth Optical path length in cm
   * @param refractiveIndex Material refractive index
   */
  static calculate(
    scattering: ScatteringProperties,
    depth: number,
    refractiveIndex: number = 1.0
  ): ScatteringResult {
    const blurSigma = calculateBlurSigma(scattering, depth, refractiveIndex);
    
    return {
      blurSigma,
      wavelengthFactor: (wavelength: number) => 
        calculateWavelengthFactor(wavelength, scattering),
    };
  }
  
  /**
   * Generate a 1D Gaussian kernel for separable blur
   * 
   * @param sigma Standard deviation in pixels
   * @param maxRadius Maximum radius (for performance)
   * @returns Gaussian kernel with weights and offsets
   */
  static generateGaussianKernel(sigma: number, maxRadius: number = 50): GaussianKernel {
    if (sigma <= 0) {
      return {
        weights: [1.0],
        offsets: [0],
        sigma: 0,
        radius: 0,
      };
    }
    
    // Kernel radius: 3σ covers 99.7% of the distribution
    const radius = Math.min(Math.ceil(sigma * 3), maxRadius);
    
    const weights: number[] = [];
    const offsets: number[] = [];
    
    // Calculate raw Gaussian weights
    let sum = 0;
    for (let i = -radius; i <= radius; i++) {
      const weight = this.gaussian(i, sigma);
      weights.push(weight);
      offsets.push(i);
      sum += weight;
    }
    
    // Normalize weights
    for (let i = 0; i < weights.length; i++) {
      weights[i] /= sum;
    }
    
    return { weights, offsets, sigma, radius };
  }
  
  /**
   * Generate an optimized Gaussian kernel using linear sampling
   * This reduces the number of texture samples by sampling between pixels
   * 
   * @param sigma Standard deviation in pixels
   * @param maxSamples Maximum number of samples (for performance)
   */
  static generateOptimizedKernel(sigma: number, maxSamples: number = 15): GaussianKernel {
    if (sigma <= 0) {
      return {
        weights: [1.0],
        offsets: [0],
        sigma: 0,
        radius: 0,
      };
    }
    
    // Start with full kernel
    const fullKernel = this.generateGaussianKernel(sigma);
    
    // If already small enough, return as-is
    if (fullKernel.weights.length <= maxSamples) {
      return fullKernel;
    }
    
    // Combine adjacent samples using linear filtering
    const weights: number[] = [];
    const offsets: number[] = [];
    
    // Center sample
    const centerIdx = Math.floor(fullKernel.weights.length / 2);
    weights.push(fullKernel.weights[centerIdx]);
    offsets.push(0);
    
    // Combine pairs of samples on each side
    for (let i = 1; i < centerIdx; i += 2) {
      const leftIdx = centerIdx - i - 1;
      const rightIdx = centerIdx + i;
      
      if (leftIdx >= 0 && rightIdx < fullKernel.weights.length) {
        // Left side: combine i and i+1
        const w1 = fullKernel.weights[centerIdx - i];
        const w2 = leftIdx >= 0 ? fullKernel.weights[leftIdx] : 0;
        const combinedWeight = w1 + w2;
        const combinedOffset = (w1 * (-i) + w2 * (-i - 1)) / combinedWeight;
        
        weights.unshift(combinedWeight);
        offsets.unshift(combinedOffset);
        
        // Right side: mirror
        weights.push(combinedWeight);
        offsets.push(-combinedOffset);
      }
    }
    
    return { weights, offsets, sigma, radius: fullKernel.radius };
  }
  
  /**
   * Gaussian function
   */
  private static gaussian(x: number, sigma: number): number {
    return Math.exp(-(x * x) / (2 * sigma * sigma)) / (sigma * Math.sqrt(2 * Math.PI));
  }
  
  /**
   * Apply blur to a 1D array of values (for CPU testing)
   * 
   * @param values Input values
   * @param kernel Gaussian kernel
   * @returns Blurred values
   */
  static applyBlur1D(values: number[], kernel: GaussianKernel): number[] {
    const result: number[] = new Array(values.length).fill(0);
    
    for (let i = 0; i < values.length; i++) {
      let sum = 0;
      for (let j = 0; j < kernel.weights.length; j++) {
        const idx = i + kernel.offsets[j];
        const clampedIdx = Math.max(0, Math.min(values.length - 1, Math.round(idx)));
        sum += values[clampedIdx] * kernel.weights[j];
      }
      result[i] = sum;
    }
    
    return result;
  }
  
  /**
   * Calculate the effective blur radius for a given sigma
   * (radius where contribution drops below threshold)
   */
  static getEffectiveRadius(sigma: number, threshold: number = 0.01): number {
    if (sigma <= 0) return 0;
    
    // Solve for x where Gaussian(x) = threshold * Gaussian(0)
    // exp(-x²/2σ²) = threshold
    // -x²/2σ² = ln(threshold)
    // x = σ * sqrt(-2 * ln(threshold))
    return sigma * Math.sqrt(-2 * Math.log(threshold));
  }
  
  /**
   * Combine multiple scattering effects (sequential layers)
   * Blur sigmas add in quadrature
   */
  static combineScattering(scatterings: ScatteringResult[]): ScatteringResult {
    // Combine blur sigmas in quadrature
    const combinedSigma = Math.sqrt(
      scatterings.reduce((sum, s) => sum + s.blurSigma * s.blurSigma, 0)
    );
    
    // Combine wavelength factors (multiply)
    const wavelengthFactor = (wavelength: number) => {
      return scatterings.reduce((product, s) => product * s.wavelengthFactor(wavelength), 1);
    };
    
    return { blurSigma: combinedSigma, wavelengthFactor };
  }
}

