import { describe, it, expect } from 'vitest';
import { NothingFilter } from '../../../../src/core/spectral/filters/NothingFilter';
import { SpectrumPoint } from '../../../../src/core/spectral/CIE';

describe('NothingFilter', () => {
  it('should have correct id', () => {
    const filter = new NothingFilter();
    expect(filter.id).toBe('nothing');
  });

  it('should pass spectrum through unchanged', () => {
    const filter = new NothingFilter();
    const inputSpectrum: SpectrumPoint[] = [
      { wavelength: 400, transmission: 1.0 },
      { wavelength: 500, transmission: 0.8 },
      { wavelength: 600, transmission: 0.5 },
    ];

    const result = filter.apply(inputSpectrum, 100, 200);

    expect(result).toHaveLength(3);
    expect(result[0].wavelength).toBe(400);
    expect(result[0].transmission).toBe(1.0);
    expect(result[1].wavelength).toBe(500);
    expect(result[1].transmission).toBe(0.8);
    expect(result[2].wavelength).toBe(600);
    expect(result[2].transmission).toBe(0.5);
  });

  it('should return a copy, not the original', () => {
    const filter = new NothingFilter();
    const inputSpectrum: SpectrumPoint[] = [
      { wavelength: 400, transmission: 1.0 },
    ];

    const result = filter.apply(inputSpectrum, 100, 200);
    result[0].transmission = 0.5;

    // Original should be unchanged
    expect(inputSpectrum[0].transmission).toBe(1.0);
  });

  it('should not require scattering', () => {
    const filter = new NothingFilter();
    expect(filter.canScatter()).toBe(false);
  });
});

