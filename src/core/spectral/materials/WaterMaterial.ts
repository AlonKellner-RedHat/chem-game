import { BaseMaterial } from './BaseMaterial';
import { CopperSulfate } from '../molecules/CopperSulfate';
import { PotassiumPermanganate } from '../molecules/PotassiumPermanganate';
import { MethyleneBlue } from '../molecules/MethyleneBlue';
import { ChemicalAbsorptionEffect } from '../effects/ChemicalAbsorptionEffect';
import { ParticleScatteringEffect } from '../effects/ParticleScatteringEffect';
import { MaterialDepthAbsorptionEffect } from '../effects/MaterialDepthAbsorptionEffect';
import { SpectralEffect } from '../interfaces/SpectralEffect';

/**
 * Water material - clear base with 3 colored molecules
 */
export class WaterMaterial extends BaseMaterial {
  readonly id = 'water';
  readonly name = 'Water';
  readonly bandGap = 7.5; // eV - water is transparent
  readonly uvCutoff = 200; // nm - very transparent

  readonly molecules = [
    new CopperSulfate(),
    new PotassiumPermanganate(),
    new MethyleneBlue(),
  ];

  private effects: SpectralEffect[] = [
    new MaterialDepthAbsorptionEffect(), // Priority 5 - applied first
    new ChemicalAbsorptionEffect(), // Priority 10
    new ParticleScatteringEffect(),
  ];

  getEffects(): SpectralEffect[] {
    return this.effects;
  }

  /**
   * Water has slightly different refractive index
   */
  refractiveIndex(wavelength: number): number {
    // Water dispersion: n ≈ 1.33 at 589nm
    const A = 1.33;
    const B = 5000; // nm²
    return A + B / (wavelength * wavelength);
  }
}

