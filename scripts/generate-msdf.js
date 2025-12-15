/**
 * Generate a pseudo-MSDF texture from an SVG file
 * 
 * This creates a simple signed distance field approximation using
 * rasterization and edge detection. For production, use msdfgen.
 * 
 * Usage: node scripts/generate-msdf.js <svg-name>
 * Example: node scripts/generate-msdf.js diagonal-circle-grid
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const svgName = process.argv[2];
if (!svgName) {
  console.error('Usage: node scripts/generate-msdf.js <svg-name>');
  process.exit(1);
}

const srcDir = path.join(process.cwd(), 'src/public/msdf');
const svgPath = path.join(srcDir, 'svg', `${svgName}.svg`);
const pngPath = path.join(srcDir, `${svgName}.png`);

if (!fs.existsSync(svgPath)) {
  console.error(`SVG file not found: ${svgPath}`);
  process.exit(1);
}

async function generateMSDF() {
  console.log(`Generating MSDF for: ${svgName}`);
  console.log(`Input: ${svgPath}`);
  console.log(`Output: ${pngPath}`);

  // Read the SVG
  const svgBuffer = fs.readFileSync(svgPath);
  
  // Render SVG to a high-resolution grayscale image
  // We'll use this as a base for distance field computation
  const rendered = await sharp(svgBuffer)
    .resize(1280, 720, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = rendered;
  const width = info.width;
  const height = info.height;

  // Create a simple pseudo-MSDF by computing distance-like values
  // This is a simplified version - real MSDF uses proper signed distance computation
  const pxRange = 8; // Pixel range for distance field
  const output = Buffer.alloc(width * height * 3); // RGB output

  // For each pixel, compute approximate distance to nearest edge
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const val = data[idx]; // 0 = inside (black), 255 = outside (white)
      const isInside = val < 128;

      // Find distance to nearest edge (simplified: check local neighborhood)
      let minDist = pxRange;
      for (let dy = -pxRange; dy <= pxRange; dy++) {
        for (let dx = -pxRange; dx <= pxRange; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nidx = ny * width + nx;
            const nval = data[nidx];
            const nInside = nval < 128;
            if (nInside !== isInside) {
              const dist = Math.sqrt(dx * dx + dy * dy);
              minDist = Math.min(minDist, dist);
            }
          }
        }
      }

      // Convert distance to 0-255 range
      // 0.5 (128) = edge, <0.5 = inside, >0.5 = outside
      let signedDist = isInside ? -minDist : minDist;
      let normalized = (signedDist / pxRange) * 0.5 + 0.5;
      normalized = Math.max(0, Math.min(1, normalized));
      const byteVal = Math.round(normalized * 255);

      // For MSDF, we use the same value in all channels for simple shapes
      // (True MSDF would have different values per channel for corners)
      output[idx * 3 + 0] = byteVal; // R
      output[idx * 3 + 1] = byteVal; // G
      output[idx * 3 + 2] = byteVal; // B
    }
  }

  // Save as PNG
  await sharp(output, { raw: { width, height, channels: 3 } })
    .png()
    .toFile(pngPath);

  console.log(`Generated: ${pngPath}`);
}

generateMSDF().catch(err => {
  console.error('Error generating MSDF:', err);
  process.exit(1);
});

