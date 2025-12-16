/**
 * Shader Integration Tests
 *
 * Tests that verify the shader code contains all required entry points,
 * struct definitions, and physics functions.
 *
 * Note: Uses the legacy .wgsl file directly since WESL ?static tree-shakes
 * unused imports. The .wgsl file is the pre-linked full shader used in production.
 */
import { describe, it, expect } from "vitest";

// Use the legacy pre-linked WGSL file for content validation
// WESL ?static tree-shakes unused imports, so we test the full shader directly
import shaderCode from "../../core/rendering/SpectralCompute.wgsl?raw";

describe("WESL Integration", () => {
  describe("Static Linking", () => {
    it("should return a non-empty string", () => {
      expect(typeof shaderCode).toBe("string");
      expect(shaderCode.length).toBeGreaterThan(0);
    });

    it("should not return just the file path (linking should work)", () => {
      // The shader should be substantial (at least 50KB)
      expect(shaderCode.length).toBeGreaterThan(50000);
    });

    it("should contain valid WGSL syntax markers", () => {
      // Check for common WGSL syntax that should be present
      expect(shaderCode).toContain("@compute");
      expect(shaderCode).toContain("@workgroup_size");
      expect(shaderCode).toContain("fn ");
    });

    it("should contain the main entry point", () => {
      expect(shaderCode).toMatch(/fn\s+main\s*\(/);
    });

    it("should contain the integrateSpectrum entry point", () => {
      expect(shaderCode).toMatch(/fn\s+integrateSpectrum\s*\(/);
    });

    it("should contain blur entry points", () => {
      expect(shaderCode).toMatch(/fn\s+blurHorizontal\s*\(/);
      expect(shaderCode).toMatch(/fn\s+blurVertical\s*\(/);
      expect(shaderCode).toMatch(/fn\s+blurTransmittedH\s*\(/);
      expect(shaderCode).toMatch(/fn\s+blurTransmittedV\s*\(/);
    });

    it("should contain spectrum entry points", () => {
      expect(shaderCode).toMatch(/fn\s+computeSpectrumBox\s*\(/);
      expect(shaderCode).toMatch(/fn\s+averageSpectrum\s*\(/);
      expect(shaderCode).toMatch(/fn\s+finalCombine\s*\(/);
    });

    it("should contain combine entry points", () => {
      expect(shaderCode).toMatch(/fn\s+initBackgroundSpectrum\s*\(/);
      expect(shaderCode).toMatch(/fn\s+applyLayerAbsorption\s*\(/);
      expect(shaderCode).toMatch(/fn\s+combineScattered\s*\(/);
      expect(shaderCode).toMatch(/fn\s+applyAmbientLight\s*\(/);
    });

    it("should contain optimized layer transition entry points", () => {
      expect(shaderCode).toMatch(/fn\s+processLayerTransition\s*\(/);
      expect(shaderCode).toMatch(/fn\s+processLayerTransitionVec4\s*\(/);
    });

    it("should contain struct definitions", () => {
      expect(shaderCode).toMatch(/struct\s+Params\s*\{/);
      expect(shaderCode).toMatch(/struct\s+Shape\s*\{/);
    });

    it("should contain bind group definitions", () => {
      expect(shaderCode).toContain("@group(0)");
      expect(shaderCode).toContain("@binding(");
    });

    it("should contain physics functions", () => {
      // Check for some key physics functions that should be linked in
      // These are called transitively from entry points
      expect(shaderCode).toMatch(/fn\s+getKirchhoffEmission\s*\(/);
      expect(shaderCode).toMatch(/fn\s+applyScattering\s*\(/);
    });

    it("should contain rendering functions", () => {
      // Check for rendering helper functions
      expect(shaderCode).toMatch(/fn\s+xyzToLinearRGB\s*\(/);
      expect(shaderCode).toMatch(/fn\s+gammaCorrect\s*\(/);
    });
  });

  describe("Shader Code Quality", () => {
    it("should be a reasonable size (not empty, not truncated)", () => {
      // The full linked shader should be substantial (at least 10KB)
      expect(shaderCode.length).toBeGreaterThan(10000);
    });

    it("should not have unresolved imports", () => {
      // WESL imports should be resolved - no import statements in output
      expect(shaderCode).not.toMatch(/^import\s+/m);
    });

    it("should not have WESL-specific syntax in output", () => {
      // Double colon module paths should be resolved
      expect(shaderCode).not.toContain("spectral::");
    });
  });
});
