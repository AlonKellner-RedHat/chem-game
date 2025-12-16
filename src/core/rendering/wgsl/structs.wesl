/**
 * Data Structures
 * 
 * This module defines all struct types used in the spectral compute pipeline.
 * Structs are designed for 16-byte alignment for optimal GPU memory access.
 */

import spectral::constants;

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
// Shape Definition
// ============================================================

/// Shape data structure (64 bytes, 16-byte aligned)
/// Represents a renderable shape with physics properties
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
  maskArrayIndex: u32, // MSDF array: 0=small (256x256), 1=large (1280x720)
  
  // MSDF properties (12 bytes)
  maskLayerIndex: u32, // Layer within MSDF texture array
  texWidth: f32,       // MSDF texture width (for screenPxRange)
  texHeight: f32,      // MSDF texture height
  
  // Scattering properties (8 bytes)
  smallParticleDensity: f32,  // Rayleigh particles/cm³
  largeParticleDensity: f32,  // Mie particles/cm³
  
  // Fluorescence properties (4 bytes)
  fluorescenceQuantumYield: f32,  // Quantum yield (0-1)
  
  // Padding for 16-byte alignment (8 bytes)
  _padding1: f32,
  _padding2: f32,
}

// ============================================================
// Physics Result Structures
// ============================================================

/// Result of processing a wavelength through layer physics
/// Used by both rendering and spectrum pipelines
struct LayerPhysicsResult {
  /// Light that passes through without scattering
  transmitted: f32,
  
  /// Combined aura source (scatter + emission) for unified blur
  auraSrc: f32,
  
  /// Emission that stays at the pixel (no blur)
  directEmission: f32,
}

/// Pre-computed shape data for optimized physics
/// Wavelength-independent values computed once per pixel
struct PrecomputedShapeData {
  /// MSDF mask coverage (0-1)
  mask: f32,
  
  /// Optical path length through shape (cm)
  pathLength: f32,
}

// ============================================================
// Scattering LUT
// ============================================================

/// Pre-computed scattering coefficients for a shape
/// Stores values at reduced wavelength resolution for interpolation
struct ScatterLUT {
  /// Scattering coefficients at SCATTER_LUT_SIZE wavelength samples
  coefficients: array<f32, 64>,
}

