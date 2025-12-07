/**
 * Spectral Compute Shader
 * 
 * Calculates per-pixel spectral values and integrates to RGB.
 * This is the WebGPU equivalent of the physics module,
 * implementing the same formulas in WGSL.
 */

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
  spectralResolution: u32,
  backgroundMode: u32,  // 0=normal, 1=uv, 2=dark
  enableEmission: u32,
  sampleX: i32,  // -1 for no sampling, otherwise x coord
  sampleY: i32,  // -1 for no sampling, otherwise y coord
  isNormalizationPass: u32,  // 0 = compute pass (find max), 1 = normalize pass
  globalMaxIntensity: f32,   // Global max for normalization (used in pass 1)
  _padding: u32,
}

// Shape definition
struct Shape {
  x: f32,             // Position X
  y: f32,             // Position Y
  width: f32,         // Bounding box width (matches mask size)
  height: f32,        // Bounding box height (matches mask size)
  temperature: f32,   // For emission calculations
  layer: u32,         // Render order (0 = background, higher = foreground)
  materialIndex: u32, // Index into material textures
  maskIndex: u32,     // Index into mask textures
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> shapes: array<Shape>;
@group(0) @binding(2) var<storage, read_write> rgbOutput: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> spectrumOutput: array<f32>;
@group(0) @binding(4) var<storage, read_write> maxPerPixel: array<f32>;

// Material transmission textures (2D with height=1 for sampling support)
@group(1) @binding(0) var materialTexture0: texture_2d<f32>;
@group(1) @binding(1) var materialTexture1: texture_2d<f32>;
@group(1) @binding(2) var materialTexture2: texture_2d<f32>;
@group(1) @binding(3) var textureSampler: sampler;

// CIE color matching function textures (2D with height=1)
@group(2) @binding(0) var cieXTexture: texture_2d<f32>;
@group(2) @binding(1) var cieYTexture: texture_2d<f32>;
@group(2) @binding(2) var cieZTexture: texture_2d<f32>;
@group(2) @binding(3) var cieSampler: sampler;

// CIE scale factors
@group(2) @binding(4) var<uniform> cieScales: vec4<f32>; // x, y, z, unused

// Mask textures (r32float, sampled at shape-relative coordinates)
@group(3) @binding(0) var maskTexture0: texture_2d<f32>;
@group(3) @binding(1) var maskTexture1: texture_2d<f32>;
@group(3) @binding(2) var maskTexture2: texture_2d<f32>;
@group(3) @binding(3) var maskTexture3: texture_2d<f32>;
@group(3) @binding(4) var maskSampler: sampler;

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
 * Sample material transmission at wavelength
 */
fn getMaterialTransmission(materialIndex: u32, wavelengthNm: f32) -> f32 {
  let u = (wavelengthNm - params.wavelengthMin) / (params.wavelengthMax - params.wavelengthMin);
  let uv = vec2<f32>(u, 0.5);  // Use vec2 for 2D texture sampling
  
  if (materialIndex == 0u) {
    return textureSampleLevel(materialTexture0, textureSampler, uv, 0.0).r;
  } else if (materialIndex == 1u) {
    return textureSampleLevel(materialTexture1, textureSampler, uv, 0.0).r;
  } else if (materialIndex == 2u) {
    return textureSampleLevel(materialTexture2, textureSampler, uv, 0.0).r;
  }
  
  return 1.0;  // Default: full transmission
}

/**
 * Sample mask texture at shape-relative coordinates
 * Returns mask value (0.0 = outside, 1.0 = fully inside)
 */
fn sampleMask(maskIndex: u32, u: f32, v: f32) -> f32 {
  let uv = vec2<f32>(u, v);
  
  if (maskIndex == 0u) {
    return textureSampleLevel(maskTexture0, maskSampler, uv, 0.0).r;
  } else if (maskIndex == 1u) {
    return textureSampleLevel(maskTexture1, maskSampler, uv, 0.0).r;
  } else if (maskIndex == 2u) {
    return textureSampleLevel(maskTexture2, maskSampler, uv, 0.0).r;
  } else if (maskIndex == 3u) {
    return textureSampleLevel(maskTexture3, maskSampler, uv, 0.0).r;
  }
  return 0.0;
}

/**
 * Get shape mask value at pixel coordinates
 * Returns 0.0-1.0 based on mask texture sampling
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
  
  // Sample mask texture
  return sampleMask(shape.maskIndex, u, v);
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
 * Main compute shader entry point
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
  
  // Determine which shapes affect this pixel and their mask values
  var activeShapes: array<u32, 8>;
  var shapeMasks: array<f32, 8>;
  var numActiveShapes: u32 = 0u;
  
  let numShapes = arrayLength(&shapes);
  for (var i: u32 = 0u; i < numShapes && numActiveShapes < 8u; i++) {
    let mask = getShapeMask(shapes[i], fx, fy);
    if (mask > 0.0) {
      activeShapes[numActiveShapes] = i;
      shapeMasks[numActiveShapes] = mask;
      numActiveShapes++;
    }
  }
  
  // Integrate spectrum and track max intensity
  let dLambda = (VISIBLE_MAX - VISIBLE_MIN) / f32(params.spectralResolution);
  var xyz = vec3<f32>(0.0, 0.0, 0.0);
  var maxIntensity: f32 = 0.0;
  
  for (var i: u32 = 0u; i < params.spectralResolution; i++) {
    let wavelength = VISIBLE_MIN + (f32(i) + 0.5) * dLambda;
    
    // Start with background
    var intensity = getBackgroundIntensity(wavelength);
    var totalTransmission = 1.0;
    var emission = 0.0;
    
    // Apply all active shapes, blending by mask value
    for (var s: u32 = 0u; s < numActiveShapes; s++) {
      let shape = shapes[activeShapes[s]];
      let mask = shapeMasks[s];
      let materialTrans = getMaterialTransmission(shape.materialIndex, wavelength);
      
      // Blend between full transmission (1.0) and material transmission based on mask
      let trans = mix(1.0, materialTrans, mask);
      totalTransmission *= trans;
      
      if (params.enableEmission == 1u) {
        let em = getKirchhoffEmission(materialTrans, wavelength, shape.temperature);
        emission += em * mask;  // Scale emission by mask
      }
    }
    
    intensity = intensity * totalTransmission + emission;
    
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
  
  // If this is the sample point, output full spectrum
  if (params.sampleX >= 0 && params.sampleY >= 0 &&
      i32(x) == params.sampleX && i32(y) == params.sampleY) {
    let fullRes = params.spectralResolution;
    let step = (params.wavelengthMax - params.wavelengthMin) / f32(fullRes - 1u);
    
    for (var i: u32 = 0u; i < fullRes; i++) {
      let wavelength = params.wavelengthMin + f32(i) * step;
      
      var intensity = getBackgroundIntensity(wavelength);
      var totalTransmission = 1.0;
      var emission = 0.0;
      
      for (var s: u32 = 0u; s < numActiveShapes; s++) {
        let shape = shapes[activeShapes[s]];
        let mask = shapeMasks[s];
        let materialTrans = getMaterialTransmission(shape.materialIndex, wavelength);
        
        // Blend between full transmission (1.0) and material transmission based on mask
        let trans = mix(1.0, materialTrans, mask);
        totalTransmission *= trans;
        
        if (params.enableEmission == 1u) {
          let em = getKirchhoffEmission(materialTrans, wavelength, shape.temperature);
          emission += em * mask;
        }
      }
      
      spectrumOutput[i] = intensity * totalTransmission + emission;
    }
  }
}


