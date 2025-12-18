# Composition System

## Overview

This document defines the mole-based composition tracking system that serves as the foundation for all thermodynamic calculations. Composition is the "what's in the container" abstraction.

---

## 1. First Principles

### 1.1 The Mole Concept

**Definition**: A mole is the amount of substance containing exactly 6.02214076 × 10²³ elementary entities (Avogadro's number).

**Why the mole?**
- Directly relates to number of molecules
- Chemical reactions occur in molar ratios (stoichiometry)
- Thermodynamic properties are typically expressed per mole
- Conserved quantity (in absence of reactions)

**Reference**: SI definition, BIPM 2019

### 1.2 Why Moles (Not Mass or Volume)

| Basis | Pros | Cons | Use Case |
|-------|------|------|----------|
| **Moles** | Molecular counting, reaction stoichiometry | Requires molar mass lookup | Thermodynamics |
| **Mass** | Easy to measure, always conserved | Different molecules per gram | Engineering |
| **Volume** | Easy to measure liquids | Changes with T, P, mixing | Practical handling |

**This system uses moles as the fundamental quantity.** Mass and volume are derived.

### 1.3 Conservation Laws

**Conservation of Moles** (closed system, no reactions):
```
Σ n_i(t) = Σ n_i(0) = constant
```

**Conservation of Mass** (always):
```
Σ n_i × M_i = constant
```

where M_i is the molar mass of component i.

**Implications**:
- Mixing two compositions conserves total moles
- Splitting a composition divides moles proportionally
- Volume is NOT conserved (non-ideal mixing)

---

## 2. Core Data Structures

### 2.1 Substance Identifier

```typescript
/**
 * Unique identifier for a substance.
 * Typically the chemical formula (e.g., 'H2O', 'C2H5OH').
 * Must match the id in SubstanceRegistry.
 */
type SubstanceId = string;
```

### 2.2 Composition Interface

```typescript
/**
 * Immutable composition representing moles of each substance.
 *
 * All operations return new Composition objects.
 * The moles map is readonly to prevent accidental mutation.
 */
interface Composition {
  /**
   * Moles of each substance, keyed by substance ID.
   * Values must be non-negative.
   * Missing keys imply zero moles.
   */
  readonly moles: ReadonlyMap<SubstanceId, number>;
}
```

### 2.3 Validation Rules

```typescript
/**
 * Minimum mole threshold for numerical stability.
 * Values below this are treated as zero.
 */
const MIN_MOLES = 1e-15;  // ~600 molecules

/**
 * Validate a composition.
 * @throws Error if any value is negative or non-finite
 */
function validateComposition(comp: Composition): void {
  for (const [id, moles] of comp.moles) {
    if (!Number.isFinite(moles)) {
      throw new Error(`Invalid moles for ${id}: ${moles}`);
    }
    if (moles < 0) {
      throw new Error(`Negative moles for ${id}: ${moles}`);
    }
  }
}
```

---

## 3. Derived Quantities

### 3.1 Total Moles

**Definition**:
```
n_total = Σ n_i
```

**Implementation**:
```typescript
/**
 * Calculate total moles in composition.
 * @param comp - The composition
 * @returns Total moles (sum of all components)
 */
function getTotalMoles(comp: Composition): number {
  let total = 0;
  for (const moles of comp.moles.values()) {
    total += moles;
  }
  return total;
}
```

### 3.2 Mole Fraction

**Definition**:
```
x_i = n_i / n_total
```

**Properties**:
- 0 ≤ x_i ≤ 1
- Σ x_i = 1 (for non-empty composition)

**Implementation**:
```typescript
/**
 * Calculate mole fraction of a specific substance.
 * @param comp - The composition
 * @param id - Substance ID
 * @returns Mole fraction (0 to 1)
 */
function getMoleFraction(comp: Composition, id: SubstanceId): number {
  const total = getTotalMoles(comp);
  if (total === 0) return 0;
  return (comp.moles.get(id) ?? 0) / total;
}

/**
 * Calculate all mole fractions.
 * @param comp - The composition
 * @returns Map of substance ID to mole fraction
 */
function getMoleFractions(comp: Composition): Map<SubstanceId, number> {
  const total = getTotalMoles(comp);
  const fractions = new Map<SubstanceId, number>();

  if (total === 0) return fractions;

  for (const [id, moles] of comp.moles) {
    fractions.set(id, moles / total);
  }
  return fractions;
}
```

### 3.3 Mass Fraction

**Definition**:
```
w_i = (n_i × M_i) / Σ(n_j × M_j)
```

**Derivation**:
```
w_i = m_i / m_total
    = (n_i × M_i) / Σ(n_j × M_j)
    = (x_i × M_i) / Σ(x_j × M_j)
    = (x_i × M_i) / M_avg
```

**Implementation**:
```typescript
/**
 * Calculate mass fraction of a specific substance.
 * @param comp - The composition
 * @param id - Substance ID
 * @param registry - Substance registry for molar masses
 * @returns Mass fraction (0 to 1)
 */
function getMassFraction(
  comp: Composition,
  id: SubstanceId,
  registry: SubstanceRegistry
): number {
  const totalMass = getTotalMass(comp, registry);
  if (totalMass === 0) return 0;

  const moles = comp.moles.get(id) ?? 0;
  const substance = registry.getRequired(id);
  return (moles * substance.molarMass) / totalMass;
}

/**
 * Calculate total mass from composition.
 * @param comp - The composition
 * @param registry - Substance registry for molar masses
 * @returns Total mass in grams
 */
function getTotalMass(comp: Composition, registry: SubstanceRegistry): number {
  let total = 0;
  for (const [id, moles] of comp.moles) {
    const substance = registry.getRequired(id);
    total += moles * substance.molarMass;
  }
  return total;
}
```

### 3.4 Average Molar Mass

**Definition**:
```
M_avg = Σ(x_i × M_i) = m_total / n_total
```

**Implementation**:
```typescript
/**
 * Calculate average molar mass of mixture.
 * @param comp - The composition
 * @param registry - Substance registry for molar masses
 * @returns Average molar mass in g/mol
 */
function getAverageMolarMass(
  comp: Composition,
  registry: SubstanceRegistry
): number {
  const totalMoles = getTotalMoles(comp);
  if (totalMoles === 0) return 0;

  const totalMass = getTotalMass(comp, registry);
  return totalMass / totalMoles;
}
```

### 3.5 Volume Fraction (Ideal)

**Definition** (for ideal mixing):
```
φ_i = (n_i × V_i*) / Σ(n_j × V_j*)
```

where V_i* is the molar volume of pure component i.

**Note**: For real mixtures, use the Volume System which accounts for excess volume.

```typescript
/**
 * Calculate ideal volume fraction (assumes ideal mixing).
 * For real volume fractions, use VolumeSystem.
 * @param comp - The composition
 * @param id - Substance ID
 * @param registry - Substance registry for molar volumes
 * @returns Ideal volume fraction (0 to 1)
 */
function getIdealVolumeFraction(
  comp: Composition,
  id: SubstanceId,
  registry: SubstanceRegistry
): number {
  const idealVolume = getIdealVolume(comp, registry);
  if (idealVolume === 0) return 0;

  const moles = comp.moles.get(id) ?? 0;
  const substance = registry.getRequired(id);
  return (moles * substance.molarVolumeLiquid) / idealVolume;
}

/**
 * Calculate ideal total volume (sum of pure component volumes).
 * @param comp - The composition
 * @param registry - Substance registry for molar volumes
 * @returns Ideal volume in liters
 */
function getIdealVolume(comp: Composition, registry: SubstanceRegistry): number {
  let total = 0;
  for (const [id, moles] of comp.moles) {
    const substance = registry.getRequired(id);
    total += moles * substance.molarVolumeLiquid;
  }
  return total;
}
```

**Proof that Σ x_i = 1**:
```
Σ x_i = Σ (n_i / n_total)
      = (1/n_total) × Σ n_i
      = (1/n_total) × n_total
      = 1  ∎
```

---

## 4. Composition Operations

### 4.1 Create Composition

```typescript
/**
 * Create a composition from a record of moles.
 * @param moles - Record of substance ID to moles
 * @returns New Composition object
 */
function createComposition(moles: Record<SubstanceId, number>): Composition {
  const map = new Map<SubstanceId, number>();
  for (const [id, n] of Object.entries(moles)) {
    if (n >= MIN_MOLES) {
      map.set(id, n);
    }
  }
  return { moles: map };
}

/**
 * Create an empty composition.
 */
function emptyComposition(): Composition {
  return { moles: new Map() };
}

/**
 * Create a pure composition (single substance).
 * @param id - Substance ID
 * @param moles - Amount in moles
 */
function pureComposition(id: SubstanceId, moles: number): Composition {
  if (moles < MIN_MOLES) {
    return emptyComposition();
  }
  return { moles: new Map([[id, moles]]) };
}
```

### 4.2 Combine (Mixing)

**Physical meaning**: Pour two solutions together.

**Conservation**: Total moles of each component are conserved.

```typescript
/**
 * Combine two compositions (mixing).
 * Total moles of each component are conserved.
 *
 * @param a - First composition
 * @param b - Second composition
 * @returns Combined composition
 *
 * @example
 * const water = pureComposition('H2O', 1.0);
 * const ethanol = pureComposition('C2H5OH', 0.5);
 * const mixture = combineCompositions(water, ethanol);
 * // mixture.moles = { H2O: 1.0, C2H5OH: 0.5 }
 */
function combineCompositions(a: Composition, b: Composition): Composition {
  const combined = new Map<SubstanceId, number>(a.moles);

  for (const [id, moles] of b.moles) {
    const existing = combined.get(id) ?? 0;
    const total = existing + moles;
    if (total >= MIN_MOLES) {
      combined.set(id, total);
    }
  }

  return { moles: combined };
}

/**
 * Combine multiple compositions.
 */
function combineAll(compositions: Composition[]): Composition {
  return compositions.reduce(combineCompositions, emptyComposition());
}
```

### 4.3 Split (Separation)

**Physical meaning**: Divide a solution into portions.

**Conservation**: Each component is divided by the same fraction.

```typescript
/**
 * Split a composition into a fraction.
 * All components are reduced by the same fraction.
 *
 * @param comp - Original composition
 * @param fraction - Fraction to extract (0 to 1)
 * @returns [extracted, remaining] compositions
 *
 * @example
 * const original = createComposition({ H2O: 2.0, C2H5OH: 1.0 });
 * const [half, other] = splitComposition(original, 0.5);
 * // half.moles = { H2O: 1.0, C2H5OH: 0.5 }
 * // other.moles = { H2O: 1.0, C2H5OH: 0.5 }
 */
function splitComposition(
  comp: Composition,
  fraction: number
): [Composition, Composition] {
  if (fraction <= 0) {
    return [emptyComposition(), comp];
  }
  if (fraction >= 1) {
    return [comp, emptyComposition()];
  }

  const extracted = new Map<SubstanceId, number>();
  const remaining = new Map<SubstanceId, number>();

  for (const [id, moles] of comp.moles) {
    const extractedMoles = moles * fraction;
    const remainingMoles = moles * (1 - fraction);

    if (extractedMoles >= MIN_MOLES) {
      extracted.set(id, extractedMoles);
    }
    if (remainingMoles >= MIN_MOLES) {
      remaining.set(id, remainingMoles);
    }
  }

  return [{ moles: extracted }, { moles: remaining }];
}
```

### 4.4 Scale (Dilution/Concentration)

**Physical meaning**: Add/remove proportional amounts of all components.

```typescript
/**
 * Scale a composition by a factor.
 * All component moles are multiplied by the factor.
 *
 * @param comp - Original composition
 * @param factor - Scaling factor (>0)
 * @returns Scaled composition
 *
 * @example
 * const original = createComposition({ H2O: 1.0, C2H5OH: 0.5 });
 * const doubled = scaleComposition(original, 2.0);
 * // doubled.moles = { H2O: 2.0, C2H5OH: 1.0 }
 */
function scaleComposition(comp: Composition, factor: number): Composition {
  if (factor <= 0) {
    throw new Error(`Scale factor must be positive: ${factor}`);
  }

  const scaled = new Map<SubstanceId, number>();
  for (const [id, moles] of comp.moles) {
    const newMoles = moles * factor;
    if (newMoles >= MIN_MOLES) {
      scaled.set(id, newMoles);
    }
  }

  return { moles: scaled };
}
```

### 4.5 Add/Remove Component

```typescript
/**
 * Add moles of a substance to a composition.
 * @param comp - Original composition
 * @param id - Substance to add
 * @param molesToAdd - Moles to add (must be non-negative)
 * @returns New composition with added substance
 */
function addSubstance(
  comp: Composition,
  id: SubstanceId,
  molesToAdd: number
): Composition {
  if (molesToAdd < 0) {
    throw new Error(`Cannot add negative moles: ${molesToAdd}`);
  }

  const newMoles = new Map(comp.moles);
  const existing = newMoles.get(id) ?? 0;
  const total = existing + molesToAdd;

  if (total >= MIN_MOLES) {
    newMoles.set(id, total);
  }

  return { moles: newMoles };
}

/**
 * Remove moles of a substance from a composition.
 * @param comp - Original composition
 * @param id - Substance to remove
 * @param molesToRemove - Moles to remove (must be non-negative)
 * @returns New composition with reduced substance
 * @throws Error if trying to remove more than available
 */
function removeSubstance(
  comp: Composition,
  id: SubstanceId,
  molesToRemove: number
): Composition {
  if (molesToRemove < 0) {
    throw new Error(`Cannot remove negative moles: ${molesToRemove}`);
  }

  const existing = comp.moles.get(id) ?? 0;
  if (molesToRemove > existing + MIN_MOLES) {
    throw new Error(`Cannot remove ${molesToRemove} mol of ${id}, only ${existing} available`);
  }

  const newMoles = new Map(comp.moles);
  const remaining = existing - molesToRemove;

  if (remaining >= MIN_MOLES) {
    newMoles.set(id, remaining);
  } else {
    newMoles.delete(id);
  }

  return { moles: newMoles };
}
```

---

## 5. Composition Queries

### 5.1 Component Checks

```typescript
/**
 * Check if composition is empty (no substances).
 */
function isEmpty(comp: Composition): boolean {
  return comp.moles.size === 0;
}

/**
 * Check if composition is pure (single substance).
 */
function isPure(comp: Composition): boolean {
  return comp.moles.size === 1;
}

/**
 * Check if composition contains a substance.
 */
function contains(comp: Composition, id: SubstanceId): boolean {
  return (comp.moles.get(id) ?? 0) >= MIN_MOLES;
}

/**
 * Get the number of components.
 */
function componentCount(comp: Composition): number {
  return comp.moles.size;
}

/**
 * Get list of substance IDs.
 */
function getSubstanceIds(comp: Composition): SubstanceId[] {
  return Array.from(comp.moles.keys());
}
```

### 5.2 Comparison

```typescript
/**
 * Check if two compositions are equal (within tolerance).
 */
function compositionsEqual(
  a: Composition,
  b: Composition,
  tolerance: number = MIN_MOLES
): boolean {
  // Check same components
  const aIds = new Set(a.moles.keys());
  const bIds = new Set(b.moles.keys());

  if (aIds.size !== bIds.size) return false;

  for (const id of aIds) {
    if (!bIds.has(id)) return false;

    const aMoles = a.moles.get(id) ?? 0;
    const bMoles = b.moles.get(id) ?? 0;

    if (Math.abs(aMoles - bMoles) > tolerance) {
      return false;
    }
  }

  return true;
}
```

---

## 6. Numerical Considerations

### 6.1 Minimum Threshold

The `MIN_MOLES` threshold (10⁻¹⁵ mol ≈ 600 molecules) prevents:
- Division by zero in fraction calculations
- Accumulation of floating-point errors
- Spurious "trace" amounts from numerical operations

### 6.2 Normalization

When mole fractions are needed, they are computed on-demand rather than stored:

```typescript
// DON'T store normalized values
interface BadComposition {
  moles: Map<SubstanceId, number>;
  fractions: Map<SubstanceId, number>;  // Can get out of sync!
}

// DO compute on demand
function getMoleFraction(comp: Composition, id: SubstanceId): number {
  const total = getTotalMoles(comp);
  if (total === 0) return 0;
  return (comp.moles.get(id) ?? 0) / total;
}
```

### 6.3 Floating Point Precision

For most thermodynamic calculations, 64-bit floating point is sufficient:
- Relative precision: ~10⁻¹⁶
- Minimum representable moles: ~10⁻³⁰⁸ (far below MIN_MOLES)

---

## 7. TDD Test Cases

### 7.1 Conservation Tests

```typescript
describe('combineCompositions', () => {
  it('should conserve total moles of each component', () => {
    const a = createComposition({ H2O: 1.0, C2H5OH: 0.5 });
    const b = createComposition({ H2O: 0.5, NaCl: 0.1 });

    const combined = combineCompositions(a, b);

    expect(combined.moles.get('H2O')).toBeCloseTo(1.5, 10);
    expect(combined.moles.get('C2H5OH')).toBeCloseTo(0.5, 10);
    expect(combined.moles.get('NaCl')).toBeCloseTo(0.1, 10);
  });

  it('should conserve total moles', () => {
    const a = createComposition({ H2O: 1.0, C2H5OH: 0.5 });
    const b = createComposition({ H2O: 0.5, NaCl: 0.1 });

    const totalBefore = getTotalMoles(a) + getTotalMoles(b);
    const combined = combineCompositions(a, b);
    const totalAfter = getTotalMoles(combined);

    expect(totalAfter).toBeCloseTo(totalBefore, 10);
  });
});

describe('splitComposition', () => {
  it('should conserve moles across split', () => {
    const original = createComposition({ H2O: 2.0, C2H5OH: 1.0 });
    const [extracted, remaining] = splitComposition(original, 0.3);

    const recombined = combineCompositions(extracted, remaining);

    expect(compositionsEqual(original, recombined)).toBe(true);
  });
});
```

### 7.2 Fraction Sum Test

```typescript
describe('getMoleFractions', () => {
  it('should sum to 1.0 for non-empty composition', () => {
    const comp = createComposition({ H2O: 1.0, C2H5OH: 0.5, NaCl: 0.1 });
    const fractions = getMoleFractions(comp);

    let sum = 0;
    for (const x of fractions.values()) {
      sum += x;
    }

    expect(sum).toBeCloseTo(1.0, 10);
  });

  it('should return empty map for empty composition', () => {
    const comp = emptyComposition();
    const fractions = getMoleFractions(comp);

    expect(fractions.size).toBe(0);
  });
});
```

### 7.3 Edge Cases

```typescript
describe('edge cases', () => {
  it('should handle empty composition', () => {
    const empty = emptyComposition();

    expect(getTotalMoles(empty)).toBe(0);
    expect(isEmpty(empty)).toBe(true);
    expect(getMoleFraction(empty, 'H2O')).toBe(0);
  });

  it('should handle pure composition', () => {
    const pure = pureComposition('H2O', 1.0);

    expect(isPure(pure)).toBe(true);
    expect(getMoleFraction(pure, 'H2O')).toBe(1.0);
  });

  it('should filter out values below MIN_MOLES', () => {
    const comp = createComposition({ H2O: 1.0, trace: 1e-20 });

    expect(contains(comp, 'trace')).toBe(false);
    expect(componentCount(comp)).toBe(1);
  });

  it('should throw on negative moles', () => {
    expect(() => addSubstance(emptyComposition(), 'H2O', -1))
      .toThrow('Cannot add negative moles');
  });

  it('should throw when removing more than available', () => {
    const comp = pureComposition('H2O', 1.0);

    expect(() => removeSubstance(comp, 'H2O', 2.0))
      .toThrow('Cannot remove');
  });
});
```

---

## 8. Interaction Points

- **[02_Substance_Model.md](02_Substance_Model.md)**: Uses SubstanceId, needs molar mass for mass fractions
- **[04_Volume_System.md](04_Volume_System.md)**: Input for volume calculations
- **[05_Pressure_System.md](05_Pressure_System.md)**: Input for pressure calculations
- **[17_Container_Model.md](17_Container_Model.md)**: Container holds a Composition
