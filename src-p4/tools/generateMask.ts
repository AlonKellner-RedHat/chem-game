/**
 * Mask File Generator
 * 
 * Generates binary mask files for shape rendering.
 * 
 * File Format:
 * - Header (16 bytes): width (u32), height (u32), reserved (8 bytes)
 * - Data: width × height float32 values (0.0 to 1.0)
 * - Extension: .mask
 * 
 * Usage:
 *   npx ts-node src-p4/tools/generateMask.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_DIR = path.join(__dirname, '../public/masks');

interface MaskGenerator {
  name: string;
  width: number;
  height: number;
  generate: (x: number, y: number, width: number, height: number) => number;
}

/**
 * Write mask to binary file
 */
function writeMaskFile(name: string, width: number, height: number, data: Float32Array): void {
  // Create header: width (u32), height (u32), reserved (8 bytes)
  const header = new ArrayBuffer(16);
  const headerView = new DataView(header);
  headerView.setUint32(0, width, true);  // little-endian
  headerView.setUint32(4, height, true);
  // Reserved bytes 8-15 are zero
  
  // Combine header and data
  const headerBytes = new Uint8Array(header);
  const dataBytes = new Uint8Array(data.buffer);
  const combined = new Uint8Array(headerBytes.length + dataBytes.length);
  combined.set(headerBytes, 0);
  combined.set(dataBytes, headerBytes.length);
  
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  const filePath = path.join(OUTPUT_DIR, `${name}.mask`);
  fs.writeFileSync(filePath, combined);
  console.log(`Generated: ${filePath} (${width}x${height}, ${combined.length} bytes)`);
}

/**
 * Generate mask from generator function
 */
function generateMask(generator: MaskGenerator): void {
  const { name, width, height, generate } = generator;
  const data = new Float32Array(width * height);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      data[index] = generate(x, y, width, height);
    }
  }
  
  writeMaskFile(name, width, height, data);
}

// ============================================================
// Mask Generators
// ============================================================

/**
 * Solid rectangle (all 1.0)
 */
const rectangleMask: MaskGenerator = {
  name: 'rectangle',
  width: 200,
  height: 200,
  generate: () => 1.0,
};

/**
 * Filled circle
 */
const circleMask: MaskGenerator = {
  name: 'circle',
  width: 200,
  height: 200,
  generate: (x, y, width, height) => {
    const cx = width / 2;
    const cy = height / 2;
    const rx = width / 2;
    const ry = height / 2;
    const dx = (x - cx) / rx;
    const dy = (y - cy) / ry;
    return dx * dx + dy * dy <= 1.0 ? 1.0 : 0.0;
  },
};

/**
 * Equilateral triangle pointing down (matching shader convention)
 */
const triangleMask: MaskGenerator = {
  name: 'triangle',
  width: 200,
  height: 200,
  generate: (x, y, width, height) => {
    const cx = width / 2;
    const top = 0;
    
    // Relative coordinates (matching shader logic)
    const rx = (x - cx) / (width / 2);
    const ry = (y - top) / height;
    
    // Inside triangle: ry >= 0, ry <= 1, |rx| <= ry
    if (ry >= 0 && ry <= 1 && Math.abs(rx) <= ry) {
      return 1.0;
    }
    return 0.0;
  },
};

/**
 * Circle grid - repeating circles at 50px spacing
 * This mask covers the entire canvas for background use
 */
const circleGridMask: MaskGenerator = {
  name: 'circle-grid',
  width: 1280,  // Full canvas width
  height: 720,  // Full canvas height
  generate: (x, y) => {
    const spacing = 50;
    const radius = 10;
    
    // Find nearest grid center
    const gridX = Math.round(x / spacing) * spacing;
    const gridY = Math.round(y / spacing) * spacing;
    
    // Check if within circle radius
    const dx = x - gridX;
    const dy = y - gridY;
    
    if (dx * dx + dy * dy <= radius * radius) {
      return 1.0;
    }
    return 0.0;
  },
};

// ============================================================
// Main
// ============================================================

function main(): void {
  console.log('Generating mask files...\n');
  
  generateMask(rectangleMask);
  generateMask(circleMask);
  generateMask(triangleMask);
  generateMask(circleGridMask);
  
  console.log('\nDone!');
}

main();

