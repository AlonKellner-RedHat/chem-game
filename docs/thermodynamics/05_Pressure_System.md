# Pressure System

## Overview

This document defines the pressure calculation system, covering ideal gas pressure, vapor pressure, and activity coefficients for non-ideal solutions. Pressure determines phase behavior and gas-liquid equilibrium.

---

## 1. First Principles

### 1.1 Kinetic Theory of Gases

Pressure arises from molecular collisions with container walls:

```
P = (1/3) × (N/V) × m × <v²>
```

where:
- N = number of molecules
- V = volume
- m = molecular mass
- <v²> = mean square velocity

Combined with the relationship between kinetic energy and temperature:
```
(1/2)m<v²> = (3/2)k_B T
```

This leads to the ideal gas law.

### 1.2 The Ideal Gas Law

```
PV = nRT
```

where:
- P = pressure (Pa or kPa)
- V = volume (m³ or L)
- n = moles
- R = gas constant = 8.31446 J/(mol·K) = 8.31446 L·kPa/(mol·K)
- T = temperature (K)

**Reference**: Derived from kinetic theory; formalized by Clapeyron (1834)

### 1.3 Vapor-Liquid Equilibrium

At equilibrium between liquid and gas phases:
- Rate of evaporation = Rate of condensation
- Gas phase pressure = Vapor pressure at that temperature
- Liquid and vapor compositions are related by phase equilibrium

---

## 2. Ideal Gas Law (Stage 2)

### 2.1 Pressure Calculation

```
P = nRT/V
```

**Units check**:
- n [mol] × R [L·kPa/(mol·K)] × T [K] / V [L] = P [kPa]

### 2.2 Implementation

```typescript
/** Gas constant in L·kPa/(mol·K) */
const R_GAS = 8.31446261815324;

interface IdealGasInput {
  /** Total moles of gas */
  readonly moles: number;
  /** Temperature in Kelvin */
  readonly temperature: number;
  /** Volume in liters */
  readonly volume: number;
}

interface PressureResult {
  /** Total pressure in kPa */
  readonly pressure: number;
  /** Partial pressures by substance ID */
  readonly partialPressures?: Map<SubstanceId, number>;
}

/**
 * Calculate pressure using ideal gas law.
 * P = nRT/V
 */
function calculateIdealGasPressure(input: IdealGasInput): number {
  const { moles, temperature, volume } = input;

  if (volume <= 0) {
    throw new Error('Volume must be positive');
  }
  if (temperature <= 0) {
    throw new Error('Temperature must be positive (Kelvin)');
  }

  return (moles * R_GAS * temperature) / volume;
}
```

### 2.3 Inverse Calculations

```typescript
/**
 * Calculate volume from pressure.
 * V = nRT/P
 */
function calculateIdealGasVolume(
  moles: number,
  temperature: number,
  pressure: number
): number {
  return (moles * R_GAS * temperature) / pressure;
}

/**
 * Calculate temperature from pressure.
 * T = PV/(nR)
 */
function calculateIdealGasTemperature(
  moles: number,
  pressure: number,
  volume: number
): number {
  return (pressure * volume) / (moles * R_GAS);
}
```

---

## 3. Partial Pressures (Dalton's Law)

### 3.1 Derivation

For a mixture of ideal gases, each component behaves independently:

```
P_total = Σ P_i
```

where the partial pressure of component i is:
```
P_i = (n_i / V) × RT = x_i × P_total
```

### 3.2 Implementation

```typescript
/**
 * Calculate partial pressures for a gas mixture.
 */
function calculatePartialPressures(
  composition: Composition,
  totalPressure: number
): Map<SubstanceId, number> {
  const fractions = getMoleFractions(composition);
  const partials = new Map<SubstanceId, number>();

  for (const [id, x] of fractions) {
    partials.set(id, x * totalPressure);
  }

  return partials;
}
```

---

## 4. Vapor Pressure

### 4.1 Clausius-Clapeyron Equation

**Derivation**:

At phase equilibrium, the chemical potentials are equal:
```
μ_liquid = μ_vapor
```

Taking the derivative with respect to temperature at equilibrium:
```
dP/dT = ΔS_vap / ΔV_vap = ΔH_vap / (T × ΔV_vap)
```

For an ideal gas vapor and incompressible liquid (ΔV ≈ V_gas = RT/P):
```
dP/dT = (P × ΔH_vap) / (R × T²)
```

Integrating:
```
ln(P₂/P₁) = -(ΔH_vap/R) × (1/T₂ - 1/T₁)
```

**Reference**: Clausius, R. (1850); Clapeyron, B.P.E. (1834)

### 4.2 Antoine Equation

An empirical fit that's more accurate than Clausius-Clapeyron:

```
log₁₀(P) = A - B / (T + C)
```

where:
- P = vapor pressure (typically mmHg)
- T = temperature (typically °C)
- A, B, C = substance-specific constants

**Reference**: Antoine, C. (1888). Comptes Rendus 107: 681-684.

### 4.3 Implementation

```typescript
interface AntoineCoefficients {
  A: number;
  B: number;
  C: number;
  pressureUnit: 'mmHg' | 'kPa' | 'bar';
  temperatureUnit: 'C' | 'K';
  validRange: [number, number];  // In temperature units
}

/**
 * Calculate vapor pressure using Antoine equation.
 * log₁₀(P) = A - B / (T + C)
 *
 * @param T - Temperature in Kelvin
 * @param coeffs - Antoine coefficients
 * @returns Vapor pressure in kPa
 */
function calculateAntoineVaporPressure(
  T: number,
  coeffs: AntoineCoefficients
): number {
  // Convert temperature to coefficient units
  let T_calc: number;
  if (coeffs.temperatureUnit === 'C') {
    T_calc = T - 273.15;
  } else {
    T_calc = T;
  }

  // Check valid range
  const [Tmin, Tmax] = coeffs.validRange;
  if (T_calc < Tmin || T_calc > Tmax) {
    console.warn(`Temperature ${T_calc} outside valid range [${Tmin}, ${Tmax}]`);
  }

  // Calculate pressure in original units
  const log10P = coeffs.A - coeffs.B / (T_calc + coeffs.C);
  let P = Math.pow(10, log10P);

  // Convert to kPa
  switch (coeffs.pressureUnit) {
    case 'mmHg':
      P *= 0.133322;  // 1 mmHg = 0.133322 kPa
      break;
    case 'bar':
      P *= 100;       // 1 bar = 100 kPa
      break;
    case 'kPa':
      break;          // Already in kPa
  }

  return P;
}
```

### 4.4 Reference Values

**Water** (T in °C, P in mmHg):
- A = 8.07131, B = 1730.63, C = 233.426 (1-100°C)
- A = 8.14019, B = 1810.94, C = 244.485 (99-374°C)

**Ethanol** (T in °C, P in mmHg):
- A = 8.20417, B = 1642.89, C = 230.300 (-57 to 80°C)

---

## 5. Raoult's Law (Ideal Solutions)

### 5.1 Derivation

For an ideal solution, the vapor pressure of component i is proportional to its mole fraction:

```
P_i = x_i × P_i*
```

where:
- P_i = partial pressure of i above the solution
- x_i = mole fraction of i in liquid
- P_i* = vapor pressure of pure i at same temperature

**Physical basis**: In ideal solutions, molecules of i are surrounded by a mixture that on average behaves like pure i. The "escape tendency" is reduced proportionally to the mole fraction.

### 5.2 Total Vapor Pressure

```
P_total = Σ P_i = Σ x_i × P_i*
```

### 5.3 Implementation

```typescript
/**
 * Calculate vapor pressure above an ideal solution.
 * Raoult's Law: P_i = x_i × P_i*
 */
function calculateRaoultVaporPressure(
  composition: Composition,
  temperature: number,
  registry: SubstanceRegistry
): PressureResult {
  const fractions = getMoleFractions(composition);
  const partials = new Map<SubstanceId, number>();
  let total = 0;

  for (const [id, x] of fractions) {
    const substance = registry.getRequired(id);
    const pureVaporPressure = calculateAntoineVaporPressure(
      temperature,
      substance.antoine
    );

    const partial = x * pureVaporPressure;
    partials.set(id, partial);
    total += partial;
  }

  return {
    pressure: total,
    partialPressures: partials,
  };
}
```

---

## 6. Activity Coefficients (Non-Ideal Solutions)

### 6.1 Definition

For non-ideal solutions, Raoult's Law is modified:

```
P_i = x_i × γ_i × P_i*
```

where γ_i is the **activity coefficient** of component i.

**Activity** is defined as:
```
a_i = γ_i × x_i
```

**Physical meaning of γ**:
- γ = 1: Ideal behavior
- γ > 1: Positive deviation (molecules "want to escape" more than ideal)
- γ < 1: Negative deviation (molecules are stabilized in solution)

### 6.2 Activity Model Interface (OCP)

```typescript
/**
 * Interface for activity coefficient models.
 */
interface ActivityCoefficientModel {
  readonly id: string;
  readonly name: string;

  /**
   * Calculate activity coefficients for all components.
   *
   * @param composition - Current composition
   * @param temperature - Temperature in Kelvin
   * @returns Map of substance ID to activity coefficient
   */
  calculate(
    composition: Composition,
    temperature: number
  ): Map<SubstanceId, number>;
}
```

### 6.3 Margules Equation (One-Parameter)

**Derivation**:

The simplest model for excess Gibbs energy:
```
G^E = A × x₁ × x₂ × RT
```

Taking the derivative to get activity coefficients:
```
ln(γ₁) = A × x₂²
ln(γ₂) = A × x₁²
```

**Properties**:
- Single parameter A
- Symmetric (γ₁ at x₁→0 equals γ₂ at x₂→0)
- Suitable for systems with weak non-ideality

**Reference**: Margules, M. (1895). Sitzungsber. Akad. Wiss. Wien. 104: 1243.

```typescript
/**
 * Margules one-parameter model for activity coefficients.
 */
class MargulesSingleParameter implements ActivityCoefficientModel {
  readonly id: string;
  readonly name = 'Margules (1-parameter)';

  private readonly substance1: SubstanceId;
  private readonly substance2: SubstanceId;
  private readonly A: number;  // Dimensionless

  constructor(
    id: string,
    pair: [SubstanceId, SubstanceId],
    A: number
  ) {
    this.id = id;
    this.substance1 = pair[0];
    this.substance2 = pair[1];
    this.A = A;
  }

  calculate(
    composition: Composition,
    temperature: number
  ): Map<SubstanceId, number> {
    const fractions = getMoleFractions(composition);
    const x1 = fractions.get(this.substance1) ?? 0;
    const x2 = fractions.get(this.substance2) ?? 0;

    const gamma1 = Math.exp(this.A * x2 * x2);
    const gamma2 = Math.exp(this.A * x1 * x1);

    const result = new Map<SubstanceId, number>();
    result.set(this.substance1, gamma1);
    result.set(this.substance2, gamma2);

    // Set γ = 1 for other components (ideal)
    for (const id of fractions.keys()) {
      if (!result.has(id)) {
        result.set(id, 1.0);
      }
    }

    return result;
  }
}
```

### 6.4 Van Laar Equation (Two-Parameter)

**Derivation**:

More flexible model with two parameters:
```
ln(γ₁) = A₁₂ / [1 + (A₁₂ × x₁) / (A₂₁ × x₂)]²
ln(γ₂) = A₂₁ / [1 + (A₂₁ × x₂) / (A₁₂ × x₁)]²
```

**Properties**:
- Two parameters: A₁₂ and A₂₁
- Asymmetric (can model skewed systems)
- More accurate than Margules for many systems

**Reference**: van Laar, J.J. (1910). Z. Phys. Chem. 72: 723.

```typescript
/**
 * Van Laar two-parameter model for activity coefficients.
 */
class VanLaarModel implements ActivityCoefficientModel {
  readonly id: string;
  readonly name = 'Van Laar';

  private readonly substance1: SubstanceId;
  private readonly substance2: SubstanceId;
  private readonly A12: number;
  private readonly A21: number;

  constructor(
    id: string,
    pair: [SubstanceId, SubstanceId],
    A12: number,
    A21: number
  ) {
    this.id = id;
    this.substance1 = pair[0];
    this.substance2 = pair[1];
    this.A12 = A12;
    this.A21 = A21;
  }

  calculate(
    composition: Composition,
    temperature: number
  ): Map<SubstanceId, number> {
    const fractions = getMoleFractions(composition);
    const x1 = fractions.get(this.substance1) ?? 0;
    const x2 = fractions.get(this.substance2) ?? 0;

    let gamma1 = 1;
    let gamma2 = 1;

    if (x1 > 0 && x2 > 0) {
      const ratio1 = (this.A12 * x1) / (this.A21 * x2);
      const ratio2 = (this.A21 * x2) / (this.A12 * x1);

      gamma1 = Math.exp(this.A12 / Math.pow(1 + ratio1, 2));
      gamma2 = Math.exp(this.A21 / Math.pow(1 + ratio2, 2));
    }

    const result = new Map<SubstanceId, number>();
    result.set(this.substance1, gamma1);
    result.set(this.substance2, gamma2);

    return result;
  }
}
```

### 6.5 Water-Ethanol Activity Data

**Experimental values at 25°C**:

| x_ethanol | γ_water | γ_ethanol |
|-----------|---------|-----------|
| 0.0 | 1.00 | — |
| 0.1 | 1.01 | 2.35 |
| 0.2 | 1.05 | 1.91 |
| 0.3 | 1.11 | 1.60 |
| 0.4 | 1.19 | 1.38 |
| 0.5 | 1.30 | 1.23 |
| 0.6 | 1.45 | 1.13 |
| 0.7 | 1.65 | 1.06 |
| 0.8 | 1.92 | 1.02 |
| 0.9 | 2.30 | 1.00 |
| 1.0 | — | 1.00 |

**Fitted parameters**:
- Margules: A ≈ 0.95
- Van Laar: A₁₂ ≈ 0.92, A₂₁ ≈ 0.95

---

## 7. Modified Raoult's Law

### 7.1 Complete Vapor Pressure Calculation

```typescript
/**
 * Calculate vapor pressure above a non-ideal solution.
 * Modified Raoult's Law: P_i = x_i × γ_i × P_i*
 */
function calculateModifiedRaoultVaporPressure(
  composition: Composition,
  temperature: number,
  registry: SubstanceRegistry,
  activityModel: ActivityCoefficientModel
): PressureResult {
  const fractions = getMoleFractions(composition);
  const gammas = activityModel.calculate(composition, temperature);

  const partials = new Map<SubstanceId, number>();
  let total = 0;

  for (const [id, x] of fractions) {
    const substance = registry.getRequired(id);
    const pureVaporPressure = calculateAntoineVaporPressure(
      temperature,
      substance.antoine
    );

    const gamma = gammas.get(id) ?? 1;
    const partial = x * gamma * pureVaporPressure;

    partials.set(id, partial);
    total += partial;
  }

  return {
    pressure: total,
    partialPressures: partials,
  };
}
```

---

## 8. TDD Validation Data

### 8.1 Ideal Gas Tests

```typescript
describe('IdealGasLaw', () => {
  it('should give P = 101.325 kPa at STP', () => {
    const P = calculateIdealGasPressure({
      moles: 1.0,
      temperature: 273.15,
      volume: 22.414,
    });

    expect(P).toBeCloseTo(101.325, 2);
  });

  it('should double pressure when moles double', () => {
    const P1 = calculateIdealGasPressure({ moles: 1, temperature: 300, volume: 10 });
    const P2 = calculateIdealGasPressure({ moles: 2, temperature: 300, volume: 10 });

    expect(P2 / P1).toBeCloseTo(2.0, 5);
  });

  it('should double pressure when temperature doubles', () => {
    const P1 = calculateIdealGasPressure({ moles: 1, temperature: 300, volume: 10 });
    const P2 = calculateIdealGasPressure({ moles: 1, temperature: 600, volume: 10 });

    expect(P2 / P1).toBeCloseTo(2.0, 5);
  });
});
```

### 8.2 Vapor Pressure Tests

```typescript
describe('AntoineVaporPressure', () => {
  // NIST data for water
  const WATER_VP_DATA = [
    { tempC: 0, P_kPa: 0.6113 },
    { tempC: 25, P_kPa: 3.1690 },
    { tempC: 50, P_kPa: 12.344 },
    { tempC: 100, P_kPa: 101.325 },
  ];

  it.each(WATER_VP_DATA)(
    'should give P ≈ $P_kPa kPa for water at $tempC°C',
    ({ tempC, P_kPa }) => {
      const P = calculateAntoineVaporPressure(
        tempC + 273.15,
        WATER.antoine
      );

      expect(P).toBeCloseTo(P_kPa, 1);  // ±0.1 kPa
    }
  );
});
```

### 8.3 Activity Coefficient Tests

```typescript
describe('MargulesSingleParameter', () => {
  const model = new MargulesSingleParameter(
    'margules-water-ethanol',
    ['H2O', 'C2H5OH'],
    0.95
  );

  it('should give γ = 1 for pure components', () => {
    const pure = pureComposition('H2O', 1.0);
    const gammas = model.calculate(pure, 298.15);

    expect(gammas.get('H2O')).toBeCloseTo(1.0, 5);
  });

  it('should give γ > 1 for water in ethanol-rich mixture', () => {
    const comp = createComposition({ 'H2O': 0.1, 'C2H5OH': 0.9 });
    const gammas = model.calculate(comp, 298.15);

    expect(gammas.get('H2O')).toBeGreaterThan(1.5);
  });
});
```

---

## 9. Interaction Points

- **[02_Substance_Model.md](02_Substance_Model.md)**: Antoine coefficients
- **[03_Composition_System.md](03_Composition_System.md)**: Mole fractions
- **[06_Gravity_Hydrostatics.md](06_Gravity_Hydrostatics.md)**: Gas pressure → hydrostatic
- **[14_Gas_Solubility.md](14_Gas_Solubility.md)**: Henry's law uses partial pressures
- **[22_Data_Sources.md](22_Data_Sources.md)**: Vapor pressure data, activity parameters
