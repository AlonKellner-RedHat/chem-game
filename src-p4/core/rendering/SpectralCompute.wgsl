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
const DRAPER_POINT: f32 = 798.0;
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
  _padding1: u32,
  _padding2: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> shapes: array<Shape>;
@group(0) @binding(2) var<storage, read_write> rgbOutput: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> spectrumOutput: array<f32>;
@group(0) @binding(4) var<storage, read_write> maxPerPixel: array<f32>;

// Spectrum box buffer (boxSize² × plotResolution values, using f16)
@group(0) @binding(5) var<storage, read_write> spectrumBox: array<f32>;

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
const D65_REFERENCE: f32 = 2.3718e+13;  // Raw Planck at 550nm, 6500K

/**
 * Get D65-normalized Planck radiance
 */
fn getPlanckRadiance(wavelengthNm: f32, temperatureK: f32) -> f32 {
  if (temperatureK < DRAPER_POINT) {
    return 0.0;
  }
  
  let raw = getRawPlanckRadiance(wavelengthNm, temperatureK);
  return raw / D65_REFERENCE;
}

/**
 * Kirchhoff emission
 */
fn getKirchhoffEmission(transmission: f32, wavelengthNm: f32, temperatureK: f32) -> f32 {
  if (temperatureK < DRAPER_POINT) {
    return 0.0;
  }
  
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

/**
 * Compute spectral intensity at a pixel for a specific wavelength
 * Shared by both color and spectrum computation
 */
fn computePixelIntensity(px: f32, py: f32, wavelength: f32, numShapes: u32) -> f32 {
  // Start with background
  var intensity = getBackgroundIntensity(wavelength);
  var totalTransmission = 1.0;
  var emission = 0.0;
  
  // Apply all shapes
  for (var i: u32 = 0u; i < numShapes; i++) {
    let mask = getShapeMask(shapes[i], px, py);
    if (mask > 0.0) {
      let shape = shapes[i];
      let materialTrans = getMaterialTransmission(shape.materialIndex, wavelength);
      
      // Blend between full transmission (1.0) and material transmission based on mask
      let trans = mix(1.0, materialTrans, mask);
      totalTransmission *= trans;
      
      if (params.enableEmission == 1u) {
        let em = getKirchhoffEmission(materialTrans, wavelength, shape.temperature);
        emission += em * mask;
      }
    }
  }
  
  return intensity * totalTransmission + emission;
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
// Entry Point: Spectrum Box Computation (Pass 2) - PARALLEL
// ============================================================

/**
 * Compute high-resolution spectrum for a single pixel in the sample box
 * Each thread computes the full spectrum for one pixel in the boxSize² region
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
  
  // Compute full spectrum for this pixel
  let step = (params.wavelengthMax - params.wavelengthMin) / f32(params.plotResolution - 1u);
  
  for (var i: u32 = 0u; i < params.plotResolution; i++) {
    var intensity: f32 = 0.0;
    
    if (inBounds) {
      let wavelength = params.wavelengthMin + f32(i) * step;
      intensity = computePixelIntensity(fx, fy, wavelength, numShapes);
    }
    
    spectrumBox[outputOffset + i] = intensity;
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
        // Get spectrum value from box
        let boxIndex = by * params.boxSize + bx;
        let value = spectrumBox[boxIndex * params.plotResolution + wavelengthIdx];
        
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
