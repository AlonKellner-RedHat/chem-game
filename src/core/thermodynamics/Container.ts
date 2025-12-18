/**
 * Container Model
 *
 * A thermodynamic container holding a composition with geometry.
 * Serves as the aggregation point for all property calculations.
 *
 * Design: docs/thermodynamics/17_Container_Model.md
 */

import type { ContainerGeometry, SpectralBridgeOutput } from './bridge/SpectralBridge';
import {
  calculateFillFraction,
  calculateLiquidHeight,
  SpectralBridge,
} from './bridge/SpectralBridge';
import type { SubstanceRegistry } from './registry/SubstanceRegistry';
import type { Composition, SubstanceId } from './types';
import {
  addSubstance,
  combineCompositions,
  createComposition,
  emptyComposition,
  getMoleFractions,
  getTotalMoles,
  removeSubstance,
} from './types';

/**
 * Container state with all calculated properties.
 *
 * Follows the PropertySlots pattern: undefined properties
 * will be calculated when their calculators are registered.
 */
export interface ContainerState {
  // ============================================================================
  // Core State (always available)
  // ============================================================================

  /** Current composition (moles of each substance) */
  readonly composition: Composition;

  /** Temperature in Kelvin */
  readonly temperature: number;

  /** Pressure in kPa (ambient, can be overridden by calculation) */
  readonly pressure: number;

  // ============================================================================
  // Derived from geometry and composition
  // ============================================================================

  /** Fill fraction (0-1), ratio of liquid volume to container capacity */
  readonly fillFraction: number;

  /** Liquid height in cm */
  readonly liquidHeight: number;

  // ============================================================================
  // Future Property Slots (undefined until calculators registered)
  // These will be populated when thermodynamics calculators are added.
  // ============================================================================

  /** Total volume in liters (ideal or calculated) */
  readonly volume?: number;

  /** Mixture density in kg/m³ */
  readonly density?: number;

  /** Mixture viscosity in Pa·s */
  readonly viscosity?: number;

  /** Surface tension in N/m */
  readonly surfaceTension?: number;

  /** Thermal conductivity in W/(m·K) */
  readonly thermalConductivity?: number;

  /** Heat capacity in J/(mol·K) */
  readonly heatCapacity?: number;

  /** Vapor pressure in kPa */
  readonly vaporPressure?: number;

  /** Hydrostatic pressure at bottom in kPa */
  readonly hydrostaticPressure?: number;
}

/**
 * Container configuration.
 */
export interface ContainerConfig {
  /** Unique identifier for this container */
  readonly id: string;
  /** Display name */
  readonly name: string;
  /** Container geometry */
  readonly geometry: ContainerGeometry;
  /** Initial temperature in K (default: 298.15) */
  readonly initialTemperature?: number;
  /** Initial pressure in kPa (default: 101.325) */
  readonly initialPressure?: number;
  /** Initial composition (default: empty) */
  readonly initialComposition?: Composition;
}

/**
 * Container
 *
 * A thermodynamic container holding composition with geometry.
 * Provides state calculation and spectral bridge integration.
 */
export class Container {
  readonly id: string;
  readonly name: string;
  readonly geometry: ContainerGeometry;

  private _composition: Composition;
  private _temperature: number;
  private _pressure: number;
  private _state: ContainerState | null = null;

  private readonly substanceRegistry: SubstanceRegistry;
  private readonly spectralBridge: SpectralBridge;

  constructor(config: ContainerConfig, substanceRegistry: SubstanceRegistry) {
    this.id = config.id;
    this.name = config.name;
    this.geometry = config.geometry;

    this._composition = config.initialComposition ?? emptyComposition();
    this._temperature = config.initialTemperature ?? 298.15;
    this._pressure = config.initialPressure ?? 101.325;

    this.substanceRegistry = substanceRegistry;
    this.spectralBridge = new SpectralBridge(substanceRegistry);
  }

  // ============================================================================
  // State Access
  // ============================================================================

  /**
   * Get current container state.
   * Lazily calculated and cached.
   */
  get state(): ContainerState {
    if (!this._state) {
      this._state = this.calculateState();
    }
    return this._state;
  }

  /**
   * Get current composition.
   */
  get composition(): Composition {
    return this._composition;
  }

  /**
   * Get current temperature in Kelvin.
   */
  get temperature(): number {
    return this._temperature;
  }

  /**
   * Get current pressure in kPa.
   */
  get pressure(): number {
    return this._pressure;
  }

  /**
   * Get mole fractions of all components.
   */
  get moleFractions(): Map<SubstanceId, number> {
    return getMoleFractions(this._composition);
  }

  /**
   * Get total moles in container.
   */
  get totalMoles(): number {
    return getTotalMoles(this._composition);
  }

  // ============================================================================
  // Composition Modification
  // ============================================================================

  /**
   * Set the composition directly.
   */
  setComposition(composition: Composition): void {
    this._composition = composition;
    this.invalidateState();
  }

  /**
   * Add moles of a substance.
   */
  addMoles(substanceId: SubstanceId, moles: number): void {
    this._composition = addSubstance(this._composition, substanceId, moles);
    this.invalidateState();
  }

  /**
   * Remove moles of a substance.
   */
  removeMoles(substanceId: SubstanceId, moles: number): void {
    this._composition = removeSubstance(this._composition, substanceId, moles);
    this.invalidateState();
  }

  /**
   * Mix in another composition.
   */
  mixWith(other: Composition): void {
    this._composition = combineCompositions(this._composition, other);
    this.invalidateState();
  }

  /**
   * Clear the container.
   */
  clear(): void {
    this._composition = emptyComposition();
    this.invalidateState();
  }

  // ============================================================================
  // Condition Modification
  // ============================================================================

  /**
   * Set temperature in Kelvin.
   */
  setTemperature(temperature: number): void {
    if (temperature <= 0) {
      throw new Error(`Temperature must be positive: ${temperature} K`);
    }
    this._temperature = temperature;
    this.invalidateState();
  }

  /**
   * Set pressure in kPa.
   */
  setPressure(pressure: number): void {
    if (pressure <= 0) {
      throw new Error(`Pressure must be positive: ${pressure} kPa`);
    }
    this._pressure = pressure;
    this.invalidateState();
  }

  // ============================================================================
  // Spectral Integration
  // ============================================================================

  /**
   * Get spectral bridge output for rendering.
   *
   * @param viewAngle - Viewing angle from vertical in radians
   * @returns Spectral properties for rendering
   */
  getSpectralOutput(viewAngle: number = 0): SpectralBridgeOutput {
    const state = this.state;
    return this.spectralBridge.convert(
      {
        composition: this._composition,
        temperature: this._temperature,
        pressure: this._pressure,
        liquidHeight: state.liquidHeight,
      },
      this.geometry,
      viewAngle
    );
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Calculate the current container state.
   */
  private calculateState(): ContainerState {
    // Calculate fill fraction from composition and geometry
    const fillFraction = calculateFillFraction(
      this._composition,
      this.geometry,
      this.substanceRegistry
    );

    // Calculate liquid height from fill fraction
    const liquidHeight = calculateLiquidHeight(fillFraction, this.geometry);

    // Base state (always available)
    const state: ContainerState = {
      composition: this._composition,
      temperature: this._temperature,
      pressure: this._pressure,
      fillFraction,
      liquidHeight,
      // Future property slots - undefined until calculators registered
      volume: undefined,
      density: undefined,
      viscosity: undefined,
      surfaceTension: undefined,
      thermalConductivity: undefined,
      heatCapacity: undefined,
      vaporPressure: undefined,
      hydrostaticPressure: undefined,
    };

    // TODO: Apply registered property calculators here
    // This is where the OCP extension point will be used
    // Example:
    // if (volumeCalculator) state.volume = volumeCalculator.calculate(...)
    // if (densityCalculator) state.density = densityCalculator.calculate(...)

    return state;
  }

  /**
   * Invalidate cached state (call after any modification).
   */
  private invalidateState(): void {
    this._state = null;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a standard beaker container.
 */
export function createBeaker(
  id: string,
  name: string,
  capacityMl: number,
  substanceRegistry: SubstanceRegistry
): Container {
  // Approximate beaker dimensions for given capacity
  // Assuming roughly cylindrical with height = 1.5 × diameter
  const capacityL = capacityMl / 1000;
  const capacityCm3 = capacityMl;

  // V = π r² h, h = 1.5 × 2r = 3r → V = π r² × 3r = 3π r³
  // r = (V / 3π)^(1/3)
  const radius = Math.pow(capacityCm3 / (3 * Math.PI), 1 / 3);
  const diameter = 2 * radius;
  const height = 3 * radius;
  const crossSection = Math.PI * radius * radius;

  return new Container(
    {
      id,
      name,
      geometry: {
        width: diameter,
        height,
        depth: diameter, // For side view, path = diameter
        crossSection,
        capacity: capacityL,
      },
    },
    substanceRegistry
  );
}

/**
 * Create a container with specified geometry.
 */
export function createContainer(
  id: string,
  name: string,
  geometry: ContainerGeometry,
  substanceRegistry: SubstanceRegistry,
  initialComposition?: Composition
): Container {
  return new Container(
    {
      id,
      name,
      geometry,
      initialComposition,
    },
    substanceRegistry
  );
}

/**
 * Create a pre-filled container with pure substance.
 */
export function createFilledContainer(
  id: string,
  name: string,
  geometry: ContainerGeometry,
  substanceRegistry: SubstanceRegistry,
  substanceId: SubstanceId,
  moles: number
): Container {
  return new Container(
    {
      id,
      name,
      geometry,
      initialComposition: createComposition({ [substanceId]: moles }),
    },
    substanceRegistry
  );
}
