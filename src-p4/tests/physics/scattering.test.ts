/**
 * Scattering Tests
 * 
 * Tests for Rayleigh and Mie scattering implementations.
 * 
 * Rayleigh Scattering (small particles, d << λ):
 * - Intensity scales as 1/λ⁴
 * - Blue light scattered more than red
 * - Responsible for blue sky
 * 
 * Mie Scattering (large particles, d ~ λ):
 * - Roughly wavelength-independent for large particles
 * - Responsible for white clouds, milk, fog
 */

import { describe, it, expect } from 'vitest';
import {
  getRayleighScattering,
  getMieScattering,
  applyScattering,
  RAYLEIGH_REFERENCE_COEFFICIENT,
} from '../../core/physics/scattering';

describe('Rayleigh Scattering', () => {
  const defaultParams = {
    particleDensity: 1e12, // particles/cm³
    particleSize: 50,      // nm (small compared to visible light)
  };

  describe('wavelength dependence', () => {
    it('scales as 1/λ⁴', () => {
      const blue = getRayleighScattering(450, defaultParams);
      const red = getRayleighScattering(650, defaultParams);
      
      // Blue should scatter (650/450)^4 ≈ 4.35 times more than red
      const expectedRatio = Math.pow(650 / 450, 4);
      const actualRatio = blue / red;
      
      expect(actualRatio).toBeCloseTo(expectedRatio, 1);
    });

    it('scatters blue more than green more than red', () => {
      const blue = getRayleighScattering(450, defaultParams);
      const green = getRayleighScattering(550, defaultParams);
      const red = getRayleighScattering(650, defaultParams);
      
      expect(blue).toBeGreaterThan(green);
      expect(green).toBeGreaterThan(red);
    });
  });

  describe('particle density dependence', () => {
    it('increases linearly with particle density', () => {
      const density1 = { ...defaultParams, particleDensity: 1e12 };
      const density2 = { ...defaultParams, particleDensity: 2e12 };
      
      const scatter1 = getRayleighScattering(500, density1);
      const scatter2 = getRayleighScattering(500, density2);
      
      expect(scatter2 / scatter1).toBeCloseTo(2, 1);
    });

    it('returns zero for zero density', () => {
      const zeroParams = { ...defaultParams, particleDensity: 0 };
      expect(getRayleighScattering(500, zeroParams)).toBe(0);
    });
  });

  describe('particle size dependence', () => {
    it('increases with particle size (for small particles)', () => {
      const small = { ...defaultParams, particleSize: 30 };
      const medium = { ...defaultParams, particleSize: 60 };
      
      const scatterSmall = getRayleighScattering(500, small);
      const scatterMedium = getRayleighScattering(500, medium);
      
      // Rayleigh scattering scales as d^6
      expect(scatterMedium).toBeGreaterThan(scatterSmall);
    });
  });
});

describe('Mie Scattering', () => {
  const defaultParams = {
    particleDensity: 1e8,   // particles/cm³
    particleSize: 1000,     // nm (comparable to visible light)
  };

  describe('wavelength dependence', () => {
    it('is roughly wavelength-independent for large particles', () => {
      const blue = getMieScattering(450, defaultParams);
      const red = getMieScattering(650, defaultParams);
      
      // For large particles, ratio should be much closer to 1 than Rayleigh
      const ratio = blue / red;
      expect(ratio).toBeGreaterThan(0.5);
      expect(ratio).toBeLessThan(2.0);
    });
  });

  describe('particle density dependence', () => {
    it('increases with particle density', () => {
      const density1 = { ...defaultParams, particleDensity: 1e8 };
      const density2 = { ...defaultParams, particleDensity: 2e8 };
      
      const scatter1 = getMieScattering(500, density1);
      const scatter2 = getMieScattering(500, density2);
      
      expect(scatter2).toBeGreaterThan(scatter1);
    });
  });

  describe('convergence to Rayleigh', () => {
    it('approaches Rayleigh behavior for very small particles', () => {
      const smallParams = {
        particleDensity: 1e12,
        particleSize: 20, // Very small
      };
      
      const mieBlue = getMieScattering(450, smallParams);
      const mieRed = getMieScattering(650, smallParams);
      const mieRatio = mieBlue / mieRed;
      
      // For very small particles, should approach 1/λ⁴ behavior
      // (ratio should be > 2 at least)
      expect(mieRatio).toBeGreaterThan(1.5);
    });
  });
});

describe('applyScattering', () => {
  it('reduces intensity based on scattering coefficient', () => {
    const initialIntensity = 1.0;
    const scattered = applyScattering(
      initialIntensity,
      500,
      1e12,  // small particle density
      0,     // no large particles
      1.0    // 1 cm path
    );
    
    expect(scattered).toBeLessThan(initialIntensity);
    expect(scattered).toBeGreaterThan(0);
  });

  it('returns full intensity when no scattering particles', () => {
    const scattered = applyScattering(1.0, 500, 0, 0, 1.0);
    expect(scattered).toBe(1.0);
  });

  it('scatters more at shorter wavelengths for Rayleigh', () => {
    const blueScattered = applyScattering(1.0, 450, 1e12, 0, 1.0);
    const redScattered = applyScattering(1.0, 650, 1e12, 0, 1.0);
    
    // Red should transmit more (less scattered)
    expect(redScattered).toBeGreaterThan(blueScattered);
  });

  it('scatters roughly equally for Mie', () => {
    const blueScattered = applyScattering(1.0, 450, 0, 1e8, 1.0);
    const redScattered = applyScattering(1.0, 650, 0, 1e8, 1.0);
    
    // Should be closer than Rayleigh
    const ratio = redScattered / blueScattered;
    expect(ratio).toBeGreaterThan(0.7);
    expect(ratio).toBeLessThan(1.5);
  });

  it('combines Rayleigh and Mie scattering', () => {
    const rayleighOnly = applyScattering(1.0, 500, 1e12, 0, 1.0);
    const mieOnly = applyScattering(1.0, 500, 0, 1e8, 1.0);
    const combined = applyScattering(1.0, 500, 1e12, 1e8, 1.0);
    
    // Combined should scatter more than either alone
    expect(combined).toBeLessThan(rayleighOnly);
    expect(combined).toBeLessThan(mieOnly);
  });
});

