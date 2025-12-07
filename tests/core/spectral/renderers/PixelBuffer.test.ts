import { describe, it, expect } from 'vitest';
import { PixelBuffer } from '../../../../src/core/spectral/renderers/PixelBuffer';
import { SpectrumPoint, RGB } from '../../../../src/core/spectral/CIE';

describe('PixelBuffer', () => {
  it('should store and retrieve spectrum', () => {
    const buffer = new PixelBuffer();
    const spectrum: SpectrumPoint[] = [
      { wavelength: 400, transmission: 1.0 },
      { wavelength: 500, transmission: 0.8 },
    ];

    buffer.setSpectrum(100, 200, spectrum);
    const retrieved = buffer.getSpectrum(100, 200);

    expect(retrieved).not.toBeNull();
    expect(retrieved).toHaveLength(2);
    expect(retrieved![0].wavelength).toBe(400);
    expect(retrieved![0].transmission).toBe(1.0);
  });

  it('should return null for non-existent spectrum', () => {
    const buffer = new PixelBuffer();
    expect(buffer.getSpectrum(100, 200)).toBeNull();
  });

  it('should store and retrieve RGB', () => {
    const buffer = new PixelBuffer();
    const rgb: RGB = { r: 255, g: 128, b: 64 };

    buffer.setRGB(100, 200, rgb);
    const retrieved = buffer.getRGB(100, 200);

    expect(retrieved).toEqual(rgb);
  });

  it('should return null for non-existent RGB', () => {
    const buffer = new PixelBuffer();
    expect(buffer.getRGB(100, 200)).toBeNull();
  });

  it('should get neighbors for scattering', () => {
    const buffer = new PixelBuffer();
    const spectrum1: SpectrumPoint[] = [{ wavelength: 400, transmission: 1.0 }];
    const spectrum2: SpectrumPoint[] = [{ wavelength: 400, transmission: 0.8 }];

    buffer.setSpectrum(100, 100, spectrum1);
    buffer.setSpectrum(101, 100, spectrum2);
    buffer.setSpectrum(100, 101, spectrum2);

    const neighbors = buffer.getNeighbors(100, 100, 1);

    expect(neighbors).toHaveLength(2);
    expect(neighbors.some(n => n.x === 101 && n.y === 100)).toBe(true);
    expect(neighbors.some(n => n.x === 100 && n.y === 101)).toBe(true);
  });

  it('should find maximum brightness', () => {
    const buffer = new PixelBuffer();
    buffer.setRGB(100, 100, { r: 255, g: 200, b: 100 });
    buffer.setRGB(101, 100, { r: 150, g: 180, b: 200 });
    buffer.setRGB(100, 101, { r: 50, g: 50, b: 50 });

    const maxBrightness = buffer.getMaxBrightness();
    expect(maxBrightness).toBe(255);
  });

  it('should clear all data', () => {
    const buffer = new PixelBuffer();
    buffer.setSpectrum(100, 100, [{ wavelength: 400, transmission: 1.0 }]);
    buffer.setRGB(100, 100, { r: 255, g: 255, b: 255 });

    buffer.clear();

    expect(buffer.getSpectrum(100, 100)).toBeNull();
    expect(buffer.getRGB(100, 100)).toBeNull();
    expect(buffer.getMaxBrightness()).toBe(0);
  });
});

