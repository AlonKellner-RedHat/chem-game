/**
 * Composition System
 *
 * Mole-based composition tracking that serves as the foundation
 * for all thermodynamic calculations.
 *
 * Design: docs/thermodynamics/03_Composition_System.md
 */

/**
 * Unique identifier for a substance.
 * Typically the chemical formula (e.g., 'H2O', 'C2H5OH').
 */
export type SubstanceId = string;

/**
 * Minimum mole threshold for numerical stability.
 * Values below this are treated as zero (~600 molecules).
 */
export const MIN_MOLES = 1e-15;

/**
 * Immutable composition representing moles of each substance.
 *
 * All operations return new Composition objects.
 * The moles map is readonly to prevent accidental mutation.
 */
export interface Composition {
  /**
   * Moles of each substance, keyed by substance ID.
   * Values must be non-negative.
   * Missing keys imply zero moles.
   */
  readonly moles: ReadonlyMap<SubstanceId, number>;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a composition from a record of moles.
 * @param moles - Record of substance ID to moles
 * @returns New Composition object
 */
export function createComposition(moles: Record<SubstanceId, number>): Composition {
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
export function emptyComposition(): Composition {
  return { moles: new Map() };
}

/**
 * Create a pure composition (single substance).
 * @param id - Substance ID
 * @param moles - Amount in moles
 */
export function pureComposition(id: SubstanceId, moles: number): Composition {
  if (moles < MIN_MOLES) {
    return emptyComposition();
  }
  return { moles: new Map([[id, moles]]) };
}

// ============================================================================
// Derived Quantities
// ============================================================================

/**
 * Calculate total moles in composition.
 * @param comp - The composition
 * @returns Total moles (sum of all components)
 */
export function getTotalMoles(comp: Composition): number {
  let total = 0;
  for (const moles of comp.moles.values()) {
    total += moles;
  }
  return total;
}

/**
 * Calculate mole fraction of a specific substance.
 * @param comp - The composition
 * @param id - Substance ID
 * @returns Mole fraction (0 to 1)
 */
export function getMoleFraction(comp: Composition, id: SubstanceId): number {
  const total = getTotalMoles(comp);
  if (total === 0) return 0;
  return (comp.moles.get(id) ?? 0) / total;
}

/**
 * Calculate all mole fractions.
 * @param comp - The composition
 * @returns Map of substance ID to mole fraction
 */
export function getMoleFractions(comp: Composition): Map<SubstanceId, number> {
  const total = getTotalMoles(comp);
  const fractions = new Map<SubstanceId, number>();

  if (total === 0) return fractions;

  for (const [id, moles] of comp.moles) {
    fractions.set(id, moles / total);
  }
  return fractions;
}

/**
 * Calculate total mass from composition.
 * @param comp - The composition
 * @param molarMasses - Record of substance ID to molar mass (g/mol)
 * @returns Total mass in grams
 */
export function getTotalMass(comp: Composition, molarMasses: Record<SubstanceId, number>): number {
  let total = 0;
  for (const [id, moles] of comp.moles) {
    const molarMass = molarMasses[id];
    if (molarMass === undefined) {
      throw new Error(`Unknown substance: ${id}`);
    }
    total += moles * molarMass;
  }
  return total;
}

/**
 * Calculate mass fraction of a specific substance.
 * @param comp - The composition
 * @param id - Substance ID
 * @param molarMasses - Record of substance ID to molar mass (g/mol)
 * @returns Mass fraction (0 to 1)
 */
export function getMassFraction(
  comp: Composition,
  id: SubstanceId,
  molarMasses: Record<SubstanceId, number>
): number {
  const totalMass = getTotalMass(comp, molarMasses);
  if (totalMass === 0) return 0;

  const moles = comp.moles.get(id) ?? 0;
  const molarMass = molarMasses[id];
  if (molarMass === undefined) {
    throw new Error(`Unknown substance: ${id}`);
  }
  return (moles * molarMass) / totalMass;
}

/**
 * Calculate average molar mass of mixture.
 * @param comp - The composition
 * @param molarMasses - Record of substance ID to molar mass (g/mol)
 * @returns Average molar mass in g/mol
 */
export function getAverageMolarMass(
  comp: Composition,
  molarMasses: Record<SubstanceId, number>
): number {
  const totalMoles = getTotalMoles(comp);
  if (totalMoles === 0) return 0;

  const totalMass = getTotalMass(comp, molarMasses);
  return totalMass / totalMoles;
}

// ============================================================================
// Composition Operations
// ============================================================================

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
export function combineCompositions(a: Composition, b: Composition): Composition {
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
export function splitComposition(comp: Composition, fraction: number): [Composition, Composition] {
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
export function scaleComposition(comp: Composition, factor: number): Composition {
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

/**
 * Add moles of a substance to a composition.
 * @param comp - Original composition
 * @param id - Substance to add
 * @param molesToAdd - Moles to add (must be non-negative)
 * @returns New composition with added substance
 */
export function addSubstance(comp: Composition, id: SubstanceId, molesToAdd: number): Composition {
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
export function removeSubstance(
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

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Check if composition is empty (no substances).
 */
export function isEmpty(comp: Composition): boolean {
  return comp.moles.size === 0;
}

/**
 * Check if composition is pure (single substance).
 */
export function isPure(comp: Composition): boolean {
  return comp.moles.size === 1;
}

/**
 * Check if composition contains a substance.
 */
export function contains(comp: Composition, id: SubstanceId): boolean {
  return (comp.moles.get(id) ?? 0) >= MIN_MOLES;
}

/**
 * Get the number of components.
 */
export function componentCount(comp: Composition): number {
  return comp.moles.size;
}

/**
 * Get list of substance IDs.
 */
export function getSubstanceIds(comp: Composition): SubstanceId[] {
  return Array.from(comp.moles.keys());
}

/**
 * Check if two compositions are equal (within tolerance).
 */
export function compositionsEqual(
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

/**
 * Validate a composition.
 * @throws Error if any value is negative or non-finite
 */
export function validateComposition(comp: Composition): void {
  for (const [id, moles] of comp.moles) {
    if (!Number.isFinite(moles)) {
      throw new Error(`Invalid moles for ${id}: ${moles}`);
    }
    if (moles < 0) {
      throw new Error(`Negative moles for ${id}: ${moles}`);
    }
  }
}
