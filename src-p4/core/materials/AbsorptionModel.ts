/**
 * Absorption Model Interface (OCP Design)
 * 
 * This module implements the Open/Closed Principle for absorption calculations.
 * New absorption behaviors can be added by implementing the AbsorptionModel interface
 * without modifying existing code.
 */

import { AbsorptionDataPoint } from './AbsorptionData';
import { Molecule } from './Material';
import { voigtProfile } from '../physics/voigt';

/**
 * AbsorptionModel interface (OCP)
 * 
 * Any absorption mechanism can implement this interface:
 * - BaseMaterialAbsorption: interpolated from empirical data
 * - MoleculeAbsorption: calculated from peak profiles
 * - (Future) FluorescenceModel, BirefringenceModel, etc.
 */
export interface AbsorptionModel {
  /** Unique identifier for this absorption model */
  readonly id: string;
  
  /**
   * Get the extinction coefficient at a specific wavelength
   * 
   * @param wavelengthNm - Wavelength in nanometers
   * @param temperatureK - Temperature in Kelvin (for Doppler broadening)
   * @param pressureAtm - Pressure in atmospheres (for pressure broadening)
   * @returns Extinction coefficient in m^-1
   */
  getExtinction(wavelengthNm: number, temperatureK: number, pressureAtm: number): number;
}

/**
 * BaseMaterialAbsorption
 * 
 * Implements AbsorptionModel using linear interpolation of empirical absorption data.
 * Used for intrinsic absorption of base materials (water, corundum, air).
 */
export class BaseMaterialAbsorption implements AbsorptionModel {
  constructor(
    readonly id: string,
    private readonly absorptionTable: AbsorptionDataPoint[]
  ) {
    // Sort by wavelength for interpolation
    this.absorptionTable = [...absorptionTable].sort((a, b) => a.wavelength - b.wavelength);
  }
  
  /**
   * Get extinction coefficient using linear interpolation
   */
  getExtinction(wavelengthNm: number, _temperatureK: number, _pressureAtm: number): number {
    const table = this.absorptionTable;
    
    if (table.length === 0) {
      return 0;
    }
    
    // Handle out of range
    if (wavelengthNm <= table[0].wavelength) {
      return table[0].extinction;
    }
    if (wavelengthNm >= table[table.length - 1].wavelength) {
      return table[table.length - 1].extinction;
    }
    
    // Find bracketing points for interpolation
    let i = 0;
    while (i < table.length - 1 && table[i + 1].wavelength < wavelengthNm) {
      i++;
    }
    
    const lower = table[i];
    const upper = table[i + 1];
    
    // Linear interpolation
    const t = (wavelengthNm - lower.wavelength) / (upper.wavelength - lower.wavelength);
    return lower.extinction + t * (upper.extinction - lower.extinction);
  }
}

/**
 * MoleculeAbsorption
 * 
 * Implements AbsorptionModel using Voigt profile peaks.
 * Used for molecular/atomic absorption with defined spectral lines.
 */
export class MoleculeAbsorption implements AbsorptionModel {
  readonly id: string;
  
  constructor(private readonly molecule: Molecule) {
    this.id = molecule.id;
  }
  
  /**
   * Get extinction coefficient from Voigt profile peaks
   */
  getExtinction(wavelengthNm: number, temperatureK: number, pressureAtm: number): number {
    let totalExtinction = 0;
    
    for (const peak of this.molecule.peaks) {
      // Calculate Doppler (Gaussian) width from temperature
      const dopplerWidth = this.calculateDopplerWidth(
        peak.wavelength,
        temperatureK,
        this.molecule.mass
      );
      
      // Calculate pressure (Lorentzian) width
      const pressureWidth = this.molecule.pressureBroadening * pressureAtm;
      
      // Total Lorentzian = natural + pressure
      const lorentzianWidth = peak.naturalWidth + pressureWidth;
      
      // Distance from line center
      const delta = wavelengthNm - peak.wavelength;
      
      // Voigt profile value (normalized)
      const profileValue = voigtProfile(delta, dopplerWidth, lorentzianWidth);
      const peakValue = voigtProfile(0, dopplerWidth, lorentzianWidth);
      
      // Scale by peak extinction coefficient
      const normalizedProfile = peakValue > 0 ? profileValue / peakValue : 0;
      totalExtinction += peak.extinction * normalizedProfile;
    }
    
    return totalExtinction;
  }
  
  /**
   * Calculate Doppler width from temperature and mass
   * FWHM_doppler = (2λ/c) * sqrt(2kT*ln(2)/m)
   */
  private calculateDopplerWidth(
    wavelengthNm: number,
    temperatureK: number,
    massAMU: number
  ): number {
    if (temperatureK <= 0 || massAMU <= 0) {
      return 0.001; // Minimum width to avoid division by zero
    }
    
    const SPEED_OF_LIGHT = 2.99792458e8; // m/s
    const BOLTZMANN_CONST = 1.380649e-23; // J/K
    const AMU_TO_KG = 1.6605390666e-27; // kg per atomic mass unit
    const LN2 = Math.log(2);
    
    const wavelengthM = wavelengthNm * 1e-9;
    const massKg = massAMU * AMU_TO_KG;
    
    // Doppler FWHM in meters
    const dopplerFWHM_M = (2 * wavelengthM / SPEED_OF_LIGHT) * 
      Math.sqrt(2 * BOLTZMANN_CONST * temperatureK * LN2 / massKg);
    
    // Convert to nm
    return Math.max(0.001, dopplerFWHM_M * 1e9);
  }
}

/**
 * CompositeAbsorption
 * 
 * Combines multiple absorption models additively.
 * Useful for materials with both base absorption and molecular additives.
 */
export class CompositeAbsorption implements AbsorptionModel {
  readonly id: string;
  
  constructor(
    id: string,
    private readonly models: AbsorptionModel[],
    private readonly weights: number[] = []
  ) {
    this.id = id;
    
    // Default to equal weights if not specified
    if (this.weights.length === 0) {
      this.weights = models.map(() => 1.0);
    }
  }
  
  getExtinction(wavelengthNm: number, temperatureK: number, pressureAtm: number): number {
    let total = 0;
    for (let i = 0; i < this.models.length; i++) {
      const weight = this.weights[i] ?? 1.0;
      total += weight * this.models[i].getExtinction(wavelengthNm, temperatureK, pressureAtm);
    }
    return total;
  }
}

