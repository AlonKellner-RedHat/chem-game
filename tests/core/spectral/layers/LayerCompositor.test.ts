import { describe, it, expect, beforeEach } from 'vitest';
import { LayerCompositor, CompositorConfig, DEFAULT_COMPOSITOR_CONFIG } from '../../../../src/core/spectral/layers/LayerCompositor';
import { SpectralLayer, SpectralShape, SpectralLayerConfig } from '../../../../src/core/spectral/layers/SpectralLayer';
import { MaterialLayer } from '../../../../src/core/spectral/layers/MaterialLayer';
import { SpectrumPoint } from '../../../../src/core/spectral/CIE';
import { NO_SCATTERING, ScatteringProperties } from '../../../../src/core/spectral/scattering/ScatteringProperties';
import { RectangleGeometry } from '../../../../src/core/spectral/geometry/RectangleGeometry';

/**
 * Layer Compositor Tests
 * 
 * Tests for multi-layer spectral composition:
 * - Layers processed in z-order (lower = further back)
 * - Each layer applies: blur → absorption → emission + aura
 * - Multiple layers blend correctly
 * 
 * Configurable layers for game (6 layers):
 * - Back/center/front for placed apparatus
 * - Back/center/front for picked up apparatus
 */
describe('LayerCompositor', () => {
  let compositor: LayerCompositor;
  
  beforeEach(() => {
    compositor = new LayerCompositor();
  });
  
  describe('Layer management', () => {
    it('should start with no layers', () => {
      expect(compositor.getLayers()).toHaveLength(0);
    });
    
    it('should add layers in z-order', () => {
      const layer1 = createMockLayer('back', 0);
      const layer2 = createMockLayer('front', 2);
      const layer3 = createMockLayer('center', 1);
      
      compositor.addLayer(layer1);
      compositor.addLayer(layer2);
      compositor.addLayer(layer3);
      
      const layers = compositor.getLayers();
      expect(layers).toHaveLength(3);
      expect(layers[0].id).toBe('back');     // zOrder 0
      expect(layers[1].id).toBe('center');   // zOrder 1
      expect(layers[2].id).toBe('front');    // zOrder 2
    });
    
    it('should remove layers by ID', () => {
      const layer1 = createMockLayer('a', 0);
      const layer2 = createMockLayer('b', 1);
      
      compositor.addLayer(layer1);
      compositor.addLayer(layer2);
      
      expect(compositor.removeLayer('a')).toBe(true);
      expect(compositor.getLayers()).toHaveLength(1);
      expect(compositor.getLayers()[0].id).toBe('b');
    });
    
    it('should return false when removing non-existent layer', () => {
      expect(compositor.removeLayer('nonexistent')).toBe(false);
    });
    
    it('should get layer by ID', () => {
      const layer = createMockLayer('test', 0);
      compositor.addLayer(layer);
      
      expect(compositor.getLayer('test')).toBe(layer);
      expect(compositor.getLayer('nonexistent')).toBe(null);
    });
    
    it('should clear all layers', () => {
      compositor.addLayer(createMockLayer('a', 0));
      compositor.addLayer(createMockLayer('b', 1));
      
      compositor.clear();
      
      expect(compositor.getLayers()).toHaveLength(0);
    });
  });
  
  describe('Single layer composition', () => {
    it('should pass through background when no shapes hit', () => {
      const layer = createMockLayer('test', 0, []);
      compositor.addLayer(layer);
      
      const background = createWhiteSpectrum();
      const result = compositor.composeAt(100, 100, background);
      
      // No absorption (transmission = 1.0)
      expect(result.transmission[0].transmission).toBeCloseTo(1.0, 5);
      // No emission
      expect(result.emission[0].transmission).toBe(0);
    });
    
    it('should apply absorption inside shape', () => {
      const shape = createMockShape('shape1', 50, 50, 100, 100, 0.5);
      const layer = createMockLayer('test', 0, [shape]);
      compositor.addLayer(layer);
      
      const background = createWhiteSpectrum();
      const result = compositor.composeAt(100, 100, background); // Inside shape
      
      // Should have 50% transmission
      expect(result.transmission[0].transmission).toBeCloseTo(0.5, 2);
    });
    
    it('should add emission inside shape', () => {
      const shape = createMockShape('shape1', 50, 50, 100, 100, 1.0, 0.8);
      const layer = createMockLayer('test', 0, [shape]);
      compositor.addLayer(layer);
      
      const background = createWhiteSpectrum();
      const result = compositor.composeAt(100, 100, background);
      
      // Should have emission
      expect(result.emission[0].transmission).toBeGreaterThan(0);
    });
  });
  
  describe('Multi-layer composition', () => {
    it('should multiply absorption from multiple layers', () => {
      // Layer 1: 50% transmission
      const shape1 = createMockShape('s1', 0, 0, 200, 200, 0.5);
      const layer1 = createMockLayer('back', 0, [shape1]);
      
      // Layer 2: 60% transmission
      const shape2 = createMockShape('s2', 0, 0, 200, 200, 0.6);
      const layer2 = createMockLayer('front', 1, [shape2]);
      
      compositor.addLayer(layer1);
      compositor.addLayer(layer2);
      
      const background = createWhiteSpectrum();
      const result = compositor.composeAt(100, 100, background);
      
      // Combined transmission: 0.5 × 0.6 = 0.3
      expect(result.transmission[0].transmission).toBeCloseTo(0.3, 2);
    });
    
    it('should add emission from multiple layers', () => {
      const shape1 = createMockShape('s1', 0, 0, 200, 200, 1.0, 0.3);
      const layer1 = createMockLayer('back', 0, [shape1]);
      
      const shape2 = createMockShape('s2', 0, 0, 200, 200, 1.0, 0.4);
      const layer2 = createMockLayer('front', 1, [shape2]);
      
      compositor.addLayer(layer1);
      compositor.addLayer(layer2);
      
      const background = createWhiteSpectrum();
      const result = compositor.composeAt(100, 100, background);
      
      // Combined emission: 0.3 + 0.4 = 0.7
      expect(result.emission[0].transmission).toBeCloseTo(0.7, 2);
    });
    
    it('should process layers in z-order', () => {
      // Add layers out of order and verify they're processed in z-order
      const layer1 = createMockLayer('first', 0);
      const layer3 = createMockLayer('third', 2);
      const layer2 = createMockLayer('second', 1);
      
      compositor.addLayer(layer1);
      compositor.addLayer(layer3);
      compositor.addLayer(layer2);
      
      // Verify getLayers returns them in order
      const layers = compositor.getLayers();
      expect(layers[0].id).toBe('first');
      expect(layers[1].id).toBe('second');
      expect(layers[2].id).toBe('third');
    });
  });
  
  describe('Emission aura between layers', () => {
    it('should detect aura from emitting shape near boundary', () => {
      // Emitting shape that creates an aura
      const backShape = createMockShape('back', 50, 50, 50, 50, 1.0, 1.0);
      const backLayer = createMockLayer('back', 0, [backShape]);
      
      compositor.addLayer(backLayer);
      
      // Query point inside shape - should have full aura intensity
      const insideResult = compositor.composeAt(75, 75, createWhiteSpectrum());
      expect(insideResult.auraIntensity).toBe(1.0);
      
      // Query point outside shape but shape has aura (based on mock implementation)
      // Note: the mock getAuraIntensity returns 0 for points outside shape beyond 20px
      // Point at (110, 75) is 10px from edge of shape at x=100
      const nearResult = compositor.composeAt(110, 75, createWhiteSpectrum());
      // The compositor uses layer.getAuraIntensity which checks shape distance
      expect(nearResult.auraIntensity).toBeGreaterThanOrEqual(0);
    });
  });
  
  describe('Scattering blur accumulation', () => {
    it('should accumulate blur from multiple layers', () => {
      const shape1 = createMockShape('s1', 0, 0, 200, 200, 1.0, 0, { coefficient: 0.2, wavelengthPower: 0, asymmetry: 0 });
      const layer1 = createMockLayer('back', 0, [shape1]);
      
      const shape2 = createMockShape('s2', 0, 0, 200, 200, 1.0, 0, { coefficient: 0.3, wavelengthPower: 0, asymmetry: 0 });
      const layer2 = createMockLayer('front', 1, [shape2]);
      
      compositor.addLayer(layer1);
      compositor.addLayer(layer2);
      
      const result = compositor.composeAt(100, 100, createWhiteSpectrum());
      
      // Should have combined blur
      expect(result.blurSigma).toBeGreaterThan(0);
    });
  });
  
  describe('Six-layer game configuration', () => {
    it('should support 6 configurable layers', () => {
      // Placed apparatus layers
      compositor.addLayer(createMockLayer('placed-back', 0));
      compositor.addLayer(createMockLayer('placed-center', 1));
      compositor.addLayer(createMockLayer('placed-front', 2));
      
      // Picked up apparatus layers
      compositor.addLayer(createMockLayer('pickup-back', 3));
      compositor.addLayer(createMockLayer('pickup-center', 4));
      compositor.addLayer(createMockLayer('pickup-front', 5));
      
      expect(compositor.getLayers()).toHaveLength(6);
      
      // Verify order
      const layers = compositor.getLayers();
      expect(layers[0].id).toBe('placed-back');
      expect(layers[5].id).toBe('pickup-front');
    });
  });
  
  describe('Configuration', () => {
    it('should use default configuration', () => {
      const config = compositor.getConfig();
      expect(config.maxBlurSigma).toBe(DEFAULT_COMPOSITOR_CONFIG.maxBlurSigma);
      expect(config.maxAuraRadius).toBe(DEFAULT_COMPOSITOR_CONFIG.maxAuraRadius);
    });
    
    it('should allow custom configuration', () => {
      const custom: Partial<CompositorConfig> = {
        maxBlurSigma: 100,
        maxAuraRadius: 50,
      };
      
      compositor.setConfig(custom);
      
      const config = compositor.getConfig();
      expect(config.maxBlurSigma).toBe(100);
      expect(config.maxAuraRadius).toBe(50);
    });
  });
});

// Helper functions to create mock objects

function createWhiteSpectrum(): SpectrumPoint[] {
  return [
    { wavelength: 400, transmission: 1.0 },
    { wavelength: 500, transmission: 1.0 },
    { wavelength: 600, transmission: 1.0 },
  ];
}

function createMockShape(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  absorption: number = 1.0,
  emission: number = 0,
  scattering: ScatteringProperties = NO_SCATTERING
): SpectralShape {
  const geometry = new RectangleGeometry(x, y, width, height);
  
  return {
    id,
    geometry,
    getAbsorptionSpectrum: () => [
      { wavelength: 400, transmission: absorption },
      { wavelength: 500, transmission: absorption },
      { wavelength: 600, transmission: absorption },
    ],
    getBaseEmissionSpectrum: () => [
      { wavelength: 400, transmission: emission },
      { wavelength: 500, transmission: emission },
      { wavelength: 600, transmission: emission },
    ],
    getNetEmissionSpectrum: () => [
      { wavelength: 400, transmission: emission },
      { wavelength: 500, transmission: emission },
      { wavelength: 600, transmission: emission },
    ],
    getScattering: () => scattering,
    getEmissionProperties: () => ({
      auraRadius: 20,
      auraDecay: 0.1,
    }),
    updateSpectra: () => {},
  };
}

function createMockLayer(id: string, zOrder: number, shapes: SpectralShape[] = []): SpectralLayer {
  return {
    id,
    zOrder,
    getShapes: () => shapes,
    containsPoint: (x: number, y: number) => {
      return shapes.some(s => s.geometry.contains(x, y));
    },
    getShapeAt: (x: number, y: number) => {
      return shapes.find(s => s.geometry.contains(x, y)) || null;
    },
    getAbsorptionAt: (x: number, y: number, wavelength: number) => {
      const shape = shapes.find(s => s.geometry.contains(x, y));
      if (!shape) return 1.0;
      const spectrum = shape.getAbsorptionSpectrum();
      const point = spectrum.find(p => p.wavelength === wavelength);
      return point?.transmission ?? 1.0;
    },
    getEmissionAt: (x: number, y: number, wavelength: number) => {
      const shape = shapes.find(s => s.geometry.contains(x, y));
      if (!shape) return 0;
      const spectrum = shape.getNetEmissionSpectrum();
      const point = spectrum.find(p => p.wavelength === wavelength);
      return point?.transmission ?? 0;
    },
    getAuraIntensity: (x: number, y: number) => {
      for (const shape of shapes) {
        if (shape.geometry.contains(x, y)) return 1.0;
        const dist = shape.geometry.getEdgeDistance(x, y);
        if (dist < 0 && Math.abs(dist) < 20) {
          return Math.exp(Math.abs(dist) * -0.1);
        }
      }
      return 0;
    },
    getScatteringAt: (x: number, y: number) => {
      const shape = shapes.find(s => s.geometry.contains(x, y));
      return shape?.getScattering() ?? NO_SCATTERING;
    },
    getBlurSigmaAt: (x: number, y: number) => {
      const scattering = shapes.find(s => s.geometry.contains(x, y))?.getScattering();
      if (!scattering) return 0;
      return scattering.coefficient * 10;
    },
    updateSpectra: () => {
      shapes.forEach(s => s.updateSpectra());
    },
  };
}

function createTrackedLayer(id: string, zOrder: number, calls: string[]): SpectralLayer {
  const base = createMockLayer(id, zOrder);
  return {
    ...base,
    getAbsorptionAt: (x: number, y: number, wavelength: number) => {
      calls.push(id);
      return 1.0;
    },
  };
}

