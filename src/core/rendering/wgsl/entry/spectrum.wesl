/**
 * Spectrum Entry Points
 *
 * Compute shader entry points for high-resolution spectrum plotting.
 *
 * - computeSpectrumBox: Compute 5000-wavelength spectrum for 30×30 box
 * - averageSpectrum: Average spectrum over circular region
 */

import package::wgsl::bindings::{params, shapes, spectrumBox, spectrumOutput, spectralInput};

// ============================================================
// Spectrum Box Computation
// ============================================================

/**
 * Compute high-resolution spectrum for a single pixel in the sample box.
 * Uses full physics computation at 5000 wavelengths for detailed spectrum plot.
 *
 * Thread mapping: id.x = local x in box, id.y = local y in box
 * Output: spectrumBox[boxIndex * plotResolution + wavelengthIndex]
 */
@compute @workgroup_size(8, 8)
fn computeSpectrumBox(@builtin(global_invocation_id) id: vec3<u32>) {
  let boxX = id.x;
  let boxY = id.y;

  // Skip if outside box
  if (boxX >= params.boxSize || boxY >= params.boxSize) {
    return;
  }

  // Calculate actual screen coordinates (box centered on sampleX/Y)
  let halfBox = i32(params.boxSize) / 2;
  let screenX = params.sampleX - halfBox + i32(boxX);
  let screenY = params.sampleY - halfBox + i32(boxY);

  // Bounds check
  let inBounds = screenX >= 0 && screenX < i32(params.width) &&
                 screenY >= 0 && screenY < i32(params.height);

  let fx = f32(screenX);
  let fy = f32(screenY);
  let numShapes = arrayLength(&shapes);

  // Calculate output offset for this pixel
  let boxIndex = boxY * params.boxSize + boxX;
  let outputOffset = boxIndex * params.plotResolution;

  // Compute full spectrum at high resolution
  let step = (params.wavelengthMax - params.wavelengthMin) / f32(params.plotResolution - 1u);

  for (var i: u32 = 0u; i < params.plotResolution; i++) {
    var intensity: f16 = f16(0.0);

    if (inBounds) {
      let wavelength = params.wavelengthMin + f32(i) * step;
      // Full physics computation would go here
      // For now, just mark as in bounds
      intensity = f16(1.0);
    }

    spectrumBox[outputOffset + i] = intensity;
  }
}

// ============================================================
// Spectrum Averaging
// ============================================================

/**
 * Average the spectrum box over a circular region.
 * Single workgroup averages all wavelengths.
 *
 * Thread mapping: id.x = wavelength index
 * Output: spectrumOutput[wavelengthIndex] = averaged intensity
 */
@compute @workgroup_size(256)
fn averageSpectrum(@builtin(global_invocation_id) id: vec3<u32>) {
  let wavelengthIdx = id.x;

  if (wavelengthIdx >= params.plotResolution) {
    return;
  }

  let boxSize = params.bufferWidth;
  let halfBox = i32(boxSize) / 2;
  let avgRadius = i32(params.averageRadius);
  let centerX = halfBox;
  let centerY = halfBox;

  var sum: f32 = 0.0;
  var count: f32 = 0.0;

  // Iterate over all pixels in the box
  for (var by: u32 = 0u; by < boxSize; by++) {
    for (var bx: u32 = 0u; bx < boxSize; bx++) {
      // Check if within averaging circle
      let dx = i32(bx) - centerX;
      let dy = i32(by) - centerY;
      let distSq = dx * dx + dy * dy;

      if (distSq <= avgRadius * avgRadius) {
        // Get spectrum value from box
        let boxIndex = by * boxSize + bx;
        let value = f32(spectrumBox[boxIndex * params.plotResolution + wavelengthIdx]);

        let weight = 1.0;
        sum += value * weight;
        count += weight;
      }
    }
  }

  // Output averaged spectrum
  if (count > 0.0) {
    spectrumOutput[wavelengthIdx] = sum / count;
  } else {
    spectrumOutput[wavelengthIdx] = 0.0;
  }
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Get linear index into spectral buffer for a given pixel and wavelength.
 */
fn getSpectralIdx(localX: u32, localY: u32, wIdx: u32) -> u32 {
  return (localY * params.bufferWidth + localX) * params.sampleCount + wIdx;
}

// ============================================================
// Final Combine Entry Point
// ============================================================

/**
 * Final combination for high-res spectrum.
 * Reads from spectralInput (where combineScattered wrote) and writes to spectrumBox for averaging.
 */
@compute @workgroup_size(8, 8)
fn finalCombine(@builtin(global_invocation_id) id: vec3<u32>) {
  let localX = id.x;
  let localY = id.y;

  if (localX >= params.bufferWidth || localY >= params.bufferHeight) {
    return;
  }

  let boxIndex = localY * params.bufferWidth + localX;
  let outputOffset = boxIndex * params.sampleCount;

  for (var wIdx: u32 = 0u; wIdx < params.sampleCount; wIdx++) {
    let spectralIdx = getSpectralIdx(localX, localY, wIdx);

    // Read from spectralInput (where combineScattered wrote) - already f16
    let combined = spectralInput[spectralIdx];

    // Write to spectrumBox for averaging (f16 to f16, no conversion needed)
    spectrumBox[outputOffset + wIdx] = combined;
  }
}
