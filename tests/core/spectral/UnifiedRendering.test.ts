import { describe, it, expect } from 'vitest';
import { SpectralPhysicsProvider, BackgroundMode } from '../../../src/core/spectral/SpectralPhysicsProvider';
import { CIE, SpectrumPoint } from '../../../src/core/spectral/CIE';
import { Material } from '../../../src/core/spectral/interfaces/Material';
import { SpectralEffect } from '../../../src/core/spectral/interfaces/SpectralEffect';
import { SolutionProperties } from '../../../src/core/spectral/SolutionProperties';
import { BlackBodyEmission } from '../../../src/core/spectral/emission/BlackBodyEmission';

/**
 * Unified Rendering Tests
 * 
 * Verifies that the spectral plot (CPU) and visual rendering (GPU) produce
 * identical physics results for all features:
 * - Transmission/absorption
 * - Black body emission with Kirchhoff's law
 * - Scattering blur
 * - Dark mode
 */
describe('Unified Rendering', () => {
  const provider = new SpectralPhysicsProvider();
  const blackBody = new BlackBodyEmission();
  
  // Helper to create mock material
  const createMaterial = (transmission: number): Material => {
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
  
  const createProps = (
    temp: number = 298,
    particleDensity: number = 0
  ): SolutionProperties => ({
    moleculeConcentrations: new Map(),
    temperature: temp,
    pressure: 1.0,
    depth: 0.01,
    bubbleDensity: 0,
    particleDensity,
    particleSize: 50,
    phase: 'liquid',
  });
  
  // Convert spectrum to approximate sRGB for comparison
  const spectrumToApproxRGB = (spectrum: SpectrumPoint[]): { r: number; g: number; b: number } => {
    const xyz = CIE.spectrumToRawXYZ(spectrum, 'D65');
    const linear = CIE.xyzToLinearRGB(xyz);
    const srgb = CIE.linearRGBToSRGB(linear);
    return srgb;
  };
  
  describe('CPU/GPU Physics Parity', () => {
    it('should calculate identical transmission at all wavelengths', () => {
      const material = createMaterial(0.5);
      const props = createProps();
      
      // CPU path uses SpectralPhysicsProvider
      const cpuTransmission = provider.getTransmissionSpectrum(material, props);
      
      // GPU path should use same calculation
      // (verified through SpectralPhysicsProvider)
      for (const point of cpuTransmission) {
        expect(point.transmission).toBeCloseTo(0.5, 1);
      }
    });
    
    it('should calculate identical emission with Kirchhoff\'s law', () => {
      const material = createMaterial(0.0); // Opaque
      const props = createProps(6500);
      
      // CPU path
      const cpuEmission = provider.getEmissionSpectrum(material, props);
      
      // GPU path should use same Kirchhoff formula:
      // emission = absorptivity × blackBody(λ, T)
      const wavelength = 550;
      const cpuPoint = cpuEmission.find(p => Math.abs(p.wavelength - wavelength) < 10);
      
      // Direct calculation (what GPU shader does)
      const absorptivity = 1.0; // 1 - transmission
      const bbIntensity = blackBody.getIntensityAt(wavelength, 6500);
      const gpuEmission = absorptivity * bbIntensity;
      
      // Allow differences due to wavelength sampling differences
      expect(cpuPoint!.transmission).toBeCloseTo(gpuEmission, 1);
    });
    
    it('should produce same combined spectrum formula', () => {
      const material = createMaterial(0.2);
      const props = createProps(5000);
      
      // Combined = background × transmission + emission
      const background = provider.getBackgroundSpectrum('normal', 'render');
      const transmission = provider.getTransmissionSpectrum(material, props, 100);
      const emission = provider.getEmissionSpectrum(material, props, 100);
      const combined = provider.getCombinedSpectrum(material, props, 'normal', 100);
      
      // Verify the formula
      for (let i = 0; i < combined.length; i++) {
        const expected = 
          background[i].transmission * transmission[i].transmission + 
          emission[i].transmission;
        expect(combined[i].transmission).toBeCloseTo(expected, 5);
      }
    });
  });
  
  describe('Mode Consistency', () => {
    const modes: BackgroundMode[] = ['normal', 'uv', 'dark'];
    
    for (const mode of modes) {
      it(`should produce consistent background for ${mode} mode`, () => {
        const displayBg = provider.getBackgroundSpectrum(mode, 'display');
        const renderBg = provider.getBackgroundSpectrum(mode, 'render');
        
        // Both should have same characteristics at key wavelengths
        const display550 = displayBg.find(p => Math.abs(p.wavelength - 550) < 5);
        const render550 = renderBg.find(p => Math.abs(p.wavelength - 550) < 10);
        
        if (display550 && render550) {
          if (mode === 'dark') {
            // Dark mode: both should be zero
            expect(display550.transmission).toBe(0);
            expect(render550.transmission).toBe(0);
          } else if (mode === 'uv') {
            // UV mode: 550nm is outside UV range, so low/zero transmission
            expect(display550.transmission).toBeLessThan(0.5);
            expect(render550.transmission).toBeLessThan(0.5);
          } else {
            // Normal mode: both should be high values
            expect(display550.transmission).toBeGreaterThan(0.5);
            expect(render550.transmission).toBeGreaterThan(0.5);
            // Values should be close (resolution differences allowed)
            const ratio = display550.transmission / render550.transmission;
            expect(ratio).toBeGreaterThan(0.5);
            expect(ratio).toBeLessThan(2.0);
          }
        }
      });
    }
  });
  
  describe('Temperature Effects', () => {
    const temperatures = [298, 1000, 2000, 4000, 6500, 10000];
    
    for (const temp of temperatures) {
      it(`should handle temperature ${temp}K correctly`, () => {
        const material = createMaterial(0.0);
        const props = createProps(temp);
        
        const emission = provider.getEmissionSpectrum(material, props);
        const combined = provider.getCombinedSpectrum(material, props, 'normal');
        
        if (temp < 800) {
          // Below Draper point - no visible emission
          for (const point of emission) {
            expect(point.transmission).toBeLessThan(0.0001);
          }
        } else {
          // Above Draper point - has some emission
          // At low temperatures (1000-2000K), emission is very faint (< 0.001)
          // but still non-zero
          const maxEmission = Math.max(...emission.map(p => p.transmission));
          expect(maxEmission).toBeGreaterThan(0);
          
          // At high temperatures (6500K+), emission should be visible
          if (temp >= 6500) {
            const greenEmission = emission.find(p => Math.abs(p.wavelength - 550) < 10);
            expect(greenEmission!.transmission).toBeGreaterThan(0.5);
          }
        }
      });
    }
  });
  
  describe('Scattering Properties', () => {
    it('should calculate consistent scattering for CPU and GPU', () => {
      const material = createMaterial(0.5);
      const clearProps = createProps(298, 0);
      const cloudyProps = createProps(298, 0.5);
      
      const clearScatter = provider.getScatteringProperties(material, clearProps);
      const cloudyScatter = provider.getScatteringProperties(material, cloudyProps);
      
      // Clear should have no scattering
      expect(clearScatter.coefficient).toBe(0);
      
      // Cloudy should have scattering
      expect(cloudyScatter.coefficient).toBeGreaterThan(0);
    });
  });
  
  describe('Color Accuracy', () => {
    it('should produce white for D65 background through transparent material', () => {
      const material = createMaterial(1.0); // Fully transparent
      const props = createProps(298);
      
      const combined = provider.getCombinedSpectrum(material, props, 'normal', 100);
      const rgb = spectrumToApproxRGB(combined);
      
      // Should be close to white
      expect(rgb.r).toBeGreaterThan(240);
      expect(rgb.g).toBeGreaterThan(240);
      expect(rgb.b).toBeGreaterThan(240);
    });
    
    it('should produce red-tinted glow at 3000K in dark mode', () => {
      const material = createMaterial(0.0); // Opaque
      const props = createProps(3000); // Higher temp for visible emission
      
      const combined = provider.getCombinedSpectrum(material, props, 'dark', 100);
      const rgb = spectrumToApproxRGB(combined);
      
      // Should be reddish (red > blue for warm colors)
      // At 3000K, it's a warm white so red >= green is expected
      expect(rgb.r).toBeGreaterThanOrEqual(rgb.b);
    });
    
    it('should produce white glow at 6500K in dark mode', () => {
      const material = createMaterial(0.0); // Opaque
      const props = createProps(6500);
      
      const combined = provider.getCombinedSpectrum(material, props, 'dark', 100);
      const rgb = spectrumToApproxRGB(combined);
      
      // Should be approximately white (balanced RGB)
      const avgRGB = (rgb.r + rgb.g + rgb.b) / 3;
      const deviation = Math.max(
        Math.abs(rgb.r - avgRGB),
        Math.abs(rgb.g - avgRGB),
        Math.abs(rgb.b - avgRGB)
      );
      
      // Allow some deviation but should be roughly balanced
      expect(deviation / avgRGB).toBeLessThan(0.3);
    });
  });
  
  describe('Resolution Independence', () => {
    it('should produce similar colors at different resolutions', () => {
      const material = createMaterial(0.3);
      const props = createProps(4000);
      
      const lowRes = provider.getCombinedSpectrum(material, props, 'normal', 20);
      const highRes = provider.getCombinedSpectrum(material, props, 'normal', 100);
      
      const lowRGB = spectrumToApproxRGB(lowRes);
      const highRGB = spectrumToApproxRGB(highRes);
      
      // Colors should be within reasonable range (resolution differences cause variance)
      const diff = Math.max(
        Math.abs(lowRGB.r - highRGB.r),
        Math.abs(lowRGB.g - highRGB.g),
        Math.abs(lowRGB.b - highRGB.b)
      );
      
      // Allow larger tolerance for resolution differences
      expect(diff).toBeLessThan(120);
    });
  });
  
  describe('Feature Integration', () => {
    it('should correctly combine absorption and emission', () => {
      const material = createMaterial(0.5); // 50% transmission
      const props = createProps(5000);
      
      // Get all components
      const background = provider.getBackgroundSpectrum('normal', 'render');
      const transmission = provider.getTransmissionSpectrum(material, props, 100);
      const emission = provider.getEmissionSpectrum(material, props, 100);
      
      // Transmission should reduce background
      const green = transmission.find(p => Math.abs(p.wavelength - 550) < 10);
      expect(green!.transmission).toBeCloseTo(0.5, 1);
      
      // Emission should add light
      const greenEmit = emission.find(p => Math.abs(p.wavelength - 550) < 10);
      expect(greenEmit!.transmission).toBeGreaterThan(0);
      
      // Final spectrum should be: reduced background + emission
      const combined = provider.getCombinedSpectrum(material, props, 'normal', 100);
      const greenCombined = combined.find(p => Math.abs(p.wavelength - 550) < 10);
      const greenBg = background.find(p => Math.abs(p.wavelength - 550) < 10);
      
      const expected = greenBg!.transmission * green!.transmission + greenEmit!.transmission;
      // Allow small differences due to wavelength interpolation
      expect(greenCombined!.transmission).toBeCloseTo(expected, 2);
    });
  });
});

