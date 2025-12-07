import { describe, it, expect } from "vitest";
import { CIETextureGenerator } from "../../../../src/core/spectral/shaders/CIETextureGenerator";
import { CIE } from "../../../../src/core/spectral/CIE";

/**
 * Tests for CIE texture generation precision.
 * 
 * Issue: CIE color matching functions have values > 1.0 (CIE Z peaks at ~1.77),
 * and D65 illuminant has values up to ~120. When these are stored in textures
 * using the current ShaderDataProvider.createMaterialTexture(), values are
 * clamped to [0, 1] before being stored as bytes, losing significant precision.
 * 
 * This causes the yellow background color issue - blue is under-represented
 * because CIE Z values are being clipped.
 */

describe("CIE Texture Generator", () => {
  describe("Raw CIE Values", () => {
    it("should have CIE Z values greater than 1.0", () => {
      // CIE Z (blue sensitivity) peaks around 1.77 at ~450nm
      const z450 = CIE.getZ(450);
      expect(z450).toBeGreaterThan(1.0);
      
      // Verify the peak is around the expected value
      expect(z450).toBeGreaterThan(1.5);
    });

    it("should have CIE X values greater than 1.0", () => {
      // CIE X peaks around 1.06 at ~600nm
      const x600 = CIE.getX(600);
      expect(x600).toBeGreaterThan(1.0);
    });

    it("should have D65 illuminant values normalized to ~1.0 range", () => {
      // D65 is normalized in CIE.getIlluminant() (divided by 100)
      // So values should be in 0-1 range with peak around 1.0
      const d65At550 = CIE.getIlluminant(550, 'D65');
      expect(d65At550).toBeGreaterThan(0.8);
      expect(d65At550).toBeLessThan(1.2);
      
      const d65At500 = CIE.getIlluminant(500, 'D65');
      expect(d65At500).toBeGreaterThan(0.8);
    });
  });

  describe("Generated Texture Data", () => {
    it("should normalize CIE Z values to [0,1] with scale factor for recovery", () => {
      const generator = new CIETextureGenerator();
      const textures = generator.generateCIETextures();
      
      // Find the maximum value in the Z texture (should be normalized to 1.0)
      const maxZ = Math.max(...textures.z);
      
      // Texture is now normalized to [0,1]
      expect(maxZ).toBeLessThanOrEqual(1.0);
      expect(maxZ).toBeGreaterThan(0.9); // Close to 1.0
      
      // Scale factor should allow recovery of original value (CIE Z peaks ~1.77)
      expect(textures.scales.z).toBeGreaterThan(1.5);
    });

    it("should normalize CIE X values to [0,1] with scale factor for recovery", () => {
      const generator = new CIETextureGenerator();
      const textures = generator.generateCIETextures();
      
      const maxX = Math.max(...textures.x);
      
      // Texture is now normalized to [0,1]
      expect(maxX).toBeLessThanOrEqual(1.0);
      expect(maxX).toBeGreaterThan(0.9);
      
      // Scale factor should allow recovery (CIE X peaks ~1.06)
      expect(textures.scales.x).toBeGreaterThan(1.0);
    });

    it("should normalize D65 values to [0,1] with scale factor", () => {
      const generator = new CIETextureGenerator();
      const textures = generator.generateCIETextures();
      
      const maxD65 = Math.max(...textures.d65);
      
      // Values should be normalized to [0,1]
      expect(maxD65).toBeGreaterThan(0.9);
      expect(maxD65).toBeLessThanOrEqual(1.0);
      
      // Scale factor exists (D65 is already ~1.0 max)
      expect(textures.scales.d65).toBeGreaterThan(0);
    });
  });

  describe("Texture Scale Factors", () => {
    it("should have CIE Z values that need scale factors", () => {
      // CIE Z peaks at ~1.77, which exceeds the 0-1 range
      // The shader needs to handle this either via:
      // 1. Scale factors passed as uniforms
      // 2. Or normalized texture + scale in shader
      const rawZValues: number[] = [];
      
      for (let wl = 380; wl <= 700; wl += 10) {
        rawZValues.push(CIE.getZ(wl));
      }
      
      const maxZ = Math.max(...rawZValues);
      
      // CIE Z should peak above 1.5 (actual ~1.77)
      expect(maxZ).toBeGreaterThan(1.5);
    });

    it("should have D65 values already normalized to ~1.0", () => {
      // D65 is pre-normalized in CIE.getIlluminant() (divided by 100)
      const rawD65Values: number[] = [];
      
      for (let wl = 380; wl <= 700; wl += 10) {
        rawD65Values.push(CIE.getIlluminant(wl, 'D65'));
      }
      
      const maxD65 = Math.max(...rawD65Values);
      
      // D65 should be in ~0-1 range after normalization
      expect(maxD65).toBeGreaterThan(0.9);
      expect(maxD65).toBeLessThan(1.2);
    });

    it("should return scale factors for each CIE texture", () => {
      const generator = new CIETextureGenerator();
      const result = generator.generateCIETextures();
      
      // Should have scale factors
      expect(result.scales).toBeDefined();
      expect(result.scales.x).toBeGreaterThan(1.0);  // CIE X peaks ~1.06
      expect(result.scales.z).toBeGreaterThan(1.5);  // CIE Z peaks ~1.77
      expect(result.scales.y).toBeGreaterThan(0);    // CIE Y peaks ~1.0
      expect(result.scales.d65).toBeGreaterThan(0);  // D65 is normalized
    });

    it("should normalize texture values to [0,1] range", () => {
      const generator = new CIETextureGenerator();
      const result = generator.generateCIETextures();
      
      // All textures should now be normalized to [0,1]
      const maxX = Math.max(...result.x);
      const maxY = Math.max(...result.y);
      const maxZ = Math.max(...result.z);
      const maxD65 = Math.max(...result.d65);
      
      expect(maxX).toBeLessThanOrEqual(1.0);
      expect(maxX).toBeGreaterThan(0.9);  // Close to 1.0 (the max)
      
      expect(maxY).toBeLessThanOrEqual(1.0);
      expect(maxY).toBeGreaterThan(0.9);
      
      expect(maxZ).toBeLessThanOrEqual(1.0);
      expect(maxZ).toBeGreaterThan(0.9);
      
      expect(maxD65).toBeLessThanOrEqual(1.0);
      expect(maxD65).toBeGreaterThan(0.9);
    });

    it("should allow recovery of original values using scale factors", () => {
      const generator = new CIETextureGenerator();
      const result = generator.generateCIETextures();
      
      // The max normalized value times scale should give original max
      const maxNormalizedZ = Math.max(...result.z);
      const recoveredMaxZ = maxNormalizedZ * result.scales.z;
      
      // Should recover the original CIE Z max
      // CIE Z peaks at ~1.77 in visible range, but we sample 200-1000nm
      // which includes regions where Z can be higher
      expect(recoveredMaxZ).toBeGreaterThan(1.5);
      
      // Verify the scale factor matches direct CIE query
      const rawZ450 = CIE.getZ(450); // Blue region where Z peaks
      expect(rawZ450).toBeGreaterThan(1.5);
    });
  });

  describe("White Spectrum Integration", () => {
    it("should produce near-white color for uniform white spectrum", () => {
      // A uniform white spectrum (transmission = 1.0 across all wavelengths)
      // should produce a near-white RGB output
      const whiteSpectrum = [];
      for (let wl = 380; wl <= 700; wl += 10) {
        whiteSpectrum.push({ wavelength: wl, transmission: 1.0 });
      }
      
      const xyz = CIE.spectrumToXYZ(whiteSpectrum, 'D65');
      const rgb = CIE.xyzToSRGB(xyz);
      
      // All channels should be close to 255 (white)
      // Allow some tolerance for color science precision
      expect(rgb.r).toBeGreaterThan(240);
      expect(rgb.g).toBeGreaterThan(240);
      expect(rgb.b).toBeGreaterThan(230); // Blue might be slightly lower
      
      // R, G, B should be similar (neutral color)
      const maxDiff = Math.max(
        Math.abs(rgb.r - rgb.g),
        Math.abs(rgb.g - rgb.b),
        Math.abs(rgb.r - rgb.b)
      );
      expect(maxDiff).toBeLessThan(20);
    });
  });
});

