/**
 * Ambient Light and Pattern Rendering
 *
 * Handles ambient light reflection and spatial patterns.
 *
 * Ambient Light:
 * - Synced with background mode (same spectral distribution)
 * - Reflected by material surfaces (not transmitted)
 * - Uses diagonal-circle-grid pattern for spatial variation
 */

import package::wgsl::constants::{VISIBLE_MIN, VISIBLE_MAX};
import package::wgsl::bindings::{params, msdfArrayLarge, msdfSampler};
import package::wgsl::physics::background::getBackgroundIntensity;
import package::wgsl::rendering::msdf::msdfMedian;

// ============================================================
// Ambient Pattern
// ============================================================

/**
 * Sample ambient pattern from MSDF texture (diagonal-circle-grid).
 *
 * Returns 0-1 coverage value based on position.
 * Uses diagonal-circle-grid from the large texture array for spatial variation.
 * Pattern scales responsively to fit the current screen size.
 *
 * @param x - Screen X coordinate
 * @param y - Screen Y coordinate
 * @returns Pattern coverage (0.6-1.0)
 */
fn getAmbientPattern(x: f32, y: f32) -> f16 {
  // Base texture size for diagonal-circle-grid (1280x720)
  let texWidth = 1280.0;
  let texHeight = 720.0;

  // Compute UV coordinates that scale to full screen (responsive)
  let u = x / f32(params.width);
  let v = y / f32(params.height);
  let uv = vec2<f32>(u, v);

  // Sample MSDF texture from large array (index 1), layer 0 (diagonal-circle-grid)
  let msd = textureSampleLevel(msdfArrayLarge, msdfSampler, uv, 0i, 0.0).rgb;

  // Get signed distance
  let sd = msdfMedian(msd) - 0.5;

  // Calculate screen-space coverage with soft edge
  let texSize = vec2<f32>(texWidth, texHeight);
  let screenSize = vec2<f32>(f32(params.width), f32(params.height));
  let screenPxRange = max(params.msdfPxRange * (screenSize.x / texSize.x), 1.0);

  // Compute coverage with anti-aliased edge
  let screenDist = sd * screenPxRange;
  let coverage = clamp(screenDist + 0.5, 0.0, 1.0);

  // Map to ambient light contribution: inside circles = 0.6, outside = 1.0
  return f16(1.0 - 0.4 * coverage);
}

// ============================================================
// Ambient Light Intensity
// ============================================================

/**
 * Get ambient light intensity at wavelength.
 *
 * Uses same distribution as background - they are synced.
 * Returns f16 for memory efficiency.
 *
 * @param wavelengthNm - Wavelength in nanometers
 * @returns Ambient intensity as f16
 */
fn getAmbientIntensity(wavelengthNm: f32) -> f16 {
  return f16(getBackgroundIntensity(wavelengthNm));
}
