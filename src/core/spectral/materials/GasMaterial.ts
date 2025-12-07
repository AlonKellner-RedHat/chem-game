import { BaseMaterial } from './BaseMaterial';
import { SodiumAtom } from '../molecules/SodiumAtom';
import { NeonAtom } from '../molecules/NeonAtom';
import { MercuryAtom } from '../molecules/MercuryAtom';
import { ChemicalAbsorptionEffect } from '../effects/ChemicalAbsorptionEffect';
import { SpectralEffect } from '../interfaces/SpectralEffect';

/**
 * Gas Material - For gases with sharp atomic/molecular line spectra
 * Pressure affects line broadening (Lorentzian)
 */
export class GasMaterial extends BaseMaterial {
  readonly id = 'gas';
  readonly name = 'Gas';
  readonly bandGap = 10.0; // eV - gases are transparent
  readonly uvCutoff = 100; // nm - transparent to deep UV

  readonly molecules = [
    new SodiumAtom(),
    new NeonAtom(),
    new MercuryAtom(),
  ];

  private effects: SpectralEffect[] = [
    new ChemicalAbsorptionEffect(),
  ];

  getEffects(): SpectralEffect[] {
    return this.effects;
  }

  /**
   * Gas has refractive index close to 1.0
   */
  refractiveIndex(_wavelength: number): number {
    // Air-like: n ≈ 1.0003
    return 1.0003;
  }
}

