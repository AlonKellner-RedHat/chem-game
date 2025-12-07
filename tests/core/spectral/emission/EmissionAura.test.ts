import { describe, it, expect } from 'vitest';
import { EmissionAuraCalculator, AuraConfig } from '../../../../src/core/spectral/emission/EmissionAuraCalculator';
import { SpectrumPoint } from '../../../../src/core/spectral/CIE';

/**
 * Emission Aura Tests
 * 
 * Emission auras create a glow effect around emitting shapes:
 * - Full emission intensity inside shape
 * - Exponential decay outside shape
 * - Multiple shapes' auras blend additively
 * 
 * Spatial model:
 * - Inside shape: intensity = 1.0
 * - Outside shape: intensity = exp(-distance × decay)
 * - Blend: sum of all aura intensities, clamped to 1.0
 */
describe('EmissionAuraCalculator', () => {
  describe('Distance-based falloff', () => {
    it('should return full intensity inside shape (distance >= 0)', () => {
      const config: AuraConfig = {
        radius: 20,
        decay: 0.1,
      };
      
      const calculator = new EmissionAuraCalculator(config);
      
      // Distance > 0 means inside shape
      expect(calculator.getIntensity(10)).toBe(1.0);
      expect(calculator.getIntensity(5)).toBe(1.0);
      expect(calculator.getIntensity(0)).toBe(1.0);
    });
    
    it('should decay exponentially outside shape (distance < 0)', () => {
      const config: AuraConfig = {
        radius: 20,
        decay: 0.1,
      };
      
      const calculator = new EmissionAuraCalculator(config);
      
      // Negative distance means outside shape
      // intensity = exp(-|distance| × decay)
      const atEdge = calculator.getIntensity(-0.001); // Just outside
      const at5px = calculator.getIntensity(-5);
      const at10px = calculator.getIntensity(-10);
      
      expect(atEdge).toBeCloseTo(1.0, 2);
      expect(at5px).toBeCloseTo(Math.exp(-5 * 0.1), 5); // exp(-0.5) ≈ 0.607
      expect(at10px).toBeCloseTo(Math.exp(-10 * 0.1), 5); // exp(-1.0) ≈ 0.368
      
      // Should decay monotonically
      expect(at5px).toBeLessThan(atEdge);
      expect(at10px).toBeLessThan(at5px);
    });
    
    it('should return zero beyond aura radius', () => {
      const config: AuraConfig = {
        radius: 20,
        decay: 0.1,
      };
      
      const calculator = new EmissionAuraCalculator(config);
      
      expect(calculator.getIntensity(-21)).toBe(0);
      expect(calculator.getIntensity(-100)).toBe(0);
    });
    
    it('should handle different decay rates', () => {
      const fastDecay = new EmissionAuraCalculator({ radius: 20, decay: 0.5 });
      const slowDecay = new EmissionAuraCalculator({ radius: 20, decay: 0.1 });
      
      const distance = -5;
      const fastIntensity = fastDecay.getIntensity(distance);
      const slowIntensity = slowDecay.getIntensity(distance);
      
      // Faster decay should result in lower intensity at same distance
      expect(fastIntensity).toBeLessThan(slowIntensity);
      
      // Verify expected values
      expect(fastIntensity).toBeCloseTo(Math.exp(-5 * 0.5), 5); // exp(-2.5) ≈ 0.082
      expect(slowIntensity).toBeCloseTo(Math.exp(-5 * 0.1), 5); // exp(-0.5) ≈ 0.607
    });
  });
  
  describe('Emission scaling', () => {
    it('should scale emission spectrum by aura intensity', () => {
      const config: AuraConfig = {
        radius: 20,
        decay: 0.1,
      };
      
      const calculator = new EmissionAuraCalculator(config);
      
      const emission: SpectrumPoint[] = [
        { wavelength: 400, transmission: 1.0 },
        { wavelength: 500, transmission: 0.8 },
        { wavelength: 600, transmission: 0.5 },
      ];
      
      // Inside shape: full emission
      const insideScaled = calculator.scaleEmission(emission, 5);
      expect(insideScaled[0].transmission).toBe(1.0);
      expect(insideScaled[1].transmission).toBe(0.8);
      expect(insideScaled[2].transmission).toBe(0.5);
      
      // Outside shape at 10px: emission × exp(-1)
      const outsideScaled = calculator.scaleEmission(emission, -10);
      const expectedFactor = Math.exp(-10 * 0.1);
      expect(outsideScaled[0].transmission).toBeCloseTo(1.0 * expectedFactor, 5);
      expect(outsideScaled[1].transmission).toBeCloseTo(0.8 * expectedFactor, 5);
      expect(outsideScaled[2].transmission).toBeCloseTo(0.5 * expectedFactor, 5);
    });
  });
  
  describe('Multi-shape aura blending', () => {
    it('should blend auras from adjacent shapes additively', () => {
      const config: AuraConfig = {
        radius: 20,
        decay: 0.1,
      };
      
      const calculator = new EmissionAuraCalculator(config);
      
      // Two shapes, each contributing some aura at a point
      const aura1 = 0.5;
      const aura2 = 0.3;
      
      const blended = calculator.blendAuras([aura1, aura2]);
      expect(blended).toBe(0.8);
    });
    
    it('should clamp blended auras to 1.0', () => {
      const config: AuraConfig = {
        radius: 20,
        decay: 0.1,
      };
      
      const calculator = new EmissionAuraCalculator(config);
      
      // Three shapes with high aura overlap
      const aura1 = 0.6;
      const aura2 = 0.5;
      const aura3 = 0.4;
      
      const blended = calculator.blendAuras([aura1, aura2, aura3]);
      expect(blended).toBe(1.0); // Clamped from 1.5
    });
    
    it('should return 0 when no auras present', () => {
      const config: AuraConfig = {
        radius: 20,
        decay: 0.1,
      };
      
      const calculator = new EmissionAuraCalculator(config);
      
      expect(calculator.blendAuras([])).toBe(0);
    });
    
    it('should correctly blend emissions from adjacent shapes', () => {
      const config: AuraConfig = {
        radius: 20,
        decay: 0.1,
      };
      
      const calculator = new EmissionAuraCalculator(config);
      
      const emission1: SpectrumPoint[] = [
        { wavelength: 500, transmission: 1.0 },
      ];
      const emission2: SpectrumPoint[] = [
        { wavelength: 500, transmission: 0.5 },
      ];
      
      // Scale each emission by its aura intensity
      const scaled1 = calculator.scaleEmission(emission1, -5);
      const scaled2 = calculator.scaleEmission(emission2, -10);
      
      // Combine emissions additively
      const combined = calculator.combineEmissions([scaled1, scaled2]);
      
      const expected = scaled1[0].transmission + scaled2[0].transmission;
      expect(combined[0].transmission).toBeCloseTo(expected, 5);
    });
  });
  
  describe('Aura does not affect absorption', () => {
    it('should only affect emission, not absorption', () => {
      const config: AuraConfig = {
        radius: 20,
        decay: 0.1,
      };
      
      const calculator = new EmissionAuraCalculator(config);
      
      // This test documents the behavior: auras only apply to emission
      // Absorption is determined by whether the pixel is inside a shape
      
      const insideShape = calculator.affectsAbsorption(5);
      const outsideShape = calculator.affectsAbsorption(-5);
      
      expect(insideShape).toBe(false); // Aura doesn't affect absorption inside
      expect(outsideShape).toBe(false); // Aura doesn't affect absorption outside
    });
  });
  
  describe('Configuration', () => {
    it('should have sensible defaults', () => {
      const calculator = new EmissionAuraCalculator();
      
      expect(calculator.getConfig().radius).toBeGreaterThan(0);
      expect(calculator.getConfig().decay).toBeGreaterThan(0);
    });
    
    it('should allow custom configuration', () => {
      const config: AuraConfig = {
        radius: 50,
        decay: 0.2,
      };
      
      const calculator = new EmissionAuraCalculator(config);
      
      expect(calculator.getConfig().radius).toBe(50);
      expect(calculator.getConfig().decay).toBe(0.2);
    });
  });
});

