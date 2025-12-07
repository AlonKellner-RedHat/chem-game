import { SolutionProperties } from '../SolutionProperties';
import { Material } from './Material';

/**
 * SpectralEffect interface for composable effects on spectral transmission
 * Effects can be combined and applied in priority order
 */
export interface SpectralEffect {
  readonly id: string;
  readonly name: string;

  // Calculate effect on spectrum
  apply(
    wavelength: number,
    properties: SolutionProperties,
    material: Material
  ): number; // Returns modification factor (0-1 for absorption, >1 for emission)

  // Effect type for composition order
  getType(): 'absorption' | 'scattering' | 'emission' | 'structural';
  getPriority(): number; // Lower = applied first
}

