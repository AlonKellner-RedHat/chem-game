/**
 * Color Mathematics
 *
 * Implements CIE color matching and XYZ to sRGB conversion.
 *
 * CIE 1931 Color Matching Functions:
 * - x̄(λ), ȳ(λ), z̄(λ) define how spectral power maps to human perception
 * - ȳ(λ) matches human luminous efficiency (peaks at 555nm)
 *
 * XYZ to sRGB:
 * - Standard 3x3 matrix transform
 * - sRGB gamma correction (~2.4)
 */

import package::wgsl::constants::{VISIBLE_MIN, VISIBLE_MAX};
import package::wgsl::bindings::{cieTexture, cieSampler, cieScales};

// ============================================================
// CIE Color Matching Functions
// ============================================================

/**
 * Get CIE color matching function values at wavelength.
 *
 * Returns (x̄, ȳ, z̄) for the given wavelength.
 * Values are zero outside the visible range (380-700nm).
 *
 * @param wavelengthNm - Wavelength in nanometers
 * @returns vec3(x̄, ȳ, z̄)
 */
fn getCIE(wavelengthNm: f32) -> vec3<f32> {
  // Zero outside visible range
  if (wavelengthNm < VISIBLE_MIN || wavelengthNm > VISIBLE_MAX) {
    return vec3<f32>(0.0, 0.0, 0.0);
  }

  // Map wavelength to texture coordinate
  let u = (wavelengthNm - VISIBLE_MIN) / (VISIBLE_MAX - VISIBLE_MIN);
  let uv = vec2<f32>(u, 0.5); // 2D texture with height=1

  // Sample packed CIE texture (R=X, G=Y, B=Z)
  let cie = textureSampleLevel(cieTexture, cieSampler, uv, 0.0).rgb;

  return vec3<f32>(cie.r * cieScales.x, cie.g * cieScales.y, cie.b * cieScales.z);
}

// ============================================================
// XYZ to sRGB Conversion
// ============================================================

/**
 * Convert CIE XYZ to linear RGB.
 *
 * Uses the standard sRGB/D65 matrix:
 *   R = 3.2406×X - 1.5372×Y - 0.4986×Z
 *   G = -0.9689×X + 1.8758×Y + 0.0415×Z
 *   B = 0.0557×X - 0.2040×Y + 1.0570×Z
 *
 * @param xyz - CIE XYZ color
 * @returns Linear RGB (may be out of gamut)
 */
fn xyzToLinearRGB(xyz: vec3<f32>) -> vec3<f32> {
  let r = 3.2406 * xyz.x - 1.5372 * xyz.y - 0.4986 * xyz.z;
  let g = -0.9689 * xyz.x + 1.8758 * xyz.y + 0.0415 * xyz.z;
  let b = 0.0557 * xyz.x - 0.2040 * xyz.y + 1.0570 * xyz.z;
  return vec3<f32>(r, g, b);
}

/**
 * Apply sRGB gamma correction to a single channel.
 *
 * sRGB uses a piecewise function:
 * - Linear for small values: y = 12.92×x
 * - Gamma ~2.4 for larger values: y = 1.055×x^(1/2.4) - 0.055
 *
 * @param linear - Linear intensity (0-1)
 * @returns Gamma-corrected sRGB value (0-1)
 */
fn gammaCorrect(linear: f32) -> f32 {
  if (linear <= 0.0) { return 0.0; }
  if (linear <= 0.0031308) {
    return 12.92 * linear;
  }
  return 1.055 * pow(linear, 1.0 / 2.4) - 0.055;
}

/**
 * Convert XYZ to sRGB with gamma correction.
 *
 * @param xyz - CIE XYZ color
 * @returns sRGB color (clamped to 0-1)
 */
fn xyzToSRGB(xyz: vec3<f32>) -> vec3<f32> {
  var rgb = xyzToLinearRGB(xyz);
  rgb.x = clamp(gammaCorrect(rgb.x), 0.0, 1.0);
  rgb.y = clamp(gammaCorrect(rgb.y), 0.0, 1.0);
  rgb.z = clamp(gammaCorrect(rgb.z), 0.0, 1.0);
  return rgb;
}
