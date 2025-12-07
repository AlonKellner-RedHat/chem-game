import { BaseMaterial } from './BaseMaterial';
import { ChromiumIon } from '../molecules/ChromiumIon';
import { IronTitaniumIon } from '../molecules/IronTitaniumIon';
import { ManganeseIon } from '../molecules/ManganeseIon';
import { ChemicalAbsorptionEffect } from '../effects/ChemicalAbsorptionEffect';
import { SpectralEffect } from '../interfaces/SpectralEffect';

/**
 * Crystal material - clear crystal base with 3 impurity ions
 * Similar to corundum (Al2O3) structure
 */
export class CrystalMaterial extends BaseMaterial {
  readonly id = 'crystal';
  readonly name = 'Crystal';
  readonly bandGap = 9.0; // eV - corundum is very transparent
  readonly uvCutoff = 150; // nm - transparent to deep UV

  readonly molecules = [
    new ChromiumIon(),
    new IronTitaniumIon(),
    new ManganeseIon(),
  ];

  private effects: SpectralEffect[] = [
    new ChemicalAbsorptionEffect(),
  ];

  getEffects(): SpectralEffect[] {
    return this.effects;
  }

  /**
   * Crystal has higher refractive index (corundum ≈ 1.76)
   */
  refractiveIndex(wavelength: number): number {
    const A = 1.76;
    const B = 8000; // nm²
    return A + B / (wavelength * wavelength);
  }
}

