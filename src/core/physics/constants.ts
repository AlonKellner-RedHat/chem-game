/**
 * Physical Constants for Spectral Calculations
 * 
 * These are the fundamental physical constants used throughout
 * the spectral physics calculations. Values are from CODATA 2018.
 */

// Planck's constant (J·s)
export const PLANCK = 6.62607015e-34;

// Speed of light in vacuum (m/s)
export const SPEED_OF_LIGHT = 299792458;

// Boltzmann constant (J/K)
export const BOLTZMANN = 1.380649e-23;

// Derived constants for Planck's law
// C1 = 2πhc² (first radiation constant for spectral radiance)
export const C1 = 2 * Math.PI * PLANCK * Math.pow(SPEED_OF_LIGHT, 2);

// C2 = hc/k (second radiation constant)
export const C2 = (PLANCK * SPEED_OF_LIGHT) / BOLTZMANN;

// Draper point: temperature at which objects start to glow visibly (K)
export const DRAPER_POINT = 798;

// D65 standard illuminant color temperature (K)
export const D65_TEMPERATURE = 6500;

// Wien's displacement constant (nm·K)
export const WIEN_CONSTANT = 2897771.955;

// Wavelength ranges (nm)
// Extended to 100nm to capture band gap absorption edges
export const WAVELENGTH_MIN = 100;
export const WAVELENGTH_MAX = 1000;
export const VISIBLE_MIN = 380;
export const VISIBLE_MAX = 700;

// UV mode boundaries (nm)
// Pure UV illumination: emits only below visible range (380nm)
// Background appears BLACK but actually emits UV light for fluorescence
// Extended down to 100nm to excite materials with deeper UV absorption
export const UV_SHORT_FADE_START = 100;
export const UV_SHORT_FADE_END = 150;
export const UV_LONG_FADE_START = 350;
export const UV_LONG_FADE_END = 380;  // Fades to zero at visible boundary (380nm)

// Normal mode fade boundaries (nm)
export const NORMAL_UV_FADE_START = 250;
export const NORMAL_IR_FADE_END = 850;




