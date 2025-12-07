precision highp float;

// Uniforms
uniform vec2 u_resolution;
uniform float u_gridCellSize;
uniform float u_squareX, u_squareY, u_squareSize;
uniform float u_circleX, u_circleY, u_circleRadius;
uniform float u_triangleX, u_triangleY, u_triangleSize;
uniform float u_wavelengthMin;
uniform float u_wavelengthMax;
uniform int u_pass; // 0 = color calculation, 1 = normalization

// Material transmission textures (1D: wavelength → transmission)
uniform sampler2D u_materialSquareTexture;  // Water
uniform sampler2D u_materialCircleTexture;     // Crystal
uniform sampler2D u_materialTriangleTexture; // Gas
uniform sampler2D u_backgroundTexture;       // Background spectrum

// CIE lookup textures
uniform sampler2D u_cieXTexture;
uniform sampler2D u_cieYTexture;
uniform sampler2D u_cieZTexture;
uniform sampler2D u_d65Texture;

// For normalization pass
uniform sampler2D u_colorTexture; // Input from pass 1

// Adaptive normalization parameters
uniform float u_windowSize; // 500.0
uniform float u_stride;     // 10.0

varying vec2 v_texCoord;

// Sample 1D texture at normalized wavelength (0.0 = 200nm, 1.0 = 1000nm)
float sample1DTexture(sampler2D tex, float wavelengthNorm) {
  vec2 uv = vec2(wavelengthNorm, 0.5);
  vec4 sample = texture2D(tex, uv);
  // Decode from RGBA (R channel contains the value)
  return sample.r / 255.0;
}

// Check if point is inside rectangle
bool inRectangle(float px, float py, float cx, float cy, float size) {
  float halfSize = size * 0.5;
  return px >= cx - halfSize && px <= cx + halfSize &&
         py >= cy - halfSize && py <= cy + halfSize;
}

// Check if point is inside circle
bool inCircle(float px, float py, float cx, float cy, float radius) {
  float dx = px - cx;
  float dy = py - cy;
  return (dx * dx + dy * dy) <= (radius * radius);
}

// Check if point is inside triangle
bool inTriangle(float px, float py, float cx, float cy, float size) {
  float halfSize = size * 0.5;
  float v1x = cx;
  float v1y = cy - halfSize; // Top
  float v2x = cx - halfSize;
  float v2y = cy + halfSize; // Bottom left
  float v3x = cx + halfSize;
  float v3y = cy + halfSize; // Bottom right
  
  // Barycentric coordinates
  float d1 = sign((px - v3x) * (v1y - v3y) - (v1x - v3x) * (py - v3y));
  float d2 = sign((px - v1x) * (v2y - v1y) - (v2x - v1x) * (py - v1y));
  float d3 = sign((px - v2x) * (v3y - v2y) - (v3x - v2x) * (py - v2y));
  
  bool hasNeg = (d1 < 0.0) || (d2 < 0.0) || (d3 < 0.0);
  bool hasPos = (d1 > 0.0) || (d2 > 0.0) || (d3 > 0.0);
  
  return !(hasNeg && hasPos);
}

// Check if pixel is on grid line
bool isOnGridLine(float px, float py, float cellSize) {
  float gridX = floor(px / cellSize) * cellSize;
  float gridY = floor(py / cellSize) * cellSize;
  float distToVertical = min(abs(px - gridX), abs(px - (gridX + cellSize)));
  float distToHorizontal = min(abs(py - gridY), abs(py - (gridY + cellSize)));
  return distToVertical <= 0.5 || distToHorizontal <= 0.5;
}

// Simplified CIE conversion (sample key wavelengths)
vec3 spectrumToRGB(float transmission, float wavelengthNorm) {
  // Sample CIE functions and D65 at this wavelength
  float xBar = sample1DTexture(u_cieXTexture, wavelengthNorm);
  float yBar = sample1DTexture(u_cieYTexture, wavelengthNorm);
  float zBar = sample1DTexture(u_cieZTexture, wavelengthNorm);
  float d65 = sample1DTexture(u_d65Texture, wavelengthNorm);
  
  // Simplified integration: multiply by transmission and D65
  float X = d65 * transmission * xBar;
  float Y = d65 * transmission * yBar;
  float Z = d65 * transmission * zBar;
  
  // Convert XYZ to sRGB (simplified matrix)
  float r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
  float g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
  float b = 0.0557 * X - 0.2040 * Y + 1.0570 * Z;
  
  // Gamma correction
  r = r <= 0.0031308 ? 12.92 * r : 1.055 * pow(r, 1.0 / 2.4) - 0.055;
  g = g <= 0.0031308 ? 12.92 * g : 1.055 * pow(g, 1.0 / 2.4) - 0.055;
  b = b <= 0.0031308 ? 12.92 * b : 1.055 * pow(b, 1.0 / 2.4) - 0.055;
  
  return vec3(r, g, b);
}

void main() {
  vec2 uv = v_texCoord;
  vec2 pixelCoord = uv * u_resolution;
  float px = pixelCoord.x;
  float py = pixelCoord.y;
  
  if (u_pass == 0) {
    // Pass 1: Color calculation
    // Determine which layers apply
    bool inSquare = inRectangle(px, py, u_squareX, u_squareY, u_squareSize);
    bool inCircle = inCircle(px, py, u_circleX, u_circleY, u_circleRadius);
    bool inTriangle = inTriangle(px, py, u_triangleX, u_triangleY, u_triangleSize);
    bool onGridLine = isOnGridLine(px, py, u_gridCellSize);
    
    // Sample background spectrum
    float bgIntensity = onGridLine ? 0.6 : 1.0;
    
    // Sample material textures and multiply transmissions
    // For simplicity, sample at a representative wavelength (middle of visible range)
    float wavelengthNorm = 0.5; // 600nm (middle of 200-1000nm range)
    
    float transmission = bgIntensity * sample1DTexture(u_backgroundTexture, wavelengthNorm);
    
    if (inSquare) {
      transmission *= sample1DTexture(u_materialSquareTexture, wavelengthNorm);
    }
    if (inCircle) {
      transmission *= sample1DTexture(u_materialCircleTexture, wavelengthNorm);
    }
    if (inTriangle) {
      transmission *= sample1DTexture(u_materialTriangleTexture, wavelengthNorm);
    }
    
    // Convert to RGB (simplified - using single wavelength)
    vec3 rgb = spectrumToRGB(transmission, wavelengthNorm);
    
    // Clamp and output
    rgb = clamp(rgb, 0.0, 1.0);
    gl_FragColor = vec4(rgb, 1.0);
  } else {
    // Pass 2: Adaptive normalization
    vec3 rgb = texture2D(u_colorTexture, uv).rgb;
    
    // Sample window with stride/dilation
    float maxBrightness = 0.0;
    float halfWindow = u_windowSize * 0.5;
    
    for (float dy = -halfWindow; dy <= halfWindow; dy += u_stride) {
      for (float dx = -halfWindow; dx <= halfWindow; dx += u_stride) {
        vec2 samplePos = pixelCoord + vec2(dx, dy);
        vec2 sampleUV = samplePos / u_resolution;
        
        // Clamp to valid UV range
        sampleUV = clamp(sampleUV, vec2(0.0), vec2(1.0));
        
        vec3 sampleRGB = texture2D(u_colorTexture, sampleUV).rgb;
        float brightness = max(sampleRGB.r, max(sampleRGB.g, sampleRGB.b));
        maxBrightness = max(maxBrightness, brightness);
      }
    }
    
    // Normalize
    float normalizedBrightness = max(maxBrightness, 0.001);
    vec3 normalized = rgb / normalizedBrightness;
    
    // Clamp and output
    normalized = clamp(normalized, 0.0, 1.0);
    gl_FragColor = vec4(normalized, 1.0);
  }
}

