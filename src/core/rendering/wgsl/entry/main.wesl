/**
 * Main Entry Points
 *
 * Primary compute shader entry points for color rendering.
 *
 * Two-pass rendering:
 * - Pass 0: Compute XYZ from spectral buffer, track max intensity
 * - Pass 1: Normalize stored XYZ by global max, convert to RGB
 */

import package::wgsl::constants::SPECTRAL_SAMPLES;
import package::wgsl::structs::Params;
import package::wgsl::bindings::{params, shapes, spectralInput, rgbOutput, maxPerPixel};
import package::wgsl::rendering::color::{getCIE, xyzToLinearRGB, gammaCorrect};
import package::wgsl::rendering::msdf::{getMsdfCoverage, getAlphaValue};
import package::wgsl::rendering::ambient::getAmbientPattern;
import package::wgsl::physics::materials::getMaterialReflection;

// ============================================================
// DEBUG: Full-screen color band visualization for GPU values
// ============================================================
// Set to 1 to enable debug mode, 0 for normal rendering
const DEBUG_MODE: u32 = 1u;

// Distinct colors for easy identification (no gradients!)
const COLOR_BLACK: vec3<f32> = vec3<f32>(0.0, 0.0, 0.0);
const COLOR_WHITE: vec3<f32> = vec3<f32>(1.0, 1.0, 1.0);
const COLOR_RED: vec3<f32> = vec3<f32>(1.0, 0.0, 0.0);
const COLOR_GREEN: vec3<f32> = vec3<f32>(0.0, 1.0, 0.0);
const COLOR_BLUE: vec3<f32> = vec3<f32>(0.0, 0.0, 1.0);
const COLOR_YELLOW: vec3<f32> = vec3<f32>(1.0, 1.0, 0.0);
const COLOR_CYAN: vec3<f32> = vec3<f32>(0.0, 1.0, 1.0);
const COLOR_MAGENTA: vec3<f32> = vec3<f32>(1.0, 0.0, 1.0);
const COLOR_ORANGE: vec3<f32> = vec3<f32>(1.0, 0.5, 0.0);
const COLOR_PURPLE: vec3<f32> = vec3<f32>(0.5, 0.0, 1.0);
const COLOR_GRAY: vec3<f32> = vec3<f32>(0.5, 0.5, 0.5);

// ============================================================
// Helper: Get Wavelength for Index
// ============================================================

/**
 * Get wavelength for a given spectral sample index.
 * Uses full range (100-1000nm) from params.
 */
fn getWavelengthForIndex(idx: u32) -> f32 {
  return params.wavelengthMin + (params.wavelengthMax - params.wavelengthMin) * f32(idx) / f32(SPECTRAL_SAMPLES - 1u);
}

/**
 * Get spectral buffer index for a pixel and wavelength.
 */
fn getSpectralIndex(x: u32, y: u32, wavelengthIdx: u32) -> u32 {
  return (y * params.width + x) * SPECTRAL_SAMPLES + wavelengthIdx;
}

/**
 * Interpolate from the spectral buffer to get intensity at any wavelength.
 */
fn interpolateSpectralBuffer(x: u32, y: u32, wavelength: f32) -> f32 {
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

  // Linear interpolation
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
// Main Entry Point
// ============================================================

/**
 * Main compute shader entry point for color rendering.
 *
 * Two-pass rendering for global normalization:
 * - Pass 0: Compute XYZ, track max intensity per pixel
 * - Pass 1: Normalize stored XYZ by global max, convert to RGB
 */
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x;
  let y = id.y;

  if (x >= params.width || y >= params.height) {
    return;
  }

  let pixelIndex = y * params.width + x;

  // Pass 1: Normalize and convert to RGB
  if (params.isNormalizationPass == 1u) {
    let stored = rgbOutput[pixelIndex];
    var xyz = stored.xyz;

    let globalMax = max(params.globalMaxIntensity, 0.001);
    xyz = xyz / globalMax;

    // Convert to sRGB
    var rgb = xyzToLinearRGB(xyz);
    rgb.x = clamp(gammaCorrect(rgb.x), 0.0, 1.0);
    rgb.y = clamp(gammaCorrect(rgb.y), 0.0, 1.0);
    rgb.z = clamp(gammaCorrect(rgb.z), 0.0, 1.0);

    rgbOutput[pixelIndex] = vec4<f32>(rgb, 1.0);
    return;
  }

  // Pass 0: Integrate spectral buffer to XYZ
  let dLambda = (params.wavelengthMax - params.wavelengthMin) / f32(SPECTRAL_SAMPLES - 1u);
  var xyz = vec3<f32>(0.0, 0.0, 0.0);
  var maxIntensity: f32 = 0.0;

  for (var i: u32 = 0u; i < SPECTRAL_SAMPLES; i++) {
    let wavelength = getWavelengthForIndex(i);
    let intensity = interpolateSpectralBuffer(x, y, wavelength);

    maxIntensity = max(maxIntensity, intensity);

    // getCIE returns 0 for UV/IR, so only visible contributes
    let cie = getCIE(wavelength);
    xyz += intensity * cie * dLambda;
  }

  // Store unnormalized XYZ
  rgbOutput[pixelIndex] = vec4<f32>(xyz, maxIntensity);
  maxPerPixel[pixelIndex] = xyz.y; // Luminance for global max
}

// ============================================================
// Integrate Spectrum Entry Point
// ============================================================

/**
 * Integrate the final spectral buffer to XYZ and convert to RGB.
 * Reads from spectralInput (final blurred result).
 * 
 * DEBUG MODE: Full-screen diagnostic with solid colors.
 * Screen is divided into 8 horizontal bands.
 * Each band is split into LEFT half (outside circles) and RIGHT half (inside circles).
 * 
 * BAND LEGEND (top to bottom):
 * Band 0: numShapes - BLACK=0, RED=1, GREEN=2, BLUE=3+
 * Band 1: bg-base (shape[0]) coverage - BLACK=0, WHITE=1
 * Band 2: bg-grid (shape[1]) coverage - BLACK=0, GREEN=has pattern
 * Band 3: bg-grid (shape[1]) alpha - BLACK=0, BLUE=has alpha
 * Band 4: ambientPattern - BLACK=0, YELLOW=1
 * Band 5: shape[1].hasMsdf - BLACK=0, MAGENTA=1
 * Band 6: shape[1].hasAlpha - BLACK=0, CYAN=1  
 * Band 7: shape[1].width - BLACK=0, ORANGE=>0, WHITE=>100
 */
@compute @workgroup_size(8, 8)
fn integrateSpectrum(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x;
  let y = id.y;

  if (x >= params.width || y >= params.height) {
    return;
  }

  let pixelIndex = y * params.width + x;

  // Pass 1: Skip in debug mode, just copy
  if (params.isNormalizationPass == 1u) {
    if (DEBUG_MODE == 1u) {
      // In debug mode, colors are already set - just pass through
      return;
    }
    let xyz = rgbOutput[pixelIndex].xyz;
    let globalMax = params.globalMaxIntensity;

    var normalizedXyz = xyz;
    if (globalMax > 0.001) {
      normalizedXyz = xyz / globalMax;
    }

    var rgb = xyzToLinearRGB(normalizedXyz);
    rgb.x = clamp(gammaCorrect(rgb.x), 0.0, 1.0);
    rgb.y = clamp(gammaCorrect(rgb.y), 0.0, 1.0);
    rgb.z = clamp(gammaCorrect(rgb.z), 0.0, 1.0);

    rgbOutput[pixelIndex] = vec4<f32>(rgb, 1.0);
    return;
  }

  // DEBUG: Show ambient pattern directly at EACH PIXEL
  // This checks if getAmbientPattern() returns varying values
  if (DEBUG_MODE == 1u) {
    let fx = f32(x);
    let fy = f32(y);
    
    // Color band by row to show different debug info
    let bandHeight = params.height / 4u;
    let bandIndex = y / bandHeight;
    
    var debugColor = vec3<f32>(0.0, 0.0, 0.0);
    
    if (bandIndex == 0u) {
      // Band 0: getAmbientPattern as grayscale (0.6 inside circles, 1.0 outside)
      let pattern = f32(getAmbientPattern(fx, fy));
      debugColor = vec3<f32>(pattern, pattern, pattern);
    } else if (bandIndex == 1u) {
      // Band 1: Is pattern < 0.8? GREEN (inside circle) vs WHITE (outside)
      let pattern = f32(getAmbientPattern(fx, fy));
      debugColor = select(COLOR_WHITE, COLOR_GREEN, pattern < 0.8);
    } else if (bandIndex == 2u) {
      // Band 2: bg-grid (shape[1]) MSDF coverage - BLACK=0 (outside), GREEN=1 (inside)
      if (arrayLength(&shapes) > 1u) {
        let coverage = getMsdfCoverage(shapes[1], fx, fy);
        debugColor = select(COLOR_BLACK, COLOR_GREEN, coverage > 0.5);
      } else {
        debugColor = COLOR_PURPLE;
      }
    } else {
      // Band 3: Raw spectral intensity
      let spectralIdx = getSpectralIndex(x, y, 8u);
      let intensity = f32(spectralInput[spectralIdx]);
      debugColor = vec3<f32>(intensity, intensity, intensity);
    }
    
    rgbOutput[pixelIndex] = vec4<f32>(debugColor, 1.0);
    maxPerPixel[pixelIndex] = 1.0;
    return;
  }

  // Pass 0: Integrate spectrum to XYZ
  let dLambda = (params.wavelengthMax - params.wavelengthMin) / f32(SPECTRAL_SAMPLES - 1u);
  var xyz = vec3<f32>(0.0, 0.0, 0.0);
  var maxIntensity: f32 = 0.0;

  for (var i: u32 = 0u; i < SPECTRAL_SAMPLES; i++) {
    let wavelength = getWavelengthForIndex(i);
    let spectralIdx = getSpectralIndex(x, y, i);
    let intensity = f32(spectralInput[spectralIdx]);

    maxIntensity = max(maxIntensity, intensity);

    let cie = getCIE(wavelength);
    xyz += intensity * cie * dLambda;
  }

  rgbOutput[pixelIndex] = vec4<f32>(xyz, maxIntensity);
  maxPerPixel[pixelIndex] = xyz.y;
}
