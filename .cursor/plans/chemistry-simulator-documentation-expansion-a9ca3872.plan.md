<!-- a9ca3872-f4e1-4085-9272-fa1a04f0f1c5 1112f5d1-d112-46f9-83e0-d8795948a64a -->
# Phase 0: Foundation Setup - Implementation Plan (Bevy + Devcontainer)

## Overview

Set up the Bevy project from scratch with devcontainer support. Code development, testing, and scene editing all happen in the container using Rust and Bevy's native ECS architecture. Bevy's text-based scene format (.scn.ron) makes it fully devcontainer-friendly.

## Bevy Advantages for This Project

- **Native ECS:** Built-in Entity Component System (no need for DOTS)
- **Text-Based Scenes:** `.scn.ron` files can be edited in container
- **Rust Performance:** Zero-cost abstractions, no GC
- **Devcontainer-Friendly:** Full development in container possible
- **Hot Reloading:** Fast iteration during development

## Step 0: Update Documentation

### 0.1 Identify Unity References

- Scan documentation for Unity-specific references
- Files to update:
  - `docs/07_Implementation_Architecture.md` (Unity → Bevy)
  - `docs/09_Demo_Specification.md` (if Unity-specific)
  - `docs/10_Demo_TDD_Plan.md` (Unity Test Framework → Rust tests)
  - `docs/12_Demo_Build_Plan.md` (Unity → Bevy)
  - Any other files with Unity references

### 0.2 Update Documentation

- Replace Unity ECS/DOTS references with Bevy ECS
- Replace C# code examples with Rust
- Replace Unity-specific concepts with Bevy equivalents
- Update build/test instructions
- Keep core architecture concepts (ECS, components, systems)

## Step 1: Devcontainer Setup

### 1.1 Create Devcontainer Configuration

- Create `.devcontainer/` folder
- Create `devcontainer.json` with:
  - Rust toolchain (latest stable)
  - Cargo package manager
  - VS Code extensions:
    - rust-analyzer (Rust language server)
    - CodeLLDB (Rust debugging)
    - Bevy snippets (if available)
  - Git configuration

### 1.2 Devcontainer Features

- **Code Development:** Full Rust editing with rust-analyzer
- **Testing:** Run Rust tests with `cargo test`
- **Build:** Build Bevy project with `cargo build`
- **Scene Editing:** Edit `.scn.ron` files directly (text-based)
- **Hot Reloading:** Bevy's hot reloading works in container

### 1.3 No Limitations

- ✅ All development can happen in container
- ✅ Scene editing via text files
- ✅ No need for GUI editor on host
- ✅ Full devcontainer workflow

## Step 2: Bevy Project Setup

### 2.1 Initialize Bevy Project

- Run `cargo new chem-game --bin`
- Add Bevy dependency to `Cargo.toml`
- Configure Bevy features (2D, default plugins)
- Set up project structure

### 2.2 Cargo.toml Configuration

```toml
[package]
name = "chem-game"
version = "0.1.0"
edition = "2021"

[dependencies]
bevy = { version = "0.12", features = ["default", "bevy_2d"] }
```

### 2.3 Project Structure

```
chem-game/
  src/
    main.rs
    core/
      components.rs
      systems.rs
      resources.rs
    chemistry/
    physics/
    visualization/
  tests/
    integration/
  assets/
    scenes/
    sprites/
    fonts/
  .devcontainer/
  Cargo.toml
```

## Step 3: Bevy ECS Setup

### 3.1 Component Definitions (Rust)

**File:** `src/core/components.rs`

- ContainerNode component (struct with `#[derive(Component)]`)
- LayerEntity component
- RadialNode component
- SolidObject component
- All using Bevy's Component derive macro

### 3.2 System Definitions (Rust)

**File:** `src/core/systems.rs`

- Systems as functions with `Query` parameters
- Use Bevy's System trait
- System scheduling and ordering

### 3.3 Resource Definitions

**File:** `src/core/resources.rs`

- Global resources (Grid, DebugData, etc.)
- Use Bevy's Resource derive macro

## Step 4: Core Infrastructure - Debug View

### 4.1 Debug View Component

**File:** `src/core/components.rs`

- DebugView component
- UI entity tracking

### 4.2 Debug View System

**File:** `src/core/systems/debug_view.rs`

- Query ECS data
- Format debug information
- Update UI text

### 4.3 Debug View UI

**File:** `src/core/ui/debug_view.rs`

- Bevy UI (egui or built-in UI)
- Collapsible panel
- Scrollable text area
- Toggle button

## Step 5: Grid System

### 5.1 Grid Resource

**File:** `src/core/resources.rs`

- Grid resource with cell size, origin, bounds

### 5.2 Grid System

**File:** `src/core/systems/grid.rs`

- Snap position to grid
- Calculate grid cell from world position
- Visual grid rendering (using Bevy's 2D primitives)

### 5.3 Grid Visualizer

**File:** `src/core/visualization/grid.rs`

- Draw grid lines using Bevy's Line2d or sprites
- Update system for grid rendering

## Step 6: Input System

### 6.1 Input Resource

**File:** `src/core/resources.rs`

- InputState resource
- Mouse position, button states, drag state

### 6.2 Input System

**File:** `src/core/systems/input.rs`

- Read Bevy's Input system
- Update mouse position
- Handle click/drag
- Detect drag start/end
- Raycast for entity selection (Bevy's camera system)

### 6.3 Drag & Drop System

**File:** `src/core/systems/drag_drop.rs`

- Track dragged entity
- Update position during drag
- Handle drop
- Validate drop target

## Step 7: Basic Rendering Pipeline

### 7.1 Render Component

**File:** `src/core/components.rs`

- Renderable component (Transform, Sprite, Color)
- Use Bevy's built-in components

### 7.2 Render System

**File:** `src/core/systems/render.rs`

- Bevy handles rendering automatically
- Systems can update Transform, Sprite, Color components
- Rendering order via z-index or layers

## Step 8: Testing Framework Setup

### 8.1 Rust Test Structure

```
tests/
  integration/
    core/
    chemistry/
    physics/
src/
  core/
    components.rs (unit tests inline)
    systems.rs (unit tests inline)
```

### 8.2 Test Setup

- Use Rust's built-in `#[test]` framework
- Bevy test utilities for ECS testing
- Integration tests in `tests/` directory
- Unit tests inline with code

### 8.3 Sample Test

**File:** `tests/integration/core/grid_test.rs`

- Test grid snapping
- Test grid cell calculation
- Use Bevy's test utilities

## Step 9: Scene Setup

### 9.1 Demo Scene

**File:** `assets/scenes/demo.scn.ron`

- Text-based Bevy scene file
- Camera setup
- Canvas/UI setup
- Grid entity
- Can be edited directly in container

### 9.2 Scene Loading

**File:** `src/main.rs`

- Load scene in Bevy app
- Or create entities programmatically

### 9.3 Scene Hierarchy (Text-Based)

```ron
(
  entities: [
    (
      id: 0,
      components: {
        "bevy_transform::components::transform::Transform": (
          translation: (0.0, 0.0, 0.0),
          rotation: (0.0, 0.0, 0.0, 1.0),
          scale: (1.0, 1.0, 1.0),
        ),
        "bevy_core::name::Name": "Main Camera",
      },
    ),
  ],
)
```

## Step 10: Initial Build & Validation

### 10.1 Build Verification (Devcontainer)

- Run `cargo build` in container
- Verify code compiles without errors
- Check for warnings

### 10.2 Test Verification

- Run `cargo test` in container
- All tests pass
- Verify test framework works

### 10.3 Run Application

- Run `cargo run` in container (if display available)
- Or build and run on host
- Verify application starts
- Check debug view
- Verify grid renders
- Test input handling

## Deliverables Checklist

- [ ] Documentation updated (Unity → Bevy)
- [ ] Devcontainer configured and working
- [ ] Bevy project initialized
- [ ] Cargo.toml configured with Bevy
- [ ] Folder structure created
- [ ] ECS components defined (Rust)
- [ ] ECS systems defined (Rust)
- [ ] Debug view functional (empty but displays)
- [ ] Grid system working
- [ ] Input system detects mouse
- [ ] Basic rendering pipeline
- [ ] Test framework set up (Rust tests)
- [ ] Sample test passes
- [ ] Scene configured (.scn.ron file)
- [ ] Project builds successfully
- [ ] Application runs

## Success Criteria

✅ Documentation updated to reflect Bevy

✅ Devcontainer opens and works

✅ Code can be edited, tested, and built in container

✅ Bevy project structure exists

✅ Project builds with `cargo build`

✅ Tests run with `cargo test`

✅ Application runs with `cargo run`

✅ Debug view displays (can be empty initially)

✅ Grid visible in scene

✅ Mouse input works (logged to console)

✅ No errors in console

✅ Scene files can be edited as text

## Key Differences from Unity Plan

### Language & Tools

- **Unity/C#** → **Bevy/Rust**
- **Unity Package Manager** → **Cargo**
- **Unity Test Framework** → **Rust built-in tests**
- **Unity Editor** → **Text-based scenes (.scn.ron)**

### ECS Architecture

- **Unity DOTS** → **Bevy ECS** (native, no separate package)
- **IComponentData** → **#[derive(Component)]**
- **SystemBase** → **System functions with Query**
- **BlobAssetReference** → **Bevy's built-in resource system**

### Scene Management

- **Unity .unity files** → **Bevy .scn.ron files** (text-based, editable in container)
- **Unity Editor GUI** → **Text editor** (fully devcontainer-friendly)

## Next Steps

After Phase 0 completion:

- Proceed to Phase 1: Container System
- Or validate with POC 1: Container System (see [11_Demo_POC_Plan.md](docs/11_Demo_POC_Plan.md))

### To-dos

- [ ] Create docs/ directory structure for organizing specification documents
- [ ] Create 00_Index.md with navigation and cross-reference system
- [ ] Write 01_Simulation_Topology.md with detailed container graph and layer architecture
- [ ] Write 02_Physics_Engine.md with thermodynamics, hydrostatics, and transport algorithms
- [ ] Write 03_Chemistry_Engine.md with reaction system, kinetics, and surface chemistry
- [ ] Write 04_Surface_Physics.md with dynamic thickness, wetting, and solidification mechanics
- [ ] Write 05_Knowledge_Analysis.md with fog of war, propagation, and tool implementations
- [ ] Write 06_Visualization.md with macro/micro rendering systems and boid mechanics
- [ ] Write 07_Implementation_Architecture.md with ECS/DOTS structure and Unity integration
- [ ] Create Unity 2023+ project with 2D template
- [ ] Install ECS/DOTS packages (Entities, Collections, Mathematics, Burst, Jobs) and Test Framework
- [ ] Create folder structure (Scripts/Core, Tests, Scenes, etc.)
- [ ] Implement debug view system (MonoBehaviour component, UI, data collection)
- [ ] Implement grid system (snapping, visualization)
- [ ] Implement input system (mouse tracking, drag & drop basics)
- [ ] Implement basic rendering pipeline (sprite rendering)
- [ ] Set up testing framework (assembly definitions, sample test)
- [ ] Create demo scene with camera, canvas, grid, and basic setup
- [ ] Build project, verify all systems work, run tests
- [ ] Create folder structure (Scripts/Core, Tests, Scenes, etc.)
- [ ] Implement debug view system (MonoBehaviour component, UI, data collection)
- [ ] Implement grid system (snapping, visualization)
- [ ] Implement input system (mouse tracking, drag & drop basics)
- [ ] Implement basic rendering pipeline (sprite rendering)
- [ ] Set up testing framework (assembly definitions, sample test)
- [ ] Create demo scene with camera, canvas, grid, and basic setup
- [ ] Build project, verify all systems work, run tests
