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
  globalMaxScatterSigma: f32, // Global sigma for unified aura blur (scatter + emission)
  emissionSpreadFactor: f32,  // Fraction of emission that spreads sideways (0-1)
  currentLayer: u32,          // Current layer being processed (for per-layer ambient)
  
  // Unified pipeline mode parameters
  // These allow a single code path for both rendering (16 samples) and spectrum (5000 samples)
  bufferWidth: u32,          // width for rendering, boxSize for high-res
  bufferHeight: u32,         // height for rendering, boxSize for high-res
  sampleCount: u32,          // 16 for rendering, plotResolution for high-res
  coordOffsetX: i32,         // 0 for rendering, sampleX - boxSize/2 for high-res
  coordOffsetY: i32,         // 0 for rendering, sampleY - boxSize/2 for high-res
}

// Shape definition (64 bytes, 16-byte aligned)
struct Shape {
  x: f32,             // Position X (offset 0)
  y: f32,             // Position Y (offset 4)
  width: f32,         // Bounding box width (offset 8)
  height: f32,        // Bounding box height (offset 12)
  temperature: f32,   // For emission calculations (offset 16)
  layer: u32,         // Render order (0 = background, higher = foreground) (offset 20)
  materialIndex: u32, // Index into material textures (offset 24)
  maskArrayIndex: u32,  // Which MSDF array (0 = small/256x256, 1 = large/1280x720) (offset 28)
  maskLayerIndex: u32,  // Layer index within the MSDF array (offset 32)
  texWidth: f32,      // MSDF texture width (for screenPxRange calculation) (offset 36)
  texHeight: f32,     // MSDF texture height (offset 40)
  smallParticleDensity: f32,  // Rayleigh scattering particle density (particles/cm³) (offset 44)
  largeParticleDensity: f32,  // Mie scattering particle density (particles/cm³) (offset 48)
  fluorescenceQuantumYield: f32, // Total quantum yield for fluorescence (0-1) (offset 52)
  _padding1: f32,     // Padding to 64 bytes for 16-byte alignment (offset 56)
  _padding2: f32,     // Padding to 64 bytes for 16-byte alignment (offset 60)
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> shapes: array<Shape>;
@group(0) @binding(2) var<storage, read_write> rgbOutput: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> spectrumOutput: array<f32>;
@group(0) @binding(4) var<storage, read_write> maxPerPixel: array<f32>;

// Spectrum box buffer (boxSize² × plotResolution values, using f16 for memory bandwidth)
@group(0) @binding(5) var<storage, read_write> spectrumBox: array<f16>;

// Material palette texture (2D atlas: X=wavelength, Y=material index)
// High-resolution textures (4500 samples, 0.2nm bins) - for spectral plot
@group(1) @binding(0) var materialPalette: texture_2d<f32>;
@group(1) @binding(1) var materialSampler: sampler;

// Fluorescence textures (2D atlas: X=wavelength, Y=material index)
// Excitation: efficiency of UV absorption leading to fluorescence
// Emission: spectral distribution of fluorescence emission
@group(1) @binding(2) var fluorExcitationPalette: texture_2d<f32>;
@group(1) @binding(3) var fluorEmissionPalette: texture_2d<f32>;

// Low-resolution textures (32 samples, 29nm bins) - for rendering
// These are bin-integrated to capture narrow spectral peaks
@group(1) @binding(4) var renderMaterialPalette: texture_2d<f32>;
@group(1) @binding(5) var renderExcitationPalette: texture_2d<f32>;
@group(1) @binding(6) var renderEmissionPalette: texture_2d<f32>;

// Reflection textures for ambient light simulation (2D atlas: X=wavelength, Y=material index)
// Reflection is NOT depth-dependent - it's a surface property for ambient light scattering
@group(1) @binding(7) var reflectionPalette: texture_2d<f32>;      // High-res (4500 samples)
@group(1) @binding(8) var renderReflectionPalette: texture_2d<f32>; // Low-res (32 samples)

// CIE color matching function textures (2D with height=1)
@group(2) @binding(0) var cieXTexture: texture_2d<f32>;
@group(2) @binding(1) var cieYTexture: texture_2d<f32>;
@group(2) @binding(2) var cieZTexture: texture_2d<f32>;
@group(2) @binding(3) var cieSampler: sampler;

// CIE scale factors
@group(2) @binding(4) var<uniform> cieScales: vec4<f32>; // x, y, z, unused

// MSDF texture arrays (rgba8unorm, RGB channels encode signed distances)
// Two arrays for different resolutions to support hundreds of masks efficiently:
// - msdfArraySmall: 256x256 textures (circle, rectangle, triangle, etc.)
// - msdfArrayLarge: 1280x720 textures (circle-grid, diagonal-circle-grid, fullscreen, etc.)
@group(3) @binding(0) var msdfArraySmall: texture_2d_array<f32>;  // 256x256 masks
@group(3) @binding(1) var msdfArrayLarge: texture_2d_array<f32>;  // 1280x720 masks
@group(3) @binding(2) var msdfSampler: sampler;

// Spectral buffers for per-layer scattering blur (ping-pong)
// Each stores 16 wavelength intensities per pixel using f16
// NOTE: Using group(0) bindings 6-9 to stay within WebGPU's 4 bind group limit
@group(0) @binding(6) var<storage, read_write> spectralInput: array<f16>;    // Input spectral buffer
@group(0) @binding(7) var<storage, read_write> spectralOutput: array<f16>;   // Output spectral buffer (transmitted + direct emission)
@group(0) @binding(8) var<storage, read_write> scatterSource: array<f16>;    // Unified aura (scatter + emission)
// Note: emissionAura (was binding 9) removed - now unified with scatterSource
@group(0) @binding(9) var<storage, read_write> blurredTransmitted: array<f16>; // Blurred transmitted for in-shape scatter

// NOTE: High-res spectrum uses the SAME buffer bindings (6-10) but with different
// buffer references. The TypeScript swaps the actual GPUBuffer objects to point
// to the high-res buffers when computing the spectrum plot.

// Number of spectral samples (must match TypeScript)
// 16 samples across 100-1000nm for efficient rendering
const SPECTRAL_SAMPLES: u32 = 16u;

// Blur constants
const MAX_BLUR_RADIUS: i32 = 16;           // Maximum blur radius in pixels (optimized for performance)
const RAYLEIGH_BLUR_SCALE: f32 = 1e-10;    // Scale factor for Rayleigh blur (increased for visibility)
const MIE_BLUR_SCALE: f32 = 1e-6;          // Scale factor for Mie blur (increased for visibility)

// Shared memory blur constants
const BLUR_TILE_WIDTH: u32 = 64u;          // Pixels processed per workgroup (horizontal)
const BLUR_TILE_HEIGHT: u32 = 64u;         // Pixels processed per workgroup (vertical)
const BLUR_HALO: u32 = 16u;                // Blur radius as u32
const BLUR_SHARED_WIDTH: u32 = 96u;        // BLUR_TILE_WIDTH + 2*BLUR_HALO for horizontal
const BLUR_SHARED_HEIGHT: u32 = 96u;       // BLUR_TILE_HEIGHT + 2*BLUR_HALO for vertical

// Precomputed Gaussian weights for sigma=5.0 (33 weights, centered at index 16)
// Using normalized Gaussian: exp(-x^2 / (2*sigma^2)) / sqrt(2*pi*sigma^2)
// Weights are symmetric around center
const BLUR_WEIGHTS: array<f32, 17> = array<f32, 17>(
  0.0798,  // dx=0 (center)
  0.0782, 0.0736, 0.0666, 0.0580, 0.0484, 0.0389, 0.0300, 0.0222,  // dx=1..8
  0.0158, 0.0108, 0.0071, 0.0044, 0.0027, 0.0015, 0.0008, 0.0004   // dx=9..16
);

// Workgroup shared memory for tiled blur (reused across blur passes)
// Size: 96 * 16 wavelengths = 1536 f16 values per tile row
var<workgroup> blurTile: array<f16, 1536u>; // BLUR_SHARED_WIDTH * SPECTRAL_SAMPLES

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
 * Sample MSDF texture from the appropriate array
 * @param arrayIndex - 0 for small (256x256), 1 for large (1280x720)
 * @param layerIndex - Layer within the texture array
 * @param uv - Texture coordinates
 */
fn sampleMSDFTexture(arrayIndex: u32, layerIndex: u32, uv: vec2<f32>) -> vec3<f32> {
  if (arrayIndex == 0u) {
    return textureSampleLevel(msdfArraySmall, msdfSampler, uv, i32(layerIndex), 0.0).rgb;
  } else {
    return textureSampleLevel(msdfArrayLarge, msdfSampler, uv, i32(layerIndex), 0.0).rgb;
  }
}

/**
 * Sample MSDF and return shape coverage (0.0 = outside, 1.0 = inside)
 * 
 * In compute shaders we can't use fwidth(), so we calculate the screen-space
 * pixel range based on the known relationship between shape size and texture size.
 * 
 * @param arrayIndex - Which MSDF array (0 = small, 1 = large)
 * @param layerIndex - Layer within the array
 * @param shapeScreenSize - The shape's size in screen pixels (width or height)
 */
fn sampleMSDF(arrayIndex: u32, layerIndex: u32, uv: vec2<f32>, pxRange: f32, texSize: vec2<f32>, shapeScreenSize: vec2<f32>) -> f32 {
  let msd = sampleMSDFTexture(arrayIndex, layerIndex, uv);
  
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
  return sampleMSDF(shape.maskArrayIndex, shape.maskLayerIndex, uv, params.msdfPxRange, texSize, shapeScreenSize);
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
  
  // UV mode: Pure UV illumination (invisible to eye, but excites fluorescent molecules)
  // Emits only in UV range (100-380nm), zero in visible range
  // Background appears BLACK but is actually emitting UV light
  // Extended to 100nm to trigger band gap absorption in materials
  if (params.backgroundMode == 1u) {
    // No emission below 100nm (extreme vacuum UV)
    if (wavelengthNm < 100.0) { return 0.0; }
    // Ramp up from 100-150nm (reverse quadratic - fast start, slow finish)
    if (wavelengthNm < 150.0) {
      let t = (wavelengthNm - 100.0) / 50.0;
      return 1.0 - (1.0 - t) * (1.0 - t);  // Matches normal mode fade-in
    }
    // Full intensity deep UV to UV-A range (150-350nm)
    if (wavelengthNm <= 350.0) { return 1.0; }
    // Sharp cutoff before visible range (350-380nm)
    if (wavelengthNm < VISIBLE_MIN) {
      let t = (wavelengthNm - 350.0) / (VISIBLE_MIN - 350.0);
      return 1.0 - t * t;  // Fade to zero at 380nm
    }
    // ZERO visible light - background appears black
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
  
  // Use high-res texture for spectrum mode (sampleCount > 32), low-res for rendering
  if (params.sampleCount > 32u) {
    return textureSampleLevel(materialPalette, materialSampler, vec2<f32>(u, v), 0.0).r;
  } else {
    return textureSampleLevel(renderMaterialPalette, materialSampler, vec2<f32>(u, v), 0.0).r;
  }
}

/**
 * Sample fluorescence excitation efficiency at wavelength from palette
 * Returns how efficiently light at this wavelength excites fluorescence (0-1)
 */
fn getFluorescenceExcitation(materialIndex: u32, wavelengthNm: f32) -> f32 {
  // Handle case when no materials are loaded
  if (params.numMaterials == 0u) {
    return 0.0;
  }
  
  // U coordinate: wavelength position
  let u = (wavelengthNm - params.wavelengthMin) / (params.wavelengthMax - params.wavelengthMin);
  
  // V coordinate: center of the row for this material
  let v = (f32(materialIndex) + 0.5) / f32(params.numMaterials);
  
  // Use high-res texture for spectrum mode (sampleCount > 32), low-res for rendering
  if (params.sampleCount > 32u) {
    return textureSampleLevel(fluorExcitationPalette, materialSampler, vec2<f32>(u, v), 0.0).r;
  } else {
    return textureSampleLevel(renderExcitationPalette, materialSampler, vec2<f32>(u, v), 0.0).r;
  }
}

/**
 * Sample fluorescence emission spectrum at wavelength from palette
 * Returns the emission line shape (normalized so peak = 1)
 */
fn getFluorescenceEmission(materialIndex: u32, wavelengthNm: f32) -> f32 {
  // Handle case when no materials are loaded
  if (params.numMaterials == 0u) {
    return 0.0;
  }
  
  // U coordinate: wavelength position
  let u = (wavelengthNm - params.wavelengthMin) / (params.wavelengthMax - params.wavelengthMin);
  
  // V coordinate: center of the row for this material
  let v = (f32(materialIndex) + 0.5) / f32(params.numMaterials);
  
  // Use high-res texture for spectrum mode (sampleCount > 32), low-res for rendering
  if (params.sampleCount > 32u) {
    return textureSampleLevel(fluorEmissionPalette, materialSampler, vec2<f32>(u, v), 0.0).r;
  } else {
    return textureSampleLevel(renderEmissionPalette, materialSampler, vec2<f32>(u, v), 0.0).r;
  }
}

/**
 * Sample material reflection at wavelength from palette
 * Returns f16 for memory efficiency in ambient light calculations.
 * Reflection is NOT depth-dependent - it's a surface property.
 */
fn getMaterialReflection(materialIndex: u32, wavelengthNm: f32) -> f16 {
  // Handle case when no materials are loaded
  if (params.numMaterials == 0u) {
    return f16(0.02);  // Default 2% reflectance for dielectrics
  }
  
  // U coordinate: wavelength position
  let u = (wavelengthNm - params.wavelengthMin) / (params.wavelengthMax - params.wavelengthMin);
  
  // V coordinate: center of the row for this material
  let v = (f32(materialIndex) + 0.5) / f32(params.numMaterials);
  
  // Use high-res texture for spectrum mode (sampleCount > 32), low-res for rendering
  if (params.sampleCount > 32u) {
    return f16(textureSampleLevel(reflectionPalette, materialSampler, vec2<f32>(u, v), 0.0).r);
  } else {
    return f16(textureSampleLevel(renderReflectionPalette, materialSampler, vec2<f32>(u, v), 0.0).r);
  }
}

/**
 * Get ambient light intensity based on background mode (same distribution, different source).
 * Returns f16 for memory efficiency.
 * 
 * The ambient light has the same spectral distribution as the background
 * but is applied from the "front" as reflected light rather than transmitted backlight.
 */
fn getAmbientIntensity(wavelengthNm: f32) -> f16 {
  // Use same distribution as background - they are synced
  return f16(getBackgroundIntensity(wavelengthNm));
}

/**
 * Sample ambient pattern from MSDF texture (diagonal-circle-grid).
 * Returns 0-1 coverage value based on position.
 * Uses diagonal-circle-grid from the large texture array (layer 0) for spatial variation.
 * Pattern scales responsively to fit the current screen size.
 */
fn getAmbientPattern(x: f32, y: f32) -> f16 {
  // Base texture size for diagonal-circle-grid (1280x720)
  let texWidth = 1280.0;
  let texHeight = 720.0;
  
  // Compute UV coordinates that scale to full screen (responsive)
  // Maps pixel position to 0-1 range based on current screen dimensions
  let u = x / f32(params.width);
  let v = y / f32(params.height);
  let uv = vec2<f32>(u, v);
  
  // Sample MSDF texture from large array (index 1), layer 0 (diagonal-circle-grid)
  // diagonal-circle-grid is loaded first in the large texture array
  let msd = sampleMSDFTexture(1u, 0u, uv);
  
  // Get signed distance: 0.5 = edge, >0.5 = inside, <0.5 = outside
  let sd = msdfMedian(msd) - 0.5;
  
  // Calculate screen-space coverage with soft edge
  // pxRange = 8 for the MSDF, screenPxRange scales based on texture-to-screen ratio
  let texSize = vec2<f32>(texWidth, texHeight);
  let screenSize = vec2<f32>(f32(params.width), f32(params.height));
  let screenPxRange = max(params.msdfPxRange * (screenSize.x / texSize.x), 1.0);
  
  // Compute coverage with anti-aliased edge
  let screenDist = sd * screenPxRange;
  let coverage = clamp(screenDist + 0.5, 0.0, 1.0);
  
  // Map to ambient light contribution: inside circles = 0.6, outside = 1.0
  // Same values as circle-grid overlay for consistent visual style
  return f16(1.0 - 0.4 * coverage);
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
// Based on physical Rayleigh cross-section: σ = ((2π)^5/48) × (d^6/λ^4) × n_m^4 × RI_factor²
// For 50nm nanoparticles in water/crystal media, this gives ~4.5e-14
const RAYLEIGH_COEFF: f32 = 5e-14;
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

// f16 versions of scatter fractions for optimized kernels
const IN_SHAPE_SCATTER_FRACTION_H: f16 = 0.95h;
const AURA_SCATTER_FRACTION_H: f16 = 0.05h;

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
// Downsampled Scattering Optimization
// ============================================================

// LUT size for downsampled scattering (compute at 64 wavelengths, interpolate for 5000)
const SCATTER_LUT_SIZE: u32 = 64u;

/**
 * Pre-computed scattering data for a shape.
 * Stores scattering coefficients at reduced wavelength resolution.
 */
struct ScatterLUT {
  // Scattering coefficients at SCATTER_LUT_SIZE wavelength samples
  coefficients: array<f32, 64>,
}

/**
 * Build a scattering LUT for a shape's particle configuration.
 * Computes scattering at SCATTER_LUT_SIZE wavelength samples for later interpolation.
 */
fn buildScatterLUT(
  smallDensity: f32,
  largeDensity: f32,
  pathLength: f32
) -> ScatterLUT {
  var lut: ScatterLUT;
  
  if (pathLength <= 0.0 || (smallDensity <= 0.0 && largeDensity <= 0.0)) {
    // No scattering - fill with zeros
    for (var i: u32 = 0u; i < SCATTER_LUT_SIZE; i++) {
      lut.coefficients[i] = 0.0;
    }
    return lut;
  }
  
  let wavelengthRange = params.wavelengthMax - params.wavelengthMin;
  
  for (var i: u32 = 0u; i < SCATTER_LUT_SIZE; i++) {
    let t = f32(i) / f32(SCATTER_LUT_SIZE - 1u);
    let wavelength = params.wavelengthMin + t * wavelengthRange;
    
    let rayleigh = getRayleighScattering(wavelength, smallDensity);
    let mie = getMieScattering(wavelength, largeDensity);
    lut.coefficients[i] = (rayleigh + mie) * pathLength;
  }
  
  return lut;
}

/**
 * Sample scattering coefficient from pre-computed LUT with linear interpolation.
 */
fn sampleScatterLUT(lut: ptr<function, ScatterLUT>, wavelengthNm: f32) -> f32 {
  let wavelengthRange = params.wavelengthMax - params.wavelengthMin;
  let t = (wavelengthNm - params.wavelengthMin) / wavelengthRange;
  let tClamped = clamp(t, 0.0, 1.0);
  
  let indexFloat = tClamped * f32(SCATTER_LUT_SIZE - 1u);
  let indexLow = u32(floor(indexFloat));
  let indexHigh = min(indexLow + 1u, SCATTER_LUT_SIZE - 1u);
  let frac = indexFloat - f32(indexLow);
  
  return mix((*lut).coefficients[indexLow], (*lut).coefficients[indexHigh], frac);
}

/**
 * Apply scattering using pre-computed LUT (faster for many wavelengths).
 */
fn applyScatteringFromLUT(
  intensity: f32,
  lut: ptr<function, ScatterLUT>,
  wavelengthNm: f32,
  mask: f32
) -> f32 {
  let totalScatter = sampleScatterLUT(lut, wavelengthNm) * mask;
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
      // NOTE: Fluorescence is handled by the two-pass applyLayerAbsorption pipeline.
      // This simple per-wavelength path doesn't support inter-wavelength fluorescence
      // (UV excitation → visible emission) because excitation and emission are at
      // different wavelengths. Only Kirchhoff emission is computed here.
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
  
  // Pass 0: Integrate spectral buffer to XYZ and find max intensity
  // Read from spectralInput which contains the per-layer composited result
  // This ensures proper layer order (back-to-front) for absorption and emission
  //
  // Buffer spans 100-1000nm (for UV fluorescence), but CIE only covers 380-700nm.
  // getCIE() returns 0 outside visible range, so we iterate over ALL samples
  // and only visible wavelengths contribute to color.
  
  let dLambda = (params.wavelengthMax - params.wavelengthMin) / f32(SPECTRAL_SAMPLES - 1u);
  var xyz = vec3<f32>(0.0, 0.0, 0.0);
  var maxIntensity: f32 = 0.0;
  
  for (var i: u32 = 0u; i < SPECTRAL_SAMPLES; i++) {
    let wavelength = getWavelengthForIndex(i);
    
    // Read from spectral buffer (result of per-layer processing)
    let intensity = interpolateSpectralBuffer(x, y, wavelength);
    
    // Track maximum intensity for this pixel
    maxIntensity = max(maxIntensity, intensity);
    
    // Accumulate XYZ (getCIE returns 0 for UV/IR, so only visible contributes)
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
 * Interpolate from the spectral buffer to get intensity at any wavelength.
 * Uses linear interpolation between the two nearest samples.
 * Buffer covers full range (100-1000nm) for UV fluorescence support.
 */
fn interpolateSpectralBuffer(x: u32, y: u32, wavelength: f32) -> f32 {
  // Map wavelength to fractional index in our spectral buffer
  // Buffer uses full range (params.wavelengthMin to params.wavelengthMax)
  let range = params.wavelengthMax - params.wavelengthMin;
  let fractionalIdx = (wavelength - params.wavelengthMin) / range * f32(SPECTRAL_SAMPLES - 1u);
  
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
    var intensity: f16 = f16(0.0);
    
    if (inBounds) {
      let wavelength = params.wavelengthMin + f32(i) * step;
      // Use full physics computation for high-resolution spectrum (returns f32)
      intensity = f16(computePixelIntensity(fx, fy, wavelength, numShapes));
    }
    
    // Store f16 directly (no conversion needed)
    spectrumBox[outputOffset + i] = intensity;
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

// NOTE: initBackgroundSpectrum_HighRes has been removed
// NOTE: applyLayerAbsorption_HighRes has been removed
// with params.bufferWidth/Height/sampleCount set for spectrum mode

// NOTE: All _HighRes blur variants have been removed
// Use unified blur functions with params.bufferWidth/Height/sampleCount set for spectrum mode

// NOTE: combineScattered_HighRes has been removed
// Use unified combineScattered with params.bufferWidth/Height/sampleCount set for spectrum mode

// NOTE: blurEmissionAuraH_HighRes, blurEmissionAuraV_HighRes, and finalCombine_HighRes
// have been removed. Use unified versions with params.bufferWidth/Height/sampleCount
// set for spectrum mode.

/**
 * UNIFIED: Final combination for high-res spectrum.
 * Writes result to spectrumBox for averaging.
 * 
 * Reads from spectralInput where combineScattered wrote (no swap after last layer).
 */
@compute @workgroup_size(8, 8)
fn finalCombine(@builtin(global_invocation_id) id: vec3<u32>) {
  let localX = id.x;
  let localY = id.y;
  
  if (localX >= params.bufferWidth || localY >= params.bufferHeight) {
    return;
  }
  
  let boxIndex = localY * params.bufferWidth + localX;
  let outputOffset = boxIndex * params.sampleCount;
  
  for (var wIdx: u32 = 0u; wIdx < params.sampleCount; wIdx++) {
    let spectralIdx = getSpectralIdx(localX, localY, wIdx);
    
    // Read from spectralInput (where combineScattered wrote) - already f16
    let combined = spectralInput[spectralIdx];
    
    // Write to spectrumBox for averaging (f16 to f16, no conversion needed)
    spectrumBox[outputOffset + wIdx] = combined;
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
  
  // Use bufferWidth for the actual box size (set to SPECTRUM_BOX_SIZE=30 in spectrum mode)
  let boxSize = params.bufferWidth;
  let halfBox = i32(boxSize) / 2;
  let avgRadius = i32(params.averageRadius);
  let centerX = halfBox;  // Center of box in local coords
  let centerY = halfBox;
  
  var sum: f32 = 0.0;
  var count: f32 = 0.0;
  
  // Iterate over all pixels in the box
  for (var by: u32 = 0u; by < boxSize; by++) {
    for (var bx: u32 = 0u; bx < boxSize; bx++) {
      // Check if within averaging circle
      let dx = i32(bx) - centerX;
      let dy = i32(by) - centerY;
      let distSq = dx * dx + dy * dy;
      
      if (distSq <= avgRadius * avgRadius) {
        // Get spectrum value from box (convert f16 to f32 for accumulation)
        let boxIndex = by * boxSize + bx;
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
 * Uses full range (100-1000nm) from params to match getWavelength()
 */
fn getWavelengthForIndex(idx: u32) -> f32 {
  // Same formula as getWavelength() - use full range for UV fluorescence
  return params.wavelengthMin + (params.wavelengthMax - params.wavelengthMin) * f32(idx) / f32(SPECTRAL_SAMPLES - 1u);
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
// UNIFIED PIPELINE: Helper Functions
// ============================================================
// These unified helpers use params.bufferWidth/Height, sampleCount, and coordOffset
// to provide a single code path for both rendering (16 samples) and spectrum (5000 samples).

/**
 * Get spectral buffer index using unified params
 * Works for both rendering (width×height×16) and spectrum (boxSize×boxSize×plotResolution)
 */
fn getSpectralIdx(localX: u32, localY: u32, wIdx: u32) -> u32 {
  return (localY * params.bufferWidth + localX) * params.sampleCount + wIdx;
}

/**
 * Convert local buffer coordinates to screen coordinates
 * For rendering: offset is 0, so localX/Y = screenX/Y
 * For spectrum: offset centers the box on (sampleX, sampleY)
 */
fn localToScreen(localX: u32, localY: u32) -> vec2<i32> {
  return vec2<i32>(
    i32(localX) + params.coordOffsetX,
    i32(localY) + params.coordOffsetY
  );
}

/**
 * Check if screen coordinates are valid (within screen bounds)
 */
fn isValidScreenPos(screenPos: vec2<i32>) -> bool {
  return screenPos.x >= 0 && screenPos.x < i32(params.width) &&
         screenPos.y >= 0 && screenPos.y < i32(params.height);
}

/**
 * Get wavelength for a given sample index using unified params
 * Maps [0, sampleCount-1] to appropriate wavelength range:
 * - For rendering (16 samples): visible range 380-700nm (for CIE color integration)
 * - For spectrum (5000 samples): full range 200-1000nm from params (for spectral plot)
 */
fn getWavelength(wIdx: u32) -> f32 {
  // Use full range (100-1000nm) for all rendering to capture UV excitation for fluorescence
  // This allows UV absorption → visible emission (e.g., sodium D-lines at 589nm)
    return params.wavelengthMin + (params.wavelengthMax - params.wavelengthMin) * f32(wIdx) / f32(params.sampleCount - 1u);
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
  auraSrc: f32,          // Combined aura source (scatter + emission) for unified blur
  directEmission: f32,   // Emission that stays at pixel
  // Note: emissionAuraSrc merged into auraSrc - now using single unified blur sigma
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
  result.auraSrc = 0.0;
  result.directEmission = 0.0;
  
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
      result.auraSrc += scatteredFrac * AURA_SCATTER_FRACTION;
      
      // Update transmitted for next shape in layer (full brightness preserved)
      result.transmitted = directTrans;
      
      // Note: Per-pixel blur sigma calculation removed - we now use global atmospheric sigma
      
      // Handle emission with spread factor
      if (params.enableEmission == 1u) {
        // === Kirchhoff Thermal Emission ===
        let em = getKirchhoffEmission(materialTrans, wavelength, shape.temperature);
        
        // === Fluorescence Emission ===
        let absorbedLight = inputIntensity * (1.0 - materialTrans) * mask;
        let excitationEff = getFluorescenceExcitation(shape.materialIndex, wavelength);
        let excitationAmount = absorbedLight * excitationEff;
        let emissionShape = getFluorescenceEmission(shape.materialIndex, wavelength);
        let fluorEmission = excitationAmount * emissionShape * shape.fluorescenceQuantumYield;
        
        // Total emission = Kirchhoff + fluorescence
        let totalEmission = em + fluorEmission;
        let maskedEmission = totalEmission * mask;
        
        // Split emission using spread factor
        let spreadFactor = params.emissionSpreadFactor;
        let directFraction = 1.0 - spreadFactor;
        let spreadAmount = maskedEmission * spreadFactor;
        
        // Direct emission stays at pixel
        result.directEmission += maskedEmission * directFraction;
        
        // Spread emission: part goes through scattering medium (Voigt blur)
        // and part is isotropic aura (Gaussian blur)
        // Scattered emission also loses most light to 3D scattering
        // Unified aura: combine scatter and emission into single blur
        result.auraSrc += spreadAmount * (scatterProb * AURA_SCATTER_FRACTION + (1.0 - scatterProb));
      }
    }
  }
  
  return result;
}

// Maximum shapes per layer for pre-computed masks array
const MAX_SHAPES_PER_LAYER: u32 = 16u;

/**
 * Pre-computed shape data for optimized physics calculation.
 * These values are wavelength-independent and can be computed once per pixel.
 */
struct PrecomputedShapeData {
  mask: f32,
  pathLength: f32,
}

/**
 * OPTIMIZED: Compute layer physics using pre-computed masks.
 * This avoids redundant MSDF texture samples per wavelength.
 * 
 * @param inputIntensity - Incoming light intensity at this wavelength
 * @param wavelength - Wavelength in nm
 * @param numShapes - Number of shapes to process
 * @param shapeData - Pre-computed mask and pathLength for each shape
 * @returns LayerPhysicsResult with all output components
 */
fn computeLayerPhysicsOptimized(
  inputIntensity: f32,
  wavelength: f32,
  numShapes: u32,
  shapeData: ptr<function, array<PrecomputedShapeData, 16>>
) -> LayerPhysicsResult {
  var result: LayerPhysicsResult;
  result.transmitted = inputIntensity;
  result.auraSrc = 0.0;
  result.directEmission = 0.0;
  
  // Apply all shapes in this layer using pre-computed masks
  for (var i: u32 = 0u; i < numShapes; i++) {
    let data = (*shapeData)[i];
    let mask = data.mask;
    
    if (mask > 0.0) {
      let shape = shapes[i];
      let pathLength = data.pathLength;
      let materialTrans = getMaterialTransmission(shape.materialIndex, wavelength);
      
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
      
      // Apply scattering attenuation - light that scatters is removed from direct path
      // This creates the Rayleigh spectral effect: blue scatters more, transmitted light reddens
      let directTrans = absorbedInput * scatterTrans;
      
      // Compute scattered light for the aura effect
      let scatteredFrac = absorbedInput * scatterProb;
      result.auraSrc += scatteredFrac * AURA_SCATTER_FRACTION;
      
      // Update transmitted for next shape in layer
      result.transmitted = directTrans;
      
      // Handle emission with spread factor
      if (params.enableEmission == 1u) {
        // === Kirchhoff Thermal Emission ===
        let em = getKirchhoffEmission(materialTrans, wavelength, shape.temperature);
        
        // === Fluorescence Emission ===
        // Fluorescence: UV light absorbed → visible light emitted
        // 1. Calculate absorbed light (what was removed from transmission)
        // 2. Multiply by excitation efficiency at this wavelength
        // 3. Emit at emission wavelengths using emission spectrum
        //
        // For fluorescence to work, we need absorbed UV light.
        // absorbedLight = inputIntensity × (1 - materialTrans) × mask
        let absorbedLight = inputIntensity * (1.0 - materialTrans) * mask;
        
        // Get excitation efficiency (how well this wavelength excites fluorescence)
        let excitationEff = getFluorescenceExcitation(shape.materialIndex, wavelength);
        
        // Calculate excitation amount (energy available for re-emission)
        let excitationAmount = absorbedLight * excitationEff;
        
        // Get emission line shape at this wavelength (normalized 0-1)
        let emissionShape = getFluorescenceEmission(shape.materialIndex, wavelength);
        
        // Fluorescence emission = excitation × emissionShape × quantumYield
        // The quantum yield accounts for non-radiative losses
        let fluorEmission = excitationAmount * emissionShape * shape.fluorescenceQuantumYield;
        
        // Total emission = Kirchhoff + fluorescence
        let totalEmission = em + fluorEmission;
        let maskedEmission = totalEmission * mask;
        
        let spreadFactor = params.emissionSpreadFactor;
        let directFraction = 1.0 - spreadFactor;
        let spreadAmount = maskedEmission * spreadFactor;
        
        result.directEmission += maskedEmission * directFraction;
        // Unified aura: combine scatter and emission into single blur
        result.auraSrc += spreadAmount * (scatterProb * AURA_SCATTER_FRACTION + (1.0 - scatterProb));
      }
    }
  }
  
  return result;
}

/**
 * SHARED: Compute layer physics with pre-accumulated fluorescence excitation.
 * This is the TWO-PASS version that correctly handles inter-wavelength fluorescence.
 * 
 * The key difference from computeLayerPhysicsOptimized:
 * - Uses pre-accumulated excitation values (from Pass 1) for fluorescence emission
 * - Emission at wavelength λ depends on total absorbed UV, not just absorbed at λ
 * 
 * @param inputIntensity: Current intensity at this wavelength
 * @param wavelength: Wavelength in nm
 * @param numShapes: Number of shapes to process
 * @param shapeData: Pre-computed masks and path lengths
 * @param shapeExcitation: Pre-accumulated excitation per shape (from Pass 1)
 */
fn computeLayerPhysicsWithFluorescence(
  inputIntensity: f32,
  wavelength: f32,
  numShapes: u32,
  shapeData: ptr<function, array<PrecomputedShapeData, 16>>,
  shapeExcitation: ptr<function, array<f32, 16>>
) -> LayerPhysicsResult {
  var result: LayerPhysicsResult;
  result.transmitted = inputIntensity;
  result.auraSrc = 0.0;
  result.directEmission = 0.0;
  
  // Apply all shapes in this layer using pre-computed masks
  for (var i: u32 = 0u; i < numShapes; i++) {
    let data = (*shapeData)[i];
    let mask = data.mask;
    
    if (mask > 0.0) {
      let shape = shapes[i];
      let pathLength = data.pathLength;
      let materialTrans = getMaterialTransmission(shape.materialIndex, wavelength);
      
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
      
      // Apply scattering attenuation - light that scatters is removed from direct path
      // This creates the Rayleigh spectral effect: blue scatters more, transmitted light reddens
      let directTrans = absorbedInput * scatterTrans;
      
      // Compute scattered light for the aura effect
      let scatteredFrac = absorbedInput * scatterProb;
      result.auraSrc += scatteredFrac * AURA_SCATTER_FRACTION;
      
      // Update transmitted for next shape in layer
      result.transmitted = directTrans;
      
      // Handle emission with spread factor
      if (params.enableEmission == 1u) {
        // === Kirchhoff Thermal Emission ===
        let em = getKirchhoffEmission(materialTrans, wavelength, shape.temperature);
        
        // === Fluorescence Emission (Two-Pass) ===
        // Use pre-accumulated excitation from Pass 1.
        // This is the total absorbed×excitationEff across ALL wavelengths.
        let totalExcitation = (*shapeExcitation)[i];
        
        // Get emission line shape at this wavelength (normalized 0-1)
        // This is non-zero at the emission wavelength (e.g., 589nm for sodium)
        let emissionShape = getFluorescenceEmission(shape.materialIndex, wavelength);
        
        // Fluorescence emission = totalExcitation × emissionShape × quantumYield
        // The quantum yield accounts for non-radiative losses
        let fluorEmission = totalExcitation * emissionShape * shape.fluorescenceQuantumYield;
        
        // Total emission = Kirchhoff + fluorescence
        let totalEmission = em + fluorEmission;
        let maskedEmission = totalEmission * mask;
        
        let spreadFactor = params.emissionSpreadFactor;
        let directFraction = 1.0 - spreadFactor;
        let spreadAmount = maskedEmission * spreadFactor;
        
        result.directEmission += maskedEmission * directFraction;
        // Unified aura: combine scatter and emission into single blur
        result.auraSrc += spreadAmount * (scatterProb * AURA_SCATTER_FRACTION + (1.0 - scatterProb));
      }
    }
  }
  
  return result;
}

// ============================================================
// Entry Point: Initialize Background Spectrum (UNIFIED)
// ============================================================

/**
 * UNIFIED: Initialize spectral buffer with background illumination.
 * This is the starting point before any layer processing.
 * 
 * Writes to spectralOutput. The TypeScript must swap buffers after init
 * so that the background becomes spectralInput for the first layer.
 */
@compute @workgroup_size(8, 8)
fn initBackgroundSpectrum(@builtin(global_invocation_id) id: vec3<u32>) {
  let localX = id.x;
  let localY = id.y;
  
  if (localX >= params.bufferWidth || localY >= params.bufferHeight) {
    return;
  }
  
  // Convert local to screen coords to check bounds
  let screenPos = localToScreen(localX, localY);
  let inBounds = isValidScreenPos(screenPos);
  
  // Initialize each wavelength with background intensity
  for (var wIdx: u32 = 0u; wIdx < params.sampleCount; wIdx++) {
    let spectralIdx = getSpectralIdx(localX, localY, wIdx);
    
    var intensity: f16 = f16(0.0);
    if (inBounds) {
      let wavelength = getWavelength(wIdx);
      // getBackgroundIntensity returns f32, convert to f16
      intensity = f16(getBackgroundIntensity(wavelength));
    }
    
    // Write background to spectralOutput (will be swapped to become input)
    spectralOutput[spectralIdx] = intensity;
    
    // Initialize aura buffer to zero (unified scatter + emission)
    scatterSource[spectralIdx] = f16(0.0);
  }
  
}

// ============================================================
// Entry Point: Apply Layer Absorption/Emission (UNIFIED)
// ============================================================

/**
 * UNIFIED: Apply a single layer's absorption and emission to the spectral buffer.
 * Works for both rendering (16 samples) and spectrum plot (5000 samples).
 * 
 * Uses unified params: bufferWidth/Height, sampleCount, coordOffsetX/Y
 * Set these via TypeScript before dispatch to switch between render/spectrum mode.
 */
@compute @workgroup_size(8, 8)
fn applyLayerAbsorption(@builtin(global_invocation_id) id: vec3<u32>) {
  let localX = id.x;
  let localY = id.y;
  
  // Bounds check using unified buffer dimensions
  if (localX >= params.bufferWidth || localY >= params.bufferHeight) {
    return;
  }
  
  // Convert local coords to screen coords (offset is 0 for render, centered for spectrum)
  let screenPos = localToScreen(localX, localY);
  let inBounds = isValidScreenPos(screenPos);
  let fx = f32(screenPos.x);
  let fy = f32(screenPos.y);
  let numShapes = arrayLength(&shapes);
  let pixelIdx = localY * params.bufferWidth + localX;
  
  // OPTIMIZATION: Pre-compute masks and pathLengths ONCE per pixel (not per wavelength)
  // This avoids redundant MSDF texture samples (major speedup for 5000 wavelengths)
  var shapeData: array<PrecomputedShapeData, 16>;
  var anyMask: bool = false;
  let shapesToProcess = min(numShapes, MAX_SHAPES_PER_LAYER);
  
  if (inBounds) {
    for (var i: u32 = 0u; i < shapesToProcess; i++) {
      let mask = getShapeMask(shapes[i], fx, fy);
      let pathLength = max(shapes[i].width, shapes[i].height) * 0.01;
      shapeData[i] = PrecomputedShapeData(mask, pathLength);
      anyMask = anyMask || (mask > 0.0);
    }
  }
  
  // OPTIMIZATION: Early exit for pixels with no shape coverage
  // This skips all wavelength physics for ~70-90% of pixels
  if (!anyMask || !inBounds) {
    // Fast path: copy input to output, zero scatter/emission
    for (var wIdx: u32 = 0u; wIdx < params.sampleCount; wIdx++) {
      let spectralIdx = getSpectralIdx(localX, localY, wIdx);
      spectralOutput[spectralIdx] = spectralInput[spectralIdx];
      scatterSource[spectralIdx] = f16(0.0);
    }
    return;
  }
  
  // ============================================================
  // TWO-PASS FLUORESCENCE: Accumulate excitation, then emit
  // ============================================================
  // 
  // Fluorescence requires inter-wavelength coupling:
  // - UV photons (e.g., 300nm) are absorbed and excite molecules
  // - Molecules re-emit at longer wavelengths (e.g., 589nm for sodium)
  // 
  // Pass 1: Accumulate total excitation per shape (sum over all wavelengths)
  // Pass 2: Apply emission at each wavelength using accumulated excitation
  //
  // This is physically accurate: excitation doesn't depend on where emission happens
  // ============================================================
  
  // Accumulate total fluorescence excitation per shape
  var shapeExcitation: array<f32, 16>;
  for (var i: u32 = 0u; i < 16u; i++) {
    shapeExcitation[i] = 0.0;
  }
  
  // === PASS 1: Accumulate excitation from all wavelengths ===
  if (params.enableEmission == 1u) {
    for (var wIdx: u32 = 0u; wIdx < params.sampleCount; wIdx++) {
      let wavelength = getWavelength(wIdx);
      let spectralIdx = getSpectralIdx(localX, localY, wIdx);
      let inputIntensity = f32(spectralInput[spectralIdx]);
      
      // For each shape, accumulate excitation
      var transmitted = inputIntensity;
      for (var i: u32 = 0u; i < shapesToProcess; i++) {
        let data = shapeData[i];
        let mask = data.mask;
        
        if (mask > 0.0) {
          let shape = shapes[i];
          
          // Fluorescence requires absorption first - photons must be absorbed to be re-emitted
          // absorbedLight depends on materialTrans which is depth-dependent (Beer-Lambert)
          let materialTrans = getMaterialTransmission(shape.materialIndex, wavelength);
          let absorbedLight = transmitted * (1.0 - materialTrans) * mask;
          let excitationEff = getFluorescenceExcitation(shape.materialIndex, wavelength);
          
          // Accumulate excitation for this shape (only absorbed light can excite fluorescence)
          shapeExcitation[i] += absorbedLight * excitationEff;
          
          // Update transmitted for next shape (reuse materialTrans computed above)
          let absorption = mix(1.0, materialTrans, mask);
          transmitted *= absorption;
        }
      }
    }
  }
  
  // === PASS 2: Process wavelengths with accumulated excitation ===
  for (var wIdx: u32 = 0u; wIdx < params.sampleCount; wIdx++) {
    let wavelength = getWavelength(wIdx);
    let spectralIdx = getSpectralIdx(localX, localY, wIdx);
    
    // Read current intensity from input buffer (f16 -> f32 for physics calc)
    let inputIntensity = f32(spectralInput[spectralIdx]);
    
    // Use optimized physics with pre-computed masks and accumulated excitation
    let result = computeLayerPhysicsWithFluorescence(
      inputIntensity, wavelength, shapesToProcess, &shapeData, &shapeExcitation
    );
    
    // Write outputs (convert f32 to f16)
    spectralOutput[spectralIdx] = f16(result.transmitted + result.directEmission);
    // Unified aura output - scatter and emission combined
    scatterSource[spectralIdx] = f16(result.auraSrc);
  }
  
}

// ============================================================
// Entry Point: Horizontal Scatter Blur (UNIFIED - Shared Memory)
// ============================================================

/**
 * UNIFIED: Apply horizontal Gaussian blur to scatter source using workgroup shared memory.
 * Uses tiled approach: load tile + halo into shared memory, then blur from shared.
 * 
 * Workgroup: 64 threads process 64 pixels in X, 1 row at a time
 * Shared memory: 96 values per wavelength (64 tile + 32 halo)
 * 
 * Reads from scatterSource, writes to spectralInput.
 */
@compute @workgroup_size(64, 1)
fn blurHorizontal(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
  @builtin(workgroup_id) wgid: vec3<u32>
) {
  let y = gid.y;
  let tileStartX = wgid.x * BLUR_TILE_WIDTH;
  let localIdx = lid.x;
  let validY = y < params.bufferHeight;
  let outX = tileStartX + localIdx;
  let validOut = validY && outX < params.bufferWidth;
  
  // Skip blur if sigma is zero - just copy (all threads must participate uniformly)
  if (params.globalMaxScatterSigma <= 0.0) {
    if (validOut) {
      for (var w: u32 = 0u; w < SPECTRAL_SAMPLES; w++) {
        let idx = getSpectralIdx(outX, y, w);
        spectralInput[idx] = scatterSource[idx];
      }
    }
    return;
  }
  
  // Load tile + halo into shared memory for all wavelengths
  // All threads participate in loading, even out-of-bounds ones (they load zeros)
  for (var w: u32 = 0u; w < SPECTRAL_SAMPLES; w++) {
    let sharedBase = w * BLUR_SHARED_WIDTH;
    
    // Each thread loads one value from the main tile region
    let globalX = i32(tileStartX) + i32(localIdx) - i32(BLUR_HALO);
    if (validY && globalX >= 0 && u32(globalX) < params.bufferWidth) {
      blurTile[sharedBase + localIdx] = scatterSource[getSpectralIdx(u32(globalX), y, w)];
    } else {
      blurTile[sharedBase + localIdx] = f16(0.0);
    }
    
    // First 32 threads also load the right halo
    if (localIdx < 2u * BLUR_HALO) {
      let haloX = i32(tileStartX) + i32(BLUR_TILE_WIDTH) + i32(localIdx) - i32(BLUR_HALO);
      if (validY && haloX >= 0 && u32(haloX) < params.bufferWidth) {
        blurTile[sharedBase + BLUR_TILE_WIDTH + localIdx] = scatterSource[getSpectralIdx(u32(haloX), y, w)];
      } else {
        blurTile[sharedBase + BLUR_TILE_WIDTH + localIdx] = f16(0.0);
      }
    }
  }
  
  workgroupBarrier();
  
  // Blur from shared memory (precomputed weights for sigma=5)
  if (validOut) {
    for (var w: u32 = 0u; w < SPECTRAL_SAMPLES; w++) {
      var sum = f16(0.0);
      var weightSum = f16(0.0);
      let sharedBase = w * BLUR_SHARED_WIDTH;
      let centerIdx = localIdx + BLUR_HALO;
      
      // Apply blur using precomputed symmetric weights
      for (var dx: i32 = -MAX_BLUR_RADIUS; dx <= MAX_BLUR_RADIUS; dx++) {
        let sharedX = i32(centerIdx) + dx;
        let weight = f16(BLUR_WEIGHTS[abs(dx)]);
        sum += blurTile[sharedBase + u32(sharedX)] * weight;
        weightSum += weight;
      }
      
      let outIdx = getSpectralIdx(outX, y, w);
      spectralInput[outIdx] = sum / weightSum;
    }
  }
}

// ============================================================
// Entry Point: Vertical Scatter Blur (UNIFIED - Shared Memory)
// ============================================================

/**
 * UNIFIED: Apply vertical Gaussian blur using workgroup shared memory.
 * Uses tiled approach: load tile + halo into shared memory, then blur from shared.
 * 
 * Workgroup: 1 thread in X, 64 threads in Y process a column
 * Shared memory: 96 values per wavelength (64 tile + 32 halo)
 * 
 * Reads from spectralInput (H-blurred), writes to scatterSource (fully blurred).
 */
@compute @workgroup_size(1, 64)
fn blurVertical(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
  @builtin(workgroup_id) wgid: vec3<u32>
) {
  let x = gid.x;
  let tileStartY = wgid.y * BLUR_TILE_HEIGHT;
  let localIdx = lid.y;
  let validX = x < params.bufferWidth;
  let outY = tileStartY + localIdx;
  let validOut = validX && outY < params.bufferHeight;
  
  // Skip blur if sigma is zero - just copy (all threads must participate uniformly)
  if (params.globalMaxScatterSigma <= 0.0) {
    if (validOut) {
      for (var w: u32 = 0u; w < SPECTRAL_SAMPLES; w++) {
        let idx = getSpectralIdx(x, outY, w);
        scatterSource[idx] = spectralInput[idx];
      }
    }
    return;
  }
  
  // Load tile + halo into shared memory for all wavelengths
  for (var w: u32 = 0u; w < SPECTRAL_SAMPLES; w++) {
    let sharedBase = w * BLUR_SHARED_HEIGHT;
    
    // Each thread loads one value from the main tile region
    let globalY = i32(tileStartY) + i32(localIdx) - i32(BLUR_HALO);
    if (validX && globalY >= 0 && u32(globalY) < params.bufferHeight) {
      blurTile[sharedBase + localIdx] = spectralInput[getSpectralIdx(x, u32(globalY), w)];
    } else {
      blurTile[sharedBase + localIdx] = f16(0.0);
    }
    
    // First 32 threads also load the bottom halo
    if (localIdx < 2u * BLUR_HALO) {
      let haloY = i32(tileStartY) + i32(BLUR_TILE_HEIGHT) + i32(localIdx) - i32(BLUR_HALO);
      if (validX && haloY >= 0 && u32(haloY) < params.bufferHeight) {
        blurTile[sharedBase + BLUR_TILE_HEIGHT + localIdx] = spectralInput[getSpectralIdx(x, u32(haloY), w)];
      } else {
        blurTile[sharedBase + BLUR_TILE_HEIGHT + localIdx] = f16(0.0);
      }
    }
  }
  
  workgroupBarrier();
  
  // Blur from shared memory
  if (validOut) {
    for (var w: u32 = 0u; w < SPECTRAL_SAMPLES; w++) {
      var sum = f16(0.0);
      var weightSum = f16(0.0);
      let sharedBase = w * BLUR_SHARED_HEIGHT;
      let centerIdx = localIdx + BLUR_HALO;
      
      // Apply blur using precomputed symmetric weights
      for (var dy: i32 = -MAX_BLUR_RADIUS; dy <= MAX_BLUR_RADIUS; dy++) {
        let sharedY = i32(centerIdx) + dy;
        let weight = f16(BLUR_WEIGHTS[abs(dy)]);
        sum += blurTile[sharedBase + u32(sharedY)] * weight;
        weightSum += weight;
      }
      
      let outIdx = getSpectralIdx(x, outY, w);
      scatterSource[outIdx] = sum / weightSum;
    }
  }
}

// ============================================================
// Entry Point: Blur Transmitted Horizontal (UNIFIED - Shared Memory)
// ============================================================

/**
 * UNIFIED: Apply horizontal Gaussian blur to transmitted using workgroup shared memory.
 * This is the blur->mask path: background bleeds INTO shapes.
 * 
 * Reads from spectralOutput, writes to spectralInput (temp).
 */
@compute @workgroup_size(64, 1)
fn blurTransmittedH(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
  @builtin(workgroup_id) wgid: vec3<u32>
) {
  let y = gid.y;
  let tileStartX = wgid.x * BLUR_TILE_WIDTH;
  let localIdx = lid.x;
  let validY = y < params.bufferHeight;
  let outX = tileStartX + localIdx;
  let validOut = validY && outX < params.bufferWidth;
  
  // Skip blur if sigma is zero - just copy (all threads must participate uniformly)
  if (params.globalMaxScatterSigma <= 0.0) {
    if (validOut) {
      for (var w: u32 = 0u; w < SPECTRAL_SAMPLES; w++) {
        let idx = getSpectralIdx(outX, y, w);
        spectralInput[idx] = spectralOutput[idx];
      }
    }
    return;
  }
  
  // Load tile + halo into shared memory for all wavelengths
  for (var w: u32 = 0u; w < SPECTRAL_SAMPLES; w++) {
    let sharedBase = w * BLUR_SHARED_WIDTH;
    
    let globalX = i32(tileStartX) + i32(localIdx) - i32(BLUR_HALO);
    if (validY && globalX >= 0 && u32(globalX) < params.bufferWidth) {
      blurTile[sharedBase + localIdx] = spectralOutput[getSpectralIdx(u32(globalX), y, w)];
    } else {
      blurTile[sharedBase + localIdx] = f16(0.0);
    }
    
    if (localIdx < 2u * BLUR_HALO) {
      let haloX = i32(tileStartX) + i32(BLUR_TILE_WIDTH) + i32(localIdx) - i32(BLUR_HALO);
      if (validY && haloX >= 0 && u32(haloX) < params.bufferWidth) {
        blurTile[sharedBase + BLUR_TILE_WIDTH + localIdx] = spectralOutput[getSpectralIdx(u32(haloX), y, w)];
      } else {
        blurTile[sharedBase + BLUR_TILE_WIDTH + localIdx] = f16(0.0);
      }
    }
  }
  
  workgroupBarrier();
  
  // Blur from shared memory
  if (validOut) {
    for (var w: u32 = 0u; w < SPECTRAL_SAMPLES; w++) {
      var sum = f16(0.0);
      var weightSum = f16(0.0);
      let sharedBase = w * BLUR_SHARED_WIDTH;
      let centerIdx = localIdx + BLUR_HALO;
      
      for (var dx: i32 = -MAX_BLUR_RADIUS; dx <= MAX_BLUR_RADIUS; dx++) {
        let sharedX = i32(centerIdx) + dx;
        let weight = f16(BLUR_WEIGHTS[abs(dx)]);
        sum += blurTile[sharedBase + u32(sharedX)] * weight;
        weightSum += weight;
      }
      
      spectralInput[getSpectralIdx(outX, y, w)] = sum / weightSum;
    }
  }
}

// ============================================================
// Entry Point: Blur Transmitted Vertical (UNIFIED - Shared Memory)
// ============================================================

/**
 * UNIFIED: Apply vertical Gaussian blur to transmitted using workgroup shared memory.
 * Reads from spectralInput (H-blurred), writes to blurredTransmitted.
 */
@compute @workgroup_size(1, 64)
fn blurTransmittedV(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
  @builtin(workgroup_id) wgid: vec3<u32>
) {
  let x = gid.x;
  let tileStartY = wgid.y * BLUR_TILE_HEIGHT;
  let localIdx = lid.y;
  let validX = x < params.bufferWidth;
  let outY = tileStartY + localIdx;
  let validOut = validX && outY < params.bufferHeight;
  
  // Skip blur if sigma is zero - just copy (all threads must participate uniformly)
  if (params.globalMaxScatterSigma <= 0.0) {
    if (validOut) {
      for (var w: u32 = 0u; w < SPECTRAL_SAMPLES; w++) {
        let idx = getSpectralIdx(x, outY, w);
        blurredTransmitted[idx] = spectralInput[idx];
      }
    }
    return;
  }
  
  // Load tile + halo into shared memory for all wavelengths
  for (var w: u32 = 0u; w < SPECTRAL_SAMPLES; w++) {
    let sharedBase = w * BLUR_SHARED_HEIGHT;
    
    let globalY = i32(tileStartY) + i32(localIdx) - i32(BLUR_HALO);
    if (validX && globalY >= 0 && u32(globalY) < params.bufferHeight) {
      blurTile[sharedBase + localIdx] = spectralInput[getSpectralIdx(x, u32(globalY), w)];
    } else {
      blurTile[sharedBase + localIdx] = f16(0.0);
    }
    
    if (localIdx < 2u * BLUR_HALO) {
      let haloY = i32(tileStartY) + i32(BLUR_TILE_HEIGHT) + i32(localIdx) - i32(BLUR_HALO);
      if (validX && haloY >= 0 && u32(haloY) < params.bufferHeight) {
        blurTile[sharedBase + BLUR_TILE_HEIGHT + localIdx] = spectralInput[getSpectralIdx(x, u32(haloY), w)];
      } else {
        blurTile[sharedBase + BLUR_TILE_HEIGHT + localIdx] = f16(0.0);
      }
    }
  }
  
  workgroupBarrier();
  
  // Blur from shared memory
  if (validOut) {
    for (var w: u32 = 0u; w < SPECTRAL_SAMPLES; w++) {
      var sum = f16(0.0);
      var weightSum = f16(0.0);
      let sharedBase = w * BLUR_SHARED_HEIGHT;
      let centerIdx = localIdx + BLUR_HALO;
      
      for (var dy: i32 = -MAX_BLUR_RADIUS; dy <= MAX_BLUR_RADIUS; dy++) {
        let sharedY = i32(centerIdx) + dy;
        let weight = f16(BLUR_WEIGHTS[abs(dy)]);
        sum += blurTile[sharedBase + u32(sharedY)] * weight;
        weightSum += weight;
      }
      
      blurredTransmitted[getSpectralIdx(x, outY, w)] = sum / weightSum;
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

// Note: blurEmissionAuraH/V removed - emission now unified with scatter aura

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
// Entry Point: Combine All (Dual-Path Scatter + Unified Aura)
// ============================================================

/**
 * UNIFIED: Combine transmitted light with scattering and unified aura.
 * 
 * Three-path combination model:
 * 1. Direct (unscattered): transmitted * (1 - scatterProb)
 * 2. In-shape blur: blurredTransmitted * scatterProb * IN_SHAPE_SCATTER_FRACTION
 * 3. Unified aura: scatterSource (blurred scatter + emission combined)
 * 
 * Buffer layout after blur passes:
 * - spectralOutput: transmitted light + direct emission (sharp)
 * - blurredTransmitted: Blurred transmitted for in-shape scatter
 * - scatterSource: Blurred unified aura (scatter + emission)
 */
@compute @workgroup_size(8, 8)
fn combineScattered(@builtin(global_invocation_id) id: vec3<u32>) {
  let localX = id.x;
  let localY = id.y;
  
  if (localX >= params.bufferWidth || localY >= params.bufferHeight) {
    return;
  }
  
  // Convert local coords to screen coords for shape queries
  let screenPos = localToScreen(localX, localY);
  let inBounds = isValidScreenPos(screenPos);
  let fx = f32(screenPos.x);
  let fy = f32(screenPos.y);
  let numShapes = arrayLength(&shapes);
  
  // Combine all components for each wavelength
  for (var wIdx: u32 = 0u; wIdx < params.sampleCount; wIdx++) {
    let wavelength = getWavelength(wIdx);
    let spectralIdx = getSpectralIdx(localX, localY, wIdx);
    
    // Read the three components (stay in f16 for efficiency)
    let transmitted = spectralOutput[spectralIdx];           // Sharp transmitted + direct emission
    let blurredFull = blurredTransmitted[spectralIdx];       // Blurred for in-shape scatter
    let aura = scatterSource[spectralIdx];                   // Unified blurred aura (scatter + emission)
    
    // Compute scatter probability (only for in-bounds pixels)
    // scatterProb needs f32 for exp() in applyScattering
    var scatterProb: f32 = 0.0;
    if (inBounds) {
      scatterProb = computeScatterProb(fx, fy, wavelength, numShapes);
    }
    let scatterProb16 = f16(scatterProb);
    
    // Three-path combination (f16 arithmetic):
    let direct = transmitted * (f16(1.0) - scatterProb16);
    let inShapeScatter = blurredFull * scatterProb16 * f16(IN_SHAPE_SCATTER_FRACTION);
    // aura already unified (scatter + emission combined before blur)
    
    var result = direct + inShapeScatter + aura;
    
    // === Per-layer ambient reflection ===
    // Add ambient light reflection for shapes in the current layer only
    // This happens as the final step of each layer's processing
    if (inBounds) {
      let pattern = getAmbientPattern(fx, fy);
      let ambient = getAmbientIntensity(wavelength);
      
      // Compound reflections multiplicatively from all shapes in the current layer
      // This ensures overlapping shapes (like bg-base + bg-grid) work correctly:
      // - bg-base with 100% reflection shows full ambient
      // - bg-grid overlay with 60% reflection REDUCES the result to 60%
      //
      // We track coverage separately to avoid bright halos at anti-aliased edges.
      // The old formula (mask*reflection + 1-mask) caused edges to be brighter
      // than shape interiors for materials with reflection < 1.
      var compoundedReflection: f16 = f16(1.0);
      var maxCoverage: f16 = f16(0.0);
      
      for (var i: u32 = 0u; i < numShapes; i++) {
        let shape = shapes[i];
        // Only process shapes in the current layer
        if (shape.layer != params.currentLayer) {
          continue;
        }
        
        let mask = getShapeMask(shape, fx, fy);
        if (mask > 0.0) {
          // Get material reflection coefficient
          let reflection = getMaterialReflection(shape.materialIndex, wavelength);
          // Multiply reflections directly (no pass-through blending)
          // This gives correct multiplicative behavior for overlapping shapes
          compoundedReflection *= reflection;
          // Track maximum coverage for anti-aliasing (smooth edges, no bright halo)
          maxCoverage = max(maxCoverage, f16(mask));
        }
      }
      
      // Apply coverage at the end - edges are correctly dimmer than inside
      if (maxCoverage > f16(0.0)) {
        result += ambient * compoundedReflection * maxCoverage * pattern;
      }
      
    }
    
    
    // Write to spectralInput - next layer reads from spectralInput (no swap needed)
    spectralInput[spectralIdx] = result;
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
  // Buffer spans 100-1000nm, CIE only covers 380-700nm (getCIE returns 0 outside)
  let dLambda = (params.wavelengthMax - params.wavelengthMin) / f32(SPECTRAL_SAMPLES - 1u);
  var xyz = vec3<f32>(0.0, 0.0, 0.0);
  var maxIntensity: f32 = 0.0;
  
  for (var i: u32 = 0u; i < SPECTRAL_SAMPLES; i++) {
    let wavelength = getWavelengthForIndex(i);
    let spectralIdx = getSpectralIndex(x, y, i);
    let intensity = f32(spectralInput[spectralIdx]);
    
    maxIntensity = max(maxIntensity, intensity);
    
    // getCIE returns 0 for UV/IR, so only visible wavelengths contribute
    let cie = getCIE(wavelength);
    xyz += intensity * cie * dLambda;
  }
  
  // Store XYZ for normalization pass
  rgbOutput[pixelIndex] = vec4<f32>(xyz, maxIntensity);
  maxPerPixel[pixelIndex] = xyz.y; // Luminance for global max
}

// ============================================================
// Entry Point: Apply Ambient Light (Post-Layer Processing)
// ============================================================

/**
 * Apply ambient light pass after all layer processing and blurring.
 * 
 * This pass adds reflected ambient light to materials, ensuring that
 * opaque/highly-absorbing materials still show color instead of black.
 * 
 * Formula per wavelength:
 *   result = current + ambient_intensity × material_reflection × mask × pattern
 * 
 * Where:
 * - current: result from transmission/absorption/blur pipeline
 * - ambient_intensity: ambient light distribution (synced with background mode)
 * - material_reflection: wavelength-dependent reflection coefficient (0-1)
 * - mask: shape coverage from MSDF (where light is reflected)
 * - pattern: diagonal circle-grid spatial variation
 * 
 * All calculations use f16 for memory bandwidth efficiency.
 */
@compute @workgroup_size(8, 8)
fn applyAmbientLight(@builtin(global_invocation_id) id: vec3<u32>) {
  let localX = id.x;
  let localY = id.y;
  
  // Bounds check using unified buffer dimensions
  if (localX >= params.bufferWidth || localY >= params.bufferHeight) {
    return;
  }
  
  // Convert local coords to screen coords
  let screenPos = localToScreen(localX, localY);
  let inBounds = isValidScreenPos(screenPos);
  let fx = f32(screenPos.x);
  let fy = f32(screenPos.y);
  let numShapes = arrayLength(&shapes);
  
  // Early exit if out of bounds
  if (!inBounds) {
    return;
  }
  
  // Get ambient pattern value for spatial variation
  let pattern = getAmbientPattern(fx, fy);
  
  // Calculate compounded reflection per wavelength
  // Reflection compounds multiplicatively, similar to absorption (Beer-Lambert)
  // Example: fullscreen (100%) × circle-grid (60%) = 60% total reflection
  for (var wIdx: u32 = 0u; wIdx < params.sampleCount; wIdx++) {
    let wavelength = getWavelength(wIdx);
    let spectralIdx = getSpectralIdx(localX, localY, wIdx);
    
    // Read current intensity (result of transmission pipeline)
    let current = spectralInput[spectralIdx];
    
    // Get ambient light intensity for this wavelength
    let ambient = getAmbientIntensity(wavelength);
    
    // Compound reflection from all overlapping shapes at this pixel
    // Start with 1.0 and multiply by each shape's reflection
    var compoundedReflection: f16 = f16(1.0);
    var anyShapeCovers: bool = false;
    
    for (var i: u32 = 0u; i < numShapes; i++) {
      let mask = getShapeMask(shapes[i], fx, fy);
      if (mask > 0.0) {
        let shape = shapes[i];
        anyShapeCovers = true;
        
        // Get material reflection at this wavelength
        let reflection = getMaterialReflection(shape.materialIndex, wavelength);
        
        // Compound: multiply reflections together
        // For partial coverage (mask < 1), blend between full reflection and pass-through
        // reflection_effective = mask * reflection + (1 - mask) * 1.0
        // This means: covered area reflects, uncovered area passes through
        let effectiveReflection = f16(mask) * reflection + f16(1.0 - mask);
        compoundedReflection *= effectiveReflection;
      }
    }
    
    // If no shapes cover this pixel, no ambient reflection
    if (!anyShapeCovers) {
      compoundedReflection = f16(0.0);
    }
    
    // Apply ambient light formula:
    // ambient_contribution = ambient × compounded_reflection × pattern
    let ambientContribution = ambient * compoundedReflection * pattern;
    
    // Add to current (f16 arithmetic throughout)
    spectralInput[spectralIdx] = current + ambientContribution;
  }
}

// ============================================================
// Process Layer Transition Entry Point (OPTIMIZED)
// ============================================================

/**
 * OPTIMIZED: Merged kernel combining:
 * 1. combineScattered (from current layer)
 * 2. applyAmbient (from current layer)
 * 
 * This optimizes by:
 * - Pre-computing shape masks ONCE for all operations
 * - Early-exit for pixels with no shape coverage
 */
@compute @workgroup_size(8, 8)
fn processLayerTransition(@builtin(global_invocation_id) id: vec3<u32>) {
  let localX = id.x;
  let localY = id.y;
  
  if (localX >= params.bufferWidth || localY >= params.bufferHeight) {
    return;
  }
  
  let screenPos = localToScreen(localX, localY);
  let inBounds = isValidScreenPos(screenPos);
  let fx = f32(screenPos.x);
  let fy = f32(screenPos.y);
  let numShapes = arrayLength(&shapes);
  
  // Pre-compute shape masks ONCE for all operations
  var shapeMasks: array<f16, 16>;
  var maxMask: f16 = f16(0.0);
  let shapesToProcess = min(numShapes, MAX_SHAPES_PER_LAYER);
  
  if (inBounds) {
    for (var i: u32 = 0u; i < shapesToProcess; i++) {
      let mask = f16(getShapeMask(shapes[i], fx, fy));
      shapeMasks[i] = mask;
      maxMask = max(maxMask, mask);
    }
  }
  
  // EARLY-EXIT: Fast path for pixels with no shape coverage
  if (maxMask == f16(0.0)) {
    for (var wIdx: u32 = 0u; wIdx < params.sampleCount; wIdx++) {
      let spectralIdx = getSpectralIdx(localX, localY, wIdx);
      spectralInput[spectralIdx] = spectralOutput[spectralIdx] + scatterSource[spectralIdx];
    }
    return;
  }
  
  let anyMask = maxMask > f16(0.0);
  
  // Ambient light pattern (computed once)
  var ambientPattern: f16 = f16(0.0);
  if (inBounds) {
    ambientPattern = getAmbientPattern(fx, fy);
  }
  
  // Process each wavelength
  for (var wIdx: u32 = 0u; wIdx < params.sampleCount; wIdx++) {
    let wavelength = getWavelength(wIdx);
    let spectralIdx = getSpectralIdx(localX, localY, wIdx);
    
    // Three-path combination
    let transmitted = spectralOutput[spectralIdx];
    let blurredFull = blurredTransmitted[spectralIdx];
    let aura = scatterSource[spectralIdx];
    
    // Compute scatter probability using cached masks
    var scatterProb: f16 = f16(0.0);
    if (inBounds && anyMask) {
      var unscatteredFrac: f32 = 1.0;
      for (var i: u32 = 0u; i < shapesToProcess; i++) {
        let mask = shapeMasks[i];
        if (mask > f16(0.0)) {
          let shape = shapes[i];
          let pathLength = max(shape.width, shape.height) * 0.01;
          let scatterTrans = applyScattering(
            1.0, wavelength,
            shape.smallParticleDensity, shape.largeParticleDensity,
            pathLength * f32(mask)
          );
          unscatteredFrac *= scatterTrans;
        }
      }
      scatterProb = f16(1.0 - unscatteredFrac);
    }
    
    // Three-path combination
    let direct = transmitted * (f16(1.0) - scatterProb);
    let inShapeScatter = blurredFull * scatterProb * IN_SHAPE_SCATTER_FRACTION_H;
    var combined = direct + inShapeScatter + aura;
    
    // Apply ambient reflection
    if (inBounds && anyMask) {
      let ambient = getAmbientIntensity(wavelength);
      var compoundedReflection: f16 = f16(1.0);
      var maxCoverage: f16 = f16(0.0);
      
      for (var i: u32 = 0u; i < shapesToProcess; i++) {
        let mask = shapeMasks[i];
        if (mask > f16(0.0)) {
          let shape = shapes[i];
          if (shape.layer == params.currentLayer) {
            let reflection = getMaterialReflection(shape.materialIndex, wavelength);
            compoundedReflection *= reflection;
            maxCoverage = max(maxCoverage, mask);
          }
        }
      }
      
      if (maxCoverage > f16(0.0)) {
        combined += ambient * compoundedReflection * maxCoverage * ambientPattern;
      }
    }
    
    spectralInput[spectralIdx] = combined;
  }
}

// ============================================================
// Vectorized Layer Transition (vec4<f16> optimization)
// ============================================================

/**
 * OPTIMIZED: Process 4 wavelengths simultaneously using vec4<f16>.
 * Provides 2-4x ALU improvement through SIMD operations.
 */
@compute @workgroup_size(8, 8)
fn processLayerTransitionVec4(@builtin(global_invocation_id) id: vec3<u32>) {
  let localX = id.x;
  let localY = id.y;
  
  if (localX >= params.bufferWidth || localY >= params.bufferHeight) {
    return;
  }
  
  let screenPos = localToScreen(localX, localY);
  let inBounds = isValidScreenPos(screenPos);
  let fx = f32(screenPos.x);
  let fy = f32(screenPos.y);
  let numShapes = arrayLength(&shapes);
  
  // Pre-compute shape masks ONCE
  var shapeMasks: array<f16, 16>;
  var maxMask: f16 = f16(0.0);
  let shapesToProcess = min(numShapes, MAX_SHAPES_PER_LAYER);
  
  if (inBounds) {
    for (var i: u32 = 0u; i < shapesToProcess; i++) {
      let mask = f16(getShapeMask(shapes[i], fx, fy));
      shapeMasks[i] = mask;
      maxMask = max(maxMask, mask);
    }
  }
  
  let baseIdx = (localY * params.bufferWidth + localX) * params.sampleCount;
  
  // EARLY-EXIT: Fast path for pixels with no shape coverage
  if (maxMask == f16(0.0)) {
    for (var w: u32 = 0u; w < params.sampleCount; w += 4u) {
      let idx0 = baseIdx + w;
      let idx1 = baseIdx + w + 1u;
      let idx2 = baseIdx + w + 2u;
      let idx3 = baseIdx + w + 3u;
      
      spectralInput[idx0] = spectralOutput[idx0] + scatterSource[idx0];
      spectralInput[idx1] = spectralOutput[idx1] + scatterSource[idx1];
      spectralInput[idx2] = spectralOutput[idx2] + scatterSource[idx2];
      spectralInput[idx3] = spectralOutput[idx3] + scatterSource[idx3];
    }
    return;
  }
  
  // Ambient light pattern (computed once)
  var ambientPattern: f16 = f16(0.0);
  if (inBounds) {
    ambientPattern = getAmbientPattern(fx, fy);
  }
  
  let anyMask = maxMask > f16(0.0);
  
  // Process 4 wavelengths at a time
  for (var w: u32 = 0u; w < params.sampleCount; w += 4u) {
    let wavelengths = vec4<f32>(
      getWavelength(w),
      getWavelength(w + 1u),
      getWavelength(w + 2u),
      getWavelength(w + 3u)
    );
    
    let idx0 = baseIdx + w;
    let idx1 = baseIdx + w + 1u;
    let idx2 = baseIdx + w + 2u;
    let idx3 = baseIdx + w + 3u;
    
    // Load transmitted, blurred, and aura as vec4
    let transmitted = vec4<f16>(
      spectralOutput[idx0], spectralOutput[idx1],
      spectralOutput[idx2], spectralOutput[idx3]
    );
    let blurred = vec4<f16>(
      blurredTransmitted[idx0], blurredTransmitted[idx1],
      blurredTransmitted[idx2], blurredTransmitted[idx3]
    );
    let aura = vec4<f16>(
      scatterSource[idx0], scatterSource[idx1],
      scatterSource[idx2], scatterSource[idx3]
    );
    
    // Compute scatter probability for each wavelength
    var scatterProb4 = vec4<f16>(0.0h, 0.0h, 0.0h, 0.0h);
    if (inBounds && anyMask) {
      var unscattered = vec4<f32>(1.0, 1.0, 1.0, 1.0);
      for (var i: u32 = 0u; i < shapesToProcess; i++) {
        let mask = shapeMasks[i];
        if (mask > f16(0.0)) {
          let shape = shapes[i];
          let pathLength = max(shape.width, shape.height) * 0.01 * f32(mask);
          
          unscattered.x *= applyScattering(1.0, wavelengths.x, shape.smallParticleDensity, shape.largeParticleDensity, pathLength);
          unscattered.y *= applyScattering(1.0, wavelengths.y, shape.smallParticleDensity, shape.largeParticleDensity, pathLength);
          unscattered.z *= applyScattering(1.0, wavelengths.z, shape.smallParticleDensity, shape.largeParticleDensity, pathLength);
          unscattered.w *= applyScattering(1.0, wavelengths.w, shape.smallParticleDensity, shape.largeParticleDensity, pathLength);
        }
      }
      scatterProb4 = vec4<f16>(f16(1.0 - unscattered.x), f16(1.0 - unscattered.y), f16(1.0 - unscattered.z), f16(1.0 - unscattered.w));
    }
    
    // Vectorized three-path combination
    let one4 = vec4<f16>(1.0h, 1.0h, 1.0h, 1.0h);
    let scatter_frac = vec4<f16>(IN_SHAPE_SCATTER_FRACTION_H);
    let direct = transmitted * (one4 - scatterProb4);
    let inShapeScatter = blurred * scatterProb4 * scatter_frac;
    var combined = direct + inShapeScatter + aura;
    
    // Vectorized ambient reflection
    if (inBounds && anyMask) {
      let ambient = vec4<f16>(
        getAmbientIntensity(wavelengths.x),
        getAmbientIntensity(wavelengths.y),
        getAmbientIntensity(wavelengths.z),
        getAmbientIntensity(wavelengths.w)
      );
      
      var compoundedReflection = vec4<f16>(1.0h, 1.0h, 1.0h, 1.0h);
      var maxCoverage: f16 = f16(0.0);
      
      for (var i: u32 = 0u; i < shapesToProcess; i++) {
        let mask = shapeMasks[i];
        if (mask > f16(0.0)) {
          let shape = shapes[i];
          if (shape.layer == params.currentLayer) {
            let refl = vec4<f16>(
              getMaterialReflection(shape.materialIndex, wavelengths.x),
              getMaterialReflection(shape.materialIndex, wavelengths.y),
              getMaterialReflection(shape.materialIndex, wavelengths.z),
              getMaterialReflection(shape.materialIndex, wavelengths.w)
            );
            compoundedReflection *= refl;
            maxCoverage = max(maxCoverage, mask);
          }
        }
      }
      
      if (maxCoverage > f16(0.0)) {
        combined += ambient * compoundedReflection * vec4<f16>(maxCoverage) * vec4<f16>(ambientPattern);
      }
    }
    
    // Store results
    spectralInput[idx0] = combined.x;
    spectralInput[idx1] = combined.y;
    spectralInput[idx2] = combined.z;
    spectralInput[idx3] = combined.w;
  }
}

