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

// Circle grid parameters
const GRID_WIDTH = 1280;
const GRID_HEIGHT = 720;
const CELL_SIZE = 50;        // Each cell is 50x50 pixels
const CIRCLE_RADIUS = 4;     // Circle radius
const LINE_WIDTH = 2;        // Lattice line width

/**
 * Generate circle-grid SVG with circles and lattice lines
 * All shapes are subpaths of a single <path> element for MSDF compatibility
 */
function generateCircleGridSVG(): string {
  const pathParts: string[] = [];
  
  // Calculate grid dimensions
  const cols = Math.floor(GRID_WIDTH / CELL_SIZE);   // 25 columns
  const rows = Math.floor(GRID_HEIGHT / CELL_SIZE);  // 14 rows
  
  // Generate lattice lines (as filled rectangles)
  // Vertical lines at x = 0, 50, 100, ..., cols*CELL_SIZE
  for (let i = 0; i <= cols; i++) {
    const x = i * CELL_SIZE;
    const halfWidth = LINE_WIDTH / 2;
    const x1 = Math.max(0, x - halfWidth);
    const x2 = Math.min(GRID_WIDTH, x + halfWidth);
    // Rectangle as path: M x1 0 L x2 0 L x2 height L x1 height Z
    pathParts.push(`M ${x1} 0 L ${x2} 0 L ${x2} ${GRID_HEIGHT} L ${x1} ${GRID_HEIGHT} Z`);
  }
  
  // Horizontal lines at y = 0, 50, 100, ..., rows*CELL_SIZE
  for (let j = 0; j <= rows; j++) {
    const y = j * CELL_SIZE;
    const halfWidth = LINE_WIDTH / 2;
    const y1 = Math.max(0, y - halfWidth);
    const y2 = Math.min(GRID_HEIGHT, y + halfWidth);
    // Rectangle as path: M 0 y1 L width y1 L width y2 L 0 y2 Z
    pathParts.push(`M 0 ${y1} L ${GRID_WIDTH} ${y1} L ${GRID_WIDTH} ${y2} L 0 ${y2} Z`);
  }
  
  // Generate circles (centered in each cell)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = col * CELL_SIZE + CELL_SIZE / 2;  // Center of cell
      const cy = row * CELL_SIZE + CELL_SIZE / 2;
      const r = CIRCLE_RADIUS;
      // Circle as two arcs: M (cx-r) cy A r r 0 1 0 (cx+r) cy A r r 0 1 0 (cx-r) cy Z
      pathParts.push(`M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`);
    }
  }
  
  const pathData = pathParts.join(' ');
  
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID_WIDTH} ${GRID_HEIGHT}">
  <path d="${pathData}" fill="black"/>
</svg>
`;
}

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
  
  // Generate circle-grid SVG programmatically
  const circleGridSvgPath = path.join(SVG_DIR, 'circle-grid.svg');
  console.log('Generating circle-grid.svg...');
  const circleGridSvg = generateCircleGridSVG();
  fs.writeFileSync(circleGridSvgPath, circleGridSvg);
  console.log(`  -> ${circleGridSvgPath}\n`);
  
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
