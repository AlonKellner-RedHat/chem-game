/**
 * Material Interface
 * 
 * Mole fraction-based material system for P4.
 * Each material has a base absorption (water, corundum, air) and
 * additive molecules with mole fractions that sum to less than 100%.
 * The base material fills the remainder to maintain 100% total.
 */

import { getBandGapTransmission } from '../physics/bandgap';
import { voigtProfile, voigtFWHM } from '../physics/voigt';
import { getExcitationEfficiency, getEmissionLineShape } from '../physics/fluorescence';
import { integrateVoigtOverBin, integrateGaussianOverBin } from '../physics/integration';
import { AbsorptionModel, BaseMaterialAbsorption, MoleculeAbsorption } from './AbsorptionModel';
import { AbsorptionDataPoint } from './AbsorptionData';

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
 * Fluorescence band definition (OCP extension)
 * 
 * Describes UV excitation → visible emission for a molecule.
 * Must satisfy Stokes shift: emission wavelength > excitation wavelength
 */
export interface FluorescenceBand {
  /** Minimum excitation wavelength (nm) - start of excitation range */
  excitationMin: number;
  /** Maximum excitation wavelength (nm) - end of excitation range */
  excitationMax: number;
  /** Peak excitation wavelength (nm) - center of Gaussian excitation profile */
  excitationPeak: number;
  /** Emission line center wavelength (nm) - must be > excitationPeak (Stokes shift) */
  emissionWavelength: number;
  /** Emission line natural width (nm) - FWHM for Voigt profile */
  emissionWidth: number;
  /** Quantum yield (0-1) - fraction of absorbed photons that result in emission */
  quantumYield: number;
}

/**
 * Result of fluorescence band validation
 */
export interface FluorescenceValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate a fluorescence band for physical correctness
 * 
 * @param band - The fluorescence band to validate
 * @returns Validation result with error message if invalid
 */
export function validateFluorescenceBand(band: FluorescenceBand): FluorescenceValidationResult {
  // Quantum yield must be in [0, 1]
  if (band.quantumYield < 0 || band.quantumYield > 1) {
    return { valid: false, error: 'Invalid quantum yield: must be in range [0, 1]' };
  }
  
  // Excitation range must be valid (min <= max)
  if (band.excitationMin > band.excitationMax) {
    return { valid: false, error: 'Invalid excitation range: min must be <= max' };
  }
  
  // Excitation peak must be within excitation range
  if (band.excitationPeak < band.excitationMin || band.excitationPeak > band.excitationMax) {
    return { valid: false, error: 'Invalid excitation peak: must be within excitation range' };
  }
  
  // Stokes shift: emission must be at longer wavelength than excitation (or equal for resonance)
  if (band.emissionWavelength < band.excitationPeak) {
    return { valid: false, error: 'Stokes shift violation: emission wavelength must be >= excitation peak' };
  }
  
  // Emission width must be positive
  if (band.emissionWidth <= 0) {
    return { valid: false, error: 'Invalid emission width: must be positive' };
  }
  
  return { valid: true };
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
  /** Optional fluorescence bands (UV excitation → visible emission) */
  fluorescence?: FluorescenceBand[];
}

// Physical constants for Doppler broadening
const SPEED_OF_LIGHT = 2.99792458e8; // m/s
const BOLTZMANN_CONST = 1.380649e-23; // J/K
const AMU_TO_KG = 1.6605390666e-27; // kg per atomic mass unit
const LN2 = Math.log(2);

/**
 * Calculate Doppler-broadened linewidth
 * FWHM_doppler = (2λ/c) * sqrt(2kT*ln(2)/m)
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
  
  const dopplerFWHM_M = (2 * wavelengthM / SPEED_OF_LIGHT) * 
    Math.sqrt(2 * BOLTZMANN_CONST * temperatureK * LN2 / massKg);
  
  return dopplerFWHM_M * 1e9;
}

/**
 * Calculate pressure-broadened linewidth
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
 */
function calculateLinewidthComponents(
  peak: AbsorptionPeak,
  temperatureK: number,
  massAMU: number,
  pressureAtm: number,
  pressureCoefficient: number
): { gaussian: number; lorentzian: number } {
  const doppler = calculateDopplerWidth(peak.wavelength, temperatureK, massAMU);
  const natural = peak.naturalWidth;
  const pressure = calculatePressureWidth(pressureAtm, pressureCoefficient);
  const lorentzian = natural + pressure;
  
  return { gaussian: doppler, lorentzian };
}

/**
 * Material properties that can be adjusted
 */
export interface MaterialProperties {
  /** 
   * Molecule mole fractions (0-1) keyed by molecule id.
   * Sum must be <= 1.0. The base material fills the remainder.
   */
  moleFractions: Record<string, number>;
  
  /** 
   * @deprecated Use moleFractions instead. Kept for backward compatibility.
   * Molecule concentrations (mol/L) keyed by molecule id 
   */
  concentrations?: Record<string, number>;
  
  /** Path length through material (cm) */
  pathLength: number;
  /** Temperature (K) for emission and Doppler broadening calculations */
  temperature: number;
  /** Pressure (atm) for collisional/pressure broadening */
  pressure: number;
}

/**
 * Material definition (OCP: Open for extension, closed for modification)
 */
export interface Material {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Available additive molecules */
  molecules: Molecule[];
  /** Band gap (eV) */
  bandGap: number;
  /** UV cutoff wavelength (nm) */
  uvCutoff: number;
  
  /** Base material absorption model (OCP) */
  baseAbsorption: AbsorptionModel;
  
  /** Molar concentration of pure base material (mol/L) */
  baseMolarConcentration: number;
  
  /**
   * Calculate the mole fraction of the base material
   * Base fraction = 1 - sum(additive mole fractions)
   * 
   * @throws Error if total additive fractions exceed 1.0
   */
  getBaseMoleFraction(properties: MaterialProperties): number;
  
  /**
   * Generate transmission spectrum using mole fraction weighted absorption
   * @param wavelengthMin - Minimum wavelength (nm)
   * @param wavelengthMax - Maximum wavelength (nm)
   * @param resolution - Number of samples
   * @param properties - Material properties with mole fractions
   * @returns Transmission spectrum (0-1 for each wavelength)
   */
  generateTransmissionSpectrum(
    wavelengthMin: number,
    wavelengthMax: number,
    resolution: number,
    properties: MaterialProperties
  ): Float32Array;
  
  /**
   * Generate fluorescence textures for GPU rendering
   * 
   * Returns excitation efficiency and emission spectrum textures that
   * can be uploaded to the GPU for real-time fluorescence simulation.
   * 
   * @param wavelengthMin - Minimum wavelength (nm)
   * @param wavelengthMax - Maximum wavelength (nm)
   * @param resolution - Number of samples
   * @param properties - Material properties with mole fractions
   * @returns Object with excitation/emission textures and total quantum yield
   */
  generateFluorescenceTextures(
    wavelengthMin: number,
    wavelengthMax: number,
    resolution: number,
    properties: MaterialProperties
  ): {
    excitation: Float32Array;
    emission: Float32Array;
    totalQuantumYield: number;
  };
}

/**
 * Calculate transmission using Beer-Lambert law
 * T = exp(-α × l) where α is absorption coefficient in m^-1, l in meters
 * 
 * For mole fraction weighted absorption:
 * α_total = sum(χ_i × α_i) where χ_i is mole fraction
 */
function beerLambertNatural(
  absorptionCoeff: number,  // m^-1
  pathLengthCm: number
): number {
  if (absorptionCoeff <= 0 || pathLengthCm <= 0) {
    return 1.0;
  }
  const pathLengthM = pathLengthCm / 100;
  return Math.exp(-absorptionCoeff * pathLengthM);
}

/**
 * Calculate transmission using Beer-Lambert law (base 10)
 * T = 10^(-ε × c × l)
 * Used for molecular extinction coefficients
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
 * Calculate extinction coefficient at wavelength using Voigt profile peaks
 * (Point sampling - used for high-resolution textures)
 */
function calculateMoleculeExtinction(
  wavelength: number,
  molecule: Molecule,
  temperatureK: number,
  pressureAtm: number
): number {
  let total = 0;
  
  for (const peak of molecule.peaks) {
    const { gaussian, lorentzian } = calculateLinewidthComponents(
      peak,
      temperatureK,
      molecule.mass,
      pressureAtm,
      molecule.pressureBroadening
    );
    
    const diff = wavelength - peak.wavelength;
    const voigtValue = voigtProfile(diff, gaussian, lorentzian);
    const peakVoigt = voigtProfile(0, gaussian, lorentzian);
    const normalizedShape = peakVoigt > 0 ? voigtValue / peakVoigt : 0;
    
    total += peak.extinction * normalizedShape;
  }
  
  return total;
}

/**
 * Calculate bin-integrated extinction coefficient over a wavelength range
 * 
 * This integrates the Voigt profile over the bin range to ensure narrow peaks
 * are captured even when the bin center misses the peak.
 * 
 * For energy conservation: the sum of bin extinctions × binWidth should equal
 * the total analytical integral of the extinction spectrum.
 * 
 * @param binStart - Start wavelength of bin (nm)
 * @param binEnd - End wavelength of bin (nm)
 * @param molecule - Molecule with absorption peaks
 * @param temperatureK - Temperature in Kelvin (affects Doppler width)
 * @param pressureAtm - Pressure in atm (affects pressure broadening)
 * @returns Average extinction coefficient over the bin
 */
function calculateMoleculeExtinctionBinIntegrated(
  binStart: number,
  binEnd: number,
  molecule: Molecule,
  temperatureK: number,
  pressureAtm: number
): number {
  const binWidth = binEnd - binStart;
  if (binWidth <= 0) return 0;
  
  let totalIntegratedExtinction = 0;
  
  for (const peak of molecule.peaks) {
    const { gaussian, lorentzian } = calculateLinewidthComponents(
      peak,
      temperatureK,
      molecule.mass,
      pressureAtm,
      molecule.pressureBroadening
    );
    
    // Integrate the Voigt profile over the bin
    // This returns the fraction of the total profile area in this bin
    const fractionInBin = integrateVoigtOverBin(
      peak.wavelength,
      binStart,
      binEnd,
      gaussian,
      lorentzian
    );
    
    // The extinction contribution is the peak extinction × fraction in bin
    // Divided by bin width to get average extinction over the bin
    // (This ensures Beer-Lambert law works correctly with the integrated value)
    totalIntegratedExtinction += peak.extinction * fractionInBin / binWidth;
  }
  
  return totalIntegratedExtinction;
}

/**
 * Create a material with mole fraction based composition
 * 
 * @param id - Unique identifier
 * @param name - Display name  
 * @param molecules - Additive molecules (solutes/dopants)
 * @param bandGap - Band gap in eV
 * @param uvCutoff - UV cutoff wavelength in nm
 * @param baseAbsorptionData - Empirical absorption data for base material
 * @param baseMolarConcentration - Molar concentration of pure base (mol/L)
 */
export function createMaterial(
  id: string,
  name: string,
  molecules: Molecule[],
  bandGap: number,
  uvCutoff: number,
  baseAbsorptionData: AbsorptionDataPoint[] = [],
  baseMolarConcentration: number = 1.0
): Material {
  const baseAbsorption = new BaseMaterialAbsorption(`pure-${id}`, baseAbsorptionData);
  
  return {
    id,
    name,
    molecules,
    bandGap,
    uvCutoff,
    baseAbsorption,
    baseMolarConcentration,
    
    getBaseMoleFraction(properties: MaterialProperties): number {
      // Get mole fractions, falling back to empty object
      const fractions = properties.moleFractions || {};
      
      // Sum all additive mole fractions
      const totalAdditiveFraction = Object.values(fractions).reduce((sum, f) => sum + (f || 0), 0);
      
      // Validate total doesn't exceed 1.0
      if (totalAdditiveFraction > 1.0 + 1e-10) {
        throw new Error(
          `Total mole fractions (${totalAdditiveFraction.toFixed(4)}) exceed 1.0. ` +
          `Cannot have more than 100% composition.`
        );
      }
      
      // Base fraction fills the remainder
      return Math.max(0, 1.0 - totalAdditiveFraction);
    },
    
    generateTransmissionSpectrum(
      wavelengthMin: number,
      wavelengthMax: number,
      resolution: number,
      properties: MaterialProperties
    ): Float32Array {
      const spectrum = new Float32Array(resolution);
      const step = (wavelengthMax - wavelengthMin) / (resolution - 1);
      
      // Get mole fractions (support both old and new API)
      const fractions = properties.moleFractions || {};
      const concentrations = properties.concentrations || {};
      
      // Calculate base mole fraction
      const baseFraction = this.getBaseMoleFraction(properties);
      
      for (let i = 0; i < resolution; i++) {
        const wavelength = wavelengthMin + i * step;
        let transmission = 1.0;
        
        // Band gap absorption
        transmission *= getBandGapTransmission(wavelength, bandGap, uvCutoff);
        
        // Base material absorption (mole fraction weighted)
        // α_base = χ_base × α_pure_base
        if (baseFraction > 0 && baseAbsorptionData.length > 0) {
          const baseExtinction = baseAbsorption.getExtinction(
            wavelength,
            properties.temperature,
            properties.pressure
          );
          // Weight by base mole fraction
          const weightedExtinction = baseFraction * baseExtinction;
          transmission *= beerLambertNatural(weightedExtinction, properties.pathLength);
        }
        
        // Additive molecule absorption (mole fraction weighted)
        // Use bin-integrated extinction for proper energy conservation
        const binStart = wavelength - step / 2;
        const binEnd = wavelength + step / 2;
        
        for (const molecule of molecules) {
          // Support both mole fractions and legacy concentrations
          const moleFraction = fractions[molecule.id] || 0;
          const legacyConc = concentrations[molecule.id] || 0;
          
          if (moleFraction > 0 || legacyConc > 0) {
            // Use bin-integrated extinction to capture narrow peaks
            const extinction = calculateMoleculeExtinctionBinIntegrated(
              binStart,
              binEnd,
              molecule,
              properties.temperature,
              properties.pressure
            );
            
            if (moleFraction > 0) {
              // New system: mole fraction weighted
              // Convert mole fraction to effective concentration
              const effectiveConc = moleFraction * baseMolarConcentration;
              transmission *= beerLambert(extinction, effectiveConc, properties.pathLength);
            } else if (legacyConc > 0) {
              // Legacy system: direct concentration
              transmission *= beerLambert(extinction, legacyConc, properties.pathLength);
            }
          }
        }
        
        spectrum[i] = Math.max(0, Math.min(1, transmission));
      }
      
      return spectrum;
    },
    
    generateFluorescenceTextures(
      wavelengthMin: number,
      wavelengthMax: number,
      resolution: number,
      properties: MaterialProperties
    ): {
      excitation: Float32Array;
      emission: Float32Array;
      totalQuantumYield: number;
    } {
      const excitation = new Float32Array(resolution);
      const emission = new Float32Array(resolution);
      const step = (wavelengthMax - wavelengthMin) / (resolution - 1);
      
      // Get mole fractions
      const fractions = properties.moleFractions || {};
      
      // Collect all fluorescence bands with their weights
      let totalQuantumYield = 0;
      let bandCount = 0;
      
      // Pre-calculate emission peak values for normalization
      const emissionPeakValues: Map<FluorescenceBand, number> = new Map();
      
      for (const molecule of molecules) {
        const moleFraction = fractions[molecule.id] || 0;
        if (moleFraction <= 0 || !molecule.fluorescence) {
          continue;
        }
        
        for (const band of molecule.fluorescence) {
          const peakEmission = getEmissionLineShape(
            band.emissionWavelength,
            band,
            properties.temperature
          );
          emissionPeakValues.set(band, peakEmission);
          totalQuantumYield += band.quantumYield;
          bandCount++;
        }
      }
      
      // Average quantum yield
      if (bandCount > 0) {
        totalQuantumYield /= bandCount;
      }
      
      // Generate textures with bin integration for narrow emission lines
      for (let i = 0; i < resolution; i++) {
        const wavelength = wavelengthMin + i * step;
        const binStart = wavelength - step / 2;
        const binEnd = wavelength + step / 2;
        
        let excitationTotal = 0;
        let emissionTotal = 0;
        
        for (const molecule of molecules) {
          const moleFraction = fractions[molecule.id] || 0;
          if (moleFraction <= 0 || !molecule.fluorescence) {
            continue;
          }
          
          for (const band of molecule.fluorescence) {
            // Excitation efficiency (weighted by mole fraction)
            // Excitation bands are broad (~70nm), so point sampling is OK
            // But use bin integration for consistency
            const excitEff = integrateGaussianOverBin(
              band.excitationPeak,
              binStart,
              binEnd,
              band.excitationMax - band.excitationMin // Approximate FWHM
            );
            excitationTotal += excitEff * moleFraction;
            
            // Emission line shape (weighted by mole fraction and quantum yield)
            // Emission lines are VERY narrow (~0.1nm), so bin integration is critical
            // For a normalized Voigt profile, integrateVoigtOverBin returns the
            // fraction of total energy in this bin. This is what we want.
            const gaussianWidth = 0.001; // Approximate Doppler width at room temp
            const lorentzianWidth = band.emissionWidth;
            
            const emissionInBin = integrateVoigtOverBin(
              band.emissionWavelength,
              binStart,
              binEnd,
              gaussianWidth,
              lorentzianWidth
            );
            
            // Scale by quantum yield and mole fraction
            emissionTotal += emissionInBin * band.quantumYield * moleFraction;
          }
        }
        
        excitation[i] = Math.max(0, excitationTotal);
        emission[i] = Math.max(0, emissionTotal);
      }
      
      return {
        excitation,
        emission,
        totalQuantumYield,
      };
    },
  };
}

/**
 * Create default properties for a material
 * 
 * @param material - The material to create properties for
 * @param defaultMoleFraction - Default mole fraction for each additive (0-1)
 * @param pathLength - Path length in cm
 * @param temperature - Temperature in Kelvin
 * @param pressure - Pressure in atmospheres
 */
export function createDefaultProperties(
  material: Material,
  defaultMoleFraction: number = 0.0001,  // 0.01% default
  pathLength: number = 1.0,
  temperature: number = 300,
  pressure: number = 1.0
): MaterialProperties {
  const moleFractions: Record<string, number> = {};
  
  for (const molecule of material.molecules) {
    moleFractions[molecule.id] = defaultMoleFraction;
  }
  
  return {
    moleFractions,
    pathLength,
    temperature,
    pressure,
  };
}
