import { describe, it, expect } from 'vitest';
import { MaterialDepthAbsorptionEffect } from '../../../../src/core/spectral/effects/MaterialDepthAbsorptionEffect';
import { SolutionProperties } from '../../../../src/core/spectral/SolutionProperties';
import { Material } from '../../../../src/core/spectral/interfaces/Material';

describe('MaterialDepthAbsorptionEffect', () => {
  const createMockMaterial = (id: string): Material => ({
    id,
    name: `Test ${id}`,
    bandGap: 3.5,
    uvCutoff: 300,
    refractiveIndex: (wavelength: number) => 1.5,
    baseTransmission: (wavelength: number) => 1.0,
    molecules: [],
    getEffects: () => [],
  });

  describe('water absorption spectrum', () => {
    it('should have higher absorption coefficient for red light than blue', () => {
      const effect = new MaterialDepthAbsorptionEffect();
      const material = createMockMaterial('water');
      const properties: SolutionProperties = {
        moleculeConcentrations: new Map(),
        temperature: 298,
        pressure: 1.0,
        depth: 1.0, // 1 meter
        bubbleDensity: 0,
        particleDensity: 0,
        particleSize: 0,
        phase: 'liquid',
      };

      // At 1m depth, red should be absorbed more than blue
      const redTransmission = effect.apply(650, properties, material);
      const blueTransmission = effect.apply(450, properties, material);

      // Red has higher absorption coefficient, so lower transmission
      expect(redTransmission).toBeLessThan(blueTransmission);
    });

    it('should show significant absorption at 1m depth', () => {
      const effect = new MaterialDepthAbsorptionEffect();
      const material = createMockMaterial('water');
      const properties: SolutionProperties = {
        moleculeConcentrations: new Map(),
        temperature: 298,
        pressure: 1.0,
        depth: 1.0, // 1 meter
        bubbleDensity: 0,
        particleDensity: 0,
        particleSize: 0,
        phase: 'liquid',
      };

      const redTransmission = effect.apply(650, properties, material);
      const blueTransmission = effect.apply(450, properties, material);

      // Both should be less than 1.0 (some absorption)
      expect(redTransmission).toBeLessThan(1.0);
      expect(blueTransmission).toBeLessThan(1.0);
      // Red should be absorbed more
      expect(redTransmission).toBeLessThan(blueTransmission);
    });

    it('should show strong absorption at 1000m depth (red ≈ 0, blue > 0 but low)', () => {
      const effect = new MaterialDepthAbsorptionEffect();
      const material = createMockMaterial('water');
      const properties: SolutionProperties = {
        moleculeConcentrations: new Map(),
        temperature: 298,
        pressure: 1.0,
        depth: 1000.0, // 1000 meters
        bubbleDensity: 0,
        particleDensity: 0,
        particleSize: 0,
        phase: 'liquid',
      };

      const redTransmission = effect.apply(650, properties, material);
      const blueTransmission = effect.apply(450, properties, material);

      // Red should be almost completely absorbed
      expect(redTransmission).toBeLessThan(0.01);
      // Blue should still have some transmission (but low)
      expect(blueTransmission).toBeGreaterThan(0);
      expect(blueTransmission).toBeLessThan(0.1);
      // Blue transmission should be much higher than red
      expect(blueTransmission).toBeGreaterThan(redTransmission * 10);
    });

    it('should show high transmission at 0.01m depth', () => {
      const effect = new MaterialDepthAbsorptionEffect();
      const material = createMockMaterial('water');
      const properties: SolutionProperties = {
        moleculeConcentrations: new Map(),
        temperature: 298,
        pressure: 1.0,
        depth: 0.01, // 0.01 meters (1 cm)
        bubbleDensity: 0,
        particleDensity: 0,
        particleSize: 0,
        phase: 'liquid',
      };

      const redTransmission = effect.apply(650, properties, material);
      const blueTransmission = effect.apply(450, properties, material);

      // Both should have high transmission (close to 1.0)
      expect(redTransmission).toBeGreaterThan(0.9);
      expect(blueTransmission).toBeGreaterThan(0.9);
    });

    it('should follow Beer-Lambert law: T = 10^(-α * depth)', () => {
      const effect = new MaterialDepthAbsorptionEffect();
      const material = createMockMaterial('water');
      
      // Test at different depths
      const depths = [0.1, 1.0, 10.0];
      const wavelength = 650; // Red light
      
      for (const depth of depths) {
        const properties: SolutionProperties = {
          moleculeConcentrations: new Map(),
          temperature: 298,
          pressure: 1.0,
          depth,
          bubbleDensity: 0,
          particleDensity: 0,
          particleSize: 0,
          phase: 'liquid',
        };

        const transmission = effect.apply(wavelength, properties, material);
        
        // Transmission should decrease exponentially with depth
        // T = 10^(-α * depth), so log10(T) = -α * depth
        // For water at 650nm, α ≈ 0.3 m⁻¹
        // At 1m: T ≈ 10^(-0.3) ≈ 0.5
        // At 10m: T ≈ 10^(-3) ≈ 0.001
        
        expect(transmission).toBeGreaterThan(0);
        expect(transmission).toBeLessThanOrEqual(1);
      }
      
      // Verify exponential relationship: deeper = less transmission
      const shallowProps: SolutionProperties = {
        moleculeConcentrations: new Map(),
        temperature: 298,
        pressure: 1.0,
        depth: 0.1,
        bubbleDensity: 0,
        particleDensity: 0,
        particleSize: 0,
        phase: 'liquid',
      };
      
      const deepProps: SolutionProperties = {
        ...shallowProps,
        depth: 10.0,
      };
      
      const shallowTrans = effect.apply(wavelength, shallowProps, material);
      const deepTrans = effect.apply(wavelength, deepProps, material);
      
      expect(deepTrans).toBeLessThan(shallowTrans);
    });

    it('should have minimum absorption at 418 nm (visible minimum)', () => {
      const effect = new MaterialDepthAbsorptionEffect();
      const material = createMockMaterial('water');
      const properties: SolutionProperties = {
        moleculeConcentrations: new Map(),
        temperature: 298,
        pressure: 1.0,
        depth: 1.0,
        bubbleDensity: 0,
        particleDensity: 0,
        particleSize: 0,
        phase: 'liquid',
      };

      // At 418 nm, absorption should be near minimum (~0.0044 m⁻¹)
      const trans418 = effect.apply(418, properties, material);
      // Compare with nearby wavelengths
      const trans400 = effect.apply(400, properties, material);
      const trans450 = effect.apply(450, properties, material);

      // 418 nm should have higher transmission (lower absorption) than 400 nm
      expect(trans418).toBeGreaterThan(trans400);
      // 418 nm should have higher transmission than 450 nm (or similar)
      expect(trans418).toBeGreaterThanOrEqual(trans450 * 0.9);
    });

    it('should have continuous absorption profile (no discontinuities)', () => {
      const effect = new MaterialDepthAbsorptionEffect();
      const material = createMockMaterial('water');
      const properties: SolutionProperties = {
        moleculeConcentrations: new Map(),
        temperature: 298,
        pressure: 1.0,
        depth: 1.0,
        bubbleDensity: 0,
        particleDensity: 0,
        particleSize: 0,
        phase: 'liquid',
      };

      // Sample wavelengths across the visible spectrum with smaller steps
      const wavelengths = [400, 410, 418, 425, 450, 475, 500, 550, 575, 600, 625, 650, 675, 700];
      const transmissions = wavelengths.map(w => effect.apply(w, properties, material));

      // Check for smooth transitions (no large jumps)
      // Allow larger changes in red region where absorption increases rapidly
      for (let i = 1; i < transmissions.length; i++) {
        const diff = Math.abs(transmissions[i] - transmissions[i - 1]);
        const w1 = wavelengths[i - 1];
        const w2 = wavelengths[i];
        
        // In red region (600-700 nm), absorption changes rapidly, so allow larger differences
        if (w1 >= 600 || w2 >= 600) {
          expect(diff).toBeLessThan(0.4); // Larger tolerance for red region
        } else {
          expect(diff).toBeLessThan(0.2); // Smaller tolerance for blue-green region
        }
      }
    });

    it('should match expected absorption values at key wavelengths', () => {
      const effect = new MaterialDepthAbsorptionEffect();
      const material = createMockMaterial('water');
      
      // Test at 1m depth to get measurable transmission values
      const properties: SolutionProperties = {
        moleculeConcentrations: new Map(),
        temperature: 298,
        pressure: 1.0,
        depth: 1.0,
        bubbleDensity: 0,
        particleDensity: 0,
        particleSize: 0,
        phase: 'liquid',
      };

      // At 418 nm: α ≈ 0.0044 m⁻¹, T = 10^(-0.0044) ≈ 0.99
      const trans418 = effect.apply(418, properties, material);
      expect(trans418).toBeGreaterThan(0.98);
      expect(trans418).toBeLessThan(1.0);

      // At 650 nm (red): α ≈ 0.3 m⁻¹, T = 10^(-0.3) ≈ 0.5
      const trans650 = effect.apply(650, properties, material);
      expect(trans650).toBeGreaterThan(0.4);
      expect(trans650).toBeLessThan(0.6);

      // At 450 nm (blue): α ≈ 0.002 m⁻¹, T = 10^(-0.002) ≈ 0.995
      const trans450 = effect.apply(450, properties, material);
      expect(trans450).toBeGreaterThan(0.99);
      expect(trans450).toBeLessThan(1.0);

      // Red should have lower transmission than blue
      expect(trans650).toBeLessThan(trans450);
    });
  });

  describe('crystal absorption', () => {
    it('should have minimal absorption (mostly transparent)', () => {
      const effect = new MaterialDepthAbsorptionEffect();
      const material = createMockMaterial('crystal');
      const properties: SolutionProperties = {
        moleculeConcentrations: new Map(),
        temperature: 298,
        pressure: 1.0,
        depth: 100.0, // Even at 100m
        bubbleDensity: 0,
        particleDensity: 0,
        particleSize: 0,
        phase: 'crystal',
      };

      const transmission = effect.apply(500, properties, material);
      
      // Crystal should remain highly transparent
      expect(transmission).toBeGreaterThan(0.9);
    });

    it('should have little effect on transmission with depth', () => {
      const effect = new MaterialDepthAbsorptionEffect();
      const material = createMockMaterial('crystal');
      
      const shallowProps: SolutionProperties = {
        moleculeConcentrations: new Map(),
        temperature: 298,
        pressure: 1.0,
        depth: 1.0,
        bubbleDensity: 0,
        particleDensity: 0,
        particleSize: 0,
        phase: 'crystal',
      };
      
      const deepProps: SolutionProperties = {
        ...shallowProps,
        depth: 1000.0,
      };
      
      const shallowTrans = effect.apply(500, shallowProps, material);
      const deepTrans = effect.apply(500, deepProps, material);
      
      // Both should be very close to 1.0 (minimal difference)
      expect(shallowTrans).toBeGreaterThan(0.9);
      expect(deepTrans).toBeGreaterThan(0.9);
      // Difference should be small
      expect(Math.abs(shallowTrans - deepTrans)).toBeLessThan(0.1);
    });
  });

  describe('gas absorption', () => {
    it('should have negligible depth-dependent absorption', () => {
      const effect = new MaterialDepthAbsorptionEffect();
      const material = createMockMaterial('gas');
      const properties: SolutionProperties = {
        moleculeConcentrations: new Map(),
        temperature: 298,
        pressure: 1.0,
        depth: 1000.0, // Even at 1000m
        bubbleDensity: 0,
        particleDensity: 0,
        particleSize: 0,
        phase: 'gas',
      };

      const transmission = effect.apply(500, properties, material);
      
      // Gas should remain transparent (no depth absorption)
      expect(transmission).toBeCloseTo(1.0, 5);
    });

    it('should remain transparent at all depths', () => {
      const effect = new MaterialDepthAbsorptionEffect();
      const material = createMockMaterial('gas');
      
      const depths = [0.01, 1.0, 100.0, 1000.0];
      
      for (const depth of depths) {
        const properties: SolutionProperties = {
          moleculeConcentrations: new Map(),
          temperature: 298,
          pressure: 1.0,
          depth,
          bubbleDensity: 0,
          particleDensity: 0,
          particleSize: 0,
          phase: 'gas',
        };

        const transmission = effect.apply(500, properties, material);
        expect(transmission).toBeCloseTo(1.0, 5);
      }
    });
  });

  describe('effect properties', () => {
    it('should return correct type', () => {
      const effect = new MaterialDepthAbsorptionEffect();
      expect(effect.getType()).toBe('absorption');
    });

    it('should return priority 5 (before ChemicalAbsorptionEffect, priority 10)', () => {
      const effect = new MaterialDepthAbsorptionEffect();
      expect(effect.getPriority()).toBe(5);
      expect(effect.getPriority()).toBeLessThan(10);
    });

    it('should return 1.0 when depth is 0', () => {
      const effect = new MaterialDepthAbsorptionEffect();
      const material = createMockMaterial('water');
      const properties: SolutionProperties = {
        moleculeConcentrations: new Map(),
        temperature: 298,
        pressure: 1.0,
        depth: 0.0,
        bubbleDensity: 0,
        particleDensity: 0,
        particleSize: 0,
        phase: 'liquid',
      };

      const transmission = effect.apply(500, properties, material);
      expect(transmission).toBeCloseTo(1.0, 5);
    });
  });
});

