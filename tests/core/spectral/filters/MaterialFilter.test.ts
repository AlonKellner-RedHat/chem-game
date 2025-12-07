import { describe, it, expect } from 'vitest';
import { MaterialFilter } from '../../../../src/core/spectral/filters/MaterialFilter';
import { SpectrumPoint } from '../../../../src/core/spectral/CIE';
import { Material } from '../../../../src/core/spectral/interfaces/Material';
import { SolutionProperties } from '../../../../src/core/spectral/SolutionProperties';
import { SpectralEffect } from '../../../../src/core/spectral/interfaces/SpectralEffect';

describe('MaterialFilter', () => {
  const createMockMaterial = (transmission: number, hasScattering: boolean = false): Material => {
    const mockEffect: SpectralEffect = {
      id: 'test-effect',
      name: 'Test Effect',
      apply: () => transmission,
      getType: () => (hasScattering ? 'scattering' : 'absorption'),
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

  const mockProperties: SolutionProperties = {
    moleculeConcentrations: new Map(),
    temperature: 298,
    pressure: 1.0,
    depth: 0.01,
    bubbleDensity: 0,
    particleDensity: 0,
    particleSize: 0,
    phase: 'liquid',
  };

  it('should have correct id', () => {
    const material = createMockMaterial(0.5);
    const filter = new MaterialFilter(material, mockProperties);
    expect(filter.id).toBe('material-test-material');
  });

  it('should support custom id', () => {
    const material = createMockMaterial(0.5);
    const filter = new MaterialFilter(material, mockProperties, 'custom-id');
    expect(filter.id).toBe('custom-id');
  });

  it('should apply material transmission to spectrum', () => {
    const material = createMockMaterial(0.5); // 50% transmission
    const filter = new MaterialFilter(material, mockProperties);
    const inputSpectrum: SpectrumPoint[] = [
      { wavelength: 400, transmission: 1.0 },
      { wavelength: 500, transmission: 0.8 },
      { wavelength: 600, transmission: 0.5 },
    ];

    const result = filter.apply(inputSpectrum, 100, 200);

    expect(result[0].transmission).toBeCloseTo(0.5); // 1.0 * 0.5
    expect(result[1].transmission).toBeCloseTo(0.4); // 0.8 * 0.5
    expect(result[2].transmission).toBeCloseTo(0.25); // 0.5 * 0.5
  });

  it('should handle full transmission material', () => {
    const material = createMockMaterial(1.0); // 100% transmission
    const filter = new MaterialFilter(material, mockProperties);
    const inputSpectrum: SpectrumPoint[] = [
      { wavelength: 400, transmission: 1.0 },
    ];

    const result = filter.apply(inputSpectrum, 100, 200);
    expect(result[0].transmission).toBe(1.0);
  });

  it('should handle opaque material', () => {
    const material = createMockMaterial(0.0); // 0% transmission
    const filter = new MaterialFilter(material, mockProperties);
    const inputSpectrum: SpectrumPoint[] = [
      { wavelength: 400, transmission: 1.0 },
    ];

    const result = filter.apply(inputSpectrum, 100, 200);
    expect(result[0].transmission).toBe(0.0);
  });

  it('should indicate scattering capability', () => {
    const nonScatteringMaterial = createMockMaterial(0.5, false);
    const scatteringMaterial = createMockMaterial(0.5, true);

    const nonScatteringFilter = new MaterialFilter(nonScatteringMaterial, mockProperties);
    const scatteringFilter = new MaterialFilter(scatteringMaterial, mockProperties);

    expect(nonScatteringFilter.canScatter()).toBe(false);
    expect(scatteringFilter.canScatter()).toBe(true);
  });

  it('should provide access to material and properties', () => {
    const material = createMockMaterial(0.5);
    const filter = new MaterialFilter(material, mockProperties);

    expect(filter.getMaterial()).toBe(material);
    expect(filter.getProperties()).toBe(mockProperties);
  });

  it('should preserve wavelength values', () => {
    const material = createMockMaterial(0.5);
    const filter = new MaterialFilter(material, mockProperties);
    const inputSpectrum: SpectrumPoint[] = [
      { wavelength: 400, transmission: 1.0 },
      { wavelength: 500, transmission: 1.0 },
      { wavelength: 600, transmission: 1.0 },
    ];

    const result = filter.apply(inputSpectrum, 100, 200);

    expect(result[0].wavelength).toBe(400);
    expect(result[1].wavelength).toBe(500);
    expect(result[2].wavelength).toBe(600);
  });

  describe('Black Body Emission', () => {
    it('should return input unchanged at room temperature (298K)', () => {
      const material = createMockMaterial(0.8);
      const roomTempProps: SolutionProperties = {
        ...mockProperties,
        temperature: 298, // Room temperature
      };
      const filter = new MaterialFilter(material, roomTempProps);
      const inputSpectrum: SpectrumPoint[] = [
        { wavelength: 500, transmission: 1.0 },
        { wavelength: 600, transmission: 1.0 },
        { wavelength: 700, transmission: 1.0 },
      ];

      const result = filter.apply(inputSpectrum, 100, 200);

      // At room temperature, emission should be negligible (below Draper point)
      // Only transmission should affect the result
      expect(result[0].transmission).toBeCloseTo(0.8, 1);
      expect(result[1].transmission).toBeCloseTo(0.8, 1);
      expect(result[2].transmission).toBeCloseTo(0.8, 1);
    });

    it('should add black body emission at 2000K', () => {
      const material = createMockMaterial(0.5);
      const hotProps: SolutionProperties = {
        ...mockProperties,
        temperature: 2000, // Hot enough for visible glow
      };
      const filter = new MaterialFilter(material, hotProps);
      const inputSpectrum: SpectrumPoint[] = [
        { wavelength: 500, transmission: 1.0 },
        { wavelength: 600, transmission: 1.0 },
        { wavelength: 700, transmission: 1.0 },
      ];

      const result = filter.apply(inputSpectrum, 100, 200);

      // At 2000K, emission should add to the transmitted light
      // Result should be > transmitted alone (0.5)
      expect(result[0].transmission).toBeGreaterThan(0.5);
      expect(result[1].transmission).toBeGreaterThan(0.5);
      expect(result[2].transmission).toBeGreaterThan(0.5);
    });

    it('should show higher emission at red than blue (black body curve at 2000K)', () => {
      const material = createMockMaterial(0.0); // Opaque - only emission visible
      const hotProps: SolutionProperties = {
        ...mockProperties,
        temperature: 2000,
      };
      const filter = new MaterialFilter(material, hotProps);
      const inputSpectrum: SpectrumPoint[] = [
        { wavelength: 450, transmission: 1.0 }, // Blue
        { wavelength: 550, transmission: 1.0 }, // Green
        { wavelength: 650, transmission: 1.0 }, // Red
      ];

      const result = filter.apply(inputSpectrum, 100, 200);

      // At 2000K, peak emission is in infrared, so red > green > blue in visible
      expect(result[2].transmission).toBeGreaterThan(result[1].transmission); // Red > Green
      expect(result[1].transmission).toBeGreaterThan(result[0].transmission); // Green > Blue
    });

    it('should produce non-zero output with zero input at high temp', () => {
      const material = createMockMaterial(0.0); // Opaque
      const hotProps: SolutionProperties = {
        ...mockProperties,
        temperature: 2000,
      };
      const filter = new MaterialFilter(material, hotProps);
      // Zero incoming light
      const inputSpectrum: SpectrumPoint[] = [
        { wavelength: 500, transmission: 0.0 },
        { wavelength: 600, transmission: 0.0 },
        { wavelength: 700, transmission: 0.0 },
      ];

      const result = filter.apply(inputSpectrum, 100, 200);

      // Even with no incoming light, hot material should emit
      expect(result[0].transmission).toBeGreaterThan(0);
      expect(result[1].transmission).toBeGreaterThan(0);
      expect(result[2].transmission).toBeGreaterThan(0);
    });
  });

  describe('Kirchhoff\'s Law (emissivity = absorptivity)', () => {
    /**
     * Kirchhoff's law states that at thermal equilibrium,
     * emissivity = absorptivity.
     * 
     * A material that absorbs 80% of light (transmission = 0.2)
     * should also emit with 80% efficiency.
     * 
     * This couples absorption and emission correctly.
     */
    it('should emit more when absorption is higher (Kirchhoff\'s law)', () => {
      // High absorption material (transmission = 0.1)
      const opaqueProps: SolutionProperties = {
        ...mockProperties,
        temperature: 6500, // D65 temperature for visible emission
      };
      const opaqueMaterial = createMockMaterial(0.1); // 90% absorption
      const opaqueFilter = new MaterialFilter(opaqueMaterial, opaqueProps);
      
      // Low absorption material (transmission = 0.9)
      const transparentMaterial = createMockMaterial(0.9); // 10% absorption
      const transparentFilter = new MaterialFilter(transparentMaterial, opaqueProps);
      
      const inputSpectrum: SpectrumPoint[] = [
        { wavelength: 550, transmission: 1.0 },
      ];
      
      const opaqueResult = opaqueFilter.apply(inputSpectrum, 100, 200);
      const transparentResult = transparentFilter.apply(inputSpectrum, 100, 200);
      
      // Opaque material should emit MORE (higher absorptivity = higher emissivity)
      // The emission contribution should be scaled by absorptivity
      // Opaque: 0.1 transmission + 0.9 * emission
      // Transparent: 0.9 transmission + 0.1 * emission
      // The difference in emission should favor the opaque material
      const opaqueEmission = opaqueResult[0].transmission - 0.1; // Subtract transmitted
      const transparentEmission = transparentResult[0].transmission - 0.9;
      
      expect(opaqueEmission).toBeGreaterThan(transparentEmission);
    });
    
    it('should emit zero when transmission is 1.0 (fully transparent)', () => {
      const transparentMaterial = createMockMaterial(1.0); // Fully transparent
      const hotProps: SolutionProperties = {
        ...mockProperties,
        temperature: 6500,
      };
      const filter = new MaterialFilter(transparentMaterial, hotProps);
      
      const inputSpectrum: SpectrumPoint[] = [
        { wavelength: 550, transmission: 1.0 },
      ];
      
      const result = filter.apply(inputSpectrum, 100, 200);
      
      // With 100% transmission, absorptivity = 0, so emission = 0
      // Result should be exactly the input (1.0)
      expect(result[0].transmission).toBeCloseTo(1.0, 4);
    });
    
    it('should emit maximum when transmission is 0.0 (fully opaque)', () => {
      const opaqueMaterial = createMockMaterial(0.0); // Fully opaque
      const hotProps: SolutionProperties = {
        ...mockProperties,
        temperature: 6500, // D65 temperature
      };
      const filter = new MaterialFilter(opaqueMaterial, hotProps);
      
      const inputSpectrum: SpectrumPoint[] = [
        { wavelength: 550, transmission: 1.0 },
      ];
      
      const result = filter.apply(inputSpectrum, 100, 200);
      
      // With 0% transmission, absorptivity = 1, so full emission
      // At 6500K, emission at 550nm should be ~1.0 (D65 reference)
      expect(result[0].transmission).toBeGreaterThan(0.8);
      expect(result[0].transmission).toBeLessThan(1.2);
    });
    
    it('should show visible glow at 2000K with high absorption', () => {
      const opaqueMaterial = createMockMaterial(0.0); // Fully opaque
      const hotProps: SolutionProperties = {
        ...mockProperties,
        temperature: 2000,
      };
      const filter = new MaterialFilter(opaqueMaterial, hotProps);
      
      const inputSpectrum: SpectrumPoint[] = [
        { wavelength: 650, transmission: 1.0 }, // Red wavelength
      ];
      
      const result = filter.apply(inputSpectrum, 100, 200);
      
      // At 2000K with full absorption, emission is ~0.04% of D65 at 650nm
      // This is physically accurate - Wien's peak for 2000K is at ~1450nm (IR)
      // The emission IS visible in a dark scene, but much dimmer than daylight
      expect(result[0].transmission).toBeGreaterThan(0.0001); // Visible but dim
      expect(result[0].transmission).toBeLessThan(0.01); // Much dimmer than D65
    });
    
    it('should show bright glow at 6500K with high absorption', () => {
      const opaqueMaterial = createMockMaterial(0.0); // Fully opaque
      const hotProps: SolutionProperties = {
        ...mockProperties,
        temperature: 6500, // D65 temperature
      };
      const filter = new MaterialFilter(opaqueMaterial, hotProps);
      
      const inputSpectrum: SpectrumPoint[] = [
        { wavelength: 550, transmission: 0.0 }, // Green - zero incoming light
      ];
      
      const result = filter.apply(inputSpectrum, 100, 200);
      
      // At 6500K with full absorption, emission is ~100% of D65
      // Even with no incoming light, the object glows brightly
      expect(result[0].transmission).toBeGreaterThan(0.9);
      expect(result[0].transmission).toBeLessThan(1.1);
    });
    
    it('should exceed D65 brightness at 10000K', () => {
      const opaqueMaterial = createMockMaterial(0.0); // Fully opaque
      const hotProps: SolutionProperties = {
        ...mockProperties,
        temperature: 10000, // Hotter than sun's surface
      };
      const filter = new MaterialFilter(opaqueMaterial, hotProps);
      
      const inputSpectrum: SpectrumPoint[] = [
        { wavelength: 550, transmission: 0.0 }, // Zero incoming light
      ];
      
      const result = filter.apply(inputSpectrum, 100, 200);
      
      // At 10000K, emission is brighter than D65 (6500K)
      expect(result[0].transmission).toBeGreaterThan(1.0);
    });
  });
});

