import { SpectralLayer } from '../layers/SpectralLayer';
import { LayerCompositor, CompositorConfig } from '../layers/LayerCompositor';
import { ScatteringCalculator, GaussianKernel } from '../scattering/ScatteringCalculator';
import { SpectrumPoint } from '../CIE';
import { BlackBodyEmission } from '../emission/BlackBodyEmission';

/**
 * EmissionConfig - configuration for emission rendering
 */
export interface EmissionConfig {
  /** Temperature in Kelvin for each shape */
  temperatures: Map<string, number>;
  
  /** Whether to use D65-normalized emission */
  d65Normalized: boolean;
}

/**
 * Default emission configuration
 */
export const DEFAULT_EMISSION_CONFIG: EmissionConfig = {
  temperatures: new Map(),
  d65Normalized: true,
};

/**
 * RenderPass - represents a single rendering pass in the multi-pass pipeline
 */
export interface RenderPass {
  name: string;
  execute: (context: RenderContext) => void;
}

/**
 * RenderContext - shared context for all render passes
 */
export interface RenderContext {
  gl: WebGLRenderingContext | WebGL2RenderingContext;
  width: number;
  height: number;
  layers: SpectralLayer[];
  backgroundSpectrum: SpectrumPoint[];
  framebuffers: Map<string, WebGLFramebuffer>;
  textures: Map<string, WebGLTexture>;
}

/**
 * MultiPassRenderer - GPU renderer for complex multi-layer spectral effects
 * 
 * Rendering pipeline per layer:
 * 1. Blur pass: Blur content from previous layers (based on scattering)
 * 2. Absorption pass: Apply absorption for pixels inside shapes
 * 3. Emission pass: Add emission inside shapes + aura outside
 * 
 * Final pass: Normalize and apply gamma correction
 * 
 * OCP: New passes can be added without modifying existing ones
 */
export class MultiPassRenderer {
  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  private compositor: LayerCompositor;
  
  // Shader programs
  private blurProgram: WebGLProgram | null = null;
  private absorptionProgram: WebGLProgram | null = null;
  private emissionProgram: WebGLProgram | null = null;
  private normalizeProgram: WebGLProgram | null = null;
  
  // Framebuffers for ping-pong rendering
  private framebufferA: WebGLFramebuffer | null = null;
  private framebufferB: WebGLFramebuffer | null = null;
  private textureA: WebGLTexture | null = null;
  private textureB: WebGLTexture | null = null;
  
  // Blur kernel cache
  private blurKernels: Map<number, GaussianKernel> = new Map();
  
  // Full-screen quad for rendering
  private quadBuffer: WebGLBuffer | null = null;
  
  // Emission configuration
  private emissionConfig: EmissionConfig = { ...DEFAULT_EMISSION_CONFIG };
  private blackBodyEmission: BlackBodyEmission;
  
  // Draper point: visible emission threshold
  private static readonly DRAPER_POINT = 798; // K
  
  // D65 reference intensity (B(550nm, 6500K)) for normalization
  private d65ReferenceIntensity: number;
  
  constructor(config: Partial<CompositorConfig> = {}) {
    this.compositor = new LayerCompositor(config);
    this.blackBodyEmission = new BlackBodyEmission();
    
    // Calculate D65 reference: black body intensity at 550nm, 6500K
    this.d65ReferenceIntensity = this.blackBodyEmission.getIntensityAt(550, 6500);
  }
  
  /**
   * Get D65 reference intensity for normalization
   */
  getD65ReferenceIntensity(): number {
    return this.d65ReferenceIntensity;
  }
  
  /**
   * Set temperature for a shape
   */
  setTemperature(shapeId: string, temperature: number): void {
    this.emissionConfig.temperatures.set(shapeId, temperature);
  }
  
  /**
   * Get temperature for a shape
   */
  getTemperature(shapeId: string): number {
    return this.emissionConfig.temperatures.get(shapeId) ?? 298;
  }
  
  /**
   * Check if a shape has visible emission
   */
  hasVisibleEmission(shapeId: string): boolean {
    const temp = this.getTemperature(shapeId);
    return temp >= MultiPassRenderer.DRAPER_POINT;
  }
  
  /**
   * Calculate emission intensity at wavelength using Kirchhoff's law
   * emission = absorptivity × blackBody(λ, T)
   */
  calculateEmissionIntensity(
    wavelength: number,
    temperature: number,
    transmission: number
  ): number {
    if (temperature < MultiPassRenderer.DRAPER_POINT) {
      return 0;
    }
    
    const absorptivity = 1 - transmission;
    const blackBodyIntensity = this.blackBodyEmission.getIntensityAt(wavelength, temperature);
    
    return absorptivity * blackBodyIntensity;
  }
  
  /**
   * Initialize with a WebGL context
   */
  initialize(gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.gl = gl;
    
    this.createShaders();
    this.createQuadBuffer();
    this.createFramebuffers();
  }
  
  /**
   * Add a layer to the rendering pipeline
   */
  addLayer(layer: SpectralLayer): void {
    this.compositor.addLayer(layer);
  }
  
  /**
   * Remove a layer by ID
   */
  removeLayer(id: string): boolean {
    return this.compositor.removeLayer(id);
  }
  
  /**
   * Get all layers
   */
  getLayers(): SpectralLayer[] {
    return this.compositor.getLayers();
  }
  
  /**
   * Clear all layers
   */
  clearLayers(): void {
    this.compositor.clear();
  }
  
  /**
   * Render all layers to a canvas
   * 
   * @param width Width in pixels
   * @param height Height in pixels
   * @param backgroundSpectrum Background illumination
   * @returns Canvas with rendered output
   */
  render(
    width: number,
    height: number,
    backgroundSpectrum: SpectrumPoint[]
  ): HTMLCanvasElement {
    if (!this.gl) {
      throw new Error('MultiPassRenderer not initialized');
    }
    
    // Resize framebuffers if needed
    this.resizeFramebuffers(width, height);
    
    // Get layers in z-order
    const layers = this.compositor.getLayers();
    
    // Start with background in framebuffer A
    this.renderBackground(backgroundSpectrum, width, height);
    
    // Process each layer
    let sourceTexture = this.textureA!;
    let targetFramebuffer = this.framebufferB!;
    
    for (const layer of layers) {
      // 1. Blur pass (if layer has scattering)
      this.renderBlurPass(layer, sourceTexture, targetFramebuffer, width, height);
      [sourceTexture, targetFramebuffer] = this.swapBuffers(sourceTexture, targetFramebuffer);
      
      // 2. Absorption pass
      this.renderAbsorptionPass(layer, sourceTexture, targetFramebuffer, width, height);
      [sourceTexture, targetFramebuffer] = this.swapBuffers(sourceTexture, targetFramebuffer);
      
      // 3. Emission + aura pass
      this.renderEmissionPass(layer, sourceTexture, targetFramebuffer, width, height);
      [sourceTexture, targetFramebuffer] = this.swapBuffers(sourceTexture, targetFramebuffer);
    }
    
    // Final normalization pass
    const outputCanvas = this.renderNormalizationPass(sourceTexture, width, height);
    
    return outputCanvas;
  }
  
  /**
   * Create shader programs
   */
  private createShaders(): void {
    if (!this.gl) return;
    
    // For now, create minimal placeholder shaders
    // Full implementation would create specialized shaders for each pass
    
    this.blurProgram = this.createBlurProgram();
    this.absorptionProgram = this.createAbsorptionProgram();
    this.emissionProgram = this.createEmissionProgram();
    this.normalizeProgram = this.createNormalizeProgram();
  }
  
  /**
   * Create a blur shader program (separable Gaussian)
   */
  private createBlurProgram(): WebGLProgram | null {
    if (!this.gl) return null;
    
    const vertexSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        v_texCoord = a_texCoord;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;
    
    const fragmentSource = `
      precision highp float;
      uniform sampler2D u_texture;
      uniform vec2 u_resolution;
      uniform vec2 u_direction; // (1,0) for horizontal, (0,1) for vertical
      uniform float u_weights[16]; // Gaussian weights
      uniform float u_offsets[16]; // Sampling offsets
      uniform int u_kernelSize;
      varying vec2 v_texCoord;
      
      void main() {
        vec4 color = vec4(0.0);
        vec2 texelSize = 1.0 / u_resolution;
        
        for (int i = 0; i < 16; i++) {
          if (i >= u_kernelSize) break;
          vec2 offset = u_offsets[i] * u_direction * texelSize;
          color += texture2D(u_texture, v_texCoord + offset) * u_weights[i];
        }
        
        gl_FragColor = color;
      }
    `;
    
    return this.compileProgram(vertexSource, fragmentSource);
  }
  
  /**
   * Create an absorption shader program
   */
  private createAbsorptionProgram(): WebGLProgram | null {
    if (!this.gl) return null;
    
    const vertexSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        v_texCoord = a_texCoord;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;
    
    const fragmentSource = `
      precision highp float;
      uniform sampler2D u_background;
      uniform sampler2D u_absorptionMask;
      uniform sampler2D u_absorptionSpectrum;
      uniform vec2 u_resolution;
      varying vec2 v_texCoord;
      
      void main() {
        vec4 bgColor = texture2D(u_background, v_texCoord);
        float mask = texture2D(u_absorptionMask, v_texCoord).r;
        vec4 absorption = texture2D(u_absorptionSpectrum, v_texCoord);
        
        // Apply absorption where mask > 0
        vec4 result = mix(bgColor, bgColor * absorption, mask);
        gl_FragColor = result;
      }
    `;
    
    return this.compileProgram(vertexSource, fragmentSource);
  }
  
  /**
   * Create an emission + aura shader program
   * 
   * Uses Kirchhoff's law: emission = absorptivity × blackBody(λ, T)
   * where absorptivity = 1 - transmission
   */
  private createEmissionProgram(): WebGLProgram | null {
    if (!this.gl) return null;
    
    const vertexSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        v_texCoord = a_texCoord;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;
    
    // Fragment shader with Kirchhoff's law and D65-normalized black body
    const fragmentSource = `
      precision highp float;
      
      // Input textures
      uniform sampler2D u_background;       // Background + previous layers
      uniform sampler2D u_transmissionTex;  // Transmission spectrum for this layer
      uniform sampler2D u_auraMask;         // Aura intensity (1.0 inside, decay outside)
      
      // Physical constants (Planck's law)
      // B(λ,T) = C1 / (λ^5 × (exp(C2/(λT)) - 1))
      // We use D65-normalized: B_norm(λ,T) = B(λ,T) / B(550nm, 6500K)
      
      uniform float u_temperature;          // Temperature in Kelvin
      uniform float u_d65Reference;         // B(550nm, 6500K) for normalization
      uniform vec2 u_resolution;
      
      // Planck constants
      const float C1 = 3.7417749e-16;  // 2πhc² in W·m²
      const float C2 = 1.4387773e-2;   // hc/k in m·K
      const float DRAPER_POINT = 798.0; // Minimum visible emission temperature
      
      varying vec2 v_texCoord;
      
      // Planck's law for spectral radiance
      float planckRadiance(float wavelengthNm, float temperature) {
        if (temperature < DRAPER_POINT || wavelengthNm <= 0.0) {
          return 0.0;
        }
        
        float lambda = wavelengthNm * 1.0e-9; // nm to m
        float exponent = C2 / (lambda * temperature);
        
        // Avoid overflow
        if (exponent > 700.0) {
          return 0.0;
        }
        
        float expTerm = exp(exponent);
        if (expTerm <= 1.0) {
          return 0.0;
        }
        
        return C1 / (pow(lambda, 5.0) * (expTerm - 1.0));
      }
      
      void main() {
        vec4 bgColor = texture2D(u_background, v_texCoord);
        float transmission = texture2D(u_transmissionTex, v_texCoord).r;
        float auraIntensity = texture2D(u_auraMask, v_texCoord).r;
        
        // Calculate emission using Kirchhoff's law
        // emission = absorptivity × blackBody(λ, T) / D65_reference
        float absorptivity = 1.0 - transmission;
        
        // Sample at representative wavelengths (R=650, G=550, B=450)
        vec3 emissionRGB = vec3(0.0);
        
        if (u_temperature >= DRAPER_POINT && absorptivity > 0.001) {
          float bbRed = planckRadiance(650.0, u_temperature);
          float bbGreen = planckRadiance(550.0, u_temperature);
          float bbBlue = planckRadiance(450.0, u_temperature);
          
          // D65-normalized emission
          emissionRGB = absorptivity * vec3(bbRed, bbGreen, bbBlue) / u_d65Reference;
        }
        
        // Add emission to background (scaled by aura for falloff)
        vec3 result = bgColor.rgb + emissionRGB * auraIntensity;
        
        gl_FragColor = vec4(result, 1.0);
      }
    `;
    
    return this.compileProgram(vertexSource, fragmentSource);
  }
  
  /**
   * Create a normalization + gamma shader program
   */
  private createNormalizeProgram(): WebGLProgram | null {
    if (!this.gl) return null;
    
    const vertexSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        v_texCoord = a_texCoord;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;
    
    const fragmentSource = `
      precision highp float;
      uniform sampler2D u_texture;
      uniform float u_maxBrightness;
      uniform vec2 u_resolution;
      varying vec2 v_texCoord;
      
      float gammaCorrect(float c) {
        return c <= 0.0031308 
          ? 12.92 * c 
          : 1.055 * pow(c, 1.0/2.4) - 0.055;
      }
      
      void main() {
        vec4 color = texture2D(u_texture, v_texCoord);
        
        // Normalize by max brightness
        vec3 normalized = color.rgb / u_maxBrightness;
        
        // Apply gamma correction
        vec3 srgb = vec3(
          gammaCorrect(normalized.r),
          gammaCorrect(normalized.g),
          gammaCorrect(normalized.b)
        );
        
        gl_FragColor = vec4(clamp(srgb, 0.0, 1.0), 1.0);
      }
    `;
    
    return this.compileProgram(vertexSource, fragmentSource);
  }
  
  /**
   * Compile a shader program
   */
  private compileProgram(vertexSource: string, fragmentSource: string): WebGLProgram | null {
    if (!this.gl) return null;
    
    const gl = this.gl;
    
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    if (!vertexShader) return null;
    gl.shaderSource(vertexShader, vertexSource);
    gl.compileShader(vertexShader);
    
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    if (!fragmentShader) return null;
    gl.shaderSource(fragmentShader, fragmentSource);
    gl.compileShader(fragmentShader);
    
    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Shader link error:', gl.getProgramInfoLog(program));
      return null;
    }
    
    return program;
  }
  
  /**
   * Create full-screen quad buffer
   */
  private createQuadBuffer(): void {
    if (!this.gl) return;
    
    const gl = this.gl;
    
    // Positions and texture coordinates for a full-screen quad
    const vertices = new Float32Array([
      // positions    // texCoords
      -1, -1,         0, 0,
       1, -1,         1, 0,
      -1,  1,         0, 1,
       1,  1,         1, 1,
    ]);
    
    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  }
  
  /**
   * Create framebuffers for ping-pong rendering
   */
  private createFramebuffers(): void {
    if (!this.gl) return;
    
    // Start with 1x1, will be resized on first render
    this.createFramebufferPair(1, 1);
  }
  
  /**
   * Create a pair of framebuffers for ping-pong rendering
   */
  private createFramebufferPair(width: number, height: number): void {
    if (!this.gl) return;
    
    const gl = this.gl;
    
    // Framebuffer A
    this.textureA = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.textureA);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    
    this.framebufferA = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebufferA);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.textureA, 0);
    
    // Framebuffer B
    this.textureB = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.textureB);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    
    this.framebufferB = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebufferB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.textureB, 0);
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  
  /**
   * Resize framebuffers if needed
   */
  private resizeFramebuffers(width: number, height: number): void {
    if (!this.gl || !this.textureA || !this.textureB) return;
    
    // Check current size (stored in closure)
    // For simplicity, always recreate (in production, would cache size)
    this.createFramebufferPair(width, height);
  }
  
  /**
   * Swap source texture and target framebuffer
   */
  private swapBuffers(
    sourceTexture: WebGLTexture,
    _targetFramebuffer: WebGLFramebuffer
  ): [WebGLTexture, WebGLFramebuffer] {
    if (sourceTexture === this.textureA) {
      return [this.textureB!, this.framebufferA!];
    } else {
      return [this.textureA!, this.framebufferB!];
    }
  }
  
  /**
   * Render background illumination to framebuffer A
   */
  private renderBackground(
    _backgroundSpectrum: SpectrumPoint[],
    width: number,
    height: number
  ): void {
    if (!this.gl || !this.framebufferA) return;
    
    const gl = this.gl;
    
    // For now, fill with a solid color based on background spectrum
    // Full implementation would render spectral background
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebufferA);
    gl.viewport(0, 0, width, height);
    gl.clearColor(1.0, 1.0, 1.0, 1.0); // White background
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  
  /**
   * Render blur pass for a layer
   * 
   * Applies Gaussian blur based on scattering properties.
   * Uses separable blur (horizontal then vertical) for efficiency.
   */
  private renderBlurPass(
    layer: SpectralLayer,
    sourceTexture: WebGLTexture,
    targetFramebuffer: WebGLFramebuffer,
    width: number,
    height: number
  ): void {
    if (!this.gl || !this.blurProgram) return;
    
    // Check if any shape in the layer has scattering
    const shapes = layer.getShapes();
    let maxBlurSigma = 0;
    
    for (const shape of shapes) {
      const scattering = shape.getScattering();
      if (scattering.coefficient > 0) {
        // Calculate blur sigma from scattering
        // More coefficient + more depth = more blur
        const sigma = scattering.coefficient * 10; // Scale to pixels
        maxBlurSigma = Math.max(maxBlurSigma, sigma);
      }
    }
    
    // Skip blur if no significant scattering
    if (maxBlurSigma < 0.5) {
      this.copyTexture(sourceTexture, targetFramebuffer, width, height);
      return;
    }
    
    // Get or create blur kernel
    const kernel = this._getBlurKernelPublic(maxBlurSigma);
    
    // Apply separable blur (horizontal pass + vertical pass)
    this.applyBlurPass(
      sourceTexture,
      targetFramebuffer,
      width,
      height,
      kernel,
      layer
    );
  }
  
  /**
   * Public method to get blur kernel (for testing)
   */
  _getBlurKernelPublic(sigma: number): GaussianKernel {
    const roundedSigma = Math.round(sigma * 10) / 10;
    
    if (!this.blurKernels.has(roundedSigma)) {
      const kernel = ScatteringCalculator.generateOptimizedKernel(roundedSigma, 15);
      this.blurKernels.set(roundedSigma, kernel);
    }
    
    return this.blurKernels.get(roundedSigma)!;
  }
  
  /**
   * Apply separable Gaussian blur using the blur shader
   */
  private applyBlurPass(
    sourceTexture: WebGLTexture,
    targetFramebuffer: WebGLFramebuffer,
    width: number,
    height: number,
    kernel: GaussianKernel,
    _layer: SpectralLayer
  ): void {
    if (!this.gl || !this.blurProgram) return;
    
    const gl = this.gl;
    
    // For a proper separable blur, we'd need an intermediate framebuffer
    // For now, apply a single-pass approximation
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFramebuffer);
    gl.viewport(0, 0, width, height);
    
    gl.useProgram(this.blurProgram);
    
    // Bind source texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.uniform1i(gl.getUniformLocation(this.blurProgram, 'u_texture'), 0);
    gl.uniform2f(gl.getUniformLocation(this.blurProgram, 'u_resolution'), width, height);
    
    // Set blur direction (horizontal for single pass approximation)
    gl.uniform2f(gl.getUniformLocation(this.blurProgram, 'u_direction'), 1.0, 0.0);
    
    // Set kernel weights and offsets
    const weightsLoc = gl.getUniformLocation(this.blurProgram, 'u_weights');
    const offsetsLoc = gl.getUniformLocation(this.blurProgram, 'u_offsets');
    const kernelSizeLoc = gl.getUniformLocation(this.blurProgram, 'u_kernelSize');
    
    if (weightsLoc !== null && offsetsLoc !== null && kernelSizeLoc !== null) {
      gl.uniform1fv(weightsLoc, kernel.weights);
      gl.uniform1fv(offsetsLoc, kernel.offsets);
      gl.uniform1i(kernelSizeLoc, kernel.weights.length);
    }
    
    // Draw full-screen quad
    this.drawFullScreenQuad();
  }
  
  /**
   * Draw a full-screen quad using the quad buffer
   */
  private drawFullScreenQuad(): void {
    if (!this.gl || !this.quadBuffer || !this.normalizeProgram) return;
    
    const gl = this.gl;
    const program = gl.getParameter(gl.CURRENT_PROGRAM);
    
    if (!program) return;
    
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    
    const posLoc = gl.getAttribLocation(program, 'a_position');
    const texLoc = gl.getAttribLocation(program, 'a_texCoord');
    
    if (posLoc >= 0) {
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
    }
    
    if (texLoc >= 0) {
      gl.enableVertexAttribArray(texLoc);
      gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8);
    }
    
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  
  /**
   * Render absorption pass for a layer
   */
  private renderAbsorptionPass(
    _layer: SpectralLayer,
    sourceTexture: WebGLTexture,
    targetFramebuffer: WebGLFramebuffer,
    width: number,
    height: number
  ): void {
    if (!this.gl || !this.absorptionProgram) return;
    
    // Full implementation would render absorption mask and apply
    this.copyTexture(sourceTexture, targetFramebuffer, width, height);
  }
  
  /**
   * Render emission + aura pass for a layer
   */
  private renderEmissionPass(
    _layer: SpectralLayer,
    sourceTexture: WebGLTexture,
    targetFramebuffer: WebGLFramebuffer,
    width: number,
    height: number
  ): void {
    if (!this.gl || !this.emissionProgram) return;
    
    // Full implementation would render emission and aura
    this.copyTexture(sourceTexture, targetFramebuffer, width, height);
  }
  
  /**
   * Render final normalization pass
   */
  private renderNormalizationPass(
    sourceTexture: WebGLTexture,
    width: number,
    height: number
  ): HTMLCanvasElement {
    if (!this.gl) {
      throw new Error('GL context not available');
    }
    
    const gl = this.gl;
    
    // Read pixels from source texture and return as canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    
    // Bind source texture framebuffer and read pixels
    const readFB = sourceTexture === this.textureA ? this.framebufferA : this.framebufferB;
    gl.bindFramebuffer(gl.FRAMEBUFFER, readFB);
    
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    
    // Create canvas context and put pixels
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const imageData = ctx.createImageData(width, height);
      
      // Flip Y (WebGL is bottom-up, Canvas is top-down)
      for (let y = 0; y < height; y++) {
        const srcRow = (height - 1 - y) * width * 4;
        const dstRow = y * width * 4;
        for (let x = 0; x < width * 4; x++) {
          imageData.data[dstRow + x] = pixels[srcRow + x];
        }
      }
      
      ctx.putImageData(imageData, 0, 0);
    }
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    
    return canvas;
  }
  
  /**
   * Copy texture to framebuffer (pass-through)
   */
  private copyTexture(
    sourceTexture: WebGLTexture,
    targetFramebuffer: WebGLFramebuffer,
    width: number,
    height: number
  ): void {
    if (!this.gl || !this.normalizeProgram || !this.quadBuffer) return;
    
    const gl = this.gl;
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFramebuffer);
    gl.viewport(0, 0, width, height);
    
    gl.useProgram(this.normalizeProgram);
    
    // Bind source texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.uniform1i(gl.getUniformLocation(this.normalizeProgram, 'u_texture'), 0);
    gl.uniform1f(gl.getUniformLocation(this.normalizeProgram, 'u_maxBrightness'), 1.0);
    gl.uniform2f(gl.getUniformLocation(this.normalizeProgram, 'u_resolution'), width, height);
    
    // Draw full-screen quad
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    const posLoc = gl.getAttribLocation(this.normalizeProgram, 'a_position');
    const texLoc = gl.getAttribLocation(this.normalizeProgram, 'a_texCoord');
    
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8);
    
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  
  
  /**
   * Dispose of WebGL resources
   */
  dispose(): void {
    if (!this.gl) return;
    
    const gl = this.gl;
    
    if (this.blurProgram) gl.deleteProgram(this.blurProgram);
    if (this.absorptionProgram) gl.deleteProgram(this.absorptionProgram);
    if (this.emissionProgram) gl.deleteProgram(this.emissionProgram);
    if (this.normalizeProgram) gl.deleteProgram(this.normalizeProgram);
    
    if (this.framebufferA) gl.deleteFramebuffer(this.framebufferA);
    if (this.framebufferB) gl.deleteFramebuffer(this.framebufferB);
    if (this.textureA) gl.deleteTexture(this.textureA);
    if (this.textureB) gl.deleteTexture(this.textureB);
    if (this.quadBuffer) gl.deleteBuffer(this.quadBuffer);
    
    this.gl = null;
  }
}

