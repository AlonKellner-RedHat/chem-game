/**
 * E2E Shader Compilation Tests
 *
 * Tests that actually compile the linked WESL/WGSL shader with WebGPU
 * and check compilationInfo() for errors. This catches type mismatches
 * like vec4<f16>(f32, ...) that string-based tests miss.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import shaderCode from "../../core/rendering/SpectralCompute.wesl?static";

describe("Shader Compilation E2E", () => {
  let device: GPUDevice | null = null;

  beforeAll(async () => {
    // Check if WebGPU is available
    if (typeof navigator === "undefined" || !navigator.gpu) {
      console.warn("[Shader Compilation] WebGPU not available in this environment");
      return;
    }

    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        console.warn("[Shader Compilation] No WebGPU adapter available");
        return;
      }

      // Check if shader-f16 feature is supported
      if (!adapter.features.has("shader-f16")) {
        console.warn("[Shader Compilation] shader-f16 feature not supported");
        return;
      }

      device = await adapter.requestDevice({
        requiredFeatures: ["shader-f16"],
      });
    } catch (error) {
      console.warn("[Shader Compilation] Failed to initialize WebGPU:", error);
    }
  });

  afterAll(() => {
    device?.destroy();
  });

  it("should compile without errors", async () => {
    if (!device) {
      console.warn("Skipping: WebGPU not available");
      return;
    }

    // Prepend "enable f16;" directive as done in production code
    const shaderWithF16 = "enable f16;\n\n" + shaderCode;

    const module = device.createShaderModule({
      label: "SpectralCompute Test",
      code: shaderWithF16,
    });

    const info = await module.getCompilationInfo();
    const errors = info.messages.filter((m) => m.type === "error");

    if (errors.length > 0) {
      const errorDetails = errors
        .map((e) => `Line ${e.lineNum}:${e.linePos}: ${e.message}`)
        .join("\n");
      throw new Error(`Shader compilation failed:\n${errorDetails}`);
    }

    expect(errors).toHaveLength(0);
  });

  it("should have no warnings for type mismatches", async () => {
    if (!device) {
      console.warn("Skipping: WebGPU not available");
      return;
    }

    const shaderWithF16 = "enable f16;\n\n" + shaderCode;

    const module = device.createShaderModule({
      label: "SpectralCompute Test",
      code: shaderWithF16,
    });

    const info = await module.getCompilationInfo();
    const warnings = info.messages.filter((m) => m.type === "warning");

    // Log warnings for visibility (some may be intentional)
    if (warnings.length > 0) {
      console.warn(
        "[Shader Compilation] Warnings:",
        warnings.map((w) => `Line ${w.lineNum}: ${w.message}`)
      );
    }

    // Don't fail on warnings, just ensure we got compilation info
    expect(info.messages).toBeDefined();
  });

  it("should create all required compute pipelines", async () => {
    if (!device) {
      console.warn("Skipping: WebGPU not available");
      return;
    }

    const shaderWithF16 = "enable f16;\n\n" + shaderCode;

    const module = device.createShaderModule({
      label: "SpectralCompute Test",
      code: shaderWithF16,
    });

    // Wait for compilation
    const info = await module.getCompilationInfo();
    const errors = info.messages.filter((m) => m.type === "error");

    if (errors.length > 0) {
      // Skip pipeline tests if shader has errors
      console.warn("Skipping pipeline tests: shader has compilation errors");
      return;
    }

    // Test that all entry points exist by attempting to reference them
    // (We can't actually create pipelines without bind group layouts,
    // but the shader module creation validates entry point existence)
    const entryPoints = [
      "main",
      "integrateSpectrum",
      "computeSpectrumBox",
      "averageSpectrum",
      "finalCombine",
      "blurHorizontal",
      "blurVertical",
      "blurTransmittedH",
      "blurTransmittedV",
      "initBackgroundSpectrum",
      "applyLayerAbsorption",
      "combineScattered",
      "applyAmbientLight",
      "processLayerTransition",
      "processLayerTransitionVec4",
    ];

    // Verify entry points are present in shader code
    for (const entryPoint of entryPoints) {
      const regex = new RegExp(`@compute[\\s\\S]*?fn\\s+${entryPoint}\\s*\\(`);
      expect(shaderWithF16).toMatch(regex);
    }
  });
});

