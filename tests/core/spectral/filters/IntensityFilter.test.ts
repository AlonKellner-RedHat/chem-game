import { describe, it, expect } from 'vitest';
import { IntensityFilter } from '../../../../src/core/spectral/filters/IntensityFilter';
import { SpectrumPoint } from '../../../../src/core/spectral/CIE';

describe('IntensityFilter', () => {
  it('should scale spectrum by intensity', () => {
    const filter = new IntensityFilter(0.6);
    const inputSpectrum: SpectrumPoint[] = [
      { wavelength: 400, transmission: 1.0 },
      { wavelength: 500, transmission: 0.8 },
      { wavelength: 600, transmission: 0.5 },
    ];

    const result = filter.apply(inputSpectrum, 100, 200);

    expect(result[0].transmission).toBeCloseTo(0.6);
    expect(result[1].transmission).toBeCloseTo(0.48);
    expect(result[2].transmission).toBeCloseTo(0.3);
  });

  it('should handle 100% intensity (no change)', () => {
    const filter = new IntensityFilter(1.0);
    const inputSpectrum: SpectrumPoint[] = [
      { wavelength: 400, transmission: 1.0 },
    ];

    const result = filter.apply(inputSpectrum, 100, 200);
    expect(result[0].transmission).toBe(1.0);
  });

  it('should handle 0% intensity (black)', () => {
    const filter = new IntensityFilter(0.0);
    const inputSpectrum: SpectrumPoint[] = [
      { wavelength: 400, transmission: 1.0 },
    ];

    const result = filter.apply(inputSpectrum, 100, 200);
    expect(result[0].transmission).toBe(0.0);
  });

  it('should throw error for invalid intensity', () => {
    expect(() => new IntensityFilter(-0.1)).toThrow();
    expect(() => new IntensityFilter(1.1)).toThrow();
  });

  it('should support custom id', () => {
    const filter = new IntensityFilter(0.6, 'custom-id');
    expect(filter.id).toBe('custom-id');
  });

  it('should return intensity value', () => {
    const filter = new IntensityFilter(0.6);
    expect(filter.getIntensity()).toBe(0.6);
  });

  it('should not require scattering', () => {
    const filter = new IntensityFilter(0.6);
    expect(filter.canScatter()).toBe(false);
  });
});

