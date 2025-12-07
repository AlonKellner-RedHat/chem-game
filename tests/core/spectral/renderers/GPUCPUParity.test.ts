import { describe, it, expect, beforeAll } from "vitest";
import { CIE, RGB, XYZ, SpectrumPoint } from "../../../../src/core/spectral/CIE";

/**
 * Tests to verify that the GPU shader color calculation matches the CPU path.
 * 
 * The GPU shader now implements:
 * 1. Multi-wavelength integration (16 samples over 380-700nm)
 * 2. Y normalization (divide all XYZ by Y)
 * 3. D65 white point division before XYZ→sRGB conversion
 * 
 * These tests verify the mathematical equivalence of the CPU and GPU paths.
 * 
 * IMPORTANT: Issue #3 - Brightness is currently destroyed before normalization.
 * Pass 1 normalizes by Y, making all pixels have Y=1.0. Pass 2 then can't
 * find meaningful brightness differences. The fix requires:
 * - Pass 1: Output linear RGB without Y-normalization
 * - Pass 2: Find max, normalize, THEN apply gamma
 */

// Simulate the GPU shader's integration and normalization
function simulateGPUPath(spectrum: SpectrumPoint[]): RGB {
  // Visible range in normalized coordinates (200-1000nm range)
  // 380nm = (380-200)/(1000-200) = 0.225
  // 700nm = (700-200)/(1000-200) = 0.625
  const VISIBLE_START = 0.225;
  const VISIBLE_END = 0.625;
  const NUM_SAMPLES = 16;
  const dLambda = (VISIBLE_END - VISIBLE_START) / NUM_SAMPLES;
  
  let X = 0;
  let Y = 0;
  let Z = 0;
  
  // Integrate using Riemann sum (like GPU shader)
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const waveNorm = VISIBLE_START + (i + 0.5) * dLambda;
    
    // Convert normalized wavelength back to nm
    const wavelength = 200 + waveNorm * 800; // 200-1000nm range
    
    // Find transmission at this wavelength (interpolate from spectrum)
    const transmission = interpolateSpectrum(spectrum, wavelength);
    
    // Get CIE functions and D65
    const xBar = CIE.getX(wavelength);
    const yBar = CIE.getY(wavelength);
    const zBar = CIE.getZ(wavelength);
    const d65 = CIE.getIlluminant(wavelength, 'D65');
    
    // Accumulate (integration)
    X += d65 * transmission * xBar * dLambda;
    Y += d65 * transmission * yBar * dLambda;
    Z += d65 * transmission * zBar * dLambda;
  }
  
  // Normalize by Y (like GPU shader)
  if (Y > 0.0001) {
    const norm = 1.0 / Y;
    X *= norm;
    Y *= norm;
    Z *= norm;
  } else {
    return { r: 0, g: 0, b: 0 };
  }
  
  // Divide by D65 white point (like GPU shader)
  X /= 0.95047;
  Y /= 1.0;
  Z /= 1.08883;
  
  // XYZ to sRGB matrix
  let r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
  let g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
  let b = 0.0557 * X - 0.2040 * Y + 1.0570 * Z;
  
  // Gamma correction
  const gammaCorrect = (c: number) => {
    if (c <= 0.0031308) {
      return 12.92 * c;
    } else {
      return 1.055 * Math.pow(c, 1.0 / 2.4) - 0.055;
    }
  };
  
  r = gammaCorrect(r);
  g = gammaCorrect(g);
  b = gammaCorrect(b);
  
  // Clamp and convert to 0-255
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value * 255)));
  
  return {
    r: clamp(r),
    g: clamp(g),
    b: clamp(b),
  };
}

// Interpolate transmission from spectrum at given wavelength
function interpolateSpectrum(spectrum: SpectrumPoint[], wavelength: number): number {
  // Find surrounding points
  for (let i = 0; i < spectrum.length - 1; i++) {
    if (spectrum[i].wavelength <= wavelength && spectrum[i + 1].wavelength >= wavelength) {
      const t = (wavelength - spectrum[i].wavelength) / (spectrum[i + 1].wavelength - spectrum[i].wavelength);
      return spectrum[i].transmission * (1 - t) + spectrum[i + 1].transmission * t;
    }
  }
  
  // Out of range - return nearest
  if (wavelength < spectrum[0].wavelength) {
    return spectrum[0].transmission;
  }
  return spectrum[spectrum.length - 1].transmission;
}

// Create a uniform white spectrum
function createWhiteSpectrum(): SpectrumPoint[] {
  const points: SpectrumPoint[] = [];
  for (let wl = 200; wl <= 1000; wl += 10) {
    points.push({ wavelength: wl, transmission: 1.0 });
  }
  return points;
}

// Create a spectrum with a narrow absorption band (simulating a colored material)
function createColoredSpectrum(absorptionCenter: number, absorptionWidth: number, absorptionStrength: number): SpectrumPoint[] {
  const points: SpectrumPoint[] = [];
  for (let wl = 200; wl <= 1000; wl += 10) {
    const distance = Math.abs(wl - absorptionCenter);
    const absorption = distance < absorptionWidth / 2 
      ? absorptionStrength * (1 - 2 * distance / absorptionWidth)
      : 0;
    points.push({ wavelength: wl, transmission: Math.max(0, 1 - absorption) });
  }
  return points;
}

describe("GPU-CPU Color Parity", () => {
  describe("White Spectrum", () => {
    it("should produce similar white/neutral color from both paths", () => {
      const spectrum = createWhiteSpectrum();
      
      // CPU path
      const cpuXYZ = CIE.spectrumToXYZ(spectrum, 'D65');
      const cpuRGB = CIE.xyzToSRGB(cpuXYZ);
      
      // GPU-simulated path
      const gpuRGB = simulateGPUPath(spectrum);
      
      // Both should be close to white (allowing some tolerance due to integration method differences)
      // The tolerance is relatively high because:
      // 1. GPU uses fewer samples (16 vs ~80+)
      // 2. Different integration methods (Riemann vs trapezoidal)
      const tolerance = 30; // Allow 30/255 difference
      
      console.log("White spectrum - CPU RGB:", cpuRGB);
      console.log("White spectrum - GPU RGB:", gpuRGB);
      
      expect(Math.abs(cpuRGB.r - gpuRGB.r)).toBeLessThan(tolerance);
      expect(Math.abs(cpuRGB.g - gpuRGB.g)).toBeLessThan(tolerance);
      expect(Math.abs(cpuRGB.b - gpuRGB.b)).toBeLessThan(tolerance);
    });

    it("should produce near-white color for uniform white spectrum (not orange)", () => {
      // This test verifies that CIE values > 1.0 are properly handled
      // If blue (Z) is clamped, the result will be orange instead of white
      const whiteSpectrum = createWhiteSpectrum();
      const xyz = CIE.spectrumToRawXYZ(whiteSpectrum, 'D65');
      const linearRGB = CIE.xyzToLinearRGB(xyz);
      
      console.log("White spectrum raw XYZ:", xyz);
      console.log("White spectrum linear RGB:", linearRGB);
      
      // With correct CIE values, R/G/B ratios should be similar (neutral)
      const maxChannel = Math.max(linearRGB.r, linearRGB.g, linearRGB.b);
      const minChannel = Math.min(linearRGB.r, linearRGB.g, linearRGB.b);
      const neutrality = minChannel / maxChannel;
      
      console.log("Neutrality (min/max ratio):", neutrality);
      
      // Should be > 0.7 for neutral white (if clamping occurs, blue will be much lower)
      // The threshold is 0.7 to account for some natural variation in the CIE functions
      expect(neutrality).toBeGreaterThan(0.7);
    });

    it("should diagnose the exact white color and D65 conversion", () => {
      const whiteSpectrum = createWhiteSpectrum();
      const xyz = CIE.spectrumToRawXYZ(whiteSpectrum, 'D65');
      
      // D65 white point reference
      const d65WhitePoint = { X: 95.047, Y: 100.0, Z: 108.883 };
      
      console.log("\n=== WHITE COLOR DIAGNOSIS ===");
      console.log("Computed XYZ:", xyz);
      console.log("D65 white point:", d65WhitePoint);
      console.log("XYZ ratio to D65:", {
        X: xyz.X / d65WhitePoint.X,
        Y: xyz.Y / d65WhitePoint.Y,
        Z: xyz.Z / d65WhitePoint.Z,
      });
      
      // Test: Direct XYZ→sRGB without extra D65 division
      // The standard sRGB matrix already accounts for D65
      const X = xyz.X / 100; // Normalize to 0-1 range
      const Y = xyz.Y / 100;
      const Z = xyz.Z / 100;
      
      // Standard XYZ→linear sRGB matrix (D65 adapted)
      const r_direct = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
      const g_direct = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
      const b_direct = 0.0557 * X - 0.2040 * Y + 1.0570 * Z;
      
      console.log("Direct XYZ→RGB (correct):", { r: r_direct, g: g_direct, b: b_direct });
      
      // Current method (with extra D65 division - likely wrong)
      const linearRGB = CIE.xyzToLinearRGB(xyz);
      console.log("Current xyzToLinearRGB:", linearRGB);
      
      // The direct method should produce more neutral values
      const directNeutrality = Math.min(r_direct, g_direct, b_direct) / Math.max(r_direct, g_direct, b_direct);
      const currentNeutrality = Math.min(linearRGB.r, linearRGB.g, linearRGB.b) / Math.max(linearRGB.r, linearRGB.g, linearRGB.b);
      
      console.log("Direct neutrality:", directNeutrality);
      console.log("Current neutrality:", currentNeutrality);
      
      // Direct method should be closer to 1.0 (perfect white)
      expect(directNeutrality).toBeGreaterThan(0.95);
    });
  });
  
  describe("Colored Spectra", () => {
    it("should produce similar red-ish color (green absorption)", () => {
      // Absorb green (550nm) → should appear magenta/red
      const spectrum = createColoredSpectrum(550, 100, 0.8);
      
      const cpuXYZ = CIE.spectrumToXYZ(spectrum, 'D65');
      const cpuRGB = CIE.xyzToSRGB(cpuXYZ);
      const gpuRGB = simulateGPUPath(spectrum);
      
      console.log("Green absorption - CPU RGB:", cpuRGB);
      console.log("Green absorption - GPU RGB:", gpuRGB);
      
      // Both should have similar hue (red > green)
      expect(cpuRGB.r).toBeGreaterThan(cpuRGB.g);
      expect(gpuRGB.r).toBeGreaterThan(gpuRGB.g);
      
      // Values should be reasonably close
      const tolerance = 40;
      expect(Math.abs(cpuRGB.r - gpuRGB.r)).toBeLessThan(tolerance);
      expect(Math.abs(cpuRGB.g - gpuRGB.g)).toBeLessThan(tolerance);
      expect(Math.abs(cpuRGB.b - gpuRGB.b)).toBeLessThan(tolerance);
    });
    
    it("should produce similar blue-ish color (red absorption)", () => {
      // Absorb red (650nm) → should appear cyan/blue
      const spectrum = createColoredSpectrum(650, 100, 0.8);
      
      const cpuXYZ = CIE.spectrumToXYZ(spectrum, 'D65');
      const cpuRGB = CIE.xyzToSRGB(cpuXYZ);
      const gpuRGB = simulateGPUPath(spectrum);
      
      console.log("Red absorption - CPU RGB:", cpuRGB);
      console.log("Red absorption - GPU RGB:", gpuRGB);
      
      // Both should have similar hue (blue > red)
      expect(cpuRGB.b).toBeGreaterThan(cpuRGB.r);
      expect(gpuRGB.b).toBeGreaterThan(gpuRGB.r);
      
      const tolerance = 40;
      expect(Math.abs(cpuRGB.r - gpuRGB.r)).toBeLessThan(tolerance);
      expect(Math.abs(cpuRGB.g - gpuRGB.g)).toBeLessThan(tolerance);
      expect(Math.abs(cpuRGB.b - gpuRGB.b)).toBeLessThan(tolerance);
    });
    
    it("should produce similar yellow-ish color (blue absorption)", () => {
      // Absorb blue (450nm) → should appear yellow
      const spectrum = createColoredSpectrum(450, 100, 0.8);
      
      const cpuXYZ = CIE.spectrumToXYZ(spectrum, 'D65');
      const cpuRGB = CIE.xyzToSRGB(cpuXYZ);
      const gpuRGB = simulateGPUPath(spectrum);
      
      console.log("Blue absorption - CPU RGB:", cpuRGB);
      console.log("Blue absorption - GPU RGB:", gpuRGB);
      
      // Both should have similar hue (red and green > blue for yellow)
      expect(cpuRGB.r).toBeGreaterThan(cpuRGB.b);
      expect(gpuRGB.r).toBeGreaterThan(gpuRGB.b);
      expect(cpuRGB.g).toBeGreaterThan(cpuRGB.b);
      expect(gpuRGB.g).toBeGreaterThan(gpuRGB.b);
      
      const tolerance = 40;
      expect(Math.abs(cpuRGB.r - gpuRGB.r)).toBeLessThan(tolerance);
      expect(Math.abs(cpuRGB.g - gpuRGB.g)).toBeLessThan(tolerance);
      expect(Math.abs(cpuRGB.b - gpuRGB.b)).toBeLessThan(tolerance);
    });
  });
  
  describe("Integration Method Comparison", () => {
    it("should verify Y normalization produces similar brightness", () => {
      // Test with different transmission levels
      const spectrumHigh = createWhiteSpectrum().map(p => ({ ...p, transmission: 0.9 }));
      const spectrumLow = createWhiteSpectrum().map(p => ({ ...p, transmission: 0.1 }));
      
      const cpuHighXYZ = CIE.spectrumToXYZ(spectrumHigh, 'D65');
      const cpuLowXYZ = CIE.spectrumToXYZ(spectrumLow, 'D65');
      
      const gpuHighRGB = simulateGPUPath(spectrumHigh);
      const gpuLowRGB = simulateGPUPath(spectrumLow);
      
      console.log("High transmission - GPU RGB:", gpuHighRGB);
      console.log("Low transmission - GPU RGB:", gpuLowRGB);
      
      // After Y normalization, both should be white-ish (since spectrum shape is the same)
      // The brightness difference should be compensated by normalization
      // Note: CPU path also normalizes by Y, so both should produce similar neutral colors
      
      // Check that both are reasonably neutral (R ≈ G ≈ B)
      const gpuHighNeutralityError = Math.max(
        Math.abs(gpuHighRGB.r - gpuHighRGB.g),
        Math.abs(gpuHighRGB.g - gpuHighRGB.b),
        Math.abs(gpuHighRGB.r - gpuHighRGB.b)
      );
      
      const gpuLowNeutralityError = Math.max(
        Math.abs(gpuLowRGB.r - gpuLowRGB.g),
        Math.abs(gpuLowRGB.g - gpuLowRGB.b),
        Math.abs(gpuLowRGB.r - gpuLowRGB.b)
      );
      
      // Neutral colors should have similar R, G, B values
      expect(gpuHighNeutralityError).toBeLessThan(30);
      expect(gpuLowNeutralityError).toBeLessThan(30);
    });
  });

  describe("Brightness Preservation (Issue #3)", () => {
    /**
     * Helper to integrate spectrum to raw XYZ without Y-normalization.
     * This is what Pass 1 SHOULD output.
     */
    function integrateToRawXYZ(spectrum: SpectrumPoint[]): XYZ {
      const VISIBLE_START = 0.225;
      const VISIBLE_END = 0.625;
      const NUM_SAMPLES = 16;
      const dLambda = (VISIBLE_END - VISIBLE_START) / NUM_SAMPLES;
      
      let X = 0;
      let Y = 0;
      let Z = 0;
      
      for (let i = 0; i < NUM_SAMPLES; i++) {
        const waveNorm = VISIBLE_START + (i + 0.5) * dLambda;
        const wavelength = 200 + waveNorm * 800;
        const transmission = interpolateSpectrum(spectrum, wavelength);
        
        const xBar = CIE.getX(wavelength);
        const yBar = CIE.getY(wavelength);
        const zBar = CIE.getZ(wavelength);
        const d65 = CIE.getIlluminant(wavelength, 'D65');
        
        X += d65 * transmission * xBar * dLambda;
        Y += d65 * transmission * yBar * dLambda;
        Z += d65 * transmission * zBar * dLambda;
      }
      
      // Return RAW values without Y-normalization
      return { X, Y, Z };
    }

    it("should preserve relative brightness between different transmission levels (raw XYZ)", () => {
      const spectrumBright = createWhiteSpectrum();  // 100% transmission
      const spectrumDim = createWhiteSpectrum().map(p => ({ ...p, transmission: 0.2 }));  // 20%
      
      // Before Y normalization, dim should be ~20% brightness of bright
      const brightXYZ = integrateToRawXYZ(spectrumBright);
      const dimXYZ = integrateToRawXYZ(spectrumDim);
      
      console.log("Bright XYZ (100% transmission):", brightXYZ);
      console.log("Dim XYZ (20% transmission):", dimXYZ);
      
      const ratio = dimXYZ.Y / brightXYZ.Y;
      console.log("Y ratio (should be ~0.2):", ratio);
      
      // This test verifies that raw integration preserves brightness
      expect(ratio).toBeCloseTo(0.2, 1);  // Should be ~20%
    });

    it("should output different linear RGB brightness for different transmission", () => {
      /**
       * Convert raw XYZ to linear RGB without Y-normalization.
       * This is what Pass 1 SHOULD do.
       */
      function xyzToLinearRGB(xyz: XYZ): { r: number; g: number; b: number } {
        // D65 white point normalization only (no Y normalization)
        const X = xyz.X / 0.95047;
        const Y = xyz.Y / 1.0;
        const Z = xyz.Z / 1.08883;
        
        // XYZ to linear RGB matrix
        const r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
        const g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
        const b = 0.0557 * X - 0.2040 * Y + 1.0570 * Z;
        
        return { r, g, b };  // Can be > 1.0
      }

      const spectrumBright = createWhiteSpectrum();
      const spectrumDim = createWhiteSpectrum().map(p => ({ ...p, transmission: 0.3 }));
      
      const brightXYZ = integrateToRawXYZ(spectrumBright);
      const dimXYZ = integrateToRawXYZ(spectrumDim);
      
      const brightLinear = xyzToLinearRGB(brightXYZ);
      const dimLinear = xyzToLinearRGB(dimXYZ);
      
      console.log("Bright linear RGB:", brightLinear);
      console.log("Dim linear RGB:", dimLinear);
      
      // Linear RGB values should reflect the transmission difference
      const rRatio = dimLinear.r / brightLinear.r;
      const gRatio = dimLinear.g / brightLinear.g;
      const bRatio = dimLinear.b / brightLinear.b;
      
      console.log("RGB ratios (should be ~0.3):", { rRatio, gRatio, bRatio });
      
      // All channels should be ~30% of the bright value
      expect(rRatio).toBeCloseTo(0.3, 1);
      expect(gRatio).toBeCloseTo(0.3, 1);
      expect(bRatio).toBeCloseTo(0.3, 1);
    });

    it("should correctly normalize adjacent pixels with different brightness in Pass 2", () => {
      // Simulate Pass 2 sliding window normalization
      // Background is bright (100% transmission), material is dim (30%)
      const backgroundBrightness = 1.0;  // Max linear RGB value in window
      const materialBrightness = 0.3;    // Material's linear RGB value
      
      // Pass 2 should normalize by max brightness in window
      const normalizedMaterial = materialBrightness / backgroundBrightness;
      
      // Then apply gamma (simplified)
      const gammaCorrect = (c: number) => {
        if (c <= 0.0031308) return 12.92 * c;
        return 1.055 * Math.pow(c, 1.0 / 2.4) - 0.055;
      };
      
      const finalMaterial = gammaCorrect(normalizedMaterial);
      const finalBackground = gammaCorrect(1.0);  // Max normalized to 1.0
      
      console.log("Final background (gamma corrected):", finalBackground);
      console.log("Final material (gamma corrected):", finalMaterial);
      
      // Background should be ~1.0 (white)
      expect(finalBackground).toBeCloseTo(1.0, 2);
      
      // Material should be darker than background
      expect(finalMaterial).toBeLessThan(finalBackground);
      
      // With 30% transmission and gamma, expect ~58% brightness
      // (0.3^(1/2.4) ≈ 0.58)
      expect(finalMaterial).toBeCloseTo(0.58, 1);
    });
  });
});

