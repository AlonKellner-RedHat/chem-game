import { describe, it, expect } from "vitest";
import {
  calculateFadeFactor,
  calculateUniformBackgroundSpectrum,
  calculateRGBBackgroundSpectrum,
  calculateUVBackgroundSpectrum,
  calculateUVRGBBackgroundSpectrum,
  wavelengthToColor,
} from "../../../../src/core/demos/spectral/SpectralCalculations";

describe("SpectralCalculations", () => {
  describe("calculateFadeFactor", () => {
    it("should return 1.0 for wavelengths in visible range", () => {
      expect(calculateFadeFactor(400, 380, 700)).toBe(1.0);
      expect(calculateFadeFactor(550, 380, 700)).toBe(1.0);
      expect(calculateFadeFactor(700, 380, 700)).toBe(1.0);
    });

    it("should return 0.0 for wavelengths below UV fade start", () => {
      expect(calculateFadeFactor(200, 380, 700)).toBe(0.0);
      expect(calculateFadeFactor(250, 380, 700)).toBe(0.0);
    });

    it("should return 0.0 for wavelengths above IR fade end", () => {
      expect(calculateFadeFactor(850, 380, 700)).toBe(0.0);
      expect(calculateFadeFactor(1000, 380, 700)).toBe(0.0);
    });

    it("should fade smoothly in UV region", () => {
      const factor300 = calculateFadeFactor(300, 380, 700);
      const factor350 = calculateFadeFactor(350, 380, 700);

      expect(factor300).toBeGreaterThan(0);
      expect(factor300).toBeLessThan(1);
      expect(factor350).toBeGreaterThan(factor300);
      expect(factor350).toBeLessThan(1);
    });

    it("should fade smoothly in IR region", () => {
      const factor750 = calculateFadeFactor(750, 380, 700);
      const factor800 = calculateFadeFactor(800, 380, 700);

      expect(factor750).toBeGreaterThan(0);
      expect(factor750).toBeLessThan(1);
      expect(factor800).toBeLessThan(factor750);
      expect(factor800).toBeGreaterThan(0);
    });
  });

  describe("calculateUniformBackgroundSpectrum", () => {
    it("should return spectrum with correct number of points", () => {
      const spectrum = calculateUniformBackgroundSpectrum();
      expect(spectrum.length).toBe(5334);
    });

    it("should have correct wavelength range", () => {
      const spectrum = calculateUniformBackgroundSpectrum();
      expect(spectrum[0].wavelength).toBeCloseTo(200, 1);
      expect(spectrum[spectrum.length - 1].wavelength).toBeCloseTo(1000, 1);
    });

    it("should have transmission of 1.0 in visible range", () => {
      const spectrum = calculateUniformBackgroundSpectrum();
      const visiblePoints = spectrum.filter(
        (p) => p.wavelength >= 380 && p.wavelength <= 700
      );
      visiblePoints.forEach((point) => {
        expect(point.transmission).toBe(1.0);
      });
    });

    it("should have transmission less than 1.0 in UV/IR regions", () => {
      const spectrum = calculateUniformBackgroundSpectrum();
      const uvPoints = spectrum.filter((p) => p.wavelength < 380);
      const irPoints = spectrum.filter((p) => p.wavelength > 700);

      uvPoints.forEach((point) => {
        expect(point.transmission).toBeLessThanOrEqual(1.0);
        expect(point.transmission).toBeGreaterThanOrEqual(0.0);
      });

      irPoints.forEach((point) => {
        expect(point.transmission).toBeLessThanOrEqual(1.0);
        expect(point.transmission).toBeGreaterThanOrEqual(0.0);
      });
    });
  });

  describe("calculateRGBBackgroundSpectrum", () => {
    it("should return spectrum with correct number of points", () => {
      const spectrum = calculateRGBBackgroundSpectrum();
      expect(spectrum.length).toBe(100);
    });

    it("should have correct wavelength range", () => {
      const spectrum = calculateRGBBackgroundSpectrum();
      expect(spectrum[0].wavelength).toBeCloseTo(200, 1);
      expect(spectrum[spectrum.length - 1].wavelength).toBeCloseTo(1000, 1);
    });

    it("should have transmission of 1.0 in visible range", () => {
      const spectrum = calculateRGBBackgroundSpectrum();
      const visiblePoints = spectrum.filter(
        (p) => p.wavelength >= 380 && p.wavelength <= 700
      );
      visiblePoints.forEach((point) => {
        expect(point.transmission).toBe(1.0);
      });
    });
  });

  describe("calculateUVBackgroundSpectrum", () => {
    it("should return spectrum with correct number of points", () => {
      const spectrum = calculateUVBackgroundSpectrum();
      expect(spectrum.length).toBe(5334);
    });

    it("should have transmission of 1.0 in peak UV range (250-350nm)", () => {
      const spectrum = calculateUVBackgroundSpectrum();
      const uvPoints = spectrum.filter(
        (p) => p.wavelength >= 250 && p.wavelength <= 350
      );
      uvPoints.forEach((point) => {
        expect(point.transmission).toBe(1.0);
      });
    });

    it("should have transmission of 0.0 beyond fade end (>450nm)", () => {
      const spectrum = calculateUVBackgroundSpectrum();
      const beyondFadePoints = spectrum.filter((p) => p.wavelength >= 450);
      beyondFadePoints.forEach((point) => {
        expect(point.transmission).toBe(0.0);
      });
    });
  });

  describe("calculateUVRGBBackgroundSpectrum", () => {
    it("should return spectrum with correct number of points", () => {
      const spectrum = calculateUVRGBBackgroundSpectrum();
      expect(spectrum.length).toBe(100);
    });

    it("should have transmission of 1.0 in peak UV range (250-350nm)", () => {
      const spectrum = calculateUVRGBBackgroundSpectrum();
      const uvPoints = spectrum.filter(
        (p) => p.wavelength >= 250 && p.wavelength <= 350
      );
      uvPoints.forEach((point) => {
        expect(point.transmission).toBe(1.0);
      });
    });
  });

  describe("wavelengthToColor", () => {
    it("should return valid color for visible wavelengths", () => {
      const result = wavelengthToColor(550);
      expect(result.color).toBeGreaterThanOrEqual(0);
      expect(result.color).toBeLessThanOrEqual(0xffffff);
      expect(result.alpha).toBeGreaterThanOrEqual(0);
      expect(result.alpha).toBeLessThanOrEqual(1);
    });

    it("should return violet for 400-450nm range", () => {
      const result = wavelengthToColor(425);
      // Should have significant blue component
      const b = result.color & 0xff;
      expect(b).toBeGreaterThan(200);
    });

    it("should return blue for 450-490nm range", () => {
      const result = wavelengthToColor(470);
      const b = result.color & 0xff;
      const g = (result.color >> 8) & 0xff;
      expect(b).toBeGreaterThan(200);
      expect(g).toBeGreaterThan(0);
    });

    it("should return green for 490-570nm range", () => {
      const result = wavelengthToColor(530);
      const g = (result.color >> 8) & 0xff;
      expect(g).toBeGreaterThan(200);
    });

    it("should return yellow for 570-590nm range", () => {
      const result = wavelengthToColor(580);
      const r = (result.color >> 16) & 0xff;
      const g = (result.color >> 8) & 0xff;
      expect(r).toBeGreaterThan(100);
      expect(g).toBeGreaterThan(200);
    });

    it("should return red for 620-700nm range", () => {
      const result = wavelengthToColor(650);
      const r = (result.color >> 16) & 0xff;
      expect(r).toBeGreaterThan(200);
    });

    it("should fade in UV region", () => {
      const result300 = wavelengthToColor(300);
      const result350 = wavelengthToColor(350);
      expect(result300.alpha).toBeLessThan(result350.alpha);
      expect(result350.alpha).toBeLessThan(1.0);
    });

    it("should fade in IR region", () => {
      const result800 = wavelengthToColor(800);
      const result900 = wavelengthToColor(900);
      expect(result800.alpha).toBeGreaterThan(result900.alpha);
      expect(result900.alpha).toBeLessThan(1.0);
    });
  });
});
