# Design Principles

## Overview

This document establishes the architectural patterns, methodologies, and design philosophy used throughout the Thermodynamics System. These principles ensure consistency, testability, and extensibility across all subsystems.

---

## 1. First Principles Philosophy

### 1.1 Derivation from Fundamental Physics

Every calculation in this system derives from established physical laws:

- **Conservation of Mass**: Total moles remain constant in closed systems
- **Conservation of Energy**: Enthalpy is conserved in adiabatic processes
- **Force Balance**: Pressure arises from molecular collisions and gravity
- **Thermodynamic Equilibrium**: Systems tend toward minimum free energy

**Rule**: No equation appears without a derivation or literature reference.

### 1.2 No Magic Numbers

Every constant must have:
1. A physical meaning
2. Units documented
3. A source citation

```typescript
// BAD: Magic number
const result = pressure * 0.00831446;

// GOOD: Named constant with source
/** Gas constant R in L·kPa/(mol·K). Source: CODATA 2018 */
const R_GAS = 8.31446261815324; // J/(mol·K) = L·kPa/(mol·K)
const result = pressure * R_GAS;
```

### 1.3 Every Formula Has a Source

Academic references are required for:
- Empirical correlations (Antoine equation, Redlich-Kister)
- Model parameters (activity coefficient parameters)
- Physical property data (heat capacity, viscosity)

Reference format:
```typescript
/**
 * Antoine equation for vapor pressure.
 *
 * log₁₀(P) = A - B / (T + C)
 *
 * Reference: Antoine, C. (1888). "Tensions des vapeurs; nouvelle relation
 * entre les tensions et les températures". Comptes Rendus. 107: 681–684.
 */
```

---

## 2. Static Properties vs Dynamic Simulation

### 2.1 The Rate-Not-Time Principle

**This system calculates instantaneous properties and rate capabilities, NOT time evolution.**

| What We Calculate | What We Do NOT Calculate |
|-------------------|--------------------------|
| Current pressure at this state | Pressure change over time |
| Heat transfer rate (W) | Temperature after 10 seconds |
| Diffusion coefficient (m²/s) | Concentration profile evolution |
| Boiling point at this composition | Mass evaporated over time |
| Separation tendency | Actual layer separation |

### 2.2 Rates as Properties

Transport properties are expressed as **capabilities**, not actions:

```typescript
// This tells you HOW FAST diffusion COULD occur
interface DiffusionResult {
  coefficient: number;  // m²/s - the rate capability

  // Derived indicators (still not time-evolution)
  characteristicTime: number;  // seconds to mix over characteristic length
  fluxAtGradient: number;      // mol/(m²·s) at unit concentration gradient
}
```

### 2.3 Future Dynamics Engine

A separate **Dynamics Engine** (not part of this system) would:
1. Query instantaneous rates from this system
2. Apply numerical integration (Euler, RK4)
3. Advance system state over time

This separation keeps the thermodynamics system pure and testable.

---

## 3. TDD Methodology

### 3.1 Test Structure

Every property calculator follows this test pattern:

```typescript
describe('IdealGasLaw', () => {
  describe('calculate', () => {
    it('should return 101.325 kPa for 1 mol at 273.15K in 22.414L', () => {
      const result = idealGasLaw.calculate({
        moles: 1.0,
        temperature: 273.15,  // K
        volume: 22.414,       // L
      });

      expect(result.pressure).toBeCloseTo(101.325, 2);  // kPa, ±0.01
    });

    it('should double pressure when temperature doubles at constant V', () => {
      const p1 = idealGasLaw.calculate({ moles: 1, temperature: 300, volume: 1 });
      const p2 = idealGasLaw.calculate({ moles: 1, temperature: 600, volume: 1 });

      expect(p2.pressure / p1.pressure).toBeCloseTo(2.0, 5);
    });
  });
});
```

### 3.2 Validation Against Literature

Tests must include validation against published data:

```typescript
describe('WaterVaporPressure', () => {
  // Source: NIST Chemistry WebBook
  const NIST_DATA = [
    { tempC: 0, pressureKPa: 0.6113 },
    { tempC: 25, pressureKPa: 3.1690 },
    { tempC: 50, pressureKPa: 12.344 },
    { tempC: 100, pressureKPa: 101.325 },
  ];

  it.each(NIST_DATA)('should match NIST at $tempC°C', ({ tempC, pressureKPa }) => {
    const result = antoineWater.calculate(tempC + 273.15);
    expect(result).toBeCloseTo(pressureKPa, 1);  // ±0.1 kPa
  });
});
```

### 3.3 Accuracy Requirements by Property Type

| Property | Tolerance | Rationale |
|----------|-----------|-----------|
| Molar mass | Exact | Defined quantity |
| Volume | ±1% | Non-ideal mixing uncertainty |
| Pressure (gas) | ±0.1% | Ideal gas very accurate |
| Pressure (hydrostatic) | ±0.1% | Simple physics |
| Vapor pressure | ±2% | Antoine correlation limits |
| Heat capacity | ±2% | Polynomial fit accuracy |
| Viscosity | ±5% | Mixture rule limitations |
| Surface tension | ±3% | Correlation accuracy |
| Diffusion | ±10% | High uncertainty in data |
| Activity coefficients | ±5% | Model-dependent |

### 3.4 Test Naming Conventions

```typescript
// Pattern: should_[expected behavior]_when_[condition]
it('should_return_zero_excess_volume_when_pure_component', () => { ... });
it('should_increase_pressure_when_temperature_increases', () => { ... });
it('should_throw_when_moles_negative', () => { ... });
```

---

## 4. OCP Architecture Patterns

### 4.1 PropertyCalculator Interface

The core abstraction for all property calculations:

```typescript
/**
 * Base interface for all property calculators.
 * Closed for modification, open for extension via new implementations.
 */
interface PropertyCalculator<TInput, TOutput> {
  /** Unique identifier for this calculator */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Check if this calculator applies to the given input */
  readonly applicability: (input: TInput) => boolean;

  /** Calculate the property */
  calculate(input: TInput): TOutput;
}
```

### 4.2 Registry Pattern

Calculators are registered, not hardcoded:

```typescript
/**
 * Registry for property calculators.
 * Allows runtime registration of new models without modifying existing code.
 */
class PropertyRegistry<TInput, TOutput> {
  private calculators: Map<string, PropertyCalculator<TInput, TOutput>> = new Map();

  /**
   * Register a new calculator. Throws if ID already exists.
   */
  register(calculator: PropertyCalculator<TInput, TOutput>): void {
    if (this.calculators.has(calculator.id)) {
      throw new Error(`Calculator ${calculator.id} already registered`);
    }
    this.calculators.set(calculator.id, calculator);
  }

  /**
   * Get a specific calculator by ID.
   */
  get(id: string): PropertyCalculator<TInput, TOutput> | undefined {
    return this.calculators.get(id);
  }

  /**
   * Find the first applicable calculator for the input.
   */
  findApplicable(input: TInput): PropertyCalculator<TInput, TOutput> | undefined {
    for (const calc of this.calculators.values()) {
      if (calc.applicability(input)) {
        return calc;
      }
    }
    return undefined;
  }

  /**
   * Calculate using a specific calculator.
   */
  calculate(id: string, input: TInput): TOutput {
    const calc = this.calculators.get(id);
    if (!calc) {
      throw new Error(`Calculator ${id} not found`);
    }
    return calc.calculate(input);
  }
}
```

### 4.3 Mixing Rule Interface

For properties that require combining pure component values:

```typescript
/**
 * Interface for mixture property mixing rules.
 * Different mixing rules can be registered for different property types.
 */
interface MixingRule<T> {
  readonly id: string;
  readonly name: string;

  /**
   * Combine pure component properties into mixture property.
   *
   * @param pureValues - Map of substance ID to pure component value
   * @param moleFractions - Map of substance ID to mole fraction
   * @param temperature - Temperature in Kelvin
   * @returns Mixed property value
   */
  mix(
    pureValues: Map<SubstanceId, T>,
    moleFractions: Map<SubstanceId, number>,
    temperature: number
  ): T;
}
```

### 4.4 Model Selection Pattern

When multiple models exist for the same property:

```typescript
/**
 * Select the most appropriate model based on conditions.
 */
interface ModelSelector<TModel> {
  /**
   * Select the best model for given conditions.
   *
   * @param composition - Current composition
   * @param temperature - Temperature in Kelvin
   * @param pressure - Pressure in kPa
   * @returns Selected model, or undefined if no suitable model
   */
  select(
    composition: Composition,
    temperature: number,
    pressure: number
  ): TModel | undefined;
}
```

### 4.5 Extension Example

Adding a new model without modifying existing code:

```typescript
// New viscosity model for water-ethanol system
class WaterEthanolViscosity implements PropertyCalculator<ViscosityInput, number> {
  readonly id = 'viscosity-water-ethanol-excess';
  readonly name = 'Water-Ethanol Viscosity with Excess Term';

  readonly applicability = (input: ViscosityInput): boolean => {
    const substances = Array.from(input.composition.moles.keys());
    return substances.length === 2 &&
           substances.includes('H2O') &&
           substances.includes('C2H5OH');
  };

  calculate(input: ViscosityInput): number {
    // Implementation with Grunberg-Nissan + excess term
    // ...
  }
}

// Register without modifying any existing code
viscosityRegistry.register(new WaterEthanolViscosity());
```

---

## 5. Type System Design

### 5.1 Units as Documentation

While TypeScript doesn't enforce physical units at runtime, we document them consistently:

```typescript
/**
 * Temperature in Kelvin.
 * Use helper functions for conversion.
 */
type Kelvin = number;

/**
 * Pressure in kiloPascals (kPa).
 * 1 atm = 101.325 kPa
 */
type KiloPascal = number;

/**
 * Amount of substance in moles.
 */
type Moles = number;

/**
 * Volume in liters (L).
 * 1 L = 0.001 m³
 */
type Liters = number;
```

### 5.2 Composition as Immutable Value Object

```typescript
/**
 * Immutable composition representing moles of each substance.
 * All operations return new Composition objects.
 */
interface Composition {
  /** Moles of each substance, keyed by substance ID */
  readonly moles: ReadonlyMap<SubstanceId, Moles>;
}

// Helper functions (pure, no mutation)
function createComposition(moles: Record<SubstanceId, Moles>): Composition {
  return { moles: new Map(Object.entries(moles)) };
}

function combineCompositions(a: Composition, b: Composition): Composition {
  const combined = new Map(a.moles);
  for (const [id, moles] of b.moles) {
    combined.set(id, (combined.get(id) ?? 0) + moles);
  }
  return { moles: combined };
}
```

### 5.3 Conditions Tuple Pattern

Group related conditions together:

```typescript
/**
 * Thermodynamic conditions for property calculation.
 */
interface Conditions {
  /** Temperature in Kelvin */
  readonly temperature: Kelvin;

  /** Pressure in kPa (optional, defaults to 101.325) */
  readonly pressure?: KiloPascal;
}

/**
 * Full input for property calculations.
 */
interface PropertyInput {
  readonly composition: Composition;
  readonly conditions: Conditions;
}
```

---

## 6. Error Handling

### 6.1 Validation Errors

Throw descriptive errors for invalid inputs:

```typescript
function validateComposition(composition: Composition): void {
  for (const [id, moles] of composition.moles) {
    if (moles < 0) {
      throw new Error(`Negative moles for ${id}: ${moles}`);
    }
    if (!Number.isFinite(moles)) {
      throw new Error(`Invalid moles for ${id}: ${moles}`);
    }
  }
}

function validateTemperature(T: Kelvin): void {
  if (T <= 0) {
    throw new Error(`Temperature must be positive: ${T} K`);
  }
  if (T > 10000) {
    throw new Error(`Temperature unreasonably high: ${T} K`);
  }
}
```

### 6.2 Model Applicability

Return undefined or throw when model doesn't apply:

```typescript
// Option 1: Return undefined (preferred for optional calculations)
function calculateExcessVolume(composition: Composition): number | undefined {
  if (!hasExcessVolumeData(composition)) {
    return undefined;  // Fall back to ideal mixing
  }
  // ...
}

// Option 2: Throw (for required calculations)
function calculatePressure(input: PressureInput): number {
  const model = pressureRegistry.findApplicable(input);
  if (!model) {
    throw new Error(`No pressure model for composition: ${describeComposition(input.composition)}`);
  }
  return model.calculate(input);
}
```

---

## 7. Documentation Standards

### 7.1 JSDoc for All Public APIs

```typescript
/**
 * Calculate the pressure of an ideal gas.
 *
 * Uses the ideal gas law: PV = nRT
 *
 * @param moles - Amount of substance in moles
 * @param temperature - Temperature in Kelvin
 * @param volume - Volume in liters
 * @returns Pressure in kPa
 *
 * @throws Error if any input is non-positive
 *
 * @example
 * ```typescript
 * const P = idealGasPressure(1.0, 273.15, 22.414);
 * // P ≈ 101.325 kPa
 * ```
 *
 * @see https://en.wikipedia.org/wiki/Ideal_gas_law
 */
function idealGasPressure(moles: Moles, temperature: Kelvin, volume: Liters): KiloPascal {
  // ...
}
```

### 7.2 Inline Comments for Physics

```typescript
function calculateVaporPressure(T: Kelvin): KiloPascal {
  // Antoine equation: log₁₀(P) = A - B / (T + C)
  // where P is in mmHg and T is in °C
  const T_celsius = T - 273.15;

  // Coefficients for water (NIST)
  // Valid range: 1°C to 100°C
  const A = 8.07131;
  const B = 1730.63;
  const C = 233.426;

  // Calculate pressure in mmHg
  const log10P = A - B / (T_celsius + C);
  const P_mmHg = Math.pow(10, log10P);

  // Convert mmHg to kPa (1 mmHg = 0.133322 kPa)
  return P_mmHg * 0.133322;
}
```

---

## 8. Performance Considerations

### 8.1 Pure Functions Enable Caching

All property calculations are pure functions, enabling memoization:

```typescript
// Properties can be cached since same input always gives same output
const memoizedViscosity = memoize(viscosityModel.calculate);
```

### 8.2 Lazy Calculation

Container state properties are calculated on demand:

```typescript
class ContainerState {
  private _viscosity?: number;

  get viscosity(): number {
    if (this._viscosity === undefined) {
      this._viscosity = viscosityModel.calculate(this.input);
    }
    return this._viscosity;
  }
}
```

### 8.3 Batch Calculations

When calculating multiple properties, share intermediate results:

```typescript
interface AllPropertiesResult {
  volume: number;
  density: number;
  pressure: number;
  // ... more
}

function calculateAllProperties(input: PropertyInput): AllPropertiesResult {
  // Calculate once, use multiple times
  const moleFractions = getMoleFractions(input.composition);
  const volume = volumeModel.calculate(input, moleFractions);
  const density = calculateDensity(input, volume);

  return {
    volume,
    density,
    pressure: pressureModel.calculate(input, { volume, density }),
    // ...
  };
}
```

---

## 9. Interaction Points

This document establishes patterns used throughout:

- **[02_Substance_Model.md](02_Substance_Model.md)**: Substance data structures
- **[03_Composition_System.md](03_Composition_System.md)**: Composition type and operations
- **[20_Implementation_Architecture.md](20_Implementation_Architecture.md)**: Full code structure
- **[21_Test_Plan.md](21_Test_Plan.md)**: TDD test organization
