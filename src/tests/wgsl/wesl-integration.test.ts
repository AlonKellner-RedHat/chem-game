/**
 * WESL Integration Tests
 *
 * Tests that verify WESL runtime linking produces valid shader code
 * with all required entry points, struct definitions, and physics functions.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { link } from "wesl";
import linkConfig from "../../core/rendering/SpectralCompute.wesl?link";

// Entry point modules that contain @compute functions
const ENTRY_MODULES = [
  "package::wgsl::entry::main",        // main, integrateSpectrum
  "package::wgsl::entry::spectrum",    // computeSpectrumBox, averageSpectrum, finalCombine
  "package::wgsl::entry::blur_passes", // blurHorizontal, blurVertical, blurTransmittedH, blurTransmittedV
  "package::wgsl::entry::combine",     // initBackgroundSpectrum, applyLayerAbsorption, combineScattered, etc.
];

/**
 * Link all entry point modules and combine them
 * WESL tree-shakes each module independently, so we need to link all modules
 * containing @compute entry points to get all entry points in the shader.
 */
async function linkAllModules(): Promise<string> {
  const linkedModules = await Promise.all(
    ENTRY_MODULES.map((rootModuleName) =>
      link({ ...linkConfig, rootModuleName })
    )
  );
  
  // Combine all linked modules (they share common code but have unique entry points)
  // For testing, simple concatenation is sufficient since WESL mangles names
  return linkedModules.map(m => m.dest).join('\n\n// === NEXT MODULE ===\n\n');
}

describe("WESL Integration", () => {
  let shaderCode: string | null = null;

  beforeAll(async () => {
    try {
      shaderCode = await linkAllModules();
      console.log("[WESL Integration] Combined linked modules, length:", shaderCode.length);
    } catch (error) {
      console.warn("[WESL Integration] Failed to link:", error);
    }
  });

  describe("Runtime Linking", () => {
    it("should return a non-empty string", () => {
      expect(shaderCode).not.toBeNull();
      expect(typeof shaderCode).toBe("string");
      expect(shaderCode!.length).toBeGreaterThan(0);
    });

    it("should produce substantial output (linking should work)", () => {
      // All combined modules should be substantial (at least 20KB)
      expect(shaderCode!.length).toBeGreaterThan(20000);
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
      // The combined linked shader should be substantial (at least 20KB)
      expect(shaderCode!.length).toBeGreaterThan(20000);
    });

    it("should not have unresolved imports", () => {
      // WESL imports should be resolved - no import statements in output
      expect(shaderCode).not.toMatch(/^import\s+/m);
    });

    it("should not have WESL-specific module paths in code", () => {
      // Double colon module paths should not appear in actual code (only comments are OK)
      // Filter out comments and check remaining code
      const codeWithoutComments = shaderCode!.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(codeWithoutComments).not.toContain("package::");
    });
  });
});
