/**
 * Shape Mask Rendering (MSDF + Alpha)
 * 
 * Provides resolution-independent shape rendering with support for:
 * - MSDF (Multi-Channel Signed Distance Field) for sharp edges
 * - Alpha (grayscale) for intensity modulation
 * 
 * MSDF encodes signed distance in RGB channels:
 * - Median of RGB gives true signed distance
 * - 0.5 = edge, >0.5 = inside, <0.5 = outside
 * 
 * Alpha encodes intensity as grayscale:
 * - 0.0 = transparent, 1.0 = opaque
 * 
 * Combination modes:
 * - MSDF only: Sharp edges, alpha = 1.0
 * - Alpha only: All pixels in shape (coverage = 1.0), variable intensity
 * - Both: MSDF defines boundary, alpha modulates intensity (multiply)
 * - Neither: Full coverage with alpha 1.0
 */

import package::wgsl::bindings::{params, msdfArraySmall, msdfArrayLarge, alphaArraySmall, alphaArrayLarge, msdfSampler};
import package::wgsl::structs::Shape;

// ============================================================
// MSDF Sampling Functions
// ============================================================

/**
 * MSDF median function - extracts true signed distance from RGB.
 * 
 * The median of the three channels gives corner-aware distance.
 * This is the key insight of MSDF over single-channel SDF.
 * 
 * @param rgb - RGB values from MSDF texture
 * @returns Signed distance value
 */
fn msdfMedian(rgb: vec3<f32>) -> f32 {
  return max(min(rgb.r, rgb.g), min(max(rgb.r, rgb.g), rgb.b));
}

/**
 * Sample MSDF texture from the appropriate array.
 * 
 * Two arrays exist for different resolutions:
 * - Small (256x256): Basic shapes (circle, rectangle, etc.)
 * - Large (1280x720): Complex patterns (grids)
 * 
 * @param arrayIndex - 0 for small, 1 for large
 * @param layerIndex - Layer within the texture array
 * @param uv - Texture coordinates (0-1)
 * @returns RGB signed distance values
 */
fn sampleMSDFTexture(arrayIndex: u32, layerIndex: u32, uv: vec2<f32>) -> vec3<f32> {
  if (arrayIndex == 0u) {
    return textureSampleLevel(msdfArraySmall, msdfSampler, uv, i32(layerIndex), 0.0).rgb;
  } else {
    return textureSampleLevel(msdfArrayLarge, msdfSampler, uv, i32(layerIndex), 0.0).rgb;
  }
}

/**
 * Sample MSDF and return shape coverage (0.0 = outside, 1.0 = inside).
 * 
 * In compute shaders we can't use fwidth(), so we calculate the screen-space
 * pixel range based on the known shape/texture size relationship.
 * 
 * @param arrayIndex - Which MSDF array (0 = small, 1 = large)
 * @param layerIndex - Layer within the array
 * @param uv - Texture coordinates
 * @param pxRange - MSDF pixel range (typically 4.0)
 * @param texSize - Texture dimensions
 * @param shapeScreenSize - Shape's size in screen pixels
 * @returns Coverage value (0-1)
 */
fn sampleMSDF(
  arrayIndex: u32,
  layerIndex: u32,
  uv: vec2<f32>,
  pxRange: f32,
  texSize: vec2<f32>,
  shapeScreenSize: vec2<f32>
) -> f32 {
  let msd = sampleMSDFTexture(arrayIndex, layerIndex, uv);
  
  // Get signed distance: 0.5 = edge, >0.5 = inside, <0.5 = outside
  let sd = msdfMedian(msd) - 0.5;
  
  // Calculate screen-space pixel range without fwidth()
  // screenPxRange = pxRange * (shapeScreenSize / texSize)
  let unitRange = vec2<f32>(pxRange) / texSize;
  let screenPxRangeVal = max(0.5 * dot(unitRange, shapeScreenSize), 1.0);
  
  // Scale signed distance by screen pixel range
  let screenPxDist = screenPxRangeVal * sd;
  
  // Hard mask with smooth AA at edges
  return smoothstep(-0.5, 0.5, screenPxDist);
}

// ============================================================
// Alpha Sampling Functions
// ============================================================

/**
 * Sample alpha texture from the appropriate array.
 * 
 * Alpha textures are grayscale - we sample the R channel.
 * 
 * @param arrayIndex - 0 for small, 1 for large
 * @param layerIndex - Layer within the texture array
 * @param uv - Texture coordinates (0-1)
 * @returns Alpha value (0-1)
 */
fn sampleAlphaTexture(arrayIndex: u32, layerIndex: u32, uv: vec2<f32>) -> f32 {
  if (arrayIndex == 0u) {
    return textureSampleLevel(alphaArraySmall, msdfSampler, uv, i32(layerIndex), 0.0).r;
  } else {
    return textureSampleLevel(alphaArrayLarge, msdfSampler, uv, i32(layerIndex), 0.0).r;
  }
}

// ============================================================
// Shape Mask Function
// ============================================================

/**
 * Get shape mask value at pixel coordinates.
 * 
 * Combines MSDF (for edges) and alpha (for intensity) based on availability:
 * - If hasMsdf: Use MSDF for edge coverage
 * - If hasAlpha: Multiply by alpha value for intensity
 * - If neither: Return 1.0 (full coverage)
 * 
 * @param shape - Shape definition
 * @param x - Pixel X coordinate
 * @param y - Pixel Y coordinate
 * @returns Combined mask value (0-1)
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
  
  let texSize = vec2<f32>(shape.texWidth, shape.texHeight);
  let shapeScreenSize = vec2<f32>(shape.width, shape.height);
  
  // Get MSDF coverage (1.0 if no MSDF texture)
  var msdfCoverage: f32 = 1.0;
  if (shape.hasMsdf == 1u) {
    msdfCoverage = sampleMSDF(
      shape.msdfArrayIndex,
      shape.msdfLayerIndex,
      uv,
      params.msdfPxRange,
      texSize,
      shapeScreenSize
    );
  }
  
  // Get alpha value (1.0 if no alpha texture)
  var alphaValue: f32 = 1.0;
  if (shape.hasAlpha == 1u) {
    alphaValue = sampleAlphaTexture(
      shape.alphaArrayIndex,
      shape.alphaLayerIndex,
      uv
    );
  }
  
  // Combine: MSDF defines boundary, alpha modulates intensity
  return msdfCoverage * alphaValue;
}

