import { PixelFilter } from './PixelFilter';
import { SpectrumPoint } from '../CIE';

/**
 * IntensityFilter - Scales spectrum by intensity factor
 * Used for background layer (tiles at 100%, grid lines at 60%)
 */
export class IntensityFilter implements PixelFilter {
  readonly id: string;
  private readonly intensity: number;

  constructor(intensity: number, id: string = 'intensity') {
    if (intensity < 0 || intensity > 1) {
      throw new Error(`Intensity must be between 0 and 1, got ${intensity}`);
    }
    this.intensity = intensity;
    this.id = id;
  }

  apply(spectrum: SpectrumPoint[]): SpectrumPoint[] {
    return spectrum.map(point => ({
      ...point,
      transmission: point.transmission * this.intensity,
    }));
  }

  canScatter(): boolean {
    return false;
  }

  getIntensity(): number {
    return this.intensity;
  }
}

