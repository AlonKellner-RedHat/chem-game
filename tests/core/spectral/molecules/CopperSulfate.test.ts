import { describe, it, expect } from 'vitest';
import { CopperSulfate } from '../../../../src/core/spectral/molecules/CopperSulfate';

describe('CopperSulfate', () => {
  const molecule = new CopperSulfate();

  it('should have correct id and name', () => {
    expect(molecule.id).toBe('copper-sulfate');
    expect(molecule.name).toBe('Copper Sulfate');
  });

  it('should have absorption peak around 800nm', () => {
    const peaks = molecule.getAbsorptionPeaks();
    expect(peaks.length).toBeGreaterThan(0);
    expect(peaks.some((p) => p > 750 && p < 850)).toBe(true);
  });

  it('should have high extinction coefficient at absorption peak', () => {
    const peaks = molecule.getAbsorptionPeaks();
    const mainPeak = peaks[0];
    const epsilon = molecule.getMolarExtinctionCoefficient(mainPeak);
    expect(epsilon).toBeGreaterThan(10);
  });

  it('should have low extinction coefficient away from peak', () => {
    const epsilon = molecule.getMolarExtinctionCoefficient(400);
    expect(epsilon).toBeLessThan(100);
  });
});

