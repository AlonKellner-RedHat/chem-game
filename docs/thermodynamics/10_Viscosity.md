# Viscosity

## Overview

This document defines the viscosity system, which determines a fluid's resistance to flow. Viscosity affects pouring behavior, mixing rates, and flow through apparatus. This is an instantaneous property—it describes the current resistance, not accumulated flow.

---

## 1. First Principles

### 1.1 Molecular Origin

Viscosity arises from momentum transfer between fluid layers:

1. When a fluid flows, adjacent layers move at different velocities
2. Molecules in faster layers collide with molecules in slower layers
3. Momentum transfers from fast to slow layers
4. This creates internal friction (shear stress)

### 1.2 Newton's Law of Viscosity

For Newtonian fluids:
```
τ = η × (dv/dy)
```

where:
- τ = shear stress (Pa = N/m²)
- η = dynamic viscosity (Pa·s)
- dv/dy = velocity gradient (1/s)

**Reference**: Newton, I. (1687). "Principia Mathematica"

### 1.3 Units

| Unit | Symbol | Conversion |
|------|--------|------------|
| Pascal-second | Pa·s | SI unit |
| Poise | P | 0.1 Pa·s |
| Centipoise | cP | 0.001 Pa·s = 1 mPa·s |

**Typical values at 25°C**:
| Substance | η (mPa·s = cP) |
|-----------|----------------|
| Water | 0.890 |
| Ethanol | 1.074 |
| Glycerol | 934 |
| Honey | 2,000-10,000 |
| Air | 0.0185 |

---

## 2. Pure Component Viscosity (Stage 4)

### 2.1 Temperature Dependence

Liquid viscosity **decreases** strongly with temperature (unlike gases).

**Andrade Equation**:
```
η = A × exp(B / T)
```

Or in logarithmic form:
```
ln(η) = ln(A) + B / T
```

where:
- A = pre-exponential factor (Pa·s)
- B = activation energy parameter (K)
- T = temperature (K)

**Physical interpretation**: Molecules need thermal energy to overcome intermolecular forces and flow.

**Reference**: Andrade, E.N.C. (1930). Nature 125: 309-310.

### 2.2 Data Structure

```typescript
interface ViscosityData {
  /** Dynamic viscosity at reference temperature in Pa·s */
  readonly viscosity: number;

  /** Reference temperature in K */
  readonly viscosityRefTemp: number;

  /** Andrade equation coefficients (optional) */
  readonly andrade?: {
    A: number;  // Pre-exponential (Pa·s)
    B: number;  // Activation parameter (K)
  };
}
```

### 2.3 Reference Values (at 25°C)

| Substance | η (mPa·s) | Andrade A (Pa·s) | Andrade B (K) |
|-----------|-----------|------------------|---------------|
| Water | 0.890 | 2.414×10⁻⁵ | 570 |
| Ethanol | 1.074 | 5.15×10⁻⁵ | 525 |
| Methanol | 0.544 | 2.89×10⁻⁵ | 510 |
| Glycerol | 934 | 9.54×10⁻⁶ | 3500 |

### 2.4 Implementation

```typescript
/**
 * Calculate viscosity with temperature dependence.
 */
function calculatePureViscosity(
  substance: Substance,
  temperature: number
): number {
  if (substance.andrade) {
    // Use Andrade equation
    const { A, B } = substance.andrade;
    return A * Math.exp(B / temperature);
  } else {
    // Use reference value (no T correction)
    return substance.viscosity;
  }
}
```

---

## 3. Mixture Viscosity

### 3.1 The Challenge

Mixture viscosity is highly non-linear. For water-ethanol:
- Pure water: 0.89 cP
- Pure ethanol: 1.07 cP
- 40% ethanol: 2.9 cP (almost 3× either pure component!)

This **maximum** in viscosity occurs because water-ethanol hydrogen bonding creates transient clusters that resist flow.

### 3.2 Simple Mixing Rules

**Linear** (rarely accurate):
```
η_mix = Σ x_i × η_i
```

**Arrhenius** (better):
```
ln(η_mix) = Σ x_i × ln(η_i)
```

### 3.3 Grunberg-Nissan Equation

Accounts for non-ideal mixing:
```
ln(η_mix) = Σ x_i × ln(η_i) + Σ Σ x_i × x_j × G_ij
```

where G_ij is an interaction parameter (can be positive or negative).

For symmetric systems (G₁₂ = G₂₁ = G):
```
ln(η_mix) = x₁ ln(η₁) + x₂ ln(η₂) + x₁ × x₂ × G
```

**Reference**: Grunberg, L.; Nissan, A.H. (1949). Nature 164: 799.

### 3.4 Water-Ethanol System

Fitted parameter at 25°C: G ≈ +2.2

```
ln(η) = x_w ln(0.89) + x_e ln(1.07) + x_w × x_e × 2.2
```

At x_e = 0.4:
```
ln(η) = 0.6 × (-0.117) + 0.4 × (0.068) + 0.6 × 0.4 × 2.2
      = -0.070 + 0.027 + 0.528
      = 0.485
η = exp(0.485) = 1.62 cP  (simplified; actual ~2.9 cP)
```

The actual maximum requires more sophisticated models (excess viscosity term).

### 3.5 Implementation

```typescript
interface ViscosityMixingRule {
  readonly id: string;
  readonly name: string;

  /**
   * Calculate mixture viscosity.
   *
   * @param pureViscosities - Viscosity of each pure component (Pa·s)
   * @param moleFractions - Mole fractions
   * @param temperature - Temperature in K
   * @returns Mixture viscosity in Pa·s
   */
  calculate(
    pureViscosities: Map<SubstanceId, number>,
    moleFractions: Map<SubstanceId, number>,
    temperature: number
  ): number;
}

/**
 * Arrhenius mixing rule (no interaction parameter).
 */
class ArrheniusMixingRule implements ViscosityMixingRule {
  readonly id = 'arrhenius';
  readonly name = 'Arrhenius Mixing Rule';

  calculate(
    pureViscosities: Map<SubstanceId, number>,
    moleFractions: Map<SubstanceId, number>,
    temperature: number
  ): number {
    let lnEta = 0;

    for (const [id, x] of moleFractions) {
      const eta = pureViscosities.get(id) ?? 0;
      if (eta > 0) {
        lnEta += x * Math.log(eta);
      }
    }

    return Math.exp(lnEta);
  }
}

/**
 * Grunberg-Nissan mixing rule with interaction parameter.
 */
class GrunbergNissanMixingRule implements ViscosityMixingRule {
  readonly id = 'grunberg-nissan';
  readonly name = 'Grunberg-Nissan Mixing Rule';

  private readonly interactionParams: Map<string, number> = new Map();

  /**
   * Add interaction parameter for a pair.
   */
  addInteraction(id1: SubstanceId, id2: SubstanceId, G: number): void {
    const key = [id1, id2].sort().join('-');
    this.interactionParams.set(key, G);
  }

  calculate(
    pureViscosities: Map<SubstanceId, number>,
    moleFractions: Map<SubstanceId, number>,
    temperature: number
  ): number {
    const substances = Array.from(moleFractions.keys());

    // Arrhenius contribution
    let lnEta = 0;
    for (const [id, x] of moleFractions) {
      const eta = pureViscosities.get(id) ?? 0;
      if (eta > 0 && x > 0) {
        lnEta += x * Math.log(eta);
      }
    }

    // Interaction contribution
    for (let i = 0; i < substances.length; i++) {
      for (let j = i + 1; j < substances.length; j++) {
        const id1 = substances[i];
        const id2 = substances[j];
        const x1 = moleFractions.get(id1) ?? 0;
        const x2 = moleFractions.get(id2) ?? 0;

        const key = [id1, id2].sort().join('-');
        const G = this.interactionParams.get(key) ?? 0;

        lnEta += x1 * x2 * G;
      }
    }

    return Math.exp(lnEta);
  }
}
```

---

## 4. Excess Viscosity

### 4.1 Definition

```
ln(η_mix) = Σ x_i ln(η_i) + ln(η^E)
```

or equivalently:
```
η^E = η_mix / η_ideal
```

where η_ideal is the Arrhenius prediction.

### 4.2 Redlich-Kister for Viscosity

```
ln(η^E) = x₁ × x₂ × Σ_k D_k × (x₁ - x₂)^k
```

### 4.3 Water-Ethanol Excess Viscosity

| x_ethanol | η_mix (cP) | η_ideal (cP) | η^E |
|-----------|------------|--------------|-----|
| 0.0 | 0.89 | 0.89 | 1.00 |
| 0.2 | 1.60 | 0.92 | 1.74 |
| 0.4 | 2.91 | 0.96 | 3.03 |
| 0.5 | 2.84 | 0.97 | 2.93 |
| 0.6 | 2.47 | 0.99 | 2.49 |
| 0.8 | 1.55 | 1.02 | 1.52 |
| 1.0 | 1.07 | 1.07 | 1.00 |

The maximum occurs around 40% ethanol, not 50%, indicating asymmetric behavior.

---

## 5. Applications

### 5.1 Flow Rate Estimation

For flow through a tube (Poiseuille flow):
```
Q = (π × r⁴ × ΔP) / (8 × η × L)
```

where:
- Q = volumetric flow rate (m³/s)
- r = tube radius (m)
- ΔP = pressure difference (Pa)
- η = viscosity (Pa·s)
- L = tube length (m)

### 5.2 Pouring Time Indication

Higher viscosity → slower pouring:
```
t_pour ∝ η / ρ  (kinematic viscosity)
```

### 5.3 Mixing Rate

Viscosity affects how fast stirring homogenizes a solution:
- High viscosity → slow mixing
- Low viscosity → fast mixing

### 5.4 Implementation

```typescript
interface FlowRateInput {
  readonly composition: Composition;
  readonly temperature: number;
  readonly tubeRadius: number;      // m
  readonly tubeLength: number;      // m
  readonly pressureDrop: number;    // Pa
}

interface FlowRateResult {
  /** Viscosity of fluid in Pa·s */
  readonly viscosity: number;
  /** Volumetric flow rate in m³/s */
  readonly volumetricFlowRate: number;
  /** Volumetric flow rate in L/s */
  readonly volumetricFlowRateLps: number;
  /** Mass flow rate in kg/s */
  readonly massFlowRate: number;
}

/**
 * Calculate Poiseuille flow rate through a tube.
 * Q = (π × r⁴ × ΔP) / (8 × η × L)
 *
 * Note: This is instantaneous rate capability.
 */
function calculatePoiseuilleFlow(
  input: FlowRateInput,
  registry: SubstanceRegistry,
  mixingRule: ViscosityMixingRule
): FlowRateResult {
  const { composition, temperature, tubeRadius, tubeLength, pressureDrop } = input;

  // Calculate viscosity
  const viscosity = calculateMixtureViscosity(
    composition, temperature, registry, mixingRule
  );

  // Poiseuille flow
  const r4 = Math.pow(tubeRadius, 4);
  const Q = (Math.PI * r4 * pressureDrop) / (8 * viscosity * tubeLength);

  // Calculate density for mass flow
  const density = calculateDensity(composition, temperature, registry);
  const massFlow = Q * density;

  return {
    viscosity,
    volumetricFlowRate: Q,
    volumetricFlowRateLps: Q * 1000,  // m³/s to L/s
    massFlowRate: massFlow,
  };
}
```

---

## 6. TDD Validation Data

### 6.1 Pure Component Tests

```typescript
describe('Viscosity - Pure Components', () => {
  it('should give η = 0.89 mPa·s for water at 25°C', () => {
    const comp = pureComposition('H2O', 1.0);
    const eta = calculateMixtureViscosity(comp, 298.15, registry, arrhenius);

    expect(eta * 1000).toBeCloseTo(0.89, 1);  // Convert Pa·s to mPa·s
  });

  it('should give η = 1.07 mPa·s for ethanol at 25°C', () => {
    const comp = pureComposition('C2H5OH', 1.0);
    const eta = calculateMixtureViscosity(comp, 298.15, registry, arrhenius);

    expect(eta * 1000).toBeCloseTo(1.07, 1);
  });

  it('should decrease with temperature (Andrade)', () => {
    const comp = pureComposition('H2O', 1.0);
    const eta25 = calculateMixtureViscosity(comp, 298.15, registry, arrhenius);
    const eta50 = calculateMixtureViscosity(comp, 323.15, registry, arrhenius);

    expect(eta50).toBeLessThan(eta25);
  });
});
```

### 6.2 Mixture Tests

```typescript
describe('Viscosity - Mixtures', () => {
  const grunberg = new GrunbergNissanMixingRule();
  grunberg.addInteraction('H2O', 'C2H5OH', 2.2);

  it('should show maximum viscosity for water-ethanol', () => {
    const comp = createComposition({ 'H2O': 0.6, 'C2H5OH': 0.4 });
    const eta = calculateMixtureViscosity(comp, 298.15, registry, grunberg);

    // Should be higher than both pure components
    expect(eta * 1000).toBeGreaterThan(0.89);
    expect(eta * 1000).toBeGreaterThan(1.07);

    // Approximately 2-3 cP
    expect(eta * 1000).toBeGreaterThan(1.5);
    expect(eta * 1000).toBeLessThan(4.0);
  });

  it('should give values between pure components for Arrhenius', () => {
    const comp = createComposition({ 'H2O': 0.5, 'C2H5OH': 0.5 });
    const eta = calculateMixtureViscosity(comp, 298.15, registry, arrhenius);

    // Arrhenius gives geometric mean
    const expected = Math.sqrt(0.00089 * 0.00107);
    expect(eta).toBeCloseTo(expected, 5);
  });
});
```

### 6.3 Flow Rate Tests

```typescript
describe('Poiseuille Flow', () => {
  it('should give correct flow for water through 1cm pipe', () => {
    const comp = pureComposition('H2O', 1.0);
    const result = calculatePoiseuilleFlow({
      composition: comp,
      temperature: 298.15,
      tubeRadius: 0.005,      // 0.5 cm radius = 1 cm diameter
      tubeLength: 1.0,        // 1 m
      pressureDrop: 1000,     // 1 kPa
    }, registry, arrhenius);

    // Q = π × (0.005)⁴ × 1000 / (8 × 0.00089 × 1)
    //   = π × 6.25×10⁻¹⁰ × 1000 / 0.00712
    //   = 2.76×10⁻⁴ m³/s = 0.276 L/s
    expect(result.volumetricFlowRateLps).toBeCloseTo(0.28, 1);
  });
});
```

---

## 7. Interaction Points

- **[02_Substance_Model.md](02_Substance_Model.md)**: Pure component viscosities
- **[03_Composition_System.md](03_Composition_System.md)**: Mole fractions
- **[11_Diffusion.md](11_Diffusion.md)**: Stokes-Einstein uses viscosity
- **[17_Container_Model.md](17_Container_Model.md)**: Viscosity as container property
