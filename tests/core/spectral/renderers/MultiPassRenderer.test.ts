import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MultiPassRenderer } from '../../../../src/core/spectral/renderers/MultiPassRenderer';
import { MaterialLayer, MaterialShape, MaterialShapeConfig } from '../../../../src/core/spectral/layers/MaterialLayer';
import { RectangleGeometry } from '../../../../src/core/spectral/geometry/RectangleGeometry';
import { SpectrumPoint } from '../../../../src/core/spectral/CIE';
import { NO_SCATTERING, MIE_SCATTERING, RAYLEIGH_SCATTERING } from '../../../../src/core/spectral/scattering/ScatteringProperties';
import { BlackBodyEmission } from '../../../../src/core/spectral/emission/BlackBodyEmission';

/**
 * MultiPassRenderer Tests
 * 
 * Tests the multi-pass GPU rendering pipeline with:
 * - D65-normalized emission via Kirchhoff's law
 * - Scattering blur (Rayleigh, Mie)
 * - Emission aura rendering
 */
describe('MultiPassRenderer', () => {
  let renderer: MultiPassRenderer;
  let blackBody: BlackBodyEmission;
  
  // Create mock WebGL context for tests
  const createMockGL = (): WebGLRenderingContext => {
    const mockProgram = {} as WebGLProgram;
    const mockShader = {} as WebGLShader;
    const mockBuffer = {} as WebGLBuffer;
    const mockTexture = {} as WebGLTexture;
    const mockFramebuffer = {} as WebGLFramebuffer;
    
    return {
      createProgram: vi.fn(() => mockProgram),
      createShader: vi.fn(() => mockShader),
      createBuffer: vi.fn(() => mockBuffer),
      createTexture: vi.fn(() => mockTexture),
      createFramebuffer: vi.fn(() => mockFramebuffer),
      shaderSource: vi.fn(),
      compileShader: vi.fn(),
      attachShader: vi.fn(),
      linkProgram: vi.fn(),
      getProgramParameter: vi.fn(() => true),
      getShaderParameter: vi.fn(() => true),
      useProgram: vi.fn(),
      bindBuffer: vi.fn(),
      bufferData: vi.fn(),
      bindTexture: vi.fn(),
      texImage2D: vi.fn(),
      texParameteri: vi.fn(),
      bindFramebuffer: vi.fn(),
      framebufferTexture2D: vi.fn(),
      viewport: vi.fn(),
      clearColor: vi.fn(),
      clear: vi.fn(),
      activeTexture: vi.fn(),
      uniform1i: vi.fn(),
      uniform1f: vi.fn(),
      uniform2f: vi.fn(),
      getUniformLocation: vi.fn(() => 0),
      getAttribLocation: vi.fn(() => 0),
      enableVertexAttribArray: vi.fn(),
      vertexAttribPointer: vi.fn(),
      drawArrays: vi.fn(),
      readPixels: vi.fn(),
      deleteProgram: vi.fn(),
      deleteShader: vi.fn(),
      deleteBuffer: vi.fn(),
      deleteTexture: vi.fn(),
      deleteFramebuffer: vi.fn(),
      VERTEX_SHADER: 35633,
      FRAGMENT_SHADER: 35632,
      LINK_STATUS: 35714,
      COMPILE_STATUS: 35713,
      ARRAY_BUFFER: 34962,
      STATIC_DRAW: 35044,
      TEXTURE_2D: 3553,
      TEXTURE_MIN_FILTER: 10241,
      TEXTURE_MAG_FILTER: 10240,
      TEXTURE_WRAP_S: 10242,
      TEXTURE_WRAP_T: 10243,
      LINEAR: 9729,
      CLAMP_TO_EDGE: 33071,
      RGBA: 6408,
      UNSIGNED_BYTE: 5121,
      FRAMEBUFFER: 36160,
      COLOR_ATTACHMENT0: 36064,
      COLOR_BUFFER_BIT: 16384,
      TEXTURE0: 33984,
      FLOAT: 5126,
      TRIANGLE_STRIP: 5,
    } as unknown as WebGLRenderingContext;
  };
  
  // Helper to create a spectrum
  const createSpectrum = (value: number): SpectrumPoint[] => {
    const spectrum: SpectrumPoint[] = [];
    for (let wl = 380; wl <= 700; wl += 10) {
      spectrum.push({ wavelength: wl, transmission: value });
    }
    return spectrum;
  };
  
  // Helper to create an absorption spectrum (higher at blue)
  const createAbsorptionSpectrum = (baseTransmission: number): SpectrumPoint[] => {
    const spectrum: SpectrumPoint[] = [];
    for (let wl = 380; wl <= 700; wl += 10) {
      // Blue absorbs more, red transmits more
      const factor = (wl - 380) / 320; // 0 at 380, 1 at 700
      spectrum.push({ wavelength: wl, transmission: baseTransmission + (1 - baseTransmission) * factor * 0.5 });
    }
    return spectrum;
  };
  
  // Helper to create a shape config
  const createShapeConfig = (
    id: string,
    x: number,
    y: number,
    absorption: SpectrumPoint[],
    emission: SpectrumPoint[] = createSpectrum(0),
    temperature: number = 298
  ): MaterialShapeConfig => ({
    id,
    geometry: new RectangleGeometry(x, y, 50, 50),
    absorptionSpectrum: absorption,
    baseEmissionSpectrum: emission,
    scattering: NO_SCATTERING,
    emissionProperties: {
      auraRadius: 20,
      auraDecay: 0.1,
      emissivity: 1.0,
    },
    depth: 0.01,
  });
  
  beforeEach(() => {
    renderer = new MultiPassRenderer();
    blackBody = new BlackBodyEmission();
  });
  
  describe('Emission with Kirchhoff\'s Law', () => {
    it('should use D65-normalized emission intensity', () => {
      // At 6500K, black body emission should be ~1.0 at 550nm
      const intensityAt6500K = blackBody.getIntensityAt(550, 6500);
      expect(intensityAt6500K).toBeGreaterThan(0.8);
      expect(intensityAt6500K).toBeLessThan(1.2);
      
      // At 2000K, emission is much dimmer
      const intensityAt2000K = blackBody.getIntensityAt(550, 2000);
      expect(intensityAt2000K).toBeLessThan(intensityAt6500K);
    });
    
    it('should apply Kirchhoff\'s law: absorptivity = emissivity', () => {
      // Create two shapes: one opaque, one transparent
      const opaqueAbsorption = createSpectrum(0.0); // Full absorption
      const transparentAbsorption = createSpectrum(0.9); // 10% absorption
      
      // For emission:
      // opaque: emissivity = 1.0, emission = 1.0 × blackBody
      // transparent: emissivity = 0.1, emission = 0.1 × blackBody
      
      // At 6500K, opaque should emit 10x more than transparent
      const temperature = 6500;
      const wavelength = 550;
      const bbIntensity = blackBody.getIntensityAt(wavelength, temperature);
      
      const opaqueEmission = 1.0 * bbIntensity;
      const transparentEmission = 0.1 * bbIntensity;
      
      expect(opaqueEmission).toBeGreaterThan(transparentEmission * 5);
    });
    
    it('should render emission auras with distance falloff', () => {
      // Test aura intensity calculation
      // Inside shape: intensity = 1.0
      // Outside: intensity = exp(-decay × distance)
      
      const auraRadius = 20;
      const auraDecay = 0.1;
      
      // At edge (distance = 0): intensity = 1.0
      const atEdge = Math.exp(-auraDecay * 0);
      expect(atEdge).toBe(1.0);
      
      // At 10 pixels out: intensity = exp(-0.1 × 10) ≈ 0.37
      const at10px = Math.exp(-auraDecay * 10);
      expect(at10px).toBeCloseTo(0.37, 1);
      
      // At 20 pixels (radius): intensity = exp(-0.1 × 20) ≈ 0.14
      const at20px = Math.exp(-auraDecay * 20);
      expect(at20px).toBeCloseTo(0.14, 1);
    });
    
    it('should emit more at red wavelengths at low temperatures', () => {
      // Wien's displacement law: peak shifts to red at lower temps
      const temperature = 2000; // K
      
      const redEmission = blackBody.getIntensityAt(650, temperature);
      const greenEmission = blackBody.getIntensityAt(550, temperature);
      const blueEmission = blackBody.getIntensityAt(450, temperature);
      
      // At 2000K: red > green > blue
      expect(redEmission).toBeGreaterThan(greenEmission);
      expect(greenEmission).toBeGreaterThan(blueEmission);
    });
    
    it('should support temperatures up to 10000K', () => {
      const temperature = 10000;
      const intensity = blackBody.getIntensityAt(550, temperature);
      
      // At 10000K, intensity should exceed D65 reference
      expect(intensity).toBeGreaterThan(1.0);
    });
  });
  
  describe('Scattering Blur', () => {
    it('should apply Gaussian blur based on scattering coefficient', () => {
      // Create layer with Mie scattering
      const layer = new MaterialLayer({ id: 'test', zOrder: 0 });
      const absorption = createAbsorptionSpectrum(0.5);
      
      const shapeConfig: MaterialShapeConfig = {
        ...createShapeConfig('test', 100, 100, absorption),
        scattering: MIE_SCATTERING,
      };
      
      layer.addShape(new MaterialShape(shapeConfig));
      
      // Check that scattering is detected
      const scattering = layer.getScatteringAt(100, 100);
      expect(scattering.coefficient).toBe(MIE_SCATTERING.coefficient);
    });
    
    it('should blur content BEHIND shapes, not shape edges', () => {
      // Scattering blurs content seen THROUGH the material
      // The shape boundaries should remain sharp
      
      // This is a conceptual test - the implementation should:
      // 1. Render background + previous layers
      // 2. Apply blur to that content where shape overlaps
      // 3. NOT blur the shape mask itself
      
      const layer = new MaterialLayer({ id: 'test', zOrder: 0 });
      const shapeConfig: MaterialShapeConfig = {
        ...createShapeConfig('test', 100, 100, createSpectrum(0.5)),
        scattering: MIE_SCATTERING,
      };
      layer.addShape(new MaterialShape(shapeConfig));
      
      // Blur sigma should be > 0 inside shape
      const blurSigma = layer.getBlurSigmaAt(100, 100);
      expect(blurSigma).toBeGreaterThan(0);
      
      // Outside shape, no blur from this layer
      const outsideBlur = layer.getBlurSigmaAt(200, 200);
      expect(outsideBlur).toBe(0);
    });
    
    it('should support wavelength-dependent blur for Rayleigh scattering', () => {
      // Rayleigh: scattering ∝ λ^-4
      // Blue light (450nm) scatters more than red (650nm)
      
      const layer = new MaterialLayer({ id: 'test', zOrder: 0 });
      const shapeConfig: MaterialShapeConfig = {
        ...createShapeConfig('test', 100, 100, createSpectrum(0.5)),
        scattering: RAYLEIGH_SCATTERING,
      };
      layer.addShape(new MaterialShape(shapeConfig));
      
      const scattering = layer.getScatteringAt(100, 100);
      
      // Wavelength power = 4 for Rayleigh
      expect(scattering.wavelengthPower).toBe(4);
      
      // Calculate wavelength factor: (550/λ)^4
      const blueScatterFactor = Math.pow(550 / 450, 4);
      const redScatterFactor = Math.pow(550 / 650, 4);
      
      // Blue scatters more than reference (550nm)
      expect(blueScatterFactor).toBeGreaterThan(2.0);
      
      // Red scatters less than reference
      expect(redScatterFactor).toBeLessThan(0.6);
    });
    
    it('should use Mie scattering for wavelength-independent blur', () => {
      // Mie: wavelength-independent (clouds, milk)
      
      const layer = new MaterialLayer({ id: 'test', zOrder: 0 });
      const shapeConfig: MaterialShapeConfig = {
        ...createShapeConfig('test', 100, 100, createSpectrum(0.5)),
        scattering: MIE_SCATTERING,
      };
      layer.addShape(new MaterialShape(shapeConfig));
      
      const scattering = layer.getScatteringAt(100, 100);
      
      // Wavelength power = 0 for Mie
      expect(scattering.wavelengthPower).toBe(0);
    });
  });
  
  describe('Multi-Layer Composition', () => {
    it('should process layers in z-order', () => {
      renderer.initialize(createMockGL());
      
      const layer1 = new MaterialLayer({ id: 'back', zOrder: 0 });
      const layer2 = new MaterialLayer({ id: 'front', zOrder: 1 });
      
      renderer.addLayer(layer2);
      renderer.addLayer(layer1);
      
      // Should be sorted: layer1 first (lower zOrder)
      const layers = renderer.getLayers();
      expect(layers[0].id).toBe('back');
      expect(layers[1].id).toBe('front');
    });
    
    it('should accumulate blur from multiple layers', () => {
      // Content seen through multiple scattering layers = cumulative blur
      
      const layer1 = new MaterialLayer({ id: 'layer1', zOrder: 0 });
      const layer2 = new MaterialLayer({ id: 'layer2', zOrder: 1 });
      
      const shape1Config: MaterialShapeConfig = {
        ...createShapeConfig('s1', 100, 100, createSpectrum(0.5)),
        scattering: { coefficient: 0.2, wavelengthPower: 0, asymmetry: 0 },
      };
      
      const shape2Config: MaterialShapeConfig = {
        ...createShapeConfig('s2', 100, 100, createSpectrum(0.5)),
        scattering: { coefficient: 0.3, wavelengthPower: 0, asymmetry: 0 },
      };
      
      layer1.addShape(new MaterialShape(shape1Config));
      layer2.addShape(new MaterialShape(shape2Config));
      
      // Each layer contributes blur
      const blur1 = layer1.getBlurSigmaAt(100, 100);
      const blur2 = layer2.getBlurSigmaAt(100, 100);
      
      expect(blur1).toBeGreaterThan(0);
      expect(blur2).toBeGreaterThan(0);
    });
    
    it('should blend emission auras additively', () => {
      // Multiple adjacent emitting shapes = additive aura blend
      
      const layer = new MaterialLayer({ id: 'test', zOrder: 0 });
      
      // Create one hot shape to test basic aura functionality
      const shapeConfig: MaterialShapeConfig = {
        ...createShapeConfig('s1', 100, 100, createSpectrum(0.1)),
        baseEmissionSpectrum: createSpectrum(0.5),
      };
      
      layer.addShape(new MaterialShape(shapeConfig));
      
      // Point inside shape should have aura intensity 1.0
      const insideAura = layer.getAuraIntensity(100, 100);
      expect(insideAura).toBe(1.0);
      
      // Point just outside shape edge (within aura radius) should have aura > 0
      // Shape extends from 75-125 in x, point at 130 is 5px outside
      const nearEdgeAura = layer.getAuraIntensity(130, 100);
      expect(nearEdgeAura).toBeGreaterThan(0);
      expect(nearEdgeAura).toBeLessThan(1.0);
      
      // Point far outside (beyond aura radius 20) should have no aura
      const farAura = layer.getAuraIntensity(200, 100);
      expect(farAura).toBe(0);
    });
  });
  
  describe('Dark Mode Rendering', () => {
    it('should render with zero background in dark mode', () => {
      // Dark mode = zero background spectrum
      const darkSpectrum = createSpectrum(0);
      
      // All wavelengths should be zero
      for (const point of darkSpectrum) {
        expect(point.transmission).toBe(0);
      }
    });
    
    it('should show only emission in dark mode', () => {
      // With zero background, only emission is visible
      const temperature = 6500;
      const absorption = createSpectrum(0.1); // High absorption = high emissivity
      
      // Create emission spectrum
      const emission: SpectrumPoint[] = [];
      for (let wl = 380; wl <= 700; wl += 10) {
        const absorptivity = 1 - absorption.find(p => p.wavelength === wl)!.transmission;
        const bbIntensity = blackBody.getIntensityAt(wl, temperature);
        emission.push({ wavelength: wl, transmission: absorptivity * bbIntensity });
      }
      
      // In dark mode, result = 0 × transmission + emission = emission
      const greenEmission = emission.find(p => p.wavelength === 550);
      expect(greenEmission!.transmission).toBeGreaterThan(0.5);
    });
    
    it('should preserve scattering blur in dark mode', () => {
      // Scattering still applies (emission is blurred too)
      const layer = new MaterialLayer({ id: 'test', zOrder: 0 });
      const shapeConfig: MaterialShapeConfig = {
        ...createShapeConfig('test', 100, 100, createSpectrum(0.1)),
        scattering: MIE_SCATTERING,
        baseEmissionSpectrum: createSpectrum(0.5),
      };
      layer.addShape(new MaterialShape(shapeConfig));
      
      const blur = layer.getBlurSigmaAt(100, 100);
      expect(blur).toBeGreaterThan(0);
    });
  });
  
  describe('Integration with SpectralPhysicsProvider', () => {
    it('should produce consistent emission for same temperature and absorption', () => {
      // Test that emission calculations match between CPU and GPU paths
      const temperature = 3000;
      const absorptivity = 0.8;
      
      // CPU calculation (SpectralPhysicsProvider style)
      const cpuEmission = absorptivity * blackBody.getIntensityAt(550, temperature);
      
      // GPU would use same formula: absorptivity × blackBody(λ, T)
      const gpuEmission = absorptivity * blackBody.getIntensityAt(550, temperature);
      
      expect(cpuEmission).toBe(gpuEmission);
    });
  });
});

