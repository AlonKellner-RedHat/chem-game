import { describe, it, expect } from 'vitest';
import { SpectralPhysicsProvider, BackgroundMode } from '../../../src/core/spectral/SpectralPhysicsProvider';
import { SolutionProperties } from '../../../src/core/spectral/SolutionProperties';
import { Material } from '../../../src/core/spectral/interfaces/Material';
import { SpectralEffect } from '../../../src/core/spectral/interfaces/SpectralEffect';

/**
 * SpectralPhysicsProvider Tests
 * 
 * The SpectralPhysicsProvider is the unified interface that both the spectral plot
 * and the GPU renderer use to ensure identical physics calculations.
 * 
 * Features tested:
 * - Background spectrum modes (normal, UV, dark)
 * - Transmission spectrum calculation
 * - Emission spectrum with Kirchhoff's law
 * - Scattering properties
 * - Aura properties for emission glow
 */
describe('SpectralPhysicsProvider', () => {
  // Helper to create a mock material
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

  const createDefaultProps = (temp: number = 298): SolutionProperties => ({
    moleculeConcentrations: new Map(),
    temperature: temp,
    pressure: 1.0,
    depth: 0.01,
    bubbleDensity: 0,
    particleDensity: 0,
    particleSize: 0,
    phase: 'liquid',
  });

  describe('Background Spectrum', () => {
    it('should return D65 white light for normal mode', () => {
      const provider = new SpectralPhysicsProvider();
      const spectrum = provider.getBackgroundSpectrum('normal');
      
      // Should have values across visible range
      expect(spectrum.length).toBeGreaterThan(0);
      
      // At 550nm (green), should be ~1.0 for D65
      const greenPoint = spectrum.find(p => Math.abs(p.wavelength - 550) < 10);
      expect(greenPoint).toBeDefined();
      expect(greenPoint!.transmission).toBeGreaterThan(0.8);
    });
    
    it('should return UV-weighted spectrum for UV mode', () => {
      const provider = new SpectralPhysicsProvider();
      const spectrum = provider.getBackgroundSpectrum('uv');
      
      // Should have values in UV range
      const uvPoints = spectrum.filter(p => p.wavelength < 400);
      expect(uvPoints.length).toBeGreaterThan(0);
      
      // UV region should have significant intensity
      const hasUVIntensity = uvPoints.some(p => p.transmission > 0.5);
      expect(hasUVIntensity).toBe(true);
    });
    
    it('should return zero spectrum for dark mode', () => {
      const provider = new SpectralPhysicsProvider();
      const spectrum = provider.getBackgroundSpectrum('dark');
      
      // All values should be zero
      expect(spectrum.length).toBeGreaterThan(0);
      for (const point of spectrum) {
        expect(point.transmission).toBe(0);
      }
    });
  });

  describe('Transmission Spectrum', () => {
    it('should calculate material transmission at each wavelength', () => {
      const provider = new SpectralPhysicsProvider();
      const material = createMockMaterial(0.5);
      const props = createDefaultProps();
      
      const spectrum = provider.getTransmissionSpectrum(material, props);
      
      expect(spectrum.length).toBeGreaterThan(0);
      // All transmission values should be ~0.5 for this mock material
      for (const point of spectrum) {
        expect(point.transmission).toBeCloseTo(0.5, 1);
      }
    });
    
    it('should preserve wavelength information', () => {
      const provider = new SpectralPhysicsProvider();
      const material = createMockMaterial(1.0);
      const props = createDefaultProps();
      
      const spectrum = provider.getTransmissionSpectrum(material, props);
      
      // Check wavelength ordering
      for (let i = 1; i < spectrum.length; i++) {
        expect(spectrum[i].wavelength).toBeGreaterThan(spectrum[i-1].wavelength);
      }
    });
  });

  describe('Emission Spectrum with Kirchhoff\'s Law', () => {
    it('should return zero emission at room temperature', () => {
      const provider = new SpectralPhysicsProvider();
      const material = createMockMaterial(0.0); // Opaque
      const props = createDefaultProps(298); // Room temp
      
      const spectrum = provider.getEmissionSpectrum(material, props);
      
      // Room temperature is below Draper point - no visible emission
      for (const point of spectrum) {
        expect(point.transmission).toBeLessThan(0.001);
      }
    });
    
    it('should calculate emission using Kirchhoff\'s law at high temp', () => {
      const provider = new SpectralPhysicsProvider();
      const material = createMockMaterial(0.0); // Opaque (absorptivity = 1)
      const props = createDefaultProps(6500); // D65 temperature
      
      const spectrum = provider.getEmissionSpectrum(material, props);
      
      // At 6500K with full absorption, emission should be ~1.0 at 550nm
      const greenPoint = spectrum.find(p => Math.abs(p.wavelength - 550) < 10);
      expect(greenPoint).toBeDefined();
      expect(greenPoint!.transmission).toBeGreaterThan(0.8);
      expect(greenPoint!.transmission).toBeLessThan(1.2);
    });
    
    it('should emit less with transparent material (Kirchhoff)', () => {
      const provider = new SpectralPhysicsProvider();
      const opaqueMaterial = createMockMaterial(0.0); // absorptivity = 1
      const transparentMaterial = createMockMaterial(0.9); // absorptivity = 0.1
      const props = createDefaultProps(6500);
      
      const opaqueEmission = provider.getEmissionSpectrum(opaqueMaterial, props);
      const transparentEmission = provider.getEmissionSpectrum(transparentMaterial, props);
      
      // Find green wavelength for comparison
      const opaqueGreen = opaqueEmission.find(p => Math.abs(p.wavelength - 550) < 10);
      const transparentGreen = transparentEmission.find(p => Math.abs(p.wavelength - 550) < 10);
      
      // Opaque should emit more than transparent
      expect(opaqueGreen!.transmission).toBeGreaterThan(transparentGreen!.transmission * 5);
    });
    
    it('should show red > green > blue at 2000K', () => {
      const provider = new SpectralPhysicsProvider();
      const material = createMockMaterial(0.0);
      const props = createDefaultProps(2000);
      
      const spectrum = provider.getEmissionSpectrum(material, props);
      
      const blue = spectrum.find(p => Math.abs(p.wavelength - 450) < 10);
      const green = spectrum.find(p => Math.abs(p.wavelength - 550) < 10);
      const red = spectrum.find(p => Math.abs(p.wavelength - 650) < 10);
      
      expect(red!.transmission).toBeGreaterThan(green!.transmission);
      expect(green!.transmission).toBeGreaterThan(blue!.transmission);
    });
  });

  describe('Scattering Properties', () => {
    it('should return no scattering for clear material', () => {
      const provider = new SpectralPhysicsProvider();
      const material = createMockMaterial(1.0);
      const props = createDefaultProps();
      props.particleDensity = 0;
      
      const scattering = provider.getScatteringProperties(material, props);
      
      expect(scattering.coefficient).toBe(0);
    });
    
    it('should increase scattering with particle density', () => {
      const provider = new SpectralPhysicsProvider();
      const material = createMockMaterial(0.5);
      
      const clearProps = createDefaultProps();
      clearProps.particleDensity = 0;
      
      const cloudyProps = createDefaultProps();
      cloudyProps.particleDensity = 0.5;
      
      const clearScattering = provider.getScatteringProperties(material, clearProps);
      const cloudyScattering = provider.getScatteringProperties(material, cloudyProps);
      
      expect(cloudyScattering.coefficient).toBeGreaterThan(clearScattering.coefficient);
    });
    
    it('should increase scattering with depth', () => {
      const provider = new SpectralPhysicsProvider();
      const material = createMockMaterial(0.5);
      
      const shallowProps = createDefaultProps();
      shallowProps.depth = 0.01;
      shallowProps.particleDensity = 0.3;
      
      const deepProps = createDefaultProps();
      deepProps.depth = 0.1;
      deepProps.particleDensity = 0.3;
      
      const shallowScattering = provider.getScatteringProperties(material, shallowProps);
      const deepScattering = provider.getScatteringProperties(material, deepProps);
      
      // Deeper material = more scattering effect (longer path through particles)
      expect(deepScattering.coefficient).toBeGreaterThanOrEqual(shallowScattering.coefficient);
    });
  });

  describe('Aura Properties', () => {
    it('should return default aura properties', () => {
      const provider = new SpectralPhysicsProvider();
      const material = createMockMaterial(0.5);
      const props = createDefaultProps();
      
      const aura = provider.getAuraProperties(material, props);
      
      expect(aura.auraRadius).toBeDefined();
      expect(aura.auraDecay).toBeDefined();
      expect(aura.auraRadius).toBeGreaterThan(0);
      expect(aura.auraDecay).toBeGreaterThan(0);
    });
    
    it('should increase aura radius with temperature', () => {
      const provider = new SpectralPhysicsProvider();
      const material = createMockMaterial(0.0);
      
      const coolProps = createDefaultProps(1000);
      const hotProps = createDefaultProps(6500);
      
      const coolAura = provider.getAuraProperties(material, coolProps);
      const hotAura = provider.getAuraProperties(material, hotProps);
      
      // Hotter materials should have larger auras (more emission)
      expect(hotAura.auraRadius).toBeGreaterThanOrEqual(coolAura.auraRadius);
    });
  });

  describe('Resolution Independence', () => {
    it('should produce consistent results at different resolutions', () => {
      const provider = new SpectralPhysicsProvider();
      const material = createMockMaterial(0.5);
      const props = createDefaultProps(2000);
      
      // Get emission at two resolutions
      const lowRes = provider.getEmissionSpectrum(material, props, 10);
      const highRes = provider.getEmissionSpectrum(material, props, 100);
      
      // Find matching wavelengths and compare
      const lowRes550 = lowRes.find(p => Math.abs(p.wavelength - 550) < 20);
      const highRes550 = highRes.find(p => Math.abs(p.wavelength - 550) < 10);
      
      if (lowRes550 && highRes550) {
        // Should be within 30% of each other (resolution differences cause interpolation variance)
        const ratio = lowRes550.transmission / highRes550.transmission;
        expect(ratio).toBeGreaterThan(0.7);
        expect(ratio).toBeLessThan(1.3);
      }
    });
  });
});

