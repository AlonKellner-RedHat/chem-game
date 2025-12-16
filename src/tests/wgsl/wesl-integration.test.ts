/**
 * WESL Integration Tests
 *
 * Tests that verify the WESL pipeline correctly links all modules
 * and produces valid WGSL shader code.
 */
import { describe, it, expect } from "vitest";

// Import the shader code using the ?static suffix
// This should produce linked WGSL code at build time
import shaderCode from "../../core/rendering/SpectralCompute.wesl?static";

describe("WESL Integration", () => {
  describe("Static Linking", () => {
    it("should return a non-empty string", () => {
      expect(typeof shaderCode).toBe("string");
      expect(shaderCode.length).toBeGreaterThan(0);
    });

    it("should not return just the file path (linking should work)", () => {
      // If wesl-plugin fails to transform (e.g., due to assetsInclude config),
      // Vite returns the file path as a string instead of linked WGSL.
      // This catches that specific failure mode - path appears as entire content.
      expect(shaderCode).not.toMatch(/^\/.*\.wesl\?static$/);
      expect(shaderCode).not.toMatch(/^\/core\/rendering\/.*$/);
      // The file path may appear in comments (usage example), but the output
      // should be much larger than just a path (linked code is ~50KB)
      expect(shaderCode.length).toBeGreaterThan(5000);
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
