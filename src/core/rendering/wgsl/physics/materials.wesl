/**
 * Material Texture Sampling
 * 
 * Provides functions to sample material properties from GPU texture palettes.
 * All textures are 2D atlases with X=wavelength, Y=material index.
 * 
 * Texture Resolution:
 * - High-res (4500 samples): Used for spectrum plotting
 * - Low-res (32 samples): Used for rendering (bin-integrated)
 */

import spectral::bindings::{
  params,
  materialPalette, materialSampler,
  fluorExcitationPalette, fluorEmissionPalette,
  renderMaterialPalette, renderExcitationPalette, renderEmissionPalette,
  reflectionPalette, renderReflectionPalette
};

// ============================================================
// Transmission Sampling
// ============================================================

/**
 * Sample material transmission at wavelength from palette.
 * 
 * Transmission is the fraction of light that passes through
 * the material at this wavelength (0 = opaque, 1 = transparent).
 * 
 * @param materialIndex - Index into material palette
 * @param wavelengthNm - Wavelength in nanometers
 * @returns Transmission coefficient (0-1)
 */
fn getMaterialTransmission(materialIndex: u32, wavelengthNm: f32) -> f32 {
  // Handle case when no materials are loaded
  if (params.numMaterials == 0u) {
    return 1.0; // Fully transparent
  }
  
  // U coordinate: wavelength position (0-1)
  let u = (wavelengthNm - params.wavelengthMin) / (params.wavelengthMax - params.wavelengthMin);
  
  // V coordinate: center of the row for this material
  let v = (f32(materialIndex) + 0.5) / f32(params.numMaterials);
  
  // Select texture based on resolution mode
  if (params.sampleCount > 32u) {
    // High-res texture for spectrum mode (4500 samples)
    return textureSampleLevel(materialPalette, materialSampler, vec2<f32>(u, v), 0.0).r;
  } else {
    // Low-res texture for rendering (32 samples, bin-integrated)
    return textureSampleLevel(renderMaterialPalette, materialSampler, vec2<f32>(u, v), 0.0).r;
  }
}

// ============================================================
// Fluorescence Sampling
// ============================================================

/**
 * Sample fluorescence excitation efficiency at wavelength.
 * 
 * Returns how efficiently light at this wavelength excites fluorescence.
 * Typically high in UV range, low in visible range.
 * 
 * @param materialIndex - Index into material palette
 * @param wavelengthNm - Wavelength in nanometers
 * @returns Excitation efficiency (0-1)
 */
fn getFluorescenceExcitation(materialIndex: u32, wavelengthNm: f32) -> f32 {
  if (params.numMaterials == 0u) {
    return 0.0; // No fluorescence
  }
  
  let u = (wavelengthNm - params.wavelengthMin) / (params.wavelengthMax - params.wavelengthMin);
  let v = (f32(materialIndex) + 0.5) / f32(params.numMaterials);
  
  if (params.sampleCount > 32u) {
    return textureSampleLevel(fluorExcitationPalette, materialSampler, vec2<f32>(u, v), 0.0).r;
  } else {
    return textureSampleLevel(renderExcitationPalette, materialSampler, vec2<f32>(u, v), 0.0).r;
  }
}

/**
 * Sample fluorescence emission spectrum at wavelength.
 * 
 * Returns the emission line shape (normalized so peak = 1).
 * This defines where the fluorescent light is emitted.
 * 
 * @param materialIndex - Index into material palette
 * @param wavelengthNm - Wavelength in nanometers
 * @returns Emission spectrum value (0-1, normalized)
 */
fn getFluorescenceEmission(materialIndex: u32, wavelengthNm: f32) -> f32 {
  if (params.numMaterials == 0u) {
    return 0.0;
  }
  
  let u = (wavelengthNm - params.wavelengthMin) / (params.wavelengthMax - params.wavelengthMin);
  let v = (f32(materialIndex) + 0.5) / f32(params.numMaterials);
  
  if (params.sampleCount > 32u) {
    return textureSampleLevel(fluorEmissionPalette, materialSampler, vec2<f32>(u, v), 0.0).r;
  } else {
    return textureSampleLevel(renderEmissionPalette, materialSampler, vec2<f32>(u, v), 0.0).r;
  }
}

// ============================================================
// Reflection Sampling
// ============================================================

/**
 * Sample material reflection at wavelength.
 * 
 * Reflection is a surface property (NOT depth-dependent).
 * Used for ambient light calculations.
 * 
 * Returns f16 for memory efficiency in ambient light calculations.
 * 
 * @param materialIndex - Index into material palette
 * @param wavelengthNm - Wavelength in nanometers
 * @returns Reflection coefficient (0-1) as f16
 */
fn getMaterialReflection(materialIndex: u32, wavelengthNm: f32) -> f16 {
  if (params.numMaterials == 0u) {
    return f16(0.02); // Default 2% reflectance for dielectrics
  }
  
  let u = (wavelengthNm - params.wavelengthMin) / (params.wavelengthMax - params.wavelengthMin);
  let v = (f32(materialIndex) + 0.5) / f32(params.numMaterials);
  
  if (params.sampleCount > 32u) {
    return f16(textureSampleLevel(reflectionPalette, materialSampler, vec2<f32>(u, v), 0.0).r);
  } else {
    return f16(textureSampleLevel(renderReflectionPalette, materialSampler, vec2<f32>(u, v), 0.0).r);
  }
}

