/**
 * Buffer and Texture Bindings
 *
 * This module declares all GPU resource bindings used by the spectral pipeline.
 * Organized into 4 bind groups to stay within WebGPU limits.
 */

import package::wgsl::structs::{Params, Shape};
import package::wgsl::constants::SPECTRAL_SAMPLES;

// ============================================================
// Bind Group 0: Main Buffers
// ============================================================

/// Uniform parameters (runtime configuration)
@group(0) @binding(0) var<uniform> params: Params;

/// Shape array (storage buffer, read-only)
@group(0) @binding(1) var<storage, read> shapes: array<Shape>;

/// RGB output buffer (per-pixel RGBA)
@group(0) @binding(2) var<storage, read_write> rgbOutput: array<vec4<f32>>;

/// High-resolution spectrum output (for plotting)
@group(0) @binding(3) var<storage, read_write> spectrumOutput: array<f32>;

/// Per-pixel max intensity for normalization
@group(0) @binding(4) var<storage, read_write> maxPerPixel: array<f32>;

/// Spectrum box buffer (boxSize² × plotResolution values, f16)
@group(0) @binding(5) var<storage, read_write> spectrumBox: array<f16>;

// ============================================================
// Bind Group 0: Spectral Buffers (bindings 6-9)
// ============================================================
// These are ping-pong buffers for per-layer processing

/// Input spectral buffer (16 wavelengths per pixel, f16)
@group(0) @binding(6) var<storage, read_write> spectralInput: array<f16>;

/// Output spectral buffer (transmitted + direct emission)
@group(0) @binding(7) var<storage, read_write> spectralOutput: array<f16>;

/// Unified aura buffer (scatter + emission for blur)
@group(0) @binding(8) var<storage, read_write> scatterSource: array<f16>;

/// Blurred transmitted light for in-shape scatter
@group(0) @binding(9) var<storage, read_write> blurredTransmitted: array<f16>;

// ============================================================
// Bind Group 1: Material Textures
// ============================================================
// 2D atlas textures: X=wavelength, Y=material index

/// High-resolution material transmission (4500 samples, 0.2nm bins)
@group(1) @binding(0) var materialPalette: texture_2d<f32>;
@group(1) @binding(1) var materialSampler: sampler;

/// Fluorescence excitation efficiency (UV absorption -> fluorescence)
@group(1) @binding(2) var fluorExcitationPalette: texture_2d<f32>;

/// Fluorescence emission spectrum (normalized)
@group(1) @binding(3) var fluorEmissionPalette: texture_2d<f32>;

/// Low-resolution textures for rendering (32 samples, bin-integrated)
@group(1) @binding(4) var renderMaterialPalette: texture_2d<f32>;
@group(1) @binding(5) var renderExcitationPalette: texture_2d<f32>;
@group(1) @binding(6) var renderEmissionPalette: texture_2d<f32>;

/// Reflection textures (surface property, not depth-dependent)
@group(1) @binding(7) var reflectionPalette: texture_2d<f32>;      // High-res
@group(1) @binding(8) var renderReflectionPalette: texture_2d<f32>; // Low-res

// ============================================================
// Bind Group 2: CIE Color Matching Functions
// ============================================================
// 2D textures with height=1 for wavelength lookup

/// CIE X, Y, Z color matching functions
@group(2) @binding(0) var cieXTexture: texture_2d<f32>;
@group(2) @binding(1) var cieYTexture: texture_2d<f32>;
@group(2) @binding(2) var cieZTexture: texture_2d<f32>;
@group(2) @binding(3) var cieSampler: sampler;

/// CIE scale factors (x, y, z, unused)
@group(2) @binding(4) var<uniform> cieScales: vec4<f32>;

// ============================================================
// Bind Group 3: Shape Mask Texture Arrays
// ============================================================
// Separate arrays for MSDF (edges) and Alpha (intensity) at two resolutions

/// Small MSDF masks (256x256) - circle, rectangle, triangle, etc.
@group(3) @binding(0) var msdfArraySmall: texture_2d_array<f32>;

/// Large MSDF masks (1280x720) - circle-grid, diagonal-circle-grid, etc.
@group(3) @binding(1) var msdfArrayLarge: texture_2d_array<f32>;

/// Mask sampler (linear filtering for smooth interpolation)
@group(3) @binding(2) var msdfSampler: sampler;

/// Small alpha masks (256x256) - grayscale intensity modulation
@group(3) @binding(3) var alphaArraySmall: texture_2d_array<f32>;

/// Large alpha masks (1280x720) - grayscale intensity modulation
@group(3) @binding(4) var alphaArrayLarge: texture_2d_array<f32>;

// ============================================================
// Workgroup Shared Memory
// ============================================================

/// Shared memory for tiled blur operations
/// Size: BLUR_SHARED_WIDTH * SPECTRAL_SAMPLES = 96 * 16 = 1536 f16 values
var<workgroup> blurTile: array<f16, 1536u>;
