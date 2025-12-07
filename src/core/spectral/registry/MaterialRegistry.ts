import { Material } from '../interfaces/Material';

/**
 * MaterialRegistry manages the registration and retrieval of materials
 * Follows the registry pattern for extensibility (OCP)
 */
export class MaterialRegistry {
  private materials = new Map<string, Material>();

  /**
   * Register a material
   * If a material with the same id already exists, it will be overwritten
   */
  register(material: Material): void {
    this.materials.set(material.id, material);
  }

  /**
   * Get a material by id
   * @returns The material or null if not found
   */
  get(id: string): Material | null {
    return this.materials.get(id) || null;
  }

  /**
   * Get all registered materials
   * @returns Array of all registered materials
   */
  getAll(): Material[] {
    return Array.from(this.materials.values());
  }
}

