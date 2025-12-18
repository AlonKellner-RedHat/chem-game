/**
 * Thermodynamics Module
 *
 * Core thermodynamics system for the chemistry simulation.
 * Provides substance data, composition tracking, and spectral integration.
 *
 * Design documentation: docs/thermodynamics/
 */

// Bridge
export {
  type ContainerGeometry,
  calculateFillFraction,
  calculateLiquidHeight,
  SpectralBridge,
  type SpectralBridgeOutput,
  type ThermodynamicState,
} from './bridge/SpectralBridge';
// Container
export {
  Container,
  type ContainerConfig,
  type ContainerState,
  createBeaker,
  createContainer,
  createFilledContainer,
} from './Container';

// Data
export { ETHANOL, getReferenceSubstance, REFERENCE_SUBSTANCES, WATER } from './data/substances';
// Registry
export { defaultSubstanceRegistry, SubstanceRegistry } from './registry';
// Types
export {
  // Substance
  type AntoineProperty,
  // Composition
  addSubstance,
  type ColligativeProperty,
  type Composition,
  type CriticalProperty,
  combineCompositions,
  componentCount,
  compositionsEqual,
  contains,
  createComposition,
  type DensityProperty,
  type DielectricProperty,
  type DiffusionProperty,
  type DipoleProperty,
  emptyComposition,
  getAverageMolarMass,
  getMassFraction,
  getMoleFraction,
  getMoleFractions,
  getSubstanceIds,
  getTotalMass,
  getTotalMoles,
  type HeatCapacityProperty,
  type HenryProperty,
  isEmpty,
  isPure,
  type LiquidMolarVolume,
  type LiquidSubstance,
  MIN_MOLES,
  type MolarMassProperty,
  type ParachorProperty,
  type PhaseTransitionProperty,
  pureComposition,
  removeSubstance,
  type Substance,
  type SubstanceId,
  type SubstanceIdentity,
  type SurfaceTensionProperty,
  scaleComposition,
  splitComposition,
  type ThermalConductivityProperty,
  type ThermalSubstance,
  type VaporizationProperty,
  type ViscosityProperty,
  type VolatileSubstance,
  validateComposition,
} from './types';

// ============================================================================
// Convenience Setup
// ============================================================================

import { REFERENCE_SUBSTANCES } from './data/substances';
import { defaultSubstanceRegistry } from './registry';

/**
 * Initialize the default registry with reference substances.
 * Call this once at application startup.
 */
export function initializeDefaultRegistry(): void {
  for (const substance of REFERENCE_SUBSTANCES) {
    if (!defaultSubstanceRegistry.has(substance.id)) {
      defaultSubstanceRegistry.register(substance);
    }
  }
}

/**
 * Check if default registry is initialized.
 */
export function isDefaultRegistryInitialized(): boolean {
  return defaultSubstanceRegistry.size > 0;
}
