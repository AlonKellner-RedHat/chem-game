import { SpectrumPoint } from '../CIE';
import { EmissionSpectrum, EmissionProperties } from './EmissionSpectrum';

/**
 * BlackBodyEmission - implements Planck's law for thermal radiation
 * 
 * Planck's law: B(λ,T) = (2hc²/λ⁵) × 1/(exp(hc/λkT) - 1)
 * 
 * Physical constants:
 * - h = Planck constant = 6.626×10⁻³⁴ J·s
 * - c = Speed of light = 2.998×10⁸ m/s
 * - k = Boltzmann constant = 1.381×10⁻²³ J/K
 * 
 * Key temperatures:
 * - Draper point (798K): Objects start to glow visibly red
 * - 1000K: Dull red
 * - 1500K: Bright red/orange
 * - 2000K: Orange
 * - 3000K: Yellow-white
 * - 5778K: Sun's surface (peak at ~500nm)
 * - 6500K: D65 daylight white
 */
export class BlackBodyEmission implements EmissionSpectrum {
  readonly id = 'blackbody';
  readonly name = 'Black Body Radiation';
  
  // Physical constants
  private readonly PLANCK = 6.62607015e-34;      // J·s (exact value since 2019)
  private readonly SPEED_OF_LIGHT = 299792458;   // m/s (exact)
  private readonly BOLTZMANN = 1.380649e-23;     // J/K (exact value since 2019)
  
  // Derived constants for efficiency
  private readonly C1: number; // 2πhc² for spectral radiance
  private readonly C2: number; // hc/k for exponent
  
  // Draper point: temperature at which visible glow begins
  private readonly DRAPER_POINT = 798; // K
  
  // Wien's displacement constant
  private readonly WIEN_CONSTANT = 2.897771955e6; // nm·K
  
  // D65 reference intensity for normalization
  // This is the raw Planck intensity at 550nm, 6500K
  // Used to normalize emission so that D65 produces ~1.0
  private readonly D65_REFERENCE_INTENSITY: number;
  
  constructor() {
    // Pre-compute derived constants
    this.C1 = 2 * Math.PI * this.PLANCK * Math.pow(this.SPEED_OF_LIGHT, 2);
    this.C2 = (this.PLANCK * this.SPEED_OF_LIGHT) / this.BOLTZMANN;
    
    // Calculate D65 reference: raw intensity at 550nm, 6500K
    // This will be used to normalize all emission values
    this.D65_REFERENCE_INTENSITY = this.getRawIntensity(550, 6500);
  }
  
  /**
   * Get the full emission spectrum at a given temperature
   * 
   * @param temperature Temperature in Kelvin
   * @param minWavelength Minimum wavelength in nm (default 200)
   * @param maxWavelength Maximum wavelength in nm (default 1000)
   * @param numPoints Number of spectrum points (default 100)
   * @param emissivity Material emissivity 0-1 (default 1.0 for ideal black body)
   * @returns Array of spectrum points with emission intensity
   */
  getSpectrum(
    temperature: number,
    minWavelength: number = 200,
    maxWavelength: number = 1000,
    numPoints: number = 100,
    emissivity: number = 1.0
  ): SpectrumPoint[] {
    const spectrum: SpectrumPoint[] = [];
    const step = (maxWavelength - minWavelength) / (numPoints - 1);
    
    for (let i = 0; i < numPoints; i++) {
      const wavelength = minWavelength + i * step;
      const intensity = this.getIntensityAt(wavelength, temperature) * emissivity;
      spectrum.push({ wavelength, transmission: intensity });
    }
    
    return spectrum;
  }
  
  /**
   * Get RAW emission intensity at a specific wavelength (no normalization)
   * Used internally for calculating the D65 reference
   * 
   * @param wavelength Wavelength in nm
   * @param temperature Temperature in Kelvin
   * @returns Raw spectral radiance in physical units
   */
  private getRawIntensity(wavelength: number, temperature: number): number {
    if (temperature <= 0 || wavelength <= 0) {
      return 0;
    }
    
    // Convert wavelength from nm to meters
    const lambda = wavelength * 1e-9;
    
    // Planck's law: B(λ,T) = C1/λ⁵ × 1/(exp(C2/(λT)) - 1)
    const exponent = this.C2 / (lambda * temperature);
    
    // Handle numerical overflow for very cold temperatures
    if (exponent > 700) {
      return 0; // Essentially zero emission
    }
    
    // Handle numerical underflow for very hot temperatures
    const expTerm = Math.exp(exponent);
    if (!Number.isFinite(expTerm) || expTerm <= 1) {
      // Use approximation for very high temperatures (Wien approximation)
      return (this.C1 / Math.pow(lambda, 5)) * Math.exp(-exponent);
    }
    
    const denominator = expTerm - 1;
    return (this.C1 / Math.pow(lambda, 5)) / denominator;
  }

  /**
   * Get emission intensity at a specific wavelength, normalized to D65
   * 
   * The intensity is normalized so that:
   * - D65 (6500K) at 550nm produces ~1.0
   * - Cooler objects produce < 1.0
   * - Hotter objects (up to 10000K) produce > 1.0
   * 
   * This makes emission comparable to the background illuminant.
   * 
   * @param wavelength Wavelength in nm
   * @param temperature Temperature in Kelvin
   * @returns Emission intensity relative to D65 at 550nm
   */
  getIntensityAt(wavelength: number, temperature: number): number {
    const rawIntensity = this.getRawIntensity(wavelength, temperature);
    
    // Normalize relative to D65 at 550nm
    // This makes 6500K produce ~1.0, allowing comparison with transmission values
    return rawIntensity / this.D65_REFERENCE_INTENSITY;
  }
  
  /**
   * Check if black body emission is visibly active at this temperature
   * (Objects start to glow at the Draper point, ~798K)
   * 
   * @param temperature Temperature in Kelvin
   * @returns True if visible glow is expected
   */
  isActive(temperature: number, _properties?: EmissionProperties): boolean {
    return temperature >= this.DRAPER_POINT;
  }
  
  /**
   * Get peak wavelength using Wien's displacement law
   * λ_max = WIEN_CONSTANT / T
   * 
   * @param temperature Temperature in Kelvin
   * @returns Peak wavelength in nm
   */
  getPeakWavelength(temperature: number): number {
    if (temperature <= 0) {
      return Infinity;
    }
    return this.WIEN_CONSTANT / temperature;
  }
  
  /**
   * Estimate the color temperature from RGB ratios
   * (Inverse of Planck's law - approximate)
   * 
   * @param redRatio Relative red intensity
   * @param blueRatio Relative blue intensity
   * @returns Estimated color temperature in Kelvin
   */
  estimateColorTemperature(redRatio: number, blueRatio: number): number {
    // Use the ratio of red to blue to estimate temperature
    // This is an approximation based on the blackbody curve
    if (blueRatio <= 0 || redRatio <= 0) {
      return 0;
    }
    
    const ratio = redRatio / blueRatio;
    
    // Empirical approximation (valid for ~1000K to ~10000K)
    // Higher ratio = lower temperature (more red)
    if (ratio > 100) return 1000;
    if (ratio < 0.5) return 10000;
    
    // Log-linear approximation
    return Math.exp(9.0 - 0.5 * Math.log(ratio)) * 100;
  }
  
  // EmissionSpectrum interface implementation
  
  getBaseEmission(temperature: number, properties?: EmissionProperties): SpectrumPoint[] {
    const emissivity = properties?.emissivity ?? 1.0;
    return this.getSpectrum(temperature, 200, 1000, 100, emissivity);
  }
  
  getEmissionAt(wavelength: number, temperature: number, properties?: EmissionProperties): number {
    const emissivity = properties?.emissivity ?? 1.0;
    return this.getIntensityAt(wavelength, temperature) * emissivity;
  }
}

