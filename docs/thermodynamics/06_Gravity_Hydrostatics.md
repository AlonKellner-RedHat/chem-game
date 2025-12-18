# Gravity and Hydrostatics

## Overview

This document defines gravity-dependent properties including hydrostatic pressure, buoyancy, and stratification potential. All containers are assumed vertical with gravity in the -Y direction.

---

## 1. First Principles

### 1.1 Gravitational Force

A fluid element of mass dm experiences gravitational force:
```
dF_g = dm × g = ρ × dV × g
```

where:
- ρ = density (kg/m³)
- dV = volume element (m³)
- g = gravitational acceleration = 9.80665 m/s² (standard)

### 1.2 Force Balance in a Fluid

At equilibrium, the gravitational force on a fluid element is balanced by pressure forces:

```
P(h + dh) × A - P(h) × A = ρ × A × dh × g
```

Rearranging:
```
dP/dh = ρ × g
```

This is the fundamental hydrostatic equation.

### 1.3 Reference Frame

- **Y-axis**: Vertical, positive upward
- **h**: Depth below surface (positive downward into liquid)
- **Gravity**: Acts in -Y direction
- **All containers**: Assumed vertical

---

## 2. Hydrostatic Pressure (Stage 2)

### 2.1 Derivation for Uniform Density

For a fluid of constant density:
```
∫dP = ∫ρg dh
P(h) - P_surface = ρ × g × h
```

Therefore:
```
P(h) = P_surface + ρ × g × h
```

where:
- P(h) = pressure at depth h
- P_surface = pressure at the surface (gas headspace or atmosphere)
- ρ = liquid density
- h = depth below surface

### 2.2 Units and Conversions

Pressure in SI units:
```
[Pa] = [kg/m³] × [m/s²] × [m]
     = kg/(m·s²) = Pa ✓
```

Convert to kPa:
```
P [kPa] = P_surface [kPa] + (ρ [kg/m³] × g [m/s²] × h [m]) / 1000
```

### 2.3 Implementation

```typescript
/** Standard gravitational acceleration (m/s²) */
const G_STANDARD = 9.80665;

interface HydrostaticInput {
  /** Surface pressure in kPa */
  readonly surfacePressure: number;
  /** Liquid density in kg/m³ */
  readonly density: number;
  /** Depth below surface in meters */
  readonly depth: number;
}

interface HydrostaticResult {
  /** Pressure at surface in kPa */
  readonly surfacePressure: number;
  /** Pressure at depth in kPa */
  readonly pressureAtDepth: number;
  /** Pressure gradient in kPa/m */
  readonly pressureGradient: number;
}

/**
 * Calculate hydrostatic pressure at depth.
 * P(h) = P_surface + ρgh
 *
 * @param input - Hydrostatic calculation input
 * @returns Pressure result in kPa
 */
function calculateHydrostaticPressure(input: HydrostaticInput): HydrostaticResult {
  const { surfacePressure, density, depth } = input;

  // Pressure gradient: dP/dh = ρg [Pa/m] = ρg/1000 [kPa/m]
  const pressureGradient = (density * G_STANDARD) / 1000;

  // Pressure at depth
  const pressureAtDepth = surfacePressure + pressureGradient * depth;

  return {
    surfacePressure,
    pressureAtDepth,
    pressureGradient,
  };
}
```

### 2.4 Variable Density (Layered Systems)

For a system with varying density (future extension):
```
P(h) = P_surface + ∫₀ʰ ρ(z) × g × dz
```

For discrete layers:
```
P(h) = P_surface + Σ_i ρ_i × g × Δh_i
```

---

## 3. Pressure Profile in Containers

### 3.1 Container Pressure Calculation

```typescript
interface ContainerPressureInput {
  /** Pressure at liquid surface in kPa (atmosphere or sealed gas) */
  readonly surfacePressure: number;
  /** Total liquid height in meters */
  readonly liquidHeight: number;
  /** Liquid density in kg/m³ */
  readonly density: number;
}

interface ContainerPressureResult {
  /** Pressure at surface in kPa */
  readonly pressureAtSurface: number;
  /** Pressure at bottom in kPa */
  readonly pressureAtBottom: number;
  /** Pressure gradient in kPa/m */
  readonly pressureGradient: number;
  /** Pressure at arbitrary depth */
  readonly pressureAtDepth: (depth: number) => number;
}

/**
 * Calculate pressure profile in a vertical container.
 */
function calculateContainerPressure(
  input: ContainerPressureInput
): ContainerPressureResult {
  const { surfacePressure, liquidHeight, density } = input;

  const pressureGradient = (density * G_STANDARD) / 1000;
  const pressureAtBottom = surfacePressure + pressureGradient * liquidHeight;

  return {
    pressureAtSurface: surfacePressure,
    pressureAtBottom,
    pressureGradient,
    pressureAtDepth: (depth: number) => {
      if (depth < 0 || depth > liquidHeight) {
        throw new Error(`Depth ${depth} outside range [0, ${liquidHeight}]`);
      }
      return surfacePressure + pressureGradient * depth;
    },
  };
}
```

### 3.2 Example Calculation

**10 cm of water at atmospheric pressure**:
- ρ = 997 kg/m³
- h = 0.1 m
- P_surface = 101.325 kPa (1 atm)

```
P_bottom = 101.325 + (997 × 9.80665 × 0.1) / 1000
         = 101.325 + 0.978
         = 102.303 kPa
```

The pressure increase is ~1 kPa per 10 cm of water.

---

## 4. Buoyancy (Stage 2)

### 4.1 Archimedes' Principle Derivation

An object submerged in fluid experiences pressure on all surfaces. The net upward force (buoyancy) equals the weight of displaced fluid:

```
F_buoyancy = ρ_fluid × V_displaced × g
```

**Proof**: The pressure difference between bottom and top of the object:
```
ΔP = ρ_fluid × g × h_object
F_net = ΔP × A = ρ_fluid × g × h_object × A = ρ_fluid × g × V
```

### 4.2 Net Force on Object

```
F_net = F_buoyancy - F_gravity
      = ρ_fluid × V × g - ρ_object × V × g
      = (ρ_fluid - ρ_object) × V × g
```

**Float/Sink Determination**:
- F_net > 0 (ρ_fluid > ρ_object): Object floats
- F_net < 0 (ρ_fluid < ρ_object): Object sinks
- F_net = 0 (ρ_fluid = ρ_object): Neutral buoyancy

### 4.3 Implementation

```typescript
interface BuoyancyInput {
  /** Fluid density in kg/m³ */
  readonly fluidDensity: number;
  /** Object density in kg/m³ */
  readonly objectDensity: number;
  /** Object volume in m³ (optional, for force calculation) */
  readonly objectVolume?: number;
}

interface BuoyancyResult {
  /** Density ratio (object/fluid) */
  readonly densityRatio: number;
  /** Whether object would float */
  readonly wouldFloat: boolean;
  /** Whether object would sink */
  readonly wouldSink: boolean;
  /** Whether object is neutrally buoyant */
  readonly isNeutral: boolean;
  /** Net force in Newtons (if volume provided) */
  readonly netForce?: number;
  /** Fraction submerged if floating (0-1) */
  readonly fractionSubmerged?: number;
}

/**
 * Calculate buoyancy for an object in a fluid.
 */
function calculateBuoyancy(input: BuoyancyInput): BuoyancyResult {
  const { fluidDensity, objectDensity, objectVolume } = input;

  const densityRatio = objectDensity / fluidDensity;

  // Tolerance for neutral buoyancy
  const TOLERANCE = 0.001;
  const isNeutral = Math.abs(densityRatio - 1) < TOLERANCE;
  const wouldFloat = densityRatio < 1 - TOLERANCE;
  const wouldSink = densityRatio > 1 + TOLERANCE;

  const result: BuoyancyResult = {
    densityRatio,
    wouldFloat,
    wouldSink,
    isNeutral,
  };

  if (objectVolume !== undefined) {
    // Net force = (ρ_fluid - ρ_object) × V × g
    result.netForce = (fluidDensity - objectDensity) * objectVolume * G_STANDARD;

    if (wouldFloat) {
      // Fraction submerged when floating at equilibrium
      // At equilibrium: ρ_object × V × g = ρ_fluid × V_submerged × g
      // V_submerged / V = ρ_object / ρ_fluid
      result.fractionSubmerged = densityRatio;
    }
  }

  return result;
}
```

---

## 5. Stratification Potential (Stage 2)

### 5.1 Concept

For a homogeneous mixture, we can calculate whether the components **would** separate based on their densities, without actually simulating the separation.

**Stratification Order**: Components ordered by density (lightest on top).

### 5.2 Density Ordering

```typescript
interface StratificationInput {
  /** Composition of the mixture */
  readonly composition: Composition;
  /** Temperature in Kelvin */
  readonly temperature: number;
}

interface StratificationResult {
  /** Substance IDs ordered from top (lightest) to bottom (densest) */
  readonly layerOrder: SubstanceId[];
  /** Density of each substance at current temperature */
  readonly densities: Map<SubstanceId, number>;
  /** Whether the mixture would stratify (different densities) */
  readonly wouldStratify: boolean;
  /** Maximum density difference in kg/m³ */
  readonly maxDensityDifference: number;
}

/**
 * Determine stratification order based on component densities.
 */
function calculateStratificationOrder(
  input: StratificationInput,
  registry: SubstanceRegistry
): StratificationResult {
  const densities = new Map<SubstanceId, number>();

  // Get density for each substance
  for (const id of input.composition.moles.keys()) {
    const substance = registry.getRequired(id);
    // Could add temperature correction here
    densities.set(id, substance.density);
  }

  // Sort by density (ascending = lightest first = top layer)
  const layerOrder = Array.from(densities.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => id);

  // Calculate density range
  const densityValues = Array.from(densities.values());
  const minDensity = Math.min(...densityValues);
  const maxDensity = Math.max(...densityValues);
  const maxDensityDifference = maxDensity - minDensity;

  // Would stratify if significant density difference
  const STRATIFICATION_THRESHOLD = 10;  // kg/m³
  const wouldStratify = maxDensityDifference > STRATIFICATION_THRESHOLD;

  return {
    layerOrder,
    densities,
    wouldStratify,
    maxDensityDifference,
  };
}
```

### 5.3 Gravitational Potential Energy

The tendency to stratify can be quantified by the gravitational potential energy difference:

**Mixed state**: All components uniformly distributed at average height h_avg
```
PE_mixed = Σ m_i × g × h_avg
```

**Separated state**: Each component at its equilibrium height h_i
```
PE_separated = Σ m_i × g × h_i
```

**Stratification drive**:
```
ΔPE = PE_mixed - PE_separated
```

If ΔPE > 0, the system would release energy by stratifying.

```typescript
interface PotentialEnergyResult {
  /** Potential energy of mixed state in Joules */
  readonly mixedPE: number;
  /** Potential energy of separated state in Joules */
  readonly separatedPE: number;
  /** Energy released by stratification in Joules */
  readonly stratificationDrive: number;
}

/**
 * Calculate gravitational PE difference between mixed and stratified states.
 *
 * This is an indicator of separation tendency, not actual dynamics.
 */
function calculateStratificationEnergy(
  composition: Composition,
  containerHeight: number,  // m
  registry: SubstanceRegistry
): PotentialEnergyResult {
  const substances = Array.from(composition.moles.keys());
  const n = substances.length;

  if (n < 2) {
    return { mixedPE: 0, separatedPE: 0, stratificationDrive: 0 };
  }

  // Calculate masses
  const masses = new Map<SubstanceId, number>();
  let totalMass = 0;
  for (const id of substances) {
    const substance = registry.getRequired(id);
    const mass = (composition.moles.get(id) ?? 0) * substance.molarMass / 1000;  // kg
    masses.set(id, mass);
    totalMass += mass;
  }

  // Mixed state: all at center of mass (h/2)
  const h_avg = containerHeight / 2;
  const mixedPE = totalMass * G_STANDARD * h_avg;

  // Separated state: layers stacked by density
  // Densest at bottom, lightest at top
  const stratOrder = calculateStratificationOrder(
    { composition, temperature: 298.15 },
    registry
  );

  let separatedPE = 0;
  let currentHeight = 0;

  // Process from bottom (densest) to top (lightest)
  const reversedOrder = [...stratOrder.layerOrder].reverse();
  for (const id of reversedOrder) {
    const mass = masses.get(id) ?? 0;
    const substance = registry.getRequired(id);
    const moles = composition.moles.get(id) ?? 0;
    const volume = moles * substance.molarVolumeLiquid / 1000;  // m³

    // Assume cylindrical container with unit cross-section for simplicity
    const layerHeight = volume;  // This is simplified; real calc needs cross-section
    const layerCenterHeight = currentHeight + layerHeight / 2;

    separatedPE += mass * G_STANDARD * layerCenterHeight;
    currentHeight += layerHeight;
  }

  return {
    mixedPE,
    separatedPE,
    stratificationDrive: mixedPE - separatedPE,
  };
}
```

---

## 6. Complete Gravity System

### 6.1 Combined Interface

```typescript
interface GravitySystemInput {
  readonly composition: Composition;
  readonly temperature: number;
  readonly containerHeight: number;     // m
  readonly liquidHeight: number;        // m
  readonly surfacePressure: number;     // kPa
}

interface GravitySystemResult {
  /** Hydrostatic pressure results */
  readonly hydrostatic: ContainerPressureResult;
  /** Stratification analysis */
  readonly stratification: StratificationResult;
  /** Average density of mixture */
  readonly mixtureDensity: number;
}

/**
 * Calculate all gravity-dependent properties.
 */
function calculateGravityProperties(
  input: GravitySystemInput,
  registry: SubstanceRegistry
): GravitySystemResult {
  // Calculate mixture density from composition
  const totalMass = getTotalMass(input.composition, registry);
  const totalVolume = calculateVolume(
    { composition: input.composition, temperature: input.temperature },
    registry,
    excessVolumeRegistry
  ).totalVolume;
  const mixtureDensity = (totalMass / 1000) / (totalVolume / 1000);  // kg/m³

  // Hydrostatic pressure
  const hydrostatic = calculateContainerPressure({
    surfacePressure: input.surfacePressure,
    liquidHeight: input.liquidHeight,
    density: mixtureDensity,
  });

  // Stratification
  const stratification = calculateStratificationOrder(
    { composition: input.composition, temperature: input.temperature },
    registry
  );

  return {
    hydrostatic,
    stratification,
    mixtureDensity,
  };
}
```

---

## 7. TDD Validation Data

### 7.1 Hydrostatic Pressure Tests

```typescript
describe('HydrostaticPressure', () => {
  it('should calculate correct pressure for 10m water column', () => {
    const result = calculateHydrostaticPressure({
      surfacePressure: 101.325,  // 1 atm
      density: 997,              // water at 25°C
      depth: 10,                 // 10 meters
    });

    // ΔP = 997 × 9.80665 × 10 / 1000 ≈ 97.8 kPa
    // P_total ≈ 101.325 + 97.8 ≈ 199.1 kPa ≈ 2 atm
    expect(result.pressureAtDepth).toBeCloseTo(199.1, 0);
  });

  it('should give correct gradient for water', () => {
    const result = calculateHydrostaticPressure({
      surfacePressure: 0,
      density: 1000,
      depth: 1,
    });

    // Gradient = 1000 × 9.80665 / 1000 = 9.80665 kPa/m
    expect(result.pressureGradient).toBeCloseTo(9.80665, 3);
  });
});
```

### 7.2 Buoyancy Tests

```typescript
describe('Buoyancy', () => {
  it('should predict ice floats in water', () => {
    const result = calculateBuoyancy({
      fluidDensity: 997,   // water at 25°C
      objectDensity: 917,  // ice at 0°C
    });

    expect(result.wouldFloat).toBe(true);
    expect(result.fractionSubmerged).toBeCloseTo(0.92, 2);  // ~92% submerged
  });

  it('should predict steel sinks in water', () => {
    const result = calculateBuoyancy({
      fluidDensity: 997,
      objectDensity: 7850,  // steel
    });

    expect(result.wouldSink).toBe(true);
  });

  it('should calculate correct net force', () => {
    const result = calculateBuoyancy({
      fluidDensity: 1000,
      objectDensity: 500,   // Half the density
      objectVolume: 0.001,  // 1 liter = 0.001 m³
    });

    // F = (1000 - 500) × 0.001 × 9.80665 ≈ 4.9 N
    expect(result.netForce).toBeCloseTo(4.9, 1);
  });
});
```

### 7.3 Stratification Tests

```typescript
describe('Stratification', () => {
  it('should order oil above water', () => {
    const comp = createComposition({
      'H2O': 1.0,
      'oil': 1.0,  // Assuming oil is registered with lower density
    });

    const result = calculateStratificationOrder(
      { composition: comp, temperature: 298.15 },
      registry
    );

    // Oil (ρ ≈ 800) should be above water (ρ ≈ 997)
    expect(result.layerOrder[0]).toBe('oil');
    expect(result.layerOrder[1]).toBe('H2O');
    expect(result.wouldStratify).toBe(true);
  });

  it('should indicate no stratification for single component', () => {
    const comp = pureComposition('H2O', 1.0);

    const result = calculateStratificationOrder(
      { composition: comp, temperature: 298.15 },
      registry
    );

    expect(result.wouldStratify).toBe(false);
  });
});
```

---

## 8. Interaction Points

- **[04_Volume_System.md](04_Volume_System.md)**: Volume → density calculation
- **[05_Pressure_System.md](05_Pressure_System.md)**: Surface pressure (gas headspace)
- **[17_Container_Model.md](17_Container_Model.md)**: Container height, liquid level
- **[06_Solution_Properties.md](06_Solution_Properties.md)**: Mixture density
