import { describe, it, expect } from 'vitest';
import { PixelFilter, PixelSpectrum } from '../../../../src/core/spectral/filters/PixelFilter';
import { SpectrumPoint } from '../../../../src/core/spectral/CIE';

describe('PixelFilter interface', () => {
  it('should have required methods', () => {
    const filter: PixelFilter = {
      id: 'test-filter',
      apply: (spectrum: SpectrumPoint[]) => spectrum,
      canScatter: () => false,
    };

    expect(filter.id).toBe('test-filter');
    expect(filter.apply).toBeDefined();
    expect(filter.canScatter).toBeDefined();
  });

  it('should apply filter to spectrum', () => {
    const inputSpectrum: SpectrumPoint[] = [
      { wavelength: 400, transmission: 1.0 },
      { wavelength: 500, transmission: 1.0 },
      { wavelength: 600, transmission: 1.0 },
    ];

    const filter: PixelFilter = {
      id: 'test-filter',
      apply: (spectrum: SpectrumPoint[]) => {
        // 50% absorption
        return spectrum.map(p => ({ ...p, transmission: p.transmission * 0.5 }));
      },
      canScatter: () => false,
    };

    const result = filter.apply(inputSpectrum, 100, 200);
    expect(result).toHaveLength(3);
    expect(result[0].transmission).toBe(0.5);
    expect(result[1].transmission).toBe(0.5);
    expect(result[2].transmission).toBe(0.5);
  });

  it('should indicate if scattering is required', () => {
    const nonScatteringFilter: PixelFilter = {
      id: 'non-scattering',
      apply: (spectrum: SpectrumPoint[]) => spectrum,
      canScatter: () => false,
    };

    const scatteringFilter: PixelFilter = {
      id: 'scattering',
      apply: (spectrum: SpectrumPoint[], _x: number, _y: number, neighbors?: PixelSpectrum[]) => {
        if (!neighbors || neighbors.length === 0) return spectrum;
        // Mix with first neighbor
        return spectrum.map((p, i) => ({
          ...p,
          transmission: (p.transmission + neighbors[0].spectrum[i].transmission) / 2,
        }));
      },
      canScatter: () => true,
    };

    expect(nonScatteringFilter.canScatter()).toBe(false);
    expect(scatteringFilter.canScatter()).toBe(true);
  });

  it('should support neighbor access for scattering', () => {
    const inputSpectrum: SpectrumPoint[] = [
      { wavelength: 400, transmission: 1.0 },
      { wavelength: 500, transmission: 1.0 },
    ];

    const neighborSpectrum: PixelSpectrum = {
      x: 101,
      y: 200,
      spectrum: [
        { wavelength: 400, transmission: 0.5 },
        { wavelength: 500, transmission: 0.5 },
      ],
    };

    const scatteringFilter: PixelFilter = {
      id: 'scattering',
      apply: (spectrum: SpectrumPoint[], _x: number, _y: number, neighbors?: PixelSpectrum[]) => {
        if (!neighbors || neighbors.length === 0) return spectrum;
        // Average with neighbor
        return spectrum.map((p, i) => ({
          ...p,
          transmission: (p.transmission + neighbors[0].spectrum[i].transmission) / 2,
        }));
      },
      canScatter: () => true,
    };

    const result = scatteringFilter.apply(inputSpectrum, 100, 200, [neighborSpectrum]);
    expect(result[0].transmission).toBe(0.75); // (1.0 + 0.5) / 2
    expect(result[1].transmission).toBe(0.75);
  });
});

