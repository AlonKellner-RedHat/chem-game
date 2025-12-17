/**
 * Shape Source Generator - Creates source.svg files for all shapes
 *
 * This tool generates source.svg files containing:
 * - <g id="msdf">: Shape mask for MSDF texture generation
 * - <g id="alpha">: Optional gradient overlays for alpha channel
 * - <defs>: Gradient definitions used by the alpha group
 *
 * Output: public/shapes/{shapeName}/source.svg
 *
 * Usage:
 *   npx tsx src/tools/generateShapeSources.ts
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SHAPES_DIR = path.join(__dirname, "../public/shapes");

// Grid parameters for programmatic SVG generation
const GRID_WIDTH = 1280;
const GRID_HEIGHT = 720;
const CELL_SIZE = 50;
const CIRCLE_RADIUS = 4;
const LINE_WIDTH = 2;

// ============================================================
// MSDF Path Generators
// ============================================================

/**
 * Generate simple circle path (centered in viewBox)
 */
function generateCirclePath(width: number, height: number): string {
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) * 0.4;
  return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
}

/**
 * Generate simple rectangle path (centered in viewBox with padding)
 */
function generateRectanglePath(width: number, height: number): string {
  const padding = Math.min(width, height) * 0.1;
  const x = padding;
  const y = padding;
  const w = width - padding * 2;
  const h = height - padding * 2;
  return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
}

/**
 * Generate simple triangle path (centered in viewBox)
 */
function generateTrianglePath(width: number, height: number): string {
  const padding = Math.min(width, height) * 0.1;
  const cx = width / 2;
  const top = padding;
  const bottom = height - padding;
  const left = padding;
  const right = width - padding;
  return `M ${cx} ${top} L ${right} ${bottom} L ${left} ${bottom} Z`;
}

/**
 * Generate circle-grid path with circles and orthogonal lattice lines
 */
function generateCircleGridPath(): string {
  const pathParts: string[] = [];

  const cols = Math.floor(GRID_WIDTH / CELL_SIZE);
  const rows = Math.floor(GRID_HEIGHT / CELL_SIZE);

  // Vertical lines
  for (let i = 0; i <= cols; i++) {
    const x = i * CELL_SIZE;
    const halfWidth = LINE_WIDTH / 2;
    const x1 = Math.max(0, x - halfWidth);
    const x2 = Math.min(GRID_WIDTH, x + halfWidth);
    pathParts.push(
      `M ${x1} 0 L ${x2} 0 L ${x2} ${GRID_HEIGHT} L ${x1} ${GRID_HEIGHT} Z`
    );
  }

  // Horizontal lines
  for (let j = 0; j <= rows; j++) {
    const y = j * CELL_SIZE;
    const halfWidth = LINE_WIDTH / 2;
    const y1 = Math.max(0, y - halfWidth);
    const y2 = Math.min(GRID_HEIGHT, y + halfWidth);
    pathParts.push(
      `M 0 ${y1} L ${GRID_WIDTH} ${y1} L ${GRID_WIDTH} ${y2} L 0 ${y2} Z`
    );
  }

  // Circles
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = col * CELL_SIZE + CELL_SIZE / 2;
      const cy = row * CELL_SIZE + CELL_SIZE / 2;
      const r = CIRCLE_RADIUS;
      pathParts.push(
        `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`
      );
    }
  }

  return pathParts.join(" ");
}

/**
 * Generate diagonal-circle-grid path with staggered circles and diagonal lattice lines
 */
function generateDiagonalCircleGridPath(): string {
  const pathParts: string[] = [];

  const cols = Math.floor(GRID_WIDTH / CELL_SIZE) + 1;
  const rows = Math.floor(GRID_HEIGHT / CELL_SIZE);
  const halfCell = CELL_SIZE / 2;
  const lineHalfWidth = LINE_WIDTH / 2;

  // Staggered circles
  for (let row = 0; row < rows; row++) {
    const cy = row * CELL_SIZE + halfCell;
    const xOffset = (row % 2) * halfCell;

    for (let col = 0; col < cols; col++) {
      const cx = col * CELL_SIZE + halfCell + xOffset;
      if (cx < 0 || cx > GRID_WIDTH) continue;

      const r = CIRCLE_RADIUS;
      pathParts.push(
        `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`
      );
    }
  }

  // Diagonal lines
  for (let row = 0; row < rows - 1; row++) {
    const y1 = row * CELL_SIZE + halfCell;
    const y2 = (row + 1) * CELL_SIZE + halfCell;
    const xOffset1 = (row % 2) * halfCell;

    for (let col = 0; col < cols; col++) {
      const x1 = col * CELL_SIZE + halfCell + xOffset1;
      if (x1 < 0 || x1 > GRID_WIDTH) continue;

      // Down-left connection
      const x2left = x1 - halfCell;
      if (x2left >= 0 && x2left <= GRID_WIDTH) {
        const dx = x2left - x1;
        const dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        const nx = (-dy / len) * lineHalfWidth;
        const ny = (dx / len) * lineHalfWidth;
        pathParts.push(
          `M ${x1 + nx} ${y1 + ny} L ${x2left + nx} ${y2 + ny} L ${x2left - nx} ${y2 - ny} L ${x1 - nx} ${y1 - ny} Z`
        );
      }

      // Down-right connection
      const x2right = x1 + halfCell;
      if (x2right >= 0 && x2right <= GRID_WIDTH) {
        const dx = x2right - x1;
        const dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        const nx = (-dy / len) * lineHalfWidth;
        const ny = (dx / len) * lineHalfWidth;
        pathParts.push(
          `M ${x1 + nx} ${y1 + ny} L ${x2right + nx} ${y2 + ny} L ${x2right - nx} ${y2 - ny} L ${x1 - nx} ${y1 - ny} Z`
        );
      }
    }
  }

  return pathParts.join(" ");
}

// ============================================================
// Alpha Gradient Generators
// ============================================================

interface GradientDef {
  id: string;
  type: "linear" | "radial";
  attrs: Record<string, string>;
  stops: Array<{ offset: string; color: string; opacity?: string }>;
}

interface AlphaLayer {
  fill: string; // color or url(#gradientId)
  blendMode?: string;
}

interface AlphaConfig {
  gradients: GradientDef[];
  layers: AlphaLayer[];
}

/**
 * Generate ambient light alpha config for diagonal-circle-grid
 * Two overlapping gradients: linear right-to-left + radial from bottom-left
 *
 * Uses transparent gradients with screen blend mode for additive light mixing:
 * - Linear: bright on right, fades to transparent on left
 * - Radial: bright spot at bottom-left, fades to transparent
 *
 * Screen blend: result = 1 - (1-a)(1-b), so lights add together naturally.
 * Black base ensures we start from dark, then lights add on top.
 *
 * The radial gradient uses userSpaceOnUse with pixel values to ensure
 * a circular (not elliptical) gradient regardless of viewport aspect ratio.
 */
function generateAmbientLightAlpha(): AlphaConfig {
  // For circular radial gradient, we need pixel coordinates
  // Bottom-left center: 10% from left = 128px, 90% from top = 648px
  // Radius: large enough to cover screen diagonal (~1470px), use 1200px
  const cx = Math.round(GRID_WIDTH * 0.1); // 128
  const cy = Math.round(GRID_HEIGHT * 0.9); // 648
  const fx = Math.round(GRID_WIDTH * 0.05); // 64
  const fy = Math.round(GRID_HEIGHT * 0.95); // 684
  const r = 1200; // Large radius to cover most of the screen

  return {
    gradients: [
      {
        // Linear gradient: full brightness on right, black on left
        // This creates a strong horizontal gradient across the screen
        id: "linearRightToLeft",
        type: "linear",
        attrs: { x1: "100%", y1: "0%", x2: "0%", y2: "0%" },
        stops: [
          { offset: "0%", color: "white", opacity: "1.0" }, // Full brightness on right
          { offset: "100%", color: "white", opacity: "0" }, // Black on left
        ],
      },
      {
        // Radial gradient: intense bright spot at bottom-left corner
        // Falls off sharply to add a localized bright area
        id: "radialBottomLeft",
        type: "radial",
        attrs: {
          gradientUnits: "userSpaceOnUse",
          cx: `${cx}`,
          cy: `${cy}`,
          r: `${r}`,
          fx: `${fx}`,
          fy: `${fy}`,
        },
        stops: [
          { offset: "0%", color: "white", opacity: "1.0" }, // Full brightness at center
          { offset: "25%", color: "white", opacity: "0.6" }, // Quick falloff
          { offset: "60%", color: "white", opacity: "0.1" }, // Almost dark
          { offset: "100%", color: "white", opacity: "0" }, // Black at edge
        ],
      },
    ],
    layers: [
      // Start with black base (no light = 0% reflection)
      { fill: "black" },
      // Add lights with screen blend (additive mixing)
      // Screen blend: result = 1 - (1-a)(1-b), so lights add together
      { fill: "url(#linearRightToLeft)", blendMode: "screen" },
      { fill: "url(#radialBottomLeft)", blendMode: "screen" },
    ],
  };
}

// ============================================================
// SVG Assembly
// ============================================================

function formatGradientDef(gradient: GradientDef): string {
  const tag = gradient.type === "linear" ? "linearGradient" : "radialGradient";
  const attrs = Object.entries(gradient.attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ");
  const stops = gradient.stops
    .map((s) => {
      const opacityAttr = s.opacity ? ` stop-opacity="${s.opacity}"` : "";
      return `      <stop offset="${s.offset}" stop-color="${s.color}"${opacityAttr}/>`;
    })
    .join("\n");

  return `    <${tag} id="${gradient.id}" ${attrs}>
${stops}
    </${tag}>`;
}

function formatAlphaLayer(
  layer: AlphaLayer,
  width: number,
  height: number
): string {
  const style = layer.blendMode
    ? ` style="mix-blend-mode: ${layer.blendMode}"`
    : "";
  return `    <rect width="${width}" height="${height}" fill="${layer.fill}"${style}/>`;
}

/**
 * Generate complete source.svg content
 *
 * Structure:
 * - <defs>: Gradients + mask using MSDF pattern
 * - <g id="msdf">: Hidden, for extraction to msdf-mask.svg
 * - <g id="alpha">: Hidden, for extraction to alpha-grads.svg
 * - <g id="preview">: Visual preview showing gradients masked by pattern
 */
function generateSourceSvg(config: ShapeConfig): string {
  const { width, height, msdfPath, alpha } = config;

  const parts: string[] = [];
  const hasAlpha = alpha && alpha.layers.length > 0;
  const hasBothMsdfAndAlpha = msdfPath && hasAlpha;

  // SVG header
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">`
  );

  // Comment header
  parts.push(`  <!--`);
  parts.push(`    Source SVG for ${config.name} shape.`);
  parts.push(`    Generated by generateShapeSources.ts`);
  if (hasBothMsdfAndAlpha) {
    parts.push(`    `);
    parts.push(`    Visual preview shows gradients within pattern boundaries.`);
    parts.push(`    The msdf and alpha groups are hidden but extractable.`);
  }
  parts.push(`  -->`);

  // Defs section (gradients + pattern mask for visual preview)
  parts.push("");
  parts.push("  <defs>");

  // Add gradients
  if (alpha && alpha.gradients.length > 0) {
    for (const gradient of alpha.gradients) {
      parts.push(formatGradientDef(gradient));
    }
  }

  // Add pattern mask for visual preview (only if we have both msdf and alpha)
  if (hasBothMsdfAndAlpha) {
    parts.push("    <!-- Mask using MSDF pattern for visual preview -->");
    parts.push('    <mask id="patternMask">');
    parts.push(
      `      <rect width="${width}" height="${height}" fill="black"/>`
    );
    parts.push(`      <path d="${msdfPath}" fill="white"/>`);
    parts.push("    </mask>");
  }

  parts.push("  </defs>");

  // MSDF group (hidden for extraction only)
  parts.push("");
  parts.push(
    "  <!-- MSDF group: shape mask for distance field (hidden, for extraction) -->"
  );
  if (msdfPath) {
    // Hide if we have alpha preview, otherwise show
    const hideStyle = hasBothMsdfAndAlpha ? ' style="display: none"' : "";
    parts.push(`  <g id="msdf"${hideStyle}>`);
    parts.push(`    <path d="${msdfPath}" fill="black"/>`);
    parts.push("  </g>");
  } else {
    parts.push('  <g id="msdf">');
    parts.push("    <!-- No MSDF mask for this shape -->");
    parts.push("  </g>");
  }

  // Alpha group (hidden for extraction only)
  parts.push("");
  if (hasAlpha) {
    // Hide if we have msdf preview, otherwise show
    const hideStyle = hasBothMsdfAndAlpha ? ' style="display: none"' : "";
    parts.push(
      "  <!-- Alpha group: gradient overlays (hidden, for extraction) -->"
    );
    parts.push(`  <g id="alpha"${hideStyle}>`);
    for (const layer of alpha.layers) {
      parts.push(formatAlphaLayer(layer, width, height));
    }
    parts.push("  </g>");
  } else {
    parts.push("  <!-- No alpha gradients for this shape -->");
    parts.push('  <g id="alpha"></g>');
  }

  // Visual preview: gradients masked by pattern (only if we have both)
  if (hasBothMsdfAndAlpha) {
    parts.push("");
    parts.push(
      "  <!-- Visual preview: gradients visible within pattern boundaries -->"
    );
    parts.push('  <g id="preview" mask="url(#patternMask)">');
    for (const layer of alpha!.layers) {
      parts.push(formatAlphaLayer(layer, width, height));
    }
    parts.push("  </g>");
  }

  parts.push("</svg>");
  parts.push("");

  return parts.join("\n");
}

// ============================================================
// Shape Configuration
// ============================================================

interface ShapeConfig {
  name: string;
  width: number;
  height: number;
  msdfPath?: string;
  alpha?: AlphaConfig;
}

/**
 * Build all shape configurations
 */
function buildShapeConfigs(): ShapeConfig[] {
  return [
    {
      name: "circle",
      width: 256,
      height: 256,
      msdfPath: generateCirclePath(256, 256),
    },
    {
      name: "rectangle",
      width: 256,
      height: 256,
      msdfPath: generateRectanglePath(256, 256),
    },
    {
      name: "triangle",
      width: 256,
      height: 256,
      msdfPath: generateTrianglePath(256, 256),
    },
    {
      name: "circle-grid",
      width: GRID_WIDTH,
      height: GRID_HEIGHT,
      msdfPath: generateCircleGridPath(),
    },
    {
      name: "diagonal-circle-grid",
      width: GRID_WIDTH,
      height: GRID_HEIGHT,
      msdfPath: generateDiagonalCircleGridPath(),
      alpha: generateAmbientLightAlpha(),
    },
  ];
}

// ============================================================
// Main
// ============================================================

async function main(): Promise<void> {
  console.log("Shape Source Generator\n");
  console.log(
    "Generates source.svg files with MSDF patterns and alpha gradients.\n"
  );

  // Ensure output directory exists
  if (!fs.existsSync(SHAPES_DIR)) {
    fs.mkdirSync(SHAPES_DIR, { recursive: true });
  }

  const shapes = buildShapeConfigs();

  for (const shape of shapes) {
    const shapeDir = path.join(SHAPES_DIR, shape.name);

    // Ensure shape directory exists
    if (!fs.existsSync(shapeDir)) {
      fs.mkdirSync(shapeDir, { recursive: true });
    }

    // Generate source.svg
    const svgContent = generateSourceSvg(shape);
    const outputPath = path.join(shapeDir, "source.svg");

    fs.writeFileSync(outputPath, svgContent);
    console.log(`Generated: ${shape.name}/source.svg`);

    const features: string[] = [];
    if (shape.msdfPath) features.push("msdf");
    if (shape.alpha)
      features.push(`alpha (${shape.alpha.gradients.length} gradients)`);
    console.log(`  Features: ${features.join(", ") || "none"}`);
  }

  console.log("\nDone! Run buildShapeTextures.ts to generate PNG files.");
}

main().catch(console.error);
