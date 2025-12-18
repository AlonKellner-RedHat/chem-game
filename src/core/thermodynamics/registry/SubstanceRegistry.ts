/**
 * SubstanceRegistry
 *
 * OCP-compliant registry for substance data.
 * Open for extension: new substances can be registered at runtime.
 *
 * Design: docs/thermodynamics/02_Substance_Model.md
 */

import type { Substance, SubstanceId } from '../types';

/**
 * Registry for substance data.
 *
 * Follows the Open/Closed Principle:
 * - Closed for modification: core registry logic doesn't change
 * - Open for extension: new substances registered at runtime
 */
export class SubstanceRegistry {
  private substances: Map<SubstanceId, Substance> = new Map();

  /**
   * Register a new substance.
   * @throws Error if substance with same ID already exists
   */
  register(substance: Substance): void {
    if (this.substances.has(substance.id)) {
      throw new Error(`Substance ${substance.id} already registered`);
    }
    this.substances.set(substance.id, substance);
  }

  /**
   * Register multiple substances at once.
   * @throws Error if any substance ID already exists
   */
  registerAll(substances: Substance[]): void {
    for (const substance of substances) {
      this.register(substance);
    }
  }

  /**
   * Get substance by ID.
   * @returns Substance or undefined if not found
   */
  get(id: SubstanceId): Substance | undefined {
    return this.substances.get(id);
  }

  /**
   * Get substance or throw if not found.
   * @throws Error if substance not found
   */
  getRequired(id: SubstanceId): Substance {
    const substance = this.substances.get(id);
    if (!substance) {
      throw new Error(`Substance ${id} not found`);
    }
    return substance;
  }

  /**
   * Check if a substance is registered.
   */
  has(id: SubstanceId): boolean {
    return this.substances.has(id);
  }

  /**
   * List all registered substance IDs.
   */
  list(): SubstanceId[] {
    return Array.from(this.substances.keys());
  }

  /**
   * Get all registered substances.
   */
  getAll(): Substance[] {
    return Array.from(this.substances.values());
  }

  /**
   * Get molar masses as a lookup object.
   * Useful for composition mass calculations.
   */
  getMolarMasses(): Record<SubstanceId, number> {
    const masses: Record<SubstanceId, number> = {};
    for (const [id, substance] of this.substances) {
      masses[id] = substance.molarMass;
    }
    return masses;
  }

  /**
   * Clear all registered substances.
   * Primarily for testing.
   */
  clear(): void {
    this.substances.clear();
  }

  /**
   * Get the number of registered substances.
   */
  get size(): number {
    return this.substances.size;
  }
}

/**
 * Default global substance registry instance.
 * Can be replaced or extended as needed.
 */
export const defaultSubstanceRegistry = new SubstanceRegistry();
