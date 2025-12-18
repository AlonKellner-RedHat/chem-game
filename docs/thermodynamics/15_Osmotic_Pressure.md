# Osmotic Pressure

## Overview

This document defines the osmotic pressure system. Osmotic pressure is the pressure required to prevent solvent flow across a semipermeable membrane between solutions of different concentrations. It's a colligative property that depends on solute concentration.

---

## 1. First Principles

### 1.1 The Osmotic Phenomenon

When a semipermeable membrane separates:
- Pure solvent (or dilute solution) on one side
- Concentrated solution on the other side

**Solvent flows spontaneously from low concentration to high concentration**.

This continues until:
- Equilibrium is reached, or
- Pressure is applied to stop the flow

### 1.2 Semipermeable Membranes

A semipermeable membrane:
- Allows solvent molecules to pass
- Blocks solute molecules
- Examples: cell membranes, dialysis membranes, reverse osmosis membranes

### 1.3 Thermodynamic Basis

Osmosis occurs because:
```
μ_solvent(dilute) > μ_solvent(concentrated)
```

Solvent flows to equalize chemical potential. The osmotic pressure is the pressure difference needed to maintain equilibrium.

---

## 2. Van't Hoff Equation (Stage 7)

### 2.1 Derivation

At osmotic equilibrium:
```
μ_solvent(solution, P + Π) = μ_solvent(pure, P)
```

For an ideal dilute solution:
```
μ°(T) + RT ln(x_solvent) + V_m × Π = μ°(T)
```

Since x_solvent ≈ 1 - x_solute for dilute solutions:
```
RT ln(1 - x_solute) + V_m × Π = 0
```

For small x_solute, ln(1-x) ≈ -x:
```
-RT × x_solute + V_m × Π = 0
```

Rearranging:
```
Π = (n_solute / V) × RT = M × RT
```

where M is the molarity (mol/L).

### 2.2 Van't Hoff Equation

```
Π = i × M × R × T
```

where:
- Π = osmotic pressure (Pa or kPa)
- i = Van't Hoff factor (accounts for dissociation)
- M = molarity of solute (mol/L)
- R = gas constant = 8.314 J/(mol·K) = 8.314 kPa·L/(mol·K)
- T = temperature (K)

**Reference**: van't Hoff, J.H. (1887). "The role of osmotic pressure in the analogy between solutions and gases." Z. Phys. Chem. 1: 481-508.

### 2.3 Similarity to Ideal Gas Law

Van't Hoff noted the remarkable similarity to the ideal gas law:
```
Π = nRT/V  (osmotic pressure)
P = nRT/V  (ideal gas)
```

Dissolved solute particles exert "osmotic pressure" analogous to gas pressure.

---

## 3. Implementation

### 3.1 Single Membrane Osmotic Pressure

```typescript
interface OsmoticPressureInput {
  /** Solution composition */
  readonly solution: Composition;
  /** Solvent ID (what passes through membrane) */
  readonly solventId: SubstanceId;
  /** Temperature in K */
  readonly temperature: number;
}

interface OsmoticPressureResult {
  /** Osmotic pressure in kPa */
  readonly osmoticPressure: number;

  /** Osmotic pressure in atm */
  readonly osmoticPressureAtm: number;

  /** Molarity of solute particles */
  readonly molarity: number;

  /** Effective molarity (with Van't Hoff factor) */
  readonly effectiveMolarity: number;
}

/** Gas constant in kPa·L/(mol·K) */
const R_GAS_KPA = 8.31446;

/**
 * Calculate osmotic pressure.
 * Π = i × M × R × T
 */
function calculateOsmoticPressure(
  input: OsmoticPressureInput,
  registry: SubstanceRegistry
): OsmoticPressureResult {
  const { solution, solventId, temperature } = input;

  // Calculate solution volume
  const volume = calculateVolume(
    { composition: solution, temperature },
    registry,
    excessRegistry
  ).totalVolume;  // L

  // Calculate effective solute moles
  let soluteMoles = 0;
  let effectiveSoluteMoles = 0;

  for (const [id, moles] of solution.moles) {
    if (id !== solventId) {
      const solute = registry.getRequired(id);
      const i = (solute as SubstanceWithVantHoff).vantHoffFactor ?? 1;
      soluteMoles += moles;
      effectiveSoluteMoles += moles * i;
    }
  }

  const molarity = soluteMoles / volume;
  const effectiveMolarity = effectiveSoluteMoles / volume;

  // Van't Hoff equation
  const Pi = effectiveMolarity * R_GAS_KPA * temperature;

  return {
    osmoticPressure: Pi,
    osmoticPressureAtm: Pi / 101.325,
    molarity,
    effectiveMolarity,
  };
}
```

### 3.2 Two-Solution Osmotic Difference

```typescript
interface OsmoticDifferenceInput {
  /** First solution */
  readonly solution1: Composition;
  /** Second solution */
  readonly solution2: Composition;
  /** Common solvent ID */
  readonly solventId: SubstanceId;
  /** Temperature in K */
  readonly temperature: number;
}

interface OsmoticDifferenceResult {
  /** Osmotic pressure of solution 1 in kPa */
  readonly Pi1: number;
  /** Osmotic pressure of solution 2 in kPa */
  readonly Pi2: number;
  /** Osmotic pressure difference in kPa */
  readonly deltaPi: number;
  /** Direction of solvent flow (1→2 or 2→1) */
  readonly flowDirection: '1→2' | '2→1' | 'none';
}

/**
 * Calculate osmotic pressure difference between two solutions.
 */
function calculateOsmoticDifference(
  input: OsmoticDifferenceInput,
  registry: SubstanceRegistry
): OsmoticDifferenceResult {
  const { solution1, solution2, solventId, temperature } = input;

  const result1 = calculateOsmoticPressure(
    { solution: solution1, solventId, temperature },
    registry
  );

  const result2 = calculateOsmoticPressure(
    { solution: solution2, solventId, temperature },
    registry
  );

  const deltaPi = result2.osmoticPressure - result1.osmoticPressure;

  // Solvent flows from low osmotic pressure to high
  let flowDirection: '1→2' | '2→1' | 'none';
  if (Math.abs(deltaPi) < 0.01) {
    flowDirection = 'none';
  } else if (deltaPi > 0) {
    flowDirection = '1→2';  // Solvent flows to solution 2
  } else {
    flowDirection = '2→1';
  }

  return {
    Pi1: result1.osmoticPressure,
    Pi2: result2.osmoticPressure,
    deltaPi: Math.abs(deltaPi),
    flowDirection,
  };
}
```

---

## 4. Magnitude and Applications

### 4.1 Typical Values

For 1 M solution at 25°C:
```
Π = 1 × 8.314 × 298 = 2477 kPa ≈ 24.5 atm
```

Osmotic pressure is **surprisingly large**!

### 4.2 Physiological Solutions

| Solution | Concentration | Π (atm) |
|----------|---------------|---------|
| Blood plasma | ~0.3 M | ~7.5 |
| 0.9% NaCl (saline) | 0.15 M | ~7.5 |
| Seawater | ~0.5 M | ~25 |

Saline is "isotonic" with blood (same osmotic pressure).

### 4.3 Applications

**Biological**:
- Cell volume regulation
- Nutrient transport
- Kidney function

**Industrial**:
- Reverse osmosis desalination
- Food preservation
- Drug delivery

---

## 5. Reverse Osmosis

### 5.1 Concept

By applying pressure **greater than** the osmotic pressure, solvent flow is reversed:
- Solvent moves from high to low concentration
- Solutes are retained
- Pure solvent is obtained

### 5.2 Minimum Pressure

The minimum pressure required:
```
P_applied > Π
```

For seawater desalination (~0.5 M, Π ≈ 25 atm), pressures of 50-80 atm are used.

### 5.3 Implementation

```typescript
interface ReverseOsmosisInput {
  readonly solution: Composition;
  readonly solventId: SubstanceId;
  readonly temperature: number;
  readonly appliedPressure: number;  // kPa
}

interface ReverseOsmosisResult {
  readonly osmoticPressure: number;  // kPa
  readonly appliedPressure: number;  // kPa
  readonly drivingPressure: number;  // kPa (applied - osmotic)
  readonly canDesalinate: boolean;
}

/**
 * Analyze reverse osmosis feasibility.
 */
function analyzeReverseOsmosis(
  input: ReverseOsmosisInput,
  registry: SubstanceRegistry
): ReverseOsmosisResult {
  const { solution, solventId, temperature, appliedPressure } = input;

  const osmResult = calculateOsmoticPressure(
    { solution, solventId, temperature },
    registry
  );

  const drivingPressure = appliedPressure - osmResult.osmoticPressure;

  return {
    osmoticPressure: osmResult.osmoticPressure,
    appliedPressure,
    drivingPressure,
    canDesalinate: drivingPressure > 0,
  };
}
```

---

## 6. Non-Ideal Solutions

### 6.1 Osmotic Coefficient

For real solutions, introduce the osmotic coefficient φ:
```
Π = φ × i × M × R × T
```

where φ ≈ 1 for dilute solutions, but deviates at high concentrations.

### 6.2 Relationship to Activity Coefficient

```
ln(a_solvent) = -φ × M × V_m / 1000
```

where a_solvent is the solvent activity.

---

## 7. TDD Validation Data

### 7.1 Basic Osmotic Pressure Tests

```typescript
describe('OsmoticPressure', () => {
  it('should give Π ≈ 2.48 atm for 0.1 M glucose at 25°C', () => {
    // 0.1 mol glucose in 1 L water
    const solution = createComposition({ 'H2O': 55.5, 'glucose': 0.1 });
    const result = calculateOsmoticPressure(
      { solution, solventId: 'H2O', temperature: 298.15 },
      registry
    );

    // Π = 0.1 × 8.314 × 298.15 = 248 kPa ≈ 2.45 atm
    expect(result.osmoticPressureAtm).toBeCloseTo(2.45, 1);
  });

  it('should give Π ≈ 4.9 atm for 0.1 M NaCl (i=2) at 25°C', () => {
    const solution = createComposition({ 'H2O': 55.5, 'NaCl': 0.1 });
    const result = calculateOsmoticPressure(
      { solution, solventId: 'H2O', temperature: 298.15 },
      registry
    );

    // Π = 2 × 0.1 × 8.314 × 298.15 ≈ 4.9 atm
    expect(result.osmoticPressureAtm).toBeCloseTo(4.9, 0);
  });

  it('should increase with temperature', () => {
    const solution = createComposition({ 'H2O': 55.5, 'glucose': 0.1 });

    const result25 = calculateOsmoticPressure(
      { solution, solventId: 'H2O', temperature: 298.15 },
      registry
    );

    const result50 = calculateOsmoticPressure(
      { solution, solventId: 'H2O', temperature: 323.15 },
      registry
    );

    expect(result50.osmoticPressure).toBeGreaterThan(result25.osmoticPressure);
  });
});
```

### 7.2 Osmotic Difference Tests

```typescript
describe('OsmoticDifference', () => {
  it('should predict flow from dilute to concentrated', () => {
    const dilute = createComposition({ 'H2O': 55.5, 'NaCl': 0.05 });
    const concentrated = createComposition({ 'H2O': 55.5, 'NaCl': 0.2 });

    const result = calculateOsmoticDifference({
      solution1: dilute,
      solution2: concentrated,
      solventId: 'H2O',
      temperature: 298.15,
    }, registry);

    expect(result.flowDirection).toBe('1→2');
    expect(result.Pi2).toBeGreaterThan(result.Pi1);
  });

  it('should show no flow for isotonic solutions', () => {
    const solution1 = createComposition({ 'H2O': 55.5, 'NaCl': 0.1 });
    const solution2 = createComposition({ 'H2O': 55.5, 'glucose': 0.2 });  // Same osmolarity

    const result = calculateOsmoticDifference({
      solution1,
      solution2,
      solventId: 'H2O',
      temperature: 298.15,
    }, registry);

    expect(result.flowDirection).toBe('none');
  });
});
```

---

## 8. Interaction Points

- **[03_Composition_System.md](03_Composition_System.md)**: Solution composition
- **[04_Volume_System.md](04_Volume_System.md)**: Solution volume for molarity
- **[13_Colligative_Properties.md](13_Colligative_Properties.md)**: Related colligative effects
- **[17_Container_Model.md](17_Container_Model.md)**: Osmotic pressure as property
