/**
 * Spectral Compute Shader
 * 
 * Calculates per-pixel spectral values and integrates to RGB.
 * This is the WebGPU equivalent of the physics module,
 * implementing the same formulas in WGSL.
 * 
 * Uses MSDF (Multi-Channel Signed Distance Field) textures for
 * resolution-independent shape rendering with sharp corners.
 * 
 * ============================================================================
 * SHARED ARCHITECTURE: Unified Rendering & Spectrum Pipelines
 * ============================================================================
 * 
 * Both the rendering (16 samples) and spectrum plot (5000 samples) pipelines
 * use the SAME physics via computeLayerPhysics(). This ensures they stay aligned.
 * 
 * Key shared components (changes affect BOTH pipelines):
 * - computeLayerPhysics(): Core absorption, emission, scattering logic
 * - voigtWeight() / gaussianWeight(): Blur kernels
 * - getBackgroundIntensity(): Background illumination
 * - getMaterialTransmission(): Material absorption lookup
 * - applyScattering(): Rayleigh + Mie scattering
 * - getKirchhoffEmission(): Thermal emission
 * 
 * Rendering Pipeline (16 samples, full screen):
 * - initBackgroundSpectrum → applyLayerAbsorption → blur* → integrateSpectrum
 * 
 * Spectrum Pipeline (5000 samples, 30×30 box):
 * - initBackgroundSpectrum_HighRes → applyLayerAbsorption_HighRes → blur*_HighRes
 * - finalCombine_HighRes → averageSpectrum
 * 
 * The _HighRes entry points call the SAME computeLayerPhysics() function,
 * just with different resolution and buffer bindings.
 * 
 * ============================================================================
 * 
 * Multi-pass architecture:
 * - Pass 0 (main): Color computation for all pixels (16 wavelengths)
 * - Pass 1 (main): Normalization pass
 * - Pass 2 (High-Res): Layer-by-layer spectrum computation (5000 wavelengths)
 * - Pass 3 (averageSpectrum): GPU averaging over circular region
 */

enable f16;

// Physical constants
const D65_TEMPERATURE: f32 = 6500.0;
const VISIBLE_MIN: f32 = 380.0;
const VISIBLE_MAX: f32 = 700.0;

// Planck constant (derived for normalization)
const C2: f32 = 14387768.8;  // hc/k in nm·K

// Uniform parameters
struct Params {
  width: u32,
  height: u32,
  wavelengthMin: f32,
  wavelengthMax: f32,
  spectralResolution: u32,   // Low-res samples for color integration (16)
  backgroundMode: u32,       // 0=normal, 1=uv, 2=dark
  enableEmission: u32,
  sampleX: i32,              // -1 for no sampling, otherwise x coord
  sampleY: i32,              // -1 for no sampling, otherwise y coord
  isNormalizationPass: u32,  // 0 = compute pass (find max), 1 = normalize pass
  globalMaxIntensity: f32,   // Global max for normalization (used in pass 1)
  msdfPxRange: f32,          // MSDF pixel range (typically 4.0)
  numMaterials: u32,         // Number of materials in the palette
  plotResolution: u32,       // High-res samples for spectrum output (5000)
  averageRadius: u32,        // Radius in pixels to average spectrum over (default: 5)
  boxSize: u32,              // Size of spectrum box (default: 30)
  globalMaxScatterSigma: f32, // Global max scatter sigma for full-screen blur
  emissionSpreadFactor: f32,  // Fraction of emission that spreads sideways (0-1)
  emissionAuraSigma: f32,     // Gaussian sigma for emission aura blur
}

// Shape definition
struct Shape {
  x: f32,             // Position X
  y: f32,             // Position Y
  width: f32,         // Bounding box width
  height: f32,        // Bounding box height
  temperature: f32,   // For emission calculations
  layer: u32,         // Render order (0 = background, higher = foreground)
  materialIndex: u32, // Index into material textures
  maskIndex: u32,     // Index into MSDF textures
  texWidth: f32,      // MSDF texture width (for screenPxRange calculation)
  texHeight: f32,     // MSDF texture height
  smallParticleDensity: f32,  // Rayleigh scattering particle density (particles/cm³)
  largeParticleDensity: f32,  // Mie scattering particle density (particles/cm³)
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> shapes: array<Shape>;
@group(0) @binding(2) var<storage, read_write> rgbOutput: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> spectrumOutput: array<f32>;
@group(0) @binding(4) var<storage, read_write> maxPerPixel: array<f32>;

// Spectrum box buffer (boxSize² × plotResolution values, using f16 for memory bandwidth)
@group(0) @binding(5) var<storage, read_write> spectrumBox: array<f16>;

// Material palette texture (2D atlas: X=wavelength, Y=material index)
@group(1) @binding(0) var materialPalette: texture_2d<f32>;
@group(1) @binding(1) var materialSampler: sampler;

// CIE color matching function textures (2D with height=1)
@group(2) @binding(0) var cieXTexture: texture_2d<f32>;
@group(2) @binding(1) var cieYTexture: texture_2d<f32>;
@group(2) @binding(2) var cieZTexture: texture_2d<f32>;
@group(2) @binding(3) var cieSampler: sampler;

// CIE scale factors
@group(2) @binding(4) var<uniform> cieScales: vec4<f32>; // x, y, z, unused

// MSDF textures (rgba8unorm, RGB channels encode signed distances)
@group(3) @binding(0) var msdfTexture0: texture_2d<f32>;
@group(3) @binding(1) var msdfTexture1: texture_2d<f32>;
@group(3) @binding(2) var msdfTexture2: texture_2d<f32>;
@group(3) @binding(3) var msdfTexture3: texture_2d<f32>;
@group(3) @binding(4) var msdfSampler: sampler;

// Spectral buffers for per-layer scattering blur (ping-pong)
// Each stores 16 wavelength intensities per pixel using f16
// NOTE: Using group(0) bindings 6-10 to stay within WebGPU's 4 bind group limit
@group(0) @binding(6) var<storage, read_write> spectralInput: array<f16>;    // Input spectral buffer
@group(0) @binding(7) var<storage, read_write> spectralOutput: array<f16>;   // Output spectral buffer (transmitted + direct emission)
@group(0) @binding(8) var<storage, read_write> scatteringSigma: array<f32>;  // Per-pixel max blur sigma
@group(0) @binding(9) var<storage, read_write> scatterSource: array<f16>;    // Light to be scattered/blurred
@group(0) @binding(10) var<storage, read_write> emissionAura: array<f16>;    // Emission aura (wavelength-independent blur)

// NOTE: High-res spectrum uses the SAME buffer bindings (6-10) but with different
// buffer references. The TypeScript swaps the actual GPUBuffer objects to point
// to the high-res buffers when computing the spectrum plot.

// Number of spectral samples (must match TypeScript)
const SPECTRAL_SAMPLES: u32 = 16u;

// Blur constants
const MAX_BLUR_RADIUS: i32 = 64;           // Maximum blur radius in pixels
const RAYLEIGH_BLUR_SCALE: f32 = 1e-10;    // Scale factor for Rayleigh blur (increased for visibility)
const MIE_BLUR_SCALE: f32 = 1e-6;          // Scale factor for Mie blur (increased for visibility)

// ============================================================
// MSDF Functions
// ============================================================

/**
 * MSDF median function - extracts true signed distance from RGB
 * The median of the three channels gives corner-aware distance
 */
fn msdfMedian(rgb: vec3<f32>) -> f32 {
  return max(min(rgb.r, rgb.g), min(max(rgb.r, rgb.g), rgb.b));
}

/**
 * Sample MSDF texture by index
 */
fn sampleMSDFTexture(maskIndex: u32, uv: vec2<f32>) -> vec3<f32> {
  if (maskIndex == 0u) {
    return textureSampleLevel(msdfTexture0, msdfSampler, uv, 0.0).rgb;
  } else if (maskIndex == 1u) {
    return textureSampleLevel(msdfTexture1, msdfSampler, uv, 0.0).rgb;
  } else if (maskIndex == 2u) {
    return textureSampleLevel(msdfTexture2, msdfSampler, uv, 0.0).rgb;
  } else if (maskIndex == 3u) {
    return textureSampleLevel(msdfTexture3, msdfSampler, uv, 0.0).rgb;
  }
  // Default: solid white (fully inside)
  return vec3<f32>(0.0, 0.0, 0.0);
}

/**
 * Sample MSDF and return shape coverage (0.0 = outside, 1.0 = inside)
 * 
 * In compute shaders we can't use fwidth(), so we calculate the screen-space
 * pixel range based on the known relationship between shape size and texture size.
 * 
 * @param shapeScreenSize - The shape's size in screen pixels (width or height)
 */
fn sampleMSDF(maskIndex: u32, uv: vec2<f32>, pxRange: f32, texSize: vec2<f32>, shapeScreenSize: vec2<f32>) -> f32 {
  let msd = sampleMSDFTexture(maskIndex, uv);
  
  // Get signed distance: 0.5 = edge, >0.5 = inside, <0.5 = outside
  let sd = msdfMedian(msd) - 0.5;
  
  // Calculate screen-space pixel range without fwidth()
  // This is the ratio of: (pxRange in texture pixels) / (texture pixels per screen pixel)
  // texturePixelsPerScreenPixel = texSize / shapeScreenSize
  // So: screenPxRange = pxRange * (shapeScreenSize / texSize)
  let unitRange = vec2<f32>(pxRange) / texSize;
  let screenPxRangeVal = max(0.5 * dot(unitRange, shapeScreenSize), 1.0);
  
  // Scale signed distance by screen pixel range
  let screenPxDist = screenPxRangeVal * sd;
  
  // Hard mask with smooth AA at edges
  // smoothstep gives nice anti-aliased edges
  return smoothstep(-0.5, 0.5, screenPxDist);
}

/**
 * Get shape mask value at pixel coordinates using MSDF
 * Returns 0.0-1.0 based on MSDF sampling
 */
fn getShapeMask(shape: Shape, x: f32, y: f32) -> f32 {
  // Check if within bounding box
  if (x < shape.x || x >= shape.x + shape.width ||
      y < shape.y || y >= shape.y + shape.height) {
    return 0.0;
  }
  
  // Calculate UV coordinates relative to shape bounds
  let u = (x - shape.x) / shape.width;
  let v = (y - shape.y) / shape.height;
  let uv = vec2<f32>(u, v);
  
  // Sample MSDF texture with anti-aliasing
  let texSize = vec2<f32>(shape.texWidth, shape.texHeight);
  let shapeScreenSize = vec2<f32>(shape.width, shape.height);
  return sampleMSDF(shape.maskIndex, uv, params.msdfPxRange, texSize, shapeScreenSize);
}

// ============================================================
// Physics Functions
// ============================================================

/**
 * Get raw Planck radiance (unnormalized)
 */
fn getRawPlanckRadiance(wavelengthNm: f32, temperatureK: f32) -> f32 {
  if (temperatureK <= 0.0 || wavelengthNm <= 0.0) {
    return 0.0;
  }
  
  let exponent = C2 / (wavelengthNm * temperatureK);
  
  if (exponent > 700.0) {
    return 0.0;
  }
  
  let lambda = wavelengthNm * 1e-9;
  let expTerm = exp(exponent);
  
  if (expTerm <= 1.0) {
    return 0.0;
  }
  
  return 1.0 / (pow(lambda, 5.0) * (expTerm - 1.0));
}

// Cached D65 reference (precomputed)
// Using formula: 1.0 / (pow(lambda, 5.0) * (exp(C2/(lambda*T)) - 1.0))
// At 550nm, 6500K: lambda=5.5e-7m, exponent=4.024, expTerm-1=54.94
// raw = 1.0 / (5.033e-32 * 54.94) = 3.62e+29
const D65_REFERENCE: f32 = 3.62e+29;  // Raw Planck at 550nm, 6500K

/**
 * Get D65-normalized Planck radiance
 * Calculates at all temperatures (no Draper point cutoff)
 * for accurate spectral distribution simulation
 */
fn getPlanckRadiance(wavelengthNm: f32, temperatureK: f32) -> f32 {
  let raw = getRawPlanckRadiance(wavelengthNm, temperatureK);
  return raw / D65_REFERENCE;
}

/**
 * Kirchhoff emission: emissivity = absorptivity = 1 - transmission
 * Calculates at all temperatures for accurate spectral distribution
 */
fn getKirchhoffEmission(transmission: f32, wavelengthNm: f32, temperatureK: f32) -> f32 {
  let trans = clamp(transmission, 0.0, 1.0);
  let absorptivity = 1.0 - trans;
  return absorptivity * getPlanckRadiance(wavelengthNm, temperatureK);
}

/**
 * Get background intensity based on mode
 */
fn getBackgroundIntensity(wavelengthNm: f32) -> f32 {
  // Dark mode
  if (params.backgroundMode == 2u) {
    return 0.0;
  }
  
  // UV mode
  if (params.backgroundMode == 1u) {
    if (wavelengthNm < 200.0) { return 0.0; }
    if (wavelengthNm < 250.0) {
      let t = (wavelengthNm - 200.0) / 50.0;
      return 1.0 - (1.0 - t) * (1.0 - t);
    }
    if (wavelengthNm <= 350.0) { return 1.0; }
    if (wavelengthNm < 450.0) {
      let t = (wavelengthNm - 350.0) / 100.0;
      return 1.0 - t * t;
    }
    return 0.0;
  }
  
  // Normal mode
  if (wavelengthNm >= VISIBLE_MIN && wavelengthNm <= VISIBLE_MAX) {
    return 1.0;
  }
  if (wavelengthNm < VISIBLE_MIN) {
    if (wavelengthNm <= 250.0) { return 0.0; }
    let t = (wavelengthNm - 250.0) / (VISIBLE_MIN - 250.0);
    return 1.0 - (1.0 - t) * (1.0 - t);
  }
  if (wavelengthNm >= 850.0) { return 0.0; }
  let t = (wavelengthNm - VISIBLE_MAX) / (850.0 - VISIBLE_MAX);
  return 1.0 - t * t;
}

/**
 * Sample material transmission at wavelength from palette
 */
fn getMaterialTransmission(materialIndex: u32, wavelengthNm: f32) -> f32 {
  // Handle case when no materials are loaded
  if (params.numMaterials == 0u) {
    return 1.0;
  }
  
  // U coordinate: wavelength position
  let u = (wavelengthNm - params.wavelengthMin) / (params.wavelengthMax - params.wavelengthMin);
  
  // V coordinate: center of the row for this material
  let v = (f32(materialIndex) + 0.5) / f32(params.numMaterials);
  
  return textureSampleLevel(materialPalette, materialSampler, vec2<f32>(u, v), 0.0).r;
}

/**
 * Get CIE color matching function values
 */
fn getCIE(wavelengthNm: f32) -> vec3<f32> {
  if (wavelengthNm < VISIBLE_MIN || wavelengthNm > VISIBLE_MAX) {
    return vec3<f32>(0.0, 0.0, 0.0);
  }
  
  let u = (wavelengthNm - VISIBLE_MIN) / (VISIBLE_MAX - VISIBLE_MIN);
  let uv = vec2<f32>(u, 0.5);  // Use vec2 for 2D texture sampling
  
  let x = textureSampleLevel(cieXTexture, cieSampler, uv, 0.0).r * cieScales.x;
  let y = textureSampleLevel(cieYTexture, cieSampler, uv, 0.0).r * cieScales.y;
  let z = textureSampleLevel(cieZTexture, cieSampler, uv, 0.0).r * cieScales.z;
  
  return vec3<f32>(x, y, z);
}

/**
 * Convert XYZ to linear RGB
 */
fn xyzToLinearRGB(xyz: vec3<f32>) -> vec3<f32> {
  let r = 3.2406 * xyz.x - 1.5372 * xyz.y - 0.4986 * xyz.z;
  let g = -0.9689 * xyz.x + 1.8758 * xyz.y + 0.0415 * xyz.z;
  let b = 0.0557 * xyz.x - 0.2040 * xyz.y + 1.0570 * xyz.z;
  return vec3<f32>(r, g, b);
}

/**
 * Apply sRGB gamma correction
 */
fn gammaCorrect(linear: f32) -> f32 {
  if (linear <= 0.0) { return 0.0; }
  if (linear <= 0.0031308) {
    return 12.92 * linear;
  }
  return 1.055 * pow(linear, 1.0 / 2.4) - 0.055;
}

// ============================================================
// Scattering Functions (Rayleigh and Mie)
// ============================================================

// Scattering reference coefficients (matched to CPU implementation)
const RAYLEIGH_COEFF: f32 = 5e-24;
const MIE_COEFF: f32 = 5e-16;

// Default particle sizes
const SMALL_PARTICLE_SIZE: f32 = 50.0;   // nm (Rayleigh)
const LARGE_PARTICLE_SIZE: f32 = 1000.0; // nm (Mie)

// Dual-path scattering fractions for physically correct light redistribution:
// - IN_SHAPE: Light that scatters but stays within the shape (blur->mask)
//   Background bleeds INTO shape, preventing dark edges
// - AURA: Light that escapes the shape as a subtle glow (mask->blur)
//   Shape light bleeds OUT to surrounding pixels
const IN_SHAPE_SCATTER_FRACTION: f32 = 0.95;  // 95% stays in shape (visual haze)
const AURA_SCATTER_FRACTION: f32 = 0.05;      // 5% bleeds outside as aura

/**
 * Rayleigh scattering coefficient
 * Scales as 1/λ⁴ - blue light scatters more than red
 * 
 * @param wavelengthNm - Wavelength in nanometers
 * @param density - Particle density (particles/cm³)
 * @return Scattering coefficient (per cm)
 */
fn getRayleighScattering(wavelengthNm: f32, density: f32) -> f32 {
  if (density <= 0.0 || wavelengthNm <= 0.0) {
    return 0.0;
  }
  
  // Core Rayleigh formula: σ ∝ n × d⁶ / λ⁴
  let lambda4 = pow(wavelengthNm, 4.0);
  let d6 = pow(SMALL_PARTICLE_SIZE, 6.0);
  
  return density * d6 * RAYLEIGH_COEFF / lambda4;
}

/**
 * Mie scattering coefficient
 * Roughly wavelength-independent for large particles
 * 
 * @param wavelengthNm - Wavelength in nanometers
 * @param density - Particle density (particles/cm³)
 * @return Scattering coefficient (per cm)
 */
fn getMieScattering(wavelengthNm: f32, density: f32) -> f32 {
  if (density <= 0.0 || wavelengthNm <= 0.0) {
    return 0.0;
  }
  
  // Size parameter: x = πd/λ
  let x = 3.14159 * LARGE_PARTICLE_SIZE / wavelengthNm;
  
  // For small x, transition to Rayleigh
  if (x < 0.3) {
    return getRayleighScattering(wavelengthNm, density);
  }
  
  // Mie regime: Q_sca ≈ 2 × (1 - exp(-x²/10))
  let Qsca = 2.0 * (1.0 - exp(-x * x / 10.0));
  
  // Geometric cross-section: π × r²
  let radius = LARGE_PARTICLE_SIZE / 2.0;
  let geometricCrossSection = 3.14159 * radius * radius;
  
  return density * Qsca * geometricCrossSection * MIE_COEFF;
}

/**
 * Apply scattering attenuation
 * Uses Beer-Lambert exponential decay
 * 
 * @param intensity - Input intensity
 * @param wavelengthNm - Wavelength in nm
 * @param smallDensity - Rayleigh particle density
 * @param largeDensity - Mie particle density  
 * @param pathLength - Path length in cm
 * @return Scattered (attenuated) intensity
 */
fn applyScattering(
  intensity: f32,
  wavelengthNm: f32,
  smallDensity: f32,
  largeDensity: f32,
  pathLength: f32
) -> f32 {
  if (pathLength <= 0.0) {
    return intensity;
  }
  
  let rayleigh = getRayleighScattering(wavelengthNm, smallDensity);
  let mie = getMieScattering(wavelengthNm, largeDensity);
  let totalScatter = (rayleigh + mie) * pathLength;
  
  return intensity * exp(-totalScatter);
}

// ============================================================

/**
 * Compute spectral intensity at a pixel for a specific wavelength
 * Shared by both color and spectrum computation
 * 
 * Applies in order:
 * 1. Background illumination
 * 2. Material absorption (Beer-Lambert)
 * 3. Scattering (Rayleigh + Mie)
 * 4. Thermal emission (Kirchhoff)
 */
fn computePixelIntensity(px: f32, py: f32, wavelength: f32, numShapes: u32) -> f32 {
  // Start with background
  var intensity = getBackgroundIntensity(wavelength);
  var totalTransmission = 1.0;
  var emission = 0.0;
  var scatteringMultiplier = 1.0;
  
  // Apply all shapes
  for (var i: u32 = 0u; i < numShapes; i++) {
    let mask = getShapeMask(shapes[i], px, py);
    if (mask > 0.0) {
      let shape = shapes[i];
      let materialTrans = getMaterialTransmission(shape.materialIndex, wavelength);
      
      // Blend between full transmission (1.0) and material transmission based on mask
      let trans = mix(1.0, materialTrans, mask);
      totalTransmission *= trans;
      
      // Apply scattering attenuation (Rayleigh + Mie)
      // Use shape dimensions as approximate path length (in pixels, ~0.01cm each)
      let pathLength = max(shape.width, shape.height) * 0.01;
      let scatterTrans = applyScattering(
        1.0,
        wavelength,
        shape.smallParticleDensity,
        shape.largeParticleDensity,
        pathLength * mask
      );
      scatteringMultiplier *= scatterTrans;
      
      // Thermal emission (Kirchhoff's law)
      if (params.enableEmission == 1u) {
        let em = getKirchhoffEmission(materialTrans, wavelength, shape.temperature);
        emission += em * mask;
      }
    }
  }
  
  // Final result: background × absorption × scattering + emission
  return intensity * totalTransmission * scatteringMultiplier + emission;
}

// ============================================================
// Entry Point: Color Computation (Pass 0 & 1)
// ============================================================

/**
 * Main compute shader entry point for color rendering
 * 
 * Two-pass rendering for global normalization:
 * Pass 0 (isNormalizationPass=0): Compute XYZ, track max intensity per pixel
 * Pass 1 (isNormalizationPass=1): Normalize stored XYZ by global max, convert to RGB
 */
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x;
  let y = id.y;
  
  if (x >= params.width || y >= params.height) {
    return;
  }
  
  let pixelIndex = y * params.width + x;
  let fx = f32(x);
  let fy = f32(y);
  
  // Pass 1: Normalize and convert to RGB using stored XYZ
  if (params.isNormalizationPass == 1u) {
    // Read stored unnormalized XYZ from rgbOutput (stored in pass 0)
    let stored = rgbOutput[pixelIndex];
    var xyz = stored.xyz;
    
    // Normalize by global max Y (luminance) across all pixels
    let globalMax = max(params.globalMaxIntensity, 0.001);
    xyz = xyz / globalMax;
    
    // Convert to sRGB
    var rgb = xyzToLinearRGB(xyz);
    rgb.x = clamp(gammaCorrect(rgb.x), 0.0, 1.0);
    rgb.y = clamp(gammaCorrect(rgb.y), 0.0, 1.0);
    rgb.z = clamp(gammaCorrect(rgb.z), 0.0, 1.0);
    
    // Output final RGB
    rgbOutput[pixelIndex] = vec4<f32>(rgb, 1.0);
    return;
  }
  
  // Pass 0: Compute spectral integration and find max intensity
  let numShapes = arrayLength(&shapes);
  
  // Integrate spectrum and track max intensity
  let dLambda = (VISIBLE_MAX - VISIBLE_MIN) / f32(params.spectralResolution);
  var xyz = vec3<f32>(0.0, 0.0, 0.0);
  var maxIntensity: f32 = 0.0;
  
  for (var i: u32 = 0u; i < params.spectralResolution; i++) {
    let wavelength = VISIBLE_MIN + (f32(i) + 0.5) * dLambda;
    
    let intensity = computePixelIntensity(fx, fy, wavelength, numShapes);
    
    // Track maximum intensity for this pixel
    maxIntensity = max(maxIntensity, intensity);
    
    // Accumulate XYZ
    let cie = getCIE(wavelength);
    xyz += intensity * cie * dLambda;
  }
  
  // Store unnormalized XYZ in rgbOutput (will be normalized in pass 1)
  // Store max intensity in alpha channel for debugging if needed
  rgbOutput[pixelIndex] = vec4<f32>(xyz, maxIntensity);
  
  // Store luminance (Y) for CPU reduction and global normalization
  maxPerPixel[pixelIndex] = xyz.y;
}

// ============================================================
// Helper: Interpolate Spectral Buffer
// ============================================================

/**
 * Interpolate from the 16-sample spectral buffer to get intensity at any wavelength.
 * Uses linear interpolation between the two nearest samples.
 */
fn interpolateSpectralBuffer(x: u32, y: u32, wavelength: f32) -> f32 {
  // Map wavelength to fractional index in our 16-sample buffer
  let dLambda = (VISIBLE_MAX - VISIBLE_MIN) / f32(SPECTRAL_SAMPLES);
  let fractionalIdx = (wavelength - VISIBLE_MIN) / dLambda - 0.5;
  
  // Handle edge cases
  if (fractionalIdx <= 0.0) {
    let idx = getSpectralIndex(x, y, 0u);
    return f32(spectralInput[idx]);
  }
  if (fractionalIdx >= f32(SPECTRAL_SAMPLES - 1u)) {
    let idx = getSpectralIndex(x, y, SPECTRAL_SAMPLES - 1u);
    return f32(spectralInput[idx]);
  }
  
  // Linear interpolation between two samples
  let lowIdx = u32(floor(fractionalIdx));
  let highIdx = lowIdx + 1u;
  let t = fractionalIdx - f32(lowIdx);
  
  let lowSpectralIdx = getSpectralIndex(x, y, lowIdx);
  let highSpectralIdx = getSpectralIndex(x, y, highIdx);
  
  let lowVal = f32(spectralInput[lowSpectralIdx]);
  let highVal = f32(spectralInput[highSpectralIdx]);
  
  return mix(lowVal, highVal, t);
}

// ============================================================
// Entry Point: Spectrum Box Computation (Pass 2) - PARALLEL
// ============================================================

/**
 * Compute high-resolution spectrum for a single pixel in the sample box.
 * Uses full physics computation at 5000 wavelengths for detailed spectrum plot.
 * 
 * Note: This computes the raw physics without blur effects. The blur/scattering
 * effects are shown in the rendered image (16 samples) but the spectrum plot
 * shows the underlying physics at high resolution.
 * 
 * Thread mapping: id.x = local x in box, id.y = local y in box
 * Output: spectrumBox[boxIndex * plotResolution + wavelengthIndex]
 */
@compute @workgroup_size(8, 8)
fn computeSpectrumBox(@builtin(global_invocation_id) id: vec3<u32>) {
  let boxX = id.x;
  let boxY = id.y;
  
  // Skip if outside box
  if (boxX >= params.boxSize || boxY >= params.boxSize) {
    return;
  }
  
  // Calculate actual screen coordinates
  // Box is centered on (sampleX, sampleY)
  let halfBox = i32(params.boxSize) / 2;
  let screenX = params.sampleX - halfBox + i32(boxX);
  let screenY = params.sampleY - halfBox + i32(boxY);
  
  // Bounds check - mark out-of-bounds pixels with 0
  let inBounds = screenX >= 0 && screenX < i32(params.width) &&
                 screenY >= 0 && screenY < i32(params.height);
  
  let fx = f32(screenX);
  let fy = f32(screenY);
  let numShapes = arrayLength(&shapes);
  
  // Calculate output offset for this pixel
  let boxIndex = boxY * params.boxSize + boxX;
  let outputOffset = boxIndex * params.plotResolution;
  
  // Compute full spectrum for this pixel at high resolution
  let step = (params.wavelengthMax - params.wavelengthMin) / f32(params.plotResolution - 1u);
  
  for (var i: u32 = 0u; i < params.plotResolution; i++) {
    var intensity: f32 = 0.0;
    
    if (inBounds) {
      let wavelength = params.wavelengthMin + f32(i) * step;
      // Use full physics computation for high-resolution spectrum
      intensity = computePixelIntensity(fx, fy, wavelength, numShapes);
    }
    
    // Store as f16 for reduced memory bandwidth
    spectrumBox[outputOffset + i] = f16(intensity);
  }
}

// ============================================================
// HIGH-RES ENTRY POINTS: Spectrum Pipeline (30×30 × 5000 samples)
// ============================================================
// These entry points mirror the rendering pipeline but operate on the
// high-resolution spectrum box. They use the SAME computeLayerPhysics()
// function to ensure identical physics.
//
// SHARED ARCHITECTURE: Changes to computeLayerPhysics() affect both
// the 16-sample rendering and 5000-sample spectrum pipelines.

/**
 * Initialize high-res background spectrum for the 30×30 box.
 * SHARED: Uses same background logic as rendering pipeline.
 */
@compute @workgroup_size(8, 8)
fn initBackgroundSpectrum_HighRes(@builtin(global_invocation_id) id: vec3<u32>) {
  let boxX = id.x;
  let boxY = id.y;
  
  if (boxX >= params.boxSize || boxY >= params.boxSize) {
    return;
  }
  
  let screenPos = boxToScreen(boxX, boxY);
  let inBounds = isScreenInBounds(screenPos);
  
  // Initialize all wavelengths for this pixel
  for (var wIdx: u32 = 0u; wIdx < params.plotResolution; wIdx++) {
    let spectralIdx = getSpectralIndex_HighRes(boxX, boxY, wIdx);
    
    var intensity: f32 = 0.0;
    if (inBounds) {
      let wavelength = getWavelengthForIndex_HighRes(wIdx);
      intensity = getBackgroundIntensity(wavelength);
    }
    
    spectralInput[spectralIdx] = f16(intensity);
    spectralOutput[spectralIdx] = f16(0.0);
    scatterSource[spectralIdx] = f16(0.0);
    emissionAura[spectralIdx] = f16(0.0);
  }
  
  // Initialize sigma buffer
  let pixelIdx = boxY * params.boxSize + boxX;
  scatteringSigma[pixelIdx] = 0.0;
}

/**
 * Apply layer absorption/emission at high resolution (5000 samples).
 * SHARED: Uses computeLayerPhysics() - same physics as rendering.
 * 
 * This is the 5000-sample version for spectrum plot. Changes to
 * computeLayerPhysics() automatically affect this entry point.
 */
@compute @workgroup_size(8, 8)
fn applyLayerAbsorption_HighRes(@builtin(global_invocation_id) id: vec3<u32>) {
  let boxX = id.x;
  let boxY = id.y;
  
  if (boxX >= params.boxSize || boxY >= params.boxSize) {
    return;
  }
  
  let screenPos = boxToScreen(boxX, boxY);
  let inBounds = isScreenInBounds(screenPos);
  let fx = f32(screenPos.x);
  let fy = f32(screenPos.y);
  let numShapes = arrayLength(&shapes);
  let pixelIdx = boxY * params.boxSize + boxX;
  
  var maxSigma: f32 = 0.0;
  
  // Process each wavelength using SHARED physics function
  for (var wIdx: u32 = 0u; wIdx < params.plotResolution; wIdx++) {
    let wavelength = getWavelengthForIndex_HighRes(wIdx);
    let spectralIdx = getSpectralIndex_HighRes(boxX, boxY, wIdx);
    
    // Read current intensity from input buffer
    let inputIntensity = f32(spectralInput[spectralIdx]);
    
    var transmitted: f32 = inputIntensity;
    var scatterSrc: f32 = 0.0;
    var directEmission: f32 = 0.0;
    var emissionAuraSrc: f32 = 0.0;
    
    if (inBounds) {
      // SHARED: Use common physics function for both pipelines
      let result = computeLayerPhysics(inputIntensity, wavelength, fx, fy, numShapes);
      
      transmitted = result.transmitted;
      scatterSrc = result.scatterSrc;
      directEmission = result.directEmission;
      emissionAuraSrc = result.emissionAuraSrc;
      maxSigma = max(maxSigma, result.maxSigma);
    }
    
    // Write outputs
    spectralOutput[spectralIdx] = f16(transmitted + directEmission);
    scatterSource[spectralIdx] = f16(scatterSrc);
    emissionAura[spectralIdx] = f16(emissionAuraSrc);
  }
  
  scatteringSigma[pixelIdx] = maxSigma;
}

/**
 * Horizontal blur for high-res scatter (Voigt kernel).
 * SHARED: Uses same blur constants and kernel as rendering.
 */
@compute @workgroup_size(8, 8)
fn blurHorizontal_HighRes(@builtin(global_invocation_id) id: vec3<u32>) {
  let boxX = id.x;
  let boxY = id.y;
  
  if (boxX >= params.boxSize || boxY >= params.boxSize) {
    return;
  }
  
  let sigma = params.globalMaxScatterSigma;
  if (sigma < 0.1) {
    // No blur needed, just copy
    for (var wIdx: u32 = 0u; wIdx < params.plotResolution; wIdx++) {
      let spectralIdx = getSpectralIndex_HighRes(boxX, boxY, wIdx);
      spectralInput[spectralIdx] = scatterSource[spectralIdx];
    }
    return;
  }
  
  let radius = u32(ceil(sigma * 4.0));
  
  for (var wIdx: u32 = 0u; wIdx < params.plotResolution; wIdx++) {
    var sum: f32 = 0.0;
    var weightSum: f32 = 0.0;
    
    for (var dx: i32 = -i32(radius); dx <= i32(radius); dx++) {
      let sampleX = i32(boxX) + dx;
      if (sampleX >= 0 && sampleX < i32(params.boxSize)) {
        let sampleIdx = getSpectralIndex_HighRes(u32(sampleX), boxY, wIdx);
        let weight = voigtBlurWeight(f32(abs(dx)), sigma);
        sum += f32(scatterSource[sampleIdx]) * weight;
        weightSum += weight;
      }
    }
    
    let spectralIdx = getSpectralIndex_HighRes(boxX, boxY, wIdx);
    spectralInput[spectralIdx] = f16(sum / max(weightSum, 0.0001));
  }
}

/**
 * Vertical blur for high-res scatter (Voigt kernel).
 * SHARED: Uses same blur constants and kernel as rendering.
 */
@compute @workgroup_size(8, 8)
fn blurVertical_HighRes(@builtin(global_invocation_id) id: vec3<u32>) {
  let boxX = id.x;
  let boxY = id.y;
  
  if (boxX >= params.boxSize || boxY >= params.boxSize) {
    return;
  }
  
  let sigma = params.globalMaxScatterSigma;
  if (sigma < 0.1) {
    // No blur needed, just copy
    for (var wIdx: u32 = 0u; wIdx < params.plotResolution; wIdx++) {
      let spectralIdx = getSpectralIndex_HighRes(boxX, boxY, wIdx);
      scatterSource[spectralIdx] = spectralInput[spectralIdx];
    }
    return;
  }
  
  let radius = u32(ceil(sigma * 4.0));
  
  for (var wIdx: u32 = 0u; wIdx < params.plotResolution; wIdx++) {
    var sum: f32 = 0.0;
    var weightSum: f32 = 0.0;
    
    for (var dy: i32 = -i32(radius); dy <= i32(radius); dy++) {
      let sampleY = i32(boxY) + dy;
      if (sampleY >= 0 && sampleY < i32(params.boxSize)) {
        let sampleIdx = getSpectralIndex_HighRes(boxX, u32(sampleY), wIdx);
        let weight = voigtBlurWeight(f32(abs(dy)), sigma);
        sum += f32(spectralInput[sampleIdx]) * weight;
        weightSum += weight;
      }
    }
    
    let spectralIdx = getSpectralIndex_HighRes(boxX, boxY, wIdx);
    scatterSource[spectralIdx] = f16(sum / max(weightSum, 0.0001));
  }
}

/**
 * Horizontal blur for high-res transmitted (blur->mask path).
 * Blurs the full transmitted image so background bleeds INTO shapes.
 */
@compute @workgroup_size(8, 8)
fn blurTransmittedH_HighRes(@builtin(global_invocation_id) id: vec3<u32>) {
  let boxX = id.x;
  let boxY = id.y;
  
  if (boxX >= params.boxSize || boxY >= params.boxSize) {
    return;
  }
  
  let sigma = params.globalMaxScatterSigma;
  if (sigma < 0.1) {
    // No blur needed, just copy
    for (var wIdx: u32 = 0u; wIdx < params.plotResolution; wIdx++) {
      let spectralIdx = getSpectralIndex_HighRes(boxX, boxY, wIdx);
      spectralInput[spectralIdx] = spectralOutput[spectralIdx];
    }
    return;
  }
  
  let radius = u32(ceil(sigma * 4.0));
  
  for (var wIdx: u32 = 0u; wIdx < params.plotResolution; wIdx++) {
    var sum: f32 = 0.0;
    var weightSum: f32 = 0.0;
    
    for (var dx: i32 = -i32(radius); dx <= i32(radius); dx++) {
      let sampleX = i32(boxX) + dx;
      if (sampleX >= 0 && sampleX < i32(params.boxSize)) {
        let sampleIdx = getSpectralIndex_HighRes(u32(sampleX), boxY, wIdx);
        let weight = voigtBlurWeight(f32(abs(dx)), sigma);
        sum += f32(spectralOutput[sampleIdx]) * weight;
        weightSum += weight;
      }
    }
    
    let spectralIdx = getSpectralIndex_HighRes(boxX, boxY, wIdx);
    spectralInput[spectralIdx] = f16(sum / max(weightSum, 0.0001));
  }
}

/**
 * Vertical blur for high-res transmitted (blur->mask path).
 * Reads H-blurred from spectralInput, writes to emissionAura (temp).
 */
@compute @workgroup_size(8, 8)
fn blurTransmittedV_HighRes(@builtin(global_invocation_id) id: vec3<u32>) {
  let boxX = id.x;
  let boxY = id.y;
  
  if (boxX >= params.boxSize || boxY >= params.boxSize) {
    return;
  }
  
  let sigma = params.globalMaxScatterSigma;
  if (sigma < 0.1) {
    // No blur needed, just copy
    for (var wIdx: u32 = 0u; wIdx < params.plotResolution; wIdx++) {
      let spectralIdx = getSpectralIndex_HighRes(boxX, boxY, wIdx);
      emissionAura[spectralIdx] = spectralInput[spectralIdx];
    }
    return;
  }
  
  let radius = u32(ceil(sigma * 4.0));
  
  for (var wIdx: u32 = 0u; wIdx < params.plotResolution; wIdx++) {
    var sum: f32 = 0.0;
    var weightSum: f32 = 0.0;
    
    for (var dy: i32 = -i32(radius); dy <= i32(radius); dy++) {
      let sampleY = i32(boxY) + dy;
      if (sampleY >= 0 && sampleY < i32(params.boxSize)) {
        let sampleIdx = getSpectralIndex_HighRes(boxX, u32(sampleY), wIdx);
        let weight = voigtBlurWeight(f32(abs(dy)), sigma);
        sum += f32(spectralInput[sampleIdx]) * weight;
        weightSum += weight;
      }
    }
    
    let spectralIdx = getSpectralIndex_HighRes(boxX, boxY, wIdx);
    emissionAura[spectralIdx] = f16(sum / max(weightSum, 0.0001));
  }
}

/**
 * Combine scattered light with transmitted for high-res spectrum.
 * Uses the same dual-path scattering model as the rendering pipeline.
 */
@compute @workgroup_size(8, 8)
fn combineScattered_HighRes(@builtin(global_invocation_id) id: vec3<u32>) {
  let boxX = id.x;
  let boxY = id.y;
  
  if (boxX >= params.boxSize || boxY >= params.boxSize) {
    return;
  }
  
  // Convert box coordinates to screen coordinates for shape queries
  let screenPos = boxToScreen(boxX, boxY);
  let inBounds = isScreenInBounds(screenPos);
  let fx = f32(screenPos.x);
  let fy = f32(screenPos.y);
  let numShapes = arrayLength(&shapes);
  
  for (var wIdx: u32 = 0u; wIdx < params.plotResolution; wIdx++) {
    let wavelength = getWavelengthForIndex_HighRes(wIdx);
    let spectralIdx = getSpectralIndex_HighRes(boxX, boxY, wIdx);
    
    // Read the three components
    let transmitted = f32(spectralOutput[spectralIdx]);   // Sharp transmitted + direct emission
    let blurredFull = f32(emissionAura[spectralIdx]);     // Blurred full image (blur->mask path)
    let blurredAura = f32(scatterSource[spectralIdx]);    // Blurred aura source (mask->blur path)
    
    // Compute scatter probability (only for in-bounds pixels)
    var scatterProb: f32 = 0.0;
    if (inBounds) {
      scatterProb = computeScatterProb(fx, fy, wavelength, numShapes);
    }
    
    // Three-path combination:
    let direct = transmitted * (1.0 - scatterProb);
    let inShapeScatter = blurredFull * scatterProb * IN_SHAPE_SCATTER_FRACTION;
    let aura = blurredAura;
    
    // Combine: write back to spectralOutput so after swap it becomes spectralInput for next layer
    spectralOutput[spectralIdx] = f16(direct + inShapeScatter + aura);
  }
}

/**
 * Horizontal emission aura blur for high-res spectrum.
 * SHARED: Uses same sigma as rendering pipeline.
 * Uses scatterSource as temporary buffer (safe since scatter blur is done before this).
 */
@compute @workgroup_size(8, 8)
fn blurEmissionAuraH_HighRes(@builtin(global_invocation_id) id: vec3<u32>) {
  let boxX = id.x;
  let boxY = id.y;
  
  if (boxX >= params.boxSize || boxY >= params.boxSize) {
    return;
  }
  
  let sigma = params.emissionAuraSigma;
  if (sigma < 0.1) {
    // No blur needed, copy to temporary buffer
    for (var wIdx: u32 = 0u; wIdx < params.plotResolution; wIdx++) {
      let spectralIdx = getSpectralIndex_HighRes(boxX, boxY, wIdx);
      scatterSource[spectralIdx] = emissionAura[spectralIdx];
    }
    return;
  }
  
  let radius = u32(ceil(sigma * 3.0));
  
  for (var wIdx: u32 = 0u; wIdx < params.plotResolution; wIdx++) {
    var sum: f32 = 0.0;
    var weightSum: f32 = 0.0;
    
    for (var dx: i32 = -i32(radius); dx <= i32(radius); dx++) {
      let sampleX = i32(boxX) + dx;
      if (sampleX >= 0 && sampleX < i32(params.boxSize)) {
        let sampleIdx = getSpectralIndex_HighRes(u32(sampleX), boxY, wIdx);
        let weight = gaussianWeight(f32(abs(dx)), sigma);
        sum += f32(emissionAura[sampleIdx]) * weight;
        weightSum += weight;
      }
    }
    
    let spectralIdx = getSpectralIndex_HighRes(boxX, boxY, wIdx);
    // Write to scatterSource as temporary storage (NOT spectralOutput!)
    scatterSource[spectralIdx] = f16(sum / max(weightSum, 0.0001));
  }
}

/**
 * Vertical emission aura blur for high-res spectrum.
 * SHARED: Uses same sigma as rendering pipeline.
 * Reads from scatterSource (H-blurred), writes back to emissionAura.
 */
@compute @workgroup_size(8, 8)
fn blurEmissionAuraV_HighRes(@builtin(global_invocation_id) id: vec3<u32>) {
  let boxX = id.x;
  let boxY = id.y;
  
  if (boxX >= params.boxSize || boxY >= params.boxSize) {
    return;
  }
  
  let sigma = params.emissionAuraSigma;
  if (sigma < 0.1) {
    // No blur needed, copy back from temporary
    for (var wIdx: u32 = 0u; wIdx < params.plotResolution; wIdx++) {
      let spectralIdx = getSpectralIndex_HighRes(boxX, boxY, wIdx);
      emissionAura[spectralIdx] = scatterSource[spectralIdx];
    }
    return;
  }
  
  let radius = u32(ceil(sigma * 3.0));
  
  for (var wIdx: u32 = 0u; wIdx < params.plotResolution; wIdx++) {
    var sum: f32 = 0.0;
    var weightSum: f32 = 0.0;
    
    for (var dy: i32 = -i32(radius); dy <= i32(radius); dy++) {
      let sampleY = i32(boxY) + dy;
      if (sampleY >= 0 && sampleY < i32(params.boxSize)) {
        let sampleIdx = getSpectralIndex_HighRes(boxX, u32(sampleY), wIdx);
        let weight = gaussianWeight(f32(abs(dy)), sigma);
        // Read from scatterSource (H-blurred)
        sum += f32(scatterSource[sampleIdx]) * weight;
        weightSum += weight;
      }
    }
    
    let spectralIdx = getSpectralIndex_HighRes(boxX, boxY, wIdx);
    emissionAura[spectralIdx] = f16(sum / max(weightSum, 0.0001));
  }
}

/**
 * Final combination for high-res spectrum.
 * Writes result to spectrumBox for averaging.
 * SHARED: Uses same combination logic as rendering pipeline.
 * 
 * NOTE: After the layer loop, swapHighResSpectralBuffers() is called which swaps
 * the buffers. The combined data ends up in spectralOutput (not spectralInput).
 */
@compute @workgroup_size(8, 8)
fn finalCombine_HighRes(@builtin(global_invocation_id) id: vec3<u32>) {
  let boxX = id.x;
  let boxY = id.y;
  
  if (boxX >= params.boxSize || boxY >= params.boxSize) {
    return;
  }
  
  let boxIndex = boxY * params.boxSize + boxX;
  let outputOffset = boxIndex * params.plotResolution;
  
  for (var wIdx: u32 = 0u; wIdx < params.plotResolution; wIdx++) {
    let spectralIdx = getSpectralIndex_HighRes(boxX, boxY, wIdx);
    
    // Combine: transmitted/scattered (in spectralOutput after swap) + emission aura
    // After layer loop + swap, the combined data is in spectralOutput
    let combined = f32(spectralOutput[spectralIdx]) + f32(emissionAura[spectralIdx]);
    
    // Write to spectrumBox for averaging
    spectrumBox[outputOffset + wIdx] = f16(combined);
  }
}

// ============================================================
// Entry Point: Spectrum Averaging (Pass 3) - GPU Reduction
// ============================================================

/**
 * Average the spectrum box over a circular region
 * Single workgroup averages all wavelengths
 * 
 * Thread mapping: id.x = wavelength index (up to plotResolution)
 * Output: spectrumOutput[wavelengthIndex] = averaged intensity
 */
@compute @workgroup_size(256)
fn averageSpectrum(@builtin(global_invocation_id) id: vec3<u32>) {
  let wavelengthIdx = id.x;
  
  if (wavelengthIdx >= params.plotResolution) {
    return;
  }
  
  let halfBox = i32(params.boxSize) / 2;
  let avgRadius = i32(params.averageRadius);
  let centerX = halfBox;  // Center of box in local coords
  let centerY = halfBox;
  
  var sum: f32 = 0.0;
  var count: f32 = 0.0;
  
  // Iterate over all pixels in the box
  for (var by: u32 = 0u; by < params.boxSize; by++) {
    for (var bx: u32 = 0u; bx < params.boxSize; bx++) {
      // Check if within averaging circle
      let dx = i32(bx) - centerX;
      let dy = i32(by) - centerY;
      let distSq = dx * dx + dy * dy;
      
      if (distSq <= avgRadius * avgRadius) {
        // Get spectrum value from box (convert f16 to f32 for accumulation)
        let boxIndex = by * params.boxSize + bx;
        let value = f32(spectrumBox[boxIndex * params.plotResolution + wavelengthIdx]);
        
        // Optional: Gaussian weighting (currently uniform)
        // let weight = exp(-f32(distSq) / (2.0 * f32(avgRadius * avgRadius)));
        let weight = 1.0;
        
        sum += value * weight;
        count += weight;
      }
    }
  }
  
  // Output averaged spectrum
  if (count > 0.0) {
    spectrumOutput[wavelengthIdx] = sum / count;
  } else {
    spectrumOutput[wavelengthIdx] = 0.0;
  }
}

// ============================================================
// Per-Layer Scattering Blur Functions
// ============================================================

/**
 * Calculate wavelength-dependent blur sigma for scattering
 * Rayleigh: blur ∝ 1/λ⁴ (blue scatters more)
 * Mie: blur ≈ constant (wavelength-independent)
 */
fn getScatterBlurSigma(wavelengthNm: f32, smallDensity: f32, largeDensity: f32, pathLength: f32) -> f32 {
  if (smallDensity <= 0.0 && largeDensity <= 0.0) {
    return 0.0;
  }
  
  // Rayleigh: blur ∝ 1/λ⁴ (normalized to 550nm)
  let rayleighFactor = pow(550.0 / wavelengthNm, 4.0);
  let rayleighBlur = smallDensity * rayleighFactor * RAYLEIGH_BLUR_SCALE;
  
  // Mie: blur ≈ constant
  let mieBlur = largeDensity * MIE_BLUR_SCALE;
  
  // Combined blur (add variances, take sqrt for sigma)
  return sqrt(rayleighBlur + mieBlur) * pathLength;
}

/**
 * Voigt-like blur kernel weight
 * Combines Gaussian core with Lorentzian tails for physical accuracy
 */
fn voigtBlurWeight(dist: f32, sigma: f32) -> f32 {
  if (sigma <= 0.0) {
    if (dist == 0.0) { return 1.0; }
    return 0.0;
  }
  
  let normalizedDist = dist / sigma;
  
  // Gaussian core
  let gaussian = exp(-0.5 * normalizedDist * normalizedDist);
  
  // Lorentzian tails (gamma = sigma * 0.5)
  let gamma = 0.5;
  let lorentzian = gamma / (normalizedDist * normalizedDist + gamma * gamma);
  
  // Mix: 80% Gaussian, 20% Lorentzian
  return 0.8 * gaussian + 0.2 * lorentzian;
}

/**
 * Get wavelength for a given spectral sample index
 */
fn getWavelengthForIndex(idx: u32) -> f32 {
  let dLambda = (VISIBLE_MAX - VISIBLE_MIN) / f32(SPECTRAL_SAMPLES);
  return VISIBLE_MIN + (f32(idx) + 0.5) * dLambda;
}

/**
 * Get spectral buffer index for a pixel and wavelength
 */
fn getSpectralIndex(x: u32, y: u32, wavelengthIdx: u32) -> u32 {
  return (y * params.width + x) * SPECTRAL_SAMPLES + wavelengthIdx;
}

// ============================================================
// HIGH-RES SPECTRUM: Helper Functions (30×30 box × 5000 samples)
// ============================================================
// These helpers work with the high-resolution spectrum box buffers.
// They share the SAME physics as the rendering pipeline via computeLayerPhysics().

/**
 * Get wavelength for a given index in the high-res spectrum (5000 samples)
 * Uses params.plotResolution for sample count
 */
fn getWavelengthForIndex_HighRes(idx: u32) -> f32 {
  let step = (params.wavelengthMax - params.wavelengthMin) / f32(params.plotResolution - 1u);
  return params.wavelengthMin + f32(idx) * step;
}

/**
 * Get spectral buffer index for high-res spectrum box
 * Layout: boxY * boxSize * plotResolution + boxX * plotResolution + wavelengthIdx
 */
fn getSpectralIndex_HighRes(boxX: u32, boxY: u32, wavelengthIdx: u32) -> u32 {
  return (boxY * params.boxSize + boxX) * params.plotResolution + wavelengthIdx;
}

/**
 * Convert box coordinates to screen coordinates
 * Box is centered on (sampleX, sampleY)
 */
fn boxToScreen(boxX: u32, boxY: u32) -> vec2<i32> {
  let halfBox = i32(params.boxSize) / 2;
  return vec2<i32>(
    params.sampleX - halfBox + i32(boxX),
    params.sampleY - halfBox + i32(boxY)
  );
}

/**
 * Check if screen coordinates are in bounds
 */
fn isScreenInBounds(screenPos: vec2<i32>) -> bool {
  return screenPos.x >= 0 && screenPos.x < i32(params.width) &&
         screenPos.y >= 0 && screenPos.y < i32(params.height);
}

// ============================================================
// SHARED PHYSICS: Core Layer Physics (Used by both pipelines)
// ============================================================
// IMPORTANT: Changes here affect BOTH the rendering (16 samples)
// and spectrum plot (5000 samples) pipelines. Keep them aligned!

/**
 * Result of processing a single wavelength through a layer's physics.
 * This struct ensures both pipelines compute identical physics.
 */
struct LayerPhysicsResult {
  transmitted: f32,      // Light that passes through without scattering
  scatterSrc: f32,       // Light to be scattered (Voigt blur)
  directEmission: f32,   // Emission that stays at pixel
  emissionAuraSrc: f32,  // Emission aura (Gaussian blur)
  maxSigma: f32,         // Maximum blur sigma for this wavelength
}

/**
 * SHARED: Compute layer physics for a single wavelength.
 * This is the SINGLE SOURCE OF TRUTH for absorption, emission, and scattering.
 * 
 * Both the 16-sample rendering pipeline and 5000-sample spectrum pipeline
 * call this function to ensure identical physics.
 * 
 * @param inputIntensity - Incoming light intensity at this wavelength
 * @param wavelength - Wavelength in nm
 * @param fx, fy - Pixel coordinates (float)
 * @param numShapes - Number of shapes to process
 * @returns LayerPhysicsResult with all output components
 */
fn computeLayerPhysics(
  inputIntensity: f32,
  wavelength: f32,
  fx: f32,
  fy: f32,
  numShapes: u32
) -> LayerPhysicsResult {
  var result: LayerPhysicsResult;
  result.transmitted = inputIntensity;
  result.scatterSrc = 0.0;
  result.directEmission = 0.0;
  result.emissionAuraSrc = 0.0;
  result.maxSigma = 0.0;
  
  // Apply all shapes in this layer
  for (var i: u32 = 0u; i < numShapes; i++) {
    let mask = getShapeMask(shapes[i], fx, fy);
    if (mask > 0.0) {
      let shape = shapes[i];
      let materialTrans = getMaterialTransmission(shape.materialIndex, wavelength);
      
      // Calculate path length for scattering
      let pathLength = max(shape.width, shape.height) * 0.01;
      
      // Get scattering transmission (how much light passes without scattering)
      let scatterTrans = applyScattering(
        1.0,
        wavelength,
        shape.smallParticleDensity,
        shape.largeParticleDensity,
        pathLength * mask
      );
      
      // Scatter probability = 1 - scatterTrans (fraction that scatters)
      let scatterProb = 1.0 - scatterTrans;
      
      // Apply material absorption first
      let absorption = mix(1.0, materialTrans, mask);
      let absorbedInput = result.transmitted * absorption;
      
      // Scattering creates a blur effect but doesn't dim the shape itself.
      // The shape maintains full brightness after absorption.
      let directTrans = absorbedInput;
      
      // Compute scattered light for the aura effect (visual blur outside the shape).
      // Only a small fraction contributes to the visible aura to avoid brightening.
      let scatteredFrac = absorbedInput * scatterProb;
      result.scatterSrc += scatteredFrac * AURA_SCATTER_FRACTION;
      
      // Update transmitted for next shape in layer (full brightness preserved)
      result.transmitted = directTrans;
      
      // Calculate blur sigma for this wavelength
      let sigma = getScatterBlurSigma(
        wavelength,
        shape.smallParticleDensity,
        shape.largeParticleDensity,
        pathLength * mask
      );
      result.maxSigma = max(result.maxSigma, sigma);
      
      // Handle emission with spread factor
      if (params.enableEmission == 1u) {
        let em = getKirchhoffEmission(materialTrans, wavelength, shape.temperature);
        let maskedEmission = em * mask;
        
        // Split emission using spread factor
        let spreadFactor = params.emissionSpreadFactor;
        let directFraction = 1.0 - spreadFactor;
        let spreadAmount = maskedEmission * spreadFactor;
        
        // Direct emission stays at pixel
        result.directEmission += maskedEmission * directFraction;
        
        // Spread emission: part goes through scattering medium (Voigt blur)
        // and part is isotropic aura (Gaussian blur)
        // Scattered emission also loses most light to 3D scattering
        result.scatterSrc += spreadAmount * scatterProb * AURA_SCATTER_FRACTION;
        result.emissionAuraSrc += spreadAmount * (1.0 - scatterProb);
      }
    }
  }
  
  return result;
}

// ============================================================
// Entry Point: Initialize Background Spectrum
// ============================================================

/**
 * Initialize spectral buffer with background illumination
 * This is the starting point before any layer processing
 */
@compute @workgroup_size(8, 8)
fn initBackgroundSpectrum(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x;
  let y = id.y;
  
  if (x >= params.width || y >= params.height) {
    return;
  }
  
  // Initialize each wavelength with background intensity
  for (var i: u32 = 0u; i < SPECTRAL_SAMPLES; i++) {
    let wavelength = getWavelengthForIndex(i);
    let bgIntensity = getBackgroundIntensity(wavelength);
    
    let idx = getSpectralIndex(x, y, i);
    spectralOutput[idx] = f16(bgIntensity);
  }
  
  // Initialize scattering sigma to 0
  let pixelIdx = y * params.width + x;
  scatteringSigma[pixelIdx] = 0.0;
}

// ============================================================
// Entry Point: Apply Layer Absorption/Emission (16 samples)
// ============================================================

/**
 * Apply a single layer's absorption and emission to the spectral buffer.
 * Uses SHARED computeLayerPhysics() for physics - changes there affect both pipelines.
 * 
 * This is the 16-sample version for rendering. See applyLayerAbsorption_HighRes
 * for the 5000-sample spectrum plot version.
 * 
 * SHARED ARCHITECTURE: Both entry points use computeLayerPhysics() to ensure
 * identical physics regardless of resolution.
 */
@compute @workgroup_size(8, 8)
fn applyLayerAbsorption(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x;
  let y = id.y;
  
  if (x >= params.width || y >= params.height) {
    return;
  }
  
  let fx = f32(x);
  let fy = f32(y);
  let pixelIdx = y * params.width + x;
  let numShapes = arrayLength(&shapes);
  
  // Track maximum scattering sigma for this layer
  var maxSigma: f32 = 0.0;
  
  // Process each wavelength using SHARED physics function
  for (var wIdx: u32 = 0u; wIdx < SPECTRAL_SAMPLES; wIdx++) {
    let wavelength = getWavelengthForIndex(wIdx);
    let spectralIdx = getSpectralIndex(x, y, wIdx);
    
    // Read current intensity from input buffer
    let inputIntensity = f32(spectralInput[spectralIdx]);
    
    // SHARED: Use common physics function for both pipelines
    let result = computeLayerPhysics(inputIntensity, wavelength, fx, fy, numShapes);
    
    // Update max sigma across all wavelengths
    maxSigma = max(maxSigma, result.maxSigma);
    
    // Write transmitted + direct emission to output buffer (stays sharp)
    spectralOutput[spectralIdx] = f16(result.transmitted + result.directEmission);
    
    // Write scatter source to scatter buffer (will be Voigt blurred)
    scatterSource[spectralIdx] = f16(result.scatterSrc);
    
    // Write emission aura source (will be Gaussian blurred)
    emissionAura[spectralIdx] = f16(result.emissionAuraSrc);
  }
  
  // Store maximum sigma for blur passes
  scatteringSigma[pixelIdx] = maxSigma;
}

// ============================================================
// Entry Point: Horizontal Scatter Blur
// ============================================================

/**
 * Apply horizontal wavelength-dependent Voigt blur to scatter source.
 * Uses global max sigma for full-screen blur, enabling aura effect
 * outside shape boundaries.
 * 
 * Reads from scatterSource (scattered light), writes blurred result to spectralInput.
 */
@compute @workgroup_size(256, 1)
fn blurHorizontal(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x;
  let y = id.y;
  
  if (x >= params.width || y >= params.height) {
    return;
  }
  
  // Use global max sigma for blur radius (enables full-screen aura effect)
  let baseSigma = params.globalMaxScatterSigma;
  
  // Skip blur if no scattering anywhere
  if (baseSigma <= 0.0) {
    // Just copy scatter source (no blur needed)
    for (var wIdx: u32 = 0u; wIdx < SPECTRAL_SAMPLES; wIdx++) {
      let spectralIdx = getSpectralIndex(x, y, wIdx);
      spectralInput[spectralIdx] = scatterSource[spectralIdx];
    }
    return;
  }
  
  // Process each wavelength with wavelength-dependent blur
  for (var wIdx: u32 = 0u; wIdx < SPECTRAL_SAMPLES; wIdx++) {
    let wavelength = getWavelengthForIndex(wIdx);
    
    // Wavelength-dependent sigma: blue blurs more for Rayleigh
    let rayleighFactor = pow(550.0 / wavelength, 2.0); // Use sqrt of 1/λ⁴ for sigma
    let sigma = baseSigma * rayleighFactor;
    
    let radius = min(i32(ceil(sigma * 3.0)), MAX_BLUR_RADIUS);
    
    var sum: f32 = 0.0;
    var weightSum: f32 = 0.0;
    
    // Sample from scatter source (light to be blurred)
    for (var dx: i32 = -radius; dx <= radius; dx++) {
      let sampleX = i32(x) + dx;
      if (sampleX >= 0 && sampleX < i32(params.width)) {
        let sampleIdx = getSpectralIndex(u32(sampleX), y, wIdx);
        let weight = voigtBlurWeight(f32(dx), sigma);
        sum += f32(scatterSource[sampleIdx]) * weight;
        weightSum += weight;
      }
    }
    
    // Write H-blurred scatter to spectralInput (temporary storage)
    let spectralIdx = getSpectralIndex(x, y, wIdx);
    if (weightSum > 0.0) {
      spectralInput[spectralIdx] = f16(sum / weightSum);
    } else {
      spectralInput[spectralIdx] = scatterSource[spectralIdx];
    }
  }
}

// ============================================================
// Entry Point: Vertical Scatter Blur
// ============================================================

/**
 * Apply vertical wavelength-dependent Voigt blur to scatter source.
 * Reads from spectralInput (H-blurred scatter), writes to scatterSource (fully blurred).
 */
@compute @workgroup_size(1, 256)
fn blurVertical(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x;
  let y = id.y;
  
  if (x >= params.width || y >= params.height) {
    return;
  }
  
  // Use global max sigma for blur radius
  let baseSigma = params.globalMaxScatterSigma;
  
  // Skip blur if no scattering anywhere
  if (baseSigma <= 0.0) {
    // Just copy H-blurred scatter
    for (var wIdx: u32 = 0u; wIdx < SPECTRAL_SAMPLES; wIdx++) {
      let spectralIdx = getSpectralIndex(x, y, wIdx);
      scatterSource[spectralIdx] = spectralInput[spectralIdx];
    }
    return;
  }
  
  // Process each wavelength with wavelength-dependent blur
  for (var wIdx: u32 = 0u; wIdx < SPECTRAL_SAMPLES; wIdx++) {
    let wavelength = getWavelengthForIndex(wIdx);
    
    // Wavelength-dependent sigma
    let rayleighFactor = pow(550.0 / wavelength, 2.0);
    let sigma = baseSigma * rayleighFactor;
    
    let radius = min(i32(ceil(sigma * 3.0)), MAX_BLUR_RADIUS);
    
    var sum: f32 = 0.0;
    var weightSum: f32 = 0.0;
    
    // Sample from H-blurred scatter (in spectralInput)
    for (var dy: i32 = -radius; dy <= radius; dy++) {
      let sampleY = i32(y) + dy;
      if (sampleY >= 0 && sampleY < i32(params.height)) {
        let sampleIdx = getSpectralIndex(x, u32(sampleY), wIdx);
        let weight = voigtBlurWeight(f32(dy), sigma);
        sum += f32(spectralInput[sampleIdx]) * weight;
        weightSum += weight;
      }
    }
    
    // Write fully blurred scatter to scatterSource
    let spectralIdx = getSpectralIndex(x, y, wIdx);
    if (weightSum > 0.0) {
      scatterSource[spectralIdx] = f16(sum / weightSum);
    } else {
      scatterSource[spectralIdx] = spectralInput[spectralIdx];
    }
  }
}

// ============================================================
// Entry Point: Blur Transmitted Horizontal (for in-shape scatter)
// ============================================================

/**
 * Apply horizontal wavelength-dependent Voigt blur to the FULL transmitted image.
 * This is the blur->mask path: background light bleeds INTO shapes, preventing dark edges.
 * 
 * Reads from spectralOutput (transmitted light), writes to spectralInput (temp).
 */
@compute @workgroup_size(256, 1)
fn blurTransmittedH(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x;
  let y = id.y;
  
  if (x >= params.width || y >= params.height) {
    return;
  }
  
  let baseSigma = params.globalMaxScatterSigma;
  
  // Skip blur if no scattering anywhere
  if (baseSigma <= 0.0) {
    for (var wIdx: u32 = 0u; wIdx < SPECTRAL_SAMPLES; wIdx++) {
      let spectralIdx = getSpectralIndex(x, y, wIdx);
      spectralInput[spectralIdx] = spectralOutput[spectralIdx];
    }
    return;
  }
  
  // Process each wavelength with wavelength-dependent blur
  for (var wIdx: u32 = 0u; wIdx < SPECTRAL_SAMPLES; wIdx++) {
    let wavelength = getWavelengthForIndex(wIdx);
    
    // Wavelength-dependent sigma: blue blurs more for Rayleigh
    let rayleighFactor = pow(550.0 / wavelength, 2.0);
    let sigma = baseSigma * rayleighFactor;
    
    let radius = min(i32(ceil(sigma * 3.0)), MAX_BLUR_RADIUS);
    
    var sum: f32 = 0.0;
    var weightSum: f32 = 0.0;
    
    // Sample from transmitted light (spectralOutput)
    for (var dx: i32 = -radius; dx <= radius; dx++) {
      let sampleX = i32(x) + dx;
      if (sampleX >= 0 && sampleX < i32(params.width)) {
        let sampleIdx = getSpectralIndex(u32(sampleX), y, wIdx);
        let weight = voigtBlurWeight(f32(dx), sigma);
        sum += f32(spectralOutput[sampleIdx]) * weight;
        weightSum += weight;
      }
    }
    
    // Write H-blurred transmitted to spectralInput
    let spectralIdx = getSpectralIndex(x, y, wIdx);
    if (weightSum > 0.0) {
      spectralInput[spectralIdx] = f16(sum / weightSum);
    } else {
      spectralInput[spectralIdx] = spectralOutput[spectralIdx];
    }
  }
}

// ============================================================
// Entry Point: Blur Transmitted Vertical (for in-shape scatter)
// ============================================================

/**
 * Apply vertical wavelength-dependent Voigt blur to the transmitted image.
 * Reads from spectralInput (H-blurred), writes to emissionAura (repurposed as temp).
 */
@compute @workgroup_size(1, 256)
fn blurTransmittedV(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x;
  let y = id.y;
  
  if (x >= params.width || y >= params.height) {
    return;
  }
  
  let baseSigma = params.globalMaxScatterSigma;
  
  // Skip blur if no scattering anywhere
  if (baseSigma <= 0.0) {
    for (var wIdx: u32 = 0u; wIdx < SPECTRAL_SAMPLES; wIdx++) {
      let spectralIdx = getSpectralIndex(x, y, wIdx);
      emissionAura[spectralIdx] = spectralInput[spectralIdx];
    }
    return;
  }
  
  // Process each wavelength with wavelength-dependent blur
  for (var wIdx: u32 = 0u; wIdx < SPECTRAL_SAMPLES; wIdx++) {
    let wavelength = getWavelengthForIndex(wIdx);
    
    // Wavelength-dependent sigma
    let rayleighFactor = pow(550.0 / wavelength, 2.0);
    let sigma = baseSigma * rayleighFactor;
    
    let radius = min(i32(ceil(sigma * 3.0)), MAX_BLUR_RADIUS);
    
    var sum: f32 = 0.0;
    var weightSum: f32 = 0.0;
    
    // Sample from H-blurred transmitted (in spectralInput)
    for (var dy: i32 = -radius; dy <= radius; dy++) {
      let sampleY = i32(y) + dy;
      if (sampleY >= 0 && sampleY < i32(params.height)) {
        let sampleIdx = getSpectralIndex(x, u32(sampleY), wIdx);
        let weight = voigtBlurWeight(f32(dy), sigma);
        sum += f32(spectralInput[sampleIdx]) * weight;
        weightSum += weight;
      }
    }
    
    // Write fully blurred transmitted to emissionAura (temp storage)
    let spectralIdx = getSpectralIndex(x, y, wIdx);
    if (weightSum > 0.0) {
      emissionAura[spectralIdx] = f16(sum / weightSum);
    } else {
      emissionAura[spectralIdx] = spectralInput[spectralIdx];
    }
  }
}

// ============================================================
// Entry Point: Gaussian Blur Weight
// ============================================================

/**
 * Simple Gaussian weight for emission aura blur
 */
fn gaussianWeight(dist: f32, sigma: f32) -> f32 {
  if (sigma <= 0.0) {
    if (dist == 0.0) { return 1.0; }
    return 0.0;
  }
  let normalizedDist = dist / sigma;
  return exp(-0.5 * normalizedDist * normalizedDist);
}

// ============================================================
// Entry Point: Horizontal Emission Aura Blur
// ============================================================

/**
 * Apply horizontal Gaussian blur to emission aura.
 * Uses constant sigma (wavelength-independent) for isotropic emission.
 * Reads from emissionAura, writes to spectralInput (temporary storage).
 */
@compute @workgroup_size(256, 1)
fn blurEmissionAuraH(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x;
  let y = id.y;
  
  if (x >= params.width || y >= params.height) {
    return;
  }
  
  let sigma = params.emissionAuraSigma;
  
  // Skip blur if sigma is zero
  if (sigma <= 0.0) {
    for (var wIdx: u32 = 0u; wIdx < SPECTRAL_SAMPLES; wIdx++) {
      let spectralIdx = getSpectralIndex(x, y, wIdx);
      spectralInput[spectralIdx] = emissionAura[spectralIdx];
    }
    return;
  }
  
  let radius = min(i32(ceil(sigma * 3.0)), MAX_BLUR_RADIUS);
  
  // Apply same blur to all wavelengths (wavelength-independent)
  for (var wIdx: u32 = 0u; wIdx < SPECTRAL_SAMPLES; wIdx++) {
    var sum: f32 = 0.0;
    var weightSum: f32 = 0.0;
    
    for (var dx: i32 = -radius; dx <= radius; dx++) {
      let sampleX = i32(x) + dx;
      if (sampleX >= 0 && sampleX < i32(params.width)) {
        let sampleIdx = getSpectralIndex(u32(sampleX), y, wIdx);
        let weight = gaussianWeight(f32(dx), sigma);
        sum += f32(emissionAura[sampleIdx]) * weight;
        weightSum += weight;
      }
    }
    
    let spectralIdx = getSpectralIndex(x, y, wIdx);
    if (weightSum > 0.0) {
      spectralInput[spectralIdx] = f16(sum / weightSum);
    } else {
      spectralInput[spectralIdx] = emissionAura[spectralIdx];
    }
  }
}

// ============================================================
// Entry Point: Vertical Emission Aura Blur
// ============================================================

/**
 * Apply vertical Gaussian blur to emission aura.
 * Reads from spectralInput (H-blurred aura), writes to emissionAura (fully blurred).
 */
@compute @workgroup_size(1, 256)
fn blurEmissionAuraV(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x;
  let y = id.y;
  
  if (x >= params.width || y >= params.height) {
    return;
  }
  
  let sigma = params.emissionAuraSigma;
  
  // Skip blur if sigma is zero
  if (sigma <= 0.0) {
    for (var wIdx: u32 = 0u; wIdx < SPECTRAL_SAMPLES; wIdx++) {
      let spectralIdx = getSpectralIndex(x, y, wIdx);
      emissionAura[spectralIdx] = spectralInput[spectralIdx];
    }
    return;
  }
  
  let radius = min(i32(ceil(sigma * 3.0)), MAX_BLUR_RADIUS);
  
  // Apply same blur to all wavelengths
  for (var wIdx: u32 = 0u; wIdx < SPECTRAL_SAMPLES; wIdx++) {
    var sum: f32 = 0.0;
    var weightSum: f32 = 0.0;
    
    for (var dy: i32 = -radius; dy <= radius; dy++) {
      let sampleY = i32(y) + dy;
      if (sampleY >= 0 && sampleY < i32(params.height)) {
        let sampleIdx = getSpectralIndex(x, u32(sampleY), wIdx);
        let weight = gaussianWeight(f32(dy), sigma);
        sum += f32(spectralInput[sampleIdx]) * weight;
        weightSum += weight;
      }
    }
    
    let spectralIdx = getSpectralIndex(x, y, wIdx);
    if (weightSum > 0.0) {
      emissionAura[spectralIdx] = f16(sum / weightSum);
    } else {
      emissionAura[spectralIdx] = spectralInput[spectralIdx];
    }
  }
}

// ============================================================
// Helper: Compute total scatter probability for a pixel
// ============================================================

/**
 * Compute the combined scatter probability for all shapes at a pixel.
 * This is used by the combine pass to properly blend the three scatter paths.
 * 
 * @returns Combined scatterProb (fraction of light that scatters)
 */
fn computeScatterProb(fx: f32, fy: f32, wavelength: f32, numShapes: u32) -> f32 {
  // Track remaining unscattered fraction (multiplicative)
  var unscatteredFrac: f32 = 1.0;
  
  for (var i: u32 = 0u; i < numShapes; i++) {
    let mask = getShapeMask(shapes[i], fx, fy);
    if (mask > 0.0) {
      let shape = shapes[i];
      let pathLength = max(shape.width, shape.height) * 0.01;
      
      // Get scattering transmission for this shape
      let scatterTrans = applyScattering(
        1.0,
        wavelength,
        shape.smallParticleDensity,
        shape.largeParticleDensity,
        pathLength * mask
      );
      
      // Multiply unscattered fractions (light passes through multiple shapes)
      unscatteredFrac *= scatterTrans;
    }
  }
  
  // scatterProb = 1 - unscattered (fraction that scatters at least once)
  return 1.0 - unscatteredFrac;
}

// ============================================================
// Entry Point: Combine All (Dual-Path Scatter + Emission Aura)
// ============================================================

/**
 * Combine transmitted light with dual-path scattering and emission aura.
 * 
 * Three-path scattering model:
 * 1. Direct (unscattered): transmitted * (1 - scatterProb)
 * 2. In-shape blur (95%): blurredFull * scatterProb * IN_SHAPE_SCATTER_FRACTION
 *    - Blur applied BEFORE masking, so background bleeds INTO shape (no dark edges)
 * 3. Aura (5%): blurredAura (already scaled by AURA_SCATTER_FRACTION in absorption pass)
 *    - Mask applied BEFORE blurring, so shape light bleeds OUT
 * 
 * Buffer layout after blur passes:
 * - spectralOutput: transmitted light (sharp)
 * - emissionAura: blurred full image (for in-shape scatter)
 * - scatterSource: blurred aura (for escaping light)
 */
@compute @workgroup_size(8, 8)
fn combineScattered(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x;
  let y = id.y;
  
  if (x >= params.width || y >= params.height) {
    return;
  }
  
  let fx = f32(x);
  let fy = f32(y);
  let numShapes = arrayLength(&shapes);
  
  // Combine all components for each wavelength
  for (var wIdx: u32 = 0u; wIdx < SPECTRAL_SAMPLES; wIdx++) {
    let wavelength = getWavelengthForIndex(wIdx);
    let spectralIdx = getSpectralIndex(x, y, wIdx);
    
    // Read the three components
    let transmitted = f32(spectralOutput[spectralIdx]);   // Sharp transmitted + direct emission
    let blurredFull = f32(emissionAura[spectralIdx]);     // Blurred full image (blur->mask path)
    let blurredAura = f32(scatterSource[spectralIdx]);    // Blurred aura source (mask->blur path)
    
    // Recompute scatter probability for this pixel/wavelength
    let scatterProb = computeScatterProb(fx, fy, wavelength, numShapes);
    
    // Three-path combination:
    // 1. Direct light (unscattered portion)
    let direct = transmitted * (1.0 - scatterProb);
    
    // 2. In-shape scatter: blurred image masked to scattering regions (95%)
    //    Only contributes where scatterProb > 0 (inside shapes with particles)
    let inShapeScatter = blurredFull * scatterProb * IN_SHAPE_SCATTER_FRACTION;
    
    // 3. Aura: already blurred scatter source (5%, computed in absorption pass)
    //    Contributes everywhere (bleeds outside shapes)
    let aura = blurredAura;
    
    // Combined result becomes input for next layer
    spectralInput[spectralIdx] = f16(direct + inShapeScatter + aura);
  }
}

// ============================================================
// Entry Point: Integrate Spectrum to XYZ/RGB
// ============================================================

/**
 * Integrate the final spectral buffer to XYZ and convert to RGB
 * Reads from spectralInput (final blurred result)
 */
@compute @workgroup_size(8, 8)
fn integrateSpectrum(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x;
  let y = id.y;
  
  if (x >= params.width || y >= params.height) {
    return;
  }
  
  let pixelIndex = y * params.width + x;
  
  // Pass 1 (normalization): Read stored XYZ, normalize, convert to RGB
  if (params.isNormalizationPass == 1u) {
    let xyz = rgbOutput[pixelIndex].xyz;
    let globalMax = params.globalMaxIntensity;
    
    // Normalize
    var normalizedXyz = xyz;
    if (globalMax > 0.001) {
      normalizedXyz = xyz / globalMax;
    }
    
    // Convert to sRGB
    var rgb = xyzToLinearRGB(normalizedXyz);
    rgb.x = clamp(gammaCorrect(rgb.x), 0.0, 1.0);
    rgb.y = clamp(gammaCorrect(rgb.y), 0.0, 1.0);
    rgb.z = clamp(gammaCorrect(rgb.z), 0.0, 1.0);
    
    rgbOutput[pixelIndex] = vec4<f32>(rgb, 1.0);
    return;
  }
  
  // Pass 0: Integrate spectrum from buffer to XYZ
  let dLambda = (VISIBLE_MAX - VISIBLE_MIN) / f32(SPECTRAL_SAMPLES);
  var xyz = vec3<f32>(0.0, 0.0, 0.0);
  var maxIntensity: f32 = 0.0;
  
  for (var i: u32 = 0u; i < SPECTRAL_SAMPLES; i++) {
    let wavelength = getWavelengthForIndex(i);
    let spectralIdx = getSpectralIndex(x, y, i);
    let intensity = f32(spectralInput[spectralIdx]);
    
    maxIntensity = max(maxIntensity, intensity);
    
    let cie = getCIE(wavelength);
    xyz += intensity * cie * dLambda;
  }
  
  // Store XYZ for normalization pass
  rgbOutput[pixelIndex] = vec4<f32>(xyz, maxIntensity);
  maxPerPixel[pixelIndex] = xyz.y; // Luminance for global max
}
