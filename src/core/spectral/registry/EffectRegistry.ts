import { SpectralEffect } from '../interfaces/SpectralEffect';

/**
 * EffectRegistry manages the registration and retrieval of spectral effects
 * Follows the registry pattern for extensibility (OCP)
 */
export class EffectRegistry {
  private effects = new Map<string, SpectralEffect>();

  /**
   * Register an effect
   * If an effect with the same id already exists, it will be overwritten
   */
  register(effect: SpectralEffect): void {
    this.effects.set(effect.id, effect);
  }

  /**
   * Get an effect by id
   * @returns The effect or null if not found
   */
  get(id: string): SpectralEffect | null {
    return this.effects.get(id) || null;
  }

  /**
   * Get all registered effects
   * @returns Array of all registered effects
   */
  getAll(): SpectralEffect[] {
    return Array.from(this.effects.values());
  }
}

