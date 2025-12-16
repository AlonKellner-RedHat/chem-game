/**
 * sRGB Color Space Conversion
 *
 * Converts CIE XYZ tristimulus values to sRGB color space.
 * Uses the standard IEC 61966-2-1 sRGB specification.
 */

/**
 * XYZ to linear sRGB matrix (D65 adapted)
 *
 * This matrix converts from CIE XYZ (D65) to linear sRGB.
 * Note: Do NOT divide by D65 white point before applying this matrix -
 * the matrix is already designed for D65 input.
 */
const XYZ_TO_SRGB_MATRIX = [
  [3.2406, -1.5372, -0.4986],
  [-0.9689, 1.8758, 0.0415],
  [0.0557, -0.204, 1.057],
];

/**
 * Apply sRGB gamma correction to a single linear value
 *
 * sRGB uses a piecewise gamma function:
 * - Linear portion for very small values: 12.92 × c
 * - Power function for larger values: 1.055 × c^(1/2.4) - 0.055
 *
 * @param linear - Linear RGB value (can exceed 1.0)
 * @returns Gamma-corrected value
 */
export function gammaCorrect(linear: number): number {
  if (linear <= 0) {
    return 0;
  }

  if (linear <= 0.0031308) {
    return 12.92 * linear;
  }

  return 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
}

/**
 * Convert XYZ to linear RGB (no gamma)
 *
 * @param xyz - [X, Y, Z] tristimulus values
 * @returns [r, g, b] linear RGB values (may exceed 0-1 range)
 */
export function xyzToLinearRGB(xyz: [number, number, number]): [number, number, number] {
  const [X, Y, Z] = xyz;

  const r =
    XYZ_TO_SRGB_MATRIX[0][0] * X + XYZ_TO_SRGB_MATRIX[0][1] * Y + XYZ_TO_SRGB_MATRIX[0][2] * Z;
  const g =
    XYZ_TO_SRGB_MATRIX[1][0] * X + XYZ_TO_SRGB_MATRIX[1][1] * Y + XYZ_TO_SRGB_MATRIX[1][2] * Z;
  const b =
    XYZ_TO_SRGB_MATRIX[2][0] * X + XYZ_TO_SRGB_MATRIX[2][1] * Y + XYZ_TO_SRGB_MATRIX[2][2] * Z;

  return [r, g, b];
}

/**
 * Convert XYZ to sRGB with gamma correction
 *
 * @param xyz - [X, Y, Z] tristimulus values
 * @param clamp - Whether to clamp output to 0-1 range
 * @returns [r, g, b] sRGB values (0-1 if clamped)
 */
export function xyzToSRGB(xyz: [number, number, number], clamp = true): [number, number, number] {
  const [r, g, b] = xyzToLinearRGB(xyz);

  let sr = gammaCorrect(r);
  let sg = gammaCorrect(g);
  let sb = gammaCorrect(b);

  if (clamp) {
    sr = Math.max(0, Math.min(1, sr));
    sg = Math.max(0, Math.min(1, sg));
    sb = Math.max(0, Math.min(1, sb));
  }

  return [sr, sg, sb];
}

/**
 * Convert sRGB to 8-bit integers (0-255)
 *
 * @param srgb - [r, g, b] sRGB values (0-1)
 * @returns [r, g, b] 8-bit values (0-255)
 */
export function srgbTo8Bit(srgb: [number, number, number]): [number, number, number] {
  return [
    Math.round(Math.max(0, Math.min(255, srgb[0] * 255))),
    Math.round(Math.max(0, Math.min(255, srgb[1] * 255))),
    Math.round(Math.max(0, Math.min(255, srgb[2] * 255))),
  ];
}

/**
 * Convert XYZ directly to 8-bit sRGB
 *
 * @param xyz - [X, Y, Z] tristimulus values
 * @returns [r, g, b] 8-bit values (0-255)
 */
export function xyzTo8BitSRGB(xyz: [number, number, number]): [number, number, number] {
  return srgbTo8Bit(xyzToSRGB(xyz));
}

/**
 * Normalize XYZ values relative to a reference white
 *
 * @param xyz - [X, Y, Z] tristimulus values
 * @param maxY - Maximum Y value for normalization
 * @returns Normalized [X, Y, Z]
 */
export function normalizeXYZ(
  xyz: [number, number, number],
  maxY: number
): [number, number, number] {
  if (maxY <= 0) {
    return [0, 0, 0];
  }

  return [xyz[0] / maxY, xyz[1] / maxY, xyz[2] / maxY];
}
