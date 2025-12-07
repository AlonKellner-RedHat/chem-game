/**
 * Pure utility functions for spectral calculations
 * These functions have no side effects and can be easily tested
 */

export interface SpectrumPoint {
  wavelength: number;
  transmission: number;
}

export interface WavelengthColor {
  color: number;
  alpha: number;
}

/**
 * Calculate fade factor for UV/IR regions
 * @param wavelength Wavelength in nm
 * @param visibleMin Minimum visible wavelength (typically 380nm)
 * @param visibleMax Maximum visible wavelength (typically 700nm)
 * @returns Fade factor from 0.0 to 1.0
 */
export function calculateFadeFactor(
  wavelength: number,
  visibleMin: number,
  visibleMax: number
): number {
  if (wavelength >= visibleMin && wavelength <= visibleMax) return 1.0;
  if (wavelength < visibleMin) {
    // UV fade: reverse quadratic from 1.0 at 380nm to near 0 at 250nm
    // Fade range: 250nm to 380nm (130nm range)
    const uvFadeStart = 250; // Fade starts here, reaches near 0
    if (wavelength <= uvFadeStart) return 0.0;

    // t goes from 0 (at 250nm) to 1 (at 380nm)
    const t = (wavelength - uvFadeStart) / (visibleMin - uvFadeStart);
    // Reverse quadratic: 1 - (1-t)^2 = 2t - t^2
    // Starts slow near visible (t=1), decays faster as going deeper (t→0)
    return Math.max(0, 1 - (1 - t) * (1 - t));
  }
  // IR fade: reverse quadratic from 1.0 at 700nm to near 0 at 850nm
  // Fade range: 700nm to 850nm (150nm range) - same range as before
  const irFadeEnd = 850; // Fade ends here, reaches near 0
  if (wavelength >= irFadeEnd) return 0.0;

  // t goes from 0 (at 700nm) to 1 (at 850nm)
  // For horizontally reverse of UV fadeout, we use 1 - t^2
  // UV fadeout: 1 - (1-t)^2 where t goes 0→1, output goes 0→1
  // IR fadeout: 1 - t^2 where t goes 0→1, output goes 1→0 (horizontally reversed)
  const t = (wavelength - visibleMax) / (irFadeEnd - visibleMax);
  // Reverse quadratic: 1 - t^2
  // Starts at 1.0 at visible edge (t=0), decays to 0.0 at fade end (t=1)
  // Starts slow near visible (t=0), decays faster as going deeper (t→1)
  // Smooth slope change matching UV fadeout behavior, but horizontally reversed
  return Math.max(0, 1 - t * t);
}

/**
 * Calculate uniform background spectrum for spectral display tool (high resolution)
 * Uniform over visible (380-700nm), fades in UV/IR
 */
export function calculateUniformBackgroundSpectrum(): SpectrumPoint[] {
  // High resolution for spectral display tool (5334 points for ~0.15nm resolution)
  const spectrum: SpectrumPoint[] = [];
  const minWavelength = 200;
  const maxWavelength = 1000;
  const numFrequencies = 5334; // Match SpectralCalculator resolution
  const visibleMin = 380;
  const visibleMax = 700;

  for (let i = 0; i < numFrequencies; i++) {
    const wavelength =
      i === numFrequencies - 1
        ? maxWavelength
        : minWavelength +
          (i / (numFrequencies - 1)) * (maxWavelength - minWavelength);
    const fadeFactor = calculateFadeFactor(
      wavelength,
      visibleMin,
      visibleMax
    );
    spectrum.push({ wavelength, transmission: fadeFactor });
  }

  return spectrum;
}

/**
 * Calculate uniform background spectrum for RGB rendering (low resolution)
 * Uniform over visible (380-700nm), fades in UV/IR
 * Uses ~100 points matching calculateRGBSpectrum resolution
 */
export function calculateRGBBackgroundSpectrum(): SpectrumPoint[] {
  // Low resolution for RGB rendering (~100 points)
  const spectrum: SpectrumPoint[] = [];
  const minWavelength = 200;
  const maxWavelength = 1000;
  const numFrequencies = 100; // Match calculateRGBSpectrum resolution
  const visibleMin = 380;
  const visibleMax = 700;

  for (let i = 0; i < numFrequencies; i++) {
    const wavelength =
      i === numFrequencies - 1
        ? maxWavelength
        : minWavelength +
          (i / (numFrequencies - 1)) * (maxWavelength - minWavelength);
    const fadeFactor = calculateFadeFactor(
      wavelength,
      visibleMin,
      visibleMax
    );
    spectrum.push({ wavelength, transmission: fadeFactor });
  }

  return spectrum;
}

/**
 * Calculate UV background spectrum for spectral display tool (high resolution)
 * UV range with decay on both ends:
 * - Short wavelength decay: rises from 0 at 200nm to 1.0 at 250nm (fast rise using 1-(1-t)^2)
 * - Flat region: 250nm to 350nm (peak UV range)
 * - Long wavelength decay: falls from 1.0 at 350nm to 0 at 450nm (into visible blue region)
 * 
 * The visible spectrum starts at 380nm, so the decay extends into the violet/blue region
 */
export function calculateUVBackgroundSpectrum(): SpectrumPoint[] {
  // High resolution for spectral display tool (5334 points for ~0.15nm resolution)
  const spectrum: SpectrumPoint[] = [];
  const minWavelength = 200;
  const maxWavelength = 1000;
  const numFrequencies = 5334; // Match SpectralCalculator resolution
  
  // UV spectrum boundaries
  const shortFadeStart = 200;   // Start of short wavelength fade-in
  const shortFadeEnd = 250;     // End of short wavelength fade-in (reaches 1.0) - faster decay
  const longFadeStart = 350;    // Start of long wavelength fade-out (from 1.0)
  const longFadeEnd = 450;      // End of long wavelength fade-out (into visible blue region)

  for (let i = 0; i < numFrequencies; i++) {
    const wavelength =
      i === numFrequencies - 1
        ? maxWavelength
        : minWavelength +
          (i / (numFrequencies - 1)) * (maxWavelength - minWavelength);

    let transmission = 0.0;
    
    if (wavelength < shortFadeStart) {
      // Below minimum: no light
      transmission = 0.0;
    } else if (wavelength >= shortFadeStart && wavelength < shortFadeEnd) {
      // Short wavelength fade-in: 1-(1-t)^2 = 2t-t^2 (starts fast, slows near end)
      const t = (wavelength - shortFadeStart) / (shortFadeEnd - shortFadeStart);
      transmission = 1 - (1 - t) * (1 - t);  // Fast rise at start
    } else if (wavelength >= shortFadeEnd && wavelength <= longFadeStart) {
      // Peak UV range: uniform transmission = 1.0
      transmission = 1.0;
    } else if (wavelength > longFadeStart && wavelength < longFadeEnd) {
      // Long wavelength fade-out: quadratic decay from 1 to 0
      const t = (wavelength - longFadeStart) / (longFadeEnd - longFadeStart);
      transmission = 1 - t * t;  // Starts slow, decays faster
    } else {
      // Beyond fade end (visible and IR): no UV light
      transmission = 0.0;
    }

    spectrum.push({ wavelength, transmission });
  }

  return spectrum;
}

/**
 * Calculate UV background spectrum for RGB rendering (low resolution)
 * UV range with decay on both ends (matching high-res version):
 * - Short wavelength decay: rises from 0 at 200nm to 1.0 at 250nm (fast rise using 1-(1-t)^2)
 * - Flat region: 250nm to 350nm (peak UV range)
 * - Long wavelength decay: falls from 1.0 at 350nm to 0 at 450nm (into visible blue region)
 * Uses ~100 points matching calculateRGBSpectrum resolution
 */
export function calculateUVRGBBackgroundSpectrum(): SpectrumPoint[] {
  // Low resolution for RGB rendering (~100 points)
  const spectrum: SpectrumPoint[] = [];
  const minWavelength = 200;
  const maxWavelength = 1000;
  const numFrequencies = 100; // Match calculateRGBSpectrum resolution
  
  // UV spectrum boundaries (same as high-res version)
  const shortFadeStart = 200;
  const shortFadeEnd = 250;
  const longFadeStart = 350;
  const longFadeEnd = 450;

  for (let i = 0; i < numFrequencies; i++) {
    const wavelength =
      i === numFrequencies - 1
        ? maxWavelength
        : minWavelength +
          (i / (numFrequencies - 1)) * (maxWavelength - minWavelength);

    let transmission = 0.0;
    
    if (wavelength < shortFadeStart) {
      // Below minimum: no light
      transmission = 0.0;
    } else if (wavelength >= shortFadeStart && wavelength < shortFadeEnd) {
      // Short wavelength fade-in: 1-(1-t)^2 = 2t-t^2 (starts fast, slows near end)
      const t = (wavelength - shortFadeStart) / (shortFadeEnd - shortFadeStart);
      transmission = 1 - (1 - t) * (1 - t);  // Fast rise at start
    } else if (wavelength >= shortFadeEnd && wavelength <= longFadeStart) {
      // Peak UV range: uniform transmission = 1.0
      transmission = 1.0;
    } else if (wavelength > longFadeStart && wavelength < longFadeEnd) {
      // Long wavelength fade-out: quadratic decay from 1 to 0
      const t = (wavelength - longFadeStart) / (longFadeEnd - longFadeStart);
      transmission = 1 - t * t;
    } else {
      // Beyond fade end (visible and IR): no UV light
      transmission = 0.0;
    }

    spectrum.push({ wavelength, transmission });
  }

  return spectrum;
}

/**
 * Calculate dark mode background spectrum for spectral display tool (high resolution)
 * Zero intensity at all wavelengths - shows only emission
 */
export function calculateDarkBackgroundSpectrum(): SpectrumPoint[] {
  const spectrum: SpectrumPoint[] = [];
  const minWavelength = 200;
  const maxWavelength = 1000;
  const numFrequencies = 5334; // Match SpectralCalculator resolution

  for (let i = 0; i < numFrequencies; i++) {
    const wavelength =
      i === numFrequencies - 1
        ? maxWavelength
        : minWavelength +
          (i / (numFrequencies - 1)) * (maxWavelength - minWavelength);
    
    // Dark mode: zero transmission (no background light)
    spectrum.push({ wavelength, transmission: 0 });
  }

  return spectrum;
}

/**
 * Calculate dark mode background spectrum for RGB rendering (low resolution)
 * Zero intensity at all wavelengths - shows only emission
 * Uses ~100 points matching calculateRGBSpectrum resolution
 */
export function calculateDarkRGBBackgroundSpectrum(): SpectrumPoint[] {
  const spectrum: SpectrumPoint[] = [];
  const minWavelength = 200;
  const maxWavelength = 1000;
  const numFrequencies = 100; // Match calculateRGBSpectrum resolution

  for (let i = 0; i < numFrequencies; i++) {
    const wavelength =
      i === numFrequencies - 1
        ? maxWavelength
        : minWavelength +
          (i / (numFrequencies - 1)) * (maxWavelength - minWavelength);
    
    // Dark mode: zero transmission (no background light)
    spectrum.push({ wavelength, transmission: 0 });
  }

  return spectrum;
}

/**
 * Convert wavelength (nm) to RGB color for rainbow band
 * Fades into UV (dark violet/black) and IR (dark red/black)
 * Returns both color and alpha for proper fading
 */
export function wavelengthToColor(wavelength: number): WavelengthColor {
  let r = 0,
    g = 0,
    b = 0;
  let alpha = 1.0;

  // UV region (< 400nm) - fade from dark violet to black
  if (wavelength < 400) {
    const uvFactor = wavelength / 400; // 0 at 0nm, 1 at 400nm
    r = Math.floor(50 * uvFactor); // Very dark red
    g = 0;
    b = Math.floor(100 * uvFactor); // Very dark blue/violet
    alpha = 0.3 + 0.7 * uvFactor; // Fade from transparent to visible
  }
  // Visible spectrum (400-700nm)
  else if (wavelength < 700) {
    // Violet (400-450nm)
    if (wavelength < 450) {
      const factor = (wavelength - 400) / 50;
      r = Math.floor(128 * factor);
      g = 0;
      b = 255;
    }
    // Blue (450-490nm)
    else if (wavelength < 490) {
      const factor = (wavelength - 450) / 40;
      r = 0;
      g = Math.floor(255 * factor);
      b = 255;
    }
    // Green (490-570nm)
    else if (wavelength < 570) {
      const factor = (wavelength - 490) / 80;
      r = 0;
      g = 255;
      b = Math.floor(255 * (1 - factor));
    }
    // Yellow (570-590nm)
    else if (wavelength < 590) {
      const factor = (wavelength - 570) / 20;
      r = Math.floor(255 * factor);
      g = 255;
      b = 0;
    }
    // Orange (590-620nm)
    else if (wavelength < 620) {
      const factor = (wavelength - 590) / 30;
      r = 255;
      g = Math.floor(255 * (1 - factor * 0.5));
      b = 0;
    }
    // Red (620-700nm)
    else {
      r = 255;
      g = Math.floor(128 * (1 - (wavelength - 620) / 80));
      b = 0;
    }
  }
  // IR region (> 700nm) - fade from red to dark red/black
  else {
    const irFactor = Math.max(0, 1 - (wavelength - 700) / 300); // Fade from 700nm to 1000nm
    r = Math.floor(255 * irFactor);
    g = Math.floor(50 * irFactor);
    b = 0;
    alpha = 0.3 + 0.7 * irFactor; // Fade to transparent
  }

  // Convert to Phaser color format (0xRRGGBB)
  const color = (r << 16) | (g << 8) | b;
  return { color, alpha };
}

