import { PixelFilter } from './PixelFilter';
import { SpectrumPoint } from '../CIE';

/**
 * NothingFilter - Identity filter that passes spectrum through unchanged
 * Used as default filter for pixels not on shapes
 */
export class NothingFilter implements PixelFilter {
  readonly id = 'nothing';

  apply(spectrum: SpectrumPoint[]): SpectrumPoint[] {
    // Return a copy to avoid mutation
    return spectrum.map(point => ({ ...point }));
  }

  canScatter(): boolean {
    return false;
  }
}

