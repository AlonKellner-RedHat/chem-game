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
import package::wgsl::bindings::{params, msdfArrayLarge, alphaArrayLarge, msdfSampler};
import package::wgsl::physics::background::getBackgroundIntensity;
import package::wgsl::rendering::msdf::msdfMedian;

// ============================================================
// Ambient Pattern
// ============================================================

/**
 * Get ambient pattern multiplier.
 *
 * Currently returns 1.0 (no pattern modulation).
 * The ambient light intensity is modulated only by getAmbientAlpha().
 *
 * @param x - Screen X coordinate (unused)
 * @param y - Screen Y coordinate (unused)
 * @returns 1.0 (full ambient contribution, modulated by alpha only)
 */
fn getAmbientPattern(x: f32, y: f32) -> f16 {
  // No pattern modulation - ambient light is uniform
  // Alpha gradient (getAmbientAlpha) provides the spatial variation
  return f16(1.0);
}

/**
 * Sample ambient alpha from the diagonal-circle-grid alpha texture.
 *
 * The alpha texture contains gradients that modulate ambient light intensity:
 * - Linear gradient: bright on right (1.0), black on left (0.0)
 * - Radial gradient: bright spot at bottom-left corner
 * - Combined with screen blend for additive light mixing
 *
 * @param x - Screen X coordinate
 * @param y - Screen Y coordinate
 * @returns Alpha value (0.0-1.0) for ambient intensity modulation
 */
fn getAmbientAlpha(x: f32, y: f32) -> f16 {
  // Compute UV coordinates that scale to full screen (responsive)
  let u = x / f32(params.width);
  let v = y / f32(params.height);
  let uv = vec2<f32>(u, v);

  // Sample alpha from diagonal-circle-grid (alphaArrayLarge, layer 0)
  // The alpha texture stores the pre-blended gradient result
  let alpha = textureSampleLevel(alphaArrayLarge, msdfSampler, uv, 0i, 0.0).r;

  return f16(alpha);
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
