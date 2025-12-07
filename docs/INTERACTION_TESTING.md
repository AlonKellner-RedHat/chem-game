# Interaction Testing Strategy

## Overview

This document outlines the testing strategy for UI interactions in the Chemistry Simulator, including keyboard input, mouse input, and WASM-specific considerations.

## Test Categories

### 1. Unit Tests (Logic-Only)

These tests verify the core logic of input systems without requiring windowing dependencies:

- **Input State Management**: Test that `InputState` resource correctly stores and updates mouse/keyboard state
- **Debug View Toggle Logic**: Test that `toggle_debug_view_system` correctly toggles visibility
- **Drag Detection Logic**: Test that drag distance calculations work correctly
- **Entity Selection Logic**: Test that closest entity selection works

**Location**: `tests/integration/core/interaction_test.rs`

**Example**:
```rust
#[test]
fn input_state_resource_works() {
    let mut app = App::new();
    app.add_plugins(MinimalPlugins);
    app.init_resource::<InputState>();
    
    // Test input state updates
    let mut input_state = app.world.resource_mut::<InputState>();
    input_state.left_button_pressed = true;
    // ... verify state
}
```

### 2. Integration Tests (With Window)

These tests require a windowing system and test full input flow:

- **F1 Key Toggle**: Verify F1 key toggles debug view
- **Mouse Click**: Verify mouse clicks update input state
- **Drag and Drop**: Verify entities can be dragged
- **System Integration**: Verify all input systems work together

**Note**: These tests require X11 or Wayland and may not work in all CI environments.

### 3. WASM-Specific Tests

These tests verify that input handling works correctly in WASM:

- **Keyboard Events**: Test that keyboard events are received in WASM
- **Mouse Events**: Test that mouse events are received in WASM
- **Event Propagation**: Test that events propagate correctly through Bevy's event system

**Location**: `tests/integration/core/interaction_test.rs::wasm_input_compatibility`

## Known Issues

### WASM Input Handling

**Issue**: Input may not work correctly in WASM due to:
1. Browser event handling differences
2. Bevy's input system may require specific initialization
3. Focus issues (window must be focused for keyboard input)

**Symptoms**:
- F1 key doesn't toggle debug view
- Mouse clicks don't register
- No input feedback

**Debugging Steps**:
1. Check browser console for errors
2. Verify window has focus (click on canvas)
3. Check that `ButtonInput<KeyCode>` is being updated
4. Verify systems are running (check debug output)

### System Dependencies

**Issue**: Some tests require windowing system libraries (X11/Wayland)

**Solution**: Use `MinimalPlugins` for tests that don't need windowing, or run tests in headless mode with `BEVY_HEADLESS=1`.

## Manual Testing Checklist

### Keyboard Input

- [ ] **F1 Toggle**: Press F1, verify debug view toggles on/off
- [ ] **Rapid Presses**: Press F1 rapidly, verify no crashes
- [ ] **Focus**: Click away from window, press F1, verify it still works when focused again

### Mouse Input

- [ ] **Left Click**: Click on container, verify it's selected
- [ ] **Drag**: Click and drag container, verify it moves
- [ ] **Release**: Release mouse, verify drag ends
- [ ] **Right Click**: Right click (when implemented), verify context menu appears

### WASM-Specific

- [ ] **Browser Focus**: Click on canvas, verify input works
- [ ] **Keyboard Events**: Press F1 in browser, verify debug view toggles
- [ ] **Mouse Events**: Click in browser, verify containers respond
- [ ] **Console Errors**: Check browser console, verify no errors

## Automated Test Strategy

### Running Tests

```bash
# Run all interaction tests
cargo test --test integration_tests interaction

# Run specific test
cargo test --test integration_tests f1_key_toggles_debug_view

# Run with output
cargo test --test integration_tests interaction -- --nocapture
```

### Test Structure

```
tests/integration/core/interaction_test.rs
├── f1_key_toggles_debug_view          # Keyboard input test
├── input_state_resource_works         # Input state test
├── mouse_drag_detection_logic         # Drag detection test
├── drag_drop_updates_entity_position   # Drag and drop test
├── multiple_key_presses_handled       # Rapid input test
├── input_systems_integration          # System integration test
└── wasm_input_compatibility           # WASM-specific test
```

## Debugging Input Issues

### 1. Check System Registration

Verify that input systems are registered in `main.rs`:

```rust
app.add_systems(Update, (
    update_input_system,
    drag_drop_system,
    toggle_debug_view_system,
));
```

### 2. Check Resource Initialization

Verify that `InputState` is initialized:

```rust
app.init_resource::<InputState>();
```

### 3. Check WASM Event Handling

In WASM, verify that events are being received:

```javascript
// In browser console
window.addEventListener('keydown', (e) => {
    console.log('Key pressed:', e.key, e.code);
});
```

### 4. Check Bevy Input State

Add debug output to verify input state:

```rust
fn debug_input_system(input_state: Res<InputState>) {
    println!("Mouse: {:?}, Left: {}", 
        input_state.mouse_world_position,
        input_state.left_button_pressed
    );
}
```

## Test Coverage Goals

- [x] F1 key toggle logic
- [x] Input state management
- [x] Drag detection logic
- [x] Drag and drop position updates
- [x] Multiple key press handling
- [x] System integration
- [x] WASM compatibility
- [ ] Full window integration (requires X11/Wayland)
- [ ] Browser event handling (requires manual testing)

## Future Improvements

1. **Headless Input Simulation**: Create a test harness that simulates input events without requiring a window
2. **Browser Automation**: Use tools like Playwright or Selenium to automate WASM testing
3. **Input Event Recording**: Record input events and replay them in tests
4. **Visual Regression Testing**: Screenshot-based testing for UI interactions

## References

- [Bevy Input Documentation](https://bevyengine.org/learn/book/getting-started/input/)
- [WASM Input Handling](https://rustwasm.github.io/wasm-bindgen/examples/web-sys.html)
- [Bevy Testing Guide](https://bevyengine.org/learn/book/getting-started/tests/)

