/**
 * Physical and Rendering Constants
 * 
 * This module exports all physical constants and rendering parameters
 * used throughout the spectral compute pipeline.
 * 
 * Note: f16 is enabled in the root SpectralCompute.wesl module
 */

// ============================================================
// Physical Constants
// ============================================================

/// D65 standard illuminant temperature (Kelvin)
const D65_TEMPERATURE: f32 = 6500.0;

/// Visible spectrum boundaries (nm)
const VISIBLE_MIN: f32 = 380.0;
const VISIBLE_MAX: f32 = 700.0;

/// Planck's second radiation constant: C2 = hc/k (nm·K)
/// Used in Planck's law for blackbody radiation
const C2: f32 = 14387768.8;

/// D65 reference radiance at 550nm
/// Cached for normalization: getRawPlanckRadiance(550, 6500)
const D65_REFERENCE: f32 = 3.62e+29;

// ============================================================
// Spectral Rendering Constants
// ============================================================

/// Number of spectral samples for color integration (rendering pipeline)
/// 16 samples across 100-1000nm range
const SPECTRAL_SAMPLES: u32 = 16u;

// ============================================================
// Scattering Constants
// ============================================================

/// Rayleigh scattering reference coefficient
/// Based on physical cross-section: σ = ((2π)^5/48) × (d^6/λ^4) × n_m^4 × RI_factor²
const RAYLEIGH_COEFF: f32 = 5e-14;

/// Mie scattering reference coefficient
/// For large particles: Q_sca approaches ~2
const MIE_COEFF: f32 = 5e-16;

/// Default particle sizes (nm)
const SMALL_PARTICLE_SIZE: f32 = 50.0;   // Rayleigh scattering
const LARGE_PARTICLE_SIZE: f32 = 1000.0; // Mie scattering

// ============================================================
// Dual-Path Scattering Fractions
// ============================================================

/// Fraction of scattered light that stays within the shape (visual haze)
/// Background light bleeds INTO shape, preventing dark edges
const IN_SHAPE_SCATTER_FRACTION: f32 = 0.95;
const IN_SHAPE_SCATTER_FRACTION_H: f16 = 0.95h;

/// Fraction of scattered light that escapes as aura (subtle glow)
/// Shape light bleeds OUT to surrounding pixels
const AURA_SCATTER_FRACTION: f32 = 0.05;
const AURA_SCATTER_FRACTION_H: f16 = 0.05h;

// ============================================================
// Blur Constants
// ============================================================

/// Maximum blur radius in pixels (performance optimization)
const MAX_BLUR_RADIUS: i32 = 16;

/// Scale factors for blur sigma calculation
const RAYLEIGH_BLUR_SCALE: f32 = 1e-10;
const MIE_BLUR_SCALE: f32 = 1e-6;

/// Workgroup tile dimensions for shared memory blur
const BLUR_TILE_WIDTH: u32 = 64u;
const BLUR_TILE_HEIGHT: u32 = 64u;
const BLUR_HALO: u32 = 16u;
const BLUR_SHARED_WIDTH: u32 = 96u;   // BLUR_TILE_WIDTH + 2*BLUR_HALO
const BLUR_SHARED_HEIGHT: u32 = 96u;  // BLUR_TILE_HEIGHT + 2*BLUR_HALO

/// Precomputed Gaussian weights for sigma=5.0 (17 weights, symmetric)
/// Index 0 = center (dx=0), indices 1-16 = offsets dx=1..16
/// f16 version for optimized blur operations
const BLUR_WEIGHTS_H: array<f16, 17> = array<f16, 17>(
  0.0798h,  // dx=0 (center)
  0.0782h, 0.0736h, 0.0666h, 0.0580h, 0.0484h, 0.0389h, 0.0300h, 0.0222h,  // dx=1..8
  0.0158h, 0.0108h, 0.0071h, 0.0044h, 0.0027h, 0.0015h, 0.0008h, 0.0004h   // dx=9..16
);

/// Legacy f32 version for compatibility
const BLUR_WEIGHTS: array<f32, 17> = array<f32, 17>(
  0.0798,  // dx=0 (center)
  0.0782, 0.0736, 0.0666, 0.0580, 0.0484, 0.0389, 0.0300, 0.0222,  // dx=1..8
  0.0158, 0.0108, 0.0071, 0.0044, 0.0027, 0.0015, 0.0008, 0.0004   // dx=9..16
);

// ============================================================
// LUT Constants
// ============================================================

/// Size of downsampled scattering LUT (wavelength samples)
const SCATTER_LUT_SIZE: u32 = 64u;

/// Maximum shapes per layer for pre-computed masks
const MAX_SHAPES_PER_LAYER: u32 = 16u;

