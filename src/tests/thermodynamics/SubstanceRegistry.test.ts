/**
 * SubstanceRegistry Tests
 *
 * TDD tests for the OCP-compliant substance registry.
 * Tests are derived from design doc: docs/thermodynamics/02_Substance_Model.md
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { SubstanceRegistry } from '../../core/thermodynamics/registry/SubstanceRegistry';
import type { Substance } from '../../core/thermodynamics/types';

// Test substances
const WATER: Substance = {
  id: 'H2O',
  name: 'Water',
  formula: 'H₂O',
  molarMass: 18.01528,
  casNumber: '7732-18-5',
};

const ETHANOL: Substance = {
  id: 'C2H5OH',
  name: 'Ethanol',
  formula: 'C₂H₅OH',
  molarMass: 46.06844,
  casNumber: '64-17-5',
};

describe('SubstanceRegistry', () => {
  let registry: SubstanceRegistry;

  beforeEach(() => {
    registry = new SubstanceRegistry();
  });

  describe('register', () => {
    it('should register a new substance', () => {
      registry.register(WATER);

      expect(registry.has('H2O')).toBe(true);
    });

    it('should throw when registering duplicate ID', () => {
      registry.register(WATER);

      expect(() => registry.register(WATER)).toThrow('Substance H2O already registered');
    });

    it('should allow registering multiple substances', () => {
      registry.register(WATER);
      registry.register(ETHANOL);

      expect(registry.has('H2O')).toBe(true);
      expect(registry.has('C2H5OH')).toBe(true);
    });
  });

  describe('get', () => {
    it('should return registered substance', () => {
      registry.register(WATER);

      const result = registry.get('H2O');

      expect(result).toBe(WATER);
    });

    it('should return undefined for unregistered substance', () => {
      const result = registry.get('UNKNOWN');

      expect(result).toBeUndefined();
    });
  });

  describe('getRequired', () => {
    it('should return registered substance', () => {
      registry.register(WATER);

      const result = registry.getRequired('H2O');

      expect(result).toBe(WATER);
    });

    it('should throw for unregistered substance', () => {
      expect(() => registry.getRequired('UNKNOWN')).toThrow('Substance UNKNOWN not found');
    });
  });

  describe('has', () => {
    it('should return true for registered substance', () => {
      registry.register(WATER);

      expect(registry.has('H2O')).toBe(true);
    });

    it('should return false for unregistered substance', () => {
      expect(registry.has('UNKNOWN')).toBe(false);
    });
  });

  describe('list', () => {
    it('should return empty array for empty registry', () => {
      expect(registry.list()).toEqual([]);
    });

    it('should return all registered IDs', () => {
      registry.register(WATER);
      registry.register(ETHANOL);

      const ids = registry.list();

      expect(ids).toContain('H2O');
      expect(ids).toContain('C2H5OH');
      expect(ids.length).toBe(2);
    });
  });

  describe('getAll', () => {
    it('should return empty array for empty registry', () => {
      expect(registry.getAll()).toEqual([]);
    });

    it('should return all registered substances', () => {
      registry.register(WATER);
      registry.register(ETHANOL);

      const substances = registry.getAll();

      expect(substances).toContain(WATER);
      expect(substances).toContain(ETHANOL);
      expect(substances.length).toBe(2);
    });
  });

  describe('getMolarMasses', () => {
    it('should return molar mass lookup object', () => {
      registry.register(WATER);
      registry.register(ETHANOL);

      const masses = registry.getMolarMasses();

      expect(masses['H2O']).toBe(18.01528);
      expect(masses['C2H5OH']).toBe(46.06844);
    });
  });

  describe('clear', () => {
    it('should remove all substances', () => {
      registry.register(WATER);
      registry.register(ETHANOL);

      registry.clear();

      expect(registry.list()).toEqual([]);
      expect(registry.has('H2O')).toBe(false);
    });
  });

  describe('registerAll', () => {
    it('should register multiple substances at once', () => {
      registry.registerAll([WATER, ETHANOL]);

      expect(registry.has('H2O')).toBe(true);
      expect(registry.has('C2H5OH')).toBe(true);
    });

    it('should throw on duplicate in batch', () => {
      registry.register(WATER);

      expect(() => registry.registerAll([ETHANOL, WATER])).toThrow('already registered');
    });
  });

  describe('OCP extension', () => {
    it('should allow runtime registration without modification', () => {
      // Initial registry
      const initialRegistry = new SubstanceRegistry();
      initialRegistry.register(WATER);

      // Extension point: register new substance at runtime
      const newSubstance: Substance = {
        id: 'NaCl',
        name: 'Sodium Chloride',
        formula: 'NaCl',
        molarMass: 58.4428,
      };
      initialRegistry.register(newSubstance);

      // New substance is available
      expect(initialRegistry.has('NaCl')).toBe(true);
      expect(initialRegistry.getRequired('NaCl').name).toBe('Sodium Chloride');
    });
  });
});
