/**
 * ShaderDataProvider manages WebGL texture creation, updates, and destruction
 * for material transmission spectra and CIE lookup tables.
 */
export class ShaderDataProvider {
  /**
   * Create a 1D WebGL texture from Float32Array data
   * @param gl WebGL context
   * @param data Float32Array with texture data (1D, width = data.length, height = 1)
   * @returns WebGLTexture handle
   */
  static createMaterialTexture(gl: WebGLRenderingContext, data: Float32Array): WebGLTexture {
    const texture = gl.createTexture();
    if (!texture) {
      throw new Error('Failed to create WebGL texture');
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Create 2D texture (WebGL doesn't support 1D textures directly)
    // Width = data.length, Height = 1
    // Use R32F format (single channel float) if available, otherwise use RGBA
    const width = data.length;
    const height = 1;

    // Convert Float32Array to format suitable for WebGL
    // For compatibility, use RGBA format with R channel containing the value
    const rgbaData = new Uint8Array(width * height * 4);
    for (let i = 0; i < width; i++) {
      // Normalize float to 0-255 range for RGBA
      // We'll use a simple encoding: value * 255 clamped to [0, 255]
      // For better precision, we could use half-float or float textures if available
      const value = Math.max(0, Math.min(1, data[i]));
      const byteValue = Math.round(value * 255);
      rgbaData[i * 4] = byteValue;     // R
      rgbaData[i * 4 + 1] = byteValue; // G (same for compatibility)
      rgbaData[i * 4 + 2] = byteValue; // B (same for compatibility)
      rgbaData[i * 4 + 3] = 255;       // A (opaque)
    }

    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      rgbaData
    );

    // Set texture parameters for 1D-like sampling
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.bindTexture(gl.TEXTURE_2D, null);

    return texture;
  }

  /**
   * Update an existing 1D WebGL texture with new data
   * @param gl WebGL context
   * @param texture Existing WebGLTexture
   * @param data New Float32Array data (must match original width)
   */
  static updateMaterialTexture(
    gl: WebGLRenderingContext,
    texture: WebGLTexture,
    data: Float32Array
  ): void {
    gl.bindTexture(gl.TEXTURE_2D, texture);

    const width = data.length;
    const height = 1;

    // Convert to RGBA format
    const rgbaData = new Uint8Array(width * height * 4);
    for (let i = 0; i < width; i++) {
      const value = Math.max(0, Math.min(1, data[i]));
      const byteValue = Math.round(value * 255);
      rgbaData[i * 4] = byteValue;
      rgbaData[i * 4 + 1] = byteValue;
      rgbaData[i * 4 + 2] = byteValue;
      rgbaData[i * 4 + 3] = 255;
    }

    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      width,
      height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      rgbaData
    );

    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /**
   * Create CIE lookup textures (X, Y, Z, D65)
   * @param gl WebGL context
   * @param cieData Object containing Float32Arrays for x, y, z, d65
   * @returns Object containing WebGLTexture handles
   */
  static createCIETextures(
    gl: WebGLRenderingContext,
    cieData: { x: Float32Array; y: Float32Array; z: Float32Array; d65: Float32Array }
  ): {
    x: WebGLTexture;
    y: WebGLTexture;
    z: WebGLTexture;
    d65: WebGLTexture;
  } {
    return {
      x: this.createMaterialTexture(gl, cieData.x),
      y: this.createMaterialTexture(gl, cieData.y),
      z: this.createMaterialTexture(gl, cieData.z),
      d65: this.createMaterialTexture(gl, cieData.d65),
    };
  }

  /**
   * Destroy a WebGL texture
   * @param gl WebGL context
   * @param texture WebGLTexture to destroy
   */
  static destroyTexture(gl: WebGLRenderingContext, texture: WebGLTexture | null): void {
    if (texture) {
      gl.deleteTexture(texture);
    }
  }

  /**
   * Destroy multiple WebGL textures
   * @param gl WebGL context
   * @param textures Array of WebGLTextures to destroy
   */
  static destroyTextures(gl: WebGLRenderingContext, textures: (WebGLTexture | null)[]): void {
    for (const texture of textures) {
      this.destroyTexture(gl, texture);
    }
  }
}

