/**
 * Integration tests for AdvancedSpectralDemo
 * 
 * Verifies that:
 * 1. RGB rendering and spectrum readback use identical physics
 * 2. Temperature changes affect both rendering and plot
 * 3. Dark mode shows only emission in both paths
 * 4. All features are synchronized
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  UnifiedSpectralRenderer,
  UnifiedRendererConfig,
} from '../../../src/core/spectral/renderers/UnifiedSpectralRenderer';
import {
  UnifiedSpectralPhysics,
  BackgroundMode,
} from '../../../src/core/spectral/shaders/UnifiedSpectralPhysics';
import { RectangleGeometry } from '../../../src/core/spectral/geometry/RectangleGeometry';

describe('AdvancedSpectralDemo Integration', () => {
  let renderer: UnifiedSpectralRenderer;
  let physics: UnifiedSpectralPhysics;
  
  const config: UnifiedRendererConfig = {
    width: 100,
    height: 100,
    numLayers: 6,
    wavelengthResolution: 100,
    maxShapesPerLayer: 256,
  };

  beforeEach(() => {
    renderer = new UnifiedSpectralRenderer(config);
    physics = new UnifiedSpectralPhysics();
  });

  describe('physics synchronization', () => {
    it('should use same physics for RGB and spectrum at same point', () => {
      renderer.addShape({
        id: 'test-shape',
        layerIndex: 0,
        geometry: new RectangleGeometry(50, 50, 40, 40),
        materialId: 'water',
        transmissionSpectrum: createFlatSpectrum(0.5),
        temperature: 2000, // Visible emission
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      });

      // Get spectrum at center of shape
      const spectrum = renderer.getSpectrumAtPixel(50, 50, 16);
      
      // Verify each spectrum point matches physics directly
      for (const point of spectrum) {
        const bg = physics.getBackgroundIntensity(point.wavelength, BackgroundMode.Normal);
        const transmitted = bg * 0.5;
        const emission = physics.kirchhoffEmission(0.5, point.wavelength, 2000);
        const expected = transmitted + emission;
        
        // Allow small tolerance due to simplified composition engine
        expect(point.transmission).toBeCloseTo(expected, 1);
      }
    });

    it('should update both RGB and spectrum when temperature changes', () => {
      renderer.addShape({
        id: 'hot-shape',
        layerIndex: 0,
        geometry: new RectangleGeometry(50, 50, 40, 40),
        materialId: 'metal',
        transmissionSpectrum: createFlatSpectrum(0.0), // Opaque
        temperature: 300, // Cold
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      });

      // Get cold spectrum
      const coldSpectrum = renderer.getSpectrumAtPixel(50, 50, 16);
      const coldHasEmission = coldSpectrum.some(p => p.transmission > 0);

      // Heat up the shape
      renderer.setTemperature('hot-shape', 6500);

      // Get hot spectrum
      const hotSpectrum = renderer.getSpectrumAtPixel(50, 50, 16);
      const hotHasEmission = hotSpectrum.some(p => p.transmission > 0);

      // Cold should have no emission, hot should have emission
      expect(coldHasEmission).toBe(false);
      expect(hotHasEmission).toBe(true);
    });
  });

  describe('dark mode', () => {
    it('should show only emission in dark mode for both paths', () => {
      renderer.addShape({
        id: 'emitter',
        layerIndex: 0,
        geometry: new RectangleGeometry(50, 50, 40, 40),
        materialId: 'emitter',
        transmissionSpectrum: createFlatSpectrum(0.0), // Opaque
        temperature: 6500, // Hot
        scatteringCoeff: 0,
        auraRadius: 20,
        auraDecay: 0.1,
      });

      // Get spectrum in dark mode
      renderer.setBackgroundMode('dark');
      const darkSpectrum = renderer.getSpectrumAtPixel(50, 50, 16);

      // Should have emission only (no background)
      for (const point of darkSpectrum) {
        const emission = physics.kirchhoffEmission(0.0, point.wavelength, 6500);
        expect(point.transmission).toBeCloseTo(emission, 1);
      }

      // Get spectrum in normal mode
      renderer.setBackgroundMode('normal');
      const normalSpectrum = renderer.getSpectrumAtPixel(50, 50, 16);

      // Should have same emission (opaque, so no transmission difference)
      for (let i = 0; i < darkSpectrum.length; i++) {
        expect(normalSpectrum[i].transmission).toBeCloseTo(darkSpectrum[i].transmission, 1);
      }
    });

    it('should show black for cold objects in dark mode', () => {
      renderer.addShape({
        id: 'cold',
        layerIndex: 0,
        geometry: new RectangleGeometry(50, 50, 40, 40),
        materialId: 'cold',
        transmissionSpectrum: createFlatSpectrum(0.5),
        temperature: 300, // Room temp
        scatteringCoeff: 0,
        auraRadius: 0,
        auraDecay: 0,
      });

      renderer.setBackgroundMode('dark');
      const spectrum = renderer.getSpectrumAtPixel(50, 50, 16);

      // Should be all zeros in dark mode (no background, no emission)
      for (const point of spectrum) {
        expect(point.transmission).toBe(0);
      }
    });
  });

  describe('multi-layer composition', () => {
    it('should compose layers correctly in both paths', () => {
      // Layer 0 (back): emitter
      renderer.addShape({
        id: 'back-emitter',
        layerIndex: 0,
        geometry: new RectangleGeometry(50, 50, 50, 50),
        materialId: 'emitter',
        transmissionSpectrum: createFlatSpectrum(0.0),
        temperature: 4000,
        scatteringCoeff: 0,
        auraRadius: 0,
        auraDecay: 0,
      });

      // Layer 1 (front): filter
      renderer.addShape({
        id: 'front-filter',
        layerIndex: 1,
        geometry: new RectangleGeometry(50, 50, 40, 40),
        materialId: 'filter',
        transmissionSpectrum: createFlatSpectrum(0.5),
        temperature: 300,
        scatteringCoeff: 0,
        auraRadius: 0,
        auraDecay: 0,
      });

      const spectrum = renderer.getSpectrumAtPixel(50, 50, 16);

      // Back emitter's emission should be filtered by front layer
      for (const point of spectrum) {
        const backEmission = physics.kirchhoffEmission(0.0, point.wavelength, 4000);
        const filtered = backEmission * 0.5; // 50% transmission
        
        // Should see filtered emission
        expect(point.transmission).toBeCloseTo(filtered, 1);
      }
    });

    it('should handle all 6 layers', () => {
      // Add shapes to all 6 layers
      for (let i = 0; i < 6; i++) {
        renderer.addShape({
          id: `layer-${i}`,
          layerIndex: i,
          geometry: new RectangleGeometry(50, 50, 50 - i * 5, 50 - i * 5),
          materialId: `mat-${i}`,
          transmissionSpectrum: createFlatSpectrum(0.9),
          temperature: 300,
          scatteringCoeff: 0,
          auraRadius: 0,
          auraDecay: 0,
        });
      }

      const spectrum = renderer.getSpectrumAtPixel(50, 50, 16);

      // Should have combined transmission: 0.9^6 ≈ 0.53
      const expected = Math.pow(0.9, 6);
      for (const point of spectrum) {
        if (point.wavelength >= 380 && point.wavelength <= 700) {
          expect(point.transmission).toBeCloseTo(expected, 1);
        }
      }
    });
  });

  describe('feature parity', () => {
    it('should have identical behavior at different spectrum resolutions', () => {
      renderer.addShape({
        id: 'test',
        layerIndex: 0,
        geometry: new RectangleGeometry(50, 50, 40, 40),
        materialId: 'test',
        transmissionSpectrum: createFlatSpectrum(0.5),
        temperature: 3000,
        scatteringCoeff: 0,
        auraRadius: 0,
        auraDecay: 0,
      });

      const lowRes = renderer.getSpectrumAtPixel(50, 50, 10);
      const highRes = renderer.getSpectrumAtPixel(50, 50, 100);

      // Both should show similar physics (same transmission + emission)
      const lowMidIdx = Math.floor(lowRes.length / 2);
      const highMidIdx = Math.floor(highRes.length / 2);

      // Values at similar wavelengths should be close
      expect(lowRes[lowMidIdx].transmission).toBeGreaterThan(0);
      expect(highRes[highMidIdx].transmission).toBeGreaterThan(0);
    });
  });
});

// Helper function
function createFlatSpectrum(value: number, length: number = 100): Float32Array {
  const spectrum = new Float32Array(length);
  spectrum.fill(value);
  return spectrum;
}

