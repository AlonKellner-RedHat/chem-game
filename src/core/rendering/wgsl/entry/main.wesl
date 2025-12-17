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
// DEBUG: Color band visualization for GPU values
// ============================================================
// Set to 1 to enable debug mode, 0 for normal rendering
const DEBUG_MODE: u32 = 1u;
const DEBUG_BAND_HEIGHT: u32 = 15u;  // Height of each debug band in pixels

/// Convert a value to a debug color using bands
/// Each 10-pixel vertical band shows a different value range
fn valueToDebugColor(value: f32, bandIndex: u32) -> vec3<f32> {
  // Color scheme for different value ranges:
  // Band 0: numShapes (cyan scale)
  // Band 1: bg-base coverage (red scale)
  // Band 2: bg-grid coverage (green scale)
  // Band 3: bg-grid alpha (blue scale)
  // Band 4: ambientPattern (yellow scale)
  // Band 5: shape.hasMsdf for bg-grid (magenta if 1, black if 0)
  // Band 6: shape.hasAlpha for bg-grid (cyan if 1, black if 0)
  // Band 7: totalReflection computed (white scale)
  
  if (bandIndex == 0u) {
    // numShapes: 0=black, 1=dark cyan, 2=cyan, 3+=bright cyan
    let v = clamp(value / 3.0, 0.0, 1.0);
    return vec3<f32>(0.0, v, v);
  } else if (bandIndex == 1u) {
    // bg-base coverage: 0=black, 1=red
    return vec3<f32>(value, 0.0, 0.0);
  } else if (bandIndex == 2u) {
    // bg-grid coverage: 0=black, 1=green
    return vec3<f32>(0.0, value, 0.0);
  } else if (bandIndex == 3u) {
    // bg-grid alpha: 0=black, 1=blue
    return vec3<f32>(0.0, 0.0, value);
  } else if (bandIndex == 4u) {
    // ambientPattern: 0=black, 1=yellow
    return vec3<f32>(value, value, 0.0);
  } else if (bandIndex == 5u) {
    // hasMsdf flag: 0=black, 1=magenta
    if (value > 0.5) {
      return vec3<f32>(1.0, 0.0, 1.0);
    } else {
      return vec3<f32>(0.0, 0.0, 0.0);
    }
  } else if (bandIndex == 6u) {
    // hasAlpha flag: 0=black, 1=cyan
    if (value > 0.5) {
      return vec3<f32>(0.0, 1.0, 1.0);
    } else {
      return vec3<f32>(0.0, 0.0, 0.0);
    }
  } else if (bandIndex == 7u) {
    // totalReflection: 0=black, 1=white
    return vec3<f32>(value, value, value);
  } else {
    // Fallback: gray
    return vec3<f32>(0.5, 0.5, 0.5);
  }
}

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
 * DEBUG MODE: When DEBUG_MODE == 1u, the top portion of the screen
 * shows color-coded diagnostic bands:
 * - Band 0 (y=0-14): numShapes (cyan scale, 0-3)
 * - Band 1 (y=15-29): bg-base coverage (red scale, 0-1)
 * - Band 2 (y=30-44): bg-grid coverage (green scale, 0-1)
 * - Band 3 (y=45-59): bg-grid alpha (blue scale, 0-1)
 * - Band 4 (y=60-74): ambientPattern (yellow scale, 0-1)
 * - Band 5 (y=75-89): bg-grid hasMsdf flag (magenta=1, black=0)
 * - Band 6 (y=90-104): bg-grid hasAlpha flag (cyan=1, black=0)
 * - Band 7 (y=105-119): computed totalReflection (white scale, 0-1)
 */
@compute @workgroup_size(8, 8)
fn integrateSpectrum(@builtin(global_invocation_id) id: vec3<u32>) {
  let x = id.x;
  let y = id.y;

  if (x >= params.width || y >= params.height) {
    return;
  }

  let pixelIndex = y * params.width + x;

  // Pass 1: Normalize
  if (params.isNormalizationPass == 1u) {
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
  // DEBUG MODE: Output color bands for GPU value inspection
  // ============================================================
  if (DEBUG_MODE == 1u && y < DEBUG_BAND_HEIGHT * 8u) {
    let bandIndex = y / DEBUG_BAND_HEIGHT;
    let fx = f32(x);
    let fy = f32(y);
    
    let numShapes = arrayLength(&shapes);
    var debugValue: f32 = 0.0;
    
    // Compute values based on band
    if (bandIndex == 0u) {
      // Band 0: numShapes
      debugValue = f32(numShapes);
    } else if (bandIndex == 1u) {
      // Band 1: bg-base coverage (shape 0)
      if (numShapes > 0u) {
        debugValue = getMsdfCoverage(shapes[0], fx, fy);
      }
    } else if (bandIndex == 2u) {
      // Band 2: bg-grid coverage (shape 1)
      if (numShapes > 1u) {
        debugValue = getMsdfCoverage(shapes[1], fx, fy);
      }
    } else if (bandIndex == 3u) {
      // Band 3: bg-grid alpha (shape 1)
      if (numShapes > 1u) {
        debugValue = getAlphaValue(shapes[1], fx, fy);
      }
    } else if (bandIndex == 4u) {
      // Band 4: ambientPattern
      debugValue = f32(getAmbientPattern(fx, fy));
    } else if (bandIndex == 5u) {
      // Band 5: bg-grid hasMsdf flag
      if (numShapes > 1u) {
        debugValue = f32(shapes[1].hasMsdf);
      }
    } else if (bandIndex == 6u) {
      // Band 6: bg-grid hasAlpha flag
      if (numShapes > 1u) {
        debugValue = f32(shapes[1].hasAlpha);
      }
    } else if (bandIndex == 7u) {
      // Band 7: totalReflection (simulate the ambient loop)
      var totalRefl: f32 = 1.0;
      for (var i: u32 = 0u; i < numShapes; i++) {
        let shape = shapes[i];
        let coverage = getMsdfCoverage(shape, fx, fy);
        let isFullCoverage = (shape.hasMsdf == 0u && shape.hasAlpha == 0u);
        if (coverage > 0.0 || isFullCoverage) {
          // Simulate 100% reflection for shape 0, 60% for shape 1
          let materialRefl = select(0.6, 1.0, i == 0u);
          totalRefl *= materialRefl;
        }
      }
      debugValue = totalRefl;
    }
    
    let debugColor = valueToDebugColor(debugValue, bandIndex);
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
