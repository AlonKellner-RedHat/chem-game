/**
 * Logarithmic scale conversion utilities
 * Converts between linear slider positions (0-1) and logarithmic values
 */

/**
 * Convert linear slider position (0-1) to logarithmic value
 * @param position Linear position between 0 and 1
 * @param min Minimum value
 * @param max Maximum value
 * @returns Logarithmic value between min and max
 */
export function linearToLogarithmic(
  position: number,
  min: number,
  max: number
): number {
  if (position <= 0) return min;
  if (position >= 1) return max;
  if (min <= 0) {
    // Special case: when min is 0, use a small offset to avoid log(0)
    const offset = max * 1e-10;
    const logMin = Math.log(offset);
    const logMax = Math.log(max);
    const logValue = logMin + position * (logMax - logMin);
    return Math.exp(logValue);
  }
  const logMin = Math.log(min);
  const logMax = Math.log(max);
  const logValue = logMin + position * (logMax - logMin);
  return Math.exp(logValue);
}

/**
 * Convert logarithmic value to linear slider position (0-1)
 * @param value Logarithmic value between min and max
 * @param min Minimum value
 * @param max Maximum value
 * @returns Linear position between 0 and 1
 */
export function logarithmicToLinear(
  value: number,
  min: number,
  max: number
): number {
  if (value <= min) return 0;
  if (value >= max) return 1;
  if (min <= 0) {
    // Special case: when min is 0, use a small offset to avoid log(0)
    const offset = max * 1e-10;
    const logMin = Math.log(offset);
    const logMax = Math.log(max);
    const logValue = Math.log(Math.max(value, offset));
    return (logValue - logMin) / (logMax - logMin);
  }
  const logMin = Math.log(min);
  const logMax = Math.log(max);
  const logValue = Math.log(value);
  return (logValue - logMin) / (logMax - logMin);
}

