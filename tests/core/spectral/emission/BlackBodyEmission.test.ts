import { describe, it, expect } from 'vitest';
import { BlackBodyEmission } from '../../../../src/core/spectral/emission/BlackBodyEmission';

/**
 * Black Body Radiation Tests
 * 
 * Tests for Planck's law implementation:
 * B(λ,T) = (2hc²/λ⁵) × 1/(exp(hc/λkT) - 1)
 * 
 * Key physical properties to verify:
 * 1. Wien's displacement law: λ_max × T = 2.898×10⁶ nm·K
 * 2. Stefan-Boltzmann law: Total power ∝ T⁴
 * 3. Negligible visible emission below Draper point (798K)
 * 4. Color temperature progression: red → orange → yellow → white
 */
describe('BlackBodyEmission', () => {
  describe('Planck spectrum calculation', () => {
    it('should return zero emission at room temperature (298K)', () => {
      const emitter = new BlackBodyEmission();
      const spectrum = emitter.getSpectrum(298);
      
      // At room temperature, peak is at ~9700nm (far infrared)
      // Visible emission should be essentially zero
      const visibleEmission = spectrum.filter(p => p.wavelength >= 380 && p.wavelength <= 700);
      const maxVisible = Math.max(...visibleEmission.map(p => p.transmission));
      
      // Should be negligible (< 1e-10 relative to peak)
      expect(maxVisible).toBeLessThan(1e-10);
    });
    
    it('should produce visible red emission at 1273K (1000°C)', () => {
      const emitter = new BlackBodyEmission();
      const spectrum = emitter.getSpectrum(1273);
      
      // At 1273K, peak is at ~2280nm (infrared)
      // But there should be visible red emission
      const redEmission = spectrum.filter(p => p.wavelength >= 620 && p.wavelength <= 700);
      const blueEmission = spectrum.filter(p => p.wavelength >= 400 && p.wavelength <= 500);
      
      const maxRed = Math.max(...redEmission.map(p => p.transmission));
      const maxBlue = Math.max(...blueEmission.map(p => p.transmission));
      
      // Red should be significantly stronger than blue at this temperature
      expect(maxRed).toBeGreaterThan(maxBlue * 10);
      // Red should have measurable emission
      expect(maxRed).toBeGreaterThan(0);
    });
    
    it('should follow Wien\'s displacement law', () => {
      const emitter = new BlackBodyEmission();
      const WIEN_CONSTANT = 2.898e6; // nm·K
      
      // Test at several temperatures
      const temperatures = [1000, 2000, 3000, 5000, 6000];
      
      for (const T of temperatures) {
        const spectrum = emitter.getSpectrum(T, 200, 10000, 1000);
        
        // Find peak wavelength
        let peakWavelength = 0;
        let maxEmission = 0;
        for (const point of spectrum) {
          if (point.transmission > maxEmission) {
            maxEmission = point.transmission;
            peakWavelength = point.wavelength;
          }
        }
        
        // Wien's law: λ_max = WIEN_CONSTANT / T
        const expectedPeak = WIEN_CONSTANT / T;
        const tolerance = expectedPeak * 0.1; // 10% tolerance due to discretization
        
        expect(peakWavelength).toBeGreaterThan(expectedPeak - tolerance);
        expect(peakWavelength).toBeLessThan(expectedPeak + tolerance);
      }
    });
    
    it('should increase total emission with temperature (Stefan-Boltzmann)', () => {
      const emitter = new BlackBodyEmission();
      
      // Total emission should increase as T^4 across the FULL spectrum
      // Note: In the visible range only, the increase is much more dramatic
      // because at lower temps the peak is far in IR, so visible emission
      // grows faster than T^4 as the peak shifts toward visible
      
      // Test across full IR-to-UV range for proper T^4 behavior
      const spectrum1 = emitter.getSpectrum(3000, 200, 10000, 500);
      const spectrum2 = emitter.getSpectrum(4000, 200, 10000, 500);
      
      const total1 = spectrum1.reduce((sum, p) => sum + p.transmission, 0);
      const total2 = spectrum2.reduce((sum, p) => sum + p.transmission, 0);
      
      // At 4000K/3000K = 1.33×, total should be ~(1.33)^4 ≈ 3.16×
      const ratio = total2 / total1;
      const expectedRatio = Math.pow(4000 / 3000, 4); // ~3.16
      
      // Allow generous tolerance due to discretization and range limits
      expect(ratio).toBeGreaterThan(expectedRatio * 0.5);
      expect(ratio).toBeLessThan(expectedRatio * 2);
    });
    
    it('should peak in green-yellow for sun temperature (5778K)', () => {
      const emitter = new BlackBodyEmission();
      const spectrum = emitter.getSpectrum(5778, 380, 700, 100);
      
      // Find peak wavelength in visible range
      let peakWavelength = 0;
      let maxEmission = 0;
      for (const point of spectrum) {
        if (point.transmission > maxEmission) {
          maxEmission = point.transmission;
          peakWavelength = point.wavelength;
        }
      }
      
      // Sun's peak should be around 500nm (green)
      expect(peakWavelength).toBeGreaterThan(480);
      expect(peakWavelength).toBeLessThan(520);
    });
  });
  
  describe('Emission at specific wavelengths', () => {
    it('should return correct relative intensity at different wavelengths', () => {
      const emitter = new BlackBodyEmission();
      
      // At 3000K, red should be stronger than blue
      const redIntensity = emitter.getIntensityAt(650, 3000);
      const blueIntensity = emitter.getIntensityAt(450, 3000);
      
      expect(redIntensity).toBeGreaterThan(blueIntensity);
    });
    
    it('should handle edge cases (very low/high temperatures)', () => {
      const emitter = new BlackBodyEmission();
      
      // Very cold - should be essentially zero
      const coldEmission = emitter.getIntensityAt(550, 100);
      expect(coldEmission).toBeLessThan(1e-20);
      
      // Very hot - should still compute without overflow
      const hotEmission = emitter.getIntensityAt(550, 10000);
      expect(Number.isFinite(hotEmission)).toBe(true);
      expect(hotEmission).toBeGreaterThan(0);
    });
  });
  
  describe('Emissivity scaling', () => {
    it('should scale emission by emissivity factor', () => {
      const emitter = new BlackBodyEmission();
      
      const fullEmission = emitter.getSpectrum(2000, 380, 700, 10);
      const halfEmission = emitter.getSpectrum(2000, 380, 700, 10, 0.5);
      
      // All points should be scaled by emissivity
      for (let i = 0; i < fullEmission.length; i++) {
        const ratio = halfEmission[i].transmission / fullEmission[i].transmission;
        expect(ratio).toBeCloseTo(0.5, 5);
      }
    });
    
    it('should return zero emission for emissivity=0', () => {
      const emitter = new BlackBodyEmission();
      const spectrum = emitter.getSpectrum(2000, 380, 700, 10, 0);
      
      for (const point of spectrum) {
        expect(point.transmission).toBe(0);
      }
    });
  });
  
  describe('Color temperature', () => {
    it('should produce increasingly neutral color at higher temperatures', () => {
      const emitter = new BlackBodyEmission();
      
      // At low temperature, R >> G >> B (red glow)
      // At high temperature, R ≈ G ≈ B (white glow)
      
      const lowTemp = emitter.getSpectrum(1500, 380, 700, 100);
      const highTemp = emitter.getSpectrum(6500, 380, 700, 100);
      
      // Helper to get average in a range
      const avgInRange = (spectrum: { wavelength: number; transmission: number }[], min: number, max: number) => {
        const inRange = spectrum.filter(p => p.wavelength >= min && p.wavelength <= max);
        return inRange.reduce((sum, p) => sum + p.transmission, 0) / inRange.length;
      };
      
      // Low temp: red should dominate
      const lowR = avgInRange(lowTemp, 600, 700);
      const lowG = avgInRange(lowTemp, 500, 580);
      const lowB = avgInRange(lowTemp, 400, 500);
      expect(lowR).toBeGreaterThan(lowG);
      expect(lowG).toBeGreaterThan(lowB);
      
      // High temp: more balanced
      const highR = avgInRange(highTemp, 600, 700);
      const highG = avgInRange(highTemp, 500, 580);
      const highB = avgInRange(highTemp, 400, 500);
      const highRatio = highR / highB;
      const lowRatio = lowR / lowB;
      expect(highRatio).toBeLessThan(lowRatio); // More balanced at higher temp
    });
  });
  
  describe('isActive check', () => {
    it('should return false below Draper point (798K)', () => {
      const emitter = new BlackBodyEmission();
      
      expect(emitter.isActive(298)).toBe(false);  // Room temp
      expect(emitter.isActive(500)).toBe(false);  // Below Draper
      expect(emitter.isActive(750)).toBe(false);  // Just below
    });
    
    it('should return true at and above Draper point', () => {
      const emitter = new BlackBodyEmission();
      
      expect(emitter.isActive(798)).toBe(true);   // Draper point
      expect(emitter.isActive(1000)).toBe(true);  // Above
      expect(emitter.isActive(5000)).toBe(true);  // Well above
    });
  });
  
  describe('D65-Relative Normalization', () => {
    /**
     * The emission intensity should be normalized so that:
     * - 6500K (D65 daylight) produces intensity ~1.0 at 550nm
     * - Cooler objects (2000K) produce less intensity
     * - Hotter objects (10000K) produce more intensity
     * 
     * This makes emission comparable to the background illuminant.
     */
    it('should produce intensity ~1.0 at 6500K, 550nm (D65 reference)', () => {
      const emitter = new BlackBodyEmission();
      const intensity = emitter.getIntensityAt(550, 6500);
      
      // Should be close to 1.0 (within 10%)
      expect(intensity).toBeGreaterThan(0.9);
      expect(intensity).toBeLessThan(1.1);
    });
    
    it('should produce intensity < 1.0 at 2000K, 550nm (cooler = dimmer)', () => {
      const emitter = new BlackBodyEmission();
      const intensity = emitter.getIntensityAt(550, 2000);
      
      // 2000K is much cooler than 6500K, should be significantly dimmer
      // At 550nm (green), 2000K is very dim (~0.01% of D65)
      // This is physically accurate - Wien's peak for 2000K is ~1450nm
      expect(intensity).toBeLessThan(1.0);
      expect(intensity).toBeGreaterThan(0.00001); // Not zero, but very dim
      
      // Red wavelength should be brighter at 2000K
      const redIntensity = emitter.getIntensityAt(650, 2000);
      expect(redIntensity).toBeGreaterThan(intensity); // Red > green at 2000K
    });
    
    it('should produce intensity > 1.0 at 10000K, 550nm (hotter = brighter)', () => {
      const emitter = new BlackBodyEmission();
      const intensity = emitter.getIntensityAt(550, 10000);
      
      // 10000K is hotter than D65, should be brighter
      expect(intensity).toBeGreaterThan(1.0);
    });
    
    it('should support temperatures up to 10000K without overflow', () => {
      const emitter = new BlackBodyEmission();
      
      // Test at various high temperatures
      const temps = [7000, 8000, 9000, 10000];
      for (const T of temps) {
        const intensity = emitter.getIntensityAt(550, T);
        expect(Number.isFinite(intensity)).toBe(true);
        expect(intensity).toBeGreaterThan(0);
      }
    });
    
    it('should maintain correct relative brightness between temperatures', () => {
      const emitter = new BlackBodyEmission();
      
      const intensity3000 = emitter.getIntensityAt(550, 3000);
      const intensity6500 = emitter.getIntensityAt(550, 6500);
      const intensity10000 = emitter.getIntensityAt(550, 10000);
      
      // Should be monotonically increasing with temperature at 550nm
      expect(intensity3000).toBeLessThan(intensity6500);
      expect(intensity6500).toBeLessThan(intensity10000);
    });
  });
});

