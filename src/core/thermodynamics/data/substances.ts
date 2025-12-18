/**
 * Reference Substance Data
 *
 * Complete thermodynamic property data for common substances.
 * All values sourced from NIST, CRC Handbook, and peer-reviewed literature.
 *
 * Design: docs/thermodynamics/02_Substance_Model.md
 * Data sources: docs/thermodynamics/22_Data_Sources.md
 */

import type { Substance } from '../types';

/**
 * Water (H₂O)
 *
 * Primary reference substance for the thermodynamics system.
 * Links to the existing 'water' spectral material.
 *
 * Sources:
 * - NIST Chemistry WebBook
 * - CRC Handbook of Chemistry and Physics, 97th Edition
 */
export const WATER: Substance = {
  // Identity
  id: 'H2O',
  name: 'Water',
  formula: 'H₂O',
  casNumber: '7732-18-5',

  // Molar mass (IUPAC 2016)
  molarMass: 18.01528,

  // Liquid molar volume (at 25°C, 1 atm)
  // V_m = M / ρ = 18.01528 g/mol / 997.05 g/L = 0.018069 L/mol
  molarVolumeLiquid: 0.018069,
  molarVolumeLiquidRefTemp: 298.15,

  // Density (at 25°C)
  density: 997.05, // kg/m³
  densityRefTemp: 298.15,
  thermalExpansion: 2.57e-4, // 1/K

  // Heat capacity (at 25°C)
  heatCapacityCp: 75.385, // J/(mol·K)
  shomate: {
    // NIST Shomate coefficients for liquid water (298-500K)
    A: -203.606,
    B: 1523.29,
    C: -3196.413,
    D: 2474.455,
    E: 3.855326,
    validRangeK: [298, 500],
  },

  // Thermal conductivity (at 25°C)
  thermalConductivity: 0.607, // W/(m·K)
  thermalConductivityRefTemp: 298.15,

  // Enthalpy of vaporization
  enthalpyVaporization: 40.66, // kJ/mol at boiling point
  enthalpyVaporizationTemp: 373.15,

  // Viscosity (at 25°C)
  viscosity: 0.00089, // Pa·s = 0.89 cP
  viscosityRefTemp: 298.15,
  andrade: {
    A: 2.414e-5, // Pa·s
    B: 570.58, // K
  },

  // Diffusion (self-diffusion at 25°C)
  diffusionCoefficient: 2.3e-9, // m²/s
  diffusionRefTemp: 298.15,
  molecularRadius: 1.38e-10, // m (effective radius)

  // Surface tension (at 25°C)
  surfaceTension: 0.07197, // N/m = 71.97 mN/m
  surfaceTensionRefTemp: 298.15,
  surfaceTensionTempCoeff: -1.56e-4, // N/(m·K)

  // Parachor
  parachor: 51.0, // (mN/m)^(1/4) × (cm³/mol)

  // Phase transitions
  boilingPoint: 373.15, // K (100°C)
  freezingPoint: 273.15, // K (0°C)
  triplePointTemp: 273.16, // K
  triplePointPressure: 0.61173, // kPa

  // Critical properties
  criticalTemperature: 647.1, // K
  criticalPressure: 22064, // kPa
  criticalVolume: 0.0559, // L/mol
  acentricFactor: 0.344,

  // Antoine equation (P in mmHg, T in °C)
  antoine: {
    A: 8.07131,
    B: 1730.63,
    C: 233.426,
    pressureUnit: 'mmHg',
    temperatureUnit: 'C',
    validRange: [1, 100],
  },

  // Colligative constants (as solvent)
  ebullioscopicConstant: 0.512, // K·kg/mol
  cryoscopicConstant: 1.86, // K·kg/mol

  // Electrical properties
  dielectricConstant: 78.4,
  dielectricRefTemp: 298.15,
  dielectricTempCoeff: -0.0046, // 1/K
  dipoleMoment: 1.85, // Debye

  // Link to spectral rendering material
  spectralMaterialId: 'water',
};

/**
 * Ethanol (C₂H₅OH)
 *
 * Second reference substance, miscible with water.
 * Important for demonstrating non-ideal mixing.
 *
 * Sources:
 * - NIST Chemistry WebBook
 * - CRC Handbook of Chemistry and Physics
 * - DECHEMA
 */
export const ETHANOL: Substance = {
  // Identity
  id: 'C2H5OH',
  name: 'Ethanol',
  formula: 'C₂H₅OH',
  casNumber: '64-17-5',

  // Molar mass
  molarMass: 46.06844,

  // Liquid molar volume (at 25°C, 1 atm)
  // V_m = M / ρ = 46.06844 / 789.3 = 0.058392 L/mol
  molarVolumeLiquid: 0.058392,
  molarVolumeLiquidRefTemp: 298.15,

  // Density (at 25°C)
  density: 789.3, // kg/m³
  densityRefTemp: 298.15,
  thermalExpansion: 1.09e-3, // 1/K

  // Heat capacity (at 25°C)
  heatCapacityCp: 112.3, // J/(mol·K)
  shomate: {
    // Shomate coefficients for liquid ethanol
    A: -86.926,
    B: 969.4,
    C: -1695.1,
    D: 1102.4,
    E: 0.7,
    validRangeK: [159, 514],
  },

  // Thermal conductivity (at 25°C)
  thermalConductivity: 0.171, // W/(m·K)
  thermalConductivityRefTemp: 298.15,

  // Enthalpy of vaporization
  enthalpyVaporization: 38.56, // kJ/mol at boiling point
  enthalpyVaporizationTemp: 351.44,

  // Viscosity (at 25°C)
  viscosity: 0.001074, // Pa·s = 1.074 cP
  viscosityRefTemp: 298.15,
  andrade: {
    A: 5.13e-6, // Pa·s
    B: 1013, // K
  },

  // Diffusion (self-diffusion at 25°C)
  diffusionCoefficient: 1.08e-9, // m²/s
  diffusionRefTemp: 298.15,
  molecularRadius: 2.2e-10, // m

  // Surface tension (at 25°C)
  surfaceTension: 0.02197, // N/m = 21.97 mN/m
  surfaceTensionRefTemp: 298.15,
  surfaceTensionTempCoeff: -8.3e-5, // N/(m·K)

  // Parachor
  parachor: 125.3, // (mN/m)^(1/4) × (cm³/mol)

  // Phase transitions
  boilingPoint: 351.44, // K (78.29°C)
  freezingPoint: 159.0, // K (-114.15°C)

  // Critical properties
  criticalTemperature: 513.9, // K
  criticalPressure: 6148, // kPa
  criticalVolume: 0.167, // L/mol
  acentricFactor: 0.644,

  // Antoine equation (P in mmHg, T in °C)
  antoine: {
    A: 8.20417,
    B: 1642.89,
    C: 230.3,
    pressureUnit: 'mmHg',
    temperatureUnit: 'C',
    validRange: [-57, 80],
  },

  // Colligative constants (as solvent)
  ebullioscopicConstant: 1.22, // K·kg/mol
  // Cryoscopic constant not commonly used for ethanol

  // Electrical properties
  dielectricConstant: 24.5,
  dielectricRefTemp: 298.15,
  dielectricTempCoeff: -0.0041, // 1/K
  dipoleMoment: 1.69, // Debye

  // Link to spectral rendering material (TODO: create ethanol material)
  spectralMaterialId: undefined, // Will use water material with adjusted properties for now
};

/**
 * All reference substances for easy registration.
 */
export const REFERENCE_SUBSTANCES: Substance[] = [WATER, ETHANOL];

/**
 * Get a substance by ID from the reference set.
 */
export function getReferenceSubstance(id: string): Substance | undefined {
  return REFERENCE_SUBSTANCES.find((s) => s.id === id);
}
