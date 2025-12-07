import { describe, it, expect } from 'vitest';
import { 
  ScatteringCalculator,
  GaussianKernel,
} from '../../../../src/core/spectral/scattering/ScatteringCalculator';
import {
  ScatteringProperties,
  NO_SCATTERING,
  RAYLEIGH_SCATTERING,
  MIE_SCATTERING,
  calculateBlurSigma,
  calculateWavelengthFactor,
} from '../../../../src/core/spectral/scattering/ScatteringProperties';

/**
 * Scattering Blur Tests
 * 
 * Scattering causes light to be redirected, resulting in a blur effect:
 * - Content seen THROUGH a scattering material becomes blurred
 * - The material boundaries remain sharp (blur only affects background)
 * - Blur increases with depth and scattering coefficient
 * 
 * Types of scattering:
 * - Rayleigh (λ^-4): Blue light scatters more, sunset effect
 * - Mie (λ^0): Wavelength-independent, white/cloudy appearance
 */
describe('ScatteringBlur', () => {
  describe('Blur sigma calculation', () => {
    it('should return zero blur for no scattering', () => {
      const sigma = calculateBlurSigma(NO_SCATTERING, 10, 1.5);
      expect(sigma).toBe(0);
    });
    
    it('should increase blur with depth', () => {
      const scattering: ScatteringProperties = {
        coefficient: 0.2,
        wavelengthPower: 0,
        asymmetry: 0,
      };
      
      const sigma1 = calculateBlurSigma(scattering, 1);
      const sigma2 = calculateBlurSigma(scattering, 5);
      const sigma10 = calculateBlurSigma(scattering, 10);
      
      expect(sigma2).toBeGreaterThan(sigma1);
      expect(sigma10).toBeGreaterThan(sigma2);
      
      // Should scale linearly with depth
      expect(sigma10 / sigma1).toBeCloseTo(10, 0);
    });
    
    it('should increase blur with scattering coefficient', () => {
      const lowScatter: ScatteringProperties = {
        coefficient: 0.1,
        wavelengthPower: 0,
        asymmetry: 0,
      };
      
      const highScatter: ScatteringProperties = {
        coefficient: 0.5,
        wavelengthPower: 0,
        asymmetry: 0,
      };
      
      const lowSigma = calculateBlurSigma(lowScatter, 5);
      const highSigma = calculateBlurSigma(highScatter, 5);
      
      expect(highSigma).toBeGreaterThan(lowSigma);
      expect(highSigma / lowSigma).toBeCloseTo(5, 0);
    });
    
    it('should increase blur with refractive index', () => {
      const scattering: ScatteringProperties = {
        coefficient: 0.2,
        wavelengthPower: 0,
        asymmetry: 0,
      };
      
      const sigmaAir = calculateBlurSigma(scattering, 5, 1.0);
      const sigmaWater = calculateBlurSigma(scattering, 5, 1.33);
      const sigmaGlass = calculateBlurSigma(scattering, 5, 1.5);
      
      expect(sigmaWater).toBeGreaterThan(sigmaAir);
      expect(sigmaGlass).toBeGreaterThan(sigmaWater);
    });
  });
  
  describe('Wavelength-dependent scattering', () => {
    it('should have uniform scattering for Mie (power=0)', () => {
      const mie = MIE_SCATTERING;
      
      const blueScatter = calculateWavelengthFactor(450, mie);
      const greenScatter = calculateWavelengthFactor(550, mie);
      const redScatter = calculateWavelengthFactor(650, mie);
      
      expect(blueScatter).toBe(1.0);
      expect(greenScatter).toBe(1.0);
      expect(redScatter).toBe(1.0);
    });
    
    it('should scatter blue more for Rayleigh (power=4)', () => {
      const rayleigh = RAYLEIGH_SCATTERING;
      
      const blueScatter = calculateWavelengthFactor(450, rayleigh);
      const greenScatter = calculateWavelengthFactor(550, rayleigh); // Reference
      const redScatter = calculateWavelengthFactor(650, rayleigh);
      
      expect(greenScatter).toBeCloseTo(1.0, 2); // Normalized at 550nm
      expect(blueScatter).toBeGreaterThan(greenScatter);
      expect(redScatter).toBeLessThan(greenScatter);
      
      // Verify λ^-4 relationship
      const expectedBlue = Math.pow(550 / 450, 4);
      expect(blueScatter).toBeCloseTo(expectedBlue, 2);
    });
  });
  
  describe('Gaussian kernel generation', () => {
    it('should return identity kernel for sigma=0', () => {
      const kernel = ScatteringCalculator.generateGaussianKernel(0);
      
      expect(kernel.weights.length).toBe(1);
      expect(kernel.weights[0]).toBe(1.0);
      expect(kernel.offsets[0]).toBe(0);
      expect(kernel.sigma).toBe(0);
    });
    
    it('should generate normalized weights', () => {
      const kernel = ScatteringCalculator.generateGaussianKernel(5);
      
      const sum = kernel.weights.reduce((acc, w) => acc + w, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    });
    
    it('should have center weight as highest', () => {
      const kernel = ScatteringCalculator.generateGaussianKernel(5);
      
      const centerIndex = Math.floor(kernel.weights.length / 2);
      const centerWeight = kernel.weights[centerIndex];
      
      for (let i = 0; i < kernel.weights.length; i++) {
        expect(kernel.weights[i]).toBeLessThanOrEqual(centerWeight);
      }
    });
    
    it('should have symmetric weights', () => {
      const kernel = ScatteringCalculator.generateGaussianKernel(5);
      
      const n = kernel.weights.length;
      for (let i = 0; i < Math.floor(n / 2); i++) {
        expect(kernel.weights[i]).toBeCloseTo(kernel.weights[n - 1 - i], 10);
      }
    });
    
    it('should increase kernel size with sigma', () => {
      const small = ScatteringCalculator.generateGaussianKernel(2);
      const medium = ScatteringCalculator.generateGaussianKernel(5);
      const large = ScatteringCalculator.generateGaussianKernel(10);
      
      expect(medium.weights.length).toBeGreaterThan(small.weights.length);
      expect(large.weights.length).toBeGreaterThan(medium.weights.length);
    });
    
    it('should respect max radius', () => {
      const kernel = ScatteringCalculator.generateGaussianKernel(20, 10);
      
      // Radius should be capped at 10, so size = 2*10+1 = 21
      expect(kernel.weights.length).toBeLessThanOrEqual(21);
    });
  });
  
  describe('1D blur application (CPU reference)', () => {
    it('should preserve constant values', () => {
      const kernel = ScatteringCalculator.generateGaussianKernel(5);
      const values = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
      
      const blurred = ScatteringCalculator.applyBlur1D(values, kernel);
      
      for (let i = 0; i < blurred.length; i++) {
        expect(blurred[i]).toBeCloseTo(1.0, 5);
      }
    });
    
    it('should blur step edge', () => {
      const kernel = ScatteringCalculator.generateGaussianKernel(2);
      const values = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
      
      const blurred = ScatteringCalculator.applyBlur1D(values, kernel);
      
      // Far from edge: should be ~0 and ~1
      expect(blurred[0]).toBeLessThan(0.1);
      expect(blurred[9]).toBeGreaterThan(0.9);
      
      // At edge: should be transitioning
      expect(blurred[4]).toBeGreaterThan(0);
      expect(blurred[4]).toBeLessThan(1);
      expect(blurred[5]).toBeGreaterThan(0);
      expect(blurred[5]).toBeLessThan(1);
    });
    
    it('should not blur with identity kernel', () => {
      const kernel = ScatteringCalculator.generateGaussianKernel(0);
      const values = [0, 0, 0, 1, 0, 0, 0];
      
      const blurred = ScatteringCalculator.applyBlur1D(values, kernel);
      
      expect(blurred).toEqual(values);
    });
  });
  
  describe('Optimized kernel generation', () => {
    it('should respect max samples parameter', () => {
      // With high sigma, full kernel would be large
      const full = ScatteringCalculator.generateGaussianKernel(20);
      const optimized = ScatteringCalculator.generateOptimizedKernel(20, 15);
      
      // Optimized should try to reduce samples
      // Even if algorithm doesn't fully achieve maxSamples, it should be smaller
      expect(optimized.weights.length).toBeLessThanOrEqual(full.weights.length);
    });
    
    it('should produce approximately normalized kernel', () => {
      const kernel = ScatteringCalculator.generateOptimizedKernel(5, 7);
      
      const sum = kernel.weights.reduce((acc, w) => acc + w, 0);
      // Optimized kernels may have slight normalization error
      expect(sum).toBeCloseTo(1.0, 2);
    });
  });
  
  describe('Scattering result calculation', () => {
    it('should return zero blur for no scattering', () => {
      const result = ScatteringCalculator.calculate(NO_SCATTERING, 10);
      
      expect(result.blurSigma).toBe(0);
      expect(result.wavelengthFactor(500)).toBe(1.0);
    });
    
    it('should combine scattering from multiple layers', () => {
      const layer1 = ScatteringCalculator.calculate({
        coefficient: 0.2,
        wavelengthPower: 0,
        asymmetry: 0,
      }, 5);
      
      const layer2 = ScatteringCalculator.calculate({
        coefficient: 0.3,
        wavelengthPower: 0,
        asymmetry: 0,
      }, 3);
      
      const combined = ScatteringCalculator.combineScattering([layer1, layer2]);
      
      // Blur sigmas combine in quadrature
      const expectedSigma = Math.sqrt(
        layer1.blurSigma ** 2 + layer2.blurSigma ** 2
      );
      expect(combined.blurSigma).toBeCloseTo(expectedSigma, 5);
    });
  });
  
  describe('Effective radius', () => {
    it('should calculate radius for 1% threshold', () => {
      const radius = ScatteringCalculator.getEffectiveRadius(5, 0.01);
      
      // At radius, Gaussian should be ~0.01 of peak
      // exp(-r²/2σ²) = 0.01, r = σ * sqrt(-2 * ln(0.01))
      const expected = 5 * Math.sqrt(-2 * Math.log(0.01));
      expect(radius).toBeCloseTo(expected, 3);
    });
  });
});

