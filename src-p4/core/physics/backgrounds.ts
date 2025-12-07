/**
 * Background Illumination Modes
 *
 * Implements the three background modes:
 * - Normal: D65 white light, uniform in visible, fades in UV/IR
 * - UV: UV illumination, peak at 250-350nm
 * - Dark: No illumination (emission only)
 */

import {
  VISIBLE_MIN,
  VISIBLE_MAX,
  NORMAL_UV_FADE_START,
  NORMAL_IR_FADE_END,
  UV_SHORT_FADE_START,
  UV_SHORT_FADE_END,
  UV_LONG_FADE_START,
  UV_LONG_FADE_END,
} from "./constants";
import { BackgroundMode } from "./config";

/**
 * Get normal (D65) background intensity at a wavelength
 *
 * - Visible (380-700nm): 1.0
 * - UV fade: rises from 0 at 250nm to 1.0 at 380nm
 * - IR fade: falls from 1.0 at 700nm to 0 at 850nm
 *
 * @param wavelengthNm - Wavelength in nanometers
 * @returns Intensity (0-1)
 */
export function getNormalBackgroundIntensity(wavelengthNm: number): number {
  // Visible range: full intensity
  if (wavelengthNm >= VISIBLE_MIN && wavelengthNm <= VISIBLE_MAX) {
    return 1.0;
  }

  // UV fade (< 380nm)
  if (wavelengthNm < VISIBLE_MIN) {
    if (wavelengthNm <= NORMAL_UV_FADE_START) {
      return 0;
    }
    // Fade from 250nm (0) to 380nm (1)
    const t =
      (wavelengthNm - NORMAL_UV_FADE_START) /
      (VISIBLE_MIN - NORMAL_UV_FADE_START);
    // Quadratic rise: 1 - (1-t)²
    return Math.max(0, 1 - (1 - t) * (1 - t));
  }

  // IR fade (> 700nm)
  if (wavelengthNm >= NORMAL_IR_FADE_END) {
    return 0;
  }
  // Fade from 700nm (1) to 850nm (0)
  const t = (wavelengthNm - VISIBLE_MAX) / (NORMAL_IR_FADE_END - VISIBLE_MAX);
  // Quadratic decay: 1 - t²
  return Math.max(0, 1 - t * t);
}

/**
 * Get UV background intensity at a wavelength
 *
 * - Peak at 250-350nm (1.0)
 * - Short fade: rises from 0 at 200nm to 1.0 at 250nm
 * - Long fade: falls from 1.0 at 350nm to 0 at 450nm
 *
 * @param wavelengthNm - Wavelength in nanometers
 * @returns Intensity (0-1)
 */
export function getUVBackgroundIntensity(wavelengthNm: number): number {
  // Below minimum: no light
  if (wavelengthNm < UV_SHORT_FADE_START) {
    return 0;
  }

  // Short wavelength fade-in (200-250nm)
  if (wavelengthNm < UV_SHORT_FADE_END) {
    const t =
      (wavelengthNm - UV_SHORT_FADE_START) /
      (UV_SHORT_FADE_END - UV_SHORT_FADE_START);
    // Fast rise: 1 - (1-t)²
    return 1 - (1 - t) * (1 - t);
  }

  // Peak UV range (250-350nm)
  if (wavelengthNm <= UV_LONG_FADE_START) {
    return 1.0;
  }

  // Long wavelength fade-out (350-450nm)
  if (wavelengthNm < UV_LONG_FADE_END) {
    const t =
      (wavelengthNm - UV_LONG_FADE_START) /
      (UV_LONG_FADE_END - UV_LONG_FADE_START);
    // Quadratic decay: 1 - t²
    return 1 - t * t;
  }

  // Beyond fade end: no UV light
  return 0;
}

/**
 * Get dark background intensity (always 0)
 *
 * @param _wavelengthNm - Wavelength in nanometers (unused)
 * @returns 0
 */
export function getDarkBackgroundIntensity(_wavelengthNm: number): number {
  return 0;
}

/**
 * Get background intensity at a wavelength for any mode
 *
 * @param wavelengthNm - Wavelength in nanometers
 * @param mode - Background mode ('normal', 'uv', or 'dark')
 * @returns Intensity (0-1)
 */
export function getBackgroundIntensity(
  wavelengthNm: number,
  mode: BackgroundMode
): number {
  switch (mode) {
    case "normal":
      return getNormalBackgroundIntensity(wavelengthNm);
    case "uv":
      return getUVBackgroundIntensity(wavelengthNm);
    case "dark":
      return getDarkBackgroundIntensity(wavelengthNm);
    default:
      return getNormalBackgroundIntensity(wavelengthNm);
  }
}

/**
 * Generate a full background spectrum array
 *
 * @param mode - Background mode
 * @param wavelengthMin - Minimum wavelength (nm)
 * @param wavelengthMax - Maximum wavelength (nm)
 * @param resolution - Number of samples
 * @returns Array of intensity values
 */
export function generateBackgroundSpectrum(
  mode: BackgroundMode,
  wavelengthMin: number,
  wavelengthMax: number,
  resolution: number
): Float32Array {
  const spectrum = new Float32Array(resolution);
  const step = (wavelengthMax - wavelengthMin) / (resolution - 1);

  for (let i = 0; i < resolution; i++) {
    const wavelength = wavelengthMin + i * step;
    spectrum[i] = getBackgroundIntensity(wavelength, mode);
  }

  return spectrum;
}

