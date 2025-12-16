<!-- 452e1837-7549-4969-b7b5-8045d431e9c2 9d49dc48-9048-4d52-b418-6c6d65fff1c4 -->
# Phase 1: Container System - Implementation Plan

## Overview

Implement the container system that allows creating, placing, and managing containers with composition tracking. This phase focuses on basic container entities, composition data structures, and visual representation.

## Step 1: Composition System Foundation

### 1.1 Chemical Definitions

**File:** `src/chemistry/mod.rs`

- Create chemistry module structure
- Define `ChemicalId` type (u32)
- Define chemical constants (MALACHITE_ID, CO2_ID, H2O_ID, CUO_ID, etc.)

**File:** `src/chemistry/chemicals.rs`

- Define `Chemical` struct with properties (name, formula, molar_mass, state)
- Create chemical registry/constants
- Implement helper functions for chemical lookup

### 1.2 Composition Data Structure

**File:** `src/chemistry/composition.rs`

- Define `CompositionData` struct (Asset type)
- `chemicals: Vec<ChemicalEntry>` where `ChemicalEntry` contains `chemical_id: u32` and `moles: f64`
- Implement methods:
- `add_chemical(chemical_id, moles)` - Add or update chemical
- `get_moles(chemical_id) -> f64` - Get moles of specific chemical
- `get_total_moles() -> f64` - Sum all moles
- `get_molar_fraction(chemical_id) -> f64` - Calculate fraction
- `clear()` - Remove all chemicals

### 1.3 Composition Asset Loading

**File:** `src/chemistry/mod.rs`

- Register `CompositionData` as Bevy asset
- Set up asset server integration

## Step 2: Container Creation System

### 2.1 Container Creation System

**File:** `src/core/systems/container.rs`

- Implement `create_container_system`:
- Takes container type and position
- Spawns entity with `ContainerNode`, `Transform`, `Sprite`, `Name`
- Initializes empty composition
- Returns entity ID
- Implement `container_placement_system`:
- Handles container placement on grid
- Integrates with existing grid snapping
- Validates placement bounds

### 2.2 Container Geometry

**File:** `src/core/components.rs`

- Add `GeometryData` struct (or use Handle<GeometryData> if asset-based)
- `base_radius: f64`
- `top_radius: f64`
- `height: f64`
- `wall_thickness: f64`
- `material: MaterialType`
- Update `ContainerNode` to include geometry reference

### 2.3 Container Factory

**File:** `src/core/systems/container.rs`

- Implement container factory functions:
- `create_flask(commands, position) -> Entity`
- `create_beaker(commands, position) -> Entity`
- `create_test_tube(commands, position) -> Entity`
- Each sets appropriate geometry and capacity

## Step 3: Composition Integration

### 3.1 Link Composition to Containers

**File:** `src/core/components.rs`

- Update `LayerEntity` to use `Handle<CompositionData>` (already present in current structure)
- Ensure composition is properly initialized when layers are created

### 3.2 Composition Management System

**File:** `src/core/systems/composition.rs`

- Implement `update_composition_system`:
- Updates composition data for layers
- Handles composition changes
- Triggers composition change events if needed
- Implement helper functions:
- `add_chemical_to_layer(world, layer_entity, chemical_id, moles)`
- `get_composition_from_layer(world, layer_entity) -> CompositionData`

## Step 4: Visual Rendering

### 4.1 Container Sprite Rendering

**File:** `src/core/systems/render.rs`

- Update `update_render_system`:
- Renders container shapes using Bevy sprites
- Different sprites/shapes for different container types
- Uses `Sprite` component with `ColorMaterial`
- Implement `render_container_system`:
- Creates/updates sprite for container based on `ContainerNode`
- Sets appropriate size based on geometry
- Handles container visual state

### 4.2 Basic Container Shapes

**File:** `src/core/systems/render.rs`

- Use Bevy's `SpriteBundle` with colored rectangles/circles for now
- Flask: Truncated cone shape (rectangle with top smaller than bottom)
- Beaker: Cylinder shape (rectangle)
- Test Tube: Small cylinder
- Use `ColorMaterial` for simple colored rendering

### 4.3 Composition Visualization (Basic)

**File:** `src/core/systems/render.rs`

- Add basic composition color calculation:
- Simple color mixing based on chemical presence
- For now, use placeholder colors (will be enhanced in later phases)
- Render composition as colored fill in container

## Step 5: Debug View Integration

### 5.1 Container Debug Information

**File:** `src/core/systems/debug_view.rs`

- Update `update_debug_view_system`:
- Query all containers
- Display container type, position, layer count
- Display composition for each layer
- Show total moles, chemical breakdown
- Format debug text with container information

### 5.2 Debug View UI Enhancement

**File:** `src/core/ui/debug_view.rs` (create if needed)

- Create basic Bevy UI panel for debug view
- Display container list with expandable details
- Show composition breakdown per container
- Use Bevy's built-in UI system (not egui for now)

## Step 6: Testing (TDD)

### 6.1 Container Creation Tests

**File:** `tests/integration/core/container_test.rs`

- Test: `create_container_with_type_returns_container_entity`
- Test: `create_flask_has_correct_geometry`
- Test: `container_has_empty_composition_initially`

### 6.2 Container Placement Tests

**File:** `tests/integration/core/container_test.rs`

- Test: `place_container_on_grid_snaps_to_grid` (may already exist)
- Test: `container_placement_respects_bounds`
- Test: `multiple_containers_can_be_placed`

### 6.3 Composition Tests

**File:** `tests/integration/core/composition_test.rs`

- Test: `add_chemical_to_composition_updates_moles`
- Test: `get_molar_fraction_calculates_correctly`
- Test: `composition_total_moles_sums_correctly`
- Test: `add_chemical_to_layer_updates_layer_composition`

### 6.4 Visual Rendering Tests

**File:** `tests/integration/core/render_test.rs`

- Test: `container_sprite_created_on_spawn`
- Test: `container_sprite_updates_with_geometry`
- Test: `composition_affects_container_color` (basic)

## Step 7: Integration and Polish

### 7.1 Main App Integration

**File:** `src/main.rs`

- Register new systems:
- `create_container_system`
- `container_placement_system`
- `update_composition_system`
- `render_container_system`
- Set up composition asset loading
- Initialize chemistry module

### 7.2 Module Exports

**File:** `src/chemistry/mod.rs`

- Export public API:
- `ChemicalId`, `Chemical`, `CompositionData`
- Chemical constants
- Composition helper functions

**File:** `src/core/mod.rs`

- Ensure all new systems are exported

## Deliverables Checklist

- [ ] Chemistry module with chemical definitions
- [ ] CompositionData asset type with molar calculations
- [ ] Container creation system
- [ ] Container placement with grid snapping
- [ ] Basic container visual rendering
- [ ] Composition tracking and updates
- [ ] Debug view shows container and composition info
- [ ] All tests pass (container creation, placement, composition)
- [ ] Integration tests for container system

## Success Criteria

- Can create containers (Flask, Beaker, TestTube) programmatically
- Containers snap to grid when placed
- Containers have visual representation (colored shapes)
- Composition can be added to containers
- Composition is tracked correctly (moles, fractions)
- Debug view displays container information
- All tests pass
- No compilation errors

## Files to Create/Modify

**New Files:**

- `src/chemistry/mod.rs`
- `src/chemistry/chemicals.rs`
- `src/chemistry/composition.rs`
- `src/core/systems/container.rs`
- `src/core/systems/composition.rs`
- `src/core/ui/debug_view.rs` (if UI needed)
- `tests/integration/core/container_test.rs`
- `tests/integration/core/composition_test.rs`
- `tests/integration/core/render_test.rs`

**Modify Existing Files:**

- `src/core/components.rs` - Add GeometryData, update ContainerNode
- `src/core/systems/render.rs` - Add container rendering
- `src/core/systems/debug_view.rs` - Add container debug info
- `src/core/mod.rs` - Export new systems
- `src/main.rs` - Register new systems and modules
- `Cargo.toml` - No new dependencies needed (use Bevy's asset system)

## Implementation Order

1. **Chemistry Module** (Step 1) - Foundation for composition
2. **Composition System** (Step 1) - Core data structure
3. **Container Creation** (Step 2) - Basic container spawning
4. **Tests** (Step 6) - Write tests first (TDD)
5. **Visual Rendering** (Step 4) - Make containers visible
6. **Debug Integration** (Step 5) - Show info in debug view
7. **Integration** (Step 7) - Wire everything together

## Notes

- Use Bevy's Asset system for `CompositionData` to allow sharing between entities
- Start with simple colored sprites for containers (no textures yet)
- Composition visualization is basic in this phase (will be enhanced later)
- Focus on correctness over performance in this phase
- Follow TDD: write tests before implementation

### To-dos

- [ ] Create chemistry module with chemical definitions and constants
- [ ] Implement CompositionData asset type with chemical tracking and molar calculations
- [ ] Implement container creation system with factory functions for Flask, Beaker, TestTube
- [ ] Add GeometryData to ContainerNode for container dimensions
- [ ] Implement container placement system with grid snapping integration
- [ ] Link CompositionData to LayerEntity and implement composition management system
- [ ] Implement basic container sprite rendering with colored shapes
- [ ] Enhance debug view to display container information and composition data
- [ ] Write integration tests for container creation and placement
- [ ] Write integration tests for composition tracking and molar calculations
- [ ] Write integration tests for container visual rendering
- [ ] Integrate all systems into main app and verify end-to-end functionality
