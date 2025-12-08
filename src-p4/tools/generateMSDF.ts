/**
 * MSDF (Multi-Channel Signed Distance Field) Generator
 * 
 * Generates MSDF textures for shape rendering in WebGPU.
 * 
 * MSDF Convention:
 * - Signed distance: negative = inside, positive = outside, 0 = edge
 * - Channel value: 0.5 (128) = edge, <0.5 = inside, >0.5 = outside
 * 
 * For MSDF with sharp corners, we use 3 channels to encode edge directions.
 * The shader takes the median of R, G, B to get the final distance.
 * 
 * Output: PNG files in public/msdf/
 * 
 * Usage:
 *   npx tsx src-p4/tools/generateMSDF.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_DIR = path.join(__dirname, '../public/msdf');

// MSDF generation parameters
const PX_RANGE = 8.0;  // Pixel range for distance field (larger = softer edges)

interface ShapeConfig {
  name: string;
  width: number;
  height: number;
  generate: (x: number, y: number, width: number, height: number) => MSDFValue;
}

interface MSDFValue {
  r: number;  // 0-255
  g: number;  // 0-255
  b: number;  // 0-255
}

/**
 * Convert signed distance to 0-255 channel value
 * Convention: negative = inside, positive = outside
 * Output: 128 = edge, <128 = inside, >128 = outside
 */
function distanceToChannel(signedDistance: number, pxRange: number): number {
  // Map [-pxRange, +pxRange] to [0, 1], with 0.5 at distance=0
  const normalized = 0.5 + signedDistance / (2 * pxRange);
  // Clamp and convert to 0-255
  return Math.round(Math.max(0, Math.min(1, normalized)) * 255);
}

/**
 * Create MSDF value from a single signed distance (for shapes without sharp corners)
 */
function sdfToMSDF(signedDistance: number, pxRange: number): MSDFValue {
  const channel = distanceToChannel(signedDistance, pxRange);
  return { r: channel, g: channel, b: channel };
}

// ============================================================
// Signed Distance Functions (negative inside, positive outside)
// ============================================================

/**
 * Circle SDF
 */
function circleSDF(x: number, y: number, cx: number, cy: number, radius: number): number {
  const dx = x - cx;
  const dy = y - cy;
  return Math.sqrt(dx * dx + dy * dy) - radius;
}

/**
 * Box/Rectangle SDF (returns single distance, negative inside)
 */
function boxSDF(x: number, y: number, cx: number, cy: number, halfW: number, halfH: number): number {
  // Distance from center
  const dx = Math.abs(x - cx) - halfW;
  const dy = Math.abs(y - cy) - halfH;
  
  // Outside: positive distance to nearest corner/edge
  // Inside: negative distance to nearest edge
  const outsideDist = Math.sqrt(Math.max(dx, 0) ** 2 + Math.max(dy, 0) ** 2);
  const insideDist = Math.min(Math.max(dx, dy), 0);
  
  return outsideDist + insideDist;
}

/**
 * Rectangle MSDF with sharp corners
 * Uses separate channels for horizontal and vertical distances
 */
function rectangleMSDF(
  x: number, y: number,
  cx: number, cy: number, halfW: number, halfH: number,
  pxRange: number
): MSDFValue {
  // Signed distances to each axis-aligned edge pair
  // Negative = inside, Positive = outside
  const dHoriz = Math.abs(x - cx) - halfW;  // Horizontal distance
  const dVert = Math.abs(y - cy) - halfH;   // Vertical distance
  
  // Combined SDF for corners
  const outsideDist = Math.sqrt(Math.max(dHoriz, 0) ** 2 + Math.max(dVert, 0) ** 2);
  const insideDist = Math.min(Math.max(dHoriz, dVert), 0);
  const combinedDist = outsideDist + insideDist;
  
  // MSDF: separate channels allow sharp corner reconstruction
  return {
    r: distanceToChannel(dHoriz, pxRange),
    g: distanceToChannel(dVert, pxRange),
    b: distanceToChannel(combinedDist, pxRange),
  };
}

/**
 * Unsigned distance from point to line segment
 */
function pointToSegmentDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const ex = x2 - x1;
  const ey = y2 - y1;
  const lenSq = ex * ex + ey * ey;
  
  if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  
  const t = Math.max(0, Math.min(1, ((px - x1) * ex + (py - y1) * ey) / lenSq));
  const projX = x1 + t * ex;
  const projY = y1 + t * ey;
  
  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}

/**
 * Cross product sign - determines which side of a line a point is on
 * Positive = left side (inside for CCW), Negative = right side (outside for CCW)
 */
function crossSign(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  return (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1);
}

/**
 * Triangle SDF - computes signed distance to triangle
 * Negative inside, positive outside
 */
function triangleSDF(
  px: number, py: number,
  v0x: number, v0y: number,
  v1x: number, v1y: number,
  v2x: number, v2y: number
): number {
  // Check which side of each edge the point is on
  const s0 = crossSign(px, py, v0x, v0y, v1x, v1y);
  const s1 = crossSign(px, py, v1x, v1y, v2x, v2y);
  const s2 = crossSign(px, py, v2x, v2y, v0x, v0y);
  
  // Distance to each edge
  const d0 = pointToSegmentDist(px, py, v0x, v0y, v1x, v1y);
  const d1 = pointToSegmentDist(px, py, v1x, v1y, v2x, v2y);
  const d2 = pointToSegmentDist(px, py, v2x, v2y, v0x, v0y);
  
  // Minimum distance to any edge
  const minDist = Math.min(d0, d1, d2);
  
  // Inside if all signs are the same (all positive or all negative)
  const allPositive = s0 >= 0 && s1 >= 0 && s2 >= 0;
  const allNegative = s0 <= 0 && s1 <= 0 && s2 <= 0;
  const inside = allPositive || allNegative;
  
  return inside ? -minDist : minDist;
}

/**
 * Triangle MSDF - uses separate channels for each edge
 */
function triangleMSDF(
  px: number, py: number,
  v0x: number, v0y: number,
  v1x: number, v1y: number,
  v2x: number, v2y: number,
  pxRange: number
): MSDFValue {
  // For each edge, compute signed distance
  // Sign is based on cross product (positive = left/inside for CCW)
  const s0 = crossSign(px, py, v0x, v0y, v1x, v1y);
  const s1 = crossSign(px, py, v1x, v1y, v2x, v2y);
  const s2 = crossSign(px, py, v2x, v2y, v0x, v0y);
  
  const d0 = pointToSegmentDist(px, py, v0x, v0y, v1x, v1y);
  const d1 = pointToSegmentDist(px, py, v1x, v1y, v2x, v2y);
  const d2 = pointToSegmentDist(px, py, v2x, v2y, v0x, v0y);
  
  // Signed distances: negative inside, positive outside
  // For CW winding (our triangle), negative cross = inside
  const sd0 = s0 <= 0 ? -d0 : d0;
  const sd1 = s1 <= 0 ? -d1 : d1;
  const sd2 = s2 <= 0 ? -d2 : d2;
  
  return {
    r: distanceToChannel(sd0, pxRange),
    g: distanceToChannel(sd1, pxRange),
    b: distanceToChannel(sd2, pxRange),
  };
}

/**
 * Circle grid SDF - multiple circles at regular intervals
 */
function circleGridSDF(
  x: number, y: number,
  width: number, height: number,
  spacingX: number, spacingY: number,
  radius: number
): number {
  // Use modulo to find position within a cell
  const cellX = ((x % spacingX) + spacingX) % spacingX;
  const cellY = ((y % spacingY) + spacingY) % spacingY;
  
  // Distance to center of nearest circle (at center of cell)
  const cx = spacingX / 2;
  const cy = spacingY / 2;
  
  return circleSDF(cellX, cellY, cx, cy, radius);
}

// ============================================================
// Shape Generators
// ============================================================

const shapes: ShapeConfig[] = [
  {
    name: 'circle',
    width: 256,
    height: 256,
    generate: (x, y, width, height) => {
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width, height) / 2 - PX_RANGE;
      const dist = circleSDF(x, y, cx, cy, radius);
      return sdfToMSDF(dist, PX_RANGE);
    },
  },
  {
    name: 'rectangle',
    width: 256,
    height: 256,
    generate: (x, y, width, height) => {
      const cx = width / 2;
      const cy = height / 2;
      const halfW = width / 2 - PX_RANGE;
      const halfH = height / 2 - PX_RANGE;
      return rectangleMSDF(x, y, cx, cy, halfW, halfH, PX_RANGE);
    },
  },
  {
    name: 'triangle',
    width: 256,
    height: 256,
    generate: (x, y, width, height) => {
      const margin = PX_RANGE;
      // Triangle vertices (pointing up) - counter-clockwise winding
      const topX = width / 2;
      const topY = margin;
      const bottomLeftX = margin;
      const bottomLeftY = height - margin;
      const bottomRightX = width - margin;
      const bottomRightY = height - margin;
      
      // CCW: top -> bottom-left -> bottom-right -> top
      return triangleMSDF(
        x, y,
        topX, topY,
        bottomLeftX, bottomLeftY,
        bottomRightX, bottomRightY,
        PX_RANGE
      );
    },
  },
  {
    name: 'circle-grid',
    width: 1280,  // Match canvas aspect ratio
    height: 720,
    generate: (x, y, width, height) => {
      const spacingX = 50;
      const spacingY = 50;
      const radius = 4;  // Smaller circles
      const dist = circleGridSDF(x, y, width, height, spacingX, spacingY, radius);
      return sdfToMSDF(dist, PX_RANGE);
    },
  },
];

// ============================================================
// Main Generation
// ============================================================

async function generateMSDF(config: ShapeConfig): Promise<void> {
  const { name, width, height, generate } = config;
  
  // Generate MSDF data (RGB)
  const data = new Uint8Array(width * height * 3);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const msdf = generate(x, y, width, height);
      const idx = (y * width + x) * 3;
      data[idx] = msdf.r;
      data[idx + 1] = msdf.g;
      data[idx + 2] = msdf.b;
    }
  }
  
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  // Write PNG using sharp
  const filePath = path.join(OUTPUT_DIR, `${name}.png`);
  await sharp(data, {
    raw: {
      width,
      height,
      channels: 3,
    },
  })
    .png()
    .toFile(filePath);
  
  console.log(`Generated: ${filePath} (${width}x${height})`);
}

async function main(): Promise<void> {
  console.log('Generating MSDF textures...\n');
  console.log(`Pixel range: ${PX_RANGE}`);
  console.log(`Output directory: ${OUTPUT_DIR}\n`);
  
  for (const shape of shapes) {
    await generateMSDF(shape);
  }
  
  // Write metadata file for shader to know the pxRange
  const metadata = {
    pxRange: PX_RANGE,
    shapes: shapes.map(s => ({
      name: s.name,
      width: s.width,
      height: s.height,
    })),
  };
  
  const metaPath = path.join(OUTPUT_DIR, 'metadata.json');
  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
  console.log(`\nMetadata: ${metaPath}`);
  
  console.log('\nDone!');
}

main().catch(console.error);
