/**
 * Spectrum Integration
 *
 * This module provides:
 * 1. CIE XYZ color integration for spectral power distributions
 * 2. Bin integration utilities for spectral profiles
 *
 * The bin integration functions ensure the "equal representation" principle:
 * every wavelength contributes to exactly one bin, and the sum of all bins
 * equals the analytical integral. This is critical for capturing narrow
 * spectral features (like 0.1nm emission lines) in coarse wavelength grids.
 *
 * Energy Conservation:
 *   ∑ binIntegrals = ∫ profile(λ) dλ over full range
 */

import { getCIE_X, getCIE_Y, getCIE_Z } from './cie';
import { VISIBLE_MAX, VISIBLE_MIN } from './constants';
import { voigtProfile } from './voigt';

// Constants
const SQRT_PI = Math.sqrt(Math.PI);
const SQRT_2 = Math.sqrt(2);
const SQRT_LN2 = Math.sqrt(Math.LN2);

/**
 * Error function approximation using Horner's method
 * Accurate to about 1.5×10^-7
 *
 * Based on Abramowitz and Stegun approximation 7.1.26
 */
function erf(x: number): number {
  // Save the sign
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);

  // Constants for approximation
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  // Approximation
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return sign * y;
}

/**
 * Integrate a Gaussian profile over a bin [binStart, binEnd]
 *
 * The Gaussian is centered at `center` with given FWHM.
 * Returns the fraction of the total Gaussian area within the bin.
 *
 * Analytical formula using the error function:
 *   ∫[a,b] G(x) dx = (1/2)[erf((b-μ)/(σ√2)) - erf((a-μ)/(σ√2))]
 *
 * @param center - Center wavelength of the Gaussian peak (nm)
 * @param binStart - Start of the wavelength bin (nm)
 * @param binEnd - End of the wavelength bin (nm)
 * @param fwhm - Full Width at Half Maximum of the Gaussian (nm)
 * @returns Fraction of total Gaussian area in this bin (0-1)
 */
export function integrateGaussianOverBin(
  center: number,
  binStart: number,
  binEnd: number,
  fwhm: number
): number {
  if (fwhm <= 0) {
    // Delta function: all energy in one bin if center is within
    return binStart <= center && center < binEnd ? 1.0 : 0.0;
  }

  // Convert FWHM to sigma: σ = FWHM / (2√(2ln2))
  const sigma = fwhm / (2 * SQRT_LN2 * SQRT_2);

  // Normalized distance from center
  const zStart = (binStart - center) / (sigma * SQRT_2);
  const zEnd = (binEnd - center) / (sigma * SQRT_2);

  // Integral using error function
  return 0.5 * (erf(zEnd) - erf(zStart));
}

/**
 * Integrate a Lorentzian profile over a bin [binStart, binEnd]
 *
 * The Lorentzian is centered at `center` with given FWHM.
 * Returns the fraction of the total Lorentzian area within the bin.
 *
 * Analytical formula using arctangent:
 *   L(x) = (γ/π) / (x² + γ²)  where γ = FWHM/2
 *   ∫[a,b] L(x) dx = (1/π)[arctan((b-μ)/γ) - arctan((a-μ)/γ)]
 *
 * @param center - Center wavelength of the Lorentzian peak (nm)
 * @param binStart - Start of the wavelength bin (nm)
 * @param binEnd - End of the wavelength bin (nm)
 * @param fwhm - Full Width at Half Maximum of the Lorentzian (nm)
 * @returns Fraction of total Lorentzian area in this bin (0-1)
 */
export function integrateLorentzianOverBin(
  center: number,
  binStart: number,
  binEnd: number,
  fwhm: number
): number {
  if (fwhm <= 0) {
    // Delta function: all energy in one bin if center is within
    return binStart <= center && center < binEnd ? 1.0 : 0.0;
  }

  // Half-width at half-maximum
  const gamma = fwhm / 2;

  // Integral using arctangent
  const atanEnd = Math.atan((binEnd - center) / gamma);
  const atanStart = Math.atan((binStart - center) / gamma);

  return (atanEnd - atanStart) / Math.PI;
}

/**
 * Integrate a Voigt profile over a bin [binStart, binEnd]
 *
 * The Voigt profile is the convolution of Gaussian and Lorentzian.
 * There's no simple closed-form integral, so we use numerical integration
 * with adaptive step size based on the profile widths.
 *
 * For the special cases where one width is 0, we use the analytical
 * formulas for pure Gaussian or Lorentzian.
 *
 * @param center - Center wavelength of the Voigt peak (nm)
 * @param binStart - Start of the wavelength bin (nm)
 * @param binEnd - End of the wavelength bin (nm)
 * @param gaussianFWHM - Gaussian (Doppler) FWHM (nm)
 * @param lorentzianFWHM - Lorentzian (natural/pressure) FWHM (nm)
 * @returns Fraction of total Voigt area in this bin (0-1)
 */
export function integrateVoigtOverBin(
  center: number,
  binStart: number,
  binEnd: number,
  gaussianFWHM: number,
  lorentzianFWHM: number
): number {
  // Handle edge cases - reduce to simpler profiles
  if (gaussianFWHM <= 0 && lorentzianFWHM <= 0) {
    // Delta function
    return binStart <= center && center < binEnd ? 1.0 : 0.0;
  }

  if (lorentzianFWHM <= 0) {
    // Pure Gaussian
    return integrateGaussianOverBin(center, binStart, binEnd, gaussianFWHM);
  }

  if (gaussianFWHM <= 0) {
    // Pure Lorentzian
    return integrateLorentzianOverBin(center, binStart, binEnd, lorentzianFWHM);
  }

  // General Voigt case - numerical integration
  // Use Simpson's rule with adaptive number of steps based on bin width and linewidth

  // Estimate the effective Voigt FWHM (Olivero-Longbothum approximation)
  const voigtFWHM =
    0.5346 * lorentzianFWHM +
    Math.sqrt(0.2166 * lorentzianFWHM * lorentzianFWHM + gaussianFWHM * gaussianFWHM);

  const binWidth = binEnd - binStart;

  // If bin is far from peak, quick check and return ~0
  // But Lorentzian tails decay slowly (1/x²), so we need to be conservative
  const distanceFromPeak = Math.min(Math.abs(binStart - center), Math.abs(binEnd - center));

  // Only skip if VERY far from peak (>1000× the width)
  // Lorentzian tails are important for energy conservation
  if (distanceFromPeak > 1000 * voigtFWHM && !(binStart <= center && center <= binEnd)) {
    return 0;
  }

  // Number of integration steps: at least 10, more for narrow peaks
  const minSteps = 10;
  const stepsPerFWHM = 20;
  const numSteps = Math.max(minSteps, Math.ceil((binWidth / voigtFWHM) * stepsPerFWHM));

  // Make it even for Simpson's rule
  const n = numSteps % 2 === 0 ? numSteps : numSteps + 1;
  const h = binWidth / n;

  // Simpson's rule: ∫f ≈ (h/3)[f(a) + 4f(a+h) + 2f(a+2h) + 4f(a+3h) + ... + f(b)]
  let sum =
    voigtProfile(binStart - center, gaussianFWHM, lorentzianFWHM) +
    voigtProfile(binEnd - center, gaussianFWHM, lorentzianFWHM);

  for (let i = 1; i < n; i++) {
    const x = binStart + i * h - center;
    const weight = i % 2 === 1 ? 4 : 2;
    sum += weight * voigtProfile(x, gaussianFWHM, lorentzianFWHM);
  }

  return (sum * h) / 3;
}

/**
 * Integrate extinction coefficient over a bin for a set of peaks
 *
 * This is used for absorption spectra where multiple Voigt peaks contribute.
 * Returns the average extinction coefficient over the bin.
 *
 * @param binStart - Start of the wavelength bin (nm)
 * @param binEnd - End of the wavelength bin (nm)
 * @param peaks - Array of peaks with {wavelength, extinction, gaussianFWHM, lorentzianFWHM}
 * @returns Average extinction coefficient over the bin
 */
export function integrateExtinctionOverBin(
  binStart: number,
  binEnd: number,
  peaks: Array<{
    wavelength: number;
    extinction: number;
    gaussianFWHM: number;
    lorentzianFWHM: number;
  }>
): number {
  const binWidth = binEnd - binStart;
  if (binWidth <= 0) return 0;

  let totalExtinction = 0;

  for (const peak of peaks) {
    // The integral of the Voigt profile gives the fraction of area in this bin
    // Multiply by peak extinction to get the contribution
    const fraction = integrateVoigtOverBin(
      peak.wavelength,
      binStart,
      binEnd,
      peak.gaussianFWHM,
      peak.lorentzianFWHM
    );

    // For extinction, we want the average over the bin (not the total)
    // Since Voigt integrates to 1, we need to scale by the bin width
    // Actually, the peak extinction represents the HEIGHT of the peak,
    // and the Voigt profile is normalized to integrate to 1.
    // So the integrated extinction in the bin is: extinction × fraction
    // And the average extinction is: extinction × fraction / binWidth × totalVoigtArea
    //
    // But wait - the Voigt profile as we use it is normalized so ∫V(x)dx = 1
    // The actual spectral line has area = extinction × linewidth (approximately)
    // For bin integration, we want: extinction × (fraction of peak in this bin)
    //
    // The fraction returned by integrateVoigtOverBin is already correct.
    totalExtinction += peak.extinction * fraction;
  }

  return totalExtinction;
}

// ============================================================================
// CIE XYZ Color Integration
// ============================================================================

/**
 * Integrate a spectrum to XYZ tristimulus values
 *
 * Uses the formula:
 * X = ∫ S(λ) × x̄(λ) dλ
 * Y = ∫ S(λ) × ȳ(λ) dλ
 * Z = ∫ S(λ) × z̄(λ) dλ
 *
 * @param spectrum - Spectrum values (intensity at each wavelength)
 * @param wavelengthMin - Minimum wavelength of spectrum (nm)
 * @param wavelengthMax - Maximum wavelength of spectrum (nm)
 * @returns [X, Y, Z] tristimulus values
 */
export function integrateToXYZ(
  spectrum: Float32Array | number[],
  wavelengthMin: number,
  wavelengthMax: number
): [number, number, number] {
  const resolution = spectrum.length;
  if (resolution === 0) {
    return [0, 0, 0];
  }

  const step = (wavelengthMax - wavelengthMin) / (resolution - 1);
  const dLambda = step; // Integration step

  let X = 0,
    Y = 0,
    Z = 0;

  for (let i = 0; i < resolution; i++) {
    const wavelength = wavelengthMin + i * step;
    const intensity = spectrum[i];

    // CIE functions are only defined in visible range
    if (wavelength >= VISIBLE_MIN && wavelength <= VISIBLE_MAX) {
      const xBar = getCIE_X(wavelength);
      const yBar = getCIE_Y(wavelength);
      const zBar = getCIE_Z(wavelength);

      X += intensity * xBar * dLambda;
      Y += intensity * yBar * dLambda;
      Z += intensity * zBar * dLambda;
    }
  }

  return [X, Y, Z];
}

/**
 * Fast integration for rendering (fixed wavelength samples)
 *
 * Uses fewer samples for real-time performance.
 *
 * @param getIntensityAt - Function to get spectrum intensity at wavelength
 * @param numSamples - Number of wavelength samples (default 16)
 * @returns [X, Y, Z] tristimulus values
 */
export function fastIntegrateToXYZ(
  getIntensityAt: (wavelength: number) => number,
  numSamples = 16
): [number, number, number] {
  const dLambda = (VISIBLE_MAX - VISIBLE_MIN) / numSamples;

  let X = 0,
    Y = 0,
    Z = 0;

  for (let i = 0; i < numSamples; i++) {
    // Sample at center of each interval
    const wavelength = VISIBLE_MIN + (i + 0.5) * dLambda;
    const intensity = getIntensityAt(wavelength);

    const xBar = getCIE_X(wavelength);
    const yBar = getCIE_Y(wavelength);
    const zBar = getCIE_Z(wavelength);

    X += intensity * xBar * dLambda;
    Y += intensity * yBar * dLambda;
    Z += intensity * zBar * dLambda;
  }

  return [X, Y, Z];
}

/**
 * Generate D65 illuminant spectrum
 *
 * D65 represents average daylight with correlated color temperature of 6504K.
 * This is a simplified version using a uniform visible spectrum.
 *
 * @param wavelengthMin - Minimum wavelength (nm)
 * @param wavelengthMax - Maximum wavelength (nm)
 * @param resolution - Number of samples
 * @returns D65 spectrum values (normalized)
 */
export function generateD65Spectrum(
  wavelengthMin: number,
  wavelengthMax: number,
  resolution: number
): Float32Array {
  const spectrum = new Float32Array(resolution);
  const step = (wavelengthMax - wavelengthMin) / (resolution - 1);

  for (let i = 0; i < resolution; i++) {
    const wavelength = wavelengthMin + i * step;

    if (wavelength >= VISIBLE_MIN && wavelength <= VISIBLE_MAX) {
      spectrum[i] = 1.0; // Uniform in visible range
    } else {
      // Fade in UV/IR
      if (wavelength < VISIBLE_MIN) {
        const t = (wavelength - 200) / (VISIBLE_MIN - 200);
        spectrum[i] = Math.max(0, t);
      } else {
        const t = (wavelength - VISIBLE_MAX) / (1000 - VISIBLE_MAX);
        spectrum[i] = Math.max(0, 1 - t);
      }
    }
  }

  return spectrum;
}
