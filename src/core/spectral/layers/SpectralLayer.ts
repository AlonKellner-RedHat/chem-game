import { SpectrumPoint } from '../CIE';
import { ShapeGeometry } from '../geometry/ShapeGeometry';
import { ScatteringProperties } from '../scattering/ScatteringProperties';
import { EmissionProperties } from '../emission/EmissionSpectrum';

/**
 * SpectralShape - a shape with full spectral properties (absorption, emission, scattering)
 */
export interface SpectralShape {
  readonly id: string;
  readonly geometry: ShapeGeometry;
  
  /**
   * Get absorption spectrum at a point (transmission values 0-1)
   * Used for filtering incoming light from layers behind
   */
  getAbsorptionSpectrum(): SpectrumPoint[];
  
  /**
   * Get base emission spectrum before self-absorption
   * Used for thermal glow, fluorescence, etc.
   */
  getBaseEmissionSpectrum(): SpectrumPoint[];
  
  /**
   * Get net emission spectrum after self-absorption
   * E_net(λ) = E(λ) × (1 - exp(-α(λ) × depth)) / (α(λ) × depth)
   */
  getNetEmissionSpectrum(): SpectrumPoint[];
  
  /**
   * Get scattering properties for blur calculation
   */
  getScattering(): ScatteringProperties;
  
  /**
   * Get emission properties (aura radius, decay, etc.)
   */
  getEmissionProperties(): EmissionProperties;
  
  /**
   * Update spectra when material properties change
   * Called by CPU to pre-compute spectra for GPU upload
   */
  updateSpectra(): void;
}

/**
 * SpectralLayer - a layer that can contain multiple non-overlapping shapes
 * with emission auras and scattering blur
 * 
 * OCP: New layer types can be added without modifying existing code
 */
export interface SpectralLayer {
  readonly id: string;
  readonly zOrder: number;  // Lower = further back
  
  /**
   * Get all shapes in this layer (non-overlapping within layer)
   */
  getShapes(): SpectralShape[];
  
  /**
   * Check if a point is inside any shape in this layer
   */
  containsPoint(x: number, y: number): boolean;
  
  /**
   * Get the shape at a specific point (if any)
   */
  getShapeAt(x: number, y: number): SpectralShape | null;
  
  /**
   * Get absorption at a specific point and wavelength
   * Returns 1.0 (fully transparent) if point is outside all shapes
   */
  getAbsorptionAt(x: number, y: number, wavelength: number): number;
  
  /**
   * Get net emission at a specific point and wavelength
   * Includes aura falloff for points outside shapes
   */
  getEmissionAt(x: number, y: number, wavelength: number): number;
  
  /**
   * Get aura intensity at a point (0-1)
   * - 1.0 inside any shape
   * - Decays exponentially with distance outside shapes
   * - Multiple nearby shapes' auras blend additively (clamped to 1.0)
   */
  getAuraIntensity(x: number, y: number): number;
  
  /**
   * Get scattering properties at a point
   * Returns NO_SCATTERING if point is outside all shapes
   */
  getScatteringAt(x: number, y: number): ScatteringProperties;
  
  /**
   * Get blur sigma for content seen through this layer at a point
   */
  getBlurSigmaAt(x: number, y: number): number;
  
  /**
   * Update all shapes' spectra (call after property changes)
   */
  updateSpectra(): void;
}

/**
 * SpectralLayerConfig - configuration for creating a SpectralLayer
 */
export interface SpectralLayerConfig {
  id: string;
  zOrder: number;
  shapes?: SpectralShape[];
}

/**
 * Calculate signed distance to nearest shape boundary
 * Positive = inside, Negative = outside
 */
export function getSignedDistanceToShapes(
  shapes: SpectralShape[],
  x: number,
  y: number
): { distance: number; nearestShape: SpectralShape | null } {
  let nearestDistance = -Infinity;
  let nearestShape: SpectralShape | null = null;
  
  for (const shape of shapes) {
    const dist = shape.geometry.getEdgeDistance(x, y);
    if (dist > nearestDistance) {
      nearestDistance = dist;
      nearestShape = shape;
    }
  }
  
  return { distance: nearestDistance, nearestShape };
}

/**
 * Calculate aura intensity from distance and emission properties
 * @param distance Signed distance (positive inside, negative outside)
 * @param auraRadius Radius of aura falloff
 * @param auraDecay Decay rate (1/pixels)
 */
export function calculateAuraIntensity(
  distance: number,
  auraRadius: number,
  auraDecay: number
): number {
  if (distance >= 0) {
    return 1.0; // Full intensity inside shape
  }
  
  const outsideDistance = -distance;
  if (outsideDistance > auraRadius) {
    return 0; // Beyond aura radius
  }
  
  // Exponential decay: exp(-decay × distance)
  return Math.exp(-auraDecay * outsideDistance);
}

/**
 * Blend aura intensities from multiple shapes (additive, clamped to 1.0)
 */
export function blendAuraIntensities(intensities: number[]): number {
  const sum = intensities.reduce((acc, val) => acc + val, 0);
  return Math.min(1.0, sum);
}

