// import { LayerSystem } from '../layers/LayerSystem'; // Not used
import { SpectrumPoint } from "../CIE";
import { MaterialTextureGenerator } from "../shaders/MaterialTextureGenerator";
import { CIETextureGenerator } from "../shaders/CIETextureGenerator";
import { ShaderDataProvider } from "../shaders/ShaderDataProvider";
import { Material } from "../interfaces/Material";
import { SolutionProperties } from "../SolutionProperties";
import { Grid } from "../../Grid";
import { getProfiler } from "../../utils/RenderProfiler";

/**
 * GPUPixelRenderer - GPU-accelerated pixel-by-pixel renderer using WebGL shaders
 * Performs two-pass rendering: color calculation + adaptive normalization
 */
export class GPUPixelRenderer {
  private materialTextureGenerator: MaterialTextureGenerator;
  private cieTextureGenerator: CIETextureGenerator;
  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  private isWebGL2: boolean = false;

  // Cached textures
  private cieTextures: {
    x: WebGLTexture | null;
    y: WebGLTexture | null;
    z: WebGLTexture | null;
    d65: WebGLTexture | null;
  } = {
    x: null,
    y: null,
    z: null,
    d65: null,
  };

  // CIE scale factors to recover original values from normalized textures
  private cieScales: {
    x: number;
    y: number;
    z: number;
    d65: number;
  } = {
    x: 1.0,
    y: 1.0,
    z: 1.0,
    d65: 1.0,
  };

  private materialTextures: {
    square: WebGLTexture | null;
    circle: WebGLTexture | null;
    triangle: WebGLTexture | null;
    background: WebGLTexture | null;
  } = {
    square: null,
    circle: null,
    triangle: null,
    background: null,
  };

  // Previous properties for change detection
  private previousSquareProperties: SolutionProperties | null = null;
  private previousCircleProperties: SolutionProperties | null = null;
  private previousTriangleProperties: SolutionProperties | null = null;

  // Shader program (will be created when GL context is available)
  private shaderProgram: WebGLProgram | null = null;
  private shaderUniforms: { [key: string]: WebGLUniformLocation | null } = {};
  private shaderAttributes: { [key: string]: number } = {};

  // Cached canvas resources to avoid recreation every frame
  private cachedCanvas: HTMLCanvasElement | null = null;
  private cachedImageData: ImageData | null = null;
  private cachedPixelBuffer: Uint8Array | null = null;
  private cachedCanvasWidth: number = 0;
  private cachedCanvasHeight: number = 0;

  // Shader source code (embedded as strings)
  private readonly vertexShaderSource = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;
    void main() {
      v_texCoord = a_texCoord;
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  private readonly fragmentShaderSourceWebGL1 = `
    precision highp float;
    uniform vec2 u_resolution;
    uniform float u_gridCellSize;
    uniform float u_boundsMinX, u_boundsMinY;
    uniform float u_squareX, u_squareY, u_squareSize;
    uniform float u_circleX, u_circleY, u_circleRadius;
    uniform float u_triangleX, u_triangleY, u_triangleSize;
    uniform float u_wavelengthMin;
    uniform float u_wavelengthMax;
    uniform int u_pass;
    uniform sampler2D u_materialSquareTexture;
    uniform sampler2D u_materialCircleTexture;
    uniform sampler2D u_materialTriangleTexture;
    uniform sampler2D u_backgroundTexture;
    uniform sampler2D u_cieXTexture;
    uniform sampler2D u_cieYTexture;
    uniform sampler2D u_cieZTexture;
    uniform sampler2D u_d65Texture;
    uniform float u_cieXScale, u_cieYScale, u_cieZScale, u_d65Scale;
    uniform sampler2D u_colorTexture;
    uniform float u_windowSize;
    uniform float u_stride;
    varying vec2 v_texCoord;
    
    float sample1DTexture(sampler2D tex, float wavelengthNorm) {
      vec2 uv = vec2(wavelengthNorm, 0.5);
      vec4 sample = texture2D(tex, uv);
      // Texture is stored as RGBA with value in R channel (already normalized 0-1)
      return sample.r;
    }
    
    bool inRectangle(float px, float py, float cx, float cy, float size) {
      float halfSize = size * 0.5;
      return px >= cx - halfSize && px <= cx + halfSize &&
             py >= cy - halfSize && py <= cy + halfSize;
    }
    
    bool inCircle(float px, float py, float cx, float cy, float radius) {
      float dx = px - cx;
      float dy = py - cy;
      return (dx * dx + dy * dy) <= (radius * radius);
    }
    
    bool inTriangle(float px, float py, float cx, float cy, float size) {
      float halfSize = size * 0.5;
      float v1x = cx;
      float v1y = cy - halfSize;
      float v2x = cx - halfSize;
      float v2y = cy + halfSize;
      float v3x = cx + halfSize;
      float v3y = cy + halfSize;
      float d1 = sign((px - v3x) * (v1y - v3y) - (v1x - v3x) * (py - v3y));
      float d2 = sign((px - v1x) * (v2y - v1y) - (v2x - v1x) * (py - v1y));
      float d3 = sign((px - v2x) * (v3y - v2y) - (v3x - v2x) * (py - v2y));
      bool hasNeg = (d1 < 0.0) || (d2 < 0.0) || (d3 < 0.0);
      bool hasPos = (d1 > 0.0) || (d2 > 0.0) || (d3 > 0.0);
      return !(hasNeg && hasPos);
    }
    
    bool isOnGridLine(float px, float py, float cellSize) {
      float gridX = floor(px / cellSize) * cellSize;
      float gridY = floor(py / cellSize) * cellSize;
      float distToVertical = min(abs(px - gridX), abs(px - (gridX + cellSize)));
      float distToHorizontal = min(abs(py - gridY), abs(py - (gridY + cellSize)));
      return distToVertical <= 1.0 || distToHorizontal <= 1.0;  // 2 pixels wide
    }
    
    // Integrate spectrum over multiple wavelengths (like CPU path)
    // Returns XYZ tristimulus values
    vec3 integrateSpectrumToXYZ(float bgIntensity, bool isInSquare, bool isInCircle, bool isInTriangle) {
      float X = 0.0;
      float Y = 0.0;
      float Z = 0.0;
      
      // Visible range in normalized coordinates (200-1000nm range)
      // 380nm = (380-200)/(1000-200) = 0.225
      // 700nm = (700-200)/(1000-200) = 0.625
      const float VISIBLE_START = 0.225;
      const float VISIBLE_END = 0.625;
      const int NUM_SAMPLES = 16;
      float dLambda = (VISIBLE_END - VISIBLE_START) / float(NUM_SAMPLES);
      
      // Integrate using Riemann sum (approximates trapezoidal rule)
      for (int i = 0; i < NUM_SAMPLES; i++) {
        float waveNorm = VISIBLE_START + (float(i) + 0.5) * dLambda;
        
        // Calculate transmission at this wavelength
        float transmission = bgIntensity * sample1DTexture(u_backgroundTexture, waveNorm);
        if (isInSquare) transmission *= sample1DTexture(u_materialSquareTexture, waveNorm);
        if (isInCircle) transmission *= sample1DTexture(u_materialCircleTexture, waveNorm);
        if (isInTriangle) transmission *= sample1DTexture(u_materialTriangleTexture, waveNorm);
        
        // Sample CIE functions and D65 illuminant (multiply by scale factors to recover original values)
        float xBar = sample1DTexture(u_cieXTexture, waveNorm) * u_cieXScale;
        float yBar = sample1DTexture(u_cieYTexture, waveNorm) * u_cieYScale;
        float zBar = sample1DTexture(u_cieZTexture, waveNorm) * u_cieZScale;
        float d65 = sample1DTexture(u_d65Texture, waveNorm) * u_d65Scale;
        
        // Accumulate weighted by dLambda (integration)
        X += d65 * transmission * xBar * dLambda;
        Y += d65 * transmission * yBar * dLambda;
        Z += d65 * transmission * zBar * dLambda;
      }
      
      return vec3(X, Y, Z);
    }
    
    // Convert XYZ to linear RGB WITHOUT Y-normalization or gamma
    // This preserves brightness information for Pass 2 normalization
    vec3 xyzToLinearRGB(vec3 xyz) {
      // NOTE: Do NOT divide by D65 white point!
      // The sRGB matrix is already designed for D65 and handles adaptation internally.
      // For D65 illuminant input (X:Y:Z = 0.95047:1.0:1.08883), this matrix produces r≈g≈b≈1.0
      float X = xyz.x;
      float Y = xyz.y;
      float Z = xyz.z;
      
      // XYZ to linear sRGB matrix (D65 adapted) - NO gamma correction yet
      float r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
      float g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
      float b = 0.0557 * X - 0.2040 * Y + 1.0570 * Z;
      
      // Return linear RGB - values CAN exceed 1.0, that's OK
      // Pass 2 will normalize by max brightness in window
      return vec3(r, g, b);
    }
    
    // Apply sRGB gamma correction to a single channel
    float gammaCorrect(float c) {
      if (c <= 0.0) return 0.0;
      return c <= 0.0031308 ? 12.92 * c : 1.055 * pow(c, 1.0 / 2.4) - 0.055;
    }
    
    void main() {
      // Flip Y coordinate (WebGL origin is bottom-left, screen is top-left)
      vec2 uv = vec2(v_texCoord.x, 1.0 - v_texCoord.y);
      vec2 pixelCoord = uv * u_resolution;
      float px = pixelCoord.x;
      float py = pixelCoord.y;
      
      // Transform pixel coordinates to world coordinates
      float worldX = u_boundsMinX + px;
      float worldY = u_boundsMinY + py;
      
      if (u_pass == 0) {
        // Pass 1: Color calculation - output LINEAR RGB (preserves brightness)
        bool isInSquare = inRectangle(worldX, worldY, u_squareX, u_squareY, u_squareSize);
        bool isInCircle = inCircle(worldX, worldY, u_circleX, u_circleY, u_circleRadius);
        bool isInTriangle = inTriangle(worldX, worldY, u_triangleX, u_triangleY, u_triangleSize);
        bool onGridLine = isOnGridLine(worldX, worldY, u_gridCellSize);
        float bgIntensity = onGridLine ? 0.6 : 1.0;
        
        // Integrate spectrum over multiple wavelengths
        vec3 xyz = integrateSpectrumToXYZ(bgIntensity, isInSquare, isInCircle, isInTriangle);
        
        // Convert to LINEAR RGB - NO Y-normalization, NO gamma
        // Values can exceed 1.0 - that's intentional for brightness preservation
        vec3 linearRGB = xyzToLinearRGB(xyz);
        
        // Store linear RGB (may exceed 1.0) - Pass 2 will normalize
        gl_FragColor = vec4(linearRGB, 1.0);
      } else {
        // Pass 2: Find max brightness in window, normalize, then apply gamma
        vec3 linearRGB = texture2D(u_colorTexture, uv).rgb;
        float maxBrightness = 0.0;
        float halfWindow = u_windowSize * 0.5;
        float stepSize = u_stride;
        
        // Fixed loop count for WebGL 1.0 compatibility (50x50 = 2500 samples max)
        for (int i = 0; i < 50; i++) {
          float dy = -halfWindow + float(i) * stepSize;
          if (dy <= halfWindow) {
            for (int j = 0; j < 50; j++) {
              float dx = -halfWindow + float(j) * stepSize;
              if (dx <= halfWindow) {
                vec2 samplePos = pixelCoord + vec2(dx, dy);
                vec2 sampleUV = clamp(samplePos / u_resolution, vec2(0.0), vec2(1.0));
                vec3 sampleRGB = texture2D(u_colorTexture, sampleUV).rgb;
                // Find max component (brightness) - can be > 1.0
                float brightness = max(sampleRGB.r, max(sampleRGB.g, sampleRGB.b));
                maxBrightness = max(maxBrightness, brightness);
              }
            }
          }
        }
        
        // Normalize by max brightness in window
        float normFactor = max(maxBrightness, 0.001);
        vec3 normalized = linearRGB / normFactor;
        
        // NOW apply gamma correction (after normalization)
        vec3 gammaCorrected = vec3(
          gammaCorrect(normalized.r),
          gammaCorrect(normalized.g),
          gammaCorrect(normalized.b)
        );
        
        // Final clamp and output
        gl_FragColor = vec4(clamp(gammaCorrected, 0.0, 1.0), 1.0);
      }
    }
  `;

  private readonly vertexShaderSourceWebGL2 = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;
void main() {
  v_texCoord = a_texCoord;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

  private readonly fragmentShaderSourceWebGL2 = `#version 300 es
precision highp float;
uniform vec2 u_resolution;
uniform float u_gridCellSize;
uniform float u_boundsMinX, u_boundsMinY;
uniform float u_squareX, u_squareY, u_squareSize;
uniform float u_circleX, u_circleY, u_circleRadius;
uniform float u_triangleX, u_triangleY, u_triangleSize;
uniform float u_wavelengthMin;
uniform float u_wavelengthMax;
uniform int u_pass;
uniform sampler2D u_materialSquareTexture;
uniform sampler2D u_materialCircleTexture;
uniform sampler2D u_materialTriangleTexture;
uniform sampler2D u_backgroundTexture;
uniform sampler2D u_cieXTexture;
uniform sampler2D u_cieYTexture;
uniform sampler2D u_cieZTexture;
uniform sampler2D u_d65Texture;
uniform float u_cieXScale, u_cieYScale, u_cieZScale, u_d65Scale;
uniform sampler2D u_colorTexture;
uniform float u_windowSize;
uniform float u_stride;
in vec2 v_texCoord;
out vec4 fragColor;

float sample1DTexture(sampler2D tex, float wavelengthNorm) {
  vec2 uv = vec2(wavelengthNorm, 0.5);
  vec4 texSample = texture(tex, uv);
  return texSample.r;
}

bool inRectangle(float px, float py, float cx, float cy, float size) {
  float halfSize = size * 0.5;
  return px >= cx - halfSize && px <= cx + halfSize &&
         py >= cy - halfSize && py <= cy + halfSize;
}

bool inCircle(float px, float py, float cx, float cy, float radius) {
  float dx = px - cx;
  float dy = py - cy;
  return (dx * dx + dy * dy) <= (radius * radius);
}

bool inTriangle(float px, float py, float cx, float cy, float size) {
  float halfSize = size * 0.5;
  float v1x = cx;
  float v1y = cy - halfSize;
  float v2x = cx - halfSize;
  float v2y = cy + halfSize;
  float v3x = cx + halfSize;
  float v3y = cy + halfSize;
  float d1 = sign((px - v3x) * (v1y - v3y) - (v1x - v3x) * (py - v3y));
  float d2 = sign((px - v1x) * (v2y - v1y) - (v2x - v1x) * (py - v1y));
  float d3 = sign((px - v2x) * (v3y - v2y) - (v3x - v2x) * (py - v2y));
  bool hasNeg = (d1 < 0.0) || (d2 < 0.0) || (d3 < 0.0);
  bool hasPos = (d1 > 0.0) || (d2 > 0.0) || (d3 > 0.0);
  return !(hasNeg && hasPos);
}

bool isOnGridLine(float px, float py, float cellSize) {
  float gridX = floor(px / cellSize) * cellSize;
  float gridY = floor(py / cellSize) * cellSize;
  float distToVertical = min(abs(px - gridX), abs(px - (gridX + cellSize)));
  float distToHorizontal = min(abs(py - gridY), abs(py - (gridY + cellSize)));
  return distToVertical <= 1.0 || distToHorizontal <= 1.0;  // 2 pixels wide
}

// Integrate spectrum over multiple wavelengths (like CPU path)
// Returns XYZ tristimulus values
vec3 integrateSpectrumToXYZ(float bgIntensity, bool isInSquare, bool isInCircle, bool isInTriangle) {
  float X = 0.0;
  float Y = 0.0;
  float Z = 0.0;
  
  // Visible range in normalized coordinates (200-1000nm range)
  // 380nm = (380-200)/(1000-200) = 0.225
  // 700nm = (700-200)/(1000-200) = 0.625
  const float VISIBLE_START = 0.225;
  const float VISIBLE_END = 0.625;
  const int NUM_SAMPLES = 16;
  float dLambda = (VISIBLE_END - VISIBLE_START) / float(NUM_SAMPLES);
  
  // Integrate using Riemann sum (approximates trapezoidal rule)
  for (int i = 0; i < NUM_SAMPLES; i++) {
    float waveNorm = VISIBLE_START + (float(i) + 0.5) * dLambda;
    
    // Calculate transmission at this wavelength
    float transmission = bgIntensity * sample1DTexture(u_backgroundTexture, waveNorm);
    if (isInSquare) transmission *= sample1DTexture(u_materialSquareTexture, waveNorm);
    if (isInCircle) transmission *= sample1DTexture(u_materialCircleTexture, waveNorm);
    if (isInTriangle) transmission *= sample1DTexture(u_materialTriangleTexture, waveNorm);
    
    // Sample CIE functions and D65 illuminant (multiply by scale factors to recover original values)
    float xBar = sample1DTexture(u_cieXTexture, waveNorm) * u_cieXScale;
    float yBar = sample1DTexture(u_cieYTexture, waveNorm) * u_cieYScale;
    float zBar = sample1DTexture(u_cieZTexture, waveNorm) * u_cieZScale;
    float d65 = sample1DTexture(u_d65Texture, waveNorm) * u_d65Scale;
    
    // Accumulate weighted by dLambda (integration)
    X += d65 * transmission * xBar * dLambda;
    Y += d65 * transmission * yBar * dLambda;
    Z += d65 * transmission * zBar * dLambda;
  }
  
  return vec3(X, Y, Z);
}

// Convert XYZ to linear RGB WITHOUT Y-normalization or gamma
// This preserves brightness information for Pass 2 normalization
vec3 xyzToLinearRGB(vec3 xyz) {
  // NOTE: Do NOT divide by D65 white point!
  // The sRGB matrix is already designed for D65 and handles adaptation internally.
  // For D65 illuminant input (X:Y:Z = 0.95047:1.0:1.08883), this matrix produces r≈g≈b≈1.0
  float X = xyz.x;
  float Y = xyz.y;
  float Z = xyz.z;
  
  // XYZ to linear sRGB matrix (D65 adapted) - NO gamma correction yet
  float r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
  float g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
  float b = 0.0557 * X - 0.2040 * Y + 1.0570 * Z;
  
  // Return linear RGB - values CAN exceed 1.0, that's OK
  return vec3(r, g, b);
}

// Apply sRGB gamma correction to a single channel
float gammaCorrect(float c) {
  if (c <= 0.0) return 0.0;
  return c <= 0.0031308 ? 12.92 * c : 1.055 * pow(c, 1.0 / 2.4) - 0.055;
}

void main() {
  // Flip Y coordinate (WebGL origin is bottom-left, screen is top-left)
  vec2 uv = vec2(v_texCoord.x, 1.0 - v_texCoord.y);
  vec2 pixelCoord = uv * u_resolution;
  float px = pixelCoord.x;
  float py = pixelCoord.y;
  
  // Transform pixel coordinates to world coordinates
  float worldX = u_boundsMinX + px;
  float worldY = u_boundsMinY + py;
  
  if (u_pass == 0) {
    // Pass 1: Color calculation - output LINEAR RGB (preserves brightness)
    bool isInSquare = inRectangle(worldX, worldY, u_squareX, u_squareY, u_squareSize);
    bool isInCircle = inCircle(worldX, worldY, u_circleX, u_circleY, u_circleRadius);
    bool isInTriangle = inTriangle(worldX, worldY, u_triangleX, u_triangleY, u_triangleSize);
    bool onGridLine = isOnGridLine(worldX, worldY, u_gridCellSize);
    float bgIntensity = onGridLine ? 0.6 : 1.0;
    
    // Integrate spectrum over multiple wavelengths
    vec3 xyz = integrateSpectrumToXYZ(bgIntensity, isInSquare, isInCircle, isInTriangle);
    
    // Convert to LINEAR RGB - NO Y-normalization, NO gamma
    vec3 linearRGB = xyzToLinearRGB(xyz);
    
    // Store linear RGB (may exceed 1.0) - Pass 2 will normalize
    fragColor = vec4(linearRGB, 1.0);
  } else {
    // Pass 2: Find max brightness in window, normalize, then apply gamma
    vec3 linearRGB = texture(u_colorTexture, uv).rgb;
    float maxBrightness = 0.0;
    float halfWindow = u_windowSize * 0.5;
    
    // WebGL 2.0 allows variable loop bounds
    for (float dy = -halfWindow; dy <= halfWindow; dy += u_stride) {
      for (float dx = -halfWindow; dx <= halfWindow; dx += u_stride) {
        vec2 samplePos = pixelCoord + vec2(dx, dy);
        vec2 sampleUV = clamp(samplePos / u_resolution, vec2(0.0), vec2(1.0));
        vec3 sampleRGB = texture(u_colorTexture, sampleUV).rgb;
        // Find max component (brightness) - can be > 1.0
        float brightness = max(sampleRGB.r, max(sampleRGB.g, sampleRGB.b));
        maxBrightness = max(maxBrightness, brightness);
      }
    }
    
    // Normalize by max brightness in window
    float normFactor = max(maxBrightness, 0.001);
    vec3 normalized = linearRGB / normFactor;
    
    // NOW apply gamma correction (after normalization)
    vec3 gammaCorrected = vec3(
      gammaCorrect(normalized.r),
      gammaCorrect(normalized.g),
      gammaCorrect(normalized.b)
    );
    
    // Final clamp and output
    fragColor = vec4(clamp(gammaCorrected, 0.0, 1.0), 1.0);
  }
}
`;

  constructor() {
    this.materialTextureGenerator = new MaterialTextureGenerator(200);
    this.cieTextureGenerator = new CIETextureGenerator(200);
  }

  /**
   * Get vertex shader source based on WebGL version
   */
  private getVertexShaderSource(): string {
    return this.isWebGL2
      ? this.vertexShaderSourceWebGL2
      : this.vertexShaderSource;
  }

  /**
   * Get fragment shader source based on WebGL version
   */
  private getFragmentShaderSource(): string {
    return this.isWebGL2
      ? this.fragmentShaderSourceWebGL2
      : this.fragmentShaderSourceWebGL1;
  }

  /**
   * Compile shader from source
   */
  private compileShader(
    gl: WebGLRenderingContext | WebGL2RenderingContext,
    type: number,
    source: string
  ): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) {
      console.error("[GPU] Failed to create shader");
      return null;
    }

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    // Check for compilation errors
    const compileError = gl.getError();
    if (compileError !== gl.NO_ERROR) {
      console.error(
        `[GPU] WebGL error during shader compilation: ${this.getGLErrorString(compileError)}`
      );
    }

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader);
      const shaderType = type === gl.VERTEX_SHADER ? "VERTEX" : "FRAGMENT";
      console.error(`[GPU] ${shaderType} shader compilation failed:`, error);
      console.error(
        `[GPU] Shader source (first 500 chars):`,
        source.substring(0, 500)
      );
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  /**
   * Create shader program from vertex and fragment shaders
   */
  private createShaderProgram(
    gl: WebGLRenderingContext | WebGL2RenderingContext
  ): WebGLProgram | null {
    const vertexSource = this.getVertexShaderSource();
    const fragmentSource = this.getFragmentShaderSource();
    const vertexShader = this.compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this.compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      fragmentSource
    );

    if (!vertexShader || !fragmentShader) {
      return null;
    }

    const program = gl.createProgram();
    if (!program) return null;

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program);
      console.error("[GPU] Shader program linking failed:", error);

      // Check for additional info
      const vertexInfo = gl.getShaderInfoLog(vertexShader);
      const fragmentInfo = gl.getShaderInfoLog(fragmentShader);
      if (vertexInfo) console.error("[GPU] Vertex shader info:", vertexInfo);
      if (fragmentInfo)
        console.error("[GPU] Fragment shader info:", fragmentInfo);

      gl.deleteProgram(program);
      return null;
    }

    console.log("[GPU] Shader program created successfully");

    // Get uniform and attribute locations
    const uniforms = [
      "u_resolution",
      "u_gridCellSize",
      "u_boundsMinX",
      "u_boundsMinY",
      "u_squareX",
      "u_squareY",
      "u_squareSize",
      "u_circleX",
      "u_circleY",
      "u_circleRadius",
      "u_triangleX",
      "u_triangleY",
      "u_triangleSize",
      "u_wavelengthMin",
      "u_wavelengthMax",
      "u_pass",
      "u_materialSquareTexture",
      "u_materialCircleTexture",
      "u_materialTriangleTexture",
      "u_backgroundTexture",
      "u_cieXTexture",
      "u_cieYTexture",
      "u_cieZTexture",
      "u_d65Texture",
      "u_cieXScale",
      "u_cieYScale",
      "u_cieZScale",
      "u_d65Scale",
      "u_colorTexture",
      "u_windowSize",
      "u_stride",
    ];

    for (const uniform of uniforms) {
      this.shaderUniforms[uniform] = gl.getUniformLocation(program, uniform);
    }

    this.shaderAttributes["a_position"] = gl.getAttribLocation(
      program,
      "a_position"
    );
    this.shaderAttributes["a_texCoord"] = gl.getAttribLocation(
      program,
      "a_texCoord"
    );

    return program;
  }

  /**
   * Initialize WebGL context and create shaders/textures
   * @param gl WebGL rendering context (WebGL 1.0 or 2.0)
   */
  initialize(gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    // Detect WebGL 2.0
    this.isWebGL2 = gl instanceof WebGL2RenderingContext;

    console.log("[GPU] Initializing GPUPixelRenderer...");
    console.log("[GPU] WebGL version:", gl.getParameter(gl.VERSION));
    console.log("[GPU] WebGL type:", this.isWebGL2 ? "WebGL 2.0" : "WebGL 1.0");
    console.log("[GPU] WebGL vendor:", gl.getParameter(gl.VENDOR));
    console.log("[GPU] WebGL renderer:", gl.getParameter(gl.RENDERER));
    console.log(
      "[GPU] Max texture size:",
      gl.getParameter(gl.MAX_TEXTURE_SIZE)
    );
    console.log(
      "[GPU] Max viewport dims:",
      gl.getParameter(gl.MAX_VIEWPORT_DIMS)
    );

    // Check WebGL context state
    const contextLost = gl.getParameter(0x9242); // gl.CONTEXT_LOST_WEBGL (if available)
    const glError = gl.getError();
    console.log("[GPU] WebGL context state:", {
      contextLost: contextLost !== undefined ? contextLost : "not available",
      glError: glError === gl.NO_ERROR ? "NO_ERROR" : `Error code: ${glError}`,
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxViewportDims: gl.getParameter(gl.MAX_VIEWPORT_DIMS),
      maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
      maxFragmentUniformVectors: gl.getParameter(
        gl.MAX_FRAGMENT_UNIFORM_VECTORS
      ),
    });

    // Check for WebGL errors
    const initError = gl.getError();
    if (initError !== gl.NO_ERROR) {
      console.error(
        `[GPU] WebGL error during initialization: ${this.getGLErrorString(initError)}`
      );
    }
    this.gl = gl;

    // Generate CIE textures (one-time)
    const cieData = this.cieTextureGenerator.generateCIETextures();
    this.cieTextures = ShaderDataProvider.createCIETextures(gl, cieData);
    // Store scale factors to pass to shader
    this.cieScales = cieData.scales;

    // Compile shader program
    this.shaderProgram = this.createShaderProgram(gl);
    if (!this.shaderProgram) {
      console.error("Failed to create shader program");
    }
  }

  /**
   * Update material textures if properties have changed
   */
  updateMaterialTextures(
    squareMaterial: Material,
    squareProperties: SolutionProperties,
    circleMaterial: Material,
    circleProperties: SolutionProperties,
    triangleMaterial: Material,
    triangleProperties: SolutionProperties,
    backgroundSpectrum: SpectrumPoint[]
  ): void {
    if (!this.gl) {
      throw new Error(
        "GPUPixelRenderer not initialized. Call initialize() first."
      );
    }

    const profiler = getProfiler();
    profiler.start("gpuPath.textureUpdates");

    // Helper to deep copy SolutionProperties (including Map)
    const deepCopyProperties = (
      props: SolutionProperties
    ): SolutionProperties => {
      return {
        ...props,
        moleculeConcentrations: new Map(props.moleculeConcentrations),
      };
    };

    // Check if square material needs update
    if (
      !this.previousSquareProperties ||
      MaterialTextureGenerator.propertiesChanged(
        this.previousSquareProperties,
        squareProperties
      )
    ) {
      try {
        profiler.start("gpuPath.textureUpdates.square");
        const squareTextureData =
          this.materialTextureGenerator.generateMaterialTexture(
            squareMaterial,
            squareProperties
          );
        if (this.materialTextures.square) {
          ShaderDataProvider.updateMaterialTexture(
            this.gl,
            this.materialTextures.square,
            squareTextureData
          );
        } else {
          this.materialTextures.square =
            ShaderDataProvider.createMaterialTexture(
              this.gl,
              squareTextureData
            );
        }
        this.previousSquareProperties = deepCopyProperties(squareProperties);
        profiler.end("gpuPath.textureUpdates.square");
      } catch (error) {
        console.error("Error updating square material texture:", error);
        throw error; // Re-throw to be caught by caller
      }
    }

    // Check if circle material needs update
    if (
      !this.previousCircleProperties ||
      MaterialTextureGenerator.propertiesChanged(
        this.previousCircleProperties,
        circleProperties
      )
    ) {
      try {
        profiler.start("gpuPath.textureUpdates.circle");
        const circleTextureData =
          this.materialTextureGenerator.generateMaterialTexture(
            circleMaterial,
            circleProperties
          );
        if (this.materialTextures.circle) {
          ShaderDataProvider.updateMaterialTexture(
            this.gl,
            this.materialTextures.circle,
            circleTextureData
          );
        } else {
          this.materialTextures.circle =
            ShaderDataProvider.createMaterialTexture(
              this.gl,
              circleTextureData
            );
        }
        this.previousCircleProperties = deepCopyProperties(circleProperties);
        profiler.end("gpuPath.textureUpdates.circle");
      } catch (error) {
        console.error("Error updating circle material texture:", error);
        throw error; // Re-throw to be caught by caller
      }
    }

    // Check if triangle material needs update
    if (
      !this.previousTriangleProperties ||
      MaterialTextureGenerator.propertiesChanged(
        this.previousTriangleProperties,
        triangleProperties
      )
    ) {
      try {
        profiler.start("gpuPath.textureUpdates.triangle");
        const triangleTextureData =
          this.materialTextureGenerator.generateMaterialTexture(
            triangleMaterial,
            triangleProperties
          );
        if (this.materialTextures.triangle) {
          ShaderDataProvider.updateMaterialTexture(
            this.gl,
            this.materialTextures.triangle,
            triangleTextureData
          );
        } else {
          this.materialTextures.triangle =
            ShaderDataProvider.createMaterialTexture(
              this.gl,
              triangleTextureData
            );
        }
        this.previousTriangleProperties =
          deepCopyProperties(triangleProperties);
        profiler.end("gpuPath.textureUpdates.triangle");
      } catch (error) {
        console.error("Error updating triangle material texture:", error);
        throw error; // Re-throw to be caught by caller
      }
    }

    // Update background texture (always update, as it may change with UV mode)
    profiler.start("gpuPath.textureUpdates.background");
    const backgroundTextureData =
      this.spectrumToTextureData(backgroundSpectrum);
    if (this.materialTextures.background) {
      ShaderDataProvider.updateMaterialTexture(
        this.gl,
        this.materialTextures.background,
        backgroundTextureData
      );
    } else {
      this.materialTextures.background =
        ShaderDataProvider.createMaterialTexture(
          this.gl,
          backgroundTextureData
        );
    }
    profiler.end("gpuPath.textureUpdates.background");
    profiler.end("gpuPath.textureUpdates");
  }

  /**
   * Convert spectrum to texture data format
   */
  private spectrumToTextureData(spectrum: SpectrumPoint[]): Float32Array {
    const resolution = 200;
    const texture = new Float32Array(resolution);
    const minWavelength = 200;
    const maxWavelength = 1000;

    for (let i = 0; i < resolution; i++) {
      const wavelength =
        i === resolution - 1
          ? maxWavelength
          : minWavelength +
            (i / (resolution - 1)) * (maxWavelength - minWavelength);

      // Interpolate from spectrum
      let transmission = 1.0;
      for (let j = 0; j < spectrum.length - 1; j++) {
        if (
          wavelength >= spectrum[j].wavelength &&
          wavelength <= spectrum[j + 1].wavelength
        ) {
          const t =
            (wavelength - spectrum[j].wavelength) /
            (spectrum[j + 1].wavelength - spectrum[j].wavelength);
          transmission =
            spectrum[j].transmission +
            t * (spectrum[j + 1].transmission - spectrum[j].transmission);
          break;
        }
      }

      texture[i] = Math.max(0, Math.min(1, transmission));
    }

    return texture;
  }

  /**
   * Render directly to a Phaser RenderTexture (optimized - no readPixels)
   * @param scene Phaser scene
   * @param renderTexture Phaser RenderTexture to render to (must be created and sized correctly)
   * @param bounds Bounds of region to render
   * @param squareX Square X position
   * @param squareY Square Y position
   * @param squareSize Square size
   * @param circleX Circle X position
   * @param circleY Circle Y position
   * @param circleRadius Circle radius
   * @param triangleX Triangle X position
   * @param triangleY Triangle Y position
   * @param triangleSize Triangle size
   * @param grid Grid for determining background intensity
   * @returns true if successful, false otherwise
   */
  renderToPhaserTexture(
    scene: Phaser.Scene,
    renderTexture: Phaser.GameObjects.RenderTexture,
    bounds: { min: { x: number; y: number }; max: { x: number; y: number } },
    squareX: number,
    squareY: number,
    squareSize: number,
    circleX: number,
    circleY: number,
    circleRadius: number,
    triangleX: number,
    triangleY: number,
    triangleSize: number,
    grid: Grid
  ): boolean {
    if (!this.gl) {
      console.error("[GPU] WebGL context is null");
      return false;
    }

    if (!this.shaderProgram) {
      console.error(
        "[GPU] Shader program is null. Shader compilation may have failed."
      );
      return false;
    }

    const width = Math.ceil(bounds.max.x - bounds.min.x);
    const height = Math.ceil(bounds.max.y - bounds.min.y);

    if (width <= 0 || height <= 0) {
      console.warn(`[GPU] Invalid bounds: width=${width}, height=${height}`);
      return false;
    }

    const profiler = getProfiler();
    profiler.start("gpuPath.render");

    const gl = this.gl;

    // Save current WebGL state (comprehensive to avoid conflicts with Phaser)
    const previousProgram = gl.getParameter(gl.CURRENT_PROGRAM);
    const previousViewport = gl.getParameter(gl.VIEWPORT);
    const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    const previousTexture = gl.getParameter(gl.TEXTURE_BINDING_2D);
    const previousArrayBuffer = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
    const previousElementArrayBuffer = gl.getParameter(
      gl.ELEMENT_ARRAY_BUFFER_BINDING
    );
    const previousActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE);
    const previousBlendEnabled = gl.isEnabled(gl.BLEND);
    const previousDepthTestEnabled = gl.isEnabled(gl.DEPTH_TEST);
    const previousCullFaceEnabled = gl.isEnabled(gl.CULL_FACE);

    try {
      profiler.start("gpuPath.render.framebufferSetup");

      // Create framebuffers for two-pass rendering
      const pass1Framebuffer = gl.createFramebuffer();
      const pass1Texture = gl.createTexture();
      const pass2Framebuffer = gl.createFramebuffer();
      const pass2Texture = gl.createTexture();

      // Set up pass 1 framebuffer
      gl.bindTexture(gl.TEXTURE_2D, pass1Texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        width,
        height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      gl.bindFramebuffer(gl.FRAMEBUFFER, pass1Framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        pass1Texture,
        0
      );

      const pass1Status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (pass1Status !== gl.FRAMEBUFFER_COMPLETE) {
        console.error(
          "[GPU] Pass 1 framebuffer incomplete:",
          this.getFramebufferStatusString(pass1Status)
        );
        return false;
      }

      // Set up pass 2 framebuffer
      gl.bindTexture(gl.TEXTURE_2D, pass2Texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        width,
        height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      gl.bindFramebuffer(gl.FRAMEBUFFER, pass2Framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        pass2Texture,
        0
      );

      const pass2Status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (pass2Status !== gl.FRAMEBUFFER_COMPLETE) {
        console.error(
          "[GPU] Pass 2 framebuffer incomplete:",
          this.getFramebufferStatusString(pass2Status)
        );
        return false;
      }

      // Set up full-screen quad vertices
      const vertices = new Float32Array([
        -1,
        -1,
        0,
        0, // Bottom-left
        1,
        -1,
        1,
        0, // Bottom-right
        -1,
        1,
        0,
        1, // Top-left
        1,
        1,
        1,
        1, // Top-right
      ]);

      const vertexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

      gl.useProgram(this.shaderProgram);

      const positionLoc = this.shaderAttributes["a_position"];
      const texCoordLoc = this.shaderAttributes["a_texCoord"];

      gl.enableVertexAttribArray(positionLoc);
      gl.enableVertexAttribArray(texCoordLoc);
      gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 16, 0);
      gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 16, 8);
      profiler.end("gpuPath.render.framebufferSetup");

      // PASS 1: Color calculation
      profiler.start("gpuPath.render.pass1");
      gl.bindFramebuffer(gl.FRAMEBUFFER, pass1Framebuffer);
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      this.setUniforms(gl, {
        resolution: [width, height],
        gridCellSize: grid.cellSize,
        boundsMinX: bounds.min.x,
        boundsMinY: bounds.min.y,
        squareX,
        squareY,
        squareSize,
        circleX,
        circleY,
        circleRadius,
        triangleX,
        triangleY,
        triangleSize,
        wavelengthMin: 200,
        wavelengthMax: 1000,
        pass: 0,
        windowSize: 500,
        stride: 10,
      });

      this.bindTextures(gl, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      profiler.end("gpuPath.render.pass1");

      // PASS 2: Adaptive normalization
      profiler.start("gpuPath.render.pass2");
      gl.bindFramebuffer(gl.FRAMEBUFFER, pass2Framebuffer);
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      this.setUniforms(gl, {
        resolution: [width, height],
        gridCellSize: grid.cellSize,
        boundsMinX: bounds.min.x,
        boundsMinY: bounds.min.y,
        squareX,
        squareY,
        squareSize,
        circleX,
        circleY,
        circleRadius,
        triangleX,
        triangleY,
        triangleSize,
        wavelengthMin: 200,
        wavelengthMax: 1000,
        pass: 1,
        windowSize: 500,
        stride: 10,
      });

      this.bindTextures(gl, 1);
      gl.activeTexture(gl.TEXTURE8);
      gl.bindTexture(gl.TEXTURE_2D, pass1Texture);
      const colorTextureLoc = this.shaderUniforms["u_colorTexture"];
      if (colorTextureLoc !== null) {
        gl.uniform1i(colorTextureLoc, 8);
      }

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      profiler.end("gpuPath.render.pass2");

      // Copy from framebuffer to Phaser RenderTexture using readPixels
      // Note: Phaser doesn't expose RenderTexture's WebGL texture directly, so we use readPixels
      // but Y-flip is already done in shader, so this is still optimized
      profiler.start("gpuPath.render.textureCopy");

      // Unbind vertex buffer and disable attributes before readPixels to avoid conflicts
      gl.disableVertexAttribArray(positionLoc);
      gl.disableVertexAttribArray(texCoordLoc);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);

      // Ensure pass2Framebuffer is still bound for readPixels
      gl.bindFramebuffer(gl.FRAMEBUFFER, pass2Framebuffer);

      // Reuse or create pixel buffer
      const pixelCount = width * height * 4;
      if (
        !this.cachedPixelBuffer ||
        this.cachedPixelBuffer.length !== pixelCount
      ) {
        this.cachedPixelBuffer = new Uint8Array(pixelCount);
      }
      const pixels = this.cachedPixelBuffer;

      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

      // Reuse or create canvas and ImageData
      if (
        !this.cachedCanvas ||
        this.cachedCanvasWidth !== width ||
        this.cachedCanvasHeight !== height
      ) {
        // Recreate canvas if size changed
        this.cachedCanvas = document.createElement("canvas");
        this.cachedCanvas.width = width;
        this.cachedCanvas.height = height;
        this.cachedCanvasWidth = width;
        this.cachedCanvasHeight = height;
        this.cachedImageData = null; // Will be recreated below
      }

      const canvas = this.cachedCanvas;
      // Use willReadFrequently for better performance with frequent putImageData calls
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        console.error("[GPU] Failed to get 2D context for canvas");
        profiler.end("gpuPath.render.textureCopy");
        return false;
      }

      // Reuse or create ImageData
      if (
        !this.cachedImageData ||
        this.cachedImageData.width !== width ||
        this.cachedImageData.height !== height
      ) {
        this.cachedImageData = ctx.createImageData(width, height);
      }

      const imageData = this.cachedImageData;
      // Direct copy - Y-flip already handled in shader
      imageData.data.set(pixels);

      // DEBUG: Sample pixel data to verify non-white content
      // Sample positions: background corners + shape centers (square@200,200, circle@400,200, triangle@600,200)
      const samplePixels = [];
      const samplePositions = [
        { x: 0, y: 0, label: "bg" }, // Background corner
        { x: 200, y: 200, label: "sq" }, // Inside square
        { x: 400, y: 200, label: "ci" }, // Inside circle
        { x: 600, y: 200, label: "tr" }, // Inside triangle
      ];
      for (const pos of samplePositions) {
        const idx = (pos.y * width + pos.x) * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];
        const a = pixels[idx + 3];
        samplePixels.push({ pos, rgba: { r, g, b, a } });
      }
      // Log actual RGBA values for debugging (inline to avoid collapsed arrays)
      const colorStr = samplePixels
        .map(
          (s, i) =>
            `${samplePositions[i].label}:rgb(${s.rgba.r},${s.rgba.g},${s.rgba.b})`
        )
        .join(" | ");
      console.log(`[DEBUG] GPU pixels: ${colorStr}`);

      ctx.putImageData(imageData, 0, 0);

      // Update Phaser texture from canvas
      // Use a consistent key for the GPU render texture (reuse to avoid creating new textures every frame)
      const textureKey = "gpu-render-texture";

      // TEST: Try using renderTexture.draw() with an Image created from canvas
      // renderTexture.draw() works with Game Objects, not raw canvas
      let useRenderTextureDraw = true; // Flag to test this approach

      if (useRenderTextureDraw) {
        try {
          console.log(
            "[DEBUG] Attempting renderTexture.draw() with Image from canvas"
          );

          // Create a temporary Image from the canvas
          const tempTextureKey = "gpu-temp-canvas-texture";
          if (scene.textures.exists(tempTextureKey)) {
            scene.textures.remove(tempTextureKey);
          }
          scene.textures.addCanvas(tempTextureKey, canvas);

          // Create a temporary Image Game Object from the texture
          const tempImage = scene.add.image(0, 0, tempTextureKey);
          tempImage.setVisible(false); // Hide it, we just need it for drawing
          tempImage.setDisplaySize(canvas.width, canvas.height); // Match canvas size
          tempImage.setOrigin(0, 0); // Set origin

          // Ensure RenderTexture is sized correctly
          renderTexture.setSize(width, height);

          // Clear the render texture first
          renderTexture.clear();

          // CRITICAL: Rebind Phaser's pipeline BEFORE drawing to restore WebGL buffer state
          // This fixes the "bufferSubData: no buffer" error that occurs when Phaser tries to draw
          const renderer =
            scene.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
          if (renderer && renderer.pipelines) {
            renderer.pipelines.rebind();
          }

          // Draw the Image to the RenderTexture with explicit dimensions
          renderTexture.draw(tempImage, 0, 0, width, height);

          // Set display size to match screen
          renderTexture.setDisplaySize(width, height);

          // Clean up temporary Image
          tempImage.destroy();
          scene.textures.remove(tempTextureKey);

          console.log("[DEBUG] renderTexture.draw() succeeded");

          // Verify the render texture has content by checking its internal state
          const rtTexture = renderTexture.texture;
          console.log("[DEBUG] RenderTexture after draw():", {
            textureKey: rtTexture?.key,
            textureWidth: rtTexture ? (rtTexture as any).width : 0,
            textureHeight: rtTexture ? (rtTexture as any).height : 0,
            hasFrame: rtTexture?.frames
              ? Object.keys(rtTexture.frames).length > 0
              : false,
          });

          // Return success - we'll use RenderTexture directly instead of Image
          profiler.end("gpuPath.render.textureCopy");
          return true;
        } catch (drawError) {
          console.warn(
            "[DEBUG] renderTexture.draw() failed, falling back to addCanvas():",
            drawError
          );
          useRenderTextureDraw = false;
        }
      }

      // Fallback: Always remove and re-add texture to ensure it's properly updated
      if (scene.textures.exists(textureKey)) {
        console.log("[DEBUG] Removing existing texture for update");
        scene.textures.remove(textureKey);
      }

      // Add texture (first time or after removal)
      console.log("[DEBUG] Adding texture to texture manager");
      scene.textures.addCanvas(textureKey, canvas);

      // Don't set texture on RenderTexture - we're using a regular Image instead
      // renderTexture.setTexture(textureKey);

      console.log(
        "[DEBUG] Texture added, exists:",
        scene.textures.exists(textureKey)
      );

      // Verify canvas is valid and has content
      const testCtx = canvas.getContext("2d");
      const testImageData = testCtx?.getImageData(
        0,
        0,
        Math.min(10, canvas.width),
        Math.min(10, canvas.height)
      );
      const hasContent = testImageData
        ? Array.from(testImageData.data).some((v) => v !== 0)
        : false;

      // Detailed texture frame validation
      const texture = scene.textures.get(textureKey);
      const textureFrames = texture?.frames ? Object.keys(texture.frames) : [];
      const baseFrame = texture ? (texture as any).getFrame("__BASE") : null;
      const textureSource = texture?.source?.[0];

      console.log("[DEBUG] Canvas validation:", {
        canvasType: canvas.constructor.name,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        isHTMLCanvasElement: canvas instanceof HTMLCanvasElement,
        textureExists: scene.textures.exists(textureKey),
        textureHasFrame: textureFrames.length > 0,
        canvasHasContent: hasContent,
      });

      // Check for WebGL errors after texture operations
      const glError = this.gl.getError();
      const glErrorString =
        glError === this.gl.NO_ERROR
          ? "NO_ERROR"
          : glError === this.gl.INVALID_ENUM
            ? "INVALID_ENUM"
            : glError === this.gl.INVALID_VALUE
              ? "INVALID_VALUE"
              : glError === this.gl.INVALID_OPERATION
                ? "INVALID_OPERATION"
                : glError === this.gl.INVALID_FRAMEBUFFER_OPERATION
                  ? "INVALID_FRAMEBUFFER_OPERATION"
                  : glError === this.gl.OUT_OF_MEMORY
                    ? "OUT_OF_MEMORY"
                    : `Unknown error: ${glError}`;

      console.log("[DEBUG] Texture frame validation:", {
        textureKey,
        textureExists: !!texture,
        textureFrames: textureFrames,
        baseFrameExists: !!baseFrame,
        baseFrameName: baseFrame?.name,
        baseFrameWidth: baseFrame?.width,
        baseFrameHeight: baseFrame?.height,
        baseFrameCutX: baseFrame?.cutX,
        baseFrameCutY: baseFrame?.cutY,
        baseFrameCutWidth: baseFrame?.cutWidth,
        baseFrameCutHeight: baseFrame?.cutHeight,
        baseFrameValid:
          baseFrame && baseFrame.width > 0 && baseFrame.height > 0,
        textureSourceExists: !!textureSource,
        textureSourceType: textureSource?.constructor.name,
        textureSourceImage: textureSource?.image
          ? textureSource.image instanceof HTMLCanvasElement
            ? "HTMLCanvasElement"
            : textureSource.image.constructor.name
          : "null",
        textureSourceWidth: textureSource ? (textureSource as any).width : 0,
        textureSourceHeight: textureSource ? (textureSource as any).height : 0,
        webglError: glErrorString,
      });

      if (glError !== this.gl.NO_ERROR) {
        console.warn(
          "[DEBUG] WebGL error detected after texture operations:",
          glErrorString
        );
      }

      profiler.end("gpuPath.render.textureCopy");

      // Cleanup (vertex attributes already disabled above)
      gl.deleteBuffer(vertexBuffer);
      gl.deleteFramebuffer(pass1Framebuffer);
      gl.deleteFramebuffer(pass2Framebuffer);
      gl.deleteTexture(pass1Texture);
      gl.deleteTexture(pass2Texture);

      // Restore WebGL state comprehensively
      gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
      gl.viewport(
        previousViewport[0],
        previousViewport[1],
        previousViewport[2],
        previousViewport[3]
      );
      gl.useProgram(previousProgram);
      gl.activeTexture(previousActiveTexture);
      gl.bindTexture(gl.TEXTURE_2D, previousTexture);
      gl.bindBuffer(gl.ARRAY_BUFFER, previousArrayBuffer);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, previousElementArrayBuffer);

      // Restore enabled states
      if (previousBlendEnabled) {
        gl.enable(gl.BLEND);
      } else {
        gl.disable(gl.BLEND);
      }
      if (previousDepthTestEnabled) {
        gl.enable(gl.DEPTH_TEST);
      } else {
        gl.disable(gl.DEPTH_TEST);
      }
      if (previousCullFaceEnabled) {
        gl.enable(gl.CULL_FACE);
      } else {
        gl.disable(gl.CULL_FACE);
      }

      // After restoring WebGL state, flush Phaser's WebGL pipeline
      // This ensures Phaser's internal WebGL state (buffers, programs, etc.) is fully restored
      const renderer = scene.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
      if (renderer && renderer.pipelines) {
        renderer.pipelines.rebind();
      }

      profiler.end("gpuPath.render");
      return true;
    } catch (error) {
      console.error("[GPU] Rendering exception:", error);
      if (error instanceof Error) {
        console.error("[GPU] Error message:", error.message);
        console.error("[GPU] Error stack:", error.stack);
      }

      const glError = gl.getError();
      if (glError !== gl.NO_ERROR) {
        console.error(
          `[GPU] WebGL error during exception: ${this.getGLErrorString(glError)}`
        );
      }

      // Restore WebGL state on error
      try {
        gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
        gl.viewport(
          previousViewport[0],
          previousViewport[1],
          previousViewport[2],
          previousViewport[3]
        );
        gl.useProgram(previousProgram);
        gl.activeTexture(previousActiveTexture);
        gl.bindTexture(gl.TEXTURE_2D, previousTexture);
        gl.bindBuffer(gl.ARRAY_BUFFER, previousArrayBuffer);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, previousElementArrayBuffer);

        if (previousBlendEnabled) gl.enable(gl.BLEND);
        else gl.disable(gl.BLEND);
        if (previousDepthTestEnabled) gl.enable(gl.DEPTH_TEST);
        else gl.disable(gl.DEPTH_TEST);
        if (previousCullFaceEnabled) gl.enable(gl.CULL_FACE);
        else gl.disable(gl.CULL_FACE);
      } catch (cleanupError) {
        console.error("[GPU] Error during cleanup:", cleanupError);
      }
      return false;
    }
  }

  /**
   * Render using GPU with two-pass rendering (legacy method with readPixels fallback)
   * @param scene Phaser scene (for creating RenderTexture)
   * @param bounds Bounds of region to render
   * @param squareX Square X position
   * @param squareY Square Y position
   * @param squareSize Square size
   * @param circleX Circle X position
   * @param circleY Circle Y position
   * @param circleRadius Circle radius
   * @param triangleX Triangle X position
   * @param triangleY Triangle Y position
   * @param triangleSize Triangle size
   * @param grid Grid for determining background intensity
   * @returns RenderTexture with normalized result (or null if GPU not available)
   */
  render(
    _scene: Phaser.Scene,
    bounds: { min: { x: number; y: number }; max: { x: number; y: number } },
    squareX: number,
    squareY: number,
    squareSize: number,
    circleX: number,
    circleY: number,
    circleRadius: number,
    triangleX: number,
    triangleY: number,
    triangleSize: number,
    grid: Grid
  ): (Phaser.GameObjects.RenderTexture & { canvas: HTMLCanvasElement }) | null {
    if (!this.gl) {
      console.error("[GPU] WebGL context is null");
      return null;
    }

    if (!this.shaderProgram) {
      console.error(
        "[GPU] Shader program is null. Shader compilation may have failed."
      );
      return null;
    }

    // Calculate 1:1 pixel resolution (each screen pixel = one rendered pixel)
    const width = Math.ceil(bounds.max.x - bounds.min.x);
    const height = Math.ceil(bounds.max.y - bounds.min.y);

    if (width <= 0 || height <= 0) {
      console.warn(`[GPU] Invalid bounds: width=${width}, height=${height}`);
      return null;
    }

    // Check WebGL errors before starting
    const glError = this.gl.getError();
    if (glError !== this.gl.NO_ERROR) {
      console.error(
        `[GPU] WebGL error before render: ${this.getGLErrorString(glError)}`
      );
    }

    // GPU rendering at 1:1 pixel resolution (width x height from bounds)
    const profiler = getProfiler();
    profiler.start("gpuPath.render");

    // Use Phaser's WebGL context (not a new one)
    const gl = this.gl;

    // Save current WebGL state
    const previousProgram = gl.getParameter(gl.CURRENT_PROGRAM);
    const previousViewport = gl.getParameter(gl.VIEWPORT);
    const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    const previousTexture = gl.getParameter(gl.TEXTURE_BINDING_2D);
    const previousArrayBuffer = gl.getParameter(gl.ARRAY_BUFFER_BINDING);

    try {
      profiler.start("gpuPath.render.framebufferSetup");
      // Create framebuffers for two-pass rendering
      const pass1Framebuffer = gl.createFramebuffer();
      const pass1Texture = gl.createTexture();
      const pass2Framebuffer = gl.createFramebuffer();
      const pass2Texture = gl.createTexture();

      // Set up pass 1 framebuffer
      gl.bindTexture(gl.TEXTURE_2D, pass1Texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        width,
        height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      gl.bindFramebuffer(gl.FRAMEBUFFER, pass1Framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        pass1Texture,
        0
      );

      // Check framebuffer status
      const pass1Status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (pass1Status !== gl.FRAMEBUFFER_COMPLETE) {
        console.error(
          "[GPU] Pass 1 framebuffer incomplete:",
          this.getFramebufferStatusString(pass1Status)
        );
        return null;
      }

      // Set up pass 2 framebuffer
      gl.bindTexture(gl.TEXTURE_2D, pass2Texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        width,
        height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      gl.bindFramebuffer(gl.FRAMEBUFFER, pass2Framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        pass2Texture,
        0
      );

      // Check framebuffer status
      const pass2Status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (pass2Status !== gl.FRAMEBUFFER_COMPLETE) {
        console.error(
          "[GPU] Pass 2 framebuffer incomplete:",
          this.getFramebufferStatusString(pass2Status)
        );
        return null;
      }

      // Set up full-screen quad vertices
      const vertices = new Float32Array([
        -1,
        -1,
        0,
        0, // Bottom-left
        1,
        -1,
        1,
        0, // Bottom-right
        -1,
        1,
        0,
        1, // Top-left
        1,
        1,
        1,
        1, // Top-right
      ]);

      // Create vertex buffer
      const vertexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

      // Use our shader program
      gl.useProgram(this.shaderProgram);

      // Set up attributes
      const positionLoc = this.shaderAttributes["a_position"];
      const texCoordLoc = this.shaderAttributes["a_texCoord"];

      gl.enableVertexAttribArray(positionLoc);
      gl.enableVertexAttribArray(texCoordLoc);
      gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 16, 0);
      gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 16, 8);
      profiler.end("gpuPath.render.framebufferSetup");

      // PASS 1: Color calculation
      profiler.start("gpuPath.render.pass1");
      gl.bindFramebuffer(gl.FRAMEBUFFER, pass1Framebuffer);
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      // Set uniforms for pass 1
      this.setUniforms(gl, {
        resolution: [width, height],
        gridCellSize: grid.cellSize,
        boundsMinX: bounds.min.x,
        boundsMinY: bounds.min.y,
        squareX,
        squareY,
        squareSize,
        circleX,
        circleY,
        circleRadius,
        triangleX,
        triangleY,
        triangleSize,
        wavelengthMin: 200,
        wavelengthMax: 1000,
        pass: 0,
        windowSize: 500,
        stride: 10,
      });

      // Bind textures
      this.bindTextures(gl, 0);

      // Draw
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      profiler.end("gpuPath.render.pass1");

      // PASS 2: Adaptive normalization
      profiler.start("gpuPath.render.pass2");
      gl.bindFramebuffer(gl.FRAMEBUFFER, pass2Framebuffer);
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      // Set uniforms for pass 2
      this.setUniforms(gl, {
        resolution: [width, height],
        gridCellSize: grid.cellSize,
        boundsMinX: bounds.min.x,
        boundsMinY: bounds.min.y,
        squareX,
        squareY,
        squareSize,
        circleX,
        circleY,
        circleRadius,
        triangleX,
        triangleY,
        triangleSize,
        wavelengthMin: 200,
        wavelengthMax: 1000,
        pass: 1,
        windowSize: 500,
        stride: 10,
      });

      // Bind textures (including pass 1 result as u_colorTexture)
      this.bindTextures(gl, 1);
      gl.activeTexture(gl.TEXTURE8);
      gl.bindTexture(gl.TEXTURE_2D, pass1Texture);
      const colorTextureLoc = this.shaderUniforms["u_colorTexture"];
      if (colorTextureLoc !== null) {
        gl.uniform1i(colorTextureLoc, 8);
      }

      // Draw
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      profiler.end("gpuPath.render.pass2");

      // Read pixels from pass 2 framebuffer
      profiler.start("gpuPath.render.readback");
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      profiler.end("gpuPath.render.readback");

      // Cleanup WebGL resources
      gl.deleteBuffer(vertexBuffer);
      gl.deleteFramebuffer(pass1Framebuffer);
      gl.deleteFramebuffer(pass2Framebuffer);
      gl.deleteTexture(pass1Texture);
      gl.deleteTexture(pass2Texture);
      gl.disableVertexAttribArray(positionLoc);
      gl.disableVertexAttribArray(texCoordLoc);

      // Restore WebGL state
      gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
      gl.viewport(
        previousViewport[0],
        previousViewport[1],
        previousViewport[2],
        previousViewport[3]
      );
      gl.useProgram(previousProgram);
      gl.bindTexture(gl.TEXTURE_2D, previousTexture);
      gl.bindBuffer(gl.ARRAY_BUFFER, previousArrayBuffer);

      // Create canvas element with pixel data (SpectralDemo expects canvas property)
      profiler.start("gpuPath.render.renderTextureCreation");
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        console.error("[GPU] Failed to get 2D context for canvas");
        return null;
      }

      const imageData = ctx.createImageData(width, height);
      // Y-flip is already done in shader, so copy pixels directly
      imageData.data.set(pixels);
      ctx.putImageData(imageData, 0, 0);

      // Return object with canvas property (SpectralDemo expects this)
      const result = {
        canvas: canvas,
        destroy: () => {
          // Cleanup if needed
        },
      } as Phaser.GameObjects.RenderTexture & { canvas: HTMLCanvasElement };

      profiler.end("gpuPath.render.renderTextureCreation");

      profiler.end("gpuPath.render");
      return result;
    } catch (error) {
      console.error("[GPU] Rendering exception:", error);
      if (error instanceof Error) {
        console.error("[GPU] Error message:", error.message);
        console.error("[GPU] Error stack:", error.stack);
      }

      // Check WebGL errors
      const glError = gl.getError();
      if (glError !== gl.NO_ERROR) {
        console.error(
          `[GPU] WebGL error during exception: ${this.getGLErrorString(glError)}`
        );
      }

      // Restore WebGL state on error
      try {
        gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
        gl.viewport(
          previousViewport[0],
          previousViewport[1],
          previousViewport[2],
          previousViewport[3]
        );
        gl.useProgram(previousProgram);
        gl.bindTexture(gl.TEXTURE_2D, previousTexture);
        gl.bindBuffer(gl.ARRAY_BUFFER, previousArrayBuffer);
      } catch (cleanupError) {
        console.error("[GPU] Error during cleanup:", cleanupError);
      }
      return null;
    }
  }

  /**
   * Convert WebGL error code to string
   */
  private getGLErrorString(error: number): string {
    if (!this.gl) return `Unknown error (${error})`;
    const errorMap: { [key: number]: string } = {
      [this.gl.NO_ERROR]: "NO_ERROR",
      [this.gl.INVALID_ENUM]: "INVALID_ENUM",
      [this.gl.INVALID_VALUE]: "INVALID_VALUE",
      [this.gl.INVALID_OPERATION]: "INVALID_OPERATION",
      [this.gl.INVALID_FRAMEBUFFER_OPERATION]: "INVALID_FRAMEBUFFER_OPERATION",
      [this.gl.OUT_OF_MEMORY]: "OUT_OF_MEMORY",
      [this.gl.CONTEXT_LOST_WEBGL]: "CONTEXT_LOST_WEBGL",
    };
    return errorMap[error] || `Unknown error (${error})`;
  }

  /**
   * Convert framebuffer status code to string
   */
  private getFramebufferStatusString(status: number): string {
    if (!this.gl) return `Unknown status (${status})`;
    const statusMap: { [key: number]: string } = {
      [this.gl.FRAMEBUFFER_COMPLETE]: "FRAMEBUFFER_COMPLETE",
      [this.gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT]:
        "FRAMEBUFFER_INCOMPLETE_ATTACHMENT",
      [this.gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT]:
        "FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT",
      [this.gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS]:
        "FRAMEBUFFER_INCOMPLETE_DIMENSIONS",
      [this.gl.FRAMEBUFFER_UNSUPPORTED]: "FRAMEBUFFER_UNSUPPORTED",
    };
    return statusMap[status] || `Unknown status (${status})`;
  }

  /**
   * Set shader uniforms
   */
  private setUniforms(
    gl: WebGLRenderingContext | WebGL2RenderingContext,
    values: {
      resolution: [number, number];
      gridCellSize: number;
      boundsMinX: number;
      boundsMinY: number;
      squareX: number;
      squareY: number;
      squareSize: number;
      circleX: number;
      circleY: number;
      circleRadius: number;
      triangleX: number;
      triangleY: number;
      triangleSize: number;
      wavelengthMin: number;
      wavelengthMax: number;
      pass: number;
      windowSize: number;
      stride: number;
    }
  ): void {
    const setUniform = (name: string, value: any) => {
      const loc = this.shaderUniforms[name];
      if (loc === null) return;

      if (Array.isArray(value)) {
        if (value.length === 2) {
          gl.uniform2f(loc, value[0], value[1]);
        }
      } else if (typeof value === "number") {
        // u_pass is declared as int in shader, so use uniform1i
        if (name === "u_pass") {
          gl.uniform1i(loc, Math.floor(value));
        } else {
          // All other uniforms are float
          gl.uniform1f(loc, value);
        }
      }
    };

    setUniform("u_resolution", values.resolution);
    setUniform("u_gridCellSize", values.gridCellSize);
    setUniform("u_boundsMinX", values.boundsMinX);
    setUniform("u_boundsMinY", values.boundsMinY);
    setUniform("u_squareX", values.squareX);
    setUniform("u_squareY", values.squareY);
    setUniform("u_squareSize", values.squareSize);
    setUniform("u_circleX", values.circleX);
    setUniform("u_circleY", values.circleY);
    setUniform("u_circleRadius", values.circleRadius);
    setUniform("u_triangleX", values.triangleX);
    setUniform("u_triangleY", values.triangleY);
    setUniform("u_triangleSize", values.triangleSize);
    setUniform("u_wavelengthMin", values.wavelengthMin);
    setUniform("u_wavelengthMax", values.wavelengthMax);
    setUniform("u_pass", values.pass);
    setUniform("u_windowSize", values.windowSize);
    setUniform("u_stride", values.stride);

    // CIE scale factors (from normalized textures)
    setUniform("u_cieXScale", this.cieScales.x);
    setUniform("u_cieYScale", this.cieScales.y);
    setUniform("u_cieZScale", this.cieScales.z);
    setUniform("u_d65Scale", this.cieScales.d65);
  }

  /**
   * Bind textures to shader
   */
  private bindTextures(gl: WebGLRenderingContext, _pass: number): void {
    const textures = [
      {
        loc: "u_materialSquareTexture",
        tex: this.materialTextures.square,
        unit: 0,
      },
      {
        loc: "u_materialCircleTexture",
        tex: this.materialTextures.circle,
        unit: 1,
      },
      {
        loc: "u_materialTriangleTexture",
        tex: this.materialTextures.triangle,
        unit: 2,
      },
      {
        loc: "u_backgroundTexture",
        tex: this.materialTextures.background,
        unit: 3,
      },
      { loc: "u_cieXTexture", tex: this.cieTextures.x, unit: 4 },
      { loc: "u_cieYTexture", tex: this.cieTextures.y, unit: 5 },
      { loc: "u_cieZTexture", tex: this.cieTextures.z, unit: 6 },
      { loc: "u_d65Texture", tex: this.cieTextures.d65, unit: 7 },
    ];

    for (const { loc, tex, unit } of textures) {
      if (tex) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        const uniformLoc = this.shaderUniforms[loc];
        if (uniformLoc !== null) {
          gl.uniform1i(uniformLoc, unit);
        }
      }
    }
  }

  /**
   * Cleanup WebGL resources
   */
  destroy(): void {
    if (this.gl) {
      // Destroy CIE textures
      ShaderDataProvider.destroyTextures(this.gl, [
        this.cieTextures.x,
        this.cieTextures.y,
        this.cieTextures.z,
        this.cieTextures.d65,
      ]);

      // Destroy material textures
      ShaderDataProvider.destroyTextures(this.gl, [
        this.materialTextures.square,
        this.materialTextures.circle,
        this.materialTextures.triangle,
        this.materialTextures.background,
      ]);

      // Destroy shader program
      if (this.shaderProgram) {
        this.gl.deleteProgram(this.shaderProgram);
      }
    }

    this.gl = null;
    this.cieTextures = { x: null, y: null, z: null, d65: null };
    this.materialTextures = {
      square: null,
      circle: null,
      triangle: null,
      background: null,
    };
  }

  /**
   * Check if GPU rendering is available
   */
  isAvailable(): boolean {
    return this.gl !== null && this.shaderProgram !== null;
  }
}
