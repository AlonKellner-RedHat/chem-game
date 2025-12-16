/**
 * Layer Physics
 * 
 * Combines all physics modules to compute the effect of a single layer.
 * This is the SINGLE SOURCE OF TRUTH for absorption, emission, and scattering.
 * 
 * Both the 16-sample rendering pipeline and 5000-sample spectrum pipeline
 * call these functions to ensure identical physics.
 * 
 * Processing order:
 * 1. Material absorption (Beer-Lambert)
 * 2. Scattering attenuation (Rayleigh + Mie)
 * 3. Fluorescence emission (two-pass)
 * 4. Kirchhoff thermal emission
 */

import spectral::constants::{AURA_SCATTER_FRACTION, MAX_SHAPES_PER_LAYER};
import spectral::structs::{LayerPhysicsResult, PrecomputedShapeData, Shape};
import spectral::bindings::{params, shapes};

import spectral::physics::planck::getKirchhoffEmission;
import spectral::physics::scattering::applyScattering;
import spectral::physics::materials::{
  getMaterialTransmission,
  getFluorescenceExcitation,
  getFluorescenceEmission
};

// ============================================================
// Core Layer Physics (Simple Version)
// ============================================================

/**
 * SHARED: Compute layer physics for a single wavelength.
 * 
 * This is the core physics function used by both pipelines.
 * Changes here affect both rendering and spectrum plot.
 * 
 * @param inputIntensity - Incoming light intensity
 * @param wavelength - Wavelength in nm
 * @param fx, fy - Pixel coordinates
 * @param numShapes - Number of shapes to process
 * @returns LayerPhysicsResult with all output components
 */
fn computeLayerPhysics(
  inputIntensity: f32,
  wavelength: f32,
  fx: f32,
  fy: f32,
  numShapes: u32,
  getShapeMask: fn(Shape, f32, f32) -> f32  // MSDF mask function
) -> LayerPhysicsResult {
  var result: LayerPhysicsResult;
  result.transmitted = inputIntensity;
  result.auraSrc = 0.0;
  result.directEmission = 0.0;
  
  // Apply all shapes in this layer
  for (var i: u32 = 0u; i < numShapes; i++) {
    let mask = getShapeMask(shapes[i], fx, fy);
    if (mask > 0.0) {
      let shape = shapes[i];
      let materialTrans = getMaterialTransmission(shape.materialIndex, wavelength);
      
      // Calculate path length for scattering
      let pathLength = max(shape.width, shape.height) * 0.01;
      
      // Get scattering transmission
      let scatterTrans = applyScattering(
        1.0,
        wavelength,
        shape.smallParticleDensity,
        shape.largeParticleDensity,
        pathLength * mask
      );
      
      // Scatter probability = 1 - scatterTrans
      let scatterProb = 1.0 - scatterTrans;
      
      // Apply material absorption
      let absorption = mix(1.0, materialTrans, mask);
      let absorbedInput = result.transmitted * absorption;
      
      // Direct transmission (full brightness preserved)
      let directTrans = absorbedInput;
      
      // Compute scattered light for aura effect
      let scatteredFrac = absorbedInput * scatterProb;
      result.auraSrc += scatteredFrac * AURA_SCATTER_FRACTION;
      
      // Update transmitted for next shape
      result.transmitted = directTrans;
      
      // Handle emission
      if (params.enableEmission == 1u) {
        // Kirchhoff thermal emission
        let em = getKirchhoffEmission(materialTrans, wavelength, shape.temperature);
        
        // Fluorescence emission (simplified - uses same wavelength)
        // Full two-pass fluorescence is in computeLayerPhysicsWithFluorescence
        let absorbedLight = inputIntensity * (1.0 - materialTrans) * mask;
        let excitationEff = getFluorescenceExcitation(shape.materialIndex, wavelength);
        let excitationAmount = absorbedLight * excitationEff;
        let emissionShape = getFluorescenceEmission(shape.materialIndex, wavelength);
        let fluorEmission = excitationAmount * emissionShape * shape.fluorescenceQuantumYield;
        
        let totalEmission = em + fluorEmission;
        let maskedEmission = totalEmission * mask;
        
        // Split emission using spread factor
        let spreadFactor = params.emissionSpreadFactor;
        let directFraction = 1.0 - spreadFactor;
        let spreadAmount = maskedEmission * spreadFactor;
        
        result.directEmission += maskedEmission * directFraction;
        result.auraSrc += spreadAmount * (scatterProb * AURA_SCATTER_FRACTION + (1.0 - scatterProb));
      }
    }
  }
  
  return result;
}

// ============================================================
// Optimized Layer Physics (Pre-computed Masks)
// ============================================================

/**
 * OPTIMIZED: Compute layer physics using pre-computed masks.
 * 
 * Avoids redundant MSDF texture samples per wavelength.
 * Major speedup for 5000-wavelength spectrum computation.
 * 
 * @param inputIntensity - Incoming light intensity
 * @param wavelength - Wavelength in nm
 * @param numShapes - Number of shapes to process
 * @param shapeData - Pre-computed mask and pathLength for each shape
 * @returns LayerPhysicsResult
 */
fn computeLayerPhysicsOptimized(
  inputIntensity: f32,
  wavelength: f32,
  numShapes: u32,
  shapeData: ptr<function, array<PrecomputedShapeData, 16>>
) -> LayerPhysicsResult {
  var result: LayerPhysicsResult;
  result.transmitted = inputIntensity;
  result.auraSrc = 0.0;
  result.directEmission = 0.0;
  
  // Apply all shapes using pre-computed masks
  for (var i: u32 = 0u; i < numShapes; i++) {
    let data = (*shapeData)[i];
    let mask = data.mask;
    
    if (mask > 0.0) {
      let shape = shapes[i];
      let pathLength = data.pathLength;
      let materialTrans = getMaterialTransmission(shape.materialIndex, wavelength);
      
      // Get scattering transmission
      let scatterTrans = applyScattering(
        1.0,
        wavelength,
        shape.smallParticleDensity,
        shape.largeParticleDensity,
        pathLength * mask
      );
      
      let scatterProb = 1.0 - scatterTrans;
      
      // Apply material absorption
      let absorption = mix(1.0, materialTrans, mask);
      let absorbedInput = result.transmitted * absorption;
      
      // Apply scattering attenuation
      let directTrans = absorbedInput * scatterTrans;
      
      // Compute scattered light for aura
      let scatteredFrac = absorbedInput * scatterProb;
      result.auraSrc += scatteredFrac * AURA_SCATTER_FRACTION;
      
      result.transmitted = directTrans;
      
      // Handle emission
      if (params.enableEmission == 1u) {
        let em = getKirchhoffEmission(materialTrans, wavelength, shape.temperature);
        
        let absorbedLight = inputIntensity * (1.0 - materialTrans) * mask;
        let excitationEff = getFluorescenceExcitation(shape.materialIndex, wavelength);
        let excitationAmount = absorbedLight * excitationEff;
        let emissionShape = getFluorescenceEmission(shape.materialIndex, wavelength);
        let fluorEmission = excitationAmount * emissionShape * shape.fluorescenceQuantumYield;
        
        let totalEmission = em + fluorEmission;
        let maskedEmission = totalEmission * mask;
        
        let spreadFactor = params.emissionSpreadFactor;
        let directFraction = 1.0 - spreadFactor;
        let spreadAmount = maskedEmission * spreadFactor;
        
        result.directEmission += maskedEmission * directFraction;
        result.auraSrc += spreadAmount * (scatterProb * AURA_SCATTER_FRACTION + (1.0 - scatterProb));
      }
    }
  }
  
  return result;
}

// ============================================================
// Two-Pass Fluorescence Version
// ============================================================

/**
 * SHARED: Compute layer physics with pre-accumulated fluorescence excitation.
 * 
 * This is the TWO-PASS version that correctly handles inter-wavelength fluorescence.
 * Uses pre-accumulated excitation values (from Pass 1) for emission calculation.
 * 
 * @param inputIntensity - Current intensity at this wavelength
 * @param wavelength - Wavelength in nm
 * @param numShapes - Number of shapes to process
 * @param shapeData - Pre-computed masks and path lengths
 * @param shapeExcitation - Pre-accumulated excitation per shape (from Pass 1)
 */
fn computeLayerPhysicsWithFluorescence(
  inputIntensity: f32,
  wavelength: f32,
  numShapes: u32,
  shapeData: ptr<function, array<PrecomputedShapeData, 16>>,
  shapeExcitation: ptr<function, array<f32, 16>>
) -> LayerPhysicsResult {
  var result: LayerPhysicsResult;
  result.transmitted = inputIntensity;
  result.auraSrc = 0.0;
  result.directEmission = 0.0;
  
  for (var i: u32 = 0u; i < numShapes; i++) {
    let data = (*shapeData)[i];
    let mask = data.mask;
    
    if (mask > 0.0) {
      let shape = shapes[i];
      let pathLength = data.pathLength;
      let materialTrans = getMaterialTransmission(shape.materialIndex, wavelength);
      
      let scatterTrans = applyScattering(
        1.0,
        wavelength,
        shape.smallParticleDensity,
        shape.largeParticleDensity,
        pathLength * mask
      );
      
      let scatterProb = 1.0 - scatterTrans;
      
      let absorption = mix(1.0, materialTrans, mask);
      let absorbedInput = result.transmitted * absorption;
      let directTrans = absorbedInput * scatterTrans;
      
      let scatteredFrac = absorbedInput * scatterProb;
      result.auraSrc += scatteredFrac * AURA_SCATTER_FRACTION;
      
      result.transmitted = directTrans;
      
      if (params.enableEmission == 1u) {
        // Kirchhoff thermal emission
        let em = getKirchhoffEmission(materialTrans, wavelength, shape.temperature);
        
        // Two-pass fluorescence: use pre-accumulated excitation
        let totalExcitation = (*shapeExcitation)[i];
        let emissionShape = getFluorescenceEmission(shape.materialIndex, wavelength);
        let fluorEmission = totalExcitation * emissionShape * shape.fluorescenceQuantumYield;
        
        let totalEmission = em + fluorEmission;
        let maskedEmission = totalEmission * mask;
        
        let spreadFactor = params.emissionSpreadFactor;
        let directFraction = 1.0 - spreadFactor;
        let spreadAmount = maskedEmission * spreadFactor;
        
        result.directEmission += maskedEmission * directFraction;
        result.auraSrc += spreadAmount * (scatterProb * AURA_SCATTER_FRACTION + (1.0 - scatterProb));
      }
    }
  }
  
  return result;
}

