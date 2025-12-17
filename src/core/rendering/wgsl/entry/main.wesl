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

  // ============================================================
  // DEBUG MODE: Full-screen solid color diagnostic
  // ============================================================
  if (DEBUG_MODE == 1u) {
    let numBands = 8u;
    let bandHeight = params.height / numBands;
    let bandIndex = y / bandHeight;
    
    let numShapes = arrayLength(&shapes);
    var debugColor: vec3<f32> = COLOR_GRAY;
    
    // Use center of screen for consistent sampling
    let sampleX = f32(params.width / 2u);
    let sampleY = f32(params.height / 2u);
    
    // LEFT half: sample at (100, center_y) - likely outside circle
    // RIGHT half: sample at (center_x, center_y) - may be inside circle
    let isRightHalf = x >= params.width / 2u;
    let fx = select(100.0, sampleX, isRightHalf);
    let fy = sampleY;
    
    if (bandIndex == 0u) {
      // Band 0: numShapes count
      // BLACK=0, RED=1, GREEN=2, BLUE=3, YELLOW=4, CYAN=5+
      if (numShapes == 0u) {
        debugColor = COLOR_BLACK;
      } else if (numShapes == 1u) {
        debugColor = COLOR_RED;
      } else if (numShapes == 2u) {
        debugColor = COLOR_GREEN;
      } else if (numShapes == 3u) {
        debugColor = COLOR_BLUE;
      } else if (numShapes == 4u) {
        debugColor = COLOR_YELLOW;
      } else {
        debugColor = COLOR_CYAN;
      }
    } else if (bandIndex == 1u) {
      // Band 1: bg-base (shape[0]) coverage
      // BLACK=0 or no shape, WHITE=1
      if (numShapes > 0u) {
        let cov = getMsdfCoverage(shapes[0], fx, fy);
        debugColor = select(COLOR_BLACK, COLOR_WHITE, cov > 0.5);
      } else {
        debugColor = COLOR_PURPLE; // Error: no shapes
      }
    } else if (bandIndex == 2u) {
      // Band 2: bg-grid (shape[1]) MSDF coverage
      // BLACK=0, GREEN=1 (should show pattern if circles work)
      if (numShapes > 1u) {
        let cov = getMsdfCoverage(shapes[1], fx, fy);
        debugColor = select(COLOR_BLACK, COLOR_GREEN, cov > 0.5);
      } else {
        debugColor = COLOR_PURPLE; // Error: only 1 shape
      }
    } else if (bandIndex == 3u) {
      // Band 3: bg-grid (shape[1]) alpha value
      // BLACK=0, BLUE=1
      if (numShapes > 1u) {
        let alpha = getAlphaValue(shapes[1], fx, fy);
        debugColor = select(COLOR_BLACK, COLOR_BLUE, alpha > 0.5);
      } else {
        debugColor = COLOR_PURPLE;
      }
    } else if (bandIndex == 4u) {
      // Band 4: ambientPattern value
      // BLACK=low, YELLOW=high
      let pattern = f32(getAmbientPattern(fx, fy));
      debugColor = select(COLOR_BLACK, COLOR_YELLOW, pattern > 0.5);
    } else if (bandIndex == 5u) {
      // Band 5: shape[1].hasMsdf flag
      // BLACK=0, MAGENTA=1
      if (numShapes > 1u) {
        debugColor = select(COLOR_BLACK, COLOR_MAGENTA, shapes[1].hasMsdf == 1u);
      } else {
        debugColor = COLOR_PURPLE;
      }
    } else if (bandIndex == 6u) {
      // Band 6: shape[1].hasAlpha flag
      // BLACK=0, CYAN=1
      if (numShapes > 1u) {
        debugColor = select(COLOR_BLACK, COLOR_CYAN, shapes[1].hasAlpha == 1u);
      } else {
        debugColor = COLOR_PURPLE;
      }
    } else if (bandIndex == 7u) {
      // Band 7: shape[1].width (should be ~869)
      // BLACK=0, RED=1-99, ORANGE=100-499, YELLOW=500-999, WHITE=1000+
      if (numShapes > 1u) {
        let w = shapes[1].width;
        if (w < 1.0) {
          debugColor = COLOR_BLACK;
        } else if (w < 100.0) {
          debugColor = COLOR_RED;
        } else if (w < 500.0) {
          debugColor = COLOR_ORANGE;
        } else if (w < 1000.0) {
          debugColor = COLOR_YELLOW;
        } else {
          debugColor = COLOR_WHITE;
        }
      } else {
        debugColor = COLOR_PURPLE;
      }
    }
    
    // Add vertical separator line between left/right halves
    if (x == params.width / 2u || x == params.width / 2u + 1u) {
      debugColor = COLOR_GRAY;
    }
    
    // Add horizontal separator lines between bands
    if (y % bandHeight < 2u) {
      debugColor = COLOR_GRAY;
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
