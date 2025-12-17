/**
 * Data Structures
 *
 * This module defines all struct types used in the spectral compute pipeline.
 * Structs are designed for 16-byte alignment for optimal GPU memory access.
 */

import package::wgsl::constants;

// ============================================================
// Uniform Parameters
// ============================================================

/// Main parameters uniform buffer
/// Contains all runtime-configurable settings for the compute pipeline
struct Params {
  /// Canvas dimensions
  width: u32,
  height: u32,

  /// Wavelength range for spectral computation (nm)
  wavelengthMin: f32,
  wavelengthMax: f32,

  /// Number of wavelength samples for color integration (16 for rendering)
  spectralResolution: u32,

  /// Background illumination mode: 0=normal, 1=uv, 2=dark
  backgroundMode: u32,

  /// Enable thermal and fluorescence emission: 0=disabled, 1=enabled
  enableEmission: u32,

  /// Spectrum sampling point (-1 for no sampling)
  sampleX: i32,
  sampleY: i32,

  /// Two-pass rendering control
  isNormalizationPass: u32,  // 0=compute, 1=normalize
  globalMaxIntensity: f32,   // Max Y value for normalization

  /// MSDF rendering parameter (typically 4.0)
  msdfPxRange: f32,

  /// Material count in palette textures
  numMaterials: u32,

  /// High-resolution spectrum parameters
  plotResolution: u32,   // Wavelength samples for spectrum plot (5000)
  averageRadius: u32,    // Circular averaging radius in pixels
  boxSize: u32,          // Size of spectrum sampling box (30)

  /// Scattering blur parameters
  globalMaxScatterSigma: f32,  // Global sigma for unified aura blur
  emissionSpreadFactor: f32,   // Fraction of emission that spreads (0-1)

  /// Current layer being processed
  currentLayer: u32,

  /// Unified pipeline mode parameters
  /// These enable single code path for both rendering and spectrum modes
  bufferWidth: u32,    // width for render, boxSize for spectrum
  bufferHeight: u32,   // height for render, boxSize for spectrum
  sampleCount: u32,    // 16 for render, plotResolution for spectrum
  coordOffsetX: i32,   // 0 for render, sampleX - boxSize/2 for spectrum
  coordOffsetY: i32,   // 0 for render, sampleY - boxSize/2 for spectrum
}

// ============================================================
// Blend Mode Constants (OCP extension)
// ============================================================

/// Blend mode for shape mask interpretation
/// COVERAGE: mask = coverage value (for material absorption)
/// REFLECTION: mask = reflection factor (for ambient light compounding)
const BLEND_MODE_COVERAGE: u32 = 0u;
const BLEND_MODE_REFLECTION: u32 = 1u;

// ============================================================
// Shape Definition
// ============================================================

/// Shape data structure (80 bytes, 16-byte aligned)
/// Represents a renderable shape with physics properties
///
/// Supports optional MSDF (for sharp edges) and/or alpha (for intensity modulation):
/// - MSDF only: Sharp edges, alpha = 1.0
/// - Alpha only: All pixels in shape, variable intensity
/// - Both: MSDF defines boundary, alpha modulates intensity (multiply)
/// - Neither: Full coverage with alpha 1.0
///
/// Blend modes (OCP extension):
/// - COVERAGE (0): mask = msdfCoverage * alpha (for material absorption)
/// - REFLECTION (1): reflection = 1 - msdfCoverage * alpha (for ambient light)
struct Shape {
  // Position and bounds (16 bytes)
  x: f32,              // Position X
  y: f32,              // Position Y
  width: f32,          // Bounding box width
  height: f32,         // Bounding box height

  // Thermal properties (4 bytes)
  temperature: f32,    // Temperature for emission (Kelvin)

  // Rendering properties (12 bytes)
  layer: u32,          // Render order (0=background, higher=foreground)
  materialIndex: u32,  // Index into material palette textures
  msdfArrayIndex: u32, // MSDF array: 0=small (256x256), 1=large (1280x720)

  // MSDF properties (12 bytes)
  msdfLayerIndex: u32, // Layer within MSDF texture array
  texWidth: f32,       // Texture width (for screenPxRange)
  texHeight: f32,      // Texture height

  // Alpha texture properties (8 bytes)
  alphaArrayIndex: u32, // Alpha array: 0=small, 1=large
  alphaLayerIndex: u32, // Layer within alpha texture array

  // Texture existence flags (8 bytes)
  hasMsdf: u32,        // 1 if MSDF texture exists, 0 otherwise
  hasAlpha: u32,       // 1 if alpha texture exists, 0 otherwise

  // Scattering properties (8 bytes)
  smallParticleDensity: f32,  // Rayleigh particles/cm³
  largeParticleDensity: f32,  // Mie particles/cm³

  // Fluorescence properties (4 bytes)
  fluorescenceQuantumYield: f32,  // Quantum yield (0-1)

  // Blend mode for mask interpretation (4 bytes)
  blendMode: u32,      // 0=COVERAGE (default), 1=REFLECTION

  // Padding for 16-byte alignment (4 bytes)
  _padding1: f32,
}

// ============================================================
// Physics Result Structures (f16 optimized)
// ============================================================

/// Result of processing a wavelength through layer physics
/// Used by both rendering and spectrum pipelines
/// f16 is sufficient for 0-1 normalized intensity values
struct LayerPhysicsResult {
  /// Light that passes through without scattering (0-1)
  transmitted: f16,

  /// Combined aura source (scatter + emission) for unified blur (0-1)
  auraSrc: f16,

  /// Emission that stays at the pixel (no blur) (0-1)
  directEmission: f16,
}

/// Pre-computed shape data for optimized physics
/// Wavelength-independent values computed once per pixel
/// f16 is sufficient for coverage (0-1) and typical path lengths (<100cm)
struct PrecomputedShapeData {
  /// MSDF mask coverage (0-1)
  mask: f16,

  /// Optical path length through shape (cm)
  pathLength: f16,
}

// ============================================================
// Scattering LUT (f16 optimized)
// ============================================================

/// Pre-computed scattering coefficients for a shape
/// Stores values at reduced wavelength resolution for interpolation
/// f16 is sufficient for small scattering coefficient values
struct ScatterLUT {
  /// Scattering coefficients at SCATTER_LUT_SIZE wavelength samples
  coefficients: array<f16, 64>,
}

// ============================================================
// Texture Shape Definition
// ============================================================

/// TextureShape data structure (64 bytes, 16-byte aligned)
/// Represents a texture overlay with spectral distribution properties.
///
/// Texture shapes differ from material shapes:
/// - Support MSDF + alpha (materials only support MSDF)
/// - Have 3 spectral distributions (transmission, emission, reflection)
/// - Overlap interactions: transmission=multiplicative, emission/reflection=additive
/// - Applied AFTER material shapes in each layer (material reflection absorbed by texture transmission)
struct TextureShape {
  // Position and bounds (16 bytes)
  x: f32,              // Position X
  y: f32,              // Position Y
  width: f32,          // Bounding box width
  height: f32,         // Bounding box height

  // Layer and palette indices (16 bytes)
  layer: u32,                   // Render order (0=background, higher=foreground)
  transmissionIndex: u32,       // Index into texture transmission palette
  emissionIndex: u32,           // Index into texture emission palette
  reflectionIndex: u32,         // Index into texture reflection palette

  // MSDF and alpha texture indices (16 bytes)
  msdfArrayIndex: u32,          // MSDF array: 0=small (256x256), 1=large (1280x720)
  msdfLayerIndex: u32,          // Layer within MSDF texture array
  alphaArrayIndex: u32,         // Alpha array: 0=small, 1=large
  alphaLayerIndex: u32,         // Layer within alpha texture array

  // Texture existence flags and dimensions (16 bytes)
  hasMsdf: u32,                 // 1 if MSDF texture exists, 0 otherwise
  hasAlpha: u32,                // 1 if alpha texture exists, 0 otherwise
  texWidth: f32,                // Texture width (for screenPxRange)
  texHeight: f32,               // Texture height
}

// ============================================================
// Ambient Shape Definition
// ============================================================

/// AmbientShape data structure (64 bytes, 16-byte aligned)
/// Represents a light source shape with brightness property.
///
/// Ambient shapes provide the light that gets reflected by material and texture shapes.
/// - Brightness is a scalar (uniform across the spectrum)
/// - Overlap interaction: additive (brightness values sum)
/// - Supports MSDF + alpha for spatial variation
///
/// Note: Stored in uniform buffer with fixed max count (MAX_AMBIENT_SHAPES)
struct AmbientShape {
  // Position and bounds (16 bytes)
  x: f32,              // Position X
  y: f32,              // Position Y
  width: f32,          // Bounding box width
  height: f32,         // Bounding box height

  // Brightness property (4 bytes)
  brightness: f32,     // Brightness scalar (uniform across spectrum)

  // MSDF texture indices (8 bytes)
  msdfArrayIndex: u32,          // MSDF array: 0=small (256x256), 1=large (1280x720)
  msdfLayerIndex: u32,          // Layer within MSDF texture array

  // Alpha texture indices (8 bytes)
  alphaArrayIndex: u32,         // Alpha array: 0=small, 1=large
  alphaLayerIndex: u32,         // Layer within alpha texture array

  // Texture existence flags (8 bytes)
  hasMsdf: u32,                 // 1 if MSDF texture exists, 0 otherwise
  hasAlpha: u32,                // 1 if alpha texture exists, 0 otherwise

  // Texture dimensions (8 bytes)
  texWidth: f32,                // Texture width (for screenPxRange)
  texHeight: f32,               // Texture height

  // Padding for 16-byte alignment (12 bytes)
  _padding: vec3<f32>,
}

/// Maximum number of ambient shapes (uniform buffer limit)
const MAX_AMBIENT_SHAPES: u32 = 8u;

/// Ambient shapes uniform buffer container
/// Uses fixed-size array to fit in uniform buffer (reduces storage buffer count)
struct AmbientShapesUniform {
  /// Number of active ambient shapes (0 = use legacy ambient)
  count: u32,
  _padding: vec3<u32>,
  /// Fixed-size array of ambient shapes
  shapes: array<AmbientShape, 8>,  // MAX_AMBIENT_SHAPES
}

// ============================================================
// Texture Physics Result Structure
// ============================================================

/// Result of processing texture shapes at a pixel
struct TexturePhysicsResult {
  /// Light after texture absorption (transmitted + emission)
  output: f16,

  /// Accumulated reflection factor for ambient light
  reflection: f16,
}
