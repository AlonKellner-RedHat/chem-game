# Interactivity Guide

This document describes the available interactivity features in the Chemistry Simulator and how to test them.

## Available Interactions

### 1. Debug View Toggle
- **Key**: `D` (or `d`)
- **Action**: Toggles the debug view on/off
- **Default State**: Debug view is **ON** by default
- **System**: `toggle_debug_view_system`
- **What it shows**:
  - Entity count
  - FPS
  - Container information (type, position, layer count)
  - Composition data for each layer (moles, chemical breakdown)

### 2. Container Dragging
- **Mouse**: Left-click and drag
- **Action**: Select and drag containers around the screen
- **Selection Range**: Entities within 50 pixels of mouse click
- **Systems**:
  - `update_input_system` - Tracks mouse position and drag state
  - `drag_drop_system` - Handles entity selection and position updates
- **How it works**:
  1. Click on a container (within 50 pixels)
  2. Drag the mouse (must move >5 pixels to start dragging)
  3. Release to drop the container
  4. Container position updates in real-time during drag

### 3. Grid Snapping
- **Automatic**: Happens when container Transform changes
- **System**: `container_placement_system`
- **Grid Size**: 32 pixels per cell (default)
- **Action**: Containers automatically snap to grid positions when moved
- **Bounds**: Containers are clamped to grid bounds (2000x2000 pixels default)

## Testing Interactivity

### Manual Testing

1. **Debug View Toggle**:
   - Start the game (debug view should be visible by default)
   - Press `D` key - debug view should hide
   - Press `D` again - debug view should show
   - Check console for debug output when visible

2. **Container Dragging**:
   - Click on a container (flask or beaker)
   - Drag it around - it should follow the mouse
   - Release - container should snap to grid
   - Try dragging multiple containers

3. **Grid Snapping**:
   - Drag a container to any position
   - Release it
   - Container should snap to nearest grid cell (32px increments)
   - Container should stay within bounds

### Automated Testing

All interactivity features have integration tests:

- **Debug View Tests**: `tests/integration/core/interaction_test.rs`
  - `f1_key_toggles_debug_view` (now tests D key)
  - `multiple_key_presses_handled`

- **Drag & Drop Tests**: `tests/integration/core/interaction_test.rs`
  - `mouse_drag_detection_logic`
  - `drag_drop_updates_entity_position`

- **WASM Interaction Tests**: `tests/integration/core/wasm_canvas_interaction_test.rs`
  - `wasm_canvas_should_be_interactive`
  - `input_systems_must_be_registered`

Run all tests:
```bash
cargo test --test integration_tests
```

## Implementation Details

### Input Flow

1. **Mouse Input**:
   - `update_input_system` runs every frame
   - Tracks mouse position (screen and world coordinates)
   - Detects drag start (>5 pixel movement)
   - Updates `InputState` resource

2. **Drag & Drop**:
   - `drag_drop_system` checks if dragging is active
   - Selects closest entity on click (within 50 pixels)
   - Updates entity Transform during drag
   - Clears selection on release

3. **Grid Placement**:
   - `container_placement_system` runs on Transform changes
   - Snaps position to grid
   - Validates and clamps to bounds

### Key Resources

- `InputState`: Tracks mouse position, button states, drag state
- `Grid`: Defines grid cell size, origin, and bounds
- `ButtonInput<KeyCode>`: Keyboard input state
- `ButtonInput<MouseButton>`: Mouse button input state

### Systems Order

The systems run in this order (in `Update` schedule):
1. `update_input_system` - Updates input state
2. `drag_drop_system` - Handles dragging
3. `container_placement_system` - Snaps to grid
4. `render_grid_system` - Renders grid visualization
5. `render_container_system` - Renders containers
6. `update_debug_view_system` - Updates debug output
7. `toggle_debug_view_system` - Handles D key toggle

## WASM-Specific Notes

- Canvas must be focused to receive keyboard input
- Click the canvas to focus it (automatic on load)
- D key works when canvas is focused
- Mouse dragging works without focus
- See `wasm/index.html` for canvas focus handling

## Future Enhancements

- Right-click context menu
- Keyboard shortcuts for container creation
- Multi-select containers
- Container rotation
- Snap-to-connection points
- Undo/redo for container placement
