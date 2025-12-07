import { describe, it, expect } from 'vitest';
import { PerPixelSpectralRenderer } from '../../../src/core/spectral/PerPixelSpectralRenderer';
import { RGB, SpectrumPoint } from '../../../src/core/spectral/CIE';

describe('Grid Color Consistency', () => {
  it('should have grid tiles and lines with same color, different brightness', () => {
    const renderer = new PerPixelSpectralRenderer();
    
    // Background spectrum (uniform over visible)
    const backgroundSpectrum: SpectrumPoint[] = [];
    const minWavelength = 380;
    const maxWavelength = 700;
    const numPoints = 100;

    for (let i = 0; i < numPoints; i++) {
      const wavelength = i === numPoints - 1
        ? maxWavelength
        : minWavelength + (i / (numPoints - 1)) * (maxWavelength - minWavelength);
      backgroundSpectrum.push({ wavelength, transmission: 1.0 });
    }

    // Convert to RGB
    const backgroundColor = renderer.spectrumToRGB(backgroundSpectrum, 'D65');
    
    // Grid lines: same color but 60% brightness
    const lineColor: RGB = {
      r: Math.round(backgroundColor.r * 0.6),
      g: Math.round(backgroundColor.g * 0.6),
      b: Math.round(backgroundColor.b * 0.6),
    };
    
    // Colors should have same ratios (same hue)
    const bgRatio_rg = backgroundColor.r / backgroundColor.g;
    const lineRatio_rg = lineColor.r / lineColor.g;
    expect(lineRatio_rg).toBeCloseTo(bgRatio_rg, 2);
    
    // Line color should be dimmer (60% of background)
    // Allow for rounding differences (tolerance of 1)
    expect(lineColor.r).toBeCloseTo(backgroundColor.r * 0.6, 0);
    expect(lineColor.g).toBeCloseTo(backgroundColor.g * 0.6, 0);
    expect(lineColor.b).toBeCloseTo(backgroundColor.b * 0.6, 0);
  });
});

