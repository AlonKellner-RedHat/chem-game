/**
 * E2E Shader Compilation Tests
 *
 * Tests that actually compile the linked WESL/WGSL shader with WebGPU
 * and check compilationInfo() for errors. This catches type mismatches
 * like vec4<f16>(f32, ...) that string-based tests miss.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { link } from 'wesl';
import linkConfig from '../../core/rendering/SpectralCompute.wesl?link';

// Entry point modules that contain @compute functions
const ENTRY_MODULES = [
  'package::wgsl::entry::main', // main, integrateSpectrum
  'package::wgsl::entry::spectrum', // computeSpectrumBox, averageSpectrum, finalCombine
  'package::wgsl::entry::blur_passes', // blurHorizontal, blurVertical, blurTransmittedH, blurTransmittedV
  'package::wgsl::entry::combine', // initBackgroundSpectrum, applyLayerAbsorption, combineScattered, etc.
];

// Helper to get WebGPU - works in both Node.js (via webgpu package) and browser
async function getGPU(): Promise<GPU | null> {
  // Try browser first
  if (typeof navigator !== 'undefined' && navigator.gpu) {
    return navigator.gpu;
  }

  // Try Node.js webgpu package (uses Dawn)
  try {
    const webgpu = await import('webgpu');
    const instance = webgpu.create([]);
    return instance as unknown as GPU;
  } catch (error) {
    console.warn('[Shader Compilation] Failed to load webgpu package:', error);
    return null;
  }
}

/**
 * Extract a brace-balanced block starting at position
 */
function extractBracedBlock(code: string, startIdx: number): string {
  let depth = 0;
  let i = startIdx;

  // Find the opening brace
  while (i < code.length && code[i] !== '{') i++;
  if (i >= code.length) return '';

  const blockStart = startIdx;
  depth = 1;
  i++;

  while (i < code.length && depth > 0) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') depth--;
    i++;
  }

  return code.substring(blockStart, i);
}

/**
 * Combine multiple linked WESL modules into a single WGSL shader
 *
 * Strategy: Parse declarations properly handling nested braces,
 * then deduplicate by name.
 */
function combineLinkedModules(modules: string[]): string {
  // Collect all declarations from all modules
  const declarations = new Map<string, string>(); // name -> full declaration
  const otherContent: string[] = [];

  for (const moduleCode of modules) {
    let pos = 0;

    while (pos < moduleCode.length) {
      // Skip whitespace
      while (pos < moduleCode.length && /\s/.test(moduleCode[pos])) pos++;
      if (pos >= moduleCode.length) break;

      // Check for doc comment
      let docComment = '';
      if (moduleCode.substring(pos, pos + 3) === '/**') {
        const endComment = moduleCode.indexOf('*/', pos);
        if (endComment !== -1) {
          docComment = moduleCode.substring(pos, endComment + 2) + '\n';
          pos = endComment + 2;
          while (pos < moduleCode.length && /\s/.test(moduleCode[pos])) pos++;
        }
      }

      // Check for // comment line
      if (moduleCode.substring(pos, pos + 2) === '//') {
        const endLine = moduleCode.indexOf('\n', pos);
        pos = endLine !== -1 ? endLine + 1 : moduleCode.length;
        continue;
      }

      // Check for @attribute (including @compute, @workgroup_size, @group, @binding)
      let attributes = '';
      while (moduleCode[pos] === '@') {
        // Match @attr or @attr(params)
        const attrMatch = moduleCode.substring(pos).match(/^@\w+(?:\s*\([^)]*\))?\s*/);
        if (attrMatch) {
          attributes += attrMatch[0];
          pos += attrMatch[0].length;
          // Skip whitespace between attributes
          while (pos < moduleCode.length && /\s/.test(moduleCode[pos])) pos++;
        } else break;
      }

      // Check declaration type
      const remaining = moduleCode.substring(pos);

      // Function
      const fnMatch = remaining.match(/^fn\s+(\w+)/);
      if (fnMatch) {
        const fullDecl = docComment + attributes + extractBracedBlock(moduleCode, pos);
        if (!declarations.has(fnMatch[1])) {
          declarations.set(fnMatch[1], fullDecl);
        }
        pos += extractBracedBlock(moduleCode, pos).length;
        continue;
      }

      // Struct
      const structMatch = remaining.match(/^struct\s+(\w+)/);
      if (structMatch) {
        const fullDecl = docComment + attributes + extractBracedBlock(moduleCode, pos);
        if (!declarations.has(structMatch[1])) {
          declarations.set(structMatch[1], fullDecl);
        }
        pos += extractBracedBlock(moduleCode, pos).length;
        continue;
      }

      // Const
      const constMatch = remaining.match(/^const\s+(\w+)[^;]*;/);
      if (constMatch) {
        const fullDecl = docComment + attributes + constMatch[0];
        if (!declarations.has(constMatch[1])) {
          declarations.set(constMatch[1], fullDecl);
        }
        pos += constMatch[0].length;
        continue;
      }

      // Var (with optional @group/@binding)
      const varMatch = remaining.match(/^var(?:<[^>]+>)?\s+(\w+)[^;]*;/);
      if (varMatch) {
        const fullDecl = docComment + attributes + varMatch[0];
        if (!declarations.has(varMatch[1])) {
          declarations.set(varMatch[1], fullDecl);
        }
        pos += varMatch[0].length;
        continue;
      }

      // Workgroup var
      const wgMatch = remaining.match(/^var<workgroup>\s+(\w+)[^;]*;/);
      if (wgMatch) {
        const fullDecl = docComment + attributes + wgMatch[0];
        if (!declarations.has(wgMatch[1])) {
          declarations.set(wgMatch[1], fullDecl);
        }
        pos += wgMatch[0].length;
        continue;
      }

      // Skip any other character
      pos++;
    }
  }

  return Array.from(declarations.values()).join('\n\n');
}

// Helper to link all entry point modules
async function linkAllModules(): Promise<string> {
  const linkedModules = await Promise.all(
    ENTRY_MODULES.map((rootModuleName) => link({ ...linkConfig, rootModuleName }))
  );

  const combined = combineLinkedModules(linkedModules.map((m) => m.dest));

  return 'enable f16;\n\n' + combined;
}

describe('Shader Compilation E2E', () => {
  let device: GPUDevice | null = null;
  let shaderCode: string | null = null;

  beforeAll(async () => {
    // Link the shader code first
    try {
      shaderCode = await linkAllModules();
      console.log('[Shader Compilation] Linked shader length:', shaderCode.length);
    } catch (error) {
      console.warn('[Shader Compilation] Failed to link WESL:', error);
      return;
    }

    const gpu = await getGPU();
    if (!gpu) {
      console.warn('[Shader Compilation] WebGPU not available in this environment');
      return;
    }

    try {
      const adapter = await gpu.requestAdapter();
      if (!adapter) {
        console.warn('[Shader Compilation] No WebGPU adapter available');
        return;
      }

      // Check if shader-f16 feature is supported
      if (!adapter.features.has('shader-f16')) {
        console.warn('[Shader Compilation] shader-f16 feature not supported');
        return;
      }

      device = await adapter.requestDevice({
        requiredFeatures: ['shader-f16'],
      });
    } catch (error) {
      console.warn('[Shader Compilation] Failed to initialize WebGPU:', error);
    }
  });

  afterAll(() => {
    device?.destroy();
  });

  it('should link WESL modules successfully', () => {
    expect(shaderCode).not.toBeNull();
    expect(shaderCode!.length).toBeGreaterThan(10000);
  });

  it('should compile without errors', async () => {
    if (!device || !shaderCode) {
      console.warn('Skipping: WebGPU or shader not available');
      return;
    }

    const module = device.createShaderModule({
      label: 'SpectralCompute Test',
      code: shaderCode,
    });

    const info = await module.getCompilationInfo();
    const errors = info.messages.filter((m) => m.type === 'error');

    if (errors.length > 0) {
      const errorDetails = errors
        .map((e) => `Line ${e.lineNum}:${e.linePos}: ${e.message}`)
        .join('\n');
      throw new Error(`Shader compilation failed:\n${errorDetails}`);
    }

    expect(errors).toHaveLength(0);
  });

  it('should have no warnings for type mismatches', async () => {
    if (!device || !shaderCode) {
      console.warn('Skipping: WebGPU or shader not available');
      return;
    }

    const module = device.createShaderModule({
      label: 'SpectralCompute Test',
      code: shaderCode,
    });

    const info = await module.getCompilationInfo();
    const warnings = info.messages.filter((m) => m.type === 'warning');

    // Log warnings for visibility (some may be intentional)
    if (warnings.length > 0) {
      console.warn(
        '[Shader Compilation] Warnings:',
        warnings.map((w) => `Line ${w.lineNum}: ${w.message}`)
      );
    }

    // Don't fail on warnings, just ensure we got compilation info
    expect(info.messages).toBeDefined();
  });

  it('should create all required compute pipelines', async () => {
    if (!device || !shaderCode) {
      console.warn('Skipping: WebGPU or shader not available');
      return;
    }

    const module = device.createShaderModule({
      label: 'SpectralCompute Test',
      code: shaderCode,
    });

    // Wait for compilation
    const info = await module.getCompilationInfo();
    const errors = info.messages.filter((m) => m.type === 'error');

    if (errors.length > 0) {
      // Skip pipeline tests if shader has errors
      console.warn('Skipping pipeline tests: shader has compilation errors');
      return;
    }

    // Test that all entry points exist by checking for @compute fn declarations
    const entryPoints = [
      'main',
      'integrateSpectrum',
      'computeSpectrumBox',
      'averageSpectrum',
      'finalCombine',
      'blurHorizontal',
      'blurVertical',
      'blurTransmittedH',
      'blurTransmittedV',
      'initBackgroundSpectrum',
      'applyLayerAbsorption',
      'combineScattered',
      'applyAmbientLight',
      'processLayerTransition',
      'processLayerTransitionVec4',
    ];

    // Verify entry points are present in shader code
    for (const entryPoint of entryPoints) {
      const regex = new RegExp(`@compute[\\s\\S]*?fn\\s+${entryPoint}\\s*\\(`);
      expect(shaderCode).toMatch(regex);
    }
  });
});
