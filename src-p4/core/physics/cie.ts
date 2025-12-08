/**
 * CIE Color Matching Functions
 * 
 * Implements CIE 1931 2° standard observer color matching functions
 * for converting spectral power distributions to XYZ tristimulus values.
 * 
 * Data from CIE 15:2004 (colorimetry standard)
 */

import { VISIBLE_MIN, VISIBLE_MAX } from './constants';

/**
 * CIE 1931 2° color matching function data
 * Wavelength range: 380-700nm at 5nm intervals
 * 
 * Each row: [wavelength, x̄, ȳ, z̄]
 */
const CIE_DATA: [number, number, number, number][] = [
  [380, 0.001368, 0.000039, 0.006450],
  [385, 0.002236, 0.000064, 0.010550],
  [390, 0.004243, 0.000120, 0.020050],
  [395, 0.007650, 0.000217, 0.036210],
  [400, 0.014310, 0.000396, 0.067850],
  [405, 0.023190, 0.000640, 0.110200],
  [410, 0.043510, 0.001210, 0.207400],
  [415, 0.077630, 0.002180, 0.371300],
  [420, 0.134380, 0.004000, 0.645600],
  [425, 0.214770, 0.007300, 1.039050],
  [430, 0.283900, 0.011600, 1.385600],
  [435, 0.328500, 0.016840, 1.622960],
  [440, 0.348280, 0.023000, 1.747060],
  [445, 0.348060, 0.029800, 1.782600],
  [450, 0.336200, 0.038000, 1.772110],
  [455, 0.318700, 0.048000, 1.744100],
  [460, 0.290800, 0.060000, 1.669200],
  [465, 0.251100, 0.073900, 1.528100],
  [470, 0.195360, 0.090980, 1.287640],
  [475, 0.142100, 0.112600, 1.041900],
  [480, 0.095640, 0.139020, 0.812950],
  [485, 0.058010, 0.169300, 0.616200],
  [490, 0.032010, 0.208020, 0.465180],
  [495, 0.014700, 0.258600, 0.353300],
  [500, 0.004900, 0.323000, 0.272000],
  [505, 0.002400, 0.407300, 0.212300],
  [510, 0.009300, 0.503000, 0.158200],
  [515, 0.029100, 0.608200, 0.111700],
  [520, 0.063270, 0.710000, 0.078250],
  [525, 0.109600, 0.793200, 0.057250],
  [530, 0.165500, 0.862000, 0.042160],
  [535, 0.225750, 0.914850, 0.029840],
  [540, 0.290400, 0.954000, 0.020300],
  [545, 0.359700, 0.980300, 0.013400],
  [550, 0.433450, 0.994950, 0.008750],
  [555, 0.512050, 1.000000, 0.005750],
  [560, 0.594500, 0.995000, 0.003900],
  [565, 0.678400, 0.978600, 0.002750],
  [570, 0.762100, 0.952000, 0.002100],
  [575, 0.842500, 0.915400, 0.001800],
  [580, 0.916300, 0.870000, 0.001650],
  [585, 0.978600, 0.816300, 0.001400],
  [590, 1.026300, 0.757000, 0.001100],
  [595, 1.056700, 0.694900, 0.001000],
  [600, 1.062200, 0.631000, 0.000800],
  [605, 1.045600, 0.566800, 0.000600],
  [610, 1.002600, 0.503000, 0.000340],
  [615, 0.938400, 0.441200, 0.000240],
  [620, 0.854450, 0.381000, 0.000190],
  [625, 0.751400, 0.321000, 0.000100],
  [630, 0.642400, 0.265000, 0.000050],
  [635, 0.541900, 0.217000, 0.000030],
  [640, 0.447900, 0.175000, 0.000020],
  [645, 0.360800, 0.138200, 0.000010],
  [650, 0.283500, 0.107000, 0.000000],
  [655, 0.218700, 0.081600, 0.000000],
  [660, 0.164900, 0.061000, 0.000000],
  [665, 0.121200, 0.044580, 0.000000],
  [670, 0.087400, 0.032000, 0.000000],
  [675, 0.063600, 0.023200, 0.000000],
  [680, 0.046770, 0.017000, 0.000000],
  [685, 0.032900, 0.011920, 0.000000],
  [690, 0.022700, 0.008210, 0.000000],
  [695, 0.015840, 0.005723, 0.000000],
  [700, 0.011359, 0.004102, 0.000000],
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
  return [
    getCIE_X(wavelengthNm),
    getCIE_Y(wavelengthNm),
    getCIE_Z(wavelengthNm),
  ];
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
  
  let maxX = 0, maxY = 0, maxZ = 0;
  
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



