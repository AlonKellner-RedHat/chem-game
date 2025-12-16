/**
 * Blur Pass Entry Points
 * 
 * Compute shader entry points for horizontal and vertical blur passes.
 * Uses workgroup shared memory for efficient tiled processing.
 * 
 * Entry Points:
 * - blurHorizontal: Horizontal scatter blur
 * - blurVertical: Vertical scatter blur
 * - blurTransmittedH: Horizontal transmitted blur
 * - blurTransmittedV: Vertical transmitted blur
 */

import package::wgsl::constants::{
  SPECTRAL_SAMPLES, MAX_BLUR_RADIUS,
  BLUR_TILE_WIDTH, BLUR_TILE_HEIGHT, BLUR_HALO,
  BLUR_SHARED_WIDTH, BLUR_SHARED_HEIGHT, BLUR_WEIGHTS_H
};
import package::wgsl::bindings::{
  params, blurTile,
  scatterSource, spectralInput, spectralOutput, blurredTransmitted
};

// ============================================================
// Helper: Get Spectral Index
// ============================================================

fn getSpectralIdx(localX: u32, localY: u32, wIdx: u32) -> u32 {
  return (localY * params.bufferWidth + localX) * params.sampleCount + wIdx;
}

// ============================================================
// Horizontal Scatter Blur
// ============================================================

/**
 * Apply horizontal Gaussian blur to scatter source using shared memory.
 * Reads from scatterSource, writes to spectralInput.
 */
@compute @workgroup_size(64, 1)
fn blurHorizontal(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
  @builtin(workgroup_id) wgid: vec3<u32>
) {
  let y = gid.y;
  let tileStartX = wgid.x * BLUR_TILE_WIDTH;
  let localIdx = lid.x;
  let validY = y < params.bufferHeight;
  let outX = tileStartX + localIdx;
  let validOut = validY && outX < params.bufferWidth;
  
  // Skip blur if sigma is zero
  if (params.globalMaxScatterSigma <= 0.0) {
    if (validOut) {
      for (var w: u32 = 0u; w < SPECTRAL_SAMPLES; w++) {
        let idx = getSpectralIdx(outX, y, w);
        spectralInput[idx] = scatterSource[idx];
      }
    }
    return;
  }
  
  // Load tile + halo into shared memory
  for (var w: u32 = 0u; w < SPECTRAL_SAMPLES; w++) {
    let sharedBase = w * BLUR_SHARED_WIDTH;
    
    let globalX = i32(tileStartX) + i32(localIdx) - i32(BLUR_HALO);
    if (validY && globalX >= 0 && u32(globalX) < params.bufferWidth) {
      blurTile[sharedBase + localIdx] = scatterSource[getSpectralIdx(u32(globalX), y, w)];
    } else {
      blurTile[sharedBase + localIdx] = f16(0.0);
    }
    
    // Load right halo
    if (localIdx < 2u * BLUR_HALO) {
      let haloX = i32(tileStartX) + i32(BLUR_TILE_WIDTH) + i32(localIdx) - i32(BLUR_HALO);
      if (validY && haloX >= 0 && u32(haloX) < params.bufferWidth) {
        blurTile[sharedBase + BLUR_TILE_WIDTH + localIdx] = scatterSource[getSpectralIdx(u32(haloX), y, w)];
      } else {
        blurTile[sharedBase + BLUR_TILE_WIDTH + localIdx] = f16(0.0);
      }
    }
  }
  
  workgroupBarrier();
  
  // Blur from shared memory
  if (validOut) {
    for (var w: u32 = 0u; w < SPECTRAL_SAMPLES; w++) {
      var sum = f16(0.0);
      var weightSum = f16(0.0);
      let sharedBase = w * BLUR_SHARED_WIDTH;
      let centerIdx = localIdx + BLUR_HALO;
      
      for (var dx: i32 = -MAX_BLUR_RADIUS; dx <= MAX_BLUR_RADIUS; dx++) {
        let sharedX = i32(centerIdx) + dx;
        let weight = BLUR_WEIGHTS_H[abs(dx)];
        sum += blurTile[sharedBase + u32(sharedX)] * weight;
        weightSum += weight;
      }
      
      spectralInput[getSpectralIdx(outX, y, w)] = sum / weightSum;
    }
  }
}

// ============================================================
// Vertical Scatter Blur
// ============================================================

/**
 * Apply vertical Gaussian blur using shared memory.
 * Reads from spectralInput (H-blurred), writes to scatterSource.
 */
@compute @workgroup_size(1, 64)
fn blurVertical(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
  @builtin(workgroup_id) wgid: vec3<u32>
) {
  let x = gid.x;
  let tileStartY = wgid.y * BLUR_TILE_HEIGHT;
  let localIdx = lid.y;
  let validX = x < params.bufferWidth;
  let outY = tileStartY + localIdx;
  let validOut = validX && outY < params.bufferHeight;
  
  // Skip blur if sigma is zero
  if (params.globalMaxScatterSigma <= 0.0) {
    if (validOut) {
      for (var w: u32 = 0u; w < SPECTRAL_SAMPLES; w++) {
        let idx = getSpectralIdx(x, outY, w);
        scatterSource[idx] = spectralInput[idx];
      }
    }
    return;
  }
  
  // Load tile + halo into shared memory
  for (var w: u32 = 0u; w < SPECTRAL_SAMPLES; w++) {
    let sharedBase = w * BLUR_SHARED_HEIGHT;
    
    let globalY = i32(tileStartY) + i32(localIdx) - i32(BLUR_HALO);
    if (validX && globalY >= 0 && u32(globalY) < params.bufferHeight) {
      blurTile[sharedBase + localIdx] = spectralInput[getSpectralIdx(x, u32(globalY), w)];
    } else {
      blurTile[sharedBase + localIdx] = f16(0.0);
    }
    
    // Load bottom halo
    if (localIdx < 2u * BLUR_HALO) {
      let haloY = i32(tileStartY) + i32(BLUR_TILE_HEIGHT) + i32(localIdx) - i32(BLUR_HALO);
      if (validX && haloY >= 0 && u32(haloY) < params.bufferHeight) {
        blurTile[sharedBase + BLUR_TILE_HEIGHT + localIdx] = spectralInput[getSpectralIdx(x, u32(haloY), w)];
      } else {
        blurTile[sharedBase + BLUR_TILE_HEIGHT + localIdx] = f16(0.0);
      }
    }
  }
  
  workgroupBarrier();
  
  // Blur from shared memory
  if (validOut) {
    for (var w: u32 = 0u; w < SPECTRAL_SAMPLES; w++) {
      var sum = f16(0.0);
      var weightSum = f16(0.0);
      let sharedBase = w * BLUR_SHARED_HEIGHT;
      let centerIdx = localIdx + BLUR_HALO;
      
      for (var dy: i32 = -MAX_BLUR_RADIUS; dy <= MAX_BLUR_RADIUS; dy++) {
        let sharedY = i32(centerIdx) + dy;
        let weight = BLUR_WEIGHTS_H[abs(dy)];
        sum += blurTile[sharedBase + u32(sharedY)] * weight;
        weightSum += weight;
      }
      
      scatterSource[getSpectralIdx(x, outY, w)] = sum / weightSum;
    }
  }
}

// ============================================================
// Transmitted Blur (Horizontal)
// ============================================================

/**
 * Apply horizontal blur to transmitted light.
 * Reads from spectralOutput, writes to spectralInput (temp).
 */
@compute @workgroup_size(64, 1)
fn blurTransmittedH(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
  @builtin(workgroup_id) wgid: vec3<u32>
) {
  let y = gid.y;
  let tileStartX = wgid.x * BLUR_TILE_WIDTH;
  let localIdx = lid.x;
  let validY = y < params.bufferHeight;
  let outX = tileStartX + localIdx;
  let validOut = validY && outX < params.bufferWidth;
  
  if (params.globalMaxScatterSigma <= 0.0) {
    if (validOut) {
      for (var w: u32 = 0u; w < SPECTRAL_SAMPLES; w++) {
        let idx = getSpectralIdx(outX, y, w);
        spectralInput[idx] = spectralOutput[idx];
      }
    }
    return;
  }
  
  // Load and blur (similar pattern to blurHorizontal)
  for (var w: u32 = 0u; w < SPECTRAL_SAMPLES; w++) {
    let sharedBase = w * BLUR_SHARED_WIDTH;
    
    let globalX = i32(tileStartX) + i32(localIdx) - i32(BLUR_HALO);
    if (validY && globalX >= 0 && u32(globalX) < params.bufferWidth) {
      blurTile[sharedBase + localIdx] = spectralOutput[getSpectralIdx(u32(globalX), y, w)];
    } else {
      blurTile[sharedBase + localIdx] = f16(0.0);
    }
    
    if (localIdx < 2u * BLUR_HALO) {
      let haloX = i32(tileStartX) + i32(BLUR_TILE_WIDTH) + i32(localIdx) - i32(BLUR_HALO);
      if (validY && haloX >= 0 && u32(haloX) < params.bufferWidth) {
        blurTile[sharedBase + BLUR_TILE_WIDTH + localIdx] = spectralOutput[getSpectralIdx(u32(haloX), y, w)];
      } else {
        blurTile[sharedBase + BLUR_TILE_WIDTH + localIdx] = f16(0.0);
      }
    }
  }
  
  workgroupBarrier();
  
  if (validOut) {
    for (var w: u32 = 0u; w < SPECTRAL_SAMPLES; w++) {
      var sum = f16(0.0);
      var weightSum = f16(0.0);
      let sharedBase = w * BLUR_SHARED_WIDTH;
      let centerIdx = localIdx + BLUR_HALO;
      
      for (var dx: i32 = -MAX_BLUR_RADIUS; dx <= MAX_BLUR_RADIUS; dx++) {
        let sharedX = i32(centerIdx) + dx;
        let weight = BLUR_WEIGHTS_H[abs(dx)];
        sum += blurTile[sharedBase + u32(sharedX)] * weight;
        weightSum += weight;
      }
      
      spectralInput[getSpectralIdx(outX, y, w)] = sum / weightSum;
    }
  }
}

// ============================================================
// Transmitted Blur (Vertical)
// ============================================================

/**
 * Apply vertical blur to transmitted light.
 * Reads from spectralInput (H-blurred), writes to blurredTransmitted.
 */
@compute @workgroup_size(1, 64)
fn blurTransmittedV(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
  @builtin(workgroup_id) wgid: vec3<u32>
) {
  let x = gid.x;
  let tileStartY = wgid.y * BLUR_TILE_HEIGHT;
  let localIdx = lid.y;
  let validX = x < params.bufferWidth;
  let outY = tileStartY + localIdx;
  let validOut = validX && outY < params.bufferHeight;
  
  if (params.globalMaxScatterSigma <= 0.0) {
    if (validOut) {
      for (var w: u32 = 0u; w < SPECTRAL_SAMPLES; w++) {
        let idx = getSpectralIdx(x, outY, w);
        blurredTransmitted[idx] = spectralInput[idx];
      }
    }
    return;
  }
  
  // Load and blur (similar pattern to blurVertical)
  for (var w: u32 = 0u; w < SPECTRAL_SAMPLES; w++) {
    let sharedBase = w * BLUR_SHARED_HEIGHT;
    
    let globalY = i32(tileStartY) + i32(localIdx) - i32(BLUR_HALO);
    if (validX && globalY >= 0 && u32(globalY) < params.bufferHeight) {
      blurTile[sharedBase + localIdx] = spectralInput[getSpectralIdx(x, u32(globalY), w)];
    } else {
      blurTile[sharedBase + localIdx] = f16(0.0);
    }
    
    if (localIdx < 2u * BLUR_HALO) {
      let haloY = i32(tileStartY) + i32(BLUR_TILE_HEIGHT) + i32(localIdx) - i32(BLUR_HALO);
      if (validX && haloY >= 0 && u32(haloY) < params.bufferHeight) {
        blurTile[sharedBase + BLUR_TILE_HEIGHT + localIdx] = spectralInput[getSpectralIdx(x, u32(haloY), w)];
      } else {
        blurTile[sharedBase + BLUR_TILE_HEIGHT + localIdx] = f16(0.0);
      }
    }
  }
  
  workgroupBarrier();
  
  if (validOut) {
    for (var w: u32 = 0u; w < SPECTRAL_SAMPLES; w++) {
      var sum = f16(0.0);
      var weightSum = f16(0.0);
      let sharedBase = w * BLUR_SHARED_HEIGHT;
      let centerIdx = localIdx + BLUR_HALO;
      
      for (var dy: i32 = -MAX_BLUR_RADIUS; dy <= MAX_BLUR_RADIUS; dy++) {
        let sharedY = i32(centerIdx) + dy;
        let weight = BLUR_WEIGHTS_H[abs(dy)];
        sum += blurTile[sharedBase + u32(sharedY)] * weight;
        weightSum += weight;
      }
      
      blurredTransmitted[getSpectralIdx(x, outY, w)] = sum / weightSum;
    }
  }
}

