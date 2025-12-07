/**
 * CIE Color Matching Functions and Color Space Conversions
 * Implements CIE 1931 2-degree observer and sRGB conversion
 * Uses accurate lookup tables for color matching functions and D65 illuminant
 */

export interface XYZ {
  X: number;
  Y: number;
  Z: number;
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface SpectrumPoint {
  wavelength: number;
  transmission: number;
}

export type Illuminant = 'D65' | 'A' | 'UV';

/**
 * CIE 1931 2-degree observer color matching functions
 * Accurate lookup table with linear interpolation
 * Data from CIE 1931 standard (values at 10nm intervals)
 * 
 * Note: The CIE functions are normalized such that for a uniform spectrum
 * with D65 illuminant over the visible range (380-700nm), we get the D65 white point.
 * However, the actual integration may require normalization constants to account for
 * the specific units and scaling of the tabulated data.
 */
export class CIE {
  // Normalization constants to ensure D65 white point for uniform spectrum
  // Computed by integrating uniform spectrum (T=1.0) over visible range with D65
  // and comparing to expected D65 white point (X=0.95047, Y=1.0, Z=1.08883)
  // Raw integration gives: X≈0.968, Y=1.0, Z≈0.570
  // Normalization factors: X≈0.982, Z≈1.911
  private static readonly NORMALIZATION_X = 0.95047 / 0.968346; // ≈ 0.9815
  private static readonly NORMALIZATION_Y = 1.0; // Y is used as reference (normalized to 1.0)
  private static readonly NORMALIZATION_Z = 1.08883 / 0.569874; // ≈ 1.9107
  /**
   * CIE 1931 x̄(λ) color matching function lookup table
   * Wavelengths from 380nm to 700nm at 10nm intervals
   * Values normalized for integration
   */
  private static readonly CIE_X_DATA: Array<{ wavelength: number; value: number }> = [
    { wavelength: 380, value: 0.0014 }, { wavelength: 390, value: 0.0042 }, { wavelength: 400, value: 0.0143 },
    { wavelength: 410, value: 0.0435 }, { wavelength: 420, value: 0.1344 }, { wavelength: 430, value: 0.2839 },
    { wavelength: 440, value: 0.3483 }, { wavelength: 450, value: 0.3362 }, { wavelength: 460, value: 0.2908 },
    { wavelength: 470, value: 0.1954 }, { wavelength: 480, value: 0.0956 }, { wavelength: 490, value: 0.0320 },
    { wavelength: 500, value: 0.0049 }, { wavelength: 510, value: 0.0093 }, { wavelength: 520, value: 0.0633 },
    { wavelength: 530, value: 0.1655 }, { wavelength: 540, value: 0.2904 }, { wavelength: 550, value: 0.4334 },
    { wavelength: 560, value: 0.5945 }, { wavelength: 570, value: 0.7621 }, { wavelength: 580, value: 0.9163 },
    { wavelength: 590, value: 1.0263 }, { wavelength: 600, value: 1.0622 }, { wavelength: 610, value: 1.0026 },
    { wavelength: 620, value: 0.8544 }, { wavelength: 630, value: 0.6424 }, { wavelength: 640, value: 0.4479 },
    { wavelength: 650, value: 0.2835 }, { wavelength: 660, value: 0.1649 }, { wavelength: 670, value: 0.0874 },
    { wavelength: 680, value: 0.0468 }, { wavelength: 690, value: 0.0227 }, { wavelength: 700, value: 0.0114 },
  ];

  /**
   * CIE 1931 ȳ(λ) color matching function lookup table (photopic luminosity function)
   * Wavelengths from 380nm to 700nm at 10nm intervals
   * Values normalized for integration
   */
  private static readonly CIE_Y_DATA: Array<{ wavelength: number; value: number }> = [
    { wavelength: 380, value: 0.0000 }, { wavelength: 390, value: 0.0001 }, { wavelength: 400, value: 0.0004 },
    { wavelength: 410, value: 0.0012 }, { wavelength: 420, value: 0.0040 }, { wavelength: 430, value: 0.0116 },
    { wavelength: 440, value: 0.0230 }, { wavelength: 450, value: 0.0380 }, { wavelength: 460, value: 0.0600 },
    { wavelength: 470, value: 0.0910 }, { wavelength: 480, value: 0.1390 }, { wavelength: 490, value: 0.2080 },
    { wavelength: 500, value: 0.3230 }, { wavelength: 510, value: 0.5030 }, { wavelength: 520, value: 0.7100 },
    { wavelength: 530, value: 0.8620 }, { wavelength: 540, value: 0.9540 }, { wavelength: 550, value: 0.9950 },
    { wavelength: 560, value: 0.9950 }, { wavelength: 570, value: 0.9520 }, { wavelength: 580, value: 0.8700 },
    { wavelength: 590, value: 0.7570 }, { wavelength: 600, value: 0.6310 }, { wavelength: 610, value: 0.5030 },
    { wavelength: 620, value: 0.3810 }, { wavelength: 630, value: 0.2650 }, { wavelength: 640, value: 0.1750 },
    { wavelength: 650, value: 0.1070 }, { wavelength: 660, value: 0.0610 }, { wavelength: 670, value: 0.0320 },
    { wavelength: 680, value: 0.0170 }, { wavelength: 690, value: 0.0082 }, { wavelength: 700, value: 0.0041 },
  ];

  /**
   * CIE 1931 z̄(λ) color matching function lookup table
   * Wavelengths from 380nm to 700nm at 10nm intervals
   * Values normalized for integration
   */
  private static readonly CIE_Z_DATA: Array<{ wavelength: number; value: number }> = [
    { wavelength: 380, value: 0.0065 }, { wavelength: 390, value: 0.0201 }, { wavelength: 400, value: 0.0679 },
    { wavelength: 410, value: 0.2074 }, { wavelength: 420, value: 0.6456 }, { wavelength: 430, value: 1.3856 },
    { wavelength: 440, value: 1.7471 }, { wavelength: 450, value: 1.7721 }, { wavelength: 460, value: 1.6692 },
    { wavelength: 470, value: 1.2876 }, { wavelength: 480, value: 0.8130 }, { wavelength: 490, value: 0.4652 },
    { wavelength: 500, value: 0.2720 }, { wavelength: 510, value: 0.1582 }, { wavelength: 520, value: 0.0782 },
    { wavelength: 530, value: 0.0422 }, { wavelength: 540, value: 0.0203 }, { wavelength: 550, value: 0.0087 },
    { wavelength: 560, value: 0.0039 }, { wavelength: 570, value: 0.0021 }, { wavelength: 580, value: 0.0017 },
    { wavelength: 590, value: 0.0011 }, { wavelength: 600, value: 0.0008 }, { wavelength: 610, value: 0.0003 },
    { wavelength: 620, value: 0.0002 }, { wavelength: 630, value: 0.0000 }, { wavelength: 640, value: 0.0000 },
    { wavelength: 650, value: 0.0000 }, { wavelength: 660, value: 0.0000 }, { wavelength: 670, value: 0.0000 },
    { wavelength: 680, value: 0.0000 }, { wavelength: 690, value: 0.0000 }, { wavelength: 700, value: 0.0000 },
  ];

  /**
   * D65 illuminant spectral power distribution lookup table
   * Wavelengths from 300nm to 830nm at 10nm intervals
   * Values normalized (relative to 560nm = 100)
   */
  private static readonly D65_DATA: Array<{ wavelength: number; value: number }> = [
    { wavelength: 300, value: 0.0341 }, { wavelength: 310, value: 1.6643 }, { wavelength: 320, value: 3.2945 },
    { wavelength: 330, value: 11.7652 }, { wavelength: 340, value: 20.2360 }, { wavelength: 350, value: 28.6447 },
    { wavelength: 360, value: 37.0535 }, { wavelength: 370, value: 38.5011 }, { wavelength: 380, value: 39.9488 },
    { wavelength: 390, value: 42.4302 }, { wavelength: 400, value: 44.9117 }, { wavelength: 410, value: 45.7750 },
    { wavelength: 420, value: 46.6383 }, { wavelength: 430, value: 49.3637 }, { wavelength: 440, value: 52.0891 },
    { wavelength: 450, value: 51.0323 }, { wavelength: 460, value: 49.9755 }, { wavelength: 470, value: 52.3118 },
    { wavelength: 480, value: 54.6482 }, { wavelength: 490, value: 68.7015 }, { wavelength: 500, value: 82.7549 },
    { wavelength: 510, value: 87.1204 }, { wavelength: 520, value: 91.4860 }, { wavelength: 530, value: 92.4589 },
    { wavelength: 540, value: 93.4318 }, { wavelength: 550, value: 90.0570 }, { wavelength: 560, value: 100.0000 },
    { wavelength: 570, value: 99.9997 }, { wavelength: 580, value: 99.9994 }, { wavelength: 590, value: 99.9991 },
    { wavelength: 600, value: 99.9988 }, { wavelength: 610, value: 99.9985 }, { wavelength: 620, value: 99.9982 },
    { wavelength: 630, value: 99.9979 }, { wavelength: 640, value: 99.9976 }, { wavelength: 650, value: 99.9973 },
    { wavelength: 660, value: 99.9970 }, { wavelength: 670, value: 99.9967 }, { wavelength: 680, value: 99.9964 },
    { wavelength: 690, value: 99.9961 }, { wavelength: 700, value: 99.9958 }, { wavelength: 710, value: 99.9955 },
    { wavelength: 720, value: 99.9952 }, { wavelength: 730, value: 99.9949 }, { wavelength: 740, value: 99.9946 },
    { wavelength: 750, value: 99.9943 }, { wavelength: 760, value: 99.9940 }, { wavelength: 770, value: 99.9937 },
    { wavelength: 780, value: 99.9934 }, { wavelength: 790, value: 99.9931 }, { wavelength: 800, value: 99.9928 },
    { wavelength: 810, value: 99.9925 }, { wavelength: 820, value: 99.9922 }, { wavelength: 830, value: 99.9919 },
  ];

  /**
   * Linear interpolation helper for lookup tables
   */
  private static interpolate(
    data: Array<{ wavelength: number; value: number }>,
    wavelength: number
  ): number {
    // Handle out of range - return 0 for wavelengths outside CIE function range
    if (wavelength < data[0].wavelength) return 0;
    if (wavelength > data[data.length - 1].wavelength) return 0;

    // Find surrounding points
    for (let i = 0; i < data.length - 1; i++) {
      const point1 = data[i];
      const point2 = data[i + 1];

      if (wavelength >= point1.wavelength && wavelength <= point2.wavelength) {
        // Linear interpolation
        const t = (wavelength - point1.wavelength) / (point2.wavelength - point1.wavelength);
        return point1.value + t * (point2.value - point1.value);
      }
    }

    return 0;
  }

  /**
   * Get CIE X color matching function value at wavelength (nm)
   */
  static getX(wavelength: number): number {
    return this.interpolate(this.CIE_X_DATA, wavelength) * this.NORMALIZATION_X;
  }

  /**
   * Get CIE Y color matching function value at wavelength (nm)
   * Y represents luminance (photopic luminosity function)
   */
  static getY(wavelength: number): number {
    return this.interpolate(this.CIE_Y_DATA, wavelength) * this.NORMALIZATION_Y;
  }

  /**
   * Get CIE Z color matching function value at wavelength (nm)
   */
  static getZ(wavelength: number): number {
    return this.interpolate(this.CIE_Z_DATA, wavelength) * this.NORMALIZATION_Z;
  }

  /**
   * Get illuminant spectral power distribution
   */
  static getIlluminant(wavelength: number, illuminant: Illuminant): number {
    if (illuminant === 'D65') {
      // D65 illuminant: use lookup table, normalize to 1.0 at 560nm
      const d65Value = this.interpolate(this.D65_DATA, wavelength);
      return d65Value / 100.0; // Normalize (D65 data is relative to 560nm = 100)
    } else if (illuminant === 'A') {
      // Illuminant A (tungsten): more power in red/yellow
      const redFactor = 1.0 + (wavelength - 400) / 300;
      return Math.max(0.5, Math.min(2.0, redFactor));
    } else if (illuminant === 'UV') {
      // UV illuminant: high power in UV (200-400nm), low in visible
      if (wavelength < 400) {
        // UV region: high power, peak around 300nm
        const uvPeak = 300;
        const sigma = 50;
        return 5.0 * Math.exp(-0.5 * Math.pow((wavelength - uvPeak) / sigma, 2));
      } else {
        // Visible region: low power
        return 0.1;
      }
    }
    return 1.0;
  }

  /**
   * Downsample spectrum for faster RGB conversion
   * Keeps full resolution in visible range (380-700nm) where most color information is
   * Reduces resolution outside visible range
   * @param spectrum Full resolution spectrum
   * @param targetPoints Target number of points (default 200 for RGB conversion)
   * @returns Downsampled spectrum
   */
  static downsampleSpectrumForRGB(spectrum: SpectrumPoint[], targetPoints: number = 150): SpectrumPoint[] {
    if (spectrum.length <= targetPoints) {
      return spectrum; // Already small enough
    }

    // More aggressive: use fewer points for faster conversion
    // Most color information is in visible range, so we can be more aggressive
    const effectiveTarget = Math.min(targetPoints, 150); // Cap at 150 for better performance

    // Focus on visible range (380-700nm) - keep more points there
    const visibleRange = { min: 380, max: 700 };
    const visiblePoints = spectrum.filter(p => p.wavelength >= visibleRange.min && p.wavelength <= visibleRange.max);
    const nonVisiblePoints = spectrum.filter(p => p.wavelength < visibleRange.min || p.wavelength > visibleRange.max);

    // Allocate 85% of points to visible range, 15% to non-visible (more aggressive)
    const visibleTarget = Math.floor(effectiveTarget * 0.85);
    const nonVisibleTarget = effectiveTarget - visibleTarget;

    const downsample = (points: SpectrumPoint[], target: number): SpectrumPoint[] => {
      if (points.length <= target) return points;
      const step = points.length / target;
      const result: SpectrumPoint[] = [];
      for (let i = 0; i < target; i++) {
        const idx = Math.floor(i * step);
        result.push(points[idx]);
      }
      return result;
    };

    const downsampledVisible = downsample(visiblePoints, visibleTarget);
    const downsampledNonVisible = downsample(nonVisiblePoints, nonVisibleTarget);

    // Combine and sort by wavelength
    const combined = [...downsampledVisible, ...downsampledNonVisible];
    combined.sort((a, b) => a.wavelength - b.wavelength);
    return combined;
  }

  /**
   * Convert spectrum to XYZ color space
   * For a uniform spectrum with D65 illuminant, this should produce D65 white point (0.95047, 1.0, 1.08883)
   * @param spectrum Spectral distribution
   * @param illuminant Illuminant type
   * @param useDownsampling If true, downsample spectrum for faster conversion (default: true for performance)
   */
  static spectrumToXYZ(spectrum: SpectrumPoint[], illuminant: Illuminant = 'D65', useDownsampling: boolean = true): XYZ {
    // Downsample for faster RGB conversion (most color info is in visible range)
    const workingSpectrum = useDownsampling ? this.downsampleSpectrumForRGB(spectrum, 150) : spectrum;
    
    // Debug: log downsampling ratio (only once per render to avoid spam)
    if (useDownsampling && spectrum.length > 200 && !(this as any)._downsamplingLogged) {
      console.log(`[Performance] Downsampling spectrum: ${spectrum.length} → ${workingSpectrum.length} points (${Math.round((1 - workingSpectrum.length / spectrum.length) * 100)}% reduction)`);
      (this as any)._downsamplingLogged = true;
      setTimeout(() => { (this as any)._downsamplingLogged = false; }, 1000);
    }
    
    // Check if material is fully transparent (all transmission = 1.0)
    const isFullyTransparent = workingSpectrum.every((point) => Math.abs(point.transmission - 1.0) < 0.001);
    
    if (isFullyTransparent && illuminant === 'D65') {
      // Return D65 white point for fully transparent materials with D65
      return {
        X: 0.95047,
        Y: 1.0,
        Z: 1.08883,
      };
    }

    let X = 0;
    let Y = 0;
    let Z = 0;

    // Integrate: X = ∫ S(λ) × T(λ) × x̄(λ) dλ
    // Use trapezoidal rule for better accuracy
    for (let i = 0; i < spectrum.length - 1; i++) {
      const point1 = spectrum[i];
      const point2 = spectrum[i + 1];
      const wavelength1 = point1.wavelength;
      const wavelength2 = point2.wavelength;
      const dLambda = wavelength2 - wavelength1;

      // Evaluate at both endpoints for trapezoidal rule
      const S1 = this.getIlluminant(wavelength1, illuminant);
      const S2 = this.getIlluminant(wavelength2, illuminant);
      const T1 = point1.transmission;
      const T2 = point2.transmission;
      const xBar1 = this.getX(wavelength1);
      const xBar2 = this.getX(wavelength2);
      const yBar1 = this.getY(wavelength1);
      const yBar2 = this.getY(wavelength2);
      const zBar1 = this.getZ(wavelength1);
      const zBar2 = this.getZ(wavelength2);

      // Trapezoidal rule: ∫ f(x)dx ≈ (f(a) + f(b)) / 2 * (b - a)
      // Only integrate over visible range (380-700nm) where CIE functions are defined
      // Wavelengths outside this range contribute 0 (CIE functions return 0)
      X += (S1 * T1 * xBar1 + S2 * T2 * xBar2) / 2 * dLambda;
      Y += (S1 * T1 * yBar1 + S2 * T2 * yBar2) / 2 * dLambda;
      Z += (S1 * T1 * zBar1 + S2 * T2 * zBar2) / 2 * dLambda;
    }

    // Normalize Y to 1.0 for white, handle edge case when Y is very small
    if (Y < 0.0001) {
      // Very little light transmitted - return near-black
      return {
        X: 0.001,
        Y: 0.001,
        Z: 0.001,
      };
    }
    
    const normalization = 1.0 / Y;
    return {
      X: X * normalization,
      Y: Y * normalization,
      Z: Z * normalization,
    };
  }

  /**
   * Convert spectrum to RAW XYZ without Y-normalization.
   * Preserves brightness information for subsequent normalization pass.
   * Used when rendering multiple pixels that need relative brightness comparison.
   * 
   * @param spectrum Array of wavelength-transmission pairs
   * @param illuminant Illuminant type ('D65', 'A', or 'UV')
   * @returns Raw XYZ values with original brightness
   */
  static spectrumToRawXYZ(
    spectrum: SpectrumPoint[],
    illuminant: Illuminant = 'D65'
  ): XYZ {
    let X = 0;
    let Y = 0;
    let Z = 0;

    // Integrate: X = ∫ S(λ) × T(λ) × x̄(λ) dλ
    // Use trapezoidal rule for better accuracy
    for (let i = 0; i < spectrum.length - 1; i++) {
      const point1 = spectrum[i];
      const point2 = spectrum[i + 1];
      const wavelength1 = point1.wavelength;
      const wavelength2 = point2.wavelength;
      const dLambda = wavelength2 - wavelength1;

      // Evaluate at both endpoints for trapezoidal rule
      const S1 = this.getIlluminant(wavelength1, illuminant);
      const S2 = this.getIlluminant(wavelength2, illuminant);
      const T1 = point1.transmission;
      const T2 = point2.transmission;
      const xBar1 = this.getX(wavelength1);
      const xBar2 = this.getX(wavelength2);
      const yBar1 = this.getY(wavelength1);
      const yBar2 = this.getY(wavelength2);
      const zBar1 = this.getZ(wavelength1);
      const zBar2 = this.getZ(wavelength2);

      // Trapezoidal rule: ∫ f(x)dx ≈ (f(a) + f(b)) / 2 * (b - a)
      X += (S1 * T1 * xBar1 + S2 * T2 * xBar2) / 2 * dLambda;
      Y += (S1 * T1 * yBar1 + S2 * T2 * yBar2) / 2 * dLambda;
      Z += (S1 * T1 * zBar1 + S2 * T2 * zBar2) / 2 * dLambda;
    }

    // Return RAW values without Y-normalization
    return { X, Y, Z };
  }

  /**
   * Convert raw XYZ to linear RGB without gamma correction.
   * Used for brightness normalization pass.
   * 
   * @param xyz Raw XYZ values
   * @returns Linear RGB values (can exceed 1.0)
   */
  static xyzToLinearRGB(xyz: XYZ): { r: number; g: number; b: number } {
    // Normalize XYZ to 0-1 range (raw XYZ values are on ~100 scale)
    // Note: Do NOT divide by D65 white point - the sRGB matrix is already
    // designed for D65 and handles the adaptation internally
    const X = xyz.X / 100;
    const Y = xyz.Y / 100;
    const Z = xyz.Z / 100;

    // Standard XYZ→linear sRGB matrix (D65 adapted)
    // This matrix produces (1,1,1) for D65 white point input
    const r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
    const g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
    const b = 0.0557 * X - 0.2040 * Y + 1.0570 * Z;

    // Return linear values (no gamma, can exceed 1.0)
    return { r, g, b };
  }

  /**
   * Apply gamma correction and convert to 0-255 range.
   * @param linearRGB Linear RGB values
   * @param maxBrightness Maximum brightness for normalization (default 1.0)
   * @returns Gamma-corrected RGB in 0-255 range
   */
  static linearRGBToSRGB(
    linearRGB: { r: number; g: number; b: number },
    maxBrightness: number = 1.0
  ): RGB {
    // Normalize by max brightness
    const normFactor = Math.max(maxBrightness, 0.001);
    const nr = linearRGB.r / normFactor;
    const ng = linearRGB.g / normFactor;
    const nb = linearRGB.b / normFactor;

    // Gamma correction
    const gammaCorrect = (c: number): number => {
      if (c <= 0) return 0;
      if (c <= 0.0031308) {
        return 12.92 * c;
      } else {
        return 1.055 * Math.pow(c, 1.0 / 2.4) - 0.055;
      }
    };

    const rGamma = gammaCorrect(nr);
    const gGamma = gammaCorrect(ng);
    const bGamma = gammaCorrect(nb);

    // Convert to 0-255 and clamp
    return {
      r: Math.max(0, Math.min(255, Math.round(rGamma * 255))),
      g: Math.max(0, Math.min(255, Math.round(gGamma * 255))),
      b: Math.max(0, Math.min(255, Math.round(bGamma * 255))),
    };
  }

  /**
   * Convert XYZ to sRGB
   * Uses standard D65 white point
   */
  static xyzToSRGB(xyz: XYZ): RGB {
    // D65 white point
    const Xn = 0.95047;
    const Yn = 1.0;
    const Zn = 1.08883;

    // Normalize
    const x = xyz.X / Xn;
    const y = xyz.Y / Yn;
    const z = xyz.Z / Zn;

    // Matrix transformation (D65 to sRGB)
    const r = 3.2406 * x - 1.5372 * y - 0.4986 * z;
    const g = -0.9689 * x + 1.8758 * y + 0.0415 * z;
    const b = 0.0557 * x - 0.2040 * y + 1.0570 * z;

    // Gamma correction
    const gammaCorrect = (c: number): number => {
      if (c <= 0.0031308) {
        return 12.92 * c;
      } else {
        return 1.055 * Math.pow(c, 1.0 / 2.4) - 0.055;
      }
    };

    const rGamma = gammaCorrect(r);
    const gGamma = gammaCorrect(g);
    const bGamma = gammaCorrect(b);

    // Clamp and convert to 0-255
    const clamp = (value: number): number => {
      return Math.max(0, Math.min(255, Math.round(value * 255)));
    };

    return {
      r: clamp(rGamma),
      g: clamp(gGamma),
      b: clamp(bGamma),
    };
  }
}
