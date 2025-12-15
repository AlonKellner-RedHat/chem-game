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

/**
 * Generate diagonal-circle-grid SVG with staggered circles and diagonal lattice lines
 * Creates a honeycomb-like pattern for ambient light
 * All shapes are subpaths of a single <path> element for MSDF compatibility
 */
function generateDiagonalCircleGridSVG(): string {
  const pathParts: string[] = [];
  
  // Calculate grid dimensions
  const cols = Math.floor(GRID_WIDTH / CELL_SIZE) + 1;  // Extra column for offset rows
  const rows = Math.floor(GRID_HEIGHT / CELL_SIZE);
  const halfCell = CELL_SIZE / 2;
  const lineHalfWidth = LINE_WIDTH / 2;
  
  // Store circle centers for line generation
  const circles: Array<{cx: number; cy: number; row: number; col: number}> = [];
  
  // Generate circles (staggered - every other row offset by half cell)
  for (let row = 0; row < rows; row++) {
    const cy = row * CELL_SIZE + halfCell;  // Center of cell
    const xOffset = (row % 2) * halfCell;   // Offset for odd rows
    
    for (let col = 0; col < cols; col++) {
      const cx = col * CELL_SIZE + halfCell + xOffset;
      
      // Skip if outside bounds
      if (cx < 0 || cx > GRID_WIDTH) continue;
      
      circles.push({ cx, cy, row, col });
      
      const r = CIRCLE_RADIUS;
      // Circle as two arcs: M (cx-r) cy A r r 0 1 0 (cx+r) cy A r r 0 1 0 (cx-r) cy Z
      pathParts.push(`M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`);
    }
  }
  
  // Generate diagonal lattice lines connecting circles to neighbors in next row
  for (let row = 0; row < rows - 1; row++) {
    const y1 = row * CELL_SIZE + halfCell;
    const y2 = (row + 1) * CELL_SIZE + halfCell;
    const xOffset1 = (row % 2) * halfCell;
    const xOffset2 = ((row + 1) % 2) * halfCell;
    
    for (let col = 0; col < cols; col++) {
      const x1 = col * CELL_SIZE + halfCell + xOffset1;
      
      // Skip if outside bounds
      if (x1 < 0 || x1 > GRID_WIDTH) continue;
      
      // Connect to down-left neighbor (in next row)
      const x2left = x1 - halfCell;
      if (x2left >= 0 && x2left <= GRID_WIDTH) {
        // Draw line as thin parallelogram (2px wide)
        const dx = x2left - x1;
        const dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        const nx = (-dy / len) * lineHalfWidth;  // perpendicular normal x
        const ny = (dx / len) * lineHalfWidth;   // perpendicular normal y
        pathParts.push(`M ${x1 + nx} ${y1 + ny} L ${x2left + nx} ${y2 + ny} L ${x2left - nx} ${y2 - ny} L ${x1 - nx} ${y1 - ny} Z`);
      }
      
      // Connect to down-right neighbor (in next row)
      const x2right = x1 + halfCell;
      if (x2right >= 0 && x2right <= GRID_WIDTH) {
        const dx = x2right - x1;
        const dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        const nx = (-dy / len) * lineHalfWidth;
        const ny = (dx / len) * lineHalfWidth;
        pathParts.push(`M ${x1 + nx} ${y1 + ny} L ${x2right + nx} ${y2 + ny} L ${x2right - nx} ${y2 - ny} L ${x1 - nx} ${y1 - ny} Z`);
      }
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

/**
 * Generate fullscreen SVG - a simple filled rectangle covering the entire viewport
 * Used as the base background shape for ambient light reflection
 */
function generateFullscreenSVG(): string {
  // Simple filled rectangle covering the entire area
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID_WIDTH} ${GRID_HEIGHT}">
  <path d="M 0 0 L ${GRID_WIDTH} 0 L ${GRID_WIDTH} ${GRID_HEIGHT} L 0 ${GRID_HEIGHT} Z" fill="black"/>
</svg>
`;
}

// Define shapes to generate
const shapes: ShapeConfig[] = [
  { name: 'circle', svgFile: 'circle.svg', width: 256, height: 256 },
  { name: 'rectangle', svgFile: 'rectangle.svg', width: 256, height: 256 },
  { name: 'triangle', svgFile: 'triangle.svg', width: 256, height: 256 },
  { name: 'circle-grid', svgFile: 'circle-grid.svg', width: 1280, height: 720 },
  { name: 'diagonal-circle-grid', svgFile: 'diagonal-circle-grid.svg', width: 1280, height: 720 },
  { name: 'fullscreen', svgFile: 'fullscreen.svg', width: 1280, height: 720 },
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
  
  // Generate diagonal-circle-grid SVG programmatically
  const diagonalCircleGridSvgPath = path.join(SVG_DIR, 'diagonal-circle-grid.svg');
  console.log('Generating diagonal-circle-grid.svg...');
  const diagonalCircleGridSvg = generateDiagonalCircleGridSVG();
  fs.writeFileSync(diagonalCircleGridSvgPath, diagonalCircleGridSvg);
  console.log(`  -> ${diagonalCircleGridSvgPath}\n`);
  
  // Generate fullscreen SVG programmatically
  const fullscreenSvgPath = path.join(SVG_DIR, 'fullscreen.svg');
  console.log('Generating fullscreen.svg...');
  const fullscreenSvg = generateFullscreenSVG();
  fs.writeFileSync(fullscreenSvgPath, fullscreenSvg);
  console.log(`  -> ${fullscreenSvgPath}\n`);
  
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
