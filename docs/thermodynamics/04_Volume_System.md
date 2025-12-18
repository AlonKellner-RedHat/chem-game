# Volume System

## Overview

This document defines the volume calculation system, which determines the actual volume occupied by a mixture. Unlike moles (which are conserved), volume is NOT conserved on mixing due to molecular packing effects.

---

## 1. First Principles

### 1.1 Molecular Packing

When molecules of different sizes and polarities mix:
- **Smaller molecules** can fit into spaces between larger ones
- **Hydrogen bonding** can pull molecules closer together
- **Repulsive interactions** can push molecules apart

These effects cause the real volume to differ from the sum of pure component volumes.

### 1.2 The Non-Conservation of Volume

**Key Insight**: Mixing 50 mL water with 50 mL ethanol yields ~96 mL, not 100 mL.

This ~4% volume contraction occurs because:
1. Ethanol molecules fit into the hydrogen-bonded water network
2. The mixture is more tightly packed than either pure component

### 1.3 Excess Volume

**Definition**: The difference between real and ideal volumes.

```
V^E = V_real - V_ideal
```

where:
- V^E = excess volume (can be positive or negative)
- V_real = actual measured volume
- V_ideal = Σ(n_i × V_i*) = sum of pure component volumes

**Sign Convention**:
- V^E < 0: Volume contraction (molecules pack tighter)
- V^E > 0: Volume expansion (molecules pack looser)

---

## 2. Ideal Mixing (Stage 1)

### 2.1 Ideal Volume Formula

For ideal mixing, volume is the sum of pure component contributions:

```
V_ideal = Σ(n_i × V_i*)
```

where:
- n_i = moles of component i
- V_i* = molar volume of pure component i (L/mol)

### 2.2 When Ideal Applies

Ideal mixing is a good approximation when:
- Molecules are similar in size and polarity
- Interactions between like molecules ≈ interactions between unlike molecules
- Dilute solutions (one component dominates)

**Examples of near-ideal systems**:
- Benzene + toluene
- Hexane + heptane
- Dilute aqueous solutions

### 2.3 Implementation

```typescript
interface IdealVolumeInput {
  readonly composition: Composition;
  readonly temperature: number;  // K
}

interface VolumeResult {
  /** Total volume in liters */
  readonly totalVolume: number;
  /** Ideal volume (sum of pure components) in liters */
  readonly idealVolume: number;
  /** Excess volume in liters (can be negative) */
  readonly excessVolume: number;
  /** Volume per component in liters */
  readonly componentVolumes: Map<SubstanceId, number>;
}

/**
 * Calculate ideal volume (no excess).
 */
function calculateIdealVolume(
  input: IdealVolumeInput,
  registry: SubstanceRegistry
): VolumeResult {
  let idealVolume = 0;
  const componentVolumes = new Map<SubstanceId, number>();

  for (const [id, moles] of input.composition.moles) {
    const substance = registry.getRequired(id);
    const volume = moles * substance.molarVolumeLiquid;
    componentVolumes.set(id, volume);
    idealVolume += volume;
  }

  return {
    totalVolume: idealVolume,
    idealVolume,
    excessVolume: 0,
    componentVolumes,
  };
}
```

---

## 3. Excess Volume Theory (Stage 1)

### 3.1 Physical Origin

Excess volume arises from changes in molecular interactions upon mixing:

| Effect | Causes V^E | Example |
|--------|------------|---------|
| **Hydrogen bond disruption** | Expansion (+) | Water + acetone |
| **Hydrogen bond formation** | Contraction (-) | Water + ethanol |
| **Molecular size difference** | Contraction (-) | Large + small molecules |
| **Dispersion forces change** | Either | Various |

### 3.2 Thermodynamic Relationship

Excess volume is related to the pressure derivative of excess Gibbs energy:

```
V^E = (∂G^E/∂P)_T,x
```

This connects volume non-ideality to other thermodynamic non-idealities.

### 3.3 General Properties

For a binary mixture:
- V^E = 0 at x₁ = 0 and x₁ = 1 (pure components)
- V^E has a maximum or minimum at some intermediate composition
- V^E depends on temperature

---

## 4. Mixing Models (OCP)

### 4.1 Excess Volume Model Interface

```typescript
/**
 * Interface for excess volume models.
 * Follows OCP: new models can be registered without modifying existing code.
 */
interface ExcessVolumeModel {
  /** Unique identifier */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Substance pairs this model applies to */
  readonly applicablePairs: ReadonlyArray<[SubstanceId, SubstanceId]>;

  /**
   * Calculate molar excess volume.
   *
   * @param x1 - Mole fraction of first component
   * @param x2 - Mole fraction of second component
   * @param T - Temperature in Kelvin
   * @returns Molar excess volume in L/mol
   */
  calculate(x1: number, x2: number, T: number): number;
}
```

### 4.2 Model Registry

```typescript
/**
 * Registry for excess volume models.
 */
class ExcessVolumeRegistry {
  private models: Map<string, ExcessVolumeModel> = new Map();

  register(model: ExcessVolumeModel): void {
    this.models.set(model.id, model);
  }

  /**
   * Find a model for a given pair of substances.
   */
  findForPair(id1: SubstanceId, id2: SubstanceId): ExcessVolumeModel | undefined {
    for (const model of this.models.values()) {
      for (const [a, b] of model.applicablePairs) {
        if ((a === id1 && b === id2) || (a === id2 && b === id1)) {
          return model;
        }
      }
    }
    return undefined;
  }
}
```

---

## 5. Redlich-Kister Model

### 5.1 Derivation

The Redlich-Kister equation is an empirical polynomial expansion for excess properties:

**General form**:
```
V^E / (x₁ × x₂) = Σ_k A_k × (x₁ - x₂)^k
```

For the first few terms:
```
V^E = x₁ × x₂ × [A₀ + A₁(x₁-x₂) + A₂(x₁-x₂)² + ...]
```

**Properties**:
- Ensures V^E = 0 at x₁ = 0 and x₁ = 1
- Symmetric form allows fitting with few parameters
- A₀ alone gives symmetric curve
- A₁ introduces asymmetry

**Reference**: Redlich, O.; Kister, A.T. (1948). "Algebraic Representation of Thermodynamic Properties and the Classification of Solutions". Ind. Eng. Chem. 40(2): 345-348.

### 5.2 Temperature Dependence

Parameters can be temperature-dependent:
```
A_k(T) = a_k + b_k × T + c_k × T²
```

For simplicity, we often use constant parameters valid over a temperature range.

### 5.3 Water-Ethanol System

**Experimental Data** (at 25°C):

| x_ethanol | V^E (mL/mol) |
|-----------|--------------|
| 0.0 | 0 |
| 0.1 | -0.35 |
| 0.2 | -0.65 |
| 0.3 | -0.88 |
| 0.4 | -1.00 |
| 0.5 | -1.02 |
| 0.6 | -0.94 |
| 0.7 | -0.78 |
| 0.8 | -0.55 |
| 0.9 | -0.28 |
| 1.0 | 0 |

**Maximum contraction**: ~1.02 mL/mol at x_ethanol ≈ 0.5

**Reference**: Benson, G.C.; Kiyohara, O. (1979). "Thermodynamics of Aqueous Mixtures of Nonelectrolytes". J. Solution Chem. 8: 791.

### 5.4 Fitted Parameters

For water(1) - ethanol(2) at 25°C:
```
A₀ = -4.231 mL/mol  (or -4.231×10⁻³ L/mol)
A₁ = -0.382 mL/mol
A₂ = +0.529 mL/mol
```

### 5.5 Implementation

```typescript
/**
 * Redlich-Kister model for excess volume.
 */
class RedlichKisterVolumeModel implements ExcessVolumeModel {
  readonly id: string;
  readonly name: string;
  readonly applicablePairs: ReadonlyArray<[SubstanceId, SubstanceId]>;

  private readonly coefficients: number[];  // A₀, A₁, A₂, ...
  private readonly refTemperature: number;  // K

  constructor(
    id: string,
    name: string,
    pair: [SubstanceId, SubstanceId],
    coefficients: number[],  // L/mol
    refTemperature: number = 298.15
  ) {
    this.id = id;
    this.name = name;
    this.applicablePairs = [pair];
    this.coefficients = coefficients;
    this.refTemperature = refTemperature;
  }

  /**
   * Calculate molar excess volume.
   * V^E = x₁ × x₂ × Σ_k A_k × (x₁ - x₂)^k
   */
  calculate(x1: number, x2: number, T: number): number {
    if (x1 <= 0 || x2 <= 0) {
      return 0;  // Pure component
    }

    const dx = x1 - x2;
    let sum = 0;
    let dxPower = 1;

    for (const A of this.coefficients) {
      sum += A * dxPower;
      dxPower *= dx;
    }

    return x1 * x2 * sum;
  }
}

// Water-Ethanol model instance
const WATER_ETHANOL_VOLUME = new RedlichKisterVolumeModel(
  'rk-volume-water-ethanol',
  'Water-Ethanol Excess Volume (Redlich-Kister)',
  ['H2O', 'C2H5OH'],
  [-4.231e-3, -0.382e-3, 0.529e-3],  // L/mol
  298.15
);
```

---

## 6. Partial Molar Volume

### 6.1 Definition

**Partial molar volume** is the change in total volume when adding one mole of component i at constant T, P, and other n_j:

```
V̄_i = (∂V/∂n_i)_{T,P,n_j}
```

### 6.2 Relationship to Excess Volume

For component 1 in a binary mixture:
```
V̄₁ = V₁* + V^E + x₂ × (∂V^E/∂x₁)
```

where V₁* is the molar volume of pure component 1.

### 6.3 Physical Meaning

- V̄_i ≠ V_i* in non-ideal mixtures
- Adding 1 mol of ethanol to dilute aqueous solution increases volume by less than the molar volume of pure ethanol
- The partial molar volume depends on composition

### 6.4 Gibbs-Duhem Relationship

Partial molar volumes satisfy:
```
Σ x_i × dV̄_i = 0  (at constant T, P)
```

This ensures consistency between components.

### 6.5 Implementation

```typescript
/**
 * Calculate partial molar volumes in a binary mixture.
 *
 * Uses the relationship:
 * V̄₁ = V₁* + V^E + x₂ × (dV^E/dx₁)
 */
function calculatePartialMolarVolumes(
  x1: number,
  x2: number,
  T: number,
  V1_pure: number,
  V2_pure: number,
  excessModel: ExcessVolumeModel
): { V1_partial: number; V2_partial: number } {
  const VE = excessModel.calculate(x1, x2, T);

  // Numerical derivative dV^E/dx₁
  const dx = 0.0001;
  const VE_plus = excessModel.calculate(x1 + dx, x2 - dx, T);
  const VE_minus = excessModel.calculate(x1 - dx, x2 + dx, T);
  const dVE_dx1 = (VE_plus - VE_minus) / (2 * dx);

  const V1_partial = V1_pure + VE + x2 * dVE_dx1;
  const V2_partial = V2_pure + VE - x1 * dVE_dx1;

  return { V1_partial, V2_partial };
}
```

---

## 7. Complete Volume Calculation

### 7.1 Algorithm

```typescript
/**
 * Calculate real volume with non-ideal mixing effects.
 */
function calculateVolume(
  input: VolumeInput,
  registry: SubstanceRegistry,
  excessRegistry: ExcessVolumeRegistry
): VolumeResult {
  const { composition, temperature } = input;

  // Step 1: Calculate ideal volume
  let idealVolume = 0;
  const componentVolumes = new Map<SubstanceId, number>();

  for (const [id, moles] of composition.moles) {
    const substance = registry.getRequired(id);
    const volume = moles * substance.molarVolumeLiquid;
    componentVolumes.set(id, volume);
    idealVolume += volume;
  }

  // Step 2: Calculate excess volume for each pair
  const substances = Array.from(composition.moles.keys());
  const moleFractions = getMoleFractions(composition);
  const totalMoles = getTotalMoles(composition);

  let totalExcessVolume = 0;

  for (let i = 0; i < substances.length; i++) {
    for (let j = i + 1; j < substances.length; j++) {
      const id1 = substances[i];
      const id2 = substances[j];

      const model = excessRegistry.findForPair(id1, id2);
      if (model) {
        const x1 = moleFractions.get(id1) ?? 0;
        const x2 = moleFractions.get(id2) ?? 0;

        // Molar excess volume
        const VE_molar = model.calculate(x1, x2, temperature);

        // Total excess volume = n_total × V^E_molar
        totalExcessVolume += totalMoles * VE_molar;
      }
    }
  }

  // Step 3: Calculate real volume
  const totalVolume = idealVolume + totalExcessVolume;

  return {
    totalVolume,
    idealVolume,
    excessVolume: totalExcessVolume,
    componentVolumes,
  };
}
```

### 7.2 Multi-Component Mixtures

For systems with more than two components, excess volume is approximated as a sum of binary contributions:

```
V^E_total ≈ Σ_{i<j} V^E_ij(x_i, x_j)
```

This is a common approximation that works well when ternary interactions are weak.

---

## 8. TDD Validation Data

### 8.1 Water-Ethanol Test Cases

```typescript
describe('WaterEthanolVolume', () => {
  // Reference: Benson & Kiyohara (1979)
  const TEST_DATA = [
    { xEthanol: 0.0, VE_mL_mol: 0 },
    { xEthanol: 0.1, VE_mL_mol: -0.35 },
    { xEthanol: 0.2, VE_mL_mol: -0.65 },
    { xEthanol: 0.3, VE_mL_mol: -0.88 },
    { xEthanol: 0.4, VE_mL_mol: -1.00 },
    { xEthanol: 0.5, VE_mL_mol: -1.02 },
    { xEthanol: 0.6, VE_mL_mol: -0.94 },
    { xEthanol: 0.7, VE_mL_mol: -0.78 },
    { xEthanol: 0.8, VE_mL_mol: -0.55 },
    { xEthanol: 0.9, VE_mL_mol: -0.28 },
    { xEthanol: 1.0, VE_mL_mol: 0 },
  ];

  it.each(TEST_DATA)(
    'should give V^E ≈ $VE_mL_mol mL/mol at x_ethanol = $xEthanol',
    ({ xEthanol, VE_mL_mol }) => {
      const result = WATER_ETHANOL_VOLUME.calculate(
        1 - xEthanol,  // x_water
        xEthanol,
        298.15
      );

      // Convert L/mol to mL/mol for comparison
      const VE_result_mL = result * 1000;

      expect(VE_result_mL).toBeCloseTo(VE_mL_mol, 1);  // ±0.1 mL/mol
    }
  );
});
```

### 8.2 Volume Calculation Test

```typescript
describe('calculateVolume', () => {
  it('should give correct total volume for 50mL water + 50mL ethanol', () => {
    // 50 mL water ≈ 2.77 mol (18.07 mL/mol)
    // 50 mL ethanol ≈ 0.856 mol (58.39 mL/mol)
    const composition = createComposition({
      'H2O': 2.77,
      'C2H5OH': 0.856,
    });

    const result = calculateVolume(
      { composition, temperature: 298.15 },
      substanceRegistry,
      excessVolumeRegistry
    );

    // Ideal: 50 + 50 = 100 mL
    expect(result.idealVolume * 1000).toBeCloseTo(100, 0);

    // Real: ~96 mL (4% contraction)
    expect(result.totalVolume * 1000).toBeCloseTo(96, 1);

    // Excess: ~-4 mL
    expect(result.excessVolume * 1000).toBeCloseTo(-4, 0);
  });

  it('should give zero excess for pure components', () => {
    const pureWater = createComposition({ 'H2O': 1.0 });

    const result = calculateVolume(
      { composition: pureWater, temperature: 298.15 },
      substanceRegistry,
      excessVolumeRegistry
    );

    expect(result.excessVolume).toBe(0);
    expect(result.totalVolume).toBe(result.idealVolume);
  });
});
```

### 8.3 Accuracy Requirements

| Calculation | Tolerance | Notes |
|-------------|-----------|-------|
| Ideal volume | Exact | Sum of pure volumes |
| Excess volume | ±10% | Model uncertainty |
| Total volume | ±1% | Combined error |

---

## 9. Interaction Points

- **[02_Substance_Model.md](02_Substance_Model.md)**: Provides molar volumes
- **[03_Composition_System.md](03_Composition_System.md)**: Input composition
- **[06_Gravity_Hydrostatics.md](06_Gravity_Hydrostatics.md)**: Volume → density → hydrostatic pressure
- **[17_Container_Model.md](17_Container_Model.md)**: Volume → fill level
- **[22_Data_Sources.md](22_Data_Sources.md)**: Redlich-Kister parameters
