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
 * Multi-pass architecture:
 * - Pass 0 (main): Color computation for all pixels (16 wavelengths)
 * - Pass 1 (main): Normalization pass
 * - Pass 2 (computeSpectrumBox): High-res spectrum for boxSize² pixels (parallel)
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

// Number of spectral samples (must match TypeScript)
const SPECTRAL_SAMPLES: u32 = 16u;

// Blur constants
const MAX_BLUR_RADIUS: i32 = 64;           // Maximum blur radius in pixels
const RAYLEIGH_BLUR_SCALE: f32 = 1e-12;    // Scale factor for Rayleigh blur
const MIE_BLUR_SCALE: f32 = 1e-8;          // Scale factor for Mie blur

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
// Entry Point: Apply Layer Absorption/Emission
// ============================================================

/**
 * Apply a single layer's absorption and emission to the spectral buffer.
 * Separates light into transmitted (stays at pixel) and scattered (will blur).
 * 
 * Outputs:
 * - spectralOutput: transmitted light + direct emission (stays sharp)
 * - scatterSource: scattered light + scattered emission (will be blurred)
 * 
 * Physics:
 * - Transmitted = input × absorption × (1 - scatterProb)
 * - Scattered = input × absorption × scatterProb
 * - Direct emission = emission × (1 - scatterProb)
 * - Scattered emission = emission × scatterProb
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
  
  // Process each wavelength
  for (var wIdx: u32 = 0u; wIdx < SPECTRAL_SAMPLES; wIdx++) {
    let wavelength = getWavelengthForIndex(wIdx);
    let spectralIdx = getSpectralIndex(x, y, wIdx);
    
    // Read current intensity from input buffer
    let inputIntensity = f32(spectralInput[spectralIdx]);
    
    // Track transmitted light (stays at pixel) and scatter/emission sources (will blur)
    var transmitted: f32 = inputIntensity;
    var scatterSrc: f32 = 0.0;
    var directEmission: f32 = 0.0;
    var emissionAuraSrc: f32 = 0.0;
    
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
        let absorbedInput = transmitted * absorption;
        
        // Split absorbed light into transmitted (direct) and scattered
        // Transmitted = absorbed × (1 - scatterProb) = absorbed × scatterTrans
        // Scattered = absorbed × scatterProb
        let directTrans = absorbedInput * scatterTrans;
        let scatteredFrac = absorbedInput * scatterProb;
        
        // Accumulate scatter source (light that will be blurred)
        scatterSrc += scatteredFrac;
        
        // Update transmitted for next shape in layer
        transmitted = directTrans;
        
        // Calculate blur sigma for this wavelength
        let sigma = getScatterBlurSigma(
          wavelength,
          shape.smallParticleDensity,
          shape.largeParticleDensity,
          pathLength * mask
        );
        maxSigma = max(maxSigma, sigma);
        
        // Handle emission with spread factor
        if (params.enableEmission == 1u) {
          let em = getKirchhoffEmission(materialTrans, wavelength, shape.temperature);
          let maskedEmission = em * mask;
          
          // Split emission using spread factor
          // Direct: stays at pixel (no spread)
          // Spread: further split between scattered (through medium) and aura (isotropic)
          let spreadFactor = params.emissionSpreadFactor;
          let directFraction = 1.0 - spreadFactor;
          let spreadAmount = maskedEmission * spreadFactor;
          
          // Direct emission stays at pixel
          directEmission += maskedEmission * directFraction;
          
          // Spread emission: part goes through scattering medium (Voigt blur)
          // and part is isotropic aura (Gaussian blur)
          scatterSrc += spreadAmount * scatterProb;
          emissionAuraSrc += spreadAmount * (1.0 - scatterProb);
        }
      }
    }
    
    // Write transmitted + direct emission to output buffer (stays sharp)
    spectralOutput[spectralIdx] = f16(transmitted + directEmission);
    
    // Write scatter source to scatter buffer (will be Voigt blurred)
    scatterSource[spectralIdx] = f16(scatterSrc);
    
    // Write emission aura source (will be Gaussian blurred)
    emissionAura[spectralIdx] = f16(emissionAuraSrc);
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
// Entry Point: Combine All (Scatter + Emission Aura)
// ============================================================

/**
 * Combine transmitted light with blurred scatter and blurred emission aura.
 * Writes the combined result to spectralInput for the next layer or final integration.
 * 
 * Final = transmitted + direct_emission + blurred_scatter + blurred_emission_aura
 */
@compute @workgroup_size(8, 8)
fn combineScattered(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x;
  let y = id.y;
  
  if (x >= params.width || y >= params.height) {
    return;
  }
  
  // Combine all components for each wavelength
  for (var wIdx: u32 = 0u; wIdx < SPECTRAL_SAMPLES; wIdx++) {
    let spectralIdx = getSpectralIndex(x, y, wIdx);
    
    let transmitted = f32(spectralOutput[spectralIdx]);   // Transmitted + direct emission
    let blurredScatter = f32(scatterSource[spectralIdx]); // Blurred scattered light (Voigt)
    let blurredAura = f32(emissionAura[spectralIdx]);     // Blurred emission aura (Gaussian)
    
    // Combined result becomes input for next layer
    spectralInput[spectralIdx] = f16(transmitted + blurredScatter + blurredAura);
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
