/**
 * Texture Shape Physics
 *
 * Provides functions for texture shape spectral processing:
 * - Transmission: multiplicative overlap (absorbs light)
 * - Emission: additive overlap (adds light)
 * - Reflection: additive overlap (reflects ambient light)
 *
 * Texture shapes are processed AFTER material shapes in each layer.
 * Material reflection is absorbed by texture transmission.
 */

import package::wgsl::structs::{TextureShape, TexturePhysicsResult};
import package::wgsl::bindings::{
  params,
  textureShapes,
  texturePaletteArray, renderTexturePaletteArray, materialSampler,
  msdfArraySmall, msdfArrayLarge, alphaArraySmall, alphaArrayLarge, msdfSampler
};

// Texture palettes use texture arrays for unlimited materials (hundreds supported)
// Each array layer = one texture material
// RGB packed: R = transmission, G = emission, B = reflection

// ============================================================
// Texture Shape MSDF/Alpha Sampling
// ============================================================

/**
 * Get MSDF coverage for a texture shape.
 *
 * @param shape - Texture shape definition
 * @param x - Pixel X coordinate
 * @param y - Pixel Y coordinate
 * @returns Coverage value (0-1), or 1.0 if no MSDF texture
 */
fn getTextureMsdfCoverage(shape: TextureShape, x: f32, y: f32) -> f32 {
  // Check if within bounding box
  if (x < shape.x || x >= shape.x + shape.width ||
      y < shape.y || y >= shape.y + shape.height) {
    return 0.0;
  }

  // No MSDF = full coverage
  if (shape.hasMsdf == 0u) {
    return 1.0;
  }

  // Calculate UV coordinates relative to shape bounds
  let u = (x - shape.x) / shape.width;
  let v = (y - shape.y) / shape.height;
  let uv = vec2<f32>(u, v);

  // Sample MSDF texture
  var msd: vec3<f32>;
  if (shape.msdfArrayIndex == 0u) {
    msd = textureSampleLevel(msdfArraySmall, msdfSampler, uv, i32(shape.msdfLayerIndex), 0.0).rgb;
  } else {
    msd = textureSampleLevel(msdfArrayLarge, msdfSampler, uv, i32(shape.msdfLayerIndex), 0.0).rgb;
  }

  // MSDF median for signed distance
  let sd = max(min(msd.r, msd.g), min(max(msd.r, msd.g), msd.b)) - 0.5;

  // Calculate screen-space pixel range
  let texSize = vec2<f32>(shape.texWidth, shape.texHeight);
  let shapeScreenSize = vec2<f32>(shape.width, shape.height);
  let unitRange = vec2<f32>(params.msdfPxRange) / texSize;
  let screenPxRangeVal = max(0.5 * dot(unitRange, shapeScreenSize), 1.0);

  // Scale signed distance by screen pixel range
  let screenPxDist = screenPxRangeVal * sd;

  // Hard mask with smooth AA at edges
  return smoothstep(-0.5, 0.5, screenPxDist);
}

/**
 * Get alpha value for a texture shape.
 *
 * @param shape - Texture shape definition
 * @param x - Pixel X coordinate
 * @param y - Pixel Y coordinate
 * @returns Alpha value (0-1), or 1.0 if no alpha texture
 */
fn getTextureAlphaValue(shape: TextureShape, x: f32, y: f32) -> f32 {
  // Check if within bounding box
  if (x < shape.x || x >= shape.x + shape.width ||
      y < shape.y || y >= shape.y + shape.height) {
    return 0.0;
  }

  // No alpha = full intensity
  if (shape.hasAlpha == 0u) {
    return 1.0;
  }

  // Calculate UV coordinates relative to shape bounds
  let u = (x - shape.x) / shape.width;
  let v = (y - shape.y) / shape.height;
  let uv = vec2<f32>(u, v);

  // Sample alpha texture
  if (shape.alphaArrayIndex == 0u) {
    return textureSampleLevel(alphaArraySmall, msdfSampler, uv, i32(shape.alphaLayerIndex), 0.0).r;
  } else {
    return textureSampleLevel(alphaArrayLarge, msdfSampler, uv, i32(shape.alphaLayerIndex), 0.0).r;
  }
}

// ============================================================
// Texture Palette Sampling
// ============================================================

/**
 * Sample all texture properties at wavelength from packed RGB palette array.
 * Uses texture array layer indexing for unlimited texture materials.
 * Returns vec3: x=transmission, y=emission, z=reflection
 *
 * @param paletteIndex - Array layer index (texture material index)
 * @param wavelengthNm - Wavelength in nanometers
 */
fn sampleTexturePalette(paletteIndex: u32, wavelengthNm: f32) -> vec3<f32> {
  // U coordinate: wavelength position (0-1)
  let u = (wavelengthNm - params.wavelengthMin) / (params.wavelengthMax - params.wavelengthMin);
  // V coordinate: center of single-row texture
  let v = 0.5;
  let uv = vec2<f32>(u, v);

  if (params.sampleCount > 32u) {
    // High-res array for spectrum mode
    return textureSampleLevel(texturePaletteArray, materialSampler, uv, i32(paletteIndex), 0.0).rgb;
  } else {
    // Low-res array for rendering mode
    return textureSampleLevel(renderTexturePaletteArray, materialSampler, uv, i32(paletteIndex), 0.0).rgb;
  }
}

/**
 * Sample texture transmission at wavelength.
 *
 * @param paletteIndex - Index into texture palette
 * @param wavelengthNm - Wavelength in nanometers
 * @returns Transmission coefficient (0-1)
 */
fn getTextureTransmission(paletteIndex: u32, wavelengthNm: f32) -> f16 {
  return f16(sampleTexturePalette(paletteIndex, wavelengthNm).r);
}

/**
 * Sample texture emission at wavelength.
 *
 * @param paletteIndex - Index into texture palette
 * @param wavelengthNm - Wavelength in nanometers
 * @returns Emission intensity (can be > 1.0 for HDR)
 */
fn getTextureEmission(paletteIndex: u32, wavelengthNm: f32) -> f16 {
  return f16(sampleTexturePalette(paletteIndex, wavelengthNm).g);
}

/**
 * Sample texture reflection at wavelength.
 *
 * @param paletteIndex - Index into texture palette
 * @param wavelengthNm - Wavelength in nanometers
 * @returns Reflection coefficient (0-1)
 */
fn getTextureReflection(paletteIndex: u32, wavelengthNm: f32) -> f16 {
  return f16(sampleTexturePalette(paletteIndex, wavelengthNm).b);
}

// ============================================================
// Texture Physics Computation
// ============================================================

/**
 * Apply texture shapes to light at a pixel.
 *
 * Processes all texture shapes at the current layer:
 * - Transmission: multiplicative (absorbs light)
 * - Emission: additive (adds light)
 * - Reflection: additive (accumulated for ambient reflection)
 *
 * @param inputLight - Light intensity after material processing (includes material reflection)
 * @param wavelength - Wavelength in nm
 * @param fx - Pixel X coordinate
 * @param fy - Pixel Y coordinate
 * @param currentLayer - Layer being processed
 * @returns TexturePhysicsResult with output light and reflection factor
 */
fn applyTextureShapes(
  inputLight: f16,
  wavelength: f32,
  fx: f32,
  fy: f32,
  currentLayer: u32
) -> TexturePhysicsResult {
  var result: TexturePhysicsResult;

  // Accumulate effects from all texture shapes
  var totalTransmission: f16 = f16(1.0);  // Multiplicative
  var totalEmission: f16 = f16(0.0);      // Additive
  var totalReflection: f16 = f16(0.0);    // Additive

  let numShapes = arrayLength(&textureShapes);

  for (var i: u32 = 0u; i < numShapes; i++) {
    let shape = textureShapes[i];

    // Skip shapes not in current layer
    if (shape.layer != currentLayer) {
      continue;
    }

    // Get mask = MSDF coverage × alpha
    let coverage = getTextureMsdfCoverage(shape, fx, fy);
    let alpha = getTextureAlphaValue(shape, fx, fy);
    let mask = f16(coverage * alpha);

    if (mask > f16(0.0)) {
      // Sample spectral properties
      let trans = getTextureTransmission(shape.transmissionIndex, wavelength);
      let emit = getTextureEmission(shape.emissionIndex, wavelength);
      let refl = getTextureReflection(shape.reflectionIndex, wavelength);

      // Transmission: multiplicative with mix() for partial coverage
      // mix(1.0, transmission, mask) ensures smooth transition at edges
      let effectiveTrans = mix(f16(1.0), trans, mask);
      totalTransmission *= effectiveTrans;

      // Emission: additive, modulated by mask
      totalEmission += emit * mask;

      // Reflection: additive, modulated by mask
      totalReflection += refl * mask;
    }
  }

  // Apply transmission to input light (includes material transmission + reflection)
  // Add emission to output
  result.output = inputLight * totalTransmission + totalEmission;
  result.reflection = totalReflection;

  return result;
}

/**
 * Check if any texture shapes exist at the current layer.
 *
 * @param currentLayer - Layer being processed
 * @returns true if at least one texture shape exists at this layer
 */
fn hasTextureShapesAtLayer(currentLayer: u32) -> bool {
  let numShapes = arrayLength(&textureShapes);

  for (var i: u32 = 0u; i < numShapes; i++) {
    if (textureShapes[i].layer == currentLayer) {
      return true;
    }
  }

  return false;
}

/**
 * Check if any texture shapes exist.
 *
 * @returns true if at least one texture shape exists
 */
fn hasTextureShapes() -> bool {
  return arrayLength(&textureShapes) > 0u;
}

