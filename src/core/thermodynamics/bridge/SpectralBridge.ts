/**
 * SpectralBridge
 *
 * Adapter that converts thermodynamic state (Composition, Container)
 * to the MaterialProperties format expected by the spectral rendering system.
 *
 * Design: docs/thermodynamics/18_Spectral_Integration.md
 */

import { getMaterialById } from '../../materials';
import type { Material, MaterialProperties } from '../../materials/Material';
import type { SubstanceRegistry } from '../registry/SubstanceRegistry';
import type { Composition, SubstanceId } from '../types';
import { getMoleFractions } from '../types';

/**
 * Container geometry for spectral calculations.
 */
export interface ContainerGeometry {
  /** Width of container in cm */
  readonly width: number;
  /** Height of container in cm */
  readonly height: number;
  /** Depth of container in cm (path length for light) */
  readonly depth: number;
  /** Cross-sectional area in cm² */
  readonly crossSection: number;
  /** Total volume capacity in L */
  readonly capacity: number;
}

/**
 * Thermodynamic state for spectral conversion.
 */
export interface ThermodynamicState {
  /** Current composition (moles of each substance) */
  readonly composition: Composition;
  /** Temperature in Kelvin */
  readonly temperature: number;
  /** Pressure in kPa */
  readonly pressure: number;
  /** Liquid height in cm (for path length calculation) */
  readonly liquidHeight: number;
}

/**
 * Output of spectral bridge conversion.
 */
export interface SpectralBridgeOutput {
  /** The spectral Material to use for rendering */
  readonly material: Material;
  /** Material properties with mole fractions from composition */
  readonly properties: MaterialProperties;
  /** Effective path length through liquid in cm */
  readonly pathLength: number;
  /** Dominant substance for material selection */
  readonly dominantSubstance: SubstanceId | null;
}

/**
 * SpectralBridge
 *
 * Converts thermodynamic composition to spectral material properties.
 * Uses the dominant substance's spectral material as base.
 */
export class SpectralBridge {
  constructor(private readonly substanceRegistry: SubstanceRegistry) {}

  /**
   * Convert thermodynamic state to spectral properties.
   *
   * @param state - Current thermodynamic state
   * @param geometry - Container geometry
   * @param viewAngle - Viewing angle from vertical in radians (0 = top-down)
   * @returns Spectral bridge output for rendering
   */
  convert(
    state: ThermodynamicState,
    geometry: ContainerGeometry,
    viewAngle: number = 0
  ): SpectralBridgeOutput {
    const { composition, temperature, pressure, liquidHeight } = state;

    // Calculate path length based on geometry and viewing angle
    // For side view: path = container depth
    // For angled view: path = liquidHeight / cos(viewAngle)
    const pathLength = viewAngle === 0 ? liquidHeight : liquidHeight / Math.cos(viewAngle);

    // Get mole fractions
    const moleFractions = getMoleFractions(composition);

    // Find dominant substance (highest mole fraction)
    let dominantSubstance: SubstanceId | null = null;
    let maxFraction = 0;
    for (const [id, fraction] of moleFractions) {
      if (fraction > maxFraction) {
        maxFraction = fraction;
        dominantSubstance = id;
      }
    }

    // Get spectral material from dominant substance
    let material = this.getDefaultMaterial();
    if (dominantSubstance) {
      const substance = this.substanceRegistry.get(dominantSubstance);
      if (substance?.spectralMaterialId) {
        const spectralMaterial = getMaterialById(substance.spectralMaterialId);
        if (spectralMaterial) {
          material = spectralMaterial;
        }
      }
    }

    // Build MaterialProperties from composition
    const properties = this.buildMaterialProperties(
      material,
      moleFractions,
      pathLength,
      temperature,
      pressure
    );

    return {
      material,
      properties,
      pathLength,
      dominantSubstance,
    };
  }

  /**
   * Build MaterialProperties from mole fractions.
   *
   * Maps thermodynamic mole fractions to the spectral system's
   * moleFractions format (keyed by molecule ID).
   */
  private buildMaterialProperties(
    material: Material,
    moleFractions: Map<SubstanceId, number>,
    pathLength: number,
    temperature: number,
    pressure: number
  ): MaterialProperties {
    // Convert substance mole fractions to molecule mole fractions
    // For now, we treat each substance as potentially containing molecules
    // that map to the material's molecule definitions
    const moleculeFractions: Record<string, number> = {};

    // Map substance IDs to molecule IDs based on material's molecules
    for (const molecule of material.molecules) {
      // Check if this molecule corresponds to a substance in our composition
      const substanceFraction = moleFractions.get(molecule.id);
      if (substanceFraction !== undefined) {
        moleculeFractions[molecule.id] = substanceFraction;
      }
    }

    return {
      moleFractions: moleculeFractions,
      pathLength,
      temperature,
      pressure: pressure / 101.325, // Convert kPa to atm for spectral system
    };
  }

  /**
   * Get default material when no spectral material is linked.
   * Falls back to water material.
   */
  private getDefaultMaterial(): Material {
    const waterMaterial = getMaterialById('water');
    if (waterMaterial) {
      return waterMaterial;
    }
    // If water not found, throw - this shouldn't happen
    throw new Error('Default material (water) not found in material registry');
  }

  /**
   * Create a simple material for testing or fallback.
   * Returns default properties for a colorless liquid.
   */
  static createDefaultProperties(pathLength: number = 1.0): MaterialProperties {
    return {
      moleFractions: {},
      pathLength,
      temperature: 298.15, // 25°C
      pressure: 1.0, // 1 atm
    };
  }
}

/**
 * Calculate fill fraction from composition and container.
 *
 * @param composition - Current composition
 * @param geometry - Container geometry
 * @param substanceRegistry - Registry for molar volumes
 * @returns Fill fraction (0 to 1)
 */
export function calculateFillFraction(
  composition: Composition,
  geometry: ContainerGeometry,
  substanceRegistry: SubstanceRegistry
): number {
  // Calculate ideal volume from moles and molar volumes
  let totalVolume = 0;

  for (const [id, moles] of composition.moles) {
    const substance = substanceRegistry.get(id);
    if (substance?.molarVolumeLiquid) {
      totalVolume += moles * substance.molarVolumeLiquid;
    } else {
      // Default molar volume for unknown substances (water-like)
      totalVolume += moles * 0.018;
    }
  }

  // Fill fraction = volume / capacity
  return Math.min(1.0, totalVolume / geometry.capacity);
}

/**
 * Calculate liquid height from fill fraction.
 *
 * @param fillFraction - Fill fraction (0 to 1)
 * @param geometry - Container geometry
 * @returns Liquid height in cm
 */
export function calculateLiquidHeight(fillFraction: number, geometry: ContainerGeometry): number {
  return fillFraction * geometry.height;
}
