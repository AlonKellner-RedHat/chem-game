import { CIE } from '../CIE';

/**
 * Scale factors for CIE textures, used to recover original values in shader
 */
export interface CIEScaleFactors {
  x: number;
  y: number;
  z: number;
  d65: number;
}

/**
 * CIETextureGenerator pre-calculates CIE color matching functions and D65 illuminant
 * as 1D textures for GPU rendering. Generated once at initialization.
 * 
 * Texture format: 1D texture (width = wavelength samples, height = 1)
 * - X coordinate: Normalized wavelength (0.0 = 200nm, 1.0 = 1000nm)
 * - R channel: CIE value or D65 SPD value (normalized to [0,1])
 * - Resolution: 200 samples (matches material texture resolution)
 * 
 * IMPORTANT: CIE values can exceed 1.0 (CIE Z peaks at ~1.77).
 * Textures are normalized to [0,1] and scale factors are provided
 * to recover original values in the shader.
 */
export class CIETextureGenerator {
  private readonly resolution: number;
  private readonly minWavelength: number = 200; // nm
  private readonly maxWavelength: number = 1000; // nm

  constructor(resolution: number = 200) {
    this.resolution = resolution;
  }

  /**
   * Generate CIE X, Y, Z color matching function textures and D65 illuminant texture
   * Textures are normalized to [0,1] range for safe storage in Uint8 textures.
   * Scale factors are returned to recover original values in the shader.
   * 
   * @returns Object containing Float32Arrays (normalized) and scale factors
   */
  generateCIETextures(): {
    x: Float32Array;
    y: Float32Array;
    z: Float32Array;
    d65: Float32Array;
    scales: CIEScaleFactors;
  } {
    const xTexture = new Float32Array(this.resolution);
    const yTexture = new Float32Array(this.resolution);
    const zTexture = new Float32Array(this.resolution);
    const d65Texture = new Float32Array(this.resolution);

    // First pass: generate raw values
    for (let i = 0; i < this.resolution; i++) {
      // Calculate wavelength for this sample
      const wavelength = i === this.resolution - 1
        ? this.maxWavelength
        : this.minWavelength + (i / (this.resolution - 1)) * (this.maxWavelength - this.minWavelength);

      // Get CIE values (can exceed 1.0)
      xTexture[i] = CIE.getX(wavelength);
      yTexture[i] = CIE.getY(wavelength);
      zTexture[i] = CIE.getZ(wavelength);

      // Get D65 illuminant value
      d65Texture[i] = CIE.getIlluminant(wavelength, 'D65');
    }

    // Find max values for normalization
    let maxX = 0, maxY = 0, maxZ = 0, maxD65 = 0;
    for (let i = 0; i < this.resolution; i++) {
      maxX = Math.max(maxX, xTexture[i]);
      maxY = Math.max(maxY, yTexture[i]);
      maxZ = Math.max(maxZ, zTexture[i]);
      maxD65 = Math.max(maxD65, d65Texture[i]);
    }

    // Ensure non-zero scale factors
    maxX = maxX || 1;
    maxY = maxY || 1;
    maxZ = maxZ || 1;
    maxD65 = maxD65 || 1;

    // Second pass: normalize to [0,1]
    for (let i = 0; i < this.resolution; i++) {
      xTexture[i] /= maxX;
      yTexture[i] /= maxY;
      zTexture[i] /= maxZ;
      d65Texture[i] /= maxD65;
    }

    return {
      x: xTexture,
      y: yTexture,
      z: zTexture,
      d65: d65Texture,
      scales: {
        x: maxX,
        y: maxY,
        z: maxZ,
        d65: maxD65,
      },
    };
  }

  /**
   * Get texture resolution
   */
  getResolution(): number {
    return this.resolution;
  }
}

