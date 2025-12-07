/**
 * UnifiedSpectralPhysics - TypeScript reference implementation for GLSL physics
 * 
 * This class provides the SINGLE SOURCE OF TRUTH for all spectral physics.
 * The GLSL shader MUST implement identical functions.
 * 
 * Functions:
 * - planckRadiance(wavelength, temperature): D65-normalized black body
 * - kirchhoffEmission(transmission, wavelength, temperature): emission via Kirchhoff's law
 * - getBackgroundIntensity(wavelength, mode): background illumination
 * - getAuraIntensity(distance, radius, decay): emission aura falloff
 * - computeSpectrumValue(...): combined result = bg × trans + emission
 * 
 * All functions are designed to be directly translatable to GLSL.
 */

/**
 * Background illumination modes
 */
export enum BackgroundMode {
  Normal = 0,  // D65 white light
  UV = 1,      // UV illumination
  Dark = 2,    // No illumination (emission only)
}

/**
 * UnifiedSpectralPhysics - mirrors GLSL shader functions exactly
 */
export class UnifiedSpectralPhysics {
  // Physical constants (same as BlackBodyEmission.ts)
  private readonly PLANCK = 6.62607015e-34;      // J·s
  private readonly SPEED_OF_LIGHT = 299792458;   // m/s
  private readonly BOLTZMANN = 1.380649e-23;     // J/K
  
  // Derived constants
  private readonly C1: number; // 2πhc²
  private readonly C2: number; // hc/k
  
  // Draper point: temperature at which visible glow begins
  private readonly DRAPER_POINT = 798; // K
  
  // D65 reference intensity (at 550nm, 6500K) for normalization
  private readonly D65_REFERENCE_INTENSITY: number;
  
  // Background fade boundaries (from SpectralCalculations.ts)
  private readonly VISIBLE_MIN = 380;
  private readonly VISIBLE_MAX = 700;
  private readonly UV_FADE_START = 250;
  private readonly IR_FADE_END = 850;
  
  // UV mode boundaries
  private readonly UV_SHORT_FADE_START = 200;
  private readonly UV_SHORT_FADE_END = 250;
  private readonly UV_LONG_FADE_START = 350;
  private readonly UV_LONG_FADE_END = 450;
  
  constructor() {
    // Pre-compute derived constants
    this.C1 = 2 * Math.PI * this.PLANCK * Math.pow(this.SPEED_OF_LIGHT, 2);
    this.C2 = (this.PLANCK * this.SPEED_OF_LIGHT) / this.BOLTZMANN;
    
    // Calculate D65 reference (raw intensity at 550nm, 6500K)
    this.D65_REFERENCE_INTENSITY = this.getRawPlanckRadiance(550, 6500);
  }
  
  /**
   * Raw Planck's law calculation (no normalization)
   * 
   * B(λ,T) = C1/λ⁵ × 1/(exp(C2/(λT)) - 1)
   * 
   * @param wavelengthNm Wavelength in nanometers
   * @param temperature Temperature in Kelvin
   * @returns Raw spectral radiance
   */
  private getRawPlanckRadiance(wavelengthNm: number, temperature: number): number {
    if (temperature <= 0 || wavelengthNm <= 0) {
      return 0;
    }
    
    // Convert wavelength from nm to meters
    const lambda = wavelengthNm * 1e-9;
    
    // Planck's law exponent
    const exponent = this.C2 / (lambda * temperature);
    
    // Handle numerical overflow (very cold)
    if (exponent > 700) {
      return 0;
    }
    
    const expTerm = Math.exp(exponent);
    
    // Handle numerical underflow (very hot) - use Wien approximation
    if (!Number.isFinite(expTerm) || expTerm <= 1) {
      return (this.C1 / Math.pow(lambda, 5)) * Math.exp(-exponent);
    }
    
    return (this.C1 / Math.pow(lambda, 5)) / (expTerm - 1);
  }
  
  /**
   * D65-normalized Planck radiance
   * 
   * Returns intensity normalized so that:
   * - 6500K at 550nm = 1.0
   * - < 6500K produces < 1.0
   * - > 6500K produces > 1.0
   * 
   * Returns 0 below Draper point (798K)
   * 
   * @param wavelengthNm Wavelength in nanometers
   * @param temperature Temperature in Kelvin
   * @returns Normalized intensity relative to D65
   */
  planckRadiance(wavelengthNm: number, temperature: number): number {
    // No visible emission below Draper point
    if (temperature < this.DRAPER_POINT) {
      return 0;
    }
    
    if (wavelengthNm <= 0) {
      return 0;
    }
    
    const raw = this.getRawPlanckRadiance(wavelengthNm, temperature);
    return raw / this.D65_REFERENCE_INTENSITY;
  }
  
  /**
   * Kirchhoff's law emission
   * 
   * Kirchhoff's law: emissivity = absorptivity = 1 - transmission
   * 
   * emission = absorptivity × planckRadiance(λ, T)
   * 
   * @param transmission Material transmission (0-1)
   * @param wavelengthNm Wavelength in nanometers
   * @param temperature Temperature in Kelvin
   * @returns Emission intensity
   */
  kirchhoffEmission(
    transmission: number,
    wavelengthNm: number,
    temperature: number
  ): number {
    // No emission below Draper point
    if (temperature < this.DRAPER_POINT) {
      return 0;
    }
    
    // Clamp transmission to [0, 1]
    const trans = Math.max(0, Math.min(1, transmission));
    
    // Kirchhoff's law: emissivity = absorptivity
    const absorptivity = 1 - trans;
    
    // emission = absorptivity × black body intensity
    return absorptivity * this.planckRadiance(wavelengthNm, temperature);
  }
  
  /**
   * Background illumination intensity at a wavelength
   * 
   * Modes:
   * - Normal (0): D65 white, uniform in visible, fades in UV/IR
   * - UV (1): Peak at 250-350nm, fades to visible
   * - Dark (2): Zero everywhere
   * 
   * @param wavelengthNm Wavelength in nanometers
   * @param mode Background mode
   * @returns Background intensity (0-1)
   */
  getBackgroundIntensity(wavelengthNm: number, mode: BackgroundMode): number {
    if (mode === BackgroundMode.Dark) {
      return 0;
    }
    
    if (mode === BackgroundMode.UV) {
      return this.getUVBackgroundIntensity(wavelengthNm);
    }
    
    // Normal mode: D65 white light
    return this.getNormalBackgroundIntensity(wavelengthNm);
  }
  
  /**
   * Normal (D65) background intensity
   * Uniform in visible range (380-700nm), fades in UV and IR
   */
  private getNormalBackgroundIntensity(wavelengthNm: number): number {
    // Visible range: full intensity
    if (wavelengthNm >= this.VISIBLE_MIN && wavelengthNm <= this.VISIBLE_MAX) {
      return 1.0;
    }
    
    // UV fade (< 380nm)
    if (wavelengthNm < this.VISIBLE_MIN) {
      if (wavelengthNm <= this.UV_FADE_START) {
        return 0;
      }
      // Fade from 250nm (0) to 380nm (1)
      const t = (wavelengthNm - this.UV_FADE_START) / (this.VISIBLE_MIN - this.UV_FADE_START);
      // Quadratic rise: 1 - (1-t)²
      return Math.max(0, 1 - (1 - t) * (1 - t));
    }
    
    // IR fade (> 700nm)
    if (wavelengthNm >= this.IR_FADE_END) {
      return 0;
    }
    // Fade from 700nm (1) to 850nm (0)
    const t = (wavelengthNm - this.VISIBLE_MAX) / (this.IR_FADE_END - this.VISIBLE_MAX);
    // Quadratic decay: 1 - t²
    return Math.max(0, 1 - t * t);
  }
  
  /**
   * UV background intensity
   * Peak at 250-350nm, fades to visible at 450nm
   */
  private getUVBackgroundIntensity(wavelengthNm: number): number {
    // Below minimum: no light
    if (wavelengthNm < this.UV_SHORT_FADE_START) {
      return 0;
    }
    
    // Short wavelength fade-in (200-250nm)
    if (wavelengthNm < this.UV_SHORT_FADE_END) {
      const t = (wavelengthNm - this.UV_SHORT_FADE_START) / 
                (this.UV_SHORT_FADE_END - this.UV_SHORT_FADE_START);
      // Fast rise: 1 - (1-t)²
      return 1 - (1 - t) * (1 - t);
    }
    
    // Peak UV range (250-350nm)
    if (wavelengthNm <= this.UV_LONG_FADE_START) {
      return 1.0;
    }
    
    // Long wavelength fade-out (350-450nm)
    if (wavelengthNm < this.UV_LONG_FADE_END) {
      const t = (wavelengthNm - this.UV_LONG_FADE_START) / 
                (this.UV_LONG_FADE_END - this.UV_LONG_FADE_START);
      // Quadratic decay: 1 - t²
      return 1 - t * t;
    }
    
    // Beyond fade end: no UV light
    return 0;
  }
  
  /**
   * Aura intensity at a given distance from shape boundary
   * 
   * @param signedDistance Signed distance (positive inside, negative outside)
   * @param auraRadius Maximum aura radius in pixels
   * @param auraDecay Exponential decay rate (1/pixels)
   * @returns Aura intensity (0-1)
   */
  getAuraIntensity(
    signedDistance: number,
    auraRadius: number,
    auraDecay: number
  ): number {
    // Inside shape: full intensity
    if (signedDistance >= 0) {
      return 1.0;
    }
    
    // Beyond aura radius: no intensity
    const outsideDistance = -signedDistance;
    if (outsideDistance > auraRadius) {
      return 0;
    }
    
    // Exponential decay: exp(-decay × distance)
    return Math.exp(-auraDecay * outsideDistance);
  }
  
  /**
   * Compute final spectrum value at a wavelength
   * 
   * This is the core physics formula:
   *   result = background × transmission + emission
   * 
   * @param wavelengthNm Wavelength in nanometers
   * @param transmission Material transmission (0-1)
   * @param temperature Material temperature in Kelvin
   * @param mode Background mode
   * @returns Final spectrum intensity
   */
  computeSpectrumValue(
    wavelengthNm: number,
    transmission: number,
    temperature: number,
    mode: BackgroundMode
  ): number {
    const background = this.getBackgroundIntensity(wavelengthNm, mode);
    const transmitted = background * transmission;
    const emission = this.kirchhoffEmission(transmission, wavelengthNm, temperature);
    
    return transmitted + emission;
  }
  
  /**
   * Get the GLSL source code for this physics module
   * This returns the GLSL version of all these functions
   */
  static getGLSLSource(): string {
    return `
// UnifiedSpectralPhysics.glsl
// Auto-generated from UnifiedSpectralPhysics.ts
// This MUST match the TypeScript implementation exactly

// Physical constants
const float PLANCK = 6.62607015e-34;
const float SPEED_OF_LIGHT = 299792458.0;
const float BOLTZMANN = 1.380649e-23;
const float C1 = 3.7417749e-16;  // 2πhc²
const float C2 = 0.014387773;    // hc/k in m·K

// Temperature constants
const float DRAPER_POINT = 798.0;

// Background boundaries
const float VISIBLE_MIN = 380.0;
const float VISIBLE_MAX = 700.0;
const float UV_FADE_START = 250.0;
const float IR_FADE_END = 850.0;
const float UV_SHORT_FADE_START = 200.0;
const float UV_SHORT_FADE_END = 250.0;
const float UV_LONG_FADE_START = 350.0;
const float UV_LONG_FADE_END = 450.0;

// Background modes
const int MODE_NORMAL = 0;
const int MODE_UV = 1;
const int MODE_DARK = 2;

// D65 reference intensity (pre-computed: raw intensity at 550nm, 6500K)
uniform float u_d65Reference;

/**
 * Raw Planck's law (no normalization)
 */
float getRawPlanckRadiance(float wavelengthNm, float temperature) {
  if (temperature <= 0.0 || wavelengthNm <= 0.0) {
    return 0.0;
  }
  
  float lambda = wavelengthNm * 1.0e-9;
  float exponent = C2 / (lambda * temperature);
  
  if (exponent > 700.0) {
    return 0.0;
  }
  
  float expTerm = exp(exponent);
  if (expTerm <= 1.0) {
    return (C1 / pow(lambda, 5.0)) * exp(-exponent);
  }
  
  return (C1 / pow(lambda, 5.0)) / (expTerm - 1.0);
}

/**
 * D65-normalized Planck radiance
 */
float planckRadiance(float wavelengthNm, float temperature) {
  if (temperature < DRAPER_POINT || wavelengthNm <= 0.0) {
    return 0.0;
  }
  
  float raw = getRawPlanckRadiance(wavelengthNm, temperature);
  return raw / u_d65Reference;
}

/**
 * Kirchhoff's law: emission = absorptivity × planckRadiance
 */
float kirchhoffEmission(float transmission, float wavelengthNm, float temperature) {
  if (temperature < DRAPER_POINT) {
    return 0.0;
  }
  
  float trans = clamp(transmission, 0.0, 1.0);
  float absorptivity = 1.0 - trans;
  
  return absorptivity * planckRadiance(wavelengthNm, temperature);
}

/**
 * Normal (D65) background intensity
 */
float getNormalBackgroundIntensity(float wavelengthNm) {
  if (wavelengthNm >= VISIBLE_MIN && wavelengthNm <= VISIBLE_MAX) {
    return 1.0;
  }
  
  if (wavelengthNm < VISIBLE_MIN) {
    if (wavelengthNm <= UV_FADE_START) {
      return 0.0;
    }
    float t = (wavelengthNm - UV_FADE_START) / (VISIBLE_MIN - UV_FADE_START);
    return max(0.0, 1.0 - (1.0 - t) * (1.0 - t));
  }
  
  if (wavelengthNm >= IR_FADE_END) {
    return 0.0;
  }
  float t = (wavelengthNm - VISIBLE_MAX) / (IR_FADE_END - VISIBLE_MAX);
  return max(0.0, 1.0 - t * t);
}

/**
 * UV background intensity
 */
float getUVBackgroundIntensity(float wavelengthNm) {
  if (wavelengthNm < UV_SHORT_FADE_START) {
    return 0.0;
  }
  
  if (wavelengthNm < UV_SHORT_FADE_END) {
    float t = (wavelengthNm - UV_SHORT_FADE_START) / (UV_SHORT_FADE_END - UV_SHORT_FADE_START);
    return 1.0 - (1.0 - t) * (1.0 - t);
  }
  
  if (wavelengthNm <= UV_LONG_FADE_START) {
    return 1.0;
  }
  
  if (wavelengthNm < UV_LONG_FADE_END) {
    float t = (wavelengthNm - UV_LONG_FADE_START) / (UV_LONG_FADE_END - UV_LONG_FADE_START);
    return 1.0 - t * t;
  }
  
  return 0.0;
}

/**
 * Background intensity by mode
 */
float getBackgroundIntensity(float wavelengthNm, int mode) {
  if (mode == MODE_DARK) {
    return 0.0;
  }
  
  if (mode == MODE_UV) {
    return getUVBackgroundIntensity(wavelengthNm);
  }
  
  return getNormalBackgroundIntensity(wavelengthNm);
}

/**
 * Aura intensity with exponential falloff
 */
float getAuraIntensity(float signedDistance, float auraRadius, float auraDecay) {
  if (signedDistance >= 0.0) {
    return 1.0;
  }
  
  float outsideDistance = -signedDistance;
  if (outsideDistance > auraRadius) {
    return 0.0;
  }
  
  return exp(-auraDecay * outsideDistance);
}

/**
 * Compute final spectrum value
 * result = background × transmission + emission
 */
float computeSpectrumValue(float wavelengthNm, float transmission, float temperature, int mode) {
  float background = getBackgroundIntensity(wavelengthNm, mode);
  float transmitted = background * transmission;
  float emission = kirchhoffEmission(transmission, wavelengthNm, temperature);
  
  return transmitted + emission;
}
`;
  }
}

