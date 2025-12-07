import { describe, it, expect, beforeEach } from 'vitest';
import { SpectralDemoState } from '../../../../src/core/demos/spectral/SpectralDemoState';
import { SolutionProperties } from '../../../../src/core/spectral/SolutionProperties';

describe('SpectralDemoState', () => {
  let state: SpectralDemoState;
  let squareProps: SolutionProperties;
  let circleProps: SolutionProperties;
  let triangleProps: SolutionProperties;

  beforeEach(() => {
    const createProps = (): SolutionProperties => ({
      moleculeConcentrations: new Map([['sodium', 0.1]]),
      temperature: 298,
      pressure: 1.0,
      depth: 0.01,
      bubbleDensity: 0.0,
      particleDensity: 0.0,
      particleSize: 0.0,
      phase: 'liquid',
    });

    squareProps = createProps();
    circleProps = createProps();
    triangleProps = createProps();

    state = new SpectralDemoState(squareProps, circleProps, triangleProps);
  });

  describe('initialization', () => {
    it('should initialize with provided properties', () => {
      expect(state.squareProperties).toBe(squareProps);
      expect(state.circleProperties).toBe(circleProps);
      expect(state.triangleProperties).toBe(triangleProps);
    });

    it('should start with default positions', () => {
      expect(state.squareX).toBe(200);
      expect(state.squareY).toBe(360);
      expect(state.squareSize).toBe(200);
      expect(state.circleX).toBe(400);
      expect(state.circleY).toBe(360);
      expect(state.circleRadius).toBe(150);
      expect(state.triangleX).toBe(300);
      expect(state.triangleY).toBe(360);
      expect(state.triangleSize).toBe(180);
    });

    it('should start with uvMode false', () => {
      expect(state.uvMode).toBe(false);
    });

    it('should start dirty', () => {
      expect(state.checkDirtyState()).toBe(true);
    });
  });

  describe('dirty state tracking', () => {
    it('should return true when dirty', () => {
      state.markDirty();
      expect(state.checkDirtyState()).toBe(true);
    });

    it('should return false when clean and unchanged', () => {
      state.markClean();
      expect(state.checkDirtyState()).toBe(false);
    });

    it('should return true when properties change', () => {
      state.markClean();
      state.squareProperties.temperature = 300;
      expect(state.checkDirtyState()).toBe(true);
    });

    it('should return true when positions change', () => {
      state.markClean();
      state.squareX = 250;
      expect(state.checkDirtyState()).toBe(true);
    });

    it('should return true when uvMode changes', () => {
      state.markClean();
      state.uvMode = true;
      expect(state.checkDirtyState()).toBe(true);
    });

    it('should return true when molecule concentrations change', () => {
      state.markClean();
      state.squareProperties.moleculeConcentrations.set('sodium', 0.2);
      expect(state.checkDirtyState()).toBe(true);
    });
  });

  describe('updateState', () => {
    it('should update properties and mark dirty', () => {
      state.markClean();
      const newProps: SolutionProperties = {
        moleculeConcentrations: new Map([['sodium', 0.5]]),
        temperature: 350,
        pressure: 1.5,
        depth: 0.02,
        bubbleDensity: 0.1,
        particleDensity: 0.1,
        particleSize: 10.0,
        phase: 'gas',
      };

      state.updateState({ squareProperties: newProps });
      expect(state.squareProperties).toBe(newProps);
      expect(state.checkDirtyState()).toBe(true);
    });

    it('should update positions and mark dirty', () => {
      state.markClean();
      state.updateState({ squareX: 250, squareY: 400 });
      expect(state.squareX).toBe(250);
      expect(state.squareY).toBe(400);
      expect(state.checkDirtyState()).toBe(true);
    });

    it('should update uvMode and mark dirty', () => {
      state.markClean();
      state.updateState({ uvMode: true });
      expect(state.uvMode).toBe(true);
      expect(state.checkDirtyState()).toBe(true);
    });

    it('should update multiple properties at once', () => {
      state.markClean();
      state.updateState({
        squareX: 250,
        circleX: 450,
        uvMode: true,
      });
      expect(state.squareX).toBe(250);
      expect(state.circleX).toBe(450);
      expect(state.uvMode).toBe(true);
      expect(state.checkDirtyState()).toBe(true);
    });
  });

  describe('getState', () => {
    it('should return a snapshot of current state', () => {
      state.squareX = 250;
      state.uvMode = true;
      const snapshot = state.getState();

      expect(snapshot.squareX).toBe(250);
      expect(snapshot.uvMode).toBe(true);
      expect(snapshot.squareProperties).not.toBe(state.squareProperties); // Should be a copy
    });

    it('should return deep copy of properties', () => {
      const snapshot = state.getState();
      snapshot.squareProperties.temperature = 500;
      expect(state.squareProperties.temperature).toBe(298); // Original unchanged
    });

    it('should return deep copy of molecule concentrations', () => {
      const snapshot = state.getState();
      snapshot.squareProperties.moleculeConcentrations.set('potassium', 0.5);
      expect(
        state.squareProperties.moleculeConcentrations.has('potassium')
      ).toBe(false); // Original unchanged
    });
  });

  describe('markClean', () => {
    it('should mark state as clean and save snapshot', () => {
      state.squareX = 250;
      state.markClean();
      expect(state.checkDirtyState()).toBe(false);

      // Changing back should make it dirty again
      state.squareX = 200;
      expect(state.checkDirtyState()).toBe(true);
    });
  });
});

