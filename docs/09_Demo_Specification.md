# Demo Specification: 3-Stage MVP

## Overview

This document specifies the **Minimum Viable Product (MVP)** for a 3-stage interactive chemistry demo. The demo is fully interactive with no guides or menus, minimal visuals, and includes a comprehensive debug view.

## Design Principles

1. **No Guides/Menus:** Player discovers mechanics through interaction
2. **Minimal Visuals:** Basic shapes, colors, and essential feedback only
3. **Fully Interactive:** All actions are drag-and-drop or direct manipulation
4. **Debug View:** Comprehensive debugging information always visible
5. **TDD Approach:** Each stage built with tests first, then implementation

## Stage 1: The Volcano (Gas Extraction)

### Goal
Extract a balloon of CO₂ from Malachite.

### Initial State
- Empty lab bench (grid-based)
- Cabinet sidebar on left with inventory

### Inventory

#### Malachite
- **Icon:** Green pile/block
- **Formula:** Cu₂CO₃(OH)₂
- **State:** Solid
- **Mass:** 5g (default)
- **Properties:**
  - Decomposes at ~200°C
  - Produces: CuO (black), CO₂ (gas), H₂O (vapor)

#### Bunsen Burner
- **Type:** Heat source (Variable)
- **Control:** Knob (drag up/down to adjust)
- **Temperature Range:** 20°C - 1000°C
- **Visual:** Flame (color changes with intensity)

#### Flask (Erlenmeyer)
- **Type:** Standard reaction vessel
- **Capacity:** 250mL
- **Properties:**
  - Can be placed on tripod (auto-generated)
  - Accepts solid/liquid inputs
  - Can attach balloon to mouth

#### Balloon
- **Type:** Elastic gas container
- **Properties:**
  - Attaches to flask mouth
  - Expands with gas volume
  - Can be sealed and removed

### Setup Phase Actions

1. **Place Bunsen Burner**
   - Drag from cabinet to bench center
   - Snaps to grid
   - Visual: Burner appears on bench

2. **Place Flask**
   - Drag flask onto burner
   - Auto-generates tripod
   - Visual: Flask sits on tripod above burner

3. **Add Malachite**
   - Drag malachite into flask
   - Visual: Green mound appears in flask bottom
   - Debug: Shows composition (100% Malachite)

4. **Attach Balloon**
   - Drag balloon to flask mouth
   - Visual: Balloon wraps around rim, deflated

### Reaction Phase

#### Action: Heat
- Click burner knob, drag up to increase flame
- Visual feedback:
  - Flame color: Yellow (low) → Orange → Blue (high)
  - Thermometer UI on flask shows temperature

#### Temperature Progression
- **20°C:** Room temperature, no change
- **100°C:** Malachite starts heating
- **200°C:** Decomposition begins (critical point)

#### Micro View (Zoom)
- **Hover over flask:** Circular lens appears
- **Visual:**
  - **<200°C:** Green crystal lattice vibrating
  - **≥200°C:** Lattice breaks, particles fly upward
    - Gray particles: CO₂
    - Red particles: H₂O vapor
  - **Remaining:** Black lattice (CuO)

#### Macro Feedback
- Green powder → Black powder (gradual)
- Balloon inflates (volume increases)
- Balloon contents overlay:
  - Volume: 1.2L
  - Composition: 95% CO₂, 5% H₂O vapor

### Completion Phase

#### Action: Remove Balloon
- Click balloon → "Remove & Seal" option
- Balloon detaches, tied off
- Visual: Sealed balloon with gas

#### Submission
- Drag balloon to "Outbox" tray (right side of bench)
- Success message: "Captured 2g of Carbon Dioxide! Byproduct: Copper Oxide created."

### Test Requirements

**TDD Tests:**
1. Malachite decomposition at 200°C
2. CO₂ gas production
3. Balloon inflation with gas volume
4. Composition tracking (95% CO₂, 5% H₂O)
5. Balloon sealing and removal

## Stage 2: The Blue Blood (Dissolution)

### Goal
Create a Copper Sulfate solution using CuO from Stage 1.

### Initial State
- Flask with black CuO powder remains on bench
- Balloon removed
- Bunsen Burner still present

### New Inventory

#### Sulfuric Acid (H₂SO₄)
- **Icon:** Bottle with warning label
- **Concentration:** 1M (default)
- **Properties:**
  - Corrosive
  - Reacts with CuO to form CuSO₄

#### Glass Stirring Rod
- **Type:** Agitation tool
- **Properties:**
  - Increases mixing rate
  - Can be dragged to stir

### Setup Phase Actions

1. **Pour Acid**
   - Drag acid bottle over flask
   - "Pour" slider appears
   - Pour 100mL
   - Visual: Clear liquid covers black powder

### Reaction Phase

#### Passive Simulation
- Reaction is slow at room temperature
- Liquid turns faintly blue
- Mostly stays clear

#### Player Actions

**Option 1: Heat**
- Turn Bunsen Burner on (gentle heat)
- Increases reaction rate

**Option 2: Agitation**
- Drag stirring rod
- Move mouse back and forth to stir
- Increases mixing rate

#### Micro View
- **Visual:**
  - Acid molecules (protons) attack oxide wall
  - Copper atoms (Cu²⁺) ripped off wall
  - Hydration shell forms around Cu²⁺
  - Ions float freely in solution

#### Macro Feedback
- Black powder shrinks → disappears
- Liquid turns deep, transparent blue
- UI Alert: "Solution Homogeneous"

### Completion Phase

#### Submission
- Drag flask to Outbox
- Success message: "Synthesized Copper Sulfate Solution! Reaction complete."

### Test Requirements

**TDD Tests:**
1. CuO + H₂SO₄ → CuSO₄ reaction
2. Slow reaction at room temperature
3. Heat increases reaction rate
4. Agitation increases mixing
5. Solution color change (clear → blue)
6. Homogeneous solution detection

## Stage 3: The Recovery (Crystallization)

### Goal
Recover pure water and grow Copper Sulfate crystals.

### Initial State
- Flask with blue CuSO₄ solution on bench
- Bunsen Burner present

### New Inventory

#### Condenser
- **Type:** Long glass tube with cooling jacket
- **Properties:**
  - Connects to flask
  - Has "Water In" and "Water Out" connections
  - Condenses vapor to liquid

#### Collection Beaker
- **Type:** Empty glass vessel
- **Properties:**
  - Collects condensed liquid
  - Placed under condenser outlet

#### Stand & Clamps
- **Type:** Auto-generated support
- **Properties:**
  - Holds condenser in position
  - Appears when connecting complex glassware

### Setup Phase Actions

1. **Attach Condenser**
   - Drag condenser to top of flask
   - Snaps into diagonal position
   - Auto-generates stand & clamps

2. **Place Collection Beaker**
   - Drag beaker under condenser outlet
   - Snaps into position

3. **Connect Cooling Water**
   - Pipe tool: Connect "Water In" and "Water Out"
   - Visual: Blue lines to tap (abstracted)

### Reaction Phase

#### Action: Boil
- Turn Bunsen Burner to "High"
- Blue liquid bubbles
- Steam rises into condenser

#### Condensation
- Steam turns into clear droplets
- Drops into collection beaker

#### Micro View (Flask)
- **Visual:**
  - Water molecules (blue/white) fly out
  - CuSO₄ ions (large blue crystals) stay behind
  - Ions get crowded as water evaporates

#### Critical Moment: Supersaturation
- As water level drops, solution becomes supersaturated
- **Visual:** Jagged blue crystals form on flask walls
- **Challenge:** Stop heat before crystals burn (turn brown/anhydrous)

### Completion Phase

#### Action: Turn Off Heat
- Click burner knob, drag down

#### Result
- **Beaker A:** Pure Water (clear liquid)
- **Flask B:** Large blue crystals (CuSO₄·5H₂O)

#### Submission
- Submit both containers to Outbox
- Success message: "Separation Complete. Purity: 99.8%."

### Test Requirements

**TDD Tests:**
1. Water evaporation from solution
2. Vapor condensation in condenser
3. Supersaturation detection
4. Crystal nucleation on walls
5. Crystal growth
6. Anhydrous conversion at high temperature
7. Purity calculation (99.8%)

## Visual Design: Minimal Aesthetics

### Color Palette
- **Background:** Dark gray (#2a2a2a)
- **Grid:** Light gray lines (#444444)
- **Glassware:** White outline, slight transparency
- **Liquids:** Solid colors (blue, clear, etc.)
- **Solids:** Solid colors (green, black, etc.)
- **Flame:** Yellow → Orange → Blue gradient

### Shapes
- **Containers:** Simple geometric shapes (cylinders, cones)
- **Solids:** Mounds/piles (colored circles/ellipses)
- **Liquids:** Filled containers (colored rectangles)
- **Boids:** Small colored circles
- **Crystals:** Jagged polygons

### UI Elements
- **Thermometer:** Simple bar with number
- **Composition Overlay:** Text list
- **Debug Panel:** Always visible, collapsible

## Debug View Specification

### Always Visible Panel
- **Location:** Top-right corner (collapsible)
- **Size:** 400px × 600px (scrollable)

### Debug Information

#### Container State
```
Container: Flask_001
  Temperature: 250.5°C
  Pressure: 101.3 kPa
  Liquid Level: 150mL / 250mL
  Layers: 2
    Layer 0: Solid (CuO) - 2.3g
    Layer 1: Gas (CO₂, H₂O) - 1.2L
```

#### Node States (5-Node Structure)
```
N_IB (Inner Bulk):
  Temperature: 250.5°C
  Composition: 95% CO₂, 5% H₂O
  Volume: 1.2L

N_IS (Inner Surface):
  Thickness: 52μm
  Residue: None

N_Mat (Material):
  Temperature: 245.0°C
  Thickness: 2mm

N_OS (Outer Surface):
  Soot: 0%

N_OB (Outer Bulk):
  Environment: Air
  Temperature: 20°C
```

#### Reaction Status
```
Active Reactions:
  [1] Malachite Decomposition
      Rate: 0.05 mol/s
      Progress: 85%
      Products: CuO, CO₂, H₂O
```

#### Physics State
```
Heat Flow: 125 W (N_OB → N_IB)
Convection: Active (Ra = 2500)
Mixing Rate: 0.02 1/s
Mixing Factor: 1.5
```

#### Chemistry State
```
Composition:
  Cu₂CO₃(OH)₂: 0.5g (10%)
  CuO: 3.5g (70%)
  CO₂: 1.2L (20%)

Purity: 70% (Unrefined)
```

#### Performance Metrics
```
FPS: 60
Physics Time: 2.3ms
Chemistry Time: 1.1ms
Render Time: 4.2ms
Entities: 45
```

### Debug Controls
- **Pause:** Pause simulation
- **Step:** Advance one frame
- **Reset:** Reset to initial state
- **Export State:** Export current state to JSON

## Interaction Mechanics

### Drag and Drop
- **From Cabinet:** Drag items to bench
- **Between Containers:** Drag items between containers
- **To Outbox:** Submit completed items

### Direct Manipulation
- **Burner Knob:** Click and drag up/down
- **Pour Slider:** Drag to pour amount
- **Stirring Rod:** Click and drag to stir

### Hover Interactions
- **Micro View:** Hover over container to see zoom
- **Tooltips:** Hover over items for info
- **Debug Highlight:** Hover over container to highlight in debug panel

## Technical Requirements

### Performance Targets
- **60 FPS:** Maintained throughout demo
- **Frame Time:** < 16.67ms per frame
- **Physics:** < 5ms
- **Chemistry:** < 3ms
- **Rendering:** < 8ms

### Platform
- **Phaser 3** (2D game framework)
- **TypeScript** for type safety and development
- **Vite** for build tooling and development server

### Input System
- **Mouse:** Primary input
- **Keyboard:** Debug shortcuts only
- **Touch:** Not required for MVP

## Success Criteria

### Stage 1
- ✅ Malachite decomposes at 200°C
- ✅ CO₂ gas collected in balloon
- ✅ Balloon inflates correctly
- ✅ Composition tracked accurately

### Stage 2
- ✅ CuO dissolves in acid
- ✅ Solution turns blue
- ✅ Heat/agitation affects reaction rate
- ✅ Homogeneous solution achieved

### Stage 3
- ✅ Water evaporates from solution
- ✅ Vapor condenses in condenser
- ✅ Crystals form on supersaturation
- ✅ Pure water and crystals separated
- ✅ Purity > 99%

## Next Steps

See:
- [10_Demo_TDD_Plan.md](10_Demo_TDD_Plan.md) - Test-driven development plan
- [11_Demo_POC_Plan.md](11_Demo_POC_Plan.md) - Proof of concept prototypes
- [12_Demo_Build_Plan.md](12_Demo_Build_Plan.md) - Incremental build plan
