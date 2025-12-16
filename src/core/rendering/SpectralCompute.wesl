/**
 * SpectralCompute - Main WESL Module
 * 
 * Root module that imports and re-exports all spectral compute pipeline modules.
 * This file serves as the entry point for the WESL linker.
 * 
 * Architecture:
 * - Core: constants, structs, bindings
 * - Physics: planck, scattering, materials, fluorescence, background, layer
 * - Rendering: msdf, color, blur, ambient
 * - Entry Points: main, spectrum, blur-passes, combine
 * 
 * Usage:
 *   import wgsl from "./SpectralCompute.wesl?static";
 *   const shaderModule = device.createShaderModule({ code: wgsl });
 */

// ============================================================
// Core Modules
// ============================================================

// Physical constants and rendering parameters
import spectral::constants;

// Data structures (Params, Shape, etc.)
import spectral::structs;

// GPU buffer and texture bindings
import spectral::bindings;

// ============================================================
// Physics Modules
// ============================================================

// Planck radiation and Kirchhoff emission
import spectral::physics::planck;

// Rayleigh and Mie scattering
import spectral::physics::scattering;

// Material texture sampling
import spectral::physics::materials;

// Fluorescence excitation and emission
import spectral::physics::fluorescence;

// Background illumination modes
import spectral::physics::background;

// Combined layer physics (SINGLE SOURCE OF TRUTH)
import spectral::physics::layer;

// ============================================================
// Rendering Modules
// ============================================================

// MSDF shape mask rendering
import spectral::rendering::msdf;

// CIE color matching and XYZ→sRGB conversion
import spectral::rendering::color;

// Gaussian blur kernels and shared memory operations
import spectral::rendering::blur;

// Ambient light and pattern rendering
import spectral::rendering::ambient;

// ============================================================
// Entry Point Modules
// ============================================================

// Main compute entry points (integrateSpectrum, main)
import spectral::entry::main;

// High-resolution spectrum computation
import spectral::entry::spectrum;

// Separable blur passes
import spectral::entry::blur_passes;

// Light combination (scattered, transmitted, ambient)
import spectral::entry::combine;

