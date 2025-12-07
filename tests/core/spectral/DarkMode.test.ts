import { describe, it, expect } from 'vitest';
import { SpectralPhysicsProvider } from '../../../src/core/spectral/SpectralPhysicsProvider';
import { SolutionProperties } from '../../../src/core/spectral/SolutionProperties';
import { Material } from '../../../src/core/spectral/interfaces/Material';
import { SpectralEffect } from '../../../src/core/spectral/interfaces/SpectralEffect';
import { CIE, SpectrumPoint } from '../../../src/core/spectral/CIE';

/**
 * Dark Mode Tests
 * 
 * Dark mode shows ONLY emission (no transmitted light).
 * This is useful for seeing black body radiation and fluorescence clearly.
 */
describe('Dark Mode', () => {
  const provider = new SpectralPhysicsProvider();
  
  // Helper to create a mock material with specific transmission
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
  
  const createProps = (temp: number = 298): SolutionProperties => ({
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
    it('should return zero for all wavelengths in dark mode', () => {
      const spectrum = provider.getBackgroundSpectrum('dark');
      
      expect(spectrum.length).toBeGreaterThan(0);
      
      for (const point of spectrum) {
        expect(point.transmission).toBe(0);
      }
    });
    
    it('should return non-zero for normal mode', () => {
      const spectrum = provider.getBackgroundSpectrum('normal');
      
      // D65 has significant intensity in visible range
      const visiblePoints = spectrum.filter(
        p => p.wavelength >= 400 && p.wavelength <= 700
      );
      
      const hasIntensity = visiblePoints.some(p => p.transmission > 0.5);
      expect(hasIntensity).toBe(true);
    });
  });
  
  describe('Emission Visibility', () => {
    it('should show only emission in dark mode with hot material', () => {
      const hotMaterial = createMaterial(0.1); // High absorption = high emissivity
      const hotProps = createProps(6500); // D65 temperature
      
      // In dark mode, background is zero
      const darkBackground = provider.getBackgroundSpectrum('dark');
      const transmission = provider.getTransmissionSpectrum(hotMaterial, hotProps);
      const emission = provider.getEmissionSpectrum(hotMaterial, hotProps);
      
      // Transmitted light in dark mode = 0 × transmission = 0
      const transmitted = darkBackground.map((bg, i) => ({
        wavelength: bg.wavelength,
        transmission: bg.transmission * (transmission[i]?.transmission ?? 1),
      }));
      
      // All transmitted light is zero
      for (const point of transmitted) {
        expect(point.transmission).toBe(0);
      }
      
      // But emission is non-zero
      const greenEmission = emission.find(p => Math.abs(p.wavelength - 550) < 10);
      expect(greenEmission).toBeDefined();
      expect(greenEmission!.transmission).toBeGreaterThan(0.5);
    });
    
    it('should show nothing for cold material in dark mode', () => {
      const coldMaterial = createMaterial(0.1);
      const coldProps = createProps(298); // Room temperature
      
      const emission = provider.getEmissionSpectrum(coldMaterial, coldProps);
      
      // Below Draper point, no visible emission
      for (const point of emission) {
        expect(point.transmission).toBeLessThan(0.001);
      }
    });
    
    it('should show red glow at low temperatures in dark mode', () => {
      const hotMaterial = createMaterial(0.0); // Opaque
      const props = createProps(2000); // Red glow temperature
      
      const emission = provider.getEmissionSpectrum(hotMaterial, props);
      
      const red = emission.find(p => Math.abs(p.wavelength - 650) < 10);
      const green = emission.find(p => Math.abs(p.wavelength - 550) < 10);
      const blue = emission.find(p => Math.abs(p.wavelength - 450) < 10);
      
      // At 2000K: red > green > blue
      expect(red!.transmission).toBeGreaterThan(green!.transmission);
      expect(green!.transmission).toBeGreaterThan(blue!.transmission);
    });
  });
  
  describe('Combined Spectrum', () => {
    it('should equal only emission in dark mode', () => {
      const material = createMaterial(0.1);
      const props = createProps(6500);
      
      const combined = provider.getCombinedSpectrum(material, props, 'dark');
      const emission = provider.getEmissionSpectrum(material, props);
      
      // Combined = background × transmission + emission
      // In dark mode: background = 0, so combined = emission
      for (let i = 0; i < combined.length; i++) {
        expect(combined[i].transmission).toBeCloseTo(emission[i].transmission, 3);
      }
    });
    
    it('should be brighter than emission alone in normal mode', () => {
      const material = createMaterial(0.1);
      const props = createProps(6500);
      
      const darkCombined = provider.getCombinedSpectrum(material, props, 'dark');
      const normalCombined = provider.getCombinedSpectrum(material, props, 'normal');
      
      // Normal mode has both transmitted + emitted light
      // Should be brighter than dark mode (emission only)
      const darkGreen = darkCombined.find(p => Math.abs(p.wavelength - 550) < 10);
      const normalGreen = normalCombined.find(p => Math.abs(p.wavelength - 550) < 10);
      
      expect(normalGreen!.transmission).toBeGreaterThan(darkGreen!.transmission);
    });
  });
  
  describe('Scattering in Dark Mode', () => {
    it('should preserve scattering blur in dark mode', () => {
      // Scattering still applies to emission
      // Content behind emitting shape is blurred
      
      const material = createMaterial(0.1);
      const props = createProps(6500);
      props.particleDensity = 0.5;
      
      const scattering = provider.getScatteringProperties(material, props);
      
      // Should still have scattering coefficient
      expect(scattering.coefficient).toBeGreaterThan(0);
    });
  });
  
  describe('Aura in Dark Mode', () => {
    it('should have visible aura around hot shapes in dark mode', () => {
      const material = createMaterial(0.0);
      const props = createProps(6500);
      
      const aura = provider.getAuraProperties(material, props);
      
      // Hot material should have aura radius
      expect(aura.auraRadius).toBeGreaterThan(0);
    });
    
    it('should have no aura for cold shapes in dark mode', () => {
      const material = createMaterial(0.0);
      const props = createProps(298);
      
      const emission = provider.getEmissionSpectrum(material, props);
      
      // Cold material has no emission, so aura is invisible
      // (Still has aura properties, but emission is zero)
      for (const point of emission) {
        expect(point.transmission).toBeLessThan(0.001);
      }
    });
  });
  
  describe('Color Conversion', () => {
    it('should convert dark mode emission to correct sRGB color', () => {
      const material = createMaterial(0.0);
      const props = createProps(2000);
      
      const emission = provider.getEmissionSpectrum(material, props);
      
      // Convert to sRGB for display
      const xyz = CIE.spectrumToRawXYZ(emission, 'D65');
      const rgb = CIE.xyzToLinearRGB(xyz);
      
      // At 2000K, should be reddish
      expect(rgb.r).toBeGreaterThan(rgb.g);
      expect(rgb.r).toBeGreaterThan(rgb.b);
    });
    
    it('should handle zero emission gracefully', () => {
      const material = createMaterial(0.0);
      const props = createProps(298);
      
      const emission = provider.getEmissionSpectrum(material, props);
      
      // Zero emission should produce black
      const xyz = CIE.spectrumToRawXYZ(emission, 'D65');
      
      expect(xyz.X).toBeLessThan(0.1);
      expect(xyz.Y).toBeLessThan(0.1);
      expect(xyz.Z).toBeLessThan(0.1);
    });
  });
});

