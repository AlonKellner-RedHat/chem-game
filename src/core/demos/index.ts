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

import { AdvancedSpectralDemo } from './AdvancedSpectralDemo';
import type { Demo } from './Demo';
import { EmptyDemo } from './EmptyDemo';
import { GPUDemo } from './GPUDemo';
import { InteractivityDemo } from './InteractivityDemo';
import { SpectralDemo } from './SpectralDemo';

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
