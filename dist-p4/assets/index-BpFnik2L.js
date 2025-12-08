var H=Object.defineProperty;var V=(l,e,t)=>e in l?H(l,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):l[e]=t;var a=(l,e,t)=>V(l,typeof e!="symbol"?e+"":e,t);(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))i(n);new MutationObserver(n=>{for(const s of n)if(s.type==="childList")for(const r of s.addedNodes)r.tagName==="LINK"&&r.rel==="modulepreload"&&i(r)}).observe(document,{childList:!0,subtree:!0});function t(n){const s={};return n.integrity&&(s.integrity=n.integrity),n.referrerPolicy&&(s.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?s.credentials="include":n.crossOrigin==="anonymous"?s.credentials="omit":s.credentials="same-origin",s}function i(n){if(n.ep)return;n.ep=!0;const s=t(n);fetch(n.href,s)}})();async function q(){if(!navigator.gpu)return console.warn("[WebGPU] Not supported in this browser"),null;const l=await navigator.gpu.requestAdapter({powerPreference:"high-performance"});if(!l)return console.warn("[WebGPU] No adapter available"),null;console.log("[WebGPU] Adapter available");const e=[];l.features.has("float32-filterable")?(e.push("float32-filterable"),console.log("[WebGPU] float32-filterable feature available")):console.warn("[WebGPU] float32-filterable not available - spectral textures may not work correctly"),l.features.has("shader-f16")?(e.push("shader-f16"),console.log("[WebGPU] shader-f16 feature available - using half precision for spectrum")):console.warn("[WebGPU] shader-f16 not available - using full precision"),l.features.has("timestamp-query")?(e.push("timestamp-query"),console.log("[WebGPU] timestamp-query feature available - GPU profiling enabled")):console.warn("[WebGPU] timestamp-query not available - GPU profiling disabled");const t=await l.requestDevice({requiredFeatures:e,requiredLimits:{}});t.lost.then(n=>{console.error("[WebGPU] Device lost:",n.message),n.reason!=="destroyed"&&console.log("[WebGPU] Attempting device recovery...")});const i=navigator.gpu.getPreferredCanvasFormat();return console.log("[WebGPU] Initialized with format:",i),console.log("[WebGPU] Features enabled:",Array.from(t.features)),{adapter:l,device:t,format:i}}function W(l,e){return l.createBuffer({size:e,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST})}function j(l,e){return l.createBuffer({size:e,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST})}async function R(l,e,t){const i=j(l,t),n=l.createCommandEncoder();n.copyBufferToBuffer(e,0,i,0,t),l.queue.submit([n.finish()]),await i.mapAsync(GPUMapMode.READ);const s=new Float32Array(i.getMappedRange().slice(0));return i.unmap(),i.destroy(),s}function z(l,e,t){const i=l.createTexture({label:t,size:[e.length,1,1],format:"r32float",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});return l.queue.writeTexture({texture:i},e.buffer,{bytesPerRow:e.length*4},[e.length,1,1]),i}const Z=380,K=700,B=[[380,.001368,39e-6,.00645],[385,.002236,64e-6,.01055],[390,.004243,12e-5,.02005],[395,.00765,217e-6,.03621],[400,.01431,396e-6,.06785],[405,.02319,64e-5,.1102],[410,.04351,.00121,.2074],[415,.07763,.00218,.3713],[420,.13438,.004,.6456],[425,.21477,.0073,1.03905],[430,.2839,.0116,1.3856],[435,.3285,.01684,1.62296],[440,.34828,.023,1.74706],[445,.34806,.0298,1.7826],[450,.3362,.038,1.77211],[455,.3187,.048,1.7441],[460,.2908,.06,1.6692],[465,.2511,.0739,1.5281],[470,.19536,.09098,1.28764],[475,.1421,.1126,1.0419],[480,.09564,.13902,.81295],[485,.05801,.1693,.6162],[490,.03201,.20802,.46518],[495,.0147,.2586,.3533],[500,.0049,.323,.272],[505,.0024,.4073,.2123],[510,.0093,.503,.1582],[515,.0291,.6082,.1117],[520,.06327,.71,.07825],[525,.1096,.7932,.05725],[530,.1655,.862,.04216],[535,.22575,.91485,.02984],[540,.2904,.954,.0203],[545,.3597,.9803,.0134],[550,.43345,.99495,.00875],[555,.51205,1,.00575],[560,.5945,.995,.0039],[565,.6784,.9786,.00275],[570,.7621,.952,.0021],[575,.8425,.9154,.0018],[580,.9163,.87,.00165],[585,.9786,.8163,.0014],[590,1.0263,.757,.0011],[595,1.0567,.6949,.001],[600,1.0622,.631,8e-4],[605,1.0456,.5668,6e-4],[610,1.0026,.503,34e-5],[615,.9384,.4412,24e-5],[620,.85445,.381,19e-5],[625,.7514,.321,1e-4],[630,.6424,.265,5e-5],[635,.5419,.217,3e-5],[640,.4479,.175,2e-5],[645,.3608,.1382,1e-5],[650,.2835,.107,0],[655,.2187,.0816,0],[660,.1649,.061,0],[665,.1212,.04458,0],[670,.0874,.032,0],[675,.0636,.0232,0],[680,.04677,.017,0],[685,.0329,.01192,0],[690,.0227,.00821,0],[695,.01584,.005723,0],[700,.011359,.004102,0]];function Q(l){return F(l,1)}function J(l){return F(l,2)}function ee(l){return F(l,3)}function F(l,e){if(l<Z||l>K)return 0;let t=0;for(let r=0;r<B.length-1;r++)if(B[r][0]<=l&&B[r+1][0]>=l){t=r;break}const i=B[t],n=B[t+1],s=(l-i[0])/(n[0]-i[0]);return i[e]+s*(n[e]-i[e])}function te(l,e,t){const i=new Float32Array(t),n=new Float32Array(t),s=new Float32Array(t),r=(e-l)/(t-1);let o=0,h=0,u=0;for(let d=0;d<t;d++){const p=l+d*r;i[d]=Q(p),n[d]=J(p),s[d]=ee(p),o=Math.max(o,i[d]),h=Math.max(h,n[d]),u=Math.max(u,s[d])}const c={x:o||1,y:h||1,z:u||1};for(let d=0;d<t;d++)i[d]/=c.x,n[d]/=c.y,s[d]/=c.z;return{x:i,y:n,z:s,scales:c}}const ie=`/**
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
`,P=class P{constructor(e){a(this,"device");a(this,"colorPipeline",null);a(this,"spectrumBoxPipeline",null);a(this,"averagePipeline",null);a(this,"bindGroupLayout0",null);a(this,"bindGroupLayout1",null);a(this,"bindGroupLayout2",null);a(this,"bindGroupLayout3",null);a(this,"pipelineLayout",null);a(this,"paramsBuffer",null);a(this,"shapesBuffer",null);a(this,"maxPerPixelBuffer",null);a(this,"spectrumBoxBuffer",null);a(this,"rgbOutputBuffers",[null,null]);a(this,"spectrumOutputBuffers",[null,null]);a(this,"currentBufferIndex",0);a(this,"frameCount",0);a(this,"lastGlobalMaxIntensity",1);a(this,"materialPaletteTexture",null);a(this,"numMaterials",0);a(this,"msdfTextures",[]);a(this,"cieTextures",null);a(this,"cieScalesBuffer",null);a(this,"textureSampler",null);a(this,"msdfSampler",null);a(this,"bindGroup0",null);a(this,"bindGroup1",null);a(this,"bindGroup2",null);a(this,"bindGroup3",null);a(this,"width",0);a(this,"height",0);a(this,"plotResolution",P.MAX_SPECTRAL_RESOLUTION);a(this,"boxSize",P.DEFAULT_BOX_SIZE);a(this,"timestampQuerySet",null);a(this,"timestampBuffer",null);a(this,"timestampReadBuffer",null);a(this,"hasTimestampSupport",!1);a(this,"lastPassTimings",[]);this.device=e,this.hasTimestampSupport=e.features.has("timestamp-query")}async initialize(){const e=this.device.createShaderModule({label:"Spectral Compute Shader",code:ie});this.createBindGroupLayouts(),this.pipelineLayout=this.device.createPipelineLayout({label:"Spectral Pipeline Layout",bindGroupLayouts:[this.bindGroupLayout0,this.bindGroupLayout1,this.bindGroupLayout2,this.bindGroupLayout3]}),this.colorPipeline=this.device.createComputePipeline({label:"Color Compute Pipeline",layout:this.pipelineLayout,compute:{module:e,entryPoint:"main"}}),this.spectrumBoxPipeline=this.device.createComputePipeline({label:"Spectrum Box Pipeline",layout:this.pipelineLayout,compute:{module:e,entryPoint:"computeSpectrumBox"}}),this.averagePipeline=this.device.createComputePipeline({label:"Spectrum Average Pipeline",layout:this.pipelineLayout,compute:{module:e,entryPoint:"averageSpectrum"}});const t=this.device.features.has("float32-filterable");this.textureSampler=this.device.createSampler({addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge",magFilter:t?"linear":"nearest",minFilter:t?"linear":"nearest"}),this.msdfSampler=this.device.createSampler({addressModeU:"clamp-to-edge",addressModeV:"clamp-to-edge",magFilter:"linear",minFilter:"linear"}),this.hasTimestampSupport&&this.initTimestampQueries(),this.initCIETextures(),this.initDefaultMaterialPalette(),this.initDefaultMSDFTextures(),this.initSpectrumBoxBuffer(),console.log("[SpectralCompute] Pipeline initialized"),console.log(`[SpectralCompute] Timestamp queries: ${this.hasTimestampSupport?"enabled":"disabled"}`),console.log(`[SpectralCompute] f16 support: ${this.device.features.has("shader-f16")?"enabled":"disabled"}`)}initTimestampQueries(){this.timestampQuerySet=this.device.createQuerySet({type:"timestamp",count:8}),this.timestampBuffer=this.device.createBuffer({size:8*8,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC}),this.timestampReadBuffer=this.device.createBuffer({size:8*8,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST})}createBindGroupLayouts(){const e=this.device.features.has("float32-filterable"),t=e?"float":"unfilterable-float",i=e?"filtering":"non-filtering";this.bindGroupLayout0=this.device.createBindGroupLayout({label:"Bind Group Layout 0 (Buffers)",entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}},{binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:"read-only-storage"}},{binding:2,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},{binding:3,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},{binding:4,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}},{binding:5,visibility:GPUShaderStage.COMPUTE,buffer:{type:"storage"}}]}),this.bindGroupLayout1=this.device.createBindGroupLayout({label:"Bind Group Layout 1 (Material Palette)",entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,texture:{sampleType:t}},{binding:1,visibility:GPUShaderStage.COMPUTE,sampler:{type:i}}]}),this.bindGroupLayout2=this.device.createBindGroupLayout({label:"Bind Group Layout 2 (CIE)",entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,texture:{sampleType:t}},{binding:1,visibility:GPUShaderStage.COMPUTE,texture:{sampleType:t}},{binding:2,visibility:GPUShaderStage.COMPUTE,texture:{sampleType:t}},{binding:3,visibility:GPUShaderStage.COMPUTE,sampler:{type:i}},{binding:4,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}}]}),this.bindGroupLayout3=this.device.createBindGroupLayout({label:"Bind Group Layout 3 (MSDF)",entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,texture:{sampleType:"float"}},{binding:1,visibility:GPUShaderStage.COMPUTE,texture:{sampleType:"float"}},{binding:2,visibility:GPUShaderStage.COMPUTE,texture:{sampleType:"float"}},{binding:3,visibility:GPUShaderStage.COMPUTE,texture:{sampleType:"float"}},{binding:4,visibility:GPUShaderStage.COMPUTE,sampler:{type:"filtering"}}]})}initDefaultMaterialPalette(){const e=new Float32Array(100).fill(1);this.createMaterialPalette([e])}initCIETextures(){const t=te(380,700,321);this.cieTextures={x:z(this.device,t.x,"CIE X"),y:z(this.device,t.y,"CIE Y"),z:z(this.device,t.z,"CIE Z")},this.cieScalesBuffer=W(this.device,16),this.device.queue.writeBuffer(this.cieScalesBuffer,0,new Float32Array([t.scales.x,t.scales.y,t.scales.z,0]))}initDefaultMSDFTextures(){for(let e=0;e<4;e++){const t=this.device.createTexture({label:`Default MSDF ${e}`,size:{width:1,height:1,depthOrArrayLayers:1},format:"rgba8unorm",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});this.device.queue.writeTexture({texture:t},new Uint8Array([0,0,0,255]),{bytesPerRow:4,rowsPerImage:1},{width:1,height:1,depthOrArrayLayers:1}),this.msdfTextures.push(t)}}initSpectrumBoxBuffer(){const e=this.boxSize*this.boxSize*this.plotResolution*2;this.spectrumBoxBuffer=this.device.createBuffer({label:"Spectrum Box (f16)",size:e,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC}),console.log(`[SpectralCompute] Spectrum box buffer (f16): ${(e/1024/1024).toFixed(2)} MB`)}setMaskTextures(e){for(this.msdfTextures=e;this.msdfTextures.length<4;){const t=this.device.createTexture({label:`Padding MSDF ${this.msdfTextures.length}`,size:{width:1,height:1,depthOrArrayLayers:1},format:"rgba8unorm",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});this.device.queue.writeTexture({texture:t},new Uint8Array([0,0,0,255]),{bytesPerRow:4,rowsPerImage:1},{width:1,height:1,depthOrArrayLayers:1}),this.msdfTextures.push(t)}this.bindGroup3=null}setMaterials(e){if(e.length===0){const t=new Float32Array(100).fill(1);this.createMaterialPalette([t])}else this.createMaterialPalette(e);this.bindGroup1=null}createMaterialPalette(e){if(e.length===0)return;const t=e[0].length,i=e.length,n=new Float32Array(t*i);for(let s=0;s<i;s++){const r=e[s],o=s*t;for(let h=0;h<t;h++)n[o+h]=r[h]??1}this.materialPaletteTexture=this.device.createTexture({label:`Material Palette (${i} materials)`,size:{width:t,height:i,depthOrArrayLayers:1},format:"r32float",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST}),this.device.queue.writeTexture({texture:this.materialPaletteTexture},n,{bytesPerRow:t*4,rowsPerImage:i},{width:t,height:i,depthOrArrayLayers:1}),this.numMaterials=i}resize(e,t){var n,s,r,o,h;if(e===this.width&&t===this.height)return;this.width=e,this.height=t,(n=this.rgbOutputBuffers[0])==null||n.destroy(),(s=this.rgbOutputBuffers[1])==null||s.destroy(),(r=this.spectrumOutputBuffers[0])==null||r.destroy(),(o=this.spectrumOutputBuffers[1])==null||o.destroy(),(h=this.maxPerPixelBuffer)==null||h.destroy();const i=e*t;for(let u=0;u<2;u++)this.rgbOutputBuffers[u]=this.device.createBuffer({label:`RGB Output ${u}`,size:i*4*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});for(let u=0;u<2;u++)this.spectrumOutputBuffers[u]=this.device.createBuffer({label:`Spectrum Output ${u}`,size:P.MAX_SPECTRAL_RESOLUTION*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});this.maxPerPixelBuffer=this.device.createBuffer({label:"Max Per Pixel",size:i*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC}),this.frameCount=0,this.bindGroup0=null}getBufferIndices(){const e=this.currentBufferIndex,t=1-this.currentBufferIndex;return{writeIndex:e,readIndex:t}}swapBuffers(){this.currentBufferIndex=1-this.currentBufferIndex,this.frameCount++,this.bindGroup0=null}async compute(e,t){var S;if(!this.colorPipeline)throw new Error("Pipeline not initialized");this.plotResolution=e.plotResolution??P.MAX_SPECTRAL_RESOLUTION;const i=e.boxSize??P.DEFAULT_BOX_SIZE;i!==this.boxSize&&(this.boxSize=i,(S=this.spectrumBoxBuffer)==null||S.destroy(),this.initSpectrumBoxBuffer(),this.bindGroup0=null),this.resize(e.width,e.height),this.updateShapesBuffer(t);const n=(e.sampleX??-1)>=0&&(e.sampleY??-1)>=0,s=Math.ceil(e.width/8),r=Math.ceil(e.height/8);this.lastPassTimings=[];const o=performance.now();this.updateParamsBuffer(e,0,1),this.ensureBindGroups();const h=this.device.createCommandEncoder(),u=h.beginComputePass();u.setPipeline(this.colorPipeline),u.setBindGroup(0,this.bindGroup0),u.setBindGroup(1,this.bindGroup1),u.setBindGroup(2,this.bindGroup2),u.setBindGroup(3,this.bindGroup3),u.dispatchWorkgroups(s,r),u.end(),this.device.queue.submit([h.finish()]);const c=await this.readMaxPerPixel();let d=.001;for(let x=0;x<c.length;x++)c[x]>d&&(d=c[x]);this.lastGlobalMaxIntensity=d;const p=performance.now();this.lastPassTimings.push({name:"Pass 0 (Color)",startTime:o,endTime:p,duration:p-o});const m=performance.now();this.updateParamsBuffer(e,1,d);const g=this.device.createCommandEncoder(),f=g.beginComputePass();f.setPipeline(this.colorPipeline),f.setBindGroup(0,this.bindGroup0),f.setBindGroup(1,this.bindGroup1),f.setBindGroup(2,this.bindGroup2),f.setBindGroup(3,this.bindGroup3),f.dispatchWorkgroups(s,r),f.end(),this.device.queue.submit([g.finish()]),await this.device.queue.onSubmittedWorkDone();const b=performance.now();if(this.lastPassTimings.push({name:"Pass 1 (Normalize)",startTime:m,endTime:b,duration:b-m}),n&&this.spectrumBoxPipeline&&this.averagePipeline){const x=performance.now();this.updateParamsBuffer(e,0,d),this.ensureBindGroups();const I=Math.ceil(this.boxSize/8),w=Math.ceil(this.boxSize/8),y=this.device.createCommandEncoder(),v=y.beginComputePass();v.setPipeline(this.spectrumBoxPipeline),v.setBindGroup(0,this.bindGroup0),v.setBindGroup(1,this.bindGroup1),v.setBindGroup(2,this.bindGroup2),v.setBindGroup(3,this.bindGroup3),v.dispatchWorkgroups(I,w),v.end(),this.device.queue.submit([y.finish()]),await this.device.queue.onSubmittedWorkDone();const C=performance.now();this.lastPassTimings.push({name:"Pass 2 (Spectrum Box)",startTime:x,endTime:C,duration:C-x});const k=performance.now();this.ensureBindGroups();const Y=Math.ceil(this.plotResolution/256),$=this.device.createCommandEncoder(),T=$.beginComputePass();T.setPipeline(this.averagePipeline),T.setBindGroup(0,this.bindGroup0),T.setBindGroup(1,this.bindGroup1),T.setBindGroup(2,this.bindGroup2),T.setBindGroup(3,this.bindGroup3),T.dispatchWorkgroups(Y),T.end(),this.device.queue.submit([$.finish()]),await this.device.queue.onSubmittedWorkDone();const A=performance.now();this.lastPassTimings.push({name:"Pass 3 (Average)",startTime:k,endTime:A,duration:A-k})}return this.swapBuffers(),{globalMaxIntensity:d}}getLastGlobalMaxIntensity(){return this.lastGlobalMaxIntensity}getPassTimings(){return this.lastPassTimings}async readRGBOutput(){const{readIndex:e}=this.getBufferIndices(),t=this.rgbOutputBuffers[e];return!t||this.frameCount<1?new Float32Array(this.width*this.height*4):R(this.device,t,this.width*this.height*4*4)}async readSpectrumOutput(){const{readIndex:e}=this.getBufferIndices(),t=this.spectrumOutputBuffers[e];return!t||this.frameCount<1?new Float32Array(this.plotResolution):R(this.device,t,this.plotResolution*4)}async readMaxPerPixel(){if(!this.maxPerPixelBuffer)throw new Error("No max buffer");return R(this.device,this.maxPerPixelBuffer,this.width*this.height*4)}getRGBBuffer(){const{writeIndex:e}=this.getBufferIndices();return this.rgbOutputBuffers[e]}updateParamsBuffer(e,t=0,i=1){this.paramsBuffer||(this.paramsBuffer=W(this.device,64));const n=e.backgroundMode==="normal"?0:e.backgroundMode==="uv"?1:2,s=new ArrayBuffer(64),r=new DataView(s);r.setUint32(0,e.width,!0),r.setUint32(4,e.height,!0),r.setFloat32(8,e.wavelengthMin,!0),r.setFloat32(12,e.wavelengthMax,!0),r.setUint32(16,e.spectralResolution,!0),r.setUint32(20,n,!0),r.setUint32(24,e.enableEmission?1:0,!0),r.setInt32(28,e.sampleX??-1,!0),r.setInt32(32,e.sampleY??-1,!0),r.setUint32(36,t,!0),r.setFloat32(40,i,!0),r.setFloat32(44,e.msdfPxRange??4,!0),r.setUint32(48,this.numMaterials,!0),r.setUint32(52,e.plotResolution??5e3,!0),r.setUint32(56,e.averageRadius??5,!0),r.setUint32(60,this.boxSize,!0),this.device.queue.writeBuffer(this.paramsBuffer,0,s)}updateShapesBuffer(e){var s;const i=new ArrayBuffer(Math.max(e.length,1)*48),n=new DataView(i);for(let r=0;r<e.length;r++){const o=r*48,h=e[r];n.setFloat32(o+0,h.x,!0),n.setFloat32(o+4,h.y,!0),n.setFloat32(o+8,h.width,!0),n.setFloat32(o+12,h.height,!0),n.setFloat32(o+16,h.temperature,!0),n.setUint32(o+20,h.layer,!0),n.setUint32(o+24,h.materialIndex,!0),n.setUint32(o+28,h.maskIndex,!0),n.setFloat32(o+32,h.texWidth??256,!0),n.setFloat32(o+36,h.texHeight??256,!0)}(!this.shapesBuffer||this.shapesBuffer.size<i.byteLength)&&((s=this.shapesBuffer)==null||s.destroy(),this.shapesBuffer=this.device.createBuffer({label:"Shapes",size:i.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),this.bindGroup0=null),this.device.queue.writeBuffer(this.shapesBuffer,0,i)}ensureBindGroups(){if(!this.bindGroup0){const{writeIndex:e}=this.getBufferIndices(),t=this.rgbOutputBuffers[e],i=this.spectrumOutputBuffers[e];if(!this.paramsBuffer||!this.shapesBuffer||!t||!i||!this.maxPerPixelBuffer||!this.spectrumBoxBuffer||!this.bindGroupLayout0){console.error("[SpectralCompute] Cannot create bindGroup0 - missing buffers or layout");return}this.bindGroup0=this.device.createBindGroup({label:`Bind Group 0 (Buffers, write=${e})`,layout:this.bindGroupLayout0,entries:[{binding:0,resource:{buffer:this.paramsBuffer}},{binding:1,resource:{buffer:this.shapesBuffer}},{binding:2,resource:{buffer:t}},{binding:3,resource:{buffer:i}},{binding:4,resource:{buffer:this.maxPerPixelBuffer}},{binding:5,resource:{buffer:this.spectrumBoxBuffer}}]})}if(!this.bindGroup1){if(this.materialPaletteTexture||this.initDefaultMaterialPalette(),!this.textureSampler||!this.materialPaletteTexture||!this.bindGroupLayout1){console.error("[SpectralCompute] Cannot create bindGroup1 - missing resources or layout");return}this.bindGroup1=this.device.createBindGroup({label:"Bind Group 1 (Material Palette)",layout:this.bindGroupLayout1,entries:[{binding:0,resource:this.materialPaletteTexture.createView()},{binding:1,resource:this.textureSampler}]})}if(!this.bindGroup2){if(!this.cieTextures||!this.cieScalesBuffer||!this.textureSampler||!this.bindGroupLayout2){console.error("[SpectralCompute] Cannot create bindGroup2 - missing CIE resources or layout");return}this.bindGroup2=this.device.createBindGroup({label:"Bind Group 2 (CIE)",layout:this.bindGroupLayout2,entries:[{binding:0,resource:this.cieTextures.x.createView()},{binding:1,resource:this.cieTextures.y.createView()},{binding:2,resource:this.cieTextures.z.createView()},{binding:3,resource:this.textureSampler},{binding:4,resource:{buffer:this.cieScalesBuffer}}]})}if(!this.bindGroup3){for(;this.msdfTextures.length<4;){const e=this.device.createTexture({label:`Fallback MSDF ${this.msdfTextures.length}`,size:{width:1,height:1,depthOrArrayLayers:1},format:"rgba8unorm",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});this.device.queue.writeTexture({texture:e},new Uint8Array([0,0,0,255]),{bytesPerRow:4,rowsPerImage:1},{width:1,height:1,depthOrArrayLayers:1}),this.msdfTextures.push(e)}if(!this.msdfSampler||!this.bindGroupLayout3){console.error("[SpectralCompute] Cannot create bindGroup3 - missing MSDF sampler or layout");return}this.bindGroup3=this.device.createBindGroup({label:"Bind Group 3 (MSDF)",layout:this.bindGroupLayout3,entries:[{binding:0,resource:this.msdfTextures[0].createView()},{binding:1,resource:this.msdfTextures[1].createView()},{binding:2,resource:this.msdfTextures[2].createView()},{binding:3,resource:this.msdfTextures[3].createView()},{binding:4,resource:this.msdfSampler}]})}}getNumMaterials(){return this.numMaterials}destroy(){var e,t,i,n,s,r,o,h,u,c,d,p,m,g,f,b;(e=this.paramsBuffer)==null||e.destroy(),(t=this.shapesBuffer)==null||t.destroy(),(i=this.rgbOutputBuffers[0])==null||i.destroy(),(n=this.rgbOutputBuffers[1])==null||n.destroy(),(s=this.spectrumOutputBuffers[0])==null||s.destroy(),(r=this.spectrumOutputBuffers[1])==null||r.destroy(),(o=this.maxPerPixelBuffer)==null||o.destroy(),(h=this.spectrumBoxBuffer)==null||h.destroy(),(u=this.cieScalesBuffer)==null||u.destroy(),(c=this.timestampBuffer)==null||c.destroy(),(d=this.timestampReadBuffer)==null||d.destroy(),(p=this.timestampQuerySet)==null||p.destroy(),(m=this.materialPaletteTexture)==null||m.destroy();for(const S of this.msdfTextures)S.destroy();(g=this.cieTextures)==null||g.x.destroy(),(f=this.cieTextures)==null||f.y.destroy(),(b=this.cieTextures)==null||b.z.destroy()}};a(P,"MAX_SPECTRAL_RESOLUTION",5e3),a(P,"DEFAULT_BOX_SIZE",30);let U=P;async function ne(l){const e=await fetch(l);if(!e.ok)throw new Error(`Failed to load MSDF image: ${l} (${e.status})`);const t=await e.blob();return createImageBitmap(t)}function se(l,e,t){const{width:i,height:n}=e,s=l.createTexture({label:`MSDF: ${t}`,size:{width:i,height:n,depthOrArrayLayers:1},format:"rgba8unorm",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});return l.queue.copyExternalImageToTexture({source:e},{texture:s},{width:i,height:n}),s}class ae{constructor(e,t="/msdf"){a(this,"device");a(this,"msdfs",new Map);a(this,"loadingPromises",new Map);a(this,"basePath");a(this,"metadata",null);a(this,"metadataPromise",null);this.device=e,this.basePath=t}async loadMetadata(){return this.metadata?this.metadata:this.metadataPromise?this.metadataPromise:(this.metadataPromise=(async()=>{const e=`${this.basePath}/metadata.json`,t=await fetch(e);return t.ok?(this.metadata=await t.json(),console.log(`[MaskManager] Loaded metadata: pxRange=${this.metadata.pxRange}`),this.metadata):(console.warn(`[MaskManager] Metadata not found at ${e}, using defaults`),this.metadata={pxRange:4,shapes:[]},this.metadata)})(),this.metadataPromise)}async loadMask(e){const t=this.msdfs.get(e);if(t)return t;const i=this.loadingPromises.get(e);if(i)return i;const n=this.doLoadMask(e);this.loadingPromises.set(e,n);try{return await n}finally{this.loadingPromises.delete(e)}}async doLoadMask(e){const t=await this.loadMetadata(),i=`${this.basePath}/${e}.png`;console.log(`[MaskManager] Loading MSDF: ${i}`);const n=await ne(i),s=se(this.device,n,e);t.shapes.find(o=>o.name===e);const r={name:e,width:n.width,height:n.height,texture:s,pxRange:t.pxRange};return this.msdfs.set(e,r),console.log(`[MaskManager] Loaded MSDF: ${e} (${r.width}x${r.height}, pxRange=${r.pxRange})`),r}async loadMasks(e){return Promise.all(e.map(t=>this.loadMask(t)))}getMask(e){return this.msdfs.get(e)}getAllMasks(){return Array.from(this.msdfs.values())}getMaskIndex(e){const i=this.getAllMasks().findIndex(n=>n.name===e);return i<0?(console.warn(`[MaskManager] MSDF not found: ${e}, using default`),0):i}getPxRange(){var e;return((e=this.metadata)==null?void 0:e.pxRange)??4}destroy(){for(const e of this.msdfs.values())e.texture.destroy();this.msdfs.clear(),this.metadata=null}}class re{constructor(){a(this,"loggingMode","silent");a(this,"windowSize",60);a(this,"logIntervalSeconds",5);a(this,"frames",[]);a(this,"frameNumber",0);a(this,"lastLogTime",0);a(this,"currentFrameStart",0);a(this,"currentPassTimings",[]);a(this,"currentReadbackTime",0);a(this,"currentCacheHit",!1);a(this,"hasF16",!1);a(this,"hasTimestampQuery",!1);a(this,"config",{boxSize:15,plotResolution:5e3,averageRadius:5,colorResolution:16,screenWidth:1280,screenHeight:720});this.lastLogTime=performance.now()}setLoggingMode(e){this.loggingMode=e,console.log(`[Profiler] Logging mode: ${e}`)}setWindowSize(e){this.windowSize=e}setDeviceCapabilities(e,t){this.hasF16=e,this.hasTimestampQuery=t}updateConfig(e){this.config={...this.config,...e}}startFrame(){this.currentFrameStart=performance.now(),this.currentPassTimings=[],this.currentReadbackTime=0,this.currentCacheHit=!1}recordPassTimings(e){this.currentPassTimings=e}recordReadbackTime(e){this.currentReadbackTime=e}recordCacheHit(e){this.currentCacheHit=e}endFrame(){const e=performance.now(),t=e-this.currentFrameStart,i={frameNumber:this.frameNumber++,timestamp:e,frameTime:t,passTimings:this.currentPassTimings,readbackTime:this.currentReadbackTime,cacheHit:this.currentCacheHit};this.frames.push(i),this.frames.length>this.windowSize&&this.frames.shift(),this.loggingMode==="verbose"?this.logFrame(i):this.loggingMode==="summary"&&e-this.lastLogTime>=this.logIntervalSeconds*1e3&&(this.logSummary(),this.lastLogTime=e)}logFrame(e){const t=e.passTimings.map(i=>`${i.name}: ${i.duration.toFixed(2)}ms`).join(", ");console.log(`[Profiler] Frame ${e.frameNumber}: total=${e.frameTime.toFixed(2)}ms, ${t}, readback=${e.readbackTime.toFixed(2)}ms, cache=${e.cacheHit?"HIT":"MISS"}`)}logSummary(){const e=this.getSummary();console.log(`[Profiler] Summary (${this.frames.length} frames): FPS=${e.avgFPS.toFixed(1)}, frame=${e.avgFrameTime.toFixed(2)}ms, P0=${e.avgPass0.toFixed(2)}ms, P1=${e.avgPass1.toFixed(2)}ms, P2=${e.avgPass2.toFixed(2)}ms, P3=${e.avgPass3.toFixed(2)}ms, readback=${e.avgReadback.toFixed(2)}ms, cacheHit=${(e.cacheHitRate*100).toFixed(1)}%`)}getMetrics(){return this.frames.length>0?this.frames[this.frames.length-1]:null}getSummary(){if(this.frames.length===0)return{avgFPS:0,avgFrameTime:0,avgPass0:0,avgPass1:0,avgPass2:0,avgPass3:0,avgReadback:0,cacheHitRate:0,minFrameTime:0,maxFrameTime:0};let e=0,t=0,i=0,n=0,s=0,r=0,o=0,h=1/0,u=0;for(const p of this.frames){e+=p.frameTime,r+=p.readbackTime,p.cacheHit&&o++,p.frameTime<h&&(h=p.frameTime),p.frameTime>u&&(u=p.frameTime);for(const m of p.passTimings)m.name.includes("Pass 0")?t+=m.duration:m.name.includes("Pass 1")?i+=m.duration:m.name.includes("Pass 2")?n+=m.duration:m.name.includes("Pass 3")&&(s+=m.duration)}const c=this.frames.length,d=e/c;return{avgFPS:d>0?1e3/d:0,avgFrameTime:d,avgPass0:t/c,avgPass1:i/c,avgPass2:n/c,avgPass3:s/c,avgReadback:r/c,cacheHitRate:o/c,minFrameTime:h,maxFrameTime:u}}generateWarnings(){const e=[],t=this.getSummary();t.avgFPS<30&&e.push(`Low FPS: ${t.avgFPS.toFixed(1)} (target: 60)`),t.avgFrameTime>33&&e.push(`High frame time: ${t.avgFrameTime.toFixed(2)}ms (target: <16.6ms)`),t.avgPass2>10&&e.push(`Spectrum box computation slow: ${t.avgPass2.toFixed(2)}ms`),t.avgReadback>5&&e.push(`Buffer readback slow: ${t.avgReadback.toFixed(2)}ms`),t.cacheHitRate<.5&&e.push(`Low cache hit rate: ${(t.cacheHitRate*100).toFixed(1)}%`);const i=this.frames.filter(n=>n.frameTime>t.avgFrameTime*2).length;return i>this.windowSize*.1&&e.push(`Frame time spikes: ${i} frames > 2x average`),e}generateReport(){return{timestamp:new Date().toISOString(),config:this.config,summary:this.getSummary(),frames:[...this.frames],warnings:this.generateWarnings(),deviceInfo:{hasF16:this.hasF16,hasTimestampQuery:this.hasTimestampQuery}}}downloadReport(){const e=this.generateReport(),t=JSON.stringify(e,null,2),i=new Blob([t],{type:"application/json"}),n=URL.createObjectURL(i),s=document.createElement("a");s.href=n,s.download=`profiling-report-${Date.now()}.json`,document.body.appendChild(s),s.click(),document.body.removeChild(s),URL.revokeObjectURL(n),console.log("[Profiler] Report downloaded")}getDisplayText(){const e=this.getSummary(),t=[],i=e.avgFPS>=55?"green":e.avgFPS>=30?"yellow":"red";return t.push(`FPS: ${e.avgFPS.toFixed(1)} [${i}]`),t.push(`Frame: ${e.avgFrameTime.toFixed(2)}ms (${e.minFrameTime.toFixed(1)}-${e.maxFrameTime.toFixed(1)})`),t.push("---"),t.push(`Pass 0 (Color): ${e.avgPass0.toFixed(2)}ms`),t.push(`Pass 1 (Norm): ${e.avgPass1.toFixed(2)}ms`),t.push(`Pass 2 (Spectrum): ${e.avgPass2.toFixed(2)}ms`),t.push(`Pass 3 (Average): ${e.avgPass3.toFixed(2)}ms`),t.push(`Readback: ${e.avgReadback.toFixed(2)}ms`),t.push("---"),t.push(`Cache: ${(e.cacheHitRate*100).toFixed(0)}% hit`),t.push(`f16: ${this.hasF16?"ON":"OFF"}`),t.push("---"),t.push("[P] Toggle overlay"),t.push("[D] Download report"),t}reset(){this.frames=[],this.frameNumber=0}}const M=new re;class oe{constructor(){a(this,"context",null);a(this,"pipeline",null);a(this,"maskManager",null);a(this,"width",0);a(this,"height",0);a(this,"shapes",[]);a(this,"materials",[]);a(this,"backgroundMode","normal");a(this,"emissionEnabled",!0);a(this,"sampleX",-1);a(this,"sampleY",-1);a(this,"lastSpectrum",new Float32Array(0));a(this,"lastGlobalMax",1);a(this,"cachedSampleX",-1);a(this,"cachedSampleY",-1);a(this,"cachedShapesHash","");a(this,"cachedBackgroundMode","normal");a(this,"cachedEmissionEnabled",!0);a(this,"spectrumCacheValid",!1);a(this,"spectrumFrameCounter",0);a(this,"spectrumThrottleFrames",2);a(this,"spectrumMovementThreshold",3);a(this,"lastComputedX",-1);a(this,"lastComputedY",-1)}async init(){return this.context=await q(),this.context?(this.pipeline=new U(this.context.device),await this.pipeline.initialize(),M.setDeviceCapabilities(this.context.device.features.has("shader-f16"),this.context.device.features.has("timestamp-query")),!0):!1}resize(e,t){this.width=e,this.height=t}setMaterials(e){this.materials=e,this.pipeline&&this.pipeline.setMaterials(e)}setShapes(e){this.shapes=e}setBackgroundMode(e){this.backgroundMode=e}setEmissionEnabled(e){this.emissionEnabled=e}computeShapesHash(){return this.shapes.map(e=>`${e.x},${e.y},${e.width},${e.height},${e.materialIndex},${e.maskIndex},${e.temperature}`).join("|")}isSpectrumCacheValid(){return!(!this.spectrumCacheValid||this.sampleX!==this.cachedSampleX||this.sampleY!==this.cachedSampleY||this.backgroundMode!==this.cachedBackgroundMode||this.emissionEnabled!==this.cachedEmissionEnabled||this.computeShapesHash()!==this.cachedShapesHash)}updateSpectrumCache(){this.cachedSampleX=this.sampleX,this.cachedSampleY=this.sampleY,this.cachedBackgroundMode=this.backgroundMode,this.cachedEmissionEnabled=this.emissionEnabled,this.cachedShapesHash=this.computeShapesHash(),this.spectrumCacheValid=!0}invalidateSpectrumCache(){this.spectrumCacheValid=!1}shouldComputeSpectrum(){if(this.spectrumFrameCounter++,this.spectrumFrameCounter>=this.spectrumThrottleFrames)return!0;if(this.lastComputedX>=0&&this.lastComputedY>=0){const e=Math.abs(this.sampleX-this.lastComputedX),t=Math.abs(this.sampleY-this.lastComputedY);if(e>this.spectrumMovementThreshold||t>this.spectrumMovementThreshold)return!0}else if(this.sampleX>=0&&this.sampleY>=0)return!0;return!1}recordSpectrumComputed(){this.spectrumFrameCounter=0,this.lastComputedX=this.sampleX,this.lastComputedY=this.sampleY}async render(){if(!this.pipeline||this.width===0||this.height===0)return new ImageData(1,1);M.startFrame();const e=this.sampleX>=0&&this.sampleY>=0,t=this.isSpectrumCacheValid(),i=e&&!t&&this.shouldComputeSpectrum();M.recordCacheHit(!i&&e);const n={width:this.width,height:this.height,wavelengthMin:200,wavelengthMax:1e3,spectralResolution:16,backgroundMode:this.backgroundMode,enableEmission:this.emissionEnabled,sampleX:i?this.sampleX:-1,sampleY:i?this.sampleY:-1,msdfPxRange:this.getMsdfPxRange(),plotResolution:5e3,averageRadius:5,boxSize:11};M.updateConfig({boxSize:n.boxSize,plotResolution:n.plotResolution,averageRadius:n.averageRadius,colorResolution:n.spectralResolution,screenWidth:this.width,screenHeight:this.height});const s=await this.pipeline.compute(n,this.shapes);this.lastGlobalMax=s.globalMaxIntensity,M.recordPassTimings(this.pipeline.getPassTimings());const r=performance.now(),o=await this.pipeline.readRGBOutput();i&&(this.lastSpectrum=await this.pipeline.readSpectrumOutput(),this.updateSpectrumCache(),this.recordSpectrumComputed());const h=performance.now();M.recordReadbackTime(h-r);const u=new ImageData(this.width,this.height);for(let c=0;c<this.width*this.height;c++)u.data[c*4+0]=Math.round(o[c*4+0]*255),u.data[c*4+1]=Math.round(o[c*4+1]*255),u.data[c*4+2]=Math.round(o[c*4+2]*255),u.data[c*4+3]=255;return M.endFrame(),u}getGlobalMaxIntensity(){return this.lastGlobalMax}async loadMasks(e){if(!this.context||!this.pipeline){console.warn("[WebGPURenderer] Cannot load MSDF - not initialized");return}this.maskManager||(this.maskManager=new ae(this.context.device,"/msdf")),await this.maskManager.loadMasks(e);const t=this.maskManager.getAllMasks();this.pipeline.setMaskTextures(t.map(i=>i.texture)),console.log(`[WebGPURenderer] Loaded ${e.length} MSDF textures`)}getMaskIndex(e){var t;return((t=this.maskManager)==null?void 0:t.getMaskIndex(e))??0}getMaskDimensions(e){var i;const t=(i=this.maskManager)==null?void 0:i.getMask(e);return t?{width:t.width,height:t.height}:{width:256,height:256}}getMsdfPxRange(){var e;return((e=this.maskManager)==null?void 0:e.getPxRange())??4}setSamplePoint(e,t){this.sampleX=e,this.sampleY=t}async sampleSpectrum(e,t){return this.sampleX=e,this.sampleY=t,this.lastSpectrum}destroy(){var e,t,i;(e=this.pipeline)==null||e.destroy(),(t=this.maskManager)==null||t.destroy(),(i=this.context)==null||i.device.destroy()}}class le{constructor(){a(this,"width",0);a(this,"height",0);a(this,"shapes",[]);a(this,"materials",[]);a(this,"backgroundMode","normal");a(this,"emissionEnabled",!0);a(this,"lastSpectrum",new Float32Array(320).fill(1));a(this,"lastGlobalMax",1)}async init(){return console.log("[CPURenderer] Using CPU fallback"),!0}resize(e,t){this.width=e,this.height=t}setMaterials(e){this.materials=e}setShapes(e){this.shapes=e}setBackgroundMode(e){this.backgroundMode=e}setEmissionEnabled(e){this.emissionEnabled=e}async render(){const e=new ImageData(this.width,this.height),t=this.backgroundMode==="dark"?0:255;for(let i=0;i<this.width*this.height;i++)e.data[i*4+0]=t,e.data[i*4+1]=t,e.data[i*4+2]=t,e.data[i*4+3]=255;return e}async sampleSpectrum(e,t){return this.lastSpectrum}getGlobalMaxIntensity(){return this.lastGlobalMax}async loadMasks(e){console.log("[CPUFallbackRenderer] MSDF loading not supported in CPU mode")}getMaskIndex(e){return 0}getMaskDimensions(e){return{width:256,height:256}}getMsdfPxRange(){return 4}destroy(){}}async function he(){const l=new oe;if(await l.init())return l;console.warn("[createRenderer] WebGPU not available, using CPU fallback");const e=new le;return await e.init(),e}class ue{constructor(e){a(this,"wrapper");a(this,"canvas");a(this,"ctx");a(this,"renderer",null);a(this,"state");a(this,"animationId",null);this.wrapper=document.createElement("div"),this.wrapper.style.cssText=`
      position: relative;
      display: inline-block;
    `,e.appendChild(this.wrapper),this.canvas=document.createElement("canvas"),this.canvas.width=1280,this.canvas.height=720,this.canvas.style.display="block",this.wrapper.appendChild(this.canvas);const t=this.canvas.getContext("2d");if(!t)throw new Error("Failed to get 2D context");this.ctx=t,this.state={width:this.canvas.width,height:this.canvas.height,isInitialized:!1,currentDemo:null}}async initialize(){this.renderer=await he(),this.renderer.resize(this.state.width,this.state.height),this.state.isInitialized=!0,console.log("[GameScene] Initialized"),this.startRenderLoop()}loadDemo(e){this.state.currentDemo&&this.state.currentDemo.cleanup(this),this.state.currentDemo=e,e.initialize(this),console.log(`[GameScene] Loaded demo: ${e.name}`)}getCurrentDemo(){return this.state.currentDemo}getRenderer(){return this.renderer}getDimensions(){return{width:this.state.width,height:this.state.height}}getCanvas(){return this.canvas}getContext(){return this.ctx}resize(e,t){var r;const i=1.7777777777777777;let n=e,s=t;e/t>i?n=Math.floor(t*i):s=Math.floor(e/i),this.canvas.width=n,this.canvas.height=s,this.state.width=n,this.state.height=s,this.renderer&&this.renderer.resize(n,s),(r=this.state.currentDemo)!=null&&r.resize&&this.state.currentDemo.resize(this,n,s)}startRenderLoop(){const e=async()=>{await this.update(),this.animationId=requestAnimationFrame(e)};this.animationId=requestAnimationFrame(e)}async update(){var t;if(!this.state.isInitialized||!this.renderer)return;(t=this.state.currentDemo)!=null&&t.update&&this.state.currentDemo.update(this);const e=await this.renderer.render();this.ctx.putImageData(e,0,0)}destroy(){var e;this.animationId!==null&&cancelAnimationFrame(this.animationId),this.state.currentDemo&&this.state.currentDemo.cleanup(this),(e=this.renderer)==null||e.destroy(),this.wrapper.remove()}}const ce=1280,de=720;class pe{constructor(e,t,i){a(this,"container");a(this,"overlay",null);a(this,"scaleWrapper",null);a(this,"items",[]);a(this,"gameScene");a(this,"demos");a(this,"onSelect",null);a(this,"resizeHandler",null);this.container=e,this.gameScene=t,this.demos=i}show(e){this.overlay||(this.onSelect=e||null,this.createOverlay())}hide(){this.overlay&&(this.resizeHandler&&(window.removeEventListener("resize",this.resizeHandler),this.resizeHandler=null),this.overlay.remove(),this.overlay=null,this.scaleWrapper=null,this.items=[])}toggle(e){this.overlay?this.hide():this.show(e)}createOverlay(){this.overlay=document.createElement("div"),this.overlay.style.cssText=`
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      overflow: hidden;
    `,this.scaleWrapper=document.createElement("div"),this.scaleWrapper.style.cssText=`
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      transform-origin: center center;
    `,this.overlay.appendChild(this.scaleWrapper),this.updateScale(),this.resizeHandler=()=>this.updateScale(),window.addEventListener("resize",this.resizeHandler);const e=document.createElement("h1");e.textContent="Select Demo",e.style.cssText=`
      color: white;
      font-family: sans-serif;
      margin-bottom: 24px;
    `,this.scaleWrapper.appendChild(e);const t=this.gameScene.getCurrentDemo();for(const n of this.demos){const s=(t==null?void 0:t.name)===n.name,r=this.createButton(n,s);this.scaleWrapper.appendChild(r.element),this.items.push(r)}const i=document.createElement("button");i.textContent="Close (M)",i.style.cssText=`
      margin-top: 24px;
      padding: 8px 16px;
      font-size: 16px;
      background: #666;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    `,i.onclick=()=>this.hide(),this.scaleWrapper.appendChild(i),this.overlay.onclick=n=>{n.target===this.overlay&&this.hide()},this.container.appendChild(this.overlay)}updateScale(){if(!this.scaleWrapper)return;const{width:e,height:t}=this.gameScene.getDimensions(),i=Math.min(e/ce,t/de);this.scaleWrapper.style.transform=`scale(${i})`}createButton(e,t){const i=document.createElement("button");i.style.cssText=`
      width: 400px;
      padding: 16px;
      margin: 8px;
      font-size: 18px;
      background: ${t?"#4a90e2":"#333"};
      color: white;
      border: 2px solid ${t?"#6bb3ff":"#555"};
      border-radius: 8px;
      cursor: pointer;
      text-align: left;
    `;const n=document.createElement("div");if(n.textContent=e.name,n.style.fontWeight="bold",i.appendChild(n),e.description){const s=document.createElement("div");s.textContent=e.description,s.style.cssText="font-size: 14px; color: #ccc; margin-top: 4px;",i.appendChild(s)}return i.onmouseover=()=>{t||(i.style.background="#444")},i.onmouseout=()=>{t||(i.style.background="#333")},i.onclick=()=>{var s;this.gameScene.loadDemo(e),(s=this.onSelect)==null||s.call(this,e),this.hide()},{demo:e,element:i}}}const me=1280;class fe{constructor(){a(this,"name","Empty");a(this,"description","Minimal placeholder demo")}initialize(e){console.log("[EmptyDemo] Initialized"),this.render(e)}resize(e,t,i){this.render(e)}cleanup(e){console.log("[EmptyDemo] Cleaned up")}render(e){const t=e.getContext(),{width:i,height:n}=e.getDimensions(),s=i/me;t.fillStyle="#333",t.fillRect(0,0,i,n),t.fillStyle="#fff",t.font=`${24*s}px sans-serif`,t.textAlign="center",t.fillText("Empty Demo",i/2,n/2-20*s),t.font=`${14*s}px sans-serif`,t.fillText("Press M to open menu",i/2,n/2+20*s)}}const ge=1280;class xe{constructor(){a(this,"name","Interactivity");a(this,"description","Object placement and connection systems");a(this,"objects",[]);a(this,"selectedObject",null);a(this,"baseGridSize",50)}initialize(e){console.log("[InteractivityDemo] Initialized"),this.objects=[{id:"greenSquare",x:5,y:5,width:1,height:1,color:"#22c55e",shape:"square"},{id:"magentaSquare",x:6,y:5,width:1,height:1,color:"#ec4899",shape:"square"},{id:"redCircle",x:7,y:5,width:1,height:1,color:"#ef4444",shape:"circle"},{id:"blueTriangle",x:9,y:5,width:1,height:1,color:"#3b82f6",shape:"triangle"},{id:"yellowRect",x:5,y:8,width:2,height:1,color:"#eab308",shape:"rectangle"},{id:"blackSquare",x:7,y:8,width:2,height:2,color:"#1a1a1a",shape:"square"}];const t=e.getCanvas();t.addEventListener("mousedown",i=>this.onMouseDown(i,e)),t.addEventListener("mousemove",i=>this.onMouseMove(i,e)),t.addEventListener("mouseup",()=>this.onMouseUp(e)),this.render(e)}update(e){this.render(e)}cleanup(e){console.log("[InteractivityDemo] Cleaned up"),this.objects=[],this.selectedObject=null}resize(e,t,i){this.render(e)}getScale(e){const{width:t}=e.getDimensions();return t/ge}getScaledGridSize(e){return this.baseGridSize*this.getScale(e)}onMouseDown(e,t){const i=t.getCanvas(),n=i.getBoundingClientRect(),s=i.width/n.width,r=i.height/n.height,o=(e.clientX-n.left)*s,h=(e.clientY-n.top)*r,u=this.getScaledGridSize(t);for(const c of this.objects){const d=c.x*u,p=c.y*u,m=c.width*u,g=c.height*u;if(o>=d&&o<d+m&&h>=p&&h<p+g){this.selectedObject=c;return}}}onMouseMove(e,t){if(!this.selectedObject)return;const i=t.getCanvas(),n=i.getBoundingClientRect(),s=i.width/n.width,r=i.height/n.height,o=(e.clientX-n.left)*s,h=(e.clientY-n.top)*r,u=this.getScaledGridSize(t);this.selectedObject.x=Math.floor(o/u),this.selectedObject.y=Math.floor(h/u)}onMouseUp(e){this.selectedObject=null}render(e){const t=e.getContext(),{width:i,height:n}=e.getDimensions(),s=this.getScale(e),r=this.getScaledGridSize(e);t.fillStyle="#e5e5e5",t.fillRect(0,0,i,n),t.strokeStyle="#ccc",t.lineWidth=1;for(let c=0;c<=i;c+=r)t.beginPath(),t.moveTo(c,0),t.lineTo(c,n),t.stroke();for(let c=0;c<=n;c+=r)t.beginPath(),t.moveTo(0,c),t.lineTo(i,c),t.stroke();for(const c of this.objects){const d=c.x*r,p=c.y*r,m=c.width*r,g=c.height*r,f=2*s;t.fillStyle=c.color,c.shape==="circle"?(t.beginPath(),t.ellipse(d+m/2,p+g/2,m/2-f,g/2-f,0,0,Math.PI*2),t.fill()):c.shape==="triangle"?(t.beginPath(),t.moveTo(d+m/2,p+f),t.lineTo(d+m-f,p+g-f),t.lineTo(d+f,p+g-f),t.closePath(),t.fill()):t.fillRect(d+f,p+f,m-f*2,g-f*2),c===this.selectedObject&&(t.strokeStyle="#fff",t.lineWidth=3*s,t.strokeRect(d+s,p+s,m-s*2,g-s*2))}const o=300*s,h=30*s,u=14*s;t.fillStyle="rgba(0, 0, 0, 0.7)",t.fillRect(10*s,n-40*s,o,h),t.fillStyle="#fff",t.font=`${u}px sans-serif`,t.textAlign="left",t.fillText("Click and drag objects to move them",20*s,n-20*s)}}function N(l,e,t,i){if(i){const n=t-e,s=4,r=(Math.exp(s*l)-1)/(Math.exp(s)-1);return e+n*r}return e+l*(t-e)}function be(l,e,t,i){if(i){const n=t-e;if(n===0)return 0;const s=(l-e)/n,r=4,o=Math.exp(r)-1;return Math.log(1+s*o)/r}return(l-e)/(t-e)}class ve{constructor(e,t){a(this,"container");a(this,"track");a(this,"handle");a(this,"valueDisplay");a(this,"labelElement",null);a(this,"options");a(this,"value");a(this,"isDragging",!1);if(this.options={min:t.min,max:t.max,value:t.value,logarithmic:t.logarithmic??!1,label:t.label??"",width:t.width??200,onChange:t.onChange??(()=>{})},this.value=this.options.value,this.container=document.createElement("div"),this.container.style.cssText=`
      display: flex;
      flex-direction: column;
      margin: 8px 0;
      user-select: none;
    `,this.options.label){const i=document.createElement("div");i.style.cssText=`
        display: flex;
        justify-content: space-between;
        margin-bottom: 4px;
        font-size: 12px;
        color: #ccc;
      `,this.labelElement=document.createElement("span"),this.labelElement.textContent=this.options.label,this.valueDisplay=document.createElement("span"),this.valueDisplay.textContent=this.formatValue(this.value),i.appendChild(this.labelElement),i.appendChild(this.valueDisplay),this.container.appendChild(i)}else this.valueDisplay=document.createElement("span");this.track=document.createElement("div"),this.track.style.cssText=`
      width: ${this.options.width}px;
      height: 8px;
      background: #444;
      border-radius: 4px;
      position: relative;
      cursor: pointer;
    `,this.handle=document.createElement("div"),this.handle.style.cssText=`
      width: 16px;
      height: 16px;
      background: #4a90e2;
      border-radius: 50%;
      position: absolute;
      top: -4px;
      cursor: grab;
      transform: translateX(-50%);
    `,this.track.appendChild(this.handle),this.container.appendChild(this.track),e.appendChild(this.container),this.updateHandle(),this.setupEvents()}getValue(){return this.value}setValue(e,t=!0){this.value=Math.max(this.options.min,Math.min(this.options.max,e)),this.updateHandle(),t&&this.options.onChange(this.value)}setLabel(e){this.labelElement&&(this.labelElement.textContent=e)}destroy(){this.container.remove()}formatValue(e){return this.options.logarithmic?e<.01?e.toExponential(1):e.toFixed(3):e.toFixed(1)}updateHandle(){const e=be(this.value,this.options.min,this.options.max,this.options.logarithmic);this.handle.style.left=`${e*100}%`,this.valueDisplay.textContent=this.formatValue(this.value)}setupEvents(){const e=i=>{if(!this.isDragging)return;const n=this.track.getBoundingClientRect(),s=Math.max(0,Math.min(1,(i.clientX-n.left)/n.width));this.value=N(s,this.options.min,this.options.max,this.options.logarithmic),this.updateHandle(),this.options.onChange(this.value)},t=()=>{this.isDragging=!1,this.handle.style.cursor="grab",document.removeEventListener("mousemove",e),document.removeEventListener("mouseup",t)};this.handle.addEventListener("mousedown",i=>{i.preventDefault(),this.isDragging=!0,this.handle.style.cursor="grabbing",document.addEventListener("mousemove",e),document.addEventListener("mouseup",t)}),this.track.addEventListener("click",i=>{const n=this.track.getBoundingClientRect(),s=(i.clientX-n.left)/n.width;this.value=N(s,this.options.min,this.options.max,this.options.logarithmic),this.updateHandle(),this.options.onChange(this.value)})}}class L{constructor(e,t){a(this,"button");a(this,"enabled");a(this,"options");this.options={enabled:t.enabled,labelOn:t.labelOn,labelOff:t.labelOff,onToggle:t.onToggle??(()=>{})},this.enabled=this.options.enabled,this.button=document.createElement("button"),this.button.style.cssText=`
      padding: 8px 16px;
      font-size: 14px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      margin: 4px;
      transition: background 0.2s;
    `,this.updateAppearance(),this.button.addEventListener("click",()=>{this.toggle()}),e.appendChild(this.button)}isEnabled(){return this.enabled}setEnabled(e,t=!0){this.enabled=e,this.updateAppearance(),t&&this.options.onToggle(this.enabled)}toggle(){this.setEnabled(!this.enabled)}destroy(){this.button.remove()}updateAppearance(){this.button.textContent=this.enabled?this.options.labelOn:this.options.labelOff,this.button.style.background=this.enabled?"#4a90e2":"#666",this.button.style.color=this.enabled?"#fff":"#ccc"}}class ye{constructor(e,t){a(this,"container");a(this,"track");a(this,"handleMin");a(this,"handleMax");a(this,"rangeBar");a(this,"valueDisplay");a(this,"options");a(this,"valueMin");a(this,"valueMax");a(this,"dragging",null);this.options={min:t.min,max:t.max,valueMin:t.valueMin,valueMax:t.valueMax,minRange:t.minRange??(t.max-t.min)*.05,width:t.width??200,label:t.label??"",formatValue:t.formatValue??(s=>s.toFixed(0)),onChange:t.onChange??(()=>{})},this.valueMin=this.options.valueMin,this.valueMax=this.options.valueMax,this.container=document.createElement("div"),this.container.style.cssText=`
      display: flex;
      flex-direction: column;
      margin: 8px 0;
      user-select: none;
    `;const i=document.createElement("div");i.style.cssText=`
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
      font-size: 12px;
      color: #ccc;
    `;const n=document.createElement("span");n.textContent=this.options.label,this.valueDisplay=document.createElement("span"),this.updateValueDisplay(),i.appendChild(n),i.appendChild(this.valueDisplay),this.container.appendChild(i),this.track=document.createElement("div"),this.track.style.cssText=`
      width: ${this.options.width}px;
      height: 8px;
      background: #333;
      border-radius: 4px;
      position: relative;
      cursor: pointer;
    `,this.rangeBar=document.createElement("div"),this.rangeBar.style.cssText=`
      position: absolute;
      height: 100%;
      background: #4a90e2;
      border-radius: 4px;
      pointer-events: none;
    `,this.track.appendChild(this.rangeBar),this.handleMin=document.createElement("div"),this.handleMin.style.cssText=`
      width: 14px;
      height: 14px;
      background: #fff;
      border: 2px solid #4a90e2;
      border-radius: 50%;
      position: absolute;
      top: -3px;
      cursor: grab;
      transform: translateX(-50%);
      z-index: 2;
    `,this.track.appendChild(this.handleMin),this.handleMax=document.createElement("div"),this.handleMax.style.cssText=`
      width: 14px;
      height: 14px;
      background: #fff;
      border: 2px solid #4a90e2;
      border-radius: 50%;
      position: absolute;
      top: -3px;
      cursor: grab;
      transform: translateX(-50%);
      z-index: 2;
    `,this.track.appendChild(this.handleMax),this.container.appendChild(this.track),e.appendChild(this.container),this.updateHandles(),this.setupEvents()}getRange(){return{min:this.valueMin,max:this.valueMax}}setRange(e,t,i=!0){this.valueMin=Math.max(this.options.min,Math.min(this.options.max-this.options.minRange,e)),this.valueMax=Math.max(this.valueMin+this.options.minRange,Math.min(this.options.max,t)),this.updateHandles(),i&&this.options.onChange(this.valueMin,this.valueMax)}reset(){this.setRange(this.options.min,this.options.max)}destroy(){this.container.remove()}updateValueDisplay(){const e=this.options.formatValue(this.valueMin),t=this.options.formatValue(this.valueMax);this.valueDisplay.textContent=`${e} - ${t}`}updateHandles(){const e=this.options.max-this.options.min,t=(this.valueMin-this.options.min)/e*100,i=(this.valueMax-this.options.min)/e*100;this.handleMin.style.left=`${t}%`,this.handleMax.style.left=`${i}%`,this.rangeBar.style.left=`${t}%`,this.rangeBar.style.width=`${i-t}%`,this.updateValueDisplay()}positionToValue(e){return this.options.min+e*(this.options.max-this.options.min)}setupEvents(){const e=n=>{if(!this.dragging)return;const s=this.track.getBoundingClientRect(),r=Math.max(0,Math.min(1,(n.clientX-s.left)/s.width)),o=this.positionToValue(r);this.dragging==="min"?this.valueMin=Math.max(this.options.min,Math.min(this.valueMax-this.options.minRange,o)):this.valueMax=Math.max(this.valueMin+this.options.minRange,Math.min(this.options.max,o)),this.updateHandles(),this.options.onChange(this.valueMin,this.valueMax)},t=()=>{this.dragging=null,this.handleMin.style.cursor="grab",this.handleMax.style.cursor="grab",document.removeEventListener("mousemove",e),document.removeEventListener("mouseup",t)},i=n=>s=>{s.preventDefault(),this.dragging=n;const r=n==="min"?this.handleMin:this.handleMax;r.style.cursor="grabbing",document.addEventListener("mousemove",e),document.addEventListener("mouseup",t)};this.handleMin.addEventListener("mousedown",i("min")),this.handleMax.addEventListener("mousedown",i("max")),this.track.addEventListener("click",n=>{if(this.dragging)return;const s=this.track.getBoundingClientRect(),r=(n.clientX-s.left)/s.width,o=this.positionToValue(r),h=Math.abs(o-this.valueMin),u=Math.abs(o-this.valueMax);h<u?this.valueMin=Math.max(this.options.min,Math.min(this.valueMax-this.options.minRange,o)):this.valueMax=Math.max(this.valueMin+this.options.minRange,Math.min(this.options.max,o)),this.updateHandles(),this.options.onChange(this.valueMin,this.valueMax)})}}function Se(l){let e=0,t=0,i=0;l>=380&&l<440?(e=-(l-440)/60,t=0,i=1):l>=440&&l<490?(e=0,t=(l-440)/50,i=1):l>=490&&l<510?(e=0,t=1,i=-(l-510)/20):l>=510&&l<580?(e=(l-510)/70,t=1,i=0):l>=580&&l<645?(e=1,t=-(l-645)/65,i=0):l>=645&&l<=700&&(e=1,t=0,i=0);let n=1;return l>=380&&l<420?n=.3+.7*(l-380)/40:l>700&&l<=780?n=.3+.7*(780-l)/80:(l>780||l<380)&&(n=0),[Math.round(e*n*255),Math.round(t*n*255),Math.round(i*n*255)]}class we{constructor(e,t){a(this,"container");a(this,"canvas");a(this,"ctx");a(this,"options");a(this,"rangeSlider",null);a(this,"spectrum",null);a(this,"isLocked",!1);a(this,"lockedX",null);a(this,"lockedY",null);a(this,"viewMin");a(this,"viewMax");a(this,"globalMax",null);this.options={width:t.width,height:t.height,wavelengthMin:t.wavelengthMin,wavelengthMax:t.wavelengthMax,showRainbow:t.showRainbow??!0,title:t.title??"Spectrum",enableZoom:t.enableZoom??!0},this.viewMin=this.options.wavelengthMin,this.viewMax=this.options.wavelengthMax,this.container=document.createElement("div"),this.container.style.cssText=`
      background: rgba(0, 0, 0, 0.8);
      border-radius: 8px;
      padding: 8px;
    `;const i=document.createElement("div");i.textContent=this.options.title,i.style.cssText=`
      color: #fff;
      font-size: 14px;
      font-weight: bold;
      margin-bottom: 4px;
    `,this.container.appendChild(i),this.canvas=document.createElement("canvas"),this.canvas.width=this.options.width,this.canvas.height=this.options.height,this.canvas.style.display="block";const n=this.canvas.getContext("2d");if(!n)throw new Error("Failed to get canvas context");if(this.ctx=n,this.container.appendChild(this.canvas),this.options.enableZoom){const s=document.createElement("div");s.style.cssText="margin-top: 4px;",this.container.appendChild(s),this.rangeSlider=new ye(s,{min:this.options.wavelengthMin,max:this.options.wavelengthMax,valueMin:this.options.wavelengthMin,valueMax:this.options.wavelengthMax,minRange:8,width:this.options.width-16,label:"Wavelength Range (nm)",formatValue:r=>`${Math.round(r)}`,onChange:(r,o)=>{this.viewMin=r,this.viewMax=o,this.render()}})}e.appendChild(this.container),this.render()}setSpectrum(e){this.spectrum=e,this.render()}setRange(e,t){this.options.wavelengthMin=e,this.options.wavelengthMax=t,this.viewMin=e,this.viewMax=t,this.rangeSlider&&this.rangeSlider.setRange(e,t,!1),this.render()}setViewRange(e,t){this.viewMin=Math.max(this.options.wavelengthMin,e),this.viewMax=Math.min(this.options.wavelengthMax,t),this.rangeSlider&&this.rangeSlider.setRange(this.viewMin,this.viewMax,!1),this.render()}resetZoom(){this.viewMin=this.options.wavelengthMin,this.viewMax=this.options.wavelengthMax,this.rangeSlider&&this.rangeSlider.reset(),this.render()}setLockedPosition(e,t){this.lockedX=e,this.lockedY=t,this.isLocked=e!==null&&t!==null,this.render()}setGlobalMax(e){this.globalMax=e,this.render()}destroy(){var e;(e=this.rangeSlider)==null||e.destroy(),this.container.remove()}render(){const{width:e,height:t,wavelengthMin:i,wavelengthMax:n,showRainbow:s}=this.options,r=this.ctx,o=this.viewMin,h=this.viewMax;if(r.fillStyle="#1a1a1a",r.fillRect(0,0,e,t),s){const p=Math.max(380,o),m=Math.min(700,h);for(let g=0;g<e;g++){const f=o+g/e*(h-o);if(f>=p&&f<=m){const[b,S,x]=Se(f);r.fillStyle=`rgb(${b},${S},${x})`,r.fillRect(g,0,1,20)}}}r.strokeStyle="#666",r.lineWidth=1;const u=t-20;r.beginPath(),r.moveTo(30,u),r.lineTo(e-10,u),r.stroke(),r.beginPath(),r.moveTo(30,25),r.lineTo(30,u),r.stroke(),r.fillStyle="#888",r.font="10px sans-serif",r.textAlign="center";const c=5;for(let d=0;d<=c;d++){const p=30+d/c*(e-40),m=o+d/c*(h-o);r.fillText(`${Math.round(m)}`,p,t-5)}if(r.textAlign="right",r.fillText("1.0",25,30),r.fillText("0.5",25,(25+u)/2),r.fillText("0",25,u),this.spectrum&&this.spectrum.length>0){r.strokeStyle="#4a90e2",r.lineWidth=2,r.beginPath();const p=u-25,m=30,g=e-40,b=(n-i)/(this.spectrum.length-1);let S,x;if(this.globalMax!==null&&this.globalMax>0)S=this.globalMax,x=.9;else{let w=0;for(let y=0;y<this.spectrum.length;y++){const v=i+y*b;v>=o&&v<=h&&(w=Math.max(w,this.spectrum[y]))}S=w||1,x=1}let I=!1;for(let w=0;w<this.spectrum.length;w++){const y=i+w*b;if(y>=o&&y<=h){const v=(y-o)/(h-o),C=m+v*g,k=u-this.spectrum[w]/S*p*x;I?r.lineTo(C,k):(r.moveTo(C,k),I=!0)}}r.stroke()}this.isLocked&&(r.fillStyle="rgba(255, 255, 0, 0.3)",r.beginPath(),r.arc(e-20,35,8,0,Math.PI*2),r.fill(),r.fillStyle="#ff0",r.font="10px sans-serif",r.textAlign="center",r.fillText("🔒",e-20,38))}}class Me{constructor(e,t){a(this,"container");a(this,"contentArea");a(this,"sliders",new Map);a(this,"options");this.options={title:t.title,width:t.width??250,background:t.background??"rgba(0, 0, 0, 0.75)"},this.container=document.createElement("div"),this.container.style.cssText=`
      background: ${this.options.background};
      border-radius: 8px;
      padding: 12px;
      width: ${this.options.width}px;
      font-family: sans-serif;
    `;const i=document.createElement("div");i.textContent=this.options.title,i.style.cssText=`
      color: #fff;
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid #444;
    `,this.container.appendChild(i),this.contentArea=document.createElement("div"),this.container.appendChild(this.contentArea),e.appendChild(this.container)}addSlider(e,t){const i=new ve(this.contentArea,{...t,width:this.options.width-24});return this.sliders.set(e,i),i}getSlider(e){return this.sliders.get(e)}setSliderValue(e,t,i=!1){const n=this.sliders.get(e);n&&n.setValue(t,i)}addElement(e){this.contentArea.appendChild(e)}setVisible(e){this.container.style.display=e?"block":"none"}destroy(){for(const e of this.sliders.values())e.destroy();this.sliders.clear(),this.container.remove()}}const Pe=299792458,Te=1380649e-29,Ce=16605390666e-37,ke=Math.log(2);function Be(l,e,t){if(e<=0||t<=0)return 0;const i=l*1e-9,n=t*Ce;return 2*i/Pe*Math.sqrt(2*Te*e*ke/n)*1e9}function Ee(l,e){return l<=0||e<=0?0:e*l}function Ie(l,e,t,i,n){const s=l.naturalWidth,r=Be(l.wavelength,e,t),o=Ee(i,n);return Math.sqrt(s*s+r*r+o*o)}function Ge(l,e,t){if(l<=0||e<=0||t<=0)return 1;const i=l*e*t;return Math.pow(10,-i)}const Re=.5;function ze(l,e,t,i){let n=Re;for(const s of e.peaks){const o=Ie(s,t,e.mass,i,e.pressureBroadening)/2.35482,h=l-s.wavelength;n+=s.extinction*Math.exp(-.5*Math.pow(h/o,2))}return n}function O(l,e,t,i,n){return{id:l,name:e,molecules:t,bandGap:i,uvCutoff:n,generateTransmissionSpectrum(s,r,o,h){const u=new Float32Array(o),c=(r-s)/(o-1);for(let d=0;d<o;d++){const p=s+d*c;let m=1;if(p<n){const g=Math.max(0,(p-100)/(n-100));m*=g*g}for(const g of t){const f=h.concentrations[g.id]||0;if(f>0){const b=ze(p,g,h.temperature,h.pressure);m*=Ge(b,f,h.pathLength)}}u[d]=Math.max(0,Math.min(1,m))}return u}}}function E(l,e=.01,t=1,i=300,n=.001){const s={};for(const r of l.molecules)s[r.id]=e;return{concentrations:s,pathLength:t,temperature:i,pressure:n}}const De={id:"copper-sulfate",name:"Copper Sulfate",mass:159.6,pressureBroadening:0,peaks:[{wavelength:800,extinction:8,naturalWidth:100}]},Ue={id:"methylene-blue",name:"Methylene Blue",mass:319.9,pressureBroadening:0,peaks:[{wavelength:665,extinction:50,naturalWidth:50},{wavelength:605,extinction:20,naturalWidth:40}]};function Le(){return O("water","Water",[De,Ue],7.5,200)}const Fe={id:"chromium-ion",name:"Chromium Ion (Cr³⁺)",mass:52,pressureBroadening:0,peaks:[{wavelength:550,extinction:25,naturalWidth:80},{wavelength:400,extinction:18,naturalWidth:60}]},Oe={id:"potassium-permanganate",name:"Potassium Permanganate",mass:158,pressureBroadening:0,peaks:[{wavelength:525,extinction:30,naturalWidth:40},{wavelength:545,extinction:30,naturalWidth:40}]};function $e(){return O("crystal","Crystal",[Fe,Oe],9,150)}const Ae={id:"sodium",name:"Sodium (Na)",mass:22.99,pressureBroadening:.02,peaks:[{wavelength:589,extinction:40,naturalWidth:.1},{wavelength:589.6,extinction:40,naturalWidth:.1}]},We={id:"neon",name:"Neon (Ne)",mass:20.18,pressureBroadening:.015,peaks:[{wavelength:585.2,extinction:15,naturalWidth:.1},{wavelength:640.2,extinction:25,naturalWidth:.1},{wavelength:703.2,extinction:10,naturalWidth:.1}]},Ne={id:"mercury",name:"Mercury (Hg)",mass:200.59,pressureBroadening:.025,peaks:[{wavelength:253.7,extinction:60,naturalWidth:.1},{wavelength:365,extinction:35,naturalWidth:.1},{wavelength:435.8,extinction:25,naturalWidth:.1},{wavelength:546.1,extinction:45,naturalWidth:.1},{wavelength:579,extinction:35,naturalWidth:.1}]};function _e(){return O("gas","Gas",[Ae,We,Ne],10,100)}const D=1280,G=720;class _{constructor(){a(this,"name","Spectral Coloring");a(this,"description","Physics-based spectral absorption and transmission");a(this,"enableEmission",!1);a(this,"enableDarkMode",!1);a(this,"shapes",[]);a(this,"backgroundMode","normal");a(this,"uvMode",!1);a(this,"controlPanels",[]);a(this,"spectralGraph",null);a(this,"uvButton",null);a(this,"darkButton",null);a(this,"uiContainer",null);a(this,"uiScaleWrapper",null);a(this,"measurementIndicator",null);a(this,"profilingOverlay",null);a(this,"profilingVisible",!1);a(this,"masksLoaded",!1);a(this,"renderInProgress",!1);a(this,"needsRender",!0);a(this,"mouseX",-1);a(this,"mouseY",-1);a(this,"lockedX",-1);a(this,"lockedY",-1);a(this,"isSpectrumLocked",!1);a(this,"mouseMoveHandler",null);a(this,"keyHandler",null)}initialize(e){console.log(`[${this.name}] Initialized`);const t=Le(),i=$e(),n=_e(),s={id:"tint",name:"Background Tint",molecules:[],bandGap:0,uvCutoff:0,generateTransmissionSpectrum:(o,h,u)=>new Float32Array(u).fill(.66)};this.shapes=[{id:"bg-grid",name:"Background Grid",maskName:"circle-grid",x:0,y:0,width:1280,height:720,layer:0,material:s,properties:E(s)},{id:"square",name:"Square (Water)",maskName:"rectangle",x:20,y:80,width:200,height:200,layer:1,material:t,properties:E(t)},{id:"circle",name:"Circle (Crystal)",maskName:"circle",x:150,y:80,width:200,height:200,layer:1,material:i,properties:E(i)},{id:"triangle",name:"Triangle (Gas)",maskName:"triangle",x:280,y:80,width:200,height:200,layer:1,material:n,properties:E(n)}],this.createUI(e);const r=e.getCanvas();this.mouseMoveHandler=o=>{const h=r.getBoundingClientRect(),u=r.width/h.width,c=r.height/h.height;this.mouseX=Math.floor((o.clientX-h.left)*u),this.mouseY=Math.floor((o.clientY-h.top)*c)},r.addEventListener("mousemove",this.mouseMoveHandler),this.keyHandler=o=>{var h,u,c;o.key==="r"||o.key==="R"?(h=this.reset)==null||h.call(this,e):o.key==="l"||o.key==="L"?this.isSpectrumLocked?(this.isSpectrumLocked=!1,this.lockedX=-1,this.lockedY=-1,(u=this.spectralGraph)==null||u.setLockedPosition(null,null)):this.mouseX>=0&&this.mouseY>=0&&(this.isSpectrumLocked=!0,this.lockedX=this.mouseX,this.lockedY=this.mouseY,(c=this.spectralGraph)==null||c.setLockedPosition(this.lockedX,this.lockedY)):o.key==="p"||o.key==="P"?(this.profilingVisible=!this.profilingVisible,this.profilingOverlay&&(this.profilingOverlay.style.display=this.profilingVisible?"block":"none"),M.setLoggingMode(this.profilingVisible?"summary":"silent")):(o.key==="d"||o.key==="D")&&this.profilingVisible&&M.downloadReport()},document.addEventListener("keydown",this.keyHandler),this.updateRenderer(e)}update(e){this.needsRender&&!this.renderInProgress&&(this.renderInProgress=!0,this.updateRenderer(e).finally(()=>{this.renderInProgress=!1}),this.needsRender=!1),this.updateSpectrumGraph(e),this.profilingVisible&&this.profilingOverlay&&this.updateProfilingOverlay()}reset(e){var i,n,s,r;for(const o of this.shapes){const h=E(o.material);o.properties=h}let t=0;for(const o of this.shapes){if(o.layer===0)continue;const h=this.controlPanels[t];if(h){for(const u of o.material.molecules)h.setSliderValue(u.id,o.properties.concentrations[u.id]||.01);h.setSliderValue("depth",o.properties.pathLength),this.enableEmission&&h.setSliderValue("temperature",o.properties.temperature),o.material.id==="gas"&&h.setSliderValue("pressure",o.properties.pressure),t++}}this.backgroundMode="normal",this.uvMode=!1,(i=this.uvButton)==null||i.setEnabled(!1,!1),(n=this.darkButton)==null||n.setEnabled(!1,!1),this.isSpectrumLocked=!1,this.lockedX=-1,this.lockedY=-1,(s=this.spectralGraph)==null||s.setLockedPosition(null,null),(r=this.spectralGraph)==null||r.resetZoom(),this.needsRender=!0,console.log(`[${this.name}] Reset to initial state`)}async updateSpectrumGraph(e){if(!this.spectralGraph)return;const t=e.getRenderer();if(!t)return;this.spectralGraph.setGlobalMax(1);const i=this.isSpectrumLocked?this.lockedX:this.mouseX,n=this.isSpectrumLocked?this.lockedY:this.mouseY;if(this.updateMeasurementIndicator(e,i,n),i>=0&&n>=0){const{width:s,height:r}=e.getDimensions();if(i<s&&n<r){const o=await t.sampleSpectrum(i,n);o.length>0&&this.spectralGraph.setSpectrum(o)}}}updateMeasurementIndicator(e,t,i){if(!this.measurementIndicator)return;const{width:n,height:s}=e.getDimensions();if(t<0||i<0||t>=n||i>=s){this.measurementIndicator.style.display="none";return}this.measurementIndicator.style.display="block";const r=D/n,o=G/s,h=t*r,u=i*o;this.measurementIndicator.style.left=`${h}px`,this.measurementIndicator.style.top=`${u}px`,this.isSpectrumLocked?(this.measurementIndicator.style.borderColor="rgba(100, 200, 255, 0.9)",this.measurementIndicator.style.background="rgba(100, 200, 255, 0.3)",this.measurementIndicator.style.borderWidth="2px",this.measurementIndicator.style.boxShadow="0 0 8px rgba(100, 200, 255, 0.5)"):(this.measurementIndicator.style.borderColor="rgba(255, 255, 255, 0.8)",this.measurementIndicator.style.background="rgba(255, 255, 255, 0.2)",this.measurementIndicator.style.borderWidth="2px",this.measurementIndicator.style.boxShadow="0 0 4px rgba(0, 0, 0, 0.5)")}updateProfilingOverlay(){if(!this.profilingOverlay)return;const e=M.getDisplayText();let t="";for(const i of e){const n=i.match(/^(.+) \[(green|yellow|red)\]$/);n?t+=`<div style="color: ${{green:"#4f4",yellow:"#ff4",red:"#f44"}[n[2]]||"#fff"}">${n[1]}</div>`:i==="---"?t+='<hr style="border: none; border-top: 1px solid rgba(255,255,255,0.2); margin: 4px 0;">':t+=`<div>${i}</div>`}this.profilingOverlay.innerHTML=t}cleanup(e){var i,n,s,r,o,h,u;console.log(`[${this.name}] Cleaned up`);const t=e.getCanvas();this.mouseMoveHandler&&(t.removeEventListener("mousemove",this.mouseMoveHandler),this.mouseMoveHandler=null),this.keyHandler&&(document.removeEventListener("keydown",this.keyHandler),this.keyHandler=null);for(const c of this.controlPanels)c.destroy();this.controlPanels=[],(i=this.spectralGraph)==null||i.destroy(),this.spectralGraph=null,(n=this.uvButton)==null||n.destroy(),(s=this.darkButton)==null||s.destroy(),this.uvButton=null,this.darkButton=null,(r=this.measurementIndicator)==null||r.remove(),this.measurementIndicator=null,(o=this.profilingOverlay)==null||o.remove(),this.profilingOverlay=null,(h=this.uiScaleWrapper)==null||h.remove(),this.uiScaleWrapper=null,(u=this.uiContainer)==null||u.remove(),this.uiContainer=null,this.shapes=[]}createUI(e){const t=e.getCanvas(),i=t.parentElement;this.uiContainer=document.createElement("div"),this.uiContainer.style.cssText=`
      position: absolute;
      top: 0;
      left: 0;
      width: ${t.width}px;
      height: ${t.height}px;
      pointer-events: none;
      overflow: hidden;
    `,i.style.position="relative",i.appendChild(this.uiContainer),this.uiScaleWrapper=document.createElement("div"),this.uiScaleWrapper.style.cssText=`
      position: absolute;
      top: 0;
      left: 0;
      width: ${D}px;
      height: ${G}px;
      transform-origin: top left;
      pointer-events: none;
    `,this.uiContainer.appendChild(this.uiScaleWrapper),this.updateUIScale(e);const n=G-250;let s=0;for(let h=0;h<this.shapes.length;h++){const u=this.shapes[h];if(u.layer>0){const c=this.createControlPanel(e,u,10+s*270,n);this.controlPanels.push(c),s++}}const r=document.createElement("div");r.style.cssText=`
      position: absolute;
      top: 10px;
      right: 10px;
      pointer-events: auto;
    `,this.uiScaleWrapper.appendChild(r),this.uvButton=new L(r,{enabled:!1,labelOn:"UV Mode: ON",labelOff:"UV Mode: OFF",onToggle:h=>{this.uvMode=h,this.backgroundMode=h?"uv":"normal",this.needsRender=!0}}),this.enableDarkMode&&(this.darkButton=new L(r,{enabled:!1,labelOn:"Dark Mode: ON",labelOff:"Dark Mode: OFF",onToggle:h=>{this.backgroundMode=h?"dark":this.uvMode?"uv":"normal",this.needsRender=!0}}));const o=document.createElement("div");o.style.cssText=`
      position: absolute;
      top: 60px;
      right: 10px;
      pointer-events: auto;
    `,this.uiScaleWrapper.appendChild(o),this.spectralGraph=new we(o,{width:400,height:200,wavelengthMin:200,wavelengthMax:1e3,title:"Spectral Distribution (hover over canvas)"}),this.measurementIndicator=document.createElement("div"),this.measurementIndicator.style.cssText=`
      position: absolute;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      border: 2px solid rgba(255, 255, 255, 0.8);
      background: rgba(255, 255, 255, 0.2);
      transform: translate(-50%, -50%);
      pointer-events: none;
      display: none;
      box-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
      transition: border-color 0.2s, background 0.2s;
    `,this.uiScaleWrapper.appendChild(this.measurementIndicator),this.profilingOverlay=document.createElement("div"),this.profilingOverlay.style.cssText=`
      position: absolute;
      bottom: 10px;
      left: 10px;
      background: rgba(0, 0, 0, 0.85);
      color: #fff;
      font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
      font-size: 11px;
      padding: 10px;
      border-radius: 4px;
      pointer-events: none;
      display: none;
      line-height: 1.4;
      min-width: 200px;
      border: 1px solid rgba(255, 255, 255, 0.2);
    `,this.uiScaleWrapper.appendChild(this.profilingOverlay)}updateUIScale(e){if(!this.uiContainer||!this.uiScaleWrapper)return;const{width:t,height:i}=e.getDimensions(),n=Math.min(t/D,i/G);this.uiContainer.style.width=`${t}px`,this.uiContainer.style.height=`${i}px`,this.uiScaleWrapper.style.transform=`scale(${n})`}resize(e,t,i){this.updateUIScale(e),this.needsRender=!0}createControlPanel(e,t,i,n){const s=document.createElement("div");s.style.cssText=`
      position: absolute;
      left: ${i}px;
      top: ${n}px;
      pointer-events: auto;
    `,this.uiScaleWrapper.appendChild(s);const r=new Me(s,{title:t.name,width:250});r.addSlider("depth",{min:0,max:1e3,value:t.properties.pathLength,logarithmic:!0,label:"Depth (cm)",onChange:o=>{t.properties.pathLength=o,this.needsRender=!0}});for(const o of t.material.molecules)r.addSlider(o.id,{min:0,max:1,value:t.properties.concentrations[o.id]||.01,logarithmic:!0,label:o.name,onChange:h=>{t.properties.concentrations[o.id]=h,this.needsRender=!0}});return this.enableEmission&&r.addSlider("temperature",{min:0,max:13e3,value:t.properties.temperature,logarithmic:!0,label:"Temperature (K)",onChange:o=>{t.properties.temperature=o,this.needsRender=!0}}),t.material.id==="gas"&&r.addSlider("pressure",{min:0,max:50,value:t.properties.pressure,logarithmic:!0,label:"Pressure (atm)",onChange:o=>{t.properties.pressure=o,this.needsRender=!0}}),r}async updateRenderer(e){const t=e.getRenderer();if(!t)return;if(!this.masksLoaded){const s=[...new Set(this.shapes.map(r=>r.maskName))];await t.loadMasks(s),this.masksLoaded=!0}const i=[];for(const s of this.shapes){const r=s.material.generateTransmissionSpectrum(200,1e3,5e3,s.properties);i.push(r)}t.setMaterials(i);const n=this.shapes.map((s,r)=>{const o=t.getMaskIndex(s.maskName),h=t.getMaskDimensions(s.maskName);return console.log(`[SpectralDemo] Shape ${s.id}: maskName=${s.maskName} -> maskIndex=${o}, texSize=${h.width}x${h.height}`),{x:s.x,y:s.y,width:s.width,height:s.height,temperature:this.enableEmission?s.properties.temperature:300,layer:s.layer,materialIndex:r,maskIndex:o,texWidth:h.width,texHeight:h.height}});t.setShapes(n),t.setBackgroundMode(this.backgroundMode),t.setEmissionEnabled(this.enableEmission)}}class X extends _{constructor(){super(...arguments);a(this,"name","Advanced Spectral Coloring");a(this,"description","Physics-based spectral absorption, emission, and scattering");a(this,"enableEmission",!0);a(this,"enableDarkMode",!0)}}const Xe=1280,Ye=720;class He{constructor(){a(this,"name","GPU Demo");a(this,"description","GPU rendering pipeline diagnostics");a(this,"mode","pattern");a(this,"uiContainer",null);a(this,"uiScaleWrapper",null);a(this,"modeButtons",[])}initialize(e){console.log("[GPUDemo] Initialized"),this.createUI(e),this.render(e)}update(e){this.render(e)}cleanup(e){var t,i;console.log("[GPUDemo] Cleaned up");for(const n of this.modeButtons)n.destroy();this.modeButtons=[],(t=this.uiScaleWrapper)==null||t.remove(),this.uiScaleWrapper=null,(i=this.uiContainer)==null||i.remove(),this.uiContainer=null}resize(e,t,i){this.updateUIScale(e)}updateUIScale(e){if(!this.uiContainer||!this.uiScaleWrapper)return;const{width:t,height:i}=e.getDimensions(),n=Math.min(t/Xe,i/Ye);this.uiContainer.style.width=`${t}px`,this.uiContainer.style.height=`${i}px`,this.uiScaleWrapper.style.transform=`scale(${n})`}createUI(e){const t=e.getCanvas(),i=t.parentElement;this.uiContainer=document.createElement("div"),this.uiContainer.style.cssText=`
      position: absolute;
      top: 0;
      left: 0;
      width: ${t.width}px;
      height: ${t.height}px;
      pointer-events: none;
      overflow: hidden;
    `,i.style.position="relative",i.appendChild(this.uiContainer),this.uiScaleWrapper=document.createElement("div"),this.uiScaleWrapper.style.cssText=`
      position: absolute;
      top: 10px;
      left: 10px;
      display: flex;
      gap: 8px;
      transform-origin: top left;
      pointer-events: auto;
    `,this.uiContainer.appendChild(this.uiScaleWrapper),this.updateUIScale(e);const n=["pattern","gradient","spectrum","shapes"];for(const s of n){const r=new L(this.uiScaleWrapper,{enabled:s===this.mode,labelOn:s.charAt(0).toUpperCase()+s.slice(1),labelOff:s.charAt(0).toUpperCase()+s.slice(1),onToggle:()=>{this.mode=s;for(const o of this.modeButtons)o.setEnabled(o===r,!1)}});this.modeButtons.push(r)}}render(e){const t=e.getContext(),{width:i,height:n}=e.getDimensions();switch(this.mode){case"pattern":this.renderPattern(t,i,n);break;case"gradient":this.renderGradient(t,i,n);break;case"spectrum":this.renderSpectrum(t,i,n);break;case"shapes":this.renderShapes(t,i,n);break}t.fillStyle="rgba(0, 0, 0, 0.7)",t.fillRect(10,n-40,200,30),t.fillStyle="#fff",t.font="14px sans-serif",t.textAlign="left",t.fillText(`Mode: ${this.mode}`,20,n-20)}renderPattern(e,t,i){for(let s=0;s<t;s+=50)for(let r=0;r<i;r+=50){const o=(s/50+r/50)%2===0;e.fillStyle=o?"#fff":"#000",e.fillRect(s,r,50,50)}}renderGradient(e,t,i){for(let n=0;n<t;n++){const s=n/t*360;e.fillStyle=`hsl(${s}, 100%, 50%)`,e.fillRect(n,0,1,i)}}renderSpectrum(e,t,i){for(let n=0;n<t;n++){const s=380+n/t*320,[r,o,h]=this.wavelengthToRGB(s);e.fillStyle=`rgb(${r},${o},${h})`,e.fillRect(n,0,1,i)}}renderShapes(e,t,i){e.fillStyle="#e5e5e5",e.fillRect(0,0,t,i),e.fillStyle="rgba(0, 100, 200, 0.7)",e.fillRect(100,200,200,200),e.fillStyle="rgba(200, 0, 100, 0.7)",e.beginPath(),e.arc(500,300,100,0,Math.PI*2),e.fill(),e.fillStyle="rgba(200, 200, 0, 0.7)",e.beginPath(),e.moveTo(800,200),e.lineTo(900,400),e.lineTo(700,400),e.closePath(),e.fill()}wavelengthToRGB(e){let t=0,i=0,n=0;return e>=380&&e<440?(t=-(e-440)/60,i=0,n=1):e>=440&&e<490?(t=0,i=(e-440)/50,n=1):e>=490&&e<510?(t=0,i=1,n=-(e-510)/20):e>=510&&e<580?(t=(e-510)/70,i=1,n=0):e>=580&&e<645?(t=1,i=-(e-645)/65,n=0):e>=645&&e<=700&&(t=1,i=0,n=0),[Math.round(t*255),Math.round(i*255),Math.round(n*255)]}}function Ve(){return[new fe,new xe,new _,new X,new He]}function qe(){return new X}async function je(){console.log("[P4] Initializing...");const l=document.getElementById("game-container");if(!l){console.error("[P4] Game container not found");return}const e=new ue(l);await e.initialize();const t=()=>{const r=l.clientWidth,o=l.clientHeight;e.resize(r,o)};t(),window.addEventListener("resize",t);const i=Ve(),n=new pe(l,e,i),s=qe();e.loadDemo(s),document.addEventListener("keydown",r=>{(r.key==="m"||r.key==="M")&&n.toggle()}),console.log("[P4] Ready - Press M to open menu")}je().catch(console.error);
//# sourceMappingURL=index-BpFnik2L.js.map
