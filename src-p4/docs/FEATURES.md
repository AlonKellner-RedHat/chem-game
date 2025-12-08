# Feature Requirements Document

This document specifies all effective features from the Phaser 3 demos that must be implemented in the Phaser 4 + WebGPU version.

## 1. AdvancedSpectralDemo (Primary Demo)

### 1.1 Shapes and Materials

| Shape | Material | Description |
|-------|----------|-------------|
| Square | Water | Blue-tinted, absorbs red/IR wavelengths |
| Circle | Crystal | Purple/violet tint, absorbs green wavelengths |
| Triangle | Gas | Yellowish tint, complex absorption bands |

### 1.2 Per-Shape Controls

Each shape has a control panel with:

#### Molecule Concentration Sliders
- **Range**: 0.0001 M to 1.0 M (logarithmic scale)
- **Molecules per material**:
  - Water: CopperSulfate, MethyleneBlue
  - Crystal: PotassiumPermanganate, ChromiumIon
  - Gas: IronTitaniumIon, ManganeseIon

#### Temperature Slider
- **Range**: 300K to 6500K (logarithmic scale)
- **Effect**: Controls black body emission (visible above Draper point ~798K)

### 1.3 Background Modes

| Mode | Description | Implementation |
|------|-------------|----------------|
| Normal | D65 white light illumination | Uniform 1.0 in visible (380-700nm), fades in UV/IR |
| UV Mode | UV illumination (200-400nm peak) | Peak at 250-350nm, decays to 0 at 450nm |
| Dark Mode | No illumination (emission only) | Zero background, only shows thermal emission |

### 1.4 Spectral Display

- **Graph Type**: Line graph showing transmission/emission vs wavelength
- **X-axis**: Wavelength (200-1000nm, adjustable via range slider)
- **Y-axis**: Intensity (0-100%, normalized to baseline)
- **Rainbow Band**: Color visualization above graph
- **Lock Feature**: Click to lock display to specific position

### 1.5 Grid System

- **Cell Size**: 50 pixels (configurable via Grid class)
- **Line Intensity**: 60% of background (grid lines appear darker)
- **Purpose**: Visual reference and consistent rendering

### 1.6 Rendering Pipeline

1. **GPU Path** (preferred):
   - WebGL shader integrates spectrum to XYZ
   - Converts XYZ to sRGB with gamma correction
   - Two-pass: color calculation + adaptive normalization

2. **CPU Path** (fallback):
   - PixelLayerRenderer calculates per-pixel
   - Slower but guaranteed to work

---

## 2. SpectralDemo (Subset)

Same as AdvancedSpectralDemo but:
- No Dark Mode toggle
- Simpler state management

**Note**: In Phaser 4 implementation, merge into single configurable demo.

---

## 3. InteractivityDemo

### 3.1 Object System

- **Objects**: Shapes that can be picked up and placed
- **Grid Snapping**: Objects snap to grid cells
- **Interactions**: Objects can interact when placed adjacent

### 3.2 Connection Rules

| Rule | Description |
|------|-------------|
| TopBottomEdgeRule | Objects connect when vertically adjacent |
| UpsideDownTriangleRule | Special triangle orientation handling |

### 3.3 Object Types

- GreenSquare, MagentaSquare, RedCircle, BlueTriangle, YellowRectangle, BlackSquare

---

## 4. EmptyDemo

Minimal placeholder demo with no objects. Used for testing scene lifecycle.

---

## 5. GPUDemo (Diagnostic)

Multiple rendering modes for debugging GPU pipeline:
- Mode 1: Baseline (canvas test pattern)
- Mode 2: GPU setup verification
- Mode 3: GPU render to texture

**Note**: In Phaser 4, consolidate to single diagnostic mode.

---

## 6. Core Physics Requirements

### 6.1 Spectral Calculations

| Function | Formula | Reference |
|----------|---------|-----------|
| Planck's Law | B(λ,T) = (2hc²/λ⁵) × 1/(exp(hc/λkT) - 1) | Black body radiation |
| Kirchhoff Emission | E(λ) = (1 - T(λ)) × B(λ,T) | Material emission |
| CIE XYZ Integration | X,Y,Z = ∫ S(λ) × x̄,ȳ,z̄(λ) dλ | Color perception |
| sRGB Conversion | Matrix transform + gamma | Display color |

### 6.2 Physical Constants

| Constant | Value | Description |
|----------|-------|-------------|
| DRAPER_POINT | 798 K | Visible emission threshold |
| D65_REFERENCE | 6500 K | Daylight white point |
| PLANCK | 6.62607015e-34 J·s | Planck constant |
| BOLTZMANN | 1.380649e-23 J/K | Boltzmann constant |
| SPEED_OF_LIGHT | 299792458 m/s | Speed of light |

### 6.3 Wavelength Ranges

| Range | Min (nm) | Max (nm) | Usage |
|-------|----------|----------|-------|
| Full Spectrum | 200 | 1000 | Texture storage |
| Visible | 380 | 700 | Color integration |
| UV Peak | 250 | 350 | UV mode illumination |

---

## 7. Configuration Requirements

### 7.1 Shared Config (Both Paths)

```typescript
interface SharedPhysicsConfig {
  wavelengthMin: number;      // 200
  wavelengthMax: number;      // 1000
  visibleMin: number;         // 380
  visibleMax: number;         // 700
  draperPoint: number;        // 798
  d65ReferenceTemp: number;   // 6500
  enableEmission: boolean;    // true
  enableScattering: boolean;  // false
  backgroundMode: BackgroundMode;
}
```

### 7.2 Path-Specific Config

| Parameter | Render Path | Plot Path |
|-----------|-------------|-----------|
| spectralResolution | 16 samples | 320+ samples |
| outputMode | 'rgb' | 'spectrum' |
| spatialResolution | per-pixel | single point |

---

## 8. UI Component Requirements

### 8.1 SliderComponent

- Horizontal track with draggable handle
- Min/max labels
- Value display
- Logarithmic scale support
- Callback on value change

### 8.2 ToggleButton

- On/off states with visual feedback
- Label text
- Callback on toggle

### 8.3 SpectralGraph

- Line plot with configurable axes
- Rainbow color band
- Lock indicator
- Responsive to mouse position

### 8.4 ControlPanel

- Container for multiple sliders
- Title bar
- Collapsible (optional)

---

## 9. Success Criteria

1. **Visual Parity**: Rendered output matches Phaser 3 version
2. **Feature Parity**: All controls and interactions work identically
3. **Performance**: GPU rendering maintains 60fps at 1280x720
4. **Spectrum Alignment**: Plot values match rendered colors at same position



