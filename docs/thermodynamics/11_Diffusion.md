# Diffusion

## Overview

This document defines the diffusion system, which determines the rate of passive molecular mixing. Diffusion describes how fast molecules spread through a solution without stirring. This is a rate capability—it gives the diffusion coefficient, not the actual concentration change over time.

---

## 1. First Principles

### 1.1 Random Molecular Motion

Molecules in liquids are in constant random motion:
1. Molecules collide with neighbors ~10¹² times per second
2. Between collisions, they move in random directions
3. Over time, this random walk causes net spreading from high to low concentration

### 1.2 Fick's First Law

**The diffusion flux** (rate of mass transfer per unit area):
```
J = -D × (dC/dx)
```

where:
- J = molar flux (mol/(m²·s))
- D = diffusion coefficient (m²/s)
- dC/dx = concentration gradient (mol/m³/m = mol/m⁴)

The negative sign indicates molecules move from high to low concentration.

**Reference**: Fick, A. (1855). "Über Diffusion". Annalen der Physik. 170: 59-86.

### 1.3 Fick's Second Law

**The diffusion equation** (how concentration evolves):
```
∂C/∂t = D × (∂²C/∂x²)
```

This describes how concentration profiles change over time—but our system only calculates D, not the time evolution.

---

## 2. Self-Diffusion Coefficient (Stage 4)

### 2.1 Definition

**Self-diffusion**: Movement of molecules through their own kind (e.g., tagged water in water).

**Mutual diffusion**: Movement of one species through another (e.g., salt in water).

For similar molecules, these are approximately equal.

### 2.2 Stokes-Einstein Equation

For spherical particles in a viscous medium:
```
D = k_B × T / (6 × π × η × r)
```

where:
- D = diffusion coefficient (m²/s)
- k_B = Boltzmann constant = 1.38065 × 10⁻²³ J/K
- T = temperature (K)
- η = viscosity of medium (Pa·s)
- r = hydrodynamic radius of diffusing particle (m)

**Physical interpretation**: Larger molecules and higher viscosity → slower diffusion.

**Reference**: Einstein, A. (1905). Ann. Phys. 17: 549.

### 2.3 Temperature Dependence

From Stokes-Einstein, D increases with temperature (approximately proportional):
```
D ∝ T / η
```

Since viscosity decreases with T faster than T increases, D increases strongly with temperature.

### 2.4 Reference Values (at 25°C in water)

| Solute | D (×10⁻⁹ m²/s) | Radius (pm) |
|--------|----------------|-------------|
| H₂O (self) | 2.30 | 140 |
| Ethanol | 1.08 | 220 |
| Glucose | 0.67 | 350 |
| Sucrose | 0.52 | 450 |
| NaCl | 1.61 | — |
| O₂ | 2.10 | — |

---

## 3. Data Structure

```typescript
interface DiffusionData {
  /** Self-diffusion coefficient in m²/s */
  readonly diffusionCoefficient: number;

  /** Reference temperature for diffusion in K */
  readonly diffusionRefTemp: number;

  /** Effective molecular radius in m (for Stokes-Einstein) */
  readonly molecularRadius?: number;
}
```

---

## 4. Mutual Diffusion in Mixtures

### 4.1 Binary Diffusion Coefficient

For a binary mixture A-B:
```
D_AB = D_AB(x_A, T, P)
```

The mutual diffusion coefficient depends on composition.

### 4.2 Composition Dependence

A common approximation:
```
D_AB = x_A × D_A* × (η_A*/η) + x_B × D_B* × (η_B*/η)
```

where:
- D_A* = self-diffusion of A in pure A
- η_A* = viscosity of pure A
- η = mixture viscosity

### 4.3 Vignes Equation

```
D_AB = (D_AB°)^x_B × (D_BA°)^x_A
```

where:
- D_AB° = diffusion of A at infinite dilution in B
- D_BA° = diffusion of B at infinite dilution in A

**Reference**: Vignes, A. (1966). Ind. Eng. Chem. Fundam. 5: 189.

### 4.4 Implementation

```typescript
interface DiffusionInput {
  readonly composition: Composition;
  readonly temperature: number;  // K
}

interface DiffusionResult {
  /** Effective diffusion coefficient in m²/s */
  readonly diffusionCoefficient: number;

  /** Self-diffusion coefficients of components */
  readonly selfDiffusion: Map<SubstanceId, number>;

  /** Characteristic diffusion time for given length scale */
  readonly characteristicTime?: number;
}

/**
 * Calculate effective diffusion coefficient using Stokes-Einstein scaling.
 */
function calculateDiffusion(
  input: DiffusionInput,
  registry: SubstanceRegistry,
  viscosityRule: ViscosityMixingRule
): DiffusionResult {
  const { composition, temperature } = input;
  const fractions = getMoleFractions(composition);

  // Get mixture viscosity
  const eta = calculateMixtureViscosity(
    composition, temperature, registry, viscosityRule
  );

  // Calculate self-diffusion coefficients (scaled by viscosity ratio)
  const selfDiffusion = new Map<SubstanceId, number>();

  for (const [id, x] of fractions) {
    const substance = registry.getRequired(id);

    if (substance.molecularRadius) {
      // Use Stokes-Einstein
      const D = (K_BOLTZMANN * temperature) /
                (6 * Math.PI * eta * substance.molecularRadius);
      selfDiffusion.set(id, D);
    } else if (substance.diffusionCoefficient) {
      // Scale reference value by viscosity ratio
      const etaRef = registry.getRequired(id).viscosity;  // Approximate
      const D = substance.diffusionCoefficient * (etaRef / eta) *
                (temperature / substance.diffusionRefTemp);
      selfDiffusion.set(id, D);
    }
  }

  // Effective diffusion: weighted average
  let D_eff = 0;
  for (const [id, x] of fractions) {
    const D = selfDiffusion.get(id) ?? 0;
    D_eff += x * D;
  }

  return {
    diffusionCoefficient: D_eff,
    selfDiffusion,
  };
}

const K_BOLTZMANN = 1.380649e-23;  // J/K
```

---

## 5. Characteristic Times

### 5.1 Diffusion Time Scale

The time for diffusion to spread a distance L:
```
t_diff = L² / D
```

**Examples** (D = 10⁻⁹ m²/s):

| Distance | Time |
|----------|------|
| 1 μm | 1 ms |
| 100 μm | 10 s |
| 1 mm | 1000 s (17 min) |
| 1 cm | 10⁵ s (28 hours) |
| 10 cm | 10⁷ s (4 months) |

**Conclusion**: Diffusion is fast at microscopic scales, extremely slow at macroscopic scales. This is why stirring is necessary for mixing.

### 5.2 Implementation

```typescript
/**
 * Calculate characteristic diffusion time.
 * t = L² / D
 *
 * Note: This is an indicator of how long mixing WOULD take,
 * not a simulation of actual mixing over time.
 */
function calculateDiffusionTime(
  diffusionCoefficient: number,  // m²/s
  characteristicLength: number   // m
): number {
  return (characteristicLength * characteristicLength) / diffusionCoefficient;
}

/**
 * Calculate diffusion length for a given time.
 * L = √(D × t)
 */
function calculateDiffusionLength(
  diffusionCoefficient: number,  // m²/s
  time: number                   // s
): number {
  return Math.sqrt(diffusionCoefficient * time);
}
```

---

## 6. Diffusion Flux

### 6.1 Molar Flux Calculation

Given a concentration gradient:
```
J = -D × ΔC / Δx
```

### 6.2 Implementation

```typescript
interface DiffusionFluxInput {
  readonly composition: Composition;
  readonly temperature: number;
  /** Concentration difference in mol/m³ */
  readonly concentrationDifference: number;
  /** Distance over which gradient exists in m */
  readonly gradientDistance: number;
  /** Cross-sectional area in m² */
  readonly crossSectionArea: number;
}

interface DiffusionFluxResult {
  /** Diffusion coefficient in m²/s */
  readonly diffusionCoefficient: number;
  /** Molar flux in mol/(m²·s) */
  readonly molarFlux: number;
  /** Total molar flow rate in mol/s */
  readonly molarFlowRate: number;
}

/**
 * Calculate diffusion flux.
 * J = -D × (ΔC/Δx)
 *
 * Note: This is instantaneous flux capability.
 */
function calculateDiffusionFlux(
  input: DiffusionFluxInput,
  registry: SubstanceRegistry,
  viscosityRule: ViscosityMixingRule
): DiffusionFluxResult {
  const { composition, temperature, concentrationDifference,
          gradientDistance, crossSectionArea } = input;

  const diffResult = calculateDiffusion(
    { composition, temperature },
    registry,
    viscosityRule
  );

  const D = diffResult.diffusionCoefficient;

  // Molar flux (magnitude, always positive)
  const J = D * Math.abs(concentrationDifference) / gradientDistance;

  // Total flow rate
  const flowRate = J * crossSectionArea;

  return {
    diffusionCoefficient: D,
    molarFlux: J,
    molarFlowRate: flowRate,
  };
}
```

---

## 7. Relationship to Other Properties

### 7.1 Viscosity-Diffusion Relation

From Stokes-Einstein:
```
D × η = k_B × T / (6 × π × r) = constant
```

This means:
- High viscosity → slow diffusion
- Low viscosity → fast diffusion

For the same molecule in different solvents:
```
D₁ × η₁ ≈ D₂ × η₂  (at same T)
```

### 7.2 Temperature Effects

Both T and η affect D:
```
D ∝ T / η
```

Since η decreases exponentially with T (Andrade), and T increases linearly:
- D increases strongly with temperature
- Approximate: D doubles every 25-30°C

---

## 8. TDD Validation Data

### 8.1 Self-Diffusion Tests

```typescript
describe('Diffusion - Self-Diffusion', () => {
  it('should give D ≈ 2.3×10⁻⁹ m²/s for water at 25°C', () => {
    const comp = pureComposition('H2O', 1.0);
    const result = calculateDiffusion(
      { composition: comp, temperature: 298.15 },
      registry,
      arrhenius
    );

    expect(result.diffusionCoefficient).toBeCloseTo(2.3e-9, 10);
  });

  it('should give D ≈ 1.1×10⁻⁹ m²/s for ethanol at 25°C', () => {
    const comp = pureComposition('C2H5OH', 1.0);
    const result = calculateDiffusion(
      { composition: comp, temperature: 298.15 },
      registry,
      arrhenius
    );

    expect(result.diffusionCoefficient).toBeCloseTo(1.1e-9, 10);
  });
});
```

### 8.2 Characteristic Time Tests

```typescript
describe('Diffusion - Characteristic Time', () => {
  it('should calculate 1 cm diffusion time correctly', () => {
    const D = 1e-9;  // m²/s
    const L = 0.01;  // 1 cm

    const t = calculateDiffusionTime(D, L);

    // t = L²/D = (0.01)² / 10⁻⁹ = 10⁵ s
    expect(t).toBeCloseTo(1e5, 0);
  });

  it('should calculate 1 mm diffusion time correctly', () => {
    const D = 2e-9;  // m²/s (water-like)
    const L = 0.001;  // 1 mm

    const t = calculateDiffusionTime(D, L);

    // t = (10⁻³)² / (2×10⁻⁹) = 10⁻⁶ / 2×10⁻⁹ = 500 s
    expect(t).toBeCloseTo(500, 0);
  });
});
```

### 8.3 Stokes-Einstein Test

```typescript
describe('Diffusion - Stokes-Einstein', () => {
  it('should satisfy D × η = constant for same molecule', () => {
    const comp = pureComposition('H2O', 1.0);

    // At 25°C
    const result25 = calculateDiffusion({ composition: comp, temperature: 298.15 }, registry, arrhenius);
    const eta25 = calculateMixtureViscosity(comp, 298.15, registry, arrhenius);

    // At 50°C
    const result50 = calculateDiffusion({ composition: comp, temperature: 323.15 }, registry, arrhenius);
    const eta50 = calculateMixtureViscosity(comp, 323.15, registry, arrhenius);

    // D × η / T should be approximately constant
    const ratio25 = result25.diffusionCoefficient * eta25 / 298.15;
    const ratio50 = result50.diffusionCoefficient * eta50 / 323.15;

    expect(ratio25 / ratio50).toBeCloseTo(1.0, 1);
  });
});
```

---

## 9. Interaction Points

- **[02_Substance_Model.md](02_Substance_Model.md)**: Diffusion coefficients, molecular radii
- **[10_Viscosity.md](10_Viscosity.md)**: Stokes-Einstein uses viscosity
- **[17_Container_Model.md](17_Container_Model.md)**: Diffusion as container property
- **[19_Demo_Specification.md](19_Demo_Specification.md)**: Mixing time indicators
