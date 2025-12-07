/**
 * Spectrum Integration
 * 
 * Integrates spectral power distributions to CIE XYZ tristimulus values.
 * Uses numerical integration with configurable resolution.
 */

import { getCIE_X, getCIE_Y, getCIE_Z } from './cie';
import { VISIBLE_MIN, VISIBLE_MAX } from './constants';

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
  
  let X = 0, Y = 0, Z = 0;
  
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
 * Integrate spectrum with D65 illuminant weighting
 * 
 * This version multiplies by D65 illuminant intensity,
 * matching the GPU shader behavior.
 * 
 * @param spectrum - Transmission/intensity values
 * @param d65Spectrum - D65 illuminant values (same resolution)
 * @param wavelengthMin - Minimum wavelength (nm)
 * @param wavelengthMax - Maximum wavelength (nm)
 * @returns [X, Y, Z] tristimulus values
 */
export function integrateWithD65(
  spectrum: Float32Array | number[],
  d65Spectrum: Float32Array | number[],
  wavelengthMin: number,
  wavelengthMax: number
): [number, number, number] {
  const resolution = spectrum.length;
  if (resolution === 0 || d65Spectrum.length !== resolution) {
    return [0, 0, 0];
  }
  
  const step = (wavelengthMax - wavelengthMin) / (resolution - 1);
  const dLambda = step;
  
  let X = 0, Y = 0, Z = 0;
  
  for (let i = 0; i < resolution; i++) {
    const wavelength = wavelengthMin + i * step;
    const intensity = spectrum[i];
    const d65 = d65Spectrum[i];
    
    if (wavelength >= VISIBLE_MIN && wavelength <= VISIBLE_MAX) {
      const xBar = getCIE_X(wavelength);
      const yBar = getCIE_Y(wavelength);
      const zBar = getCIE_Z(wavelength);
      
      X += d65 * intensity * xBar * dLambda;
      Y += d65 * intensity * yBar * dLambda;
      Z += d65 * intensity * zBar * dLambda;
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
  numSamples: number = 16
): [number, number, number] {
  const dLambda = (VISIBLE_MAX - VISIBLE_MIN) / numSamples;
  
  let X = 0, Y = 0, Z = 0;
  
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
 * This is a simplified version using black body approximation.
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
  
  // D65 is approximately a 6504K black body in the visible range
  // We use a simplified uniform spectrum for now
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


