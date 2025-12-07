import { Molecule } from './Molecule';
import { SpectralEffect } from './SpectralEffect';

/**
 * Material interface defining the properties of a base material
 * Materials are immutable and extensible via the registry pattern
 */
export interface Material {
  readonly id: string;
  readonly name: string;

  // Fixed properties (immutable)
  readonly bandGap: number; // eV
  readonly uvCutoff: number; // nm
  readonly refractiveIndex: (wavelength: number) => number;
  readonly baseTransmission: (wavelength: number) => number;

  // Molecules (extensible)
  readonly molecules: Molecule[];

  // Effects (composable)
  getEffects(): SpectralEffect[];
}

