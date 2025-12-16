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

import package::wgsl::constants::{AURA_SCATTER_FRACTION, AURA_SCATTER_FRACTION_H, MAX_SHAPES_PER_LAYER};
import package::wgsl::structs::{LayerPhysicsResult, PrecomputedShapeData, Shape};
import package::wgsl::bindings::{params, shapes};

import package::wgsl::physics::planck::getKirchhoffEmission;
import package::wgsl::physics::scattering::applyScattering;
import package::wgsl::physics::materials::{
  getMaterialTransmission,
  getFluorescenceExcitation,
  getFluorescenceEmission
};

// Note: The simple computeLayerPhysics() function is defined in the legacy
// SpectralCompute.wgsl for reference. The modular pipeline uses the optimized
// versions below that work with pre-computed masks for better performance.

// ============================================================
// Optimized Layer Physics (Pre-computed Masks)
// ============================================================

/**
 * OPTIMIZED: Compute layer physics using pre-computed masks.
 *
 * Avoids redundant MSDF texture samples per wavelength.
 * Major speedup for 5000-wavelength spectrum computation.
 * Uses f16 for intermediate calculations where precision permits.
 *
 * @param inputIntensity - Incoming light intensity (f16)
 * @param wavelength - Wavelength in nm (f32 for physics precision)
 * @param numShapes - Number of shapes to process
 * @param shapeData - Pre-computed mask and pathLength for each shape (f16)
 * @returns LayerPhysicsResult (f16)
 */
fn computeLayerPhysicsOptimized(
  inputIntensity: f16,
  wavelength: f32,
  numShapes: u32,
  shapeData: ptr<function, array<PrecomputedShapeData, 16>>
) -> LayerPhysicsResult {
  var result: LayerPhysicsResult;
  result.transmitted = inputIntensity;
  result.auraSrc = f16(0.0);
  result.directEmission = f16(0.0);

  // Apply all shapes using pre-computed masks
  for (var i: u32 = 0u; i < numShapes; i++) {
    let data = (*shapeData)[i];
    let mask = data.mask;  // Already f16

    if (mask > f16(0.0)) {
      let shape = shapes[i];
      let pathLength = data.pathLength;  // Already f16

      // Keep f32 for physics calculations that need precision
      let materialTrans = getMaterialTransmission(shape.materialIndex, wavelength);

      // Get scattering transmission (f32 for exponential precision)
      let scatterTrans = applyScattering(
        1.0,
        wavelength,
        shape.smallParticleDensity,
        shape.largeParticleDensity,
        f32(pathLength * mask)
      );

      // Convert to f16 for intermediate calculations
      let scatterProb_h = f16(1.0 - scatterTrans);
      let materialTrans_h = f16(materialTrans);

      // Apply material absorption (f16)
      let absorption_h = mix(f16(1.0), materialTrans_h, mask);
      let absorbedInput = result.transmitted * absorption_h;

      // Apply scattering attenuation
      let directTrans = absorbedInput * f16(scatterTrans);

      // Compute scattered light for aura
      let scatteredFrac = absorbedInput * scatterProb_h;
      result.auraSrc += scatteredFrac * AURA_SCATTER_FRACTION_H;

      result.transmitted = directTrans;

      // Handle emission
      if (params.enableEmission == 1u) {
        // Keep f32 for Planck radiation (exponential precision)
        let em = getKirchhoffEmission(materialTrans, wavelength, shape.temperature);

        let absorbedLight = f32(inputIntensity) * (1.0 - materialTrans) * f32(mask);
        let excitationEff = getFluorescenceExcitation(shape.materialIndex, wavelength);
        let excitationAmount = absorbedLight * excitationEff;
        let emissionShape = getFluorescenceEmission(shape.materialIndex, wavelength);
        let fluorEmission = excitationAmount * emissionShape * shape.fluorescenceQuantumYield;

        let totalEmission = f16(em + fluorEmission);
        let maskedEmission = totalEmission * mask;

        // Split emission using spread factor
        let spreadFactor = f16(params.emissionSpreadFactor);
        let directFraction = f16(1.0) - spreadFactor;
        let spreadAmount = maskedEmission * spreadFactor;

        result.directEmission += maskedEmission * directFraction;
        result.auraSrc += spreadAmount * (scatterProb_h * AURA_SCATTER_FRACTION_H + (f16(1.0) - scatterProb_h));
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
 * Uses f16 for intermediate calculations where precision permits.
 *
 * @param inputIntensity - Current intensity at this wavelength (f16)
 * @param wavelength - Wavelength in nm (f32 for physics precision)
 * @param numShapes - Number of shapes to process
 * @param shapeData - Pre-computed masks and path lengths (f16)
 * @param shapeExcitation - Pre-accumulated excitation per shape (f32 for accumulation)
 */
fn computeLayerPhysicsWithFluorescence(
  inputIntensity: f16,
  wavelength: f32,
  numShapes: u32,
  shapeData: ptr<function, array<PrecomputedShapeData, 16>>,
  shapeExcitation: ptr<function, array<f32, 16>>
) -> LayerPhysicsResult {
  var result: LayerPhysicsResult;
  result.transmitted = inputIntensity;
  result.auraSrc = f16(0.0);
  result.directEmission = f16(0.0);

  for (var i: u32 = 0u; i < numShapes; i++) {
    let data = (*shapeData)[i];
    let mask = data.mask;  // Already f16

    if (mask > f16(0.0)) {
      let shape = shapes[i];
      let pathLength = data.pathLength;  // Already f16
      let materialTrans = getMaterialTransmission(shape.materialIndex, wavelength);

      let scatterTrans = applyScattering(
        1.0,
        wavelength,
        shape.smallParticleDensity,
        shape.largeParticleDensity,
        f32(pathLength * mask)
      );

      let scatterProb_h = f16(1.0 - scatterTrans);
      let materialTrans_h = f16(materialTrans);

      let absorption_h = mix(f16(1.0), materialTrans_h, mask);
      let absorbedInput = result.transmitted * absorption_h;
      let directTrans = absorbedInput * f16(scatterTrans);

      let scatteredFrac = absorbedInput * scatterProb_h;
      result.auraSrc += scatteredFrac * AURA_SCATTER_FRACTION_H;

      result.transmitted = directTrans;

      if (params.enableEmission == 1u) {
        // Kirchhoff thermal emission (keep f32 for precision)
        let em = getKirchhoffEmission(materialTrans, wavelength, shape.temperature);

        // Two-pass fluorescence: use pre-accumulated excitation (f32)
        let totalExcitation = (*shapeExcitation)[i];
        let emissionShape = getFluorescenceEmission(shape.materialIndex, wavelength);
        let fluorEmission = totalExcitation * emissionShape * shape.fluorescenceQuantumYield;

        let totalEmission = f16(em + fluorEmission);
        let maskedEmission = totalEmission * mask;

        let spreadFactor = f16(params.emissionSpreadFactor);
        let directFraction = f16(1.0) - spreadFactor;
        let spreadAmount = maskedEmission * spreadFactor;

        result.directEmission += maskedEmission * directFraction;
        result.auraSrc += spreadAmount * (scatterProb_h * AURA_SCATTER_FRACTION_H + (f16(1.0) - scatterProb_h));
      }
    }
  }

  return result;
}
