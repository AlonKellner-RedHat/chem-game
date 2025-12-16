/**
 * CIE Color Matching Functions
 *
 * Implements CIE 1931 2° standard observer color matching functions
 * for converting spectral power distributions to XYZ tristimulus values.
 *
 * Data from CIE 15:2004 (colorimetry standard)
 */

import { VISIBLE_MAX, VISIBLE_MIN } from './constants';

/**
 * CIE 1931 2° color matching function data
 * Wavelength range: 380-700nm at 5nm intervals
 *
 * Each row: [wavelength, x̄, ȳ, z̄]
 */
const CIE_DATA: [number, number, number, number][] = [
  [380, 0.001368, 0.000039, 0.00645],
  [385, 0.002236, 0.000064, 0.01055],
  [390, 0.004243, 0.00012, 0.02005],
  [395, 0.00765, 0.000217, 0.03621],
  [400, 0.01431, 0.000396, 0.06785],
  [405, 0.02319, 0.00064, 0.1102],
  [410, 0.04351, 0.00121, 0.2074],
  [415, 0.07763, 0.00218, 0.3713],
  [420, 0.13438, 0.004, 0.6456],
  [425, 0.21477, 0.0073, 1.03905],
  [430, 0.2839, 0.0116, 1.3856],
  [435, 0.3285, 0.01684, 1.62296],
  [440, 0.34828, 0.023, 1.74706],
  [445, 0.34806, 0.0298, 1.7826],
  [450, 0.3362, 0.038, 1.77211],
  [455, 0.3187, 0.048, 1.7441],
  [460, 0.2908, 0.06, 1.6692],
  [465, 0.2511, 0.0739, 1.5281],
  [470, 0.19536, 0.09098, 1.28764],
  [475, 0.1421, 0.1126, 1.0419],
  [480, 0.09564, 0.13902, 0.81295],
  [485, 0.05801, 0.1693, 0.6162],
  [490, 0.03201, 0.20802, 0.46518],
  [495, 0.0147, 0.2586, 0.3533],
  [500, 0.0049, 0.323, 0.272],
  [505, 0.0024, 0.4073, 0.2123],
  [510, 0.0093, 0.503, 0.1582],
  [515, 0.0291, 0.6082, 0.1117],
  [520, 0.06327, 0.71, 0.07825],
  [525, 0.1096, 0.7932, 0.05725],
  [530, 0.1655, 0.862, 0.04216],
  [535, 0.22575, 0.91485, 0.02984],
  [540, 0.2904, 0.954, 0.0203],
  [545, 0.3597, 0.9803, 0.0134],
  [550, 0.43345, 0.99495, 0.00875],
  [555, 0.51205, 1.0, 0.00575],
  [560, 0.5945, 0.995, 0.0039],
  [565, 0.6784, 0.9786, 0.00275],
  [570, 0.7621, 0.952, 0.0021],
  [575, 0.8425, 0.9154, 0.0018],
  [580, 0.9163, 0.87, 0.00165],
  [585, 0.9786, 0.8163, 0.0014],
  [590, 1.0263, 0.757, 0.0011],
  [595, 1.0567, 0.6949, 0.001],
  [600, 1.0622, 0.631, 0.0008],
  [605, 1.0456, 0.5668, 0.0006],
  [610, 1.0026, 0.503, 0.00034],
  [615, 0.9384, 0.4412, 0.00024],
  [620, 0.85445, 0.381, 0.00019],
  [625, 0.7514, 0.321, 0.0001],
  [630, 0.6424, 0.265, 0.00005],
  [635, 0.5419, 0.217, 0.00003],
  [640, 0.4479, 0.175, 0.00002],
  [645, 0.3608, 0.1382, 0.00001],
  [650, 0.2835, 0.107, 0.0],
  [655, 0.2187, 0.0816, 0.0],
  [660, 0.1649, 0.061, 0.0],
  [665, 0.1212, 0.04458, 0.0],
  [670, 0.0874, 0.032, 0.0],
  [675, 0.0636, 0.0232, 0.0],
  [680, 0.04677, 0.017, 0.0],
  [685, 0.0329, 0.01192, 0.0],
  [690, 0.0227, 0.00821, 0.0],
  [695, 0.01584, 0.005723, 0.0],
  [700, 0.011359, 0.004102, 0.0],
];

/**
 * Get CIE x̄ value at a wavelength (linear interpolation)
 */
export function getCIE_X(wavelengthNm: number): number {
  return interpolateCIE(wavelengthNm, 1);
}

/**
 * Get CIE ȳ value at a wavelength (linear interpolation)
 */
export function getCIE_Y(wavelengthNm: number): number {
  return interpolateCIE(wavelengthNm, 2);
}

/**
 * Get CIE z̄ value at a wavelength (linear interpolation)
 */
export function getCIE_Z(wavelengthNm: number): number {
  return interpolateCIE(wavelengthNm, 3);
}

/**
 * Get all CIE values at a wavelength
 */
export function getCIE_XYZ(wavelengthNm: number): [number, number, number] {
  return [getCIE_X(wavelengthNm), getCIE_Y(wavelengthNm), getCIE_Z(wavelengthNm)];
}

/**
 * Interpolate CIE data at a wavelength
 */
function interpolateCIE(wavelengthNm: number, column: 1 | 2 | 3): number {
  // Outside visible range
  if (wavelengthNm < VISIBLE_MIN || wavelengthNm > VISIBLE_MAX) {
    return 0;
  }

  // Find bounding data points
  let lowerIndex = 0;
  for (let i = 0; i < CIE_DATA.length - 1; i++) {
    if (CIE_DATA[i][0] <= wavelengthNm && CIE_DATA[i + 1][0] >= wavelengthNm) {
      lowerIndex = i;
      break;
    }
  }

  const lower = CIE_DATA[lowerIndex];
  const upper = CIE_DATA[lowerIndex + 1];

  // Linear interpolation
  const t = (wavelengthNm - lower[0]) / (upper[0] - lower[0]);
  return lower[column] + t * (upper[column] - lower[column]);
}

/**
 * Generate CIE color matching function texture data
 *
 * @param wavelengthMin - Minimum wavelength (nm)
 * @param wavelengthMax - Maximum wavelength (nm)
 * @param resolution - Number of samples
 * @returns Object with x, y, z arrays and scale factors
 */
export function generateCIETextures(
  wavelengthMin: number,
  wavelengthMax: number,
  resolution: number
): {
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  scales: { x: number; y: number; z: number };
} {
  const xData = new Float32Array(resolution);
  const yData = new Float32Array(resolution);
  const zData = new Float32Array(resolution);

  const step = (wavelengthMax - wavelengthMin) / (resolution - 1);

  let maxX = 0,
    maxY = 0,
    maxZ = 0;

  for (let i = 0; i < resolution; i++) {
    const wavelength = wavelengthMin + i * step;
    xData[i] = getCIE_X(wavelength);
    yData[i] = getCIE_Y(wavelength);
    zData[i] = getCIE_Z(wavelength);

    maxX = Math.max(maxX, xData[i]);
    maxY = Math.max(maxY, yData[i]);
    maxZ = Math.max(maxZ, zData[i]);
  }

  // Normalize to 0-1 range for texture storage
  const scales = {
    x: maxX || 1,
    y: maxY || 1,
    z: maxZ || 1,
  };

  for (let i = 0; i < resolution; i++) {
    xData[i] /= scales.x;
    yData[i] /= scales.y;
    zData[i] /= scales.z;
  }

  return { x: xData, y: yData, z: zData, scales };
}
