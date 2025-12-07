/**
 * Advanced Spectral Demo
 * 
 * Full spectral coloring with emission, dark mode, and advanced features.
 */

import { SpectralDemo } from './SpectralDemo';

export class AdvancedSpectralDemo extends SpectralDemo {
  readonly name = 'Advanced Spectral Coloring';
  readonly description = 'Physics-based spectral absorption, emission, and scattering';
  
  // Enable advanced features
  protected enableEmission = true;
  protected enableDarkMode = true;
}


