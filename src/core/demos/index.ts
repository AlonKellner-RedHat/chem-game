/**
 * Demos Module
 */

export { AdvancedSpectralDemo } from './AdvancedSpectralDemo';
export type { Demo } from './Demo';
export { BaseDemo } from './Demo';
export { EmptyDemo } from './EmptyDemo';
export { GPUDemo } from './GPUDemo';
export { InteractivityDemo } from './InteractivityDemo';
export { SpectralDemo } from './SpectralDemo';
export { ThermodynamicsDemo } from './ThermodynamicsDemo';

import { AdvancedSpectralDemo } from './AdvancedSpectralDemo';
import type { Demo } from './Demo';
import { EmptyDemo } from './EmptyDemo';
import { GPUDemo } from './GPUDemo';
import { InteractivityDemo } from './InteractivityDemo';
import { SpectralDemo } from './SpectralDemo';
import { ThermodynamicsDemo } from './ThermodynamicsDemo';

/**
 * Get all available demos
 */
export function getAllDemos(): Demo[] {
  return [
    new ThermodynamicsDemo(),
    new EmptyDemo(),
    new InteractivityDemo(),
    new SpectralDemo(),
    new AdvancedSpectralDemo(),
    new GPUDemo(),
  ];
}

/**
 * Get the default demo
 */
export function getDefaultDemo(): Demo {
  return new ThermodynamicsDemo();
}
