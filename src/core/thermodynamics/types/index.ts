/**
 * Thermodynamics Types Module
 *
 * Core type definitions for the thermodynamics system.
 */

// Composition
export {
  addSubstance,
  type Composition,
  combineCompositions,
  componentCount,
  compositionsEqual,
  contains,
  createComposition,
  emptyComposition,
  getAverageMolarMass,
  getMassFraction,
  getMoleFraction,
  getMoleFractions,
  getSubstanceIds,
  getTotalMass,
  getTotalMoles,
  isEmpty,
  isPure,
  MIN_MOLES,
  pureComposition,
  removeSubstance,
  type SubstanceId,
  scaleComposition,
  splitComposition,
  validateComposition,
} from './Composition';

// Substance
export type {
  AntoineProperty,
  ColligativeProperty,
  CriticalProperty,
  DensityProperty,
  DielectricProperty,
  DiffusionProperty,
  DipoleProperty,
  HeatCapacityProperty,
  HenryProperty,
  LiquidMolarVolume,
  LiquidSubstance,
  MolarMassProperty,
  ParachorProperty,
  PhaseTransitionProperty,
  Substance,
  SubstanceIdentity,
  SurfaceTensionProperty,
  ThermalConductivityProperty,
  ThermalSubstance,
  VaporizationProperty,
  ViscosityProperty,
  VolatileSubstance,
} from './Substance';
