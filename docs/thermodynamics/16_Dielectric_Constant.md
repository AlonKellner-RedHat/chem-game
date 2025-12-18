# Dielectric Constant

## Overview

This document defines the dielectric constant system. The dielectric constant (relative permittivity) determines how well a solvent shields electric charges and affects ion solvation, electrolyte behavior, and reaction rates.

---

## 1. First Principles

### 1.1 Molecular Polarization

When an electric field is applied to a material:
1. **Electronic polarization**: Electron clouds shift
2. **Atomic polarization**: Nuclei shift slightly
3. **Orientational polarization**: Polar molecules align with field

The total polarization reduces the effective electric field inside the material.

### 1.2 Definition

**Dielectric constant (ε_r)**: The ratio of the material's electric permittivity to the vacuum permittivity.

```
ε_r = ε / ε_0
```

where:
- ε = permittivity of material
- ε_0 = permittivity of vacuum = 8.854 × 10⁻¹² F/m

### 1.3 Coulomb's Law in a Dielectric

The electrostatic force between charges is reduced:
```
F = (q₁ × q₂) / (4 × π × ε_0 × ε_r × r²)
```

High ε_r → charges are shielded → ions can separate easily.

---

## 2. Pure Component Dielectric (Stage 7)

### 2.1 Molecular Origin

High dielectric constant requires:
- **High polarity**: Large molecular dipole moment
- **High mobility**: Molecules can rotate to align with field

Water (ε_r = 78.4) is exceptional because:
- Strong O-H dipole
- Hydrogen bonding network allows cooperative reorientation
- Tetrahedral structure

### 2.2 Temperature Dependence

Dielectric constant generally **decreases** with temperature:
```
ε_r(T) = ε_r(T_ref) × [1 - α × (T - T_ref)]
```

This is because thermal energy disrupts molecular alignment.

### 2.3 Reference Values (at 25°C)

| Substance | ε_r | Dipole (D) | Character |
|-----------|-----|------------|-----------|
| Water | 78.4 | 1.85 | Very polar |
| Methanol | 32.7 | 1.70 | Polar |
| Ethanol | 24.5 | 1.69 | Polar |
| Acetone | 20.7 | 2.88 | Polar |
| Acetic acid | 6.2 | 1.74 | Moderate |
| Chloroform | 4.8 | 1.04 | Low |
| Benzene | 2.3 | 0 | Non-polar |
| Hexane | 1.9 | 0 | Non-polar |
| Vacuum | 1.0 | — | Reference |

### 2.4 Data Structure

```typescript
interface DielectricData {
  /** Relative dielectric constant (dimensionless) */
  readonly dielectricConstant: number;

  /** Reference temperature in K */
  readonly dielectricRefTemp: number;

  /** Temperature coefficient in 1/K */
  readonly dielectricTempCoeff?: number;
}
```

---

## 3. Temperature Correction

```typescript
/**
 * Calculate dielectric constant at temperature T.
 * ε_r(T) = ε_r(T_ref) × [1 - α × (T - T_ref)]
 */
function calculateDielectricConstant(
  substance: Substance,
  temperature: number
): number {
  const eps_ref = substance.dielectricConstant;
  const T_ref = substance.dielectricRefTemp;

  if (substance.dielectricTempCoeff) {
    const alpha = substance.dielectricTempCoeff;
    return eps_ref * (1 - alpha * (temperature - T_ref));
  }

  return eps_ref;
}
```

### Water Dielectric vs Temperature

| T (°C) | ε_r |
|--------|-----|
| 0 | 87.7 |
| 25 | 78.4 |
| 50 | 69.9 |
| 75 | 62.4 |
| 100 | 55.3 |

Temperature coefficient: α ≈ 0.0045 /K

---

## 4. Mixture Dielectric Constant

### 4.1 Simple Volume-Weighted Average

```
ε_mix = Σ φ_i × ε_i
```

where φ_i is the volume fraction.

This is often inaccurate due to molecular interactions.

### 4.2 Kraszewski Mixing Rule

More accurate for polar/non-polar mixtures:
```
√ε_mix = Σ φ_i × √ε_i
```

### 4.3 Onsager-Fröhlich for Polar Mixtures

For mixtures of similar polar liquids:
```
(ε_mix - 1)/(ε_mix + 2) = Σ φ_i × (ε_i - 1)/(ε_i + 2)
```

### 4.4 Implementation

```typescript
interface DielectricMixingRule {
  readonly id: string;
  readonly name: string;

  calculate(
    pureValues: Map<SubstanceId, number>,
    volumeFractions: Map<SubstanceId, number>
  ): number;
}

/**
 * Volume-weighted linear mixing rule.
 */
class LinearDielectricMixingRule implements DielectricMixingRule {
  readonly id = 'linear';
  readonly name = 'Linear Mixing Rule';

  calculate(
    pureValues: Map<SubstanceId, number>,
    volumeFractions: Map<SubstanceId, number>
  ): number {
    let eps_mix = 0;

    for (const [id, phi] of volumeFractions) {
      const eps = pureValues.get(id) ?? 0;
      eps_mix += phi * eps;
    }

    return eps_mix;
  }
}

/**
 * Kraszewski mixing rule (sqrt average).
 */
class KraszewskiMixingRule implements DielectricMixingRule {
  readonly id = 'kraszewski';
  readonly name = 'Kraszewski Mixing Rule';

  calculate(
    pureValues: Map<SubstanceId, number>,
    volumeFractions: Map<SubstanceId, number>
  ): number {
    let sqrt_eps = 0;

    for (const [id, phi] of volumeFractions) {
      const eps = pureValues.get(id) ?? 0;
      sqrt_eps += phi * Math.sqrt(eps);
    }

    return sqrt_eps * sqrt_eps;
  }
}

/**
 * Onsager-Fröhlich mixing rule.
 */
class OnsagerFrohlichMixingRule implements DielectricMixingRule {
  readonly id = 'onsager-frohlich';
  readonly name = 'Onsager-Fröhlich Mixing Rule';

  calculate(
    pureValues: Map<SubstanceId, number>,
    volumeFractions: Map<SubstanceId, number>
  ): number {
    // (ε - 1)/(ε + 2) = Σ φ_i × (ε_i - 1)/(ε_i + 2)
    let sum = 0;

    for (const [id, phi] of volumeFractions) {
      const eps = pureValues.get(id) ?? 1;
      sum += phi * (eps - 1) / (eps + 2);
    }

    // Solve for ε: (ε - 1)/(ε + 2) = sum
    // ε - 1 = sum × (ε + 2)
    // ε - 1 = sum × ε + 2 × sum
    // ε × (1 - sum) = 1 + 2 × sum
    // ε = (1 + 2 × sum) / (1 - sum)

    if (sum >= 1) {
      return Infinity;  // Shouldn't happen for normal values
    }

    return (1 + 2 * sum) / (1 - sum);
  }
}
```

---

## 5. Water-Ethanol System

### 5.1 Dielectric Data

| x_ethanol | φ_ethanol | ε_r (exp) | Linear | Kraszewski |
|-----------|-----------|-----------|--------|------------|
| 0.0 | 0.0 | 78.4 | 78.4 | 78.4 |
| 0.2 | 0.34 | 60 | 60.1 | 56.4 |
| 0.4 | 0.53 | 48 | 49.8 | 44.8 |
| 0.6 | 0.68 | 38 | 41.8 | 36.7 |
| 0.8 | 0.84 | 30 | 33.0 | 29.3 |
| 1.0 | 1.0 | 24.5 | 24.5 | 24.5 |

The Kraszewski rule performs reasonably well for this system.

---

## 6. Applications

### 6.1 Ion Solvation Energy

The Born equation for ion solvation energy:
```
ΔG_solv = -(z² × e²) / (8 × π × ε_0 × ε_r × r) × (1 - 1/ε_r)
```

Higher ε_r → more favorable ion solvation → higher electrolyte solubility.

### 6.2 Electrolyte Solubility

Salts dissolve better in high-ε solvents:
- NaCl in water: very soluble
- NaCl in ethanol: slightly soluble
- NaCl in hexane: insoluble

### 6.3 Reaction Rate Effects

Polar transition states are stabilized in high-ε solvents, affecting reaction rates.

### 6.4 Implementation

```typescript
interface BornSolvationInput {
  readonly ionCharge: number;  // In units of e (1 for Na+, 2 for Ca2+, etc.)
  readonly ionRadius: number;  // meters
  readonly dielectricConstant: number;
}

interface BornSolvationResult {
  /** Solvation free energy in kJ/mol */
  readonly solvationEnergy: number;
  /** Whether solvation is favorable (negative ΔG) */
  readonly favorable: boolean;
}

const E_CHARGE = 1.602176634e-19;  // C
const EPSILON_0 = 8.854187817e-12;  // F/m
const AVOGADRO = 6.02214076e23;

/**
 * Calculate Born solvation energy.
 * ΔG = -(z² × e²) / (8 × π × ε_0 × r) × (1 - 1/ε_r)
 */
function calculateBornSolvation(
  input: BornSolvationInput
): BornSolvationResult {
  const { ionCharge, ionRadius, dielectricConstant } = input;

  const z2 = ionCharge * ionCharge;
  const numerator = z2 * E_CHARGE * E_CHARGE;
  const denominator = 8 * Math.PI * EPSILON_0 * ionRadius;
  const factor = 1 - 1 / dielectricConstant;

  // Energy per ion in Joules
  const G_ion = -numerator / denominator * factor;

  // Convert to kJ/mol
  const G_mol = G_ion * AVOGADRO / 1000;

  return {
    solvationEnergy: G_mol,
    favorable: G_mol < 0,
  };
}
```

---

## 7. TDD Validation Data

### 7.1 Pure Component Tests

```typescript
describe('DielectricConstant - Pure', () => {
  it('should give ε = 78.4 for water at 25°C', () => {
    const comp = pureComposition('H2O', 1.0);
    const eps = calculateMixtureDielectric(comp, 298.15, registry, linearRule);

    expect(eps).toBeCloseTo(78.4, 0);
  });

  it('should give ε = 24.5 for ethanol at 25°C', () => {
    const comp = pureComposition('C2H5OH', 1.0);
    const eps = calculateMixtureDielectric(comp, 298.15, registry, linearRule);

    expect(eps).toBeCloseTo(24.5, 0);
  });

  it('should decrease with temperature for water', () => {
    const substance = registry.getRequired('H2O');

    const eps25 = calculateDielectricConstant(substance, 298.15);
    const eps50 = calculateDielectricConstant(substance, 323.15);

    expect(eps50).toBeLessThan(eps25);
  });
});
```

### 7.2 Mixture Tests

```typescript
describe('DielectricConstant - Mixtures', () => {
  it('should give intermediate value for water-ethanol', () => {
    const comp = createComposition({ 'H2O': 0.5, 'C2H5OH': 0.5 });
    const eps = calculateMixtureDielectric(comp, 298.15, registry, kraszewski);

    expect(eps).toBeLessThan(78.4);
    expect(eps).toBeGreaterThan(24.5);
  });

  it('should agree with experimental data for 50% ethanol', () => {
    // x_ethanol = 0.5, φ_ethanol ≈ 0.62
    const comp = createComposition({ 'H2O': 0.5, 'C2H5OH': 0.5 });
    const eps = calculateMixtureDielectric(comp, 298.15, registry, kraszewski);

    // Experimental ≈ 42
    expect(eps).toBeCloseTo(42, -1);  // Within 10%
  });
});
```

### 7.3 Born Solvation Tests

```typescript
describe('BornSolvation', () => {
  it('should give large negative energy for Na+ in water', () => {
    const result = calculateBornSolvation({
      ionCharge: 1,
      ionRadius: 1.02e-10,  // Na+ ionic radius in meters
      dielectricConstant: 78.4,
    });

    // Expected: around -400 kJ/mol
    expect(result.solvationEnergy).toBeLessThan(-300);
    expect(result.solvationEnergy).toBeGreaterThan(-500);
    expect(result.favorable).toBe(true);
  });

  it('should give less favorable solvation in ethanol', () => {
    const inWater = calculateBornSolvation({
      ionCharge: 1,
      ionRadius: 1.02e-10,
      dielectricConstant: 78.4,
    });

    const inEthanol = calculateBornSolvation({
      ionCharge: 1,
      ionRadius: 1.02e-10,
      dielectricConstant: 24.5,
    });

    // Both negative, but ethanol less so
    expect(Math.abs(inWater.solvationEnergy)).toBeGreaterThan(
      Math.abs(inEthanol.solvationEnergy)
    );
  });
});
```

---

## 8. Interaction Points

- **[02_Substance_Model.md](02_Substance_Model.md)**: Pure component dielectric constants
- **[04_Volume_System.md](04_Volume_System.md)**: Volume fractions for mixing
- **[17_Container_Model.md](17_Container_Model.md)**: Dielectric as container property
- **[22_Data_Sources.md](22_Data_Sources.md)**: Dielectric constant data
