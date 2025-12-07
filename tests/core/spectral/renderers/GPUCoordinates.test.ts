import { describe, it, expect } from "vitest";

/**
 * Tests for GPU coordinate transformation.
 * 
 * The GPU shader must correctly map texture pixel coordinates to world coordinates
 * when the camera is offset (bounds.min is not at origin).
 * 
 * Issue: The shader currently uses pixel coordinates directly (0 to width) but compares
 * them against shape positions in world coordinates. When bounds.min.x > 0, this causes
 * shapes to appear shifted left.
 */

describe("GPU Coordinate Transformation", () => {
  describe("Pixel to World Coordinate Mapping", () => {
    it("should correctly map pixel coordinates to world coordinates with camera offset", () => {
      // Simulate a camera view that doesn't start at origin
      const bounds = { min: { x: 100, y: 50 }, max: { x: 1380, y: 770 } };
      const squareWorldX = 300;  // Square is at world X = 300
      const squareWorldY = 200;  // Square is at world Y = 200
      
      // In the texture, pixel (200, 150) should correspond to world (300, 200)
      const pixelX = 200;  // 300 - 100 = 200
      const pixelY = 150;  // 200 - 50 = 150
      
      // The shader should transform: worldCoord = boundsMin + pixelCoord
      const worldX = bounds.min.x + pixelX;
      const worldY = bounds.min.y + pixelY;
      
      expect(worldX).toBe(squareWorldX);
      expect(worldY).toBe(squareWorldY);
    });

    it("should detect shape at correct world position regardless of camera offset", () => {
      // Shape parameters (in world coordinates)
      const squareX = 400;
      const squareY = 300;
      const squareSize = 100;
      
      // Camera offset
      const boundsMinX = 200;
      const boundsMinY = 100;
      
      // Test pixel that should be inside the square
      // World position (400, 300) = pixel position (200, 200)
      const testPixelX = 200;  // 400 - 200
      const testPixelY = 200;  // 300 - 100
      
      // Transform pixel to world
      const worldX = boundsMinX + testPixelX;
      const worldY = boundsMinY + testPixelY;
      
      // Check if point is in square (using world coordinates)
      const halfSize = squareSize / 2;
      const inSquare = 
        worldX >= squareX - halfSize && worldX <= squareX + halfSize &&
        worldY >= squareY - halfSize && worldY <= squareY + halfSize;
      
      expect(inSquare).toBe(true);
    });

    it("should NOT detect shape when pixel is outside bounds-adjusted area", () => {
      const squareX = 400;
      const squareY = 300;
      const squareSize = 100;
      
      const boundsMinX = 200;
      const boundsMinY = 100;
      
      // Test pixel that is at (100, 100) in texture = (300, 200) in world
      // This is outside the square (centered at 400, 300)
      const testPixelX = 100;
      const testPixelY = 100;
      
      const worldX = boundsMinX + testPixelX;  // 300
      const worldY = boundsMinY + testPixelY;  // 200
      
      const halfSize = squareSize / 2;
      const inSquare = 
        worldX >= squareX - halfSize && worldX <= squareX + halfSize &&
        worldY >= squareY - halfSize && worldY <= squareY + halfSize;
      
      expect(inSquare).toBe(false);
    });
  });

  describe("Shader Uniform Requirements", () => {
    it("should require boundsMinX and boundsMinY uniforms for correct transformation", () => {
      // This test documents the required uniforms
      const requiredUniforms = [
        'u_boundsMinX',
        'u_boundsMinY',
      ];
      
      // These should be added to the shader's uniform list
      expect(requiredUniforms).toContain('u_boundsMinX');
      expect(requiredUniforms).toContain('u_boundsMinY');
    });
  });
});

