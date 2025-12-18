# Heat Capacity

## Overview

This document defines the heat capacity system, which determines the energy required to change the temperature of a substance or mixture. Heat capacity is essential for understanding thermal response without simulating time evolution.

---

## 1. First Principles

### 1.1 Molecular Energy Storage

Heat capacity arises from how molecules store thermal energy:

| Mode | Contribution to Cv | Description |
|------|-------------------|-------------|
| **Translational** | (3/2)R | Motion in x, y, z |
| **Rotational** | R (linear), (3/2)R (nonlinear) | Molecular tumbling |
| **Vibrational** | R per mode (at high T) | Bond stretching/bending |

For an ideal monatomic gas: Cv = (3/2)R
For a diatomic gas (high T): Cv = (7/2)R

### 1.2 Heat Capacity Definition

**Definition**: The amount of heat required to raise temperature by 1 K.

```
C = dQ/dT
```

**Molar heat capacity** (per mole): Units of J/(mol·K)
**Specific heat capacity** (per gram): Units of J/(g·K)

### 1.3 Cp vs Cv

- **Cv**: Heat capacity at constant volume
- **Cp**: Heat capacity at constant pressure

For ideal gases:
```
Cp - Cv = R = 8.314 J/(mol·K)
```

For liquids (nearly incompressible):
```
Cp ≈ Cv
```

We primarily use **Cp** since most processes occur at constant (atmospheric) pressure.

---

## 2. Heat Capacity Definition (Stage 3)

### 2.1 Molar Heat Capacity

For pure substances:
```
Q = n × Cp × ΔT
```

where:
- Q = heat added (J)
- n = moles
- Cp = molar heat capacity (J/(mol·K))
- ΔT = temperature change (K)

### 2.2 Data Structure

```typescript
interface HeatCapacityData {
  /** Molar heat capacity at reference temperature in J/(mol·K) */
  readonly Cp: number;

  /** Reference temperature in K */
  readonly refTemperature: number;

  /** Temperature dependence coefficients (optional) */
  readonly temperatureDependence?: HeatCapacityPolynomial;
}

interface HeatCapacityPolynomial {
  /** Polynomial coefficients: Cp = a + bT + cT² + dT³ */
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;

  /** Valid temperature range in K */
  readonly validRange: [number, number];
}
```

### 2.3 Reference Values

**Pure substances at 25°C (298.15 K)**:

| Substance | Cp (J/(mol·K)) | Cp (J/(g·K)) |
|-----------|---------------|--------------|
| Water (l) | 75.385 | 4.184 |
| Ethanol (l) | 112.3 | 2.438 |
| Water (g) | 33.6 | 1.864 |
| N₂ (g) | 29.124 | 1.040 |
| CO₂ (g) | 37.1 | 0.843 |
| NaCl (s) | 50.5 | 0.864 |

---

## 3. Temperature Dependence

### 3.1 Polynomial Form

For accurate calculations over a temperature range:
```
Cp(T) = a + b×T + c×T² + d×T³
```

### 3.2 Shomate Equation (NIST Standard)

```
Cp(T) = A + B×t + C×t² + D×t³ + E/t²
```

where t = T/1000 (T in Kelvin)

**Implementation**:
```typescript
interface ShomateCoefficients {
  A: number;
  B: number;
  C: number;
  D: number;
  E: number;
  validRange: [number, number];  // K
}

/**
 * Calculate heat capacity using Shomate equation.
 * Cp = A + B×t + C×t² + D×t³ + E/t² where t = T/1000
 */
function calculateShomate(T: number, coeffs: ShomateCoefficients): number {
  const t = T / 1000;
  return coeffs.A +
         coeffs.B * t +
         coeffs.C * t * t +
         coeffs.D * t * t * t +
         coeffs.E / (t * t);
}
```

### 3.3 Water Shomate Coefficients

**Liquid water (298-500 K)**:
- A = -203.606
- B = 1523.29
- C = -3196.413
- D = 2474.455
- E = 3.855326

**Source**: NIST Chemistry WebBook

---

## 4. Mixture Heat Capacity

### 4.1 Ideal Mixing Rule

For ideal mixtures, heat capacity is the mole-fraction weighted average:
```
Cp_mix = Σ x_i × Cp_i
```

**Physical basis**: In ideal solutions, the energy required to heat each component is independent of the presence of other components.

### 4.2 Excess Heat Capacity

For non-ideal solutions:
```
Cp_mix = Σ x_i × Cp_i + Cp^E
```

where Cp^E is the excess heat capacity.

**Relationship to other excess properties**:
```
Cp^E = -T × (∂²G^E/∂T²)_P,x
```

For most systems, Cp^E is small (< 5% of ideal) and can be neglected for Stage 3.

### 4.3 Implementation

```typescript
interface HeatCapacityInput {
  readonly composition: Composition;
  readonly temperature: number;  // K
}

interface HeatCapacityResult {
  /** Mixture heat capacity in J/(mol·K) */
  readonly molarCp: number;

  /** Mixture heat capacity in J/(g·K) */
  readonly specificCp: number;

  /** Ideal contribution in J/(mol·K) */
  readonly idealCp: number;

  /** Excess contribution in J/(mol·K) (if calculated) */
  readonly excessCp: number;

  /** Component contributions */
  readonly componentCp: Map<SubstanceId, number>;
}

/**
 * Calculate mixture heat capacity using ideal mixing rule.
 */
function calculateHeatCapacity(
  input: HeatCapacityInput,
  registry: SubstanceRegistry
): HeatCapacityResult {
  const { composition, temperature } = input;
  const fractions = getMoleFractions(composition);

  let idealCp = 0;
  const componentCp = new Map<SubstanceId, number>();

  for (const [id, x] of fractions) {
    const substance = registry.getRequired(id);

    // Get Cp at temperature (use Shomate if available)
    let Cp: number;
    if (substance.shomate &&
        temperature >= substance.shomate.validRangeK[0] &&
        temperature <= substance.shomate.validRangeK[1]) {
      Cp = calculateShomate(temperature, substance.shomate);
    } else {
      Cp = substance.heatCapacityCp;  // Use reference value
    }

    componentCp.set(id, Cp);
    idealCp += x * Cp;
  }

  // Calculate specific heat capacity
  const avgMolarMass = getAverageMolarMass(composition, registry);
  const specificCp = idealCp / avgMolarMass;

  return {
    molarCp: idealCp,
    specificCp,
    idealCp,
    excessCp: 0,  // Neglected for Stage 3
    componentCp,
  };
}
```

---

## 5. Energy Calculations

### 5.1 Heat Required for Temperature Change

```typescript
interface HeatingInput {
  readonly composition: Composition;
  readonly temperature: number;        // Current T in K
  readonly targetTemperature: number;  // Target T in K
}

interface HeatingResult {
  /** Heat required in Joules */
  readonly heatRequired: number;

  /** Heat required in kJ */
  readonly heatRequiredKJ: number;

  /** Temperature change in K */
  readonly deltaT: number;

  /** Average Cp used in J/(mol·K) */
  readonly averageCp: number;
}

/**
 * Calculate heat required to change temperature.
 * Q = n × Cp × ΔT
 *
 * Note: This calculates the heat REQUIRED, not the time to achieve it.
 */
function calculateHeatRequired(
  input: HeatingInput,
  registry: SubstanceRegistry
): HeatingResult {
  const { composition, temperature, targetTemperature } = input;

  const deltaT = targetTemperature - temperature;
  const totalMoles = getTotalMoles(composition);

  // Use average Cp between current and target temperatures
  const avgT = (temperature + targetTemperature) / 2;
  const cpResult = calculateHeatCapacity(
    { composition, temperature: avgT },
    registry
  );

  const heatRequired = totalMoles * cpResult.molarCp * deltaT;

  return {
    heatRequired,
    heatRequiredKJ: heatRequired / 1000,
    deltaT,
    averageCp: cpResult.molarCp,
  };
}
```

### 5.2 Temperature Change from Heat Addition

**Inverse calculation** - given Q, find ΔT:

```typescript
/**
 * Calculate temperature change from adding heat.
 * ΔT = Q / (n × Cp)
 *
 * Note: Instantaneous property - doesn't simulate heat transfer over time.
 */
function calculateTemperatureChange(
  composition: Composition,
  temperature: number,
  heatAdded: number,  // Joules
  registry: SubstanceRegistry
): number {
  const totalMoles = getTotalMoles(composition);
  const cpResult = calculateHeatCapacity(
    { composition, temperature },
    registry
  );

  return heatAdded / (totalMoles * cpResult.molarCp);
}
```

---

## 6. Heat Capacity at Constant Volume

### 6.1 For Gases

```
Cv = Cp - R
```

For ideal gases, this is exact.

### 6.2 For Liquids

```
Cp - Cv = (T × V × α²) / κ_T
```

where:
- α = thermal expansion coefficient
- κ_T = isothermal compressibility

For liquids, Cp ≈ Cv (difference < 1%).

### 6.3 Implementation

```typescript
/**
 * Calculate Cv from Cp for gases.
 */
function calculateCvFromCp(Cp: number, phase: 'gas' | 'liquid'): number {
  if (phase === 'gas') {
    return Cp - 8.314;  // R = 8.314 J/(mol·K)
  } else {
    return Cp;  // Cp ≈ Cv for liquids
  }
}
```

---

## 7. TDD Validation Data

### 7.1 Pure Component Tests

```typescript
describe('HeatCapacity - Pure Components', () => {
  it('should give Cp = 75.4 J/(mol·K) for water at 25°C', () => {
    const comp = pureComposition('H2O', 1.0);
    const result = calculateHeatCapacity(
      { composition: comp, temperature: 298.15 },
      registry
    );

    expect(result.molarCp).toBeCloseTo(75.4, 0);
  });

  it('should give Cp = 4.18 J/(g·K) for water at 25°C', () => {
    const comp = pureComposition('H2O', 1.0);
    const result = calculateHeatCapacity(
      { composition: comp, temperature: 298.15 },
      registry
    );

    expect(result.specificCp).toBeCloseTo(4.18, 1);
  });

  it('should give Cp = 112 J/(mol·K) for ethanol at 25°C', () => {
    const comp = pureComposition('C2H5OH', 1.0);
    const result = calculateHeatCapacity(
      { composition: comp, temperature: 298.15 },
      registry
    );

    expect(result.molarCp).toBeCloseTo(112, 0);
  });
});
```

### 7.2 Mixture Tests

```typescript
describe('HeatCapacity - Mixtures', () => {
  it('should give weighted average for ideal mixture', () => {
    // 50 mol% water + 50 mol% ethanol
    const comp = createComposition({ 'H2O': 0.5, 'C2H5OH': 0.5 });
    const result = calculateHeatCapacity(
      { composition: comp, temperature: 298.15 },
      registry
    );

    // Expected: 0.5 × 75.4 + 0.5 × 112.3 ≈ 93.9 J/(mol·K)
    expect(result.molarCp).toBeCloseTo(93.9, 0);
  });
});
```

### 7.3 Heating Calculation Tests

```typescript
describe('HeatRequired', () => {
  it('should calculate heat to warm 1 mol water by 10K', () => {
    const comp = pureComposition('H2O', 1.0);
    const result = calculateHeatRequired(
      { composition: comp, temperature: 298.15, targetTemperature: 308.15 },
      registry
    );

    // Q = 1 mol × 75.4 J/(mol·K) × 10 K = 754 J
    expect(result.heatRequired).toBeCloseTo(754, 0);
  });

  it('should calculate heat to warm 1 kg water by 1K', () => {
    // 1 kg water = 1000g / 18.015 g/mol = 55.5 mol
    const comp = pureComposition('H2O', 55.5);
    const result = calculateHeatRequired(
      { composition: comp, temperature: 298.15, targetTemperature: 299.15 },
      registry
    );

    // Q = 55.5 × 75.4 × 1 = 4185 J ≈ 4.18 kJ (definition of calorie!)
    expect(result.heatRequiredKJ).toBeCloseTo(4.18, 1);
  });
});
```

---

## 8. Interaction Points

- **[02_Substance_Model.md](02_Substance_Model.md)**: Cp values, Shomate coefficients
- **[03_Composition_System.md](03_Composition_System.md)**: Composition, mole fractions
- **[08_Heat_of_Mixing.md](08_Heat_of_Mixing.md)**: Uses Cp for ΔT calculation
- **[09_Thermal_Conductivity.md](09_Thermal_Conductivity.md)**: Related thermal property
