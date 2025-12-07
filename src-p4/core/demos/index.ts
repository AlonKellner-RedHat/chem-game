/**
 * Demos Module
 */

export type { Demo } from './Demo';
export { BaseDemo } from './Demo';
export { EmptyDemo } from './EmptyDemo';
export { InteractivityDemo } from './InteractivityDemo';
export { SpectralDemo } from './SpectralDemo';
export { AdvancedSpectralDemo } from './AdvancedSpectralDemo';
export { GPUDemo } from './GPUDemo';

import { Demo } from './Demo';
import { EmptyDemo } from './EmptyDemo';
import { InteractivityDemo } from './InteractivityDemo';
import { SpectralDemo } from './SpectralDemo';
import { AdvancedSpectralDemo } from './AdvancedSpectralDemo';
import { GPUDemo } from './GPUDemo';

/**
 * Get all available demos
 */
export function getAllDemos(): Demo[] {
  return [
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
  return new AdvancedSpectralDemo();
}

