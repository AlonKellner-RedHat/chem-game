/**
 * Main Entry Points
 * 
 * Primary compute shader entry points for color rendering.
 * 
 * Two-pass rendering:
 * - Pass 0: Compute XYZ from spectral buffer, track max intensity
 * - Pass 1: Normalize stored XYZ by global max, convert to RGB
 */

import spectral::constants::SPECTRAL_SAMPLES;
import spectral::structs::Params;
import spectral::bindings::{params, spectralInput, rgbOutput, maxPerPixel};
import spectral::rendering::color::{getCIE, xyzToLinearRGB, gammaCorrect};

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

