# Heat of Mixing

## Overview

This document defines the heat of mixing system, which calculates the temperature change that would result from mixing two compositions. This is an instantaneous property calculation—it determines what temperature the mixture would reach, not how fast it gets there.

---

## 1. First Principles

### 1.1 Enthalpy of Mixing

When substances mix, the total enthalpy changes due to:
- Breaking of like-molecule interactions (A-A, B-B)
- Formation of unlike-molecule interactions (A-B)

**Net enthalpy change**:
```
ΔH_mix = H_mixture - Σ H_pure_i
```

If ΔH_mix < 0: **Exothermic** mixing (releases heat, temperature rises)
If ΔH_mix > 0: **Endothermic** mixing (absorbs heat, temperature drops)

### 1.2 Excess Enthalpy

Similar to excess volume, we define:
```
H^E = H_mix_real - H_mix_ideal
```

For ideal solutions, H^E = 0 (no heat of mixing).
For real solutions, H^E = ΔH_mix.

### 1.3 Water-Ethanol Example

Mixing water and ethanol is **exothermic**:
- Breaking H-bonds in pure water requires energy
- Breaking H-bonds in pure ethanol requires energy
- Forming water-ethanol H-bonds releases more energy than was required

**Net result**: Heat is released, mixture warms up (~6°C for 50:50 mix).

---

## 2. Excess Enthalpy (Stage 3)

### 2.1 Relationship to Activity Coefficients

From thermodynamics:
```
H^E = -R × T² × Σ x_i × (∂ ln γ_i / ∂T)_P,x
```

This connects enthalpy non-ideality to activity coefficient temperature dependence.

### 2.2 Empirical Models

Like excess volume, excess enthalpy can be modeled with Redlich-Kister:
```
H^E = x₁ × x₂ × Σ_k B_k × (x₁ - x₂)^k
```

where B_k are enthalpy parameters (in J/mol).

### 2.3 Water-Ethanol Excess Enthalpy

**Experimental data at 25°C**:

| x_ethanol | H^E (J/mol) |
|-----------|-------------|
| 0.0 | 0 |
| 0.1 | -280 |
| 0.2 | -510 |
| 0.3 | -680 |
| 0.4 | -780 |
| 0.5 | -800 |
| 0.6 | -730 |
| 0.7 | -590 |
| 0.8 | -400 |
| 0.9 | -190 |
| 1.0 | 0 |

**Maximum heat release**: ~800 J/mol at x_ethanol ≈ 0.5

**Reference**: Larkin, J.A. (1975). "Thermodynamic Properties of Aqueous Non-electrolyte Mixtures". J. Chem. Thermodyn. 7: 137.

### 2.4 Redlich-Kister Parameters for Water-Ethanol

```
H^E = x₁ × x₂ × [B₀ + B₁(x₁-x₂) + B₂(x₁-x₂)²]
```

Fitted parameters at 25°C:
- B₀ = -3200 J/mol
- B₁ = +400 J/mol
- B₂ = +200 J/mol

---

## 3. Temperature Change on Mixing

### 3.1 Adiabatic Mixing

For adiabatic mixing (no heat exchange with surroundings):
```
Q = 0 = n × Cp × ΔT + ΔH_mix
```

Therefore:
```
ΔT = -ΔH_mix / (n × Cp) = -H^E / Cp_mix
```

**Sign convention**:
- H^E < 0 (exothermic) → ΔT > 0 (temperature rises)
- H^E > 0 (endothermic) → ΔT < 0 (temperature drops)

### 3.2 Implementation

```typescript
interface ExcessEnthalpyModel {
  readonly id: string;
  readonly name: string;
  readonly applicablePairs: ReadonlyArray<[SubstanceId, SubstanceId]>;

  /**
   * Calculate molar excess enthalpy.
   *
   * @param x1 - Mole fraction of first component
   * @param x2 - Mole fraction of second component
   * @param T - Temperature in Kelvin
   * @returns Excess enthalpy in J/mol
   */
  calculate(x1: number, x2: number, T: number): number;
}

/**
 * Redlich-Kister model for excess enthalpy.
 */
class RedlichKisterEnthalpyModel implements ExcessEnthalpyModel {
  readonly id: string;
  readonly name: string;
  readonly applicablePairs: ReadonlyArray<[SubstanceId, SubstanceId]>;

  private readonly coefficients: number[];  // B₀, B₁, B₂, ... in J/mol

  constructor(
    id: string,
    name: string,
    pair: [SubstanceId, SubstanceId],
    coefficients: number[]
  ) {
    this.id = id;
    this.name = name;
    this.applicablePairs = [pair];
    this.coefficients = coefficients;
  }

  calculate(x1: number, x2: number, T: number): number {
    if (x1 <= 0 || x2 <= 0) {
      return 0;  // Pure component
    }

    const dx = x1 - x2;
    let sum = 0;
    let dxPower = 1;

    for (const B of this.coefficients) {
      sum += B * dxPower;
      dxPower *= dx;
    }

    return x1 * x2 * sum;
  }
}

// Water-Ethanol model instance
const WATER_ETHANOL_ENTHALPY = new RedlichKisterEnthalpyModel(
  'rk-enthalpy-water-ethanol',
  'Water-Ethanol Excess Enthalpy (Redlich-Kister)',
  ['H2O', 'C2H5OH'],
  [-3200, 400, 200]  // J/mol
);
```

---

## 4. Mixing Temperature Calculation

### 4.1 Algorithm

```typescript
interface MixingInput {
  /** Composition before mixing (or combined composition) */
  readonly composition: Composition;
  /** Initial temperature in K */
  readonly initialTemperature: number;
}

interface MixingResult {
  /** Final temperature after adiabatic mixing in K */
  readonly finalTemperature: number;
  /** Temperature change in K */
  readonly deltaT: number;
  /** Total excess enthalpy in J */
  readonly excessEnthalpy: number;
  /** Molar excess enthalpy in J/mol */
  readonly molarExcessEnthalpy: number;
  /** Whether mixing is exothermic */
  readonly isExothermic: boolean;
}

/**
 * Calculate final temperature after adiabatic mixing.
 *
 * @param input - Mixing input
 * @param registry - Substance registry
 * @param enthalpyRegistry - Excess enthalpy model registry
 * @returns Mixing result with final temperature
 */
function calculateMixingTemperature(
  input: MixingInput,
  registry: SubstanceRegistry,
  enthalpyRegistry: ExcessEnthalpyRegistry
): MixingResult {
  const { composition, initialTemperature } = input;
  const totalMoles = getTotalMoles(composition);
  const fractions = getMoleFractions(composition);
  const substances = Array.from(composition.moles.keys());

  // Calculate total excess enthalpy
  let totalMolarHE = 0;

  for (let i = 0; i < substances.length; i++) {
    for (let j = i + 1; j < substances.length; j++) {
      const id1 = substances[i];
      const id2 = substances[j];

      const model = enthalpyRegistry.findForPair(id1, id2);
      if (model) {
        const x1 = fractions.get(id1) ?? 0;
        const x2 = fractions.get(id2) ?? 0;

        totalMolarHE += model.calculate(x1, x2, initialTemperature);
      }
    }
  }

  const totalExcessEnthalpy = totalMoles * totalMolarHE;

  // Calculate heat capacity of mixture
  const cpResult = calculateHeatCapacity(
    { composition, temperature: initialTemperature },
    registry
  );

  // Calculate temperature change: ΔT = -H^E / Cp
  const deltaT = -totalMolarHE / cpResult.molarCp;
  const finalTemperature = initialTemperature + deltaT;

  return {
    finalTemperature,
    deltaT,
    excessEnthalpy: totalExcessEnthalpy,
    molarExcessEnthalpy: totalMolarHE,
    isExothermic: totalMolarHE < 0,
  };
}
```

### 4.2 Mixing Two Separate Compositions

When mixing two solutions at different temperatures:

```typescript
interface TwoStreamMixingInput {
  /** First composition */
  readonly composition1: Composition;
  /** Temperature of first stream in K */
  readonly temperature1: number;
  /** Second composition */
  readonly composition2: Composition;
  /** Temperature of second stream in K */
  readonly temperature2: number;
}

/**
 * Calculate final temperature when mixing two streams.
 * Accounts for both:
 * 1. Temperature averaging (sensible heat)
 * 2. Excess enthalpy (heat of mixing)
 */
function calculateTwoStreamMixing(
  input: TwoStreamMixingInput,
  registry: SubstanceRegistry,
  enthalpyRegistry: ExcessEnthalpyRegistry
): MixingResult {
  const { composition1, temperature1, composition2, temperature2 } = input;

  // Step 1: Calculate heat capacity-weighted average temperature
  const n1 = getTotalMoles(composition1);
  const n2 = getTotalMoles(composition2);

  const cp1 = calculateHeatCapacity({ composition: composition1, temperature: temperature1 }, registry);
  const cp2 = calculateHeatCapacity({ composition: composition2, temperature: temperature2 }, registry);

  const Q1 = n1 * cp1.molarCp;  // Heat capacity of stream 1
  const Q2 = n2 * cp2.molarCp;  // Heat capacity of stream 2

  // Mixing temperature (before accounting for excess enthalpy)
  const T_mixed = (Q1 * temperature1 + Q2 * temperature2) / (Q1 + Q2);

  // Step 2: Combine compositions
  const combinedComposition = combineCompositions(composition1, composition2);

  // Step 3: Calculate excess enthalpy contribution
  const mixingResult = calculateMixingTemperature(
    { composition: combinedComposition, initialTemperature: T_mixed },
    registry,
    enthalpyRegistry
  );

  return mixingResult;
}
```

---

## 5. Example Calculations

### 5.1 Water-Ethanol 50:50 Mix

**Given**:
- 1 mol water at 25°C
- 1 mol ethanol at 25°C

**Calculate**:
1. Mole fractions: x_water = x_ethanol = 0.5
2. Excess enthalpy at x = 0.5:
   ```
   H^E = 0.5 × 0.5 × [-3200 + 400×0 + 200×0]
       = 0.25 × (-3200)
       = -800 J/mol
   ```
3. Mixture Cp:
   ```
   Cp_mix = 0.5 × 75.4 + 0.5 × 112.3 = 93.9 J/(mol·K)
   ```
4. Temperature rise:
   ```
   ΔT = -(-800) / 93.9 = +8.5 K
   ```

**Result**: Mixture reaches ~33.5°C (rises by ~8.5°C)

Note: This is simplified; real ΔT is ~6°C due to Cp variation and model limitations.

### 5.2 Dilute Solution

**Given**:
- 0.1 mol ethanol in 0.9 mol water (x_ethanol = 0.1)

**Calculate**:
1. Excess enthalpy at x = 0.1:
   ```
   H^E = 0.9 × 0.1 × [-3200 + 400×0.8 + 200×0.64]
       = 0.09 × (-2560)
       = -230 J/mol
   ```
2. Temperature rise:
   ```
   ΔT ≈ -(-230) / 79 ≈ +2.9 K
   ```

---

## 6. Temperature Dependence

### 6.1 H^E Temperature Dependence

Excess enthalpy varies with temperature:
```
(∂H^E/∂T)_P,x = Cp^E
```

For most systems, this variation is small over typical temperature ranges (20-80°C).

### 6.2 Practical Approach

Use temperature-independent parameters for Stage 3:
- Parameters fitted at 25°C
- Apply to nearby temperatures (15-35°C) with small error
- For wider ranges, use temperature-dependent parameters (future extension)

---

## 7. Multi-Component Systems

### 7.1 Pairwise Approximation

For systems with 3+ components:
```
H^E_total ≈ Σ_{i<j} H^E_ij(x_i, x_j)
```

This assumes ternary interactions are negligible.

### 7.2 Limitation

The pairwise approximation can fail for some systems. For accurate multi-component calculations, more sophisticated models (NRTL, UNIQUAC) are needed.

---

## 8. TDD Validation Data

### 8.1 Excess Enthalpy Tests

```typescript
describe('ExcessEnthalpy - Water-Ethanol', () => {
  const TEST_DATA = [
    { xEthanol: 0.0, HE: 0 },
    { xEthanol: 0.1, HE: -280 },
    { xEthanol: 0.2, HE: -510 },
    { xEthanol: 0.3, HE: -680 },
    { xEthanol: 0.4, HE: -780 },
    { xEthanol: 0.5, HE: -800 },
    { xEthanol: 0.6, HE: -730 },
    { xEthanol: 0.7, HE: -590 },
    { xEthanol: 0.8, HE: -400 },
    { xEthanol: 0.9, HE: -190 },
    { xEthanol: 1.0, HE: 0 },
  ];

  it.each(TEST_DATA)(
    'should give H^E ≈ $HE J/mol at x_ethanol = $xEthanol',
    ({ xEthanol, HE }) => {
      const result = WATER_ETHANOL_ENTHALPY.calculate(
        1 - xEthanol,  // x_water
        xEthanol,
        298.15
      );

      expect(result).toBeCloseTo(HE, -1);  // ±50 J/mol tolerance
    }
  );
});
```

### 8.2 Mixing Temperature Tests

```typescript
describe('MixingTemperature', () => {
  it('should predict temperature rise for water-ethanol mixing', () => {
    const comp = createComposition({ 'H2O': 1.0, 'C2H5OH': 1.0 });
    const result = calculateMixingTemperature(
      { composition: comp, initialTemperature: 298.15 },
      registry,
      enthalpyRegistry
    );

    // Should rise by approximately 5-10 K
    expect(result.deltaT).toBeGreaterThan(5);
    expect(result.deltaT).toBeLessThan(10);
    expect(result.isExothermic).toBe(true);
  });

  it('should give zero temperature change for pure component', () => {
    const comp = pureComposition('H2O', 1.0);
    const result = calculateMixingTemperature(
      { composition: comp, initialTemperature: 298.15 },
      registry,
      enthalpyRegistry
    );

    expect(result.deltaT).toBeCloseTo(0, 5);
  });

  it('should give zero temperature change for ideal mixture', () => {
    // Assuming no excess enthalpy model registered for this pair
    const comp = createComposition({ 'N2': 1.0, 'O2': 1.0 });
    const result = calculateMixingTemperature(
      { composition: comp, initialTemperature: 298.15 },
      registry,
      enthalpyRegistry
    );

    expect(result.deltaT).toBeCloseTo(0, 5);
  });
});
```

---

## 9. Interaction Points

- **[05_Pressure_System.md](05_Pressure_System.md)**: Activity coefficients relate to H^E
- **[07_Heat_Capacity.md](07_Heat_Capacity.md)**: Cp needed for ΔT calculation
- **[17_Container_Model.md](17_Container_Model.md)**: Reports final temperature after mixing
- **[22_Data_Sources.md](22_Data_Sources.md)**: Excess enthalpy data sources
