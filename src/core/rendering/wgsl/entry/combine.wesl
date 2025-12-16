/**
 * Combine Entry Points
 * 
 * Entry points for combining transmitted, scattered, and emitted light.
 * Also handles ambient light application.
 */

import spectral::constants::{SPECTRAL_SAMPLES, IN_SHAPE_SCATTER_FRACTION, AURA_SCATTER_FRACTION};
import spectral::bindings::{
  params, shapes,
  spectralInput, spectralOutput, scatterSource, blurredTransmitted
};
import spectral::physics::scattering::applyScattering;
import spectral::physics::materials::getMaterialReflection;
import spectral::rendering::msdf::getShapeMask;
import spectral::rendering::ambient::{getAmbientPattern, getAmbientIntensity};

// ============================================================
// Helper Functions
// ============================================================

fn getSpectralIdx(localX: u32, localY: u32, wIdx: u32) -> u32 {
  return (localY * params.bufferWidth + localX) * params.sampleCount + wIdx;
}

fn localToScreen(localX: u32, localY: u32) -> vec2<i32> {
  return vec2<i32>(
    i32(localX) + params.coordOffsetX,
    i32(localY) + params.coordOffsetY
  );
}

fn isValidScreenPos(screenPos: vec2<i32>) -> bool {
  return screenPos.x >= 0 && screenPos.x < i32(params.width) &&
         screenPos.y >= 0 && screenPos.y < i32(params.height);
}

fn getWavelength(wIdx: u32) -> f32 {
  return params.wavelengthMin + (params.wavelengthMax - params.wavelengthMin) * f32(wIdx) / f32(params.sampleCount - 1u);
}

/**
 * Compute scatter probability for all shapes at a pixel.
 */
fn computeScatterProb(fx: f32, fy: f32, wavelength: f32, numShapes: u32) -> f32 {
  var unscatteredFrac: f32 = 1.0;
  
  for (var i: u32 = 0u; i < numShapes; i++) {
    let mask = getShapeMask(shapes[i], fx, fy);
    if (mask > 0.0) {
      let shape = shapes[i];
      let pathLength = max(shape.width, shape.height) * 0.01;
      
      let scatterTrans = applyScattering(
        1.0,
        wavelength,
        shape.smallParticleDensity,
        shape.largeParticleDensity,
        pathLength * mask
      );
      
      unscatteredFrac *= scatterTrans;
    }
  }
  
  return 1.0 - unscatteredFrac;
}

// ============================================================
// Combine Scattered Entry Point
// ============================================================

/**
 * Combine transmitted light with scattering and unified aura.
 * 
 * Three-path combination:
 * 1. Direct: transmitted × (1 - scatterProb)
 * 2. In-shape: blurredTransmitted × scatterProb × IN_SHAPE_SCATTER_FRACTION
 * 3. Aura: scatterSource (blurred scatter + emission)
 */
@compute @workgroup_size(8, 8)
fn combineScattered(@builtin(global_invocation_id) id: vec3<u32>) {
  let localX = id.x;
  let localY = id.y;
  
  if (localX >= params.bufferWidth || localY >= params.bufferHeight) {
    return;
  }
  
  let screenPos = localToScreen(localX, localY);
  let inBounds = isValidScreenPos(screenPos);
  let fx = f32(screenPos.x);
  let fy = f32(screenPos.y);
  let numShapes = arrayLength(&shapes);
  
  for (var wIdx: u32 = 0u; wIdx < params.sampleCount; wIdx++) {
    let wavelength = getWavelength(wIdx);
    let spectralIdx = getSpectralIdx(localX, localY, wIdx);
    
    // Read components
    let transmitted = spectralOutput[spectralIdx];
    let blurredFull = blurredTransmitted[spectralIdx];
    let aura = scatterSource[spectralIdx];
    
    // Compute scatter probability
    var scatterProb: f32 = 0.0;
    if (inBounds) {
      scatterProb = computeScatterProb(fx, fy, wavelength, numShapes);
    }
    let scatterProb16 = f16(scatterProb);
    
    // Three-path combination
    let direct = transmitted * (f16(1.0) - scatterProb16);
    let inShapeScatter = blurredFull * scatterProb16 * f16(IN_SHAPE_SCATTER_FRACTION);
    
    var result = direct + inShapeScatter + aura;
    
    // Per-layer ambient reflection
    if (inBounds) {
      let pattern = getAmbientPattern(fx, fy);
      let ambient = getAmbientIntensity(wavelength);
      
      var compoundedReflection: f16 = f16(1.0);
      var maxCoverage: f16 = f16(0.0);
      
      for (var i: u32 = 0u; i < numShapes; i++) {
        let shape = shapes[i];
        if (shape.layer != params.currentLayer) {
          continue;
        }
        
        let mask = getShapeMask(shape, fx, fy);
        if (mask > 0.0) {
          let reflection = getMaterialReflection(shape.materialIndex, wavelength);
          compoundedReflection *= reflection;
          maxCoverage = max(maxCoverage, f16(mask));
        }
      }
      
      if (maxCoverage > f16(0.0)) {
        result += ambient * compoundedReflection * maxCoverage * pattern;
      }
    }
    
    spectralInput[spectralIdx] = result;
  }
}

// ============================================================
// Initialize Background Entry Point
// ============================================================

/**
 * Initialize spectral buffer with background illumination.
 */
@compute @workgroup_size(8, 8)
fn initBackgroundSpectrum(@builtin(global_invocation_id) id: vec3<u32>) {
  let localX = id.x;
  let localY = id.y;
  
  if (localX >= params.bufferWidth || localY >= params.bufferHeight) {
    return;
  }
  
  let screenPos = localToScreen(localX, localY);
  let inBounds = isValidScreenPos(screenPos);
  
  for (var wIdx: u32 = 0u; wIdx < params.sampleCount; wIdx++) {
    let spectralIdx = getSpectralIdx(localX, localY, wIdx);
    
    var intensity: f16 = f16(0.0);
    if (inBounds) {
      let wavelength = getWavelength(wIdx);
      intensity = getAmbientIntensity(wavelength);
    }
    
    spectralOutput[spectralIdx] = intensity;
    scatterSource[spectralIdx] = f16(0.0);
  }
}

// ============================================================
// Apply Ambient Light Entry Point
// ============================================================

/**
 * Apply ambient light after all layer processing.
 */
@compute @workgroup_size(8, 8)
fn applyAmbientLight(@builtin(global_invocation_id) id: vec3<u32>) {
  let localX = id.x;
  let localY = id.y;
  
  if (localX >= params.bufferWidth || localY >= params.bufferHeight) {
    return;
  }
  
  let screenPos = localToScreen(localX, localY);
  let inBounds = isValidScreenPos(screenPos);
  let fx = f32(screenPos.x);
  let fy = f32(screenPos.y);
  let numShapes = arrayLength(&shapes);
  
  if (!inBounds) {
    return;
  }
  
  let pattern = getAmbientPattern(fx, fy);
  
  for (var wIdx: u32 = 0u; wIdx < params.sampleCount; wIdx++) {
    let wavelength = getWavelength(wIdx);
    let spectralIdx = getSpectralIdx(localX, localY, wIdx);
    
    let current = spectralInput[spectralIdx];
    let ambient = getAmbientIntensity(wavelength);
    
    var compoundedReflection: f16 = f16(1.0);
    var anyShapeCovers: bool = false;
    
    for (var i: u32 = 0u; i < numShapes; i++) {
      let mask = getShapeMask(shapes[i], fx, fy);
      if (mask > 0.0) {
        let shape = shapes[i];
        anyShapeCovers = true;
        
        let reflection = getMaterialReflection(shape.materialIndex, wavelength);
        let effectiveReflection = f16(mask) * reflection + f16(1.0 - mask);
        compoundedReflection *= effectiveReflection;
      }
    }
    
    if (!anyShapeCovers) {
      compoundedReflection = f16(0.0);
    }
    
    let ambientContribution = ambient * compoundedReflection * pattern;
    spectralInput[spectralIdx] = current + ambientContribution;
  }
}

