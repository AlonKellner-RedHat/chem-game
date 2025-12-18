/**
 * Substance Model
 *
 * Pure substance data model providing thermodynamic properties for all calculations.
 * Each substance is an immutable data object.
 *
 * Design: docs/thermodynamics/02_Substance_Model.md
 */

import type { SubstanceId } from './Composition';

// ============================================================================
// Identity Properties
// ============================================================================

/**
 * Core identity properties for a substance.
 */
export interface SubstanceIdentity {
  /** Unique identifier (typically chemical formula) */
  readonly id: SubstanceId;

  /** Human-readable name */
  readonly name: string;

  /** Chemical formula with proper subscripts for display */
  readonly formula: string;

  /** CAS Registry Number (optional) */
  readonly casNumber?: string;
}

// ============================================================================
// Molar Properties (Stage 1)
// ============================================================================

/**
 * Molar mass property.
 */
export interface MolarMassProperty {
  /** Molar mass in g/mol. Exact value from atomic masses. */
  readonly molarMass: number;
}

/**
 * Liquid molar volume property.
 */
export interface LiquidMolarVolume {
  /**
   * Molar volume of liquid at reference conditions.
   * Units: L/mol
   * Reference: 25°C, 1 atm unless otherwise specified
   */
  readonly molarVolumeLiquid: number;

  /**
   * Temperature for reference molar volume.
   * Units: K
   */
  readonly molarVolumeLiquidRefTemp: number;
}

/**
 * Density property with temperature dependence.
 */
export interface DensityProperty {
  /**
   * Density at reference temperature.
   * Units: kg/m³
   */
  readonly density: number;

  /**
   * Reference temperature for density.
   * Units: K
   */
  readonly densityRefTemp: number;

  /**
   * Thermal expansion coefficient (optional).
   * Units: 1/K
   * ρ(T) = ρ_ref × [1 - α × (T - T_ref)]
   */
  readonly thermalExpansion?: number;
}

// ============================================================================
// Thermal Properties (Stage 3)
// ============================================================================

/**
 * Heat capacity property.
 */
export interface HeatCapacityProperty {
  /**
   * Molar heat capacity at constant pressure.
   * Units: J/(mol·K)
   * At reference temperature (usually 25°C)
   */
  readonly heatCapacityCp: number;

  /**
   * Shomate equation coefficients (optional, for T-dependence).
   * Cp(T) = A + B×t + C×t² + D×t³ + E/t² where t = T/1000
   */
  readonly shomate?: {
    A: number;
    B: number;
    C: number;
    D: number;
    E: number;
    validRangeK: [number, number];
  };
}

/**
 * Thermal conductivity property.
 */
export interface ThermalConductivityProperty {
  /**
   * Thermal conductivity of liquid.
   * Units: W/(m·K)
   */
  readonly thermalConductivity: number;

  /**
   * Reference temperature for conductivity.
   * Units: K
   */
  readonly thermalConductivityRefTemp: number;
}

/**
 * Vaporization enthalpy property.
 */
export interface VaporizationProperty {
  /**
   * Enthalpy of vaporization at normal boiling point.
   * Units: kJ/mol
   */
  readonly enthalpyVaporization: number;

  /**
   * Temperature for enthalpy value (usually normal boiling point).
   * Units: K
   */
  readonly enthalpyVaporizationTemp: number;
}

// ============================================================================
// Transport Properties (Stage 4)
// ============================================================================

/**
 * Viscosity property.
 */
export interface ViscosityProperty {
  /**
   * Dynamic viscosity.
   * Units: Pa·s (= kg/(m·s))
   * 1 cP = 0.001 Pa·s
   */
  readonly viscosity: number;

  /**
   * Reference temperature for viscosity.
   * Units: K
   */
  readonly viscosityRefTemp: number;

  /**
   * Andrade equation coefficients (optional).
   * η = A × exp(B / T)
   */
  readonly andrade?: {
    A: number; // Pre-exponential (Pa·s)
    B: number; // Activation parameter (K)
  };
}

/**
 * Diffusion coefficient property.
 */
export interface DiffusionProperty {
  /**
   * Self-diffusion coefficient.
   * Units: m²/s
   */
  readonly diffusionCoefficient: number;

  /**
   * Reference temperature for diffusion.
   * Units: K
   */
  readonly diffusionRefTemp: number;

  /**
   * Effective molecular radius for Stokes-Einstein.
   * Units: m
   */
  readonly molecularRadius?: number;
}

// ============================================================================
// Surface Properties (Stage 5)
// ============================================================================

/**
 * Surface tension property.
 */
export interface SurfaceTensionProperty {
  /**
   * Surface tension at liquid-air interface.
   * Units: N/m (= J/m²)
   * 1 dyn/cm = 0.001 N/m
   */
  readonly surfaceTension: number;

  /**
   * Reference temperature for surface tension.
   * Units: K
   */
  readonly surfaceTensionRefTemp: number;

  /**
   * Temperature coefficient (optional).
   * Units: N/(m·K)
   * γ(T) ≈ γ_ref - k × (T - T_ref)
   */
  readonly surfaceTensionTempCoeff?: number;
}

/**
 * Parachor for Macleod-Sugden correlation.
 */
export interface ParachorProperty {
  /**
   * Parachor for Macleod-Sugden correlation.
   * Units: (mN/m)^(1/4) × (cm³/mol)
   */
  readonly parachor: number;
}

// ============================================================================
// Phase Properties (Stage 6)
// ============================================================================

/**
 * Phase transition points.
 */
export interface PhaseTransitionProperty {
  /**
   * Normal boiling point (at 101.325 kPa).
   * Units: K
   */
  readonly boilingPoint: number;

  /**
   * Normal freezing/melting point (at 101.325 kPa).
   * Units: K
   */
  readonly freezingPoint: number;

  /**
   * Triple point temperature (optional).
   * Units: K
   */
  readonly triplePointTemp?: number;

  /**
   * Triple point pressure (optional).
   * Units: kPa
   */
  readonly triplePointPressure?: number;
}

/**
 * Critical properties.
 */
export interface CriticalProperty {
  /**
   * Critical temperature.
   * Units: K
   */
  readonly criticalTemperature: number;

  /**
   * Critical pressure.
   * Units: kPa
   */
  readonly criticalPressure: number;

  /**
   * Critical volume.
   * Units: L/mol
   */
  readonly criticalVolume: number;

  /**
   * Acentric factor (Pitzer factor).
   * Dimensionless.
   */
  readonly acentricFactor: number;
}

/**
 * Antoine equation coefficients for vapor pressure.
 */
export interface AntoineProperty {
  /**
   * Antoine equation coefficients.
   * log₁₀(P) = A - B / (T + C)
   */
  readonly antoine: {
    A: number;
    B: number;
    C: number;
    /** Pressure units for result */
    pressureUnit: 'mmHg' | 'kPa' | 'bar';
    /** Temperature units for input */
    temperatureUnit: 'C' | 'K';
    /** Valid temperature range */
    validRange: [number, number];
  };
}

/**
 * Colligative constants for solutions.
 */
export interface ColligativeProperty {
  /**
   * Ebullioscopic constant (boiling point elevation).
   * Units: K·kg/mol
   * ΔT_b = K_b × m (molality)
   */
  readonly ebullioscopicConstant?: number;

  /**
   * Cryoscopic constant (freezing point depression).
   * Units: K·kg/mol
   * ΔT_f = K_f × m (molality)
   */
  readonly cryoscopicConstant?: number;
}

/**
 * Henry's law constant for gas dissolution.
 */
export interface HenryProperty {
  /**
   * Henry's law constant for dissolution in water.
   * Units: kPa (for p = H × x formulation)
   * At reference temperature.
   */
  readonly henryConstant?: number;

  /**
   * Reference temperature for Henry's constant.
   * Units: K
   */
  readonly henryRefTemp?: number;
}

// ============================================================================
// Electrical Properties (Stage 7)
// ============================================================================

/**
 * Dielectric constant property.
 */
export interface DielectricProperty {
  /**
   * Relative dielectric constant (permittivity).
   * Dimensionless.
   */
  readonly dielectricConstant: number;

  /**
   * Reference temperature for dielectric constant.
   * Units: K
   */
  readonly dielectricRefTemp: number;

  /**
   * Temperature coefficient (optional).
   * Units: 1/K
   */
  readonly dielectricTempCoeff?: number;
}

/**
 * Dipole moment property.
 */
export interface DipoleProperty {
  /**
   * Electric dipole moment.
   * Units: Debye (D)
   */
  readonly dipoleMoment: number;
}

// ============================================================================
// Complete Substance Interface
// ============================================================================

/**
 * Complete substance definition with all thermodynamic properties.
 *
 * Combines all property categories. Not all properties are required;
 * specific calculators check for the properties they need.
 */
export interface Substance
  extends SubstanceIdentity,
    MolarMassProperty,
    Partial<LiquidMolarVolume>,
    Partial<DensityProperty>,
    Partial<HeatCapacityProperty>,
    Partial<ThermalConductivityProperty>,
    Partial<VaporizationProperty>,
    Partial<ViscosityProperty>,
    Partial<DiffusionProperty>,
    Partial<SurfaceTensionProperty>,
    Partial<ParachorProperty>,
    Partial<PhaseTransitionProperty>,
    Partial<CriticalProperty>,
    Partial<AntoineProperty>,
    Partial<ColligativeProperty>,
    Partial<HenryProperty>,
    Partial<DielectricProperty>,
    Partial<DipoleProperty> {
  /**
   * Link to spectral Material for rendering (optional).
   * Maps to Material.id in src/core/materials/
   */
  readonly spectralMaterialId?: string;
}

// ============================================================================
// Helper Types
// ============================================================================

/**
 * Type for substances that have liquid properties.
 */
export type LiquidSubstance = Substance & Required<LiquidMolarVolume> & Required<DensityProperty>;

/**
 * Type for substances with full thermal properties.
 */
export type ThermalSubstance = Substance &
  Required<HeatCapacityProperty> &
  Required<ThermalConductivityProperty>;

/**
 * Type for substances with vapor pressure data.
 */
export type VolatileSubstance = Substance &
  Required<AntoineProperty> &
  Required<PhaseTransitionProperty>;
