/**
 * Composition System Tests
 *
 * TDD tests for mole-based composition tracking.
 * Tests are derived from design doc: docs/thermodynamics/03_Composition_System.md
 */

import { describe, expect, it } from 'vitest';
import {
  addSubstance,
  combineCompositions,
  componentCount,
  compositionsEqual,
  contains,
  createComposition,
  emptyComposition,
  getAverageMolarMass,
  getMassFraction,
  getMoleFraction,
  getMoleFractions,
  getSubstanceIds,
  getTotalMass,
  getTotalMoles,
  isEmpty,
  isPure,
  MIN_MOLES,
  pureComposition,
  removeSubstance,
  scaleComposition,
  splitComposition,
} from '../../core/thermodynamics/types/Composition';

// Mock substance data for mass calculations
const MOLAR_MASSES: Record<string, number> = {
  H2O: 18.01528,
  C2H5OH: 46.06844,
  NaCl: 58.4428,
};

describe('Composition', () => {
  describe('createComposition', () => {
    it('should create composition from record', () => {
      const comp = createComposition({ H2O: 1.0, C2H5OH: 0.5 });

      expect(comp.moles.get('H2O')).toBe(1.0);
      expect(comp.moles.get('C2H5OH')).toBe(0.5);
    });

    it('should filter out values below MIN_MOLES', () => {
      const comp = createComposition({ H2O: 1.0, trace: 1e-20 });

      expect(contains(comp, 'trace')).toBe(false);
      expect(componentCount(comp)).toBe(1);
    });
  });

  describe('emptyComposition', () => {
    it('should create empty composition', () => {
      const empty = emptyComposition();

      expect(getTotalMoles(empty)).toBe(0);
      expect(isEmpty(empty)).toBe(true);
      expect(getMoleFraction(empty, 'H2O')).toBe(0);
    });
  });

  describe('pureComposition', () => {
    it('should create pure composition', () => {
      const pure = pureComposition('H2O', 1.0);

      expect(isPure(pure)).toBe(true);
      expect(getMoleFraction(pure, 'H2O')).toBe(1.0);
    });

    it('should return empty if moles below threshold', () => {
      const pure = pureComposition('H2O', 1e-20);

      expect(isEmpty(pure)).toBe(true);
    });
  });

  describe('getTotalMoles', () => {
    it('should sum all component moles', () => {
      const comp = createComposition({ H2O: 1.0, C2H5OH: 0.5, NaCl: 0.1 });

      expect(getTotalMoles(comp)).toBeCloseTo(1.6, 10);
    });

    it('should return 0 for empty composition', () => {
      expect(getTotalMoles(emptyComposition())).toBe(0);
    });
  });

  describe('getMoleFraction', () => {
    it('should calculate correct mole fraction', () => {
      const comp = createComposition({ H2O: 1.0, C2H5OH: 1.0 });

      expect(getMoleFraction(comp, 'H2O')).toBeCloseTo(0.5, 10);
      expect(getMoleFraction(comp, 'C2H5OH')).toBeCloseTo(0.5, 10);
    });

    it('should return 0 for missing component', () => {
      const comp = createComposition({ H2O: 1.0 });

      expect(getMoleFraction(comp, 'NaCl')).toBe(0);
    });
  });

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

    it('should split proportionally', () => {
      const original = createComposition({ H2O: 2.0, C2H5OH: 1.0 });
      const [half, other] = splitComposition(original, 0.5);

      expect(half.moles.get('H2O')).toBeCloseTo(1.0, 10);
      expect(half.moles.get('C2H5OH')).toBeCloseTo(0.5, 10);
      expect(other.moles.get('H2O')).toBeCloseTo(1.0, 10);
      expect(other.moles.get('C2H5OH')).toBeCloseTo(0.5, 10);
    });

    it('should return original when fraction is 1', () => {
      const original = createComposition({ H2O: 1.0 });
      const [extracted, remaining] = splitComposition(original, 1.0);

      expect(compositionsEqual(extracted, original)).toBe(true);
      expect(isEmpty(remaining)).toBe(true);
    });

    it('should return empty when fraction is 0', () => {
      const original = createComposition({ H2O: 1.0 });
      const [extracted, remaining] = splitComposition(original, 0.0);

      expect(isEmpty(extracted)).toBe(true);
      expect(compositionsEqual(remaining, original)).toBe(true);
    });
  });

  describe('scaleComposition', () => {
    it('should scale all components', () => {
      const original = createComposition({ H2O: 1.0, C2H5OH: 0.5 });
      const doubled = scaleComposition(original, 2.0);

      expect(doubled.moles.get('H2O')).toBeCloseTo(2.0, 10);
      expect(doubled.moles.get('C2H5OH')).toBeCloseTo(1.0, 10);
    });

    it('should throw on negative factor', () => {
      const comp = createComposition({ H2O: 1.0 });

      expect(() => scaleComposition(comp, -1)).toThrow('Scale factor must be positive');
    });
  });

  describe('addSubstance', () => {
    it('should add to existing component', () => {
      const comp = createComposition({ H2O: 1.0 });
      const added = addSubstance(comp, 'H2O', 0.5);

      expect(added.moles.get('H2O')).toBeCloseTo(1.5, 10);
    });

    it('should add new component', () => {
      const comp = createComposition({ H2O: 1.0 });
      const added = addSubstance(comp, 'C2H5OH', 0.5);

      expect(added.moles.get('H2O')).toBeCloseTo(1.0, 10);
      expect(added.moles.get('C2H5OH')).toBeCloseTo(0.5, 10);
    });

    it('should throw on negative moles', () => {
      expect(() => addSubstance(emptyComposition(), 'H2O', -1)).toThrow(
        'Cannot add negative moles'
      );
    });
  });

  describe('removeSubstance', () => {
    it('should remove from existing component', () => {
      const comp = createComposition({ H2O: 1.0 });
      const removed = removeSubstance(comp, 'H2O', 0.3);

      expect(removed.moles.get('H2O')).toBeCloseTo(0.7, 10);
    });

    it('should remove component entirely if below threshold', () => {
      const comp = createComposition({ H2O: 1.0 });
      const removed = removeSubstance(comp, 'H2O', 1.0);

      expect(contains(removed, 'H2O')).toBe(false);
    });

    it('should throw when removing more than available', () => {
      const comp = pureComposition('H2O', 1.0);

      expect(() => removeSubstance(comp, 'H2O', 2.0)).toThrow('Cannot remove');
    });
  });

  describe('mass calculations', () => {
    it('should calculate total mass correctly', () => {
      // 1 mol H2O = 18.01528 g
      const comp = pureComposition('H2O', 1.0);
      const mass = getTotalMass(comp, MOLAR_MASSES);

      expect(mass).toBeCloseTo(18.01528, 4);
    });

    it('should calculate mass fraction correctly', () => {
      // 1 mol H2O + 1 mol C2H5OH
      // Total mass = 18.01528 + 46.06844 = 64.08372 g
      // Mass fraction H2O = 18.01528 / 64.08372 ≈ 0.281
      const comp = createComposition({ H2O: 1.0, C2H5OH: 1.0 });
      const massFraction = getMassFraction(comp, 'H2O', MOLAR_MASSES);

      expect(massFraction).toBeCloseTo(18.01528 / 64.08372, 4);
    });

    it('should calculate average molar mass correctly', () => {
      // Equal moles: M_avg = (18.01528 + 46.06844) / 2 = 32.04186
      const comp = createComposition({ H2O: 1.0, C2H5OH: 1.0 });
      const avgMass = getAverageMolarMass(comp, MOLAR_MASSES);

      expect(avgMass).toBeCloseTo(32.04186, 4);
    });
  });

  describe('query functions', () => {
    it('isEmpty should return true for empty composition', () => {
      expect(isEmpty(emptyComposition())).toBe(true);
    });

    it('isEmpty should return false for non-empty composition', () => {
      expect(isEmpty(pureComposition('H2O', 1.0))).toBe(false);
    });

    it('isPure should return true for single component', () => {
      expect(isPure(pureComposition('H2O', 1.0))).toBe(true);
    });

    it('isPure should return false for multiple components', () => {
      expect(isPure(createComposition({ H2O: 1.0, C2H5OH: 0.5 }))).toBe(false);
    });

    it('contains should find existing component', () => {
      const comp = createComposition({ H2O: 1.0 });
      expect(contains(comp, 'H2O')).toBe(true);
    });

    it('contains should not find missing component', () => {
      const comp = createComposition({ H2O: 1.0 });
      expect(contains(comp, 'NaCl')).toBe(false);
    });

    it('componentCount should return number of components', () => {
      const comp = createComposition({ H2O: 1.0, C2H5OH: 0.5, NaCl: 0.1 });
      expect(componentCount(comp)).toBe(3);
    });

    it('getSubstanceIds should return all IDs', () => {
      const comp = createComposition({ H2O: 1.0, C2H5OH: 0.5 });
      const ids = getSubstanceIds(comp);

      expect(ids).toContain('H2O');
      expect(ids).toContain('C2H5OH');
      expect(ids.length).toBe(2);
    });
  });

  describe('compositionsEqual', () => {
    it('should return true for equal compositions', () => {
      const a = createComposition({ H2O: 1.0, C2H5OH: 0.5 });
      const b = createComposition({ H2O: 1.0, C2H5OH: 0.5 });

      expect(compositionsEqual(a, b)).toBe(true);
    });

    it('should return false for different amounts', () => {
      const a = createComposition({ H2O: 1.0 });
      const b = createComposition({ H2O: 1.1 });

      expect(compositionsEqual(a, b)).toBe(false);
    });

    it('should return false for different components', () => {
      const a = createComposition({ H2O: 1.0 });
      const b = createComposition({ C2H5OH: 1.0 });

      expect(compositionsEqual(a, b)).toBe(false);
    });

    it('should handle tolerance', () => {
      const a = createComposition({ H2O: 1.0 });
      const b = createComposition({ H2O: 1.0 + 1e-12 });

      expect(compositionsEqual(a, b, 1e-10)).toBe(true);
    });
  });

  describe('numerical stability', () => {
    it('should handle MIN_MOLES threshold correctly', () => {
      // Values at exactly MIN_MOLES should be kept
      const comp = createComposition({ H2O: MIN_MOLES });
      expect(contains(comp, 'H2O')).toBe(true);

      // Values below should be filtered
      const comp2 = createComposition({ H2O: MIN_MOLES / 2 });
      expect(contains(comp2, 'H2O')).toBe(false);
    });
  });
});
