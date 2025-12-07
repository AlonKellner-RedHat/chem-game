/**
 * UnifiedSpectralShader.glsl
 * 
 * Main shader for unified spectral rendering.
 * Uses UnifiedSpectralPhysics.glsl for all physics calculations.
 * 
 * This shader supports two output modes:
 * - Mode 0: RGB color (16-wavelength integration)
 * - Mode 1: Spectrum value at a single wavelength
 * 
 * Both modes use the EXACT same composeLayers() function,
 * ensuring perfect synchronization between rendering and spectral plot.
 */

precision highp float;

// ============================================================================
// Include physics functions (in real build, this would be #include)
// For now, the UnifiedSpectralPhysics.glsl contents are embedded
// ============================================================================

// Physical constants
const float C1 = 3.7417749e-16;
const float C2 = 0.014387773;
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

// ============================================================================
// Uniforms
// ============================================================================

// Output mode: 0 = RGB, 1 = Spectrum
uniform int u_outputMode;

// For spectrum mode: which wavelength to sample
uniform float u_sampleWavelength;

// Background mode
uniform int u_backgroundMode;

// D65 reference for normalization
uniform float u_d65Reference;

// Resolution
uniform vec2 u_resolution;

// World coordinates
uniform float u_boundsMinX;
uniform float u_boundsMinY;

// Layer mask textures (6 layers)
uniform sampler2D u_layerMask0;
uniform sampler2D u_layerMask1;
uniform sampler2D u_layerMask2;
uniform sampler2D u_layerMask3;
uniform sampler2D u_layerMask4;
uniform sampler2D u_layerMask5;

// Layer transmission textures (6 layers, 2D: wavelength × shape)
uniform sampler2D u_layerTransmission0;
uniform sampler2D u_layerTransmission1;
uniform sampler2D u_layerTransmission2;
uniform sampler2D u_layerTransmission3;
uniform sampler2D u_layerTransmission4;
uniform sampler2D u_layerTransmission5;

// Per-layer temperatures (packed as 2 vec4)
uniform vec4 u_layerTemperatures0;  // Layers 0-3
uniform vec4 u_layerTemperatures1;  // Layers 4-5 (xy only)

// Per-layer scattering (packed)
uniform vec4 u_layerScattering0;
uniform vec4 u_layerScattering1;

// CIE textures for RGB integration
uniform sampler2D u_cieXTexture;
uniform sampler2D u_cieYTexture;
uniform sampler2D u_cieZTexture;

// Varying from vertex shader
varying vec2 v_texCoord;

// ============================================================================
// Physics Functions (from UnifiedSpectralPhysics.glsl)
// ============================================================================

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

float planckRadiance(float wavelengthNm, float temperature) {
  if (temperature < DRAPER_POINT || wavelengthNm <= 0.0) {
    return 0.0;
  }
  
  float raw = getRawPlanckRadiance(wavelengthNm, temperature);
  return raw / u_d65Reference;
}

float kirchhoffEmission(float transmission, float wavelengthNm, float temperature) {
  if (temperature < DRAPER_POINT) {
    return 0.0;
  }
  
  float trans = clamp(transmission, 0.0, 1.0);
  float absorptivity = 1.0 - trans;
  
  return absorptivity * planckRadiance(wavelengthNm, temperature);
}

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

float getBackgroundIntensity(float wavelengthNm, int mode) {
  if (mode == MODE_DARK) {
    return 0.0;
  }
  
  if (mode == MODE_UV) {
    return getUVBackgroundIntensity(wavelengthNm);
  }
  
  return getNormalBackgroundIntensity(wavelengthNm);
}

// ============================================================================
// Layer Access Functions
// ============================================================================

int getShapeIndex(vec2 worldPos, int layer) {
  vec2 uv = worldPos / u_resolution;
  
  float maskValue;
  if (layer == 0) maskValue = texture2D(u_layerMask0, uv).r;
  else if (layer == 1) maskValue = texture2D(u_layerMask1, uv).r;
  else if (layer == 2) maskValue = texture2D(u_layerMask2, uv).r;
  else if (layer == 3) maskValue = texture2D(u_layerMask3, uv).r;
  else if (layer == 4) maskValue = texture2D(u_layerMask4, uv).r;
  else maskValue = texture2D(u_layerMask5, uv).r;
  
  return int(maskValue * 255.0 + 0.5);
}

float getTransmission(float wavelengthNm, int layer, int shapeIdx) {
  // Normalize wavelength to [0, 1]
  float waveNorm = (wavelengthNm - VISIBLE_MIN) / (VISIBLE_MAX - VISIBLE_MIN);
  waveNorm = clamp(waveNorm, 0.0, 1.0);
  
  // Shape index normalized to [0, 1] (assuming max 256 shapes)
  float shapeNorm = float(shapeIdx) / 256.0;
  
  vec2 uv = vec2(waveNorm, shapeNorm);
  
  if (layer == 0) return texture2D(u_layerTransmission0, uv).r;
  else if (layer == 1) return texture2D(u_layerTransmission1, uv).r;
  else if (layer == 2) return texture2D(u_layerTransmission2, uv).r;
  else if (layer == 3) return texture2D(u_layerTransmission3, uv).r;
  else if (layer == 4) return texture2D(u_layerTransmission4, uv).r;
  else return texture2D(u_layerTransmission5, uv).r;
}

float getLayerTemperature(int layer) {
  if (layer == 0) return u_layerTemperatures0.x;
  else if (layer == 1) return u_layerTemperatures0.y;
  else if (layer == 2) return u_layerTemperatures0.z;
  else if (layer == 3) return u_layerTemperatures0.w;
  else if (layer == 4) return u_layerTemperatures1.x;
  else return u_layerTemperatures1.y;
}

float getLayerScattering(int layer) {
  if (layer == 0) return u_layerScattering0.x;
  else if (layer == 1) return u_layerScattering0.y;
  else if (layer == 2) return u_layerScattering0.z;
  else if (layer == 3) return u_layerScattering0.w;
  else if (layer == 4) return u_layerScattering1.x;
  else return u_layerScattering1.y;
}

// ============================================================================
// Core Composition Function
// ============================================================================

/**
 * Compose all layers at a specific wavelength
 * 
 * This is the SINGLE source of truth for layer composition.
 * Both RGB and spectrum modes use this function.
 * 
 * Processing order per layer (mirrors MultiPassRenderer.render):
 * 1. Blur (represented as blur sigma accumulation)
 * 2. Absorption (transmission multiplication)
 * 3. Emission (Kirchhoff's law addition)
 */
float composeLayers(vec2 worldPos, float wavelengthNm) {
  // Start with background
  float result = getBackgroundIntensity(wavelengthNm, u_backgroundMode);
  
  // Process each layer back-to-front
  for (int layer = 0; layer < 6; layer++) {
    int shapeIdx = getShapeIndex(worldPos, layer);
    
    if (shapeIdx > 0) {
      // 1. Blur (calculated but applied in separate pass)
      // float blurSigma = getLayerScattering(layer) * 10.0;
      
      // 2. Absorption
      float trans = getTransmission(wavelengthNm, layer, shapeIdx);
      result *= trans;
      
      // 3. Emission (Kirchhoff's law)
      float temp = getLayerTemperature(layer);
      float emit = kirchhoffEmission(trans, wavelengthNm, temp);
      result += emit;
    }
  }
  
  return result;
}

// ============================================================================
// RGB Integration (Mode 0)
// ============================================================================

vec3 integrateToRGB(vec2 worldPos) {
  float X = 0.0;
  float Y = 0.0;
  float Z = 0.0;
  
  // Integrate over 16 wavelength samples
  const int NUM_SAMPLES = 16;
  
  for (int i = 0; i < NUM_SAMPLES; i++) {
    float t = float(i) / float(NUM_SAMPLES - 1);
    float wavelength = VISIBLE_MIN + t * (VISIBLE_MAX - VISIBLE_MIN);
    
    float intensity = composeLayers(worldPos, wavelength);
    
    // Sample CIE color matching functions
    float waveNorm = (wavelength - VISIBLE_MIN) / (VISIBLE_MAX - VISIBLE_MIN);
    float xBar = texture2D(u_cieXTexture, vec2(waveNorm, 0.5)).r;
    float yBar = texture2D(u_cieYTexture, vec2(waveNorm, 0.5)).r;
    float zBar = texture2D(u_cieZTexture, vec2(waveNorm, 0.5)).r;
    
    X += intensity * xBar;
    Y += intensity * yBar;
    Z += intensity * zBar;
  }
  
  // Scale by wavelength range
  float scale = (VISIBLE_MAX - VISIBLE_MIN) / float(NUM_SAMPLES);
  X *= scale;
  Y *= scale;
  Z *= scale;
  
  // XYZ to linear RGB
  float r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
  float g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
  float b = 0.0557 * X - 0.2040 * Y + 1.0570 * Z;
  
  return vec3(r, g, b);
}

// ============================================================================
// Gamma Correction
// ============================================================================

float gammaCorrect(float c) {
  return c <= 0.0031308 
    ? 12.92 * c 
    : 1.055 * pow(c, 1.0 / 2.4) - 0.055;
}

// ============================================================================
// Main
// ============================================================================

void main() {
  // Convert texture coords to world position
  vec2 worldPos = vec2(
    u_boundsMinX + v_texCoord.x * u_resolution.x,
    u_boundsMinY + v_texCoord.y * u_resolution.y
  );
  
  if (u_outputMode == 0) {
    // RGB mode: integrate over spectrum
    vec3 linearRGB = integrateToRGB(worldPos);
    
    // Normalize by max brightness
    float maxBrightness = max(max(linearRGB.r, linearRGB.g), max(linearRGB.b, 0.001));
    vec3 normalized = linearRGB / maxBrightness;
    
    // Gamma correction
    vec3 srgb = vec3(
      gammaCorrect(normalized.r),
      gammaCorrect(normalized.g),
      gammaCorrect(normalized.b)
    );
    
    gl_FragColor = vec4(clamp(srgb, 0.0, 1.0), 1.0);
  } else {
    // Spectrum mode: return value at specific wavelength
    float value = composeLayers(worldPos, u_sampleWavelength);
    
    // Encode value in RGB (for readback)
    // Use R channel for the main value
    gl_FragColor = vec4(value, value, value, 1.0);
  }
}

