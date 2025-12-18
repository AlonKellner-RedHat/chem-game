# Implementation Architecture

## Overview

This document defines the code structure for the thermodynamics engine, following OCP (Open-Closed Principle) design patterns for extensibility.

---

## 1. Module Structure

```
src/core/thermodynamics/
├── index.ts                    # Public API exports
│
├── types/
│   ├── Units.ts               # Type-safe unit definitions
│   ├── Substance.ts           # Substance interface
│   ├── Composition.ts         # Composition interface
│   └── Conditions.ts          # Temperature, pressure conditions
│
├── registry/
│   ├── SubstanceRegistry.ts   # Pure substance data registry
│   ├── ModelRegistry.ts       # Property model registry (OCP)
│   └── MixingRuleRegistry.ts  # Mixing rule registry
│
├── models/
│   ├── volume/
│   │   ├── IdealVolume.ts
│   │   └── RedlichKister.ts
│   │
│   ├── pressure/
│   │   ├── IdealGas.ts
│   │   ├── Antoine.ts
│   │   ├── Hydrostatic.ts
│   │   └── activity/
│   │       ├── Margules.ts
│   │       └── VanLaar.ts
│   │
│   ├── thermal/
│   │   ├── HeatCapacity.ts
│   │   ├── HeatOfMixing.ts
│   │   └── ThermalConductivity.ts
│   │
│   ├── transport/
│   │   ├── Viscosity.ts
│   │   └── Diffusion.ts
│   │
│   ├── surface/
│   │   └── SurfaceTension.ts
│   │
│   ├── phase/
│   │   ├── Colligative.ts
│   │   └── HenryLaw.ts
│   │
│   └── advanced/
│       ├── OsmoticPressure.ts
│       └── Dielectric.ts
│
├── data/
│   ├── substances/
│   │   ├── water.ts
│   │   ├── ethanol.ts
│   │   ├── common.ts          # N2, O2, CO2, etc.
│   │   └── index.ts
│   │
│   └── parameters/
│       ├── redlich-kister.ts  # Excess volume coefficients
│       ├── activity.ts        # Activity coefficient parameters
│       └── viscosity.ts       # Grunberg-Nissan parameters
│
├── container/
│   ├── Container.ts           # Container class
│   ├── ContainerGeometry.ts   # Geometry definitions
│   └── ContainerState.ts      # State interface
│
├── bridge/
│   └── SpectralBridge.ts      # Link to spectral rendering
│
└── utils/
    ├── conversions.ts         # Unit conversions
    ├── interpolation.ts       # Data interpolation
    └── validation.ts          # Input validation
```

---

## 2. Core Types

### 2.1 Units.ts

```typescript
/**
 * Type aliases for documentation.
 * These don't enforce units at runtime but document intent.
 */

/** Temperature in Kelvin */
export type Kelvin = number;

/** Pressure in kiloPascals */
export type KiloPascal = number;

/** Amount of substance in moles */
export type Moles = number;

/** Volume in liters */
export type Liters = number;

/** Density in kg/m³ */
export type KgPerCubicMeter = number;

/** Viscosity in Pascal-seconds */
export type PascalSeconds = number;

/** Surface tension in N/m */
export type NewtonPerMeter = number;
```

### 2.2 Substance.ts

```typescript
import type { SubstanceId } from './Composition';

/**
 * Complete substance definition with all thermodynamic properties.
 */
export interface Substance {
  // Identity
  readonly id: SubstanceId;
  readonly name: string;
  readonly formula: string;
  readonly molarMass: number;

  // Volumetric
  readonly molarVolumeLiquid: number;
  readonly density: number;
  readonly densityRefTemp: number;

  // Thermal
  readonly heatCapacityCp: number;
  readonly thermalConductivity: number;

  // Transport
  readonly viscosity: number;
  readonly viscosityRefTemp: number;

  // Surface
  readonly surfaceTension: number;
  readonly surfaceTensionRefTemp: number;

  // Phase
  readonly boilingPoint: number;
  readonly freezingPoint: number;
  readonly antoine?: AntoineCoefficients;

  // Electrical
  readonly dielectricConstant: number;

  // Optional
  readonly ebullioscopicConstant?: number;
  readonly cryoscopicConstant?: number;
  readonly henryConstant?: number;
  readonly vantHoffFactor?: number;
}
```

### 2.3 Composition.ts

```typescript
export type SubstanceId = string;

/**
 * Immutable composition representing moles of each substance.
 */
export interface Composition {
  readonly moles: ReadonlyMap<SubstanceId, number>;
}

// Factory functions
export function createComposition(moles: Record<SubstanceId, number>): Composition;
export function emptyComposition(): Composition;
export function pureComposition(id: SubstanceId, moles: number): Composition;

// Operations
export function combineCompositions(a: Composition, b: Composition): Composition;
export function splitComposition(comp: Composition, fraction: number): [Composition, Composition];
export function scaleComposition(comp: Composition, factor: number): Composition;

// Queries
export function getTotalMoles(comp: Composition): number;
export function getMoleFractions(comp: Composition): Map<SubstanceId, number>;
export function isEmpty(comp: Composition): boolean;
```

---

## 3. Registry Pattern

### 3.1 SubstanceRegistry.ts

```typescript
import type { Substance, SubstanceId } from '../types';

/**
 * Registry for substance data.
 * Thread-safe, immutable after initialization.
 */
export class SubstanceRegistry {
  private readonly substances = new Map<SubstanceId, Substance>();

  /**
   * Register a substance.
   * @throws Error if ID already exists
   */
  register(substance: Substance): void {
    if (this.substances.has(substance.id)) {
      throw new Error(`Substance ${substance.id} already registered`);
    }
    this.substances.set(substance.id, substance);
  }

  /**
   * Get substance by ID.
   */
  get(id: SubstanceId): Substance | undefined {
    return this.substances.get(id);
  }

  /**
   * Get substance or throw.
   */
  getRequired(id: SubstanceId): Substance {
    const s = this.get(id);
    if (!s) throw new Error(`Substance ${id} not found`);
    return s;
  }

  /**
   * List all registered IDs.
   */
  list(): SubstanceId[] {
    return Array.from(this.substances.keys());
  }
}

// Default instance with common substances
export const defaultSubstanceRegistry = new SubstanceRegistry();
```

### 3.2 ModelRegistry.ts

```typescript
/**
 * Generic registry for property models.
 * Follows OCP: new models can be registered without modifying existing code.
 */
export class ModelRegistry<TModel> {
  private readonly models = new Map<string, TModel>();

  /**
   * Register a model.
   */
  register(id: string, model: TModel): void {
    this.models.set(id, model);
  }

  /**
   * Get model by ID.
   */
  get(id: string): TModel | undefined {
    return this.models.get(id);
  }

  /**
   * Get default model (first registered).
   */
  getDefault(): TModel | undefined {
    return this.models.values().next().value;
  }

  /**
   * List all model IDs.
   */
  list(): string[] {
    return Array.from(this.models.keys());
  }
}
```

---

## 4. Property Model Interfaces

### 4.1 Base Interface

```typescript
/**
 * Base interface for all property calculators.
 */
export interface PropertyCalculator<TInput, TOutput> {
  readonly id: string;
  readonly name: string;

  /**
   * Check if this calculator applies to the given input.
   */
  applicability(input: TInput): boolean;

  /**
   * Calculate the property.
   */
  calculate(input: TInput): TOutput;
}
```

### 4.2 Volume Model

```typescript
export interface VolumeInput {
  readonly composition: Composition;
  readonly temperature: Kelvin;
}

export interface VolumeResult {
  readonly totalVolume: Liters;
  readonly idealVolume: Liters;
  readonly excessVolume: Liters;
}

export interface VolumeModel extends PropertyCalculator<VolumeInput, VolumeResult> {}
```

### 4.3 Mixing Rule Interface

```typescript
/**
 * Interface for mixture property mixing rules.
 */
export interface MixingRule<T> {
  readonly id: string;
  readonly name: string;

  /**
   * Combine pure component values into mixture value.
   */
  mix(
    pureValues: Map<SubstanceId, T>,
    moleFractions: Map<SubstanceId, number>,
    temperature: Kelvin
  ): T;
}
```

---

## 5. OCP Extension Pattern

### 5.1 Adding a New Viscosity Model

```typescript
// 1. Implement the interface
class CustomViscosityModel implements ViscosityMixingRule {
  readonly id = 'custom-viscosity';
  readonly name = 'Custom Viscosity Model';

  calculate(
    pureViscosities: Map<SubstanceId, number>,
    moleFractions: Map<SubstanceId, number>,
    temperature: Kelvin
  ): number {
    // Custom implementation
    return /* calculated value */;
  }
}

// 2. Register without modifying existing code
viscosityRegistry.register('custom', new CustomViscosityModel());
```

### 5.2 Adding a New Substance

```typescript
// 1. Define the substance data
const ACETONE: Substance = {
  id: 'acetone',
  name: 'Acetone',
  formula: 'C₃H₆O',
  molarMass: 58.08,
  // ... all other properties
};

// 2. Register
substanceRegistry.register(ACETONE);
```

### 5.3 Adding Interaction Parameters

```typescript
// Add Redlich-Kister parameters for new pair
excessVolumeRegistry.register(
  'rk-water-acetone',
  new RedlichKisterVolumeModel(
    'rk-volume-water-acetone',
    'Water-Acetone Excess Volume',
    ['H2O', 'acetone'],
    [-2.8e-3, 0.5e-3]  // Coefficients
  )
);
```

---

## 6. Container Implementation

### 6.1 Container Class

```typescript
import type { Composition, ContainerState, ContainerGeometry } from '../types';
import type { SubstanceRegistry, ModelRegistry } from '../registry';

export class Container {
  private readonly geometry: ContainerGeometry;
  private composition: Composition;
  private temperature: Kelvin;

  private readonly registry: SubstanceRegistry;
  private readonly models: Models;

  private cachedState?: ContainerState;
  private stateVersion = 0;
  private compositionVersion = 0;

  constructor(
    geometry: ContainerGeometry,
    composition: Composition,
    temperature: Kelvin,
    registry: SubstanceRegistry,
    models: Models
  ) {
    this.geometry = geometry;
    this.composition = composition;
    this.temperature = temperature;
    this.registry = registry;
    this.models = models;
  }

  // State access with lazy calculation
  get state(): ContainerState {
    if (this.stateVersion !== this.compositionVersion || !this.cachedState) {
      this.cachedState = this.calculateState();
      this.stateVersion = this.compositionVersion;
    }
    return this.cachedState;
  }

  // Mutation methods that invalidate cache
  setComposition(composition: Composition): void {
    this.composition = composition;
    this.compositionVersion++;
  }

  setTemperature(temperature: Kelvin): void {
    this.temperature = temperature;
    this.compositionVersion++;
  }

  addSubstance(id: SubstanceId, moles: number): void {
    this.composition = addSubstance(this.composition, id, moles);
    this.compositionVersion++;
  }

  private calculateState(): ContainerState {
    // Full state calculation using all property systems
    // See 17_Container_Model.md for details
  }
}
```

---

## 7. Dependency Injection

### 7.1 Models Configuration

```typescript
/**
 * Collection of all model registries.
 */
export interface Models {
  readonly excessVolume: ModelRegistry<ExcessVolumeModel>;
  readonly activity: ModelRegistry<ActivityModel>;
  readonly viscosity: ModelRegistry<ViscosityMixingRule>;
  readonly thermalConductivity: ModelRegistry<ThermalConductivityMixingRule>;
  readonly surfaceTension: ModelRegistry<SurfaceTensionMixingRule>;
  readonly dielectric: ModelRegistry<DielectricMixingRule>;
  readonly enthalpy: ModelRegistry<ExcessEnthalpyModel>;
}

/**
 * Create default models with standard implementations.
 */
export function createDefaultModels(): Models {
  const excessVolume = new ModelRegistry<ExcessVolumeModel>();
  excessVolume.register('rk-water-ethanol', WATER_ETHANOL_VOLUME);

  const activity = new ModelRegistry<ActivityModel>();
  activity.register('margules', new MargulesSingleParameter(/* ... */));

  // ... etc

  return {
    excessVolume,
    activity,
    viscosity,
    thermalConductivity,
    surfaceTension,
    dielectric,
    enthalpy,
  };
}
```

### 7.2 Testing with Mock Models

```typescript
// For testing, inject mock models
const mockModels: Models = {
  excessVolume: new ModelRegistry(),
  // ... with mock implementations that return controlled values
};

const container = new Container(
  geometry,
  composition,
  298.15,
  registry,
  mockModels
);
```

---

## 8. Public API

### 8.1 index.ts

```typescript
// Types
export type { Substance, SubstanceId } from './types/Substance';
export type { Composition } from './types/Composition';
export type { ContainerState, ContainerGeometry } from './container/ContainerState';

// Composition utilities
export {
  createComposition,
  emptyComposition,
  pureComposition,
  combineCompositions,
  splitComposition,
  getTotalMoles,
  getMoleFractions,
} from './types/Composition';

// Registries
export { SubstanceRegistry, defaultSubstanceRegistry } from './registry/SubstanceRegistry';
export { ModelRegistry } from './registry/ModelRegistry';

// Container
export { Container } from './container/Container';

// Default models
export { createDefaultModels } from './models';

// Individual property calculations (for direct use)
export { calculateVolume } from './models/volume';
export { calculateIdealGasPressure, calculateVaporPressure } from './models/pressure';
export { calculateHeatCapacity } from './models/thermal/HeatCapacity';
// ... etc
```

---

## 9. Error Handling

### 9.1 Custom Errors

```typescript
export class ThermodynamicsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ThermodynamicsError';
  }
}

export class SubstanceNotFoundError extends ThermodynamicsError {
  constructor(id: SubstanceId) {
    super(`Substance not found: ${id}`);
    this.name = 'SubstanceNotFoundError';
  }
}

export class InvalidCompositionError extends ThermodynamicsError {
  constructor(reason: string) {
    super(`Invalid composition: ${reason}`);
    this.name = 'InvalidCompositionError';
  }
}

export class ModelNotFoundError extends ThermodynamicsError {
  constructor(modelType: string, id: string) {
    super(`${modelType} model not found: ${id}`);
    this.name = 'ModelNotFoundError';
  }
}
```

### 9.2 Validation

```typescript
export function validateComposition(comp: Composition): void {
  for (const [id, moles] of comp.moles) {
    if (!Number.isFinite(moles)) {
      throw new InvalidCompositionError(`Non-finite moles for ${id}: ${moles}`);
    }
    if (moles < 0) {
      throw new InvalidCompositionError(`Negative moles for ${id}: ${moles}`);
    }
  }
}

export function validateTemperature(T: Kelvin): void {
  if (T <= 0) {
    throw new ThermodynamicsError(`Temperature must be positive: ${T} K`);
  }
}
```

---

## 10. Interaction Points

- **[01_Design_Principles.md](01_Design_Principles.md)**: OCP patterns used here
- **[02_Substance_Model.md](02_Substance_Model.md)**: Substance interface definition
- **[17_Container_Model.md](17_Container_Model.md)**: Container implementation
- **[21_Test_Plan.md](21_Test_Plan.md)**: Testing strategy
