# Colligative Properties

## Overview

This document defines colligative properties—properties that depend on the **number** of solute particles, not their identity. These include boiling point elevation and freezing point depression, which affect phase transition temperatures.

---

## 1. First Principles

### 1.1 What Are Colligative Properties?

**Colligative** (from Latin "bound together"): Properties that depend only on:
- The mole fraction of solute
- NOT the chemical nature of the solute

**Examples**:
- Vapor pressure lowering
- Boiling point elevation
- Freezing point depression
- Osmotic pressure

### 1.2 Physical Basis

All colligative effects arise from the **reduction in solvent chemical potential** when solute is added:
```
μ_solvent(solution) = μ_solvent(pure) + RT × ln(x_solvent)
```

Since x_solvent < 1 in a solution, μ decreases.

### 1.3 Ideal Dilute Solutions

Colligative property formulas assume:
- Dilute solution (x_solute << 1)
- Non-volatile solute
- Solute doesn't affect solid phase

---

## 2. Boiling Point Elevation (Stage 6)

### 2.1 Derivation

At the boiling point, liquid and vapor are in equilibrium:
```
μ_liquid = μ_vapor
```

For a solution:
```
μ°_liquid + RT ln(x_solvent) = μ_vapor
```

At the pure solvent boiling point T_b°:
```
μ°_liquid(T_b°) = μ_vapor(T_b°)
```

The temperature must increase to restore equilibrium. Result:
```
ΔT_b = K_b × m
```

where:
- ΔT_b = boiling point elevation (K)
- K_b = ebullioscopic constant (K·kg/mol)
- m = molality of solute (mol solute / kg solvent)

### 2.2 Ebullioscopic Constant

Derived from thermodynamics:
```
K_b = (R × T_b² × M_solvent) / (1000 × ΔH_vap)
```

where:
- R = 8.314 J/(mol·K)
- T_b = normal boiling point (K)
- M_solvent = molar mass of solvent (g/mol)
- ΔH_vap = enthalpy of vaporization (J/mol)

### 2.3 Reference Values

| Solvent | T_b (°C) | K_b (K·kg/mol) |
|---------|----------|----------------|
| Water | 100 | 0.512 |
| Ethanol | 78.4 | 1.22 |
| Benzene | 80.1 | 2.53 |
| Acetic acid | 118.1 | 3.07 |

### 2.4 Implementation

```typescript
interface BoilingPointInput {
  readonly composition: Composition;
  readonly solventId: SubstanceId;
}

interface BoilingPointResult {
  /** Normal boiling point of pure solvent in K */
  readonly pureBoilingPoint: number;

  /** Boiling point elevation in K */
  readonly elevation: number;

  /** New boiling point in K */
  readonly boilingPoint: number;

  /** Molality of solute in mol/kg */
  readonly molality: number;
}

/**
 * Calculate boiling point elevation.
 * ΔT_b = K_b × m
 */
function calculateBoilingPointElevation(
  input: BoilingPointInput,
  registry: SubstanceRegistry
): BoilingPointResult {
  const { composition, solventId } = input;

  const solvent = registry.getRequired(solventId);
  const pureBoilingPoint = solvent.boilingPoint;
  const Kb = solvent.ebullioscopicConstant ?? 0;

  // Calculate molality: moles of solute per kg of solvent
  const solventMoles = composition.moles.get(solventId) ?? 0;
  const solventMassKg = (solventMoles * solvent.molarMass) / 1000;

  let soluteMoles = 0;
  for (const [id, moles] of composition.moles) {
    if (id !== solventId) {
      soluteMoles += moles;
    }
  }

  const molality = solventMassKg > 0 ? soluteMoles / solventMassKg : 0;

  // Calculate elevation
  const elevation = Kb * molality;

  return {
    pureBoilingPoint,
    elevation,
    boilingPoint: pureBoilingPoint + elevation,
    molality,
  };
}
```

---

## 3. Freezing Point Depression (Stage 6)

### 3.1 Derivation

Similar to boiling point, but for solid-liquid equilibrium:
```
ΔT_f = K_f × m
```

where:
- ΔT_f = freezing point depression (K, positive for depression)
- K_f = cryoscopic constant (K·kg/mol)
- m = molality of solute (mol solute / kg solvent)

**Note**: The freezing point **decreases** (depression), so new T_f = T_f° - ΔT_f.

### 3.2 Cryoscopic Constant

Derived from thermodynamics:
```
K_f = (R × T_f² × M_solvent) / (1000 × ΔH_fus)
```

where ΔH_fus is the enthalpy of fusion.

### 3.3 Reference Values

| Solvent | T_f (°C) | K_f (K·kg/mol) |
|---------|----------|----------------|
| Water | 0 | 1.86 |
| Benzene | 5.5 | 5.12 |
| Cyclohexane | 6.5 | 20.0 |
| Camphor | 178 | 40.0 |

### 3.4 Implementation

```typescript
interface FreezingPointInput {
  readonly composition: Composition;
  readonly solventId: SubstanceId;
}

interface FreezingPointResult {
  /** Normal freezing point of pure solvent in K */
  readonly pureFreezingPoint: number;

  /** Freezing point depression in K */
  readonly depression: number;

  /** New freezing point in K */
  readonly freezingPoint: number;

  /** Molality of solute in mol/kg */
  readonly molality: number;
}

/**
 * Calculate freezing point depression.
 * ΔT_f = K_f × m
 */
function calculateFreezingPointDepression(
  input: FreezingPointInput,
  registry: SubstanceRegistry
): FreezingPointResult {
  const { composition, solventId } = input;

  const solvent = registry.getRequired(solventId);
  const pureFreezingPoint = solvent.freezingPoint;
  const Kf = solvent.cryoscopicConstant ?? 0;

  // Calculate molality
  const solventMoles = composition.moles.get(solventId) ?? 0;
  const solventMassKg = (solventMoles * solvent.molarMass) / 1000;

  let soluteMoles = 0;
  for (const [id, moles] of composition.moles) {
    if (id !== solventId) {
      soluteMoles += moles;
    }
  }

  const molality = solventMassKg > 0 ? soluteMoles / solventMassKg : 0;

  // Calculate depression
  const depression = Kf * molality;

  return {
    pureFreezingPoint,
    depression,
    freezingPoint: pureFreezingPoint - depression,
    molality,
  };
}
```

---

## 4. Van't Hoff Factor

### 4.1 Electrolyte Dissociation

For electrolytes that dissociate:
```
NaCl → Na⁺ + Cl⁻  (i = 2)
CaCl₂ → Ca²⁺ + 2Cl⁻  (i = 3)
Glucose → Glucose  (i = 1, non-electrolyte)
```

The colligative effect is multiplied by the **Van't Hoff factor** i:
```
ΔT_b = i × K_b × m
ΔT_f = i × K_f × m
```

### 4.2 Practical Values

| Solute | Theoretical i | Actual i (dilute) |
|--------|---------------|------------------|
| Glucose | 1 | 1.00 |
| NaCl | 2 | 1.87 |
| CaCl₂ | 3 | 2.6 |
| MgSO₄ | 2 | 1.2 |

Actual values are less than theoretical due to ion pairing.

### 4.3 Implementation

```typescript
interface SubstanceWithVantHoff extends Substance {
  /** Van't Hoff factor (1 for non-electrolytes) */
  readonly vantHoffFactor?: number;
}

/**
 * Calculate effective molality accounting for dissociation.
 */
function calculateEffectiveMolality(
  composition: Composition,
  solventId: SubstanceId,
  registry: SubstanceRegistry
): number {
  const solvent = registry.getRequired(solventId);
  const solventMoles = composition.moles.get(solventId) ?? 0;
  const solventMassKg = (solventMoles * solvent.molarMass) / 1000;

  let effectiveSoluteMoles = 0;

  for (const [id, moles] of composition.moles) {
    if (id !== solventId) {
      const solute = registry.getRequired(id);
      const i = (solute as SubstanceWithVantHoff).vantHoffFactor ?? 1;
      effectiveSoluteMoles += moles * i;
    }
  }

  return solventMassKg > 0 ? effectiveSoluteMoles / solventMassKg : 0;
}
```

---

## 5. Combined Colligative Interface

```typescript
interface ColligativeResult {
  /** Boiling point elevation in K */
  readonly boilingPointElevation: number;

  /** New boiling point in K */
  readonly boilingPoint: number;

  /** Freezing point depression in K */
  readonly freezingPointDepression: number;

  /** New freezing point in K */
  readonly freezingPoint: number;

  /** Molality used in calculations */
  readonly molality: number;

  /** Effective molality (with Van't Hoff factor) */
  readonly effectiveMolality: number;
}

/**
 * Calculate all colligative properties.
 */
function calculateColligativeProperties(
  composition: Composition,
  solventId: SubstanceId,
  registry: SubstanceRegistry
): ColligativeResult {
  const solvent = registry.getRequired(solventId);

  // Calculate molalities
  const solventMoles = composition.moles.get(solventId) ?? 0;
  const solventMassKg = (solventMoles * solvent.molarMass) / 1000;

  let soluteMoles = 0;
  let effectiveSoluteMoles = 0;

  for (const [id, moles] of composition.moles) {
    if (id !== solventId) {
      const solute = registry.getRequired(id);
      const i = (solute as SubstanceWithVantHoff).vantHoffFactor ?? 1;
      soluteMoles += moles;
      effectiveSoluteMoles += moles * i;
    }
  }

  const molality = solventMassKg > 0 ? soluteMoles / solventMassKg : 0;
  const effectiveMolality = solventMassKg > 0 ? effectiveSoluteMoles / solventMassKg : 0;

  // Get constants
  const Kb = solvent.ebullioscopicConstant ?? 0;
  const Kf = solvent.cryoscopicConstant ?? 0;

  // Calculate effects
  const boilingPointElevation = Kb * effectiveMolality;
  const freezingPointDepression = Kf * effectiveMolality;

  return {
    boilingPointElevation,
    boilingPoint: solvent.boilingPoint + boilingPointElevation,
    freezingPointDepression,
    freezingPoint: solvent.freezingPoint - freezingPointDepression,
    molality,
    effectiveMolality,
  };
}
```

---

## 6. Applications

### 6.1 Antifreeze

Ethylene glycol in car radiators:
- Lowers freezing point to prevent ice formation
- Raises boiling point to prevent overheating

### 6.2 Salting Roads

Salt (NaCl or CaCl₂) on icy roads:
- Depresses freezing point of water
- Ice melts even below 0°C
- CaCl₂ more effective (i = 3 vs 2)

### 6.3 Cooking

Adding salt to water:
- Slightly raises boiling point (~0.5°C for typical cooking salt)
- Effect is small but measurable

### 6.4 Molecular Weight Determination

Measuring freezing point depression allows calculation of solute molar mass:
```
M = (K_f × m_solute) / (ΔT_f × m_solvent)
```

---

## 7. TDD Validation Data

### 7.1 Boiling Point Tests

```typescript
describe('BoilingPointElevation', () => {
  it('should give ΔT_b = 0.51 K for 1 mol glucose in 1 kg water', () => {
    // 1 mol glucose in 55.5 mol water (1 kg)
    const comp = createComposition({ 'H2O': 55.5, 'glucose': 1.0 });
    const result = calculateBoilingPointElevation(
      { composition: comp, solventId: 'H2O' },
      registry
    );

    // ΔT = 0.512 K·kg/mol × 1 mol/kg = 0.512 K
    expect(result.elevation).toBeCloseTo(0.512, 2);
    expect(result.boilingPoint).toBeCloseTo(373.15 + 0.512, 2);
  });

  it('should give doubled effect for NaCl (i=2)', () => {
    const comp = createComposition({ 'H2O': 55.5, 'NaCl': 1.0 });
    const result = calculateColligativeProperties(comp, 'H2O', registry);

    // ΔT = 0.512 × 1.87 ≈ 0.96 K
    expect(result.boilingPointElevation).toBeCloseTo(0.96, 1);
  });
});
```

### 7.2 Freezing Point Tests

```typescript
describe('FreezingPointDepression', () => {
  it('should give ΔT_f = 1.86 K for 1 mol glucose in 1 kg water', () => {
    const comp = createComposition({ 'H2O': 55.5, 'glucose': 1.0 });
    const result = calculateFreezingPointDepression(
      { composition: comp, solventId: 'H2O' },
      registry
    );

    // ΔT = 1.86 K·kg/mol × 1 mol/kg = 1.86 K
    expect(result.depression).toBeCloseTo(1.86, 2);
    expect(result.freezingPoint).toBeCloseTo(273.15 - 1.86, 2);
  });

  it('should give correct value for seawater', () => {
    // Seawater is approximately 0.6 M NaCl
    // 0.6 mol in 1 kg = 0.6 molality
    const comp = createComposition({ 'H2O': 55.5, 'NaCl': 0.6 });
    const result = calculateColligativeProperties(comp, 'H2O', registry);

    // ΔT = 1.86 × 0.6 × 1.87 ≈ 2.1 K
    // Seawater freezes at about -1.9°C
    expect(result.freezingPoint).toBeCloseTo(273.15 - 2.1, 0);
  });
});
```

---

## 8. Interaction Points

- **[02_Substance_Model.md](02_Substance_Model.md)**: K_b, K_f, Van't Hoff factors
- **[03_Composition_System.md](03_Composition_System.md)**: Composition, moles
- **[05_Pressure_System.md](05_Pressure_System.md)**: Vapor pressure lowering
- **[15_Osmotic_Pressure.md](15_Osmotic_Pressure.md)**: Another colligative property
