/**
 * MSDF Generator - Converts SVG files to MSDF textures using msdfgen CLI
 * 
 * This tool reads SVG files from public/msdf/svg/ and generates MSDF PNG textures
 * using the msdfgen command-line tool.
 * 
 * Prerequisites:
 *   - msdfgen must be installed (run .devcontainer/setup-msdfgen.sh)
 * 
 * Usage:
 *   npx tsx src-p4/tools/generateMSDF.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SVG_DIR = path.join(__dirname, '../public/msdf/svg');
const OUTPUT_DIR = path.join(__dirname, '../public/msdf');

// MSDF generation parameters
const PX_RANGE = 8.0;  // Pixel range for distance field

interface ShapeConfig {
  name: string;
  svgFile: string;
  width: number;
  height: number;
}

// Define shapes to generate
const shapes: ShapeConfig[] = [
  { name: 'circle', svgFile: 'circle.svg', width: 256, height: 256 },
  { name: 'rectangle', svgFile: 'rectangle.svg', width: 256, height: 256 },
  { name: 'triangle', svgFile: 'triangle.svg', width: 256, height: 256 },
  { name: 'circle-grid', svgFile: 'circle-grid.svg', width: 1280, height: 720 },
];

/**
 * Check if msdfgen is installed
 */
function checkMsdfgen(): boolean {
  try {
    execSync('msdfgen --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate MSDF from SVG using msdfgen CLI
 */
function generateMSDF(config: ShapeConfig): void {
  const svgPath = path.join(SVG_DIR, config.svgFile);
  const outputPath = path.join(OUTPUT_DIR, `${config.name}.png`);
  
  if (!fs.existsSync(svgPath)) {
    console.error(`SVG file not found: ${svgPath}`);
    return;
  }
  
  // Build msdfgen command
  // msdfgen msdf -svg <input.svg> -o <output.png> -size <w> <h> -pxrange <range> -autoframe
  const cmd = [
    'msdfgen',
    'msdf',
    '-svg', svgPath,
    '-o', outputPath,
    '-size', config.width.toString(), config.height.toString(),
    '-pxrange', PX_RANGE.toString(),
    '-autoframe',  // Automatically fit shape to output size
  ].join(' ');
  
  console.log(`Generating: ${config.name} (${config.width}x${config.height})`);
  
  try {
    execSync(cmd, { stdio: 'pipe' });
    console.log(`  -> ${outputPath}`);
  } catch (error: unknown) {
    const err = error as { stderr?: Buffer };
    console.error(`  Failed: ${err.stderr?.toString() || 'Unknown error'}`);
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  console.log('MSDF Generator (SVG to MSDF)\n');
  
  // Check prerequisites
  if (!checkMsdfgen()) {
    console.error('Error: msdfgen is not installed.');
    console.error('Run: .devcontainer/setup-msdfgen.sh');
    process.exit(1);
  }
  
  // Check SVG directory
  if (!fs.existsSync(SVG_DIR)) {
    console.error(`SVG directory not found: ${SVG_DIR}`);
    process.exit(1);
  }
  
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  console.log(`SVG source: ${SVG_DIR}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`Pixel range: ${PX_RANGE}\n`);
  
  // Generate MSDF for each shape
  for (const shape of shapes) {
    generateMSDF(shape);
  }
  
  // Write metadata file
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
