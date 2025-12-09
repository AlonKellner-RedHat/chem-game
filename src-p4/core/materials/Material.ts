/**
 * Material Interface
 * 
 * Simplified material system for P4.
 * Each material generates a transmission spectrum based on
 * molecule concentrations and base material properties.
 */

import { getBandGapTransmission } from '../physics/bandgap';
import { voigtProfile, voigtFWHM } from '../physics/voigt';

/**
 * Absorption peak definition
 */
export interface AbsorptionPeak {
  /** Peak wavelength (nm) */
  wavelength: number;
  /** Peak extinction coefficient (L/(mol·cm)) */
  extinction: number;
  /** Natural FWHM bandwidth at 0K (nm) - intrinsic linewidth */
  naturalWidth: number;
}

/**
 * Molecule definition
 */
export interface Molecule {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Absorption peaks */
  peaks: AbsorptionPeak[];
  /** Atomic/molecular mass in atomic mass units (u) for Doppler broadening */
  mass: number;
  /** Pressure broadening coefficient (nm/atm) for collisional broadening */
  pressureBroadening: number;
}

// Physical constants for Doppler broadening
const SPEED_OF_LIGHT = 2.99792458e8; // m/s
const BOLTZMANN_CONST = 1.380649e-23; // J/K
const AMU_TO_KG = 1.6605390666e-27; // kg per atomic mass unit
const LN2 = Math.log(2);

/**
 * Calculate Doppler-broadened linewidth
 * FWHM_doppler = (2λ/c) * sqrt(2kT*ln(2)/m)
 * 
 * @param wavelengthNm - Peak wavelength in nm
 * @param temperatureK - Temperature in Kelvin
 * @param massAMU - Atomic/molecular mass in atomic mass units
 * @returns Doppler FWHM in nm
 */
function calculateDopplerWidth(
  wavelengthNm: number,
  temperatureK: number,
  massAMU: number
): number {
  if (temperatureK <= 0 || massAMU <= 0) {
    return 0;
  }
  
  const wavelengthM = wavelengthNm * 1e-9;
  const massKg = massAMU * AMU_TO_KG;
  
  // Doppler FWHM in meters
  const dopplerFWHM_M = (2 * wavelengthM / SPEED_OF_LIGHT) * 
    Math.sqrt(2 * BOLTZMANN_CONST * temperatureK * LN2 / massKg);
  
  // Convert to nm
  return dopplerFWHM_M * 1e9;
}

/**
 * Calculate pressure-broadened linewidth
 * FWHM_pressure = γ × P
 * where γ is the pressure broadening coefficient (nm/atm)
 * 
 * @param pressureAtm - Pressure in atmospheres
 * @param coefficient - Pressure broadening coefficient (nm/atm)
 * @returns Pressure FWHM in nm
 */
function calculatePressureWidth(
  pressureAtm: number,
  coefficient: number
): number {
  if (pressureAtm <= 0 || coefficient <= 0) {
    return 0;
  }
  return coefficient * pressureAtm;
}

/**
 * Calculate linewidth components for Voigt profile
 * 
 * Returns separate Gaussian (Doppler) and Lorentzian (natural + pressure) widths
 * for use with the true Voigt profile calculation.
 */
function calculateLinewidthComponents(
  peak: AbsorptionPeak,
  temperatureK: number,
  massAMU: number,
  pressureAtm: number,
  pressureCoefficient: number
): { gaussian: number; lorentzian: number } {
  // Doppler broadening is Gaussian
  const doppler = calculateDopplerWidth(peak.wavelength, temperatureK, massAMU);
  
  // Natural and pressure broadening are both Lorentzian, so they add directly
  const natural = peak.naturalWidth;
  const pressure = calculatePressureWidth(pressureAtm, pressureCoefficient);
  const lorentzian = natural + pressure;
  
  return { gaussian: doppler, lorentzian };
}

/**
 * Calculate total linewidth using proper Voigt FWHM
 * 
 * Uses the Olivero-Longbothum approximation for Voigt FWHM:
 * FWHM_V ≈ 0.5346 × FWHM_L + √(0.2166 × FWHM_L² + FWHM_G²)
 */
function calculateTotalLinewidth(
  peak: AbsorptionPeak,
  temperatureK: number,
  massAMU: number,
  pressureAtm: number,
  pressureCoefficient: number
): number {
  const { gaussian, lorentzian } = calculateLinewidthComponents(
    peak, temperatureK, massAMU, pressureAtm, pressureCoefficient
  );
  
  // Use proper Voigt FWHM calculation
  return voigtFWHM(gaussian, lorentzian);
}

/**
 * Material properties that can be adjusted
 */
export interface MaterialProperties {
  /** Molecule concentrations (mol/L) keyed by molecule id */
  concentrations: Record<string, number>;
  /** Path length through material (cm) */
  pathLength: number;
  /** Temperature (K) for emission and Doppler broadening calculations */
  temperature: number;
  /** Pressure (atm) for collisional/pressure broadening */
  pressure: number;
}

/**
 * Material definition
 */
export interface Material {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Available molecules */
  molecules: Molecule[];
  /** Band gap (eV) */
  bandGap: number;
  /** UV cutoff wavelength (nm) */
  uvCutoff: number;
  
  /**
   * Generate transmission spectrum
   * @param wavelengthMin - Minimum wavelength (nm)
   * @param wavelengthMax - Maximum wavelength (nm)
   * @param resolution - Number of samples
   * @param properties - Material properties
   * @returns Transmission spectrum (0-1 for each wavelength)
   */
  generateTransmissionSpectrum(
    wavelengthMin: number,
    wavelengthMax: number,
    resolution: number,
    properties: MaterialProperties
  ): Float32Array;
}

/**
 * Calculate transmission using Beer-Lambert law
 * T = 10^(-ε × c × l)
 */
function beerLambert(
  extinction: number,
  concentration: number,
  pathLength: number
): number {
  if (extinction <= 0 || concentration <= 0 || pathLength <= 0) {
    return 1.0;
  }
  const absorbance = extinction * concentration * pathLength;
  return Math.pow(10, -absorbance);
}

/**
 * Baseline extinction coefficient for all materials
 * This ensures any material will eventually look black with enough depth
 */
const BASELINE_EXTINCTION = 0.5;

/**
 * Calculate extinction coefficient at wavelength using Voigt profile peaks
 * with temperature-dependent Doppler broadening and pressure broadening
 * 
 * The Voigt profile properly combines:
 * - Gaussian (Doppler) broadening from thermal motion
 * - Lorentzian (natural + pressure) broadening from lifetime/collisions
 * 
 * @param wavelength - Wavelength in nm
 * @param molecule - Molecule with peaks, mass, and pressure broadening coefficient
 * @param temperatureK - Temperature in Kelvin
 * @param pressureAtm - Pressure in atmospheres
 * @returns Total extinction coefficient
 */
function calculateExtinction(
  wavelength: number,
  molecule: Molecule,
  temperatureK: number,
  pressureAtm: number
): number {
  // Start with baseline extinction (every material absorbs some light)
  let total = BASELINE_EXTINCTION;
  
  for (const peak of molecule.peaks) {
    // Get separate Gaussian and Lorentzian widths for Voigt profile
    const { gaussian, lorentzian } = calculateLinewidthComponents(
      peak,
      temperatureK,
      molecule.mass,
      pressureAtm,
      molecule.pressureBroadening
    );
    
    // Distance from line center
    const diff = wavelength - peak.wavelength;
    
    // Use true Voigt profile shape
    // voigtProfile returns normalized value, scale by extinction coefficient
    const voigtValue = voigtProfile(diff, gaussian, lorentzian);
    
    // Peak extinction is defined at line center, so normalize to that
    const peakVoigt = voigtProfile(0, gaussian, lorentzian);
    const normalizedShape = peakVoigt > 0 ? voigtValue / peakVoigt : 0;
    
    total += peak.extinction * normalizedShape;
  }
  
  return total;
}

/**
 * Create a material with the given molecules
 */
export function createMaterial(
  id: string,
  name: string,
  molecules: Molecule[],
  bandGap: number,
  uvCutoff: number
): Material {
  return {
    id,
    name,
    molecules,
    bandGap,
    uvCutoff,
    
    generateTransmissionSpectrum(
      wavelengthMin: number,
      wavelengthMax: number,
      resolution: number,
      properties: MaterialProperties
    ): Float32Array {
      const spectrum = new Float32Array(resolution);
      const step = (wavelengthMax - wavelengthMin) / (resolution - 1);
      
      for (let i = 0; i < resolution; i++) {
        const wavelength = wavelengthMin + i * step;
        let transmission = 1.0;
        
        // Band gap absorption using Tauc-like model
        // Uses proper physics: λ_cutoff = hc/E_g, α ∝ (hν - E_g)²
        // Falls back to legacy UV cutoff if bandGap is not set (0)
        transmission *= getBandGapTransmission(wavelength, bandGap, uvCutoff);
        
        // Apply absorption from each molecule with temperature and pressure-dependent broadening
        for (const molecule of molecules) {
          const conc = properties.concentrations[molecule.id] || 0;
          if (conc > 0) {
            const extinction = calculateExtinction(
              wavelength,
              molecule,
              properties.temperature,
              properties.pressure
            );
            transmission *= beerLambert(extinction, conc, properties.pathLength);
          }
        }
        
        spectrum[i] = Math.max(0, Math.min(1, transmission));
      }
      
      return spectrum;
    },
  };
}

/**
 * Create default properties for a material
 */
export function createDefaultProperties(
  material: Material,
  defaultConcentration: number = 0.01,
  pathLength: number = 1.0,
  temperature: number = 300,
  pressure: number = 0.001  // Near-vacuum default (low pressure lamp)
): MaterialProperties {
  const concentrations: Record<string, number> = {};
  
  for (const molecule of material.molecules) {
    concentrations[molecule.id] = defaultConcentration;
  }
  
  return {
    concentrations,
    pathLength,
    temperature,
    pressure,
  };
}


