import { describe, it, expect } from 'vitest';
import { MaterialFilter } from '../../../../src/core/spectral/filters/MaterialFilter';
import { SpectrumPoint } from '../../../../src/core/spectral/CIE';
import { Material } from '../../../../src/core/spectral/interfaces/Material';
import { SolutionProperties } from '../../../../src/core/spectral/SolutionProperties';
import { SpectralEffect } from '../../../../src/core/spectral/interfaces/SpectralEffect';

/**
 * Feature Parity Tests - verify that MaterialFilter produces identical physics
 * behavior at different resolutions (emission, scattering, etc.)
 * 
 * This ensures the spectral display (high resolution ~5000 points) and
 * the GPU renderer (low resolution ~100 points) will show the same effects.
 */
describe('MaterialFilter Feature Parity', () => {
  const createMockMaterial = (transmission: number): Material => {
    const mockEffect: SpectralEffect = {
      id: 'test-effect',
      name: 'Test Effect',
      apply: () => transmission,
      getType: () => 'absorption',
      getPriority: () => 0,
    };

    return {
      id: 'test-material',
      name: 'Test Material',
      bandGap: 3.5,
      uvCutoff: 300,
      refractiveIndex: () => 1.5,
      baseTransmission: () => 1.0,
      molecules: [],
      getEffects: () => [mockEffect],
    };
  };

  const createHighResSpectrum = (minWl: number = 380, maxWl: number = 700, points: number = 5334): SpectrumPoint[] => {
    const spectrum: SpectrumPoint[] = [];
    const step = (maxWl - minWl) / (points - 1);
    for (let i = 0; i < points; i++) {
      spectrum.push({
        wavelength: minWl + i * step,
        transmission: 1.0,
      });
    }
    return spectrum;
  };

  const createLowResSpectrum = (minWl: number = 380, maxWl: number = 700, points: number = 100): SpectrumPoint[] => {
    const spectrum: SpectrumPoint[] = [];
    const step = (maxWl - minWl) / (points - 1);
    for (let i = 0; i < points; i++) {
      spectrum.push({
        wavelength: minWl + i * step,
        transmission: 1.0,
      });
    }
    return spectrum;
  };

  describe('Emission at Different Resolutions', () => {
    it('should add black body emission at both low and high resolutions', () => {
      const material = createMockMaterial(0.5);
      const hotProps: SolutionProperties = {
        moleculeConcentrations: new Map(),
        temperature: 2000, // Hot enough for visible glow
        pressure: 1.0,
        depth: 0.01,
        bubbleDensity: 0,
        particleDensity: 0,
        particleSize: 0,
        phase: 'liquid',
      };
      const filter = new MaterialFilter(material, hotProps);

      // Test at low resolution (like GPU renderer)
      const lowResInput = createLowResSpectrum();
      const lowResResult = filter.apply(lowResInput, 100, 200);

      // Test at high resolution (like spectral display)
      const highResInput = createHighResSpectrum();
      const highResResult = filter.apply(highResInput, 100, 200);

      // Both should have emission above the pure transmission level
      const lowResHasEmission = lowResResult.some(p => p.transmission > 0.5);
      const highResHasEmission = highResResult.some(p => p.transmission > 0.5);

      expect(lowResHasEmission).toBe(true);
      expect(highResHasEmission).toBe(true);
    });

    it('should show same emission pattern (red > green > blue) at both resolutions', () => {
      const material = createMockMaterial(0.0); // Opaque - only emission visible
      const hotProps: SolutionProperties = {
        moleculeConcentrations: new Map(),
        temperature: 2000,
        pressure: 1.0,
        depth: 0.01,
        bubbleDensity: 0,
        particleDensity: 0,
        particleSize: 0,
        phase: 'liquid',
      };
      const filter = new MaterialFilter(material, hotProps);

      // Test at low resolution
      const lowResInput: SpectrumPoint[] = [
        { wavelength: 450, transmission: 1.0 }, // Blue
        { wavelength: 550, transmission: 1.0 }, // Green
        { wavelength: 650, transmission: 1.0 }, // Red
      ];
      const lowResResult = filter.apply(lowResInput, 100, 200);

      // Test at high resolution
      const highResInput = createHighResSpectrum(380, 700, 1000);
      const highResResult = filter.apply(highResInput, 100, 200);

      // Find approximate red, green, blue in high res
      const highResBlue = highResResult.find(p => Math.abs(p.wavelength - 450) < 5);
      const highResGreen = highResResult.find(p => Math.abs(p.wavelength - 550) < 5);
      const highResRed = highResResult.find(p => Math.abs(p.wavelength - 650) < 5);

      // Low res: Red > Green > Blue
      expect(lowResResult[2].transmission).toBeGreaterThan(lowResResult[1].transmission);
      expect(lowResResult[1].transmission).toBeGreaterThan(lowResResult[0].transmission);

      // High res: Same pattern
      expect(highResRed!.transmission).toBeGreaterThan(highResGreen!.transmission);
      expect(highResGreen!.transmission).toBeGreaterThan(highResBlue!.transmission);
    });

    it('should have consistent emission intensity at same wavelengths', () => {
      const material = createMockMaterial(0.0);
      const hotProps: SolutionProperties = {
        moleculeConcentrations: new Map(),
        temperature: 2000,
        pressure: 1.0,
        depth: 0.01,
        bubbleDensity: 0,
        particleDensity: 0,
        particleSize: 0,
        phase: 'liquid',
      };
      const filter = new MaterialFilter(material, hotProps);

      // Get emission at 600nm from low res
      const lowResInput: SpectrumPoint[] = [{ wavelength: 600, transmission: 0.0 }];
      const lowResResult = filter.apply(lowResInput, 100, 200);

      // Get emission at 600nm from high res
      const highResInput = createHighResSpectrum(598, 602, 5);
      const highResResult = filter.apply(highResInput, 100, 200);
      const highRes600 = highResResult.find(p => Math.abs(p.wavelength - 600) < 1);

      // Emission at same wavelength should be the same (within floating point tolerance)
      expect(lowResResult[0].transmission).toBeCloseTo(highRes600!.transmission, 4);
    });
  });

  describe('Transmission at Different Resolutions', () => {
    it('should apply same transmission at both resolutions', () => {
      const material = createMockMaterial(0.7);
      const roomTempProps: SolutionProperties = {
        moleculeConcentrations: new Map(),
        temperature: 298, // Room temp - no emission
        pressure: 1.0,
        depth: 0.01,
        bubbleDensity: 0,
        particleDensity: 0,
        particleSize: 0,
        phase: 'liquid',
      };
      const filter = new MaterialFilter(material, roomTempProps);

      // Low res
      const lowResInput = createLowResSpectrum();
      const lowResResult = filter.apply(lowResInput, 100, 200);

      // High res
      const highResInput = createHighResSpectrum();
      const highResResult = filter.apply(highResInput, 100, 200);

      // All values should be close to 0.7 (pure transmission)
      const lowResAvg = lowResResult.reduce((sum, p) => sum + p.transmission, 0) / lowResResult.length;
      const highResAvg = highResResult.reduce((sum, p) => sum + p.transmission, 0) / highResResult.length;

      expect(lowResAvg).toBeCloseTo(0.7, 1);
      expect(highResAvg).toBeCloseTo(0.7, 1);
      expect(lowResAvg).toBeCloseTo(highResAvg, 2);
    });
  });

  describe('Combined Transmission + Emission', () => {
    it('should show combined effect at both resolutions', () => {
      const material = createMockMaterial(0.3); // Partially absorbing
      const hotProps: SolutionProperties = {
        moleculeConcentrations: new Map(),
        temperature: 2000, // Hot - has emission
        pressure: 1.0,
        depth: 0.01,
        bubbleDensity: 0,
        particleDensity: 0,
        particleSize: 0,
        phase: 'liquid',
      };
      const filter = new MaterialFilter(material, hotProps);

      // Low res at 600nm
      const lowResInput: SpectrumPoint[] = [{ wavelength: 600, transmission: 1.0 }];
      const lowResResult = filter.apply(lowResInput, 100, 200);

      // High res at 600nm
      const highResInput = createHighResSpectrum(598, 602, 5);
      const highResResult = filter.apply(highResInput, 100, 200);
      const highRes600 = highResResult.find(p => Math.abs(p.wavelength - 600) < 1);

      // Combined effect: 1.0 * 0.3 (transmission) + emission
      // Should be greater than pure transmission (0.3)
      expect(lowResResult[0].transmission).toBeGreaterThan(0.3);
      expect(highRes600!.transmission).toBeGreaterThan(0.3);

      // And they should be the same at the same wavelength
      expect(lowResResult[0].transmission).toBeCloseTo(highRes600!.transmission, 4);
    });
  });
  
  describe('Integration: Visible Emission at High Temperatures', () => {
    /**
     * These tests verify the complete emission system:
     * - D65 normalization makes emission comparable to background
     * - Kirchhoff's law couples absorption and emission
     * - High temperatures produce visible emission
     * - Very high temperatures exceed background brightness
     */
    it('should show visible emission at 2000K with full absorption', () => {
      const opaqueMaterial = createMockMaterial(0.0); // Full absorption
      const hotProps: SolutionProperties = {
        moleculeConcentrations: new Map(),
        temperature: 2000,
        pressure: 1.0,
        depth: 0.01,
        bubbleDensity: 0,
        particleDensity: 0,
        particleSize: 0,
        phase: 'liquid',
      };
      const filter = new MaterialFilter(opaqueMaterial, hotProps);
      
      // At red wavelength, 2000K should show some emission
      const input: SpectrumPoint[] = [{ wavelength: 650, transmission: 0.0 }];
      const result = filter.apply(input, 100, 200);
      
      // Should have visible emission (> 0) even with no incoming light
      expect(result[0].transmission).toBeGreaterThan(0);
      // But much dimmer than D65 background
      expect(result[0].transmission).toBeLessThan(0.01);
    });
    
    it('should match D65 brightness at 6500K with full absorption', () => {
      const opaqueMaterial = createMockMaterial(0.0); // Full absorption
      const d65Props: SolutionProperties = {
        moleculeConcentrations: new Map(),
        temperature: 6500, // D65 reference temperature
        pressure: 1.0,
        depth: 0.01,
        bubbleDensity: 0,
        particleDensity: 0,
        particleSize: 0,
        phase: 'liquid',
      };
      const filter = new MaterialFilter(opaqueMaterial, d65Props);
      
      // At 550nm, 6500K should produce ~1.0 intensity
      const input: SpectrumPoint[] = [{ wavelength: 550, transmission: 0.0 }];
      const result = filter.apply(input, 100, 200);
      
      // Should be close to 1.0 (D65 reference)
      expect(result[0].transmission).toBeGreaterThan(0.9);
      expect(result[0].transmission).toBeLessThan(1.1);
    });
    
    it('should exceed D65 brightness at 10000K with full absorption', () => {
      const opaqueMaterial = createMockMaterial(0.0); // Full absorption
      const hotProps: SolutionProperties = {
        moleculeConcentrations: new Map(),
        temperature: 10000, // Hotter than sun surface
        pressure: 1.0,
        depth: 0.01,
        bubbleDensity: 0,
        particleDensity: 0,
        particleSize: 0,
        phase: 'liquid',
      };
      const filter = new MaterialFilter(opaqueMaterial, hotProps);
      
      // At visible wavelengths, 10000K should be brighter than D65
      const input: SpectrumPoint[] = [{ wavelength: 550, transmission: 0.0 }];
      const result = filter.apply(input, 100, 200);
      
      // Should exceed D65 reference (> 1.0)
      expect(result[0].transmission).toBeGreaterThan(1.0);
    });
    
    it('should maintain red > green > blue pattern at 2000K', () => {
      const opaqueMaterial = createMockMaterial(0.0);
      const hotProps: SolutionProperties = {
        moleculeConcentrations: new Map(),
        temperature: 2000,
        pressure: 1.0,
        depth: 0.01,
        bubbleDensity: 0,
        particleDensity: 0,
        particleSize: 0,
        phase: 'liquid',
      };
      const filter = new MaterialFilter(opaqueMaterial, hotProps);
      
      const input: SpectrumPoint[] = [
        { wavelength: 450, transmission: 0.0 }, // Blue
        { wavelength: 550, transmission: 0.0 }, // Green
        { wavelength: 650, transmission: 0.0 }, // Red
      ];
      const result = filter.apply(input, 100, 200);
      
      // At 2000K: red > green > blue (Wien's peak is in infrared)
      expect(result[2].transmission).toBeGreaterThan(result[1].transmission);
      expect(result[1].transmission).toBeGreaterThan(result[0].transmission);
    });
    
    it('should transition toward white at higher temperatures', () => {
      const opaqueMaterial = createMockMaterial(0.0);
      
      const props2000: SolutionProperties = {
        moleculeConcentrations: new Map(),
        temperature: 2000,
        pressure: 1.0,
        depth: 0.01,
        bubbleDensity: 0,
        particleDensity: 0,
        particleSize: 0,
        phase: 'liquid',
      };
      const props6500: SolutionProperties = { ...props2000, temperature: 6500 };
      
      const filter2000 = new MaterialFilter(opaqueMaterial, props2000);
      const filter6500 = new MaterialFilter(opaqueMaterial, props6500);
      
      const input: SpectrumPoint[] = [
        { wavelength: 450, transmission: 0.0 },
        { wavelength: 650, transmission: 0.0 },
      ];
      
      const result2000 = filter2000.apply(input, 100, 200);
      const result6500 = filter6500.apply(input, 100, 200);
      
      // Red/Blue ratio at 2000K (very red)
      const ratio2000 = result2000[1].transmission / result2000[0].transmission;
      // Red/Blue ratio at 6500K (more balanced, "white")
      const ratio6500 = result6500[1].transmission / result6500[0].transmission;
      
      // Higher temperature should be more balanced (lower ratio)
      expect(ratio6500).toBeLessThan(ratio2000);
    });
  });
});

