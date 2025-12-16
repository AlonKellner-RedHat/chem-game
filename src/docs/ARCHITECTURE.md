# Architecture Document

This document describes the architecture of the Phaser 4 + WebGPU implementation.

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Application                              │
├─────────────────────────────────────────────────────────────────┤
│  Demos (EmptyDemo, InteractivityDemo, SpectralDemo, etc.)       │
├─────────────────────────────────────────────────────────────────┤
│  Scenes (GameScene, MenuScene)                                  │
├───────────────────┬───────────────────┬─────────────────────────┤
│      Physics      │     Rendering     │          UI             │
│   (Core Math)     │ (WebGPU + Phaser) │    (Components)         │
├───────────────────┴───────────────────┴─────────────────────────┤
│                    Platform (Phaser 4 + WebGPU)                 │
└─────────────────────────────────────────────────────────────────┘
```

## 2. Physics Module

### 2.1 Design Principles

- **Platform-agnostic**: No dependencies on Phaser or WebGPU
- **Single source of truth**: Same formulas for GPU and CPU
- **Configurable paths**: Resolution/format can differ

### 2.2 Module Structure

```
core/physics/
├── constants.ts         # Physical constants (PLANCK, BOLTZMANN, etc.)
├── config.ts            # SpectralPhysicsConfig types and defaults
├── planck.ts            # Planck's law implementation
├── kirchhoff.ts         # Kirchhoff emission
├── cie.ts               # CIE XYZ color matching functions
├── backgrounds.ts       # Background mode calculations
├── integration.ts       # Spectrum to XYZ integration
├── srgb.ts              # XYZ to sRGB conversion
└── index.ts             # Public API (SpectralPhysicsEngine)
```

### 2.3 Configuration System

```typescript
// Shared config applies to both paths
const shared: SharedPhysicsConfig = {
  wavelengthMin: 200,
  wavelengthMax: 1000,
  visibleMin: 380,
  visibleMax: 700,
  draperPoint: 798,
  d65ReferenceTemp: 6500,
  enableEmission: true,
  enableScattering: false,
  backgroundMode: 'normal',
};

// Path-specific overrides
const config: SpectralPhysicsConfig = {
  shared,
  render: { spectralResolution: 16, outputMode: 'rgb' },
  plot: { spectralResolution: 320, outputMode: 'spectrum' },
};
```

## 3. Rendering Module

### 3.1 WebGPU Pipeline

```
┌──────────────────────────────────────────────────────────────┐
│                    WebGPU Compute Pipeline                    │
├──────────────────────────────────────────────────────────────┤
│  Input Buffers:                                               │
│  - Material textures (transmission spectra)                   │
│  - CIE color matching functions (x̄, ȳ, z̄)                    │
│  - D65 illuminant spectrum                                    │
│  - Shape geometry (positions, sizes)                          │
│  - Per-shape properties (temperature, concentrations)         │
├──────────────────────────────────────────────────────────────┤
│  Compute Shader (SpectralCompute.wgsl):                       │
│  - For each pixel:                                            │
│    1. Determine which shapes contain pixel                    │
│    2. Calculate transmission at each wavelength               │
│    3. Apply Kirchhoff emission if temp > Draper point         │
│    4. Integrate to XYZ using CIE functions                    │
│    5. Convert XYZ to linear RGB                               │
├──────────────────────────────────────────────────────────────┤
│  Output Buffers:                                              │
│  - RGB texture (for display)                                  │
│  - Spectrum buffer (for plotting, optional)                   │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Phaser 4 Integration

```typescript
// PhaserBridge connects WebGPU output to Phaser 4 display
class PhaserBridge {
  private gpuTexture: GPUTexture;
  private phaserTexture: Phaser.Textures.Texture;

  // Copy GPU render result to Phaser texture
  async sync(): Promise<void> {
    // Read from GPU texture
    // Update Phaser texture
  }
}
```

### 3.3 Spectrum Sampling

For plotting, the compute shader can output full spectrum at a specific pixel:

```wgsl
// Dual output mode
@group(0) @binding(0) var<storage, read_write> rgbOutput: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> spectrumOutput: array<f32>;
@group(0) @binding(2) var<uniform> samplePoint: vec2<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  // Normal RGB output for all pixels
  let rgb = computeRGB(id.xy);
  rgbOutput[id.x + id.y * width] = vec4(rgb, 1.0);

  // If this is the sample point, output full spectrum
  if (id.xy == samplePoint) {
    for (var i = 0u; i < spectralResolution; i++) {
      let wavelength = wavelengthMin + f32(i) * wavelengthStep;
      spectrumOutput[i] = computeSpectrumValue(wavelength);
    }
  }
}
```

## 4. UI Module

### 4.1 Component Hierarchy

```
ControlPanel
├── TitleBar
└── SliderGroup
    ├── SliderComponent (concentration)
    ├── SliderComponent (concentration)
    └── SliderComponent (temperature)

SpectralGraph
├── RainbowBand
├── GraphCanvas
├── AxisLabels
└── LockIndicator

ToggleButton
└── (self-contained)
```

### 4.2 State Management

UI components use a reactive pattern:

```typescript
interface UIState<T> {
  value: T;
  subscribe(callback: (value: T) => void): () => void;
  set(value: T): void;
}

// Usage
const temperature = createState(300);
temperature.subscribe((t) => renderer.setTemperature(shapeId, t));
slider.bind(temperature);
```

## 5. Demo Structure

### 5.1 Demo Interface

```typescript
interface Demo {
  readonly name: string;
  readonly description?: string;

  initialize(scene: GameScene): void;
  update?(scene: GameScene): void;
  cleanup(scene: GameScene): void;
  reset?(scene: GameScene): void;
}
```

### 5.2 SpectralDemo Configuration

Instead of separate SpectralDemo and AdvancedSpectralDemo, use single configurable demo:

```typescript
interface SpectralDemoConfig {
  shapes: ShapeConfig[];
  enableDarkMode: boolean;
  enableUVMode: boolean;
  enableEmission: boolean;
}

const basicConfig: SpectralDemoConfig = {
  shapes: [waterSquare, crystalCircle, gasTriangle],
  enableDarkMode: false,
  enableUVMode: true,
  enableEmission: false,
};

const advancedConfig: SpectralDemoConfig = {
  shapes: [waterSquare, crystalCircle, gasTriangle],
  enableDarkMode: true,
  enableUVMode: true,
  enableEmission: true,
};
```

## 6. Testing Strategy

### 6.1 Unit Tests

- Physics functions (Planck, Kirchhoff, CIE)
- Color conversion (XYZ to sRGB)
- Background mode calculations

### 6.2 Integration Tests

- GPU/CPU parity (same inputs → same outputs)
- Emission consistency (plot matches render)
- State management (UI → renderer sync)

### 6.3 Visual Regression Tests

- Screenshot comparison between P3 and P4
- Key test cases:
  - Pure background (no shapes)
  - Single shape at various temperatures
  - Overlapping shapes
  - All background modes

## 7. Migration Path

### Phase 1: Core Physics (No Rendering)
- Implement all physics in TypeScript
- Port existing tests
- Verify numerical accuracy

### Phase 2: WebGPU Compute
- Create WGSL shader with same physics
- Verify GPU matches CPU output
- Implement spectrum readback

### Phase 3: Phaser 4 Integration
- Connect WebGPU to Phaser 4 display
- Implement scene management
- Port UI components

### Phase 4: Demo Migration
- Port each demo in complexity order
- Verify visual parity
- Run full test suite

### Phase 5: Cleanup
- Remove unused code
- Document differences
- Performance optimization
