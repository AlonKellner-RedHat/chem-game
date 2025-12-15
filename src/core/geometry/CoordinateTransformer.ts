/**
 * CoordinateTransformer
 *
 * Utility for transforming between normalized (0-1) and pixel coordinates.
 * Enables responsive shape scaling that maintains relative positions.
 *
 * OCP Design: Closed for modification, open for extension.
 * - Pure functions with no side effects
 * - Can be extended with new transformation strategies without modification
 */

/**
 * Normalized rectangle with coordinates in 0-1 range.
 * Position and size are relative to screen dimensions.
 */
export interface NormalizedRect {
  /** Normalized x position (0 = left edge, 1 = right edge) */
  nx: number;
  /** Normalized y position (0 = top edge, 1 = bottom edge) */
  ny: number;
  /** Normalized width (0 = zero width, 1 = full screen width) */
  nw: number;
  /** Normalized height (0 = zero height, 1 = full screen height) */
  nh: number;
}

/**
 * Pixel rectangle with absolute coordinates.
 */
export interface PixelRect {
  /** X position in pixels */
  x: number;
  /** Y position in pixels */
  y: number;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
}

/**
 * Convert normalized coordinates (0-1) to pixel coordinates.
 *
 * @param normalized - Rectangle in normalized coordinates
 * @param screenWidth - Target screen width in pixels
 * @param screenHeight - Target screen height in pixels
 * @returns Rectangle in pixel coordinates
 */
export function toPixelRect(
  normalized: NormalizedRect,
  screenWidth: number,
  screenHeight: number
): PixelRect {
  return {
    x: normalized.nx * screenWidth,
    y: normalized.ny * screenHeight,
    width: normalized.nw * screenWidth,
    height: normalized.nh * screenHeight,
  };
}

/**
 * Convert pixel coordinates to normalized coordinates (0-1).
 *
 * @param pixels - Rectangle in pixel coordinates
 * @param baseWidth - Base/reference screen width in pixels
 * @param baseHeight - Base/reference screen height in pixels
 * @returns Rectangle in normalized coordinates
 */
export function toNormalizedRect(
  pixels: PixelRect,
  baseWidth: number,
  baseHeight: number
): NormalizedRect {
  return {
    nx: pixels.x / baseWidth,
    ny: pixels.y / baseHeight,
    nw: pixels.width / baseWidth,
    nh: pixels.height / baseHeight,
  };
}

