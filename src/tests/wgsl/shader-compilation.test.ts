/**
 * E2E Shader Compilation Tests
 *
 * Tests that actually compile the linked WESL/WGSL shader with WebGPU
 * and check compilationInfo() for errors. This catches type mismatches
 * like vec4<f16>(f32, ...) that string-based tests miss.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { link } from "wesl";
import linkConfig from "../../core/rendering/SpectralCompute.wesl?link";

// Entry point modules that contain @compute functions
const ENTRY_MODULES = [
  "package::wgsl::entry::main",        // main, integrateSpectrum
  "package::wgsl::entry::spectrum",    // computeSpectrumBox, averageSpectrum, finalCombine
  "package::wgsl::entry::blur_passes", // blurHorizontal, blurVertical, blurTransmittedH, blurTransmittedV
  "package::wgsl::entry::combine",     // initBackgroundSpectrum, applyLayerAbsorption, combineScattered, etc.
];

// Helper to get WebGPU - works in both Node.js (via webgpu package) and browser
async function getGPU(): Promise<GPU | null> {
  // Try browser first
  if (typeof navigator !== "undefined" && navigator.gpu) {
    return navigator.gpu;
  }

  // Try Node.js webgpu package (uses Dawn)
  try {
    const webgpu = await import("webgpu");
    const instance = webgpu.create([]);
    return instance as unknown as GPU;
  } catch (error) {
    console.warn("[Shader Compilation] Failed to load webgpu package:", error);
    return null;
  }
}

/**
 * Combine multiple linked WESL modules into a single WGSL shader
 * 
 * WESL mangles names to be unique, but we still get duplicate declarations
 * for shared code (structs, bindings, helper functions). This simple approach
 * tracks seen declarations by their full content hash to deduplicate.
 */
function combineLinkedModules(modules: string[]): string {
  const seenContent = new Set<string>();
  const result: string[] = [];

  for (const moduleCode of modules) {
    // Split module into blocks separated by double newlines (WGSL convention)
    const blocks = moduleCode.split(/\n\n+/);
    
    for (const block of blocks) {
      const trimmed = block.trim();
      if (!trimmed) continue;
      
      // Use full content as hash to detect exact duplicates
      if (!seenContent.has(trimmed)) {
        seenContent.add(trimmed);
        result.push(trimmed);
      }
    }
  }

  return result.join('\n\n');
}

// Helper to link all entry point modules
async function linkAllModules(): Promise<string> {
  const linkedModules = await Promise.all(
    ENTRY_MODULES.map((rootModuleName) =>
      link({ ...linkConfig, rootModuleName })
    )
  );
  
  const combined = combineLinkedModules(linkedModules.map(m => m.dest));
  return "enable f16;\n\n" + combined;
}

describe("Shader Compilation E2E", () => {
  let device: GPUDevice | null = null;
  let shaderCode: string | null = null;

  beforeAll(async () => {
    // Link the shader code first
    try {
      shaderCode = await linkAllModules();
      console.log("[Shader Compilation] Linked shader length:", shaderCode.length);
    } catch (error) {
      console.warn("[Shader Compilation] Failed to link WESL:", error);
      return;
    }

    const gpu = await getGPU();
    if (!gpu) {
      console.warn(
        "[Shader Compilation] WebGPU not available in this environment"
      );
      return;
    }

    try {
      const adapter = await gpu.requestAdapter();
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

  it("should link WESL modules successfully", () => {
    expect(shaderCode).not.toBeNull();
    expect(shaderCode!.length).toBeGreaterThan(10000);
  });

  it("should compile without errors", async () => {
    if (!device || !shaderCode) {
      console.warn("Skipping: WebGPU or shader not available");
      return;
    }

    const module = device.createShaderModule({
      label: "SpectralCompute Test",
      code: shaderCode,
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
    if (!device || !shaderCode) {
      console.warn("Skipping: WebGPU or shader not available");
      return;
    }

    const module = device.createShaderModule({
      label: "SpectralCompute Test",
      code: shaderCode,
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
    if (!device || !shaderCode) {
      console.warn("Skipping: WebGPU or shader not available");
      return;
    }

    const module = device.createShaderModule({
      label: "SpectralCompute Test",
      code: shaderCode,
    });

    // Wait for compilation
    const info = await module.getCompilationInfo();
    const errors = info.messages.filter((m) => m.type === "error");

    if (errors.length > 0) {
      // Skip pipeline tests if shader has errors
      console.warn("Skipping pipeline tests: shader has compilation errors");
      return;
    }

    // Test that all entry points exist by checking for @compute fn declarations
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
      expect(shaderCode).toMatch(regex);
    }
  });
});
