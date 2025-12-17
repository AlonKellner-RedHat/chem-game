/**
 * Ambient Shape Brightness Sampling
 *
 * Provides ambient light brightness by sampling from ambient shapes.
 * Replaces the hardcoded getAmbientIntensity() with shape-based sampling.
 *
 * Ambient shapes:
 * - Provide the light source brightness that gets reflected by material and texture shapes
 * - Brightness is a scalar (uniform across the spectrum)
 * - Overlap interaction: additive (brightness values sum)
 * - Support MSDF + alpha for spatial variation
 *
 * Note: Uses uniform buffer with fixed max count (8 shapes) to stay within
 * WebGPU's default storage buffer limit of 10.
 */

import package::wgsl::structs::{AmbientShape, MAX_AMBIENT_SHAPES};
import package::wgsl::bindings::{params, ambientShapesUniform, msdfArraySmall, msdfArrayLarge, alphaArraySmall, alphaArrayLarge, msdfSampler};

// ============================================================
// Ambient Shape MSDF/Alpha Sampling
// ============================================================

/**
 * Get MSDF coverage for an ambient shape.
 *
 * @param shape - Ambient shape definition
 * @param x - Pixel X coordinate
 * @param y - Pixel Y coordinate
 * @returns Coverage value (0-1), or 1.0 if no MSDF texture
 */
fn getAmbientMsdfCoverage(shape: AmbientShape, x: f32, y: f32) -> f32 {
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
 * Get alpha value for an ambient shape.
 *
 * @param shape - Ambient shape definition
 * @param x - Pixel X coordinate
 * @param y - Pixel Y coordinate
 * @returns Alpha value (0-1), or 1.0 if no alpha texture
 */
fn getAmbientAlphaValue(shape: AmbientShape, x: f32, y: f32) -> f32 {
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
// Ambient Brightness Accumulation
// ============================================================

/**
 * Get total ambient brightness at a pixel position.
 *
 * Accumulates brightness from all ambient shapes additively.
 * Each shape's contribution is modulated by its mask (MSDF coverage × alpha).
 *
 * @param fx - Pixel X coordinate
 * @param fy - Pixel Y coordinate
 * @returns Total ambient brightness (can be > 1.0 for HDR)
 */
fn getAmbientBrightness(fx: f32, fy: f32) -> f16 {
  var totalBrightness: f32 = 0.0;
  let numShapes = min(ambientShapesUniform.count, MAX_AMBIENT_SHAPES);

  for (var i: u32 = 0u; i < numShapes; i++) {
    let shape = ambientShapesUniform.shapes[i];

    // Get MSDF coverage and alpha value
    let coverage = getAmbientMsdfCoverage(shape, fx, fy);
    let alpha = getAmbientAlphaValue(shape, fx, fy);

    // Combine: mask = coverage × alpha
    let mask = coverage * alpha;

    // Accumulate brightness (additive)
    totalBrightness += shape.brightness * mask;
  }

  return f16(totalBrightness);
}

/**
 * Check if any ambient shapes exist.
 *
 * Useful for backward compatibility - if no ambient shapes,
 * can fall back to legacy getAmbientIntensity().
 *
 * @returns true if at least one ambient shape exists
 */
fn hasAmbientShapes() -> bool {
  return ambientShapesUniform.count > 0u;
}

