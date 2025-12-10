/**
 * Physical Absorption Data
 * 
 * Empirical absorption coefficient data from scientific literature.
 * All values are in m^-1 (per meter) for consistency.
 */

/**
 * Absorption data point
 */
export interface AbsorptionDataPoint {
  /** Wavelength in nanometers */
  wavelength: number;
  /** Absorption coefficient in m^-1 */
  extinction: number;
}

/**
 * Pure Water Absorption Coefficients
 * 
 * Data from Pope & Fry (1997) "Absorption spectrum (380-700 nm) of pure water"
 * Applied Optics, Vol. 36, Issue 33, pp. 8710-8723
 * 
 * These values represent intrinsic absorption of pure H2O due to
 * vibrational overtone transitions of O-H bonds.
 * 
 * Key features:
 * - Minimum absorption near 418 nm (0.0044 m^-1)
 * - Increasing absorption toward red/infrared
 * - This is why deep water appears blue
 */
export const PURE_WATER_ABSORPTION: AbsorptionDataPoint[] = [
  // UV-visible boundary
  { wavelength: 380, extinction: 0.0142 },
  { wavelength: 390, extinction: 0.0100 },
  { wavelength: 400, extinction: 0.0068 },
  { wavelength: 410, extinction: 0.0050 },
  { wavelength: 418, extinction: 0.0044 }, // Minimum absorption
  { wavelength: 420, extinction: 0.0045 },
  { wavelength: 430, extinction: 0.0053 },
  { wavelength: 440, extinction: 0.0064 },
  { wavelength: 450, extinction: 0.0094 },
  { wavelength: 460, extinction: 0.0098 },
  { wavelength: 470, extinction: 0.0106 },
  { wavelength: 480, extinction: 0.0127 },
  { wavelength: 490, extinction: 0.0150 },
  { wavelength: 500, extinction: 0.0257 },
  { wavelength: 510, extinction: 0.0357 },
  { wavelength: 520, extinction: 0.0477 },
  { wavelength: 530, extinction: 0.0507 },
  { wavelength: 540, extinction: 0.0558 },
  { wavelength: 550, extinction: 0.0638 },
  { wavelength: 560, extinction: 0.0708 },
  { wavelength: 570, extinction: 0.0799 },
  { wavelength: 580, extinction: 0.1080 },
  { wavelength: 590, extinction: 0.1570 },
  { wavelength: 600, extinction: 0.2440 },
  { wavelength: 610, extinction: 0.2890 },
  { wavelength: 620, extinction: 0.3090 },
  { wavelength: 630, extinction: 0.3190 },
  { wavelength: 640, extinction: 0.3290 },
  { wavelength: 650, extinction: 0.3490 },
  { wavelength: 660, extinction: 0.4000 },
  { wavelength: 670, extinction: 0.4300 },
  { wavelength: 680, extinction: 0.4500 },
  { wavelength: 690, extinction: 0.5000 },
  { wavelength: 700, extinction: 0.6500 },
  // Near-infrared (strong absorption)
  { wavelength: 720, extinction: 1.1700 },
  { wavelength: 740, extinction: 1.7100 },
  { wavelength: 750, extinction: 2.4700 },
  { wavelength: 780, extinction: 2.5400 },
  { wavelength: 800, extinction: 2.0700 },
  { wavelength: 850, extinction: 4.2300 },
  { wavelength: 900, extinction: 6.2500 },
  { wavelength: 950, extinction: 27.900 },
  { wavelength: 1000, extinction: 36.800 },
];

/**
 * Pure Corundum (Al2O3) Absorption Coefficients
 * 
 * Synthetic sapphire/corundum is essentially transparent in the visible range.
 * Band gap ~9 eV means UV absorption below ~138 nm.
 * 
 * Data derived from optical window specifications for sapphire.
 * Absorption coefficient < 0.001 m^-1 throughout visible spectrum.
 */
export const PURE_CORUNDUM_ABSORPTION: AbsorptionDataPoint[] = [
  // Essentially transparent - near-zero absorption
  { wavelength: 200, extinction: 0.1 },    // Some UV absorption
  { wavelength: 300, extinction: 0.001 },  // Transparent by 300nm
  { wavelength: 400, extinction: 0.0001 },
  { wavelength: 500, extinction: 0.0001 },
  { wavelength: 600, extinction: 0.0001 },
  { wavelength: 700, extinction: 0.0001 },
  { wavelength: 800, extinction: 0.0001 },
  { wavelength: 1000, extinction: 0.0001 },
];

/**
 * Air (N2/O2 mixture) Absorption Coefficients
 * 
 * Air is effectively transparent in the visible spectrum.
 * Absorption is negligible (< 10^-6 m^-1).
 * 
 * Note: Rayleigh scattering is handled separately from absorption.
 * This data only covers molecular absorption.
 */
export const AIR_ABSORPTION: AbsorptionDataPoint[] = [
  // Essentially transparent throughout visible/near-IR
  { wavelength: 200, extinction: 0.01 },   // Some O2/O3 absorption
  { wavelength: 300, extinction: 0.0001 },
  { wavelength: 400, extinction: 0.000001 },
  { wavelength: 500, extinction: 0.000001 },
  { wavelength: 600, extinction: 0.000001 },
  { wavelength: 700, extinction: 0.000001 },
  { wavelength: 800, extinction: 0.000001 },
  { wavelength: 1000, extinction: 0.000001 },
];

/**
 * Physical constants for materials
 */
export const MATERIAL_CONSTANTS = {
  /** Molar concentration of pure water at 25°C (mol/L) */
  WATER_MOLAR_CONCENTRATION: 55.509,
  
  /** Molar concentration of crystalline corundum (mol/cm³ converted to mol/L) */
  CORUNDUM_MOLAR_CONCENTRATION: 39.0, // ~3.98 g/cm³, 101.96 g/mol
  
  /** Molar concentration of air at STP (mol/L) */
  AIR_MOLAR_CONCENTRATION: 0.0446, // 1 atm, 273K: n/V = P/RT
  
  /** Average molecular weight of air (N2/O2 mix) */
  AIR_MOLECULAR_WEIGHT: 28.97,
  
  /** Molecular weight of water */
  WATER_MOLECULAR_WEIGHT: 18.015,
  
  /** Molecular weight of corundum (Al2O3) */
  CORUNDUM_MOLECULAR_WEIGHT: 101.96,
};

