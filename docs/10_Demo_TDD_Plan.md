# Demo TDD Plan: Test-Driven Development

## Overview

This document outlines the test-driven development approach for building the 3-stage demo. Each stage is built incrementally with tests written first, then implementation, then integration.

## Testing Framework

### Rust Test Framework
- **Unit Tests:** Test individual components in isolation (inline with `#[test]`)
- **Integration Tests:** Test component interactions (in `tests/` directory)
- **Bevy Integration Tests:** Test in Bevy app context using Bevy's test utilities

### Test Structure
```
tests/
  integration/
    core/
    chemistry/
    physics/
    stage1/
    stage2/
    stage3/
src/
  core/
    components.rs (unit tests inline)
    systems.rs (unit tests inline)
```

## Stage 1: The Volcano - TDD Plan

### Phase 1: Basic Container System

#### Test 1.1: Container Creation
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use bevy::prelude::*;

    #[test]
    fn create_container_with_type_returns_container_entity() {
        // Arrange
        let container_type = ContainerType::Flask;

        // Act
        let mut app = App::new();
        app.add_systems(Update, create_container_system);

        let entity = app.world.spawn(ContainerNode {
            container_type,
            ..default()
        }).id();

        // Assert
        assert!(app.world.entity(entity).contains::<ContainerNode>());
        let node = app.world.entity(entity).get::<ContainerNode>().unwrap();
        assert_eq!(container_type, node.container_type);
    }
}
```

#### Test 1.2: Container Placement
```rust
#[test]
fn place_container_on_grid_snaps_to_grid() {
    // Arrange
    let mut app = App::new();
    let container = app.world.spawn(ContainerNode::default()).id();
    let position = Vec2::new(123.4, 567.8);

    // Act
    let snapped = snap_to_grid(position);
    app.world.entity_mut(container).insert(Transform::from_translation(snapped.extend(0.0)));

    // Assert
    let transform = app.world.entity(container).get::<Transform>().unwrap();
    let actual_position = transform.translation.truncate();
    assert_eq!(snap_to_grid(position), actual_position);
}
```

**Implementation:** Basic container creation and grid snapping.

### Phase 2: Solid Addition

#### Test 2.1: Add Solid to Container
```rust
#[test]
fn add_solid_to_empty_container_creates_layer() {
    // Arrange
    let mut app = App::new();
    let container = app.world.spawn(ContainerNode {
        layers: Vec::new(),
        ..default()
    }).id();
    let malachite = create_malachite(5.0); // 5g

    // Act
    add_solid_to_container(&mut app.world, container, malachite);

    // Assert
    let node = app.world.entity(container).get::<ContainerNode>().unwrap();
    assert_eq!(1, node.layers.len());
    let layer = app.world.entity(node.layers[0]).get::<LayerEntity>().unwrap();
    assert_eq!(LayerType::Pure, layer.layer_type);
    assert_eq!(PhysicalState::Solid, layer.state);
}
```

#### Test 2.2: Solid Composition Tracking
```rust
#[test]
fn add_malachite_tracks_composition() {
    // Arrange
    let mut app = App::new();
    let container = app.world.spawn(ContainerNode::default()).id();
    let malachite = create_malachite(5.0);

    // Act
    add_solid_to_container(&mut app.world, container, malachite);

    // Assert
    let node = app.world.entity(container).get::<ContainerNode>().unwrap();
    let layer = app.world.entity(node.layers[0]).get::<LayerEntity>().unwrap();
    let composition = app.world.resource::<Assets<CompositionData>>()
        .get(&layer.composition).unwrap();
    let malachite_moles = get_moles(composition, MALACHITE_ID);
    assert!(malachite_moles > 0.0);
}
```

**Implementation:** Solid addition to containers with composition tracking.

### Phase 3: Heat System

#### Test 3.1: Heat Source Creation
```rust
#[test]
fn create_heat_source_with_temperature_sets_temperature() {
    // Arrange
    let temperature = 200.0;

    // Act
    let mut app = App::new();
    let heat_source = app.world.spawn(HeatSource {
        temperature,
        ..default()
    }).id();

    // Assert
    let heat = app.world.entity(heat_source).get::<HeatSource>().unwrap();
    assert_eq!(temperature, heat.temperature);
}
```

#### Test 3.2: Heat Transfer to Container
```rust
#[test]
fn heat_container_from_heat_source_updates_temperature() {
    // Arrange
    let mut app = App::new();
    let container = app.world.spawn(ContainerNode::default()).id();
    let heat_source = app.world.spawn(HeatSource {
        temperature: 200.0,
        position: Vec2::new(0.0, -1.0), // Below container
    }).id();

    // Act
    app.add_systems(Update, heat_transfer_system);
    app.update();

    // Assert
    let node = app.world.entity(container).get::<ContainerNode>().unwrap();
    let layer = app.world.entity(node.layers[0]).get::<LayerEntity>().unwrap();
    assert!(layer.temperature > 20.0); // Started at room temp
}
```

#### Test 3.3: Temperature Ramp Over Time
```rust
#[test]
fn heat_container_gradually_increases_temperature() {
    // Arrange
    let mut app = App::new();
    let container = app.world.spawn(ContainerNode::default()).id();
    let heat_source = app.world.spawn(HeatSource {
        temperature: 200.0,
        position: Vec2::new(0.0, -1.0),
    }).id();

    // Act & Assert
    app.add_systems(Update, heat_transfer_system);

    app.update();
    let temp1 = get_layer_temperature(&app.world, container);

    app.update();
    let temp2 = get_layer_temperature(&app.world, container);

    assert!(temp2 > temp1);
}
```

**Implementation:** Heat source and heat transfer system.

### Phase 4: Decomposition Reaction

#### Test 4.1: Malachite Decomposition Trigger
```rust
#[test]
fn heat_malachite_above_200c_triggers_decomposition() {
    // Arrange
    let mut app = App::new();
    let container = app.world.spawn(ContainerNode::default()).id();
    add_malachite(&mut app.world, container, 5.0);
    let heat_source = app.world.spawn(HeatSource {
        temperature: 250.0,
        position: Vec2::new(0.0, -1.0),
    }).id();

    // Act
    app.add_systems(Update, (heat_transfer_system, reaction_system));
    for _ in 0..60 {
        app.update(); // Simulate 1 second at 60 FPS
    }

    // Assert
    let node = app.world.entity(container).get::<ContainerNode>().unwrap();
    let layer = app.world.entity(node.layers[0]).get::<LayerEntity>().unwrap();
    let composition = get_composition(&app.world, layer.composition);
    let malachite_moles = get_moles(composition, MALACHITE_ID);
    assert!(malachite_moles < initial_malachite_moles());
}
```

#### Test 4.2: Decomposition Products
```rust
#[test]
fn decompose_malachite_produces_cuo_co2_h2o() {
    // Arrange
    let mut app = App::new();
    let container = app.world.spawn(ContainerNode::default()).id();
    add_malachite(&mut app.world, container, 5.0);
    heat_to_temperature(&mut app.world, container, 250.0);

    // Act
    app.add_systems(Update, reaction_system);
    app.update();

    // Assert
    let node = app.world.entity(container).get::<ContainerNode>().unwrap();
    let layers: Vec<_> = node.layers.iter()
        .map(|&e| app.world.entity(e).get::<LayerEntity>().unwrap())
        .collect();

    // Check for CuO (solid)
    let solid_layer = layers.iter().find(|l| l.state == PhysicalState::Solid);
    assert!(solid_layer.is_some());
    let cuo_moles = get_moles_from_layer(&app.world, solid_layer.unwrap(), CUO_ID);
    assert!(cuo_moles > 0.0);

    // Check for CO₂ and H₂O (gas)
    let gas_layer = layers.iter().find(|l| l.state == PhysicalState::Gas);
    assert!(gas_layer.is_some());
    let co2_moles = get_moles_from_layer(&app.world, gas_layer.unwrap(), CO2_ID);
    let h2o_moles = get_moles_from_layer(&app.world, gas_layer.unwrap(), H2O_ID);
    assert!(co2_moles > 0.0);
    assert!(h2o_moles > 0.0);
}
```

#### Test 4.3: Decomposition Rate
```rust
#[test]
fn decompose_malachite_at_250c_completes_in_reasonable_time() {
    // Arrange
    let mut app = App::new();
    let container = app.world.spawn(ContainerNode::default()).id();
    add_malachite(&mut app.world, container, 5.0);
    heat_to_temperature(&mut app.world, container, 250.0);

    // Act
    let start_moles = get_malachite_moles(&app.world, container);
    app.add_systems(Update, reaction_system);
    for _ in 0..600 {
        app.update(); // 10 seconds at 60 FPS
    }
    let end_moles = get_malachite_moles(&app.world, container);

    // Assert
    assert!(end_moles < start_moles * 0.1); // <10% remaining
}
```

**Implementation:** Malachite decomposition reaction with product generation.

### Phase 5: Balloon System

#### Test 5.1: Balloon Attachment
```rust
#[test]
fn attach_balloon_to_flask_connects_to_container() {
    // Arrange
    let mut app = App::new();
    let flask = app.world.spawn(ContainerNode {
        container_type: ContainerType::Flask,
        ..default()
    }).id();
    let balloon = app.world.spawn(Balloon::default()).id();

    // Act
    attach_balloon(&mut app.world, balloon, flask);

    // Assert
    let balloon_data = app.world.entity(balloon).get::<Balloon>().unwrap();
    assert_eq!(flask, balloon_data.attached_container);
    assert!(balloon_data.is_attached);
}
```

#### Test 5.2: Balloon Inflation with Gas
```rust
#[test]
fn add_gas_to_attached_balloon_inflates() {
    // Arrange
    let mut app = App::new();
    let flask = app.world.spawn(ContainerNode::default()).id();
    let balloon = attach_balloon(&mut app.world, flask);
    add_gas_to_container(&mut app.world, flask, CO2_ID, 1.2); // 1.2L

    // Act
    app.add_systems(Update, balloon_inflation_system);
    app.update();

    // Assert
    let balloon_data = app.world.entity(balloon).get::<Balloon>().unwrap();
    assert!(balloon_data.volume > 0.0);
    assert!(balloon_data.radius > Balloon::MIN_RADIUS);
}
```

#### Test 5.3: Balloon Composition Tracking
```rust
#[test]
fn inflate_balloon_tracks_gas_composition() {
    // Arrange
    let mut app = App::new();
    let flask = app.world.spawn(ContainerNode::default()).id();
    let balloon = attach_balloon(&mut app.world, flask);
    add_gas_to_container(&mut app.world, flask, CO2_ID, 1.0);
    add_gas_to_container(&mut app.world, flask, H2O_ID, 0.1);

    // Act
    app.add_systems(Update, balloon_inflation_system);
    app.update();

    // Assert
    let balloon_data = app.world.entity(balloon).get::<Balloon>().unwrap();
    let composition = get_composition(&app.world, balloon_data.composition);
    let co2_purity = calculate_purity(composition, CO2_ID);
    assert!(co2_purity > 0.9); // >90% CO₂
}
```

**Implementation:** Balloon attachment, inflation, and composition tracking.

### Phase 6: Integration Test

#### Test 6.1: Complete Stage 1 Flow
```rust
#[test]
fn stage1_complete_flow_extracts_co2() {
    // Arrange
    let mut app = App::new();
    setup_stage1(&mut app);

    let bench = create_bench(&mut app.world);
    let burner = place_burner(&mut app.world, bench);
    let flask = place_flask(&mut app.world, burner);
    let malachite = add_malachite(&mut app.world, flask, 5.0);
    let balloon = attach_balloon(&mut app.world, flask);

    // Act
    heat_burner(&mut app.world, burner, 250.0);
    app.add_systems(Update, (
        heat_transfer_system,
        reaction_system,
        balloon_inflation_system,
    ));
    for _ in 0..600 {
        app.update(); // Wait 10 seconds
    }

    // Assert
    let balloon_data = app.world.entity(balloon).get::<Balloon>().unwrap();
    assert!(balloon_data.volume > 1.0); // >1L
    let composition = get_composition(&app.world, balloon_data.composition);
    let co2_purity = calculate_purity(composition, CO2_ID);
    assert!(co2_purity > 0.9); // >90% CO₂
}
```

## Stage 2: The Blue Blood - TDD Plan

### Phase 1: Liquid Addition

#### Test 2.1: Pour Liquid into Container
```rust
#[test]
fn pour_liquid_into_container_creates_liquid_layer() {
    // Arrange
    let mut app = App::new();
    let container = app.world.spawn(ContainerNode::default()).id();
    let acid = create_sulfuric_acid(0.1); // 100mL

    // Act
    pour_liquid(&mut app.world, container, acid, 0.1);

    // Assert
    let node = app.world.entity(container).get::<ContainerNode>().unwrap();
    let layers: Vec<_> = node.layers.iter()
        .map(|&e| app.world.entity(e).get::<LayerEntity>().unwrap())
        .collect();
    let liquid_layer = layers.iter().find(|l| l.state == PhysicalState::Liquid);
    assert!(liquid_layer.is_some());
    assert!(liquid_layer.unwrap().height > 0.0);
}
```

### Phase 2: Dissolution Reaction

#### Test 2.2: CuO Dissolves in Acid
```rust
#[test]
fn add_acid_to_cuo_dissolves() {
    // Arrange
    let mut app = App::new();
    let container = app.world.spawn(ContainerNode::default()).id();
    add_cuo(&mut app.world, container, 3.5);
    pour_acid(&mut app.world, container, 0.1);

    // Act
    app.add_systems(Update, reaction_system);
    app.update();

    // Assert
    let solid_layer = get_solid_layer(&app.world, container);
    let cuo_moles = get_moles_from_layer(&app.world, solid_layer, CUO_ID);
    assert!(cuo_moles < initial_cuo_moles());
}
```

#### Test 2.3: Solution Color Change
```rust
#[test]
fn dissolve_cuo_produces_blue_solution() {
    // Arrange
    let mut app = App::new();
    let container = app.world.spawn(ContainerNode::default()).id();
    add_cuo(&mut app.world, container, 3.5);
    pour_acid(&mut app.world, container, 0.1);

    // Act
    app.add_systems(Update, reaction_system);
    for _ in 0..600 {
        app.update(); // 10 seconds
    }

    // Assert
    let liquid_layer = get_liquid_layer(&app.world, container);
    let color = calculate_solution_color(&app.world, liquid_layer);
    assert!(is_blue(color)); // Blue color
}
```

### Phase 3: Agitation System

#### Test 2.4: Stirring Increases Mixing
```rust
#[test]
fn stir_container_increases_mixing_rate() {
    // Arrange
    let mut app = App::new();
    let container = app.world.spawn(ContainerNode::default()).id();
    let stirring_rod = app.world.spawn(StirringRod::default()).id();

    // Act
    stir_container(&mut app.world, container, stirring_rod, 1.0);

    // Assert
    let node = app.world.entity(container).get::<ContainerNode>().unwrap();
    let layer = app.world.entity(node.layers[0]).get::<LayerEntity>().unwrap();
    assert!(layer.mixing_rate > 0.0);
    assert!(layer.mixing_factor > 1.0);
}
```

### Phase 4: Integration Test

#### Test 2.5: Complete Stage 2 Flow
```rust
#[test]
fn stage2_complete_flow_creates_blue_solution() {
    // Arrange
    let mut app = App::new();
    let flask = create_flask_with_cuo(&mut app.world, 3.5);

    // Act
    pour_acid(&mut app.world, flask, 0.1);
    heat_container(&mut app.world, flask, 50.0); // Gentle heat
    stir_container(&mut app.world, flask, 5.0); // Stir for 5 seconds
    app.add_systems(Update, reaction_system);
    for _ in 0..600 {
        app.update(); // Wait 10 seconds
    }

    // Assert
    let liquid_layer = get_liquid_layer(&app.world, flask);
    let color = calculate_solution_color(&app.world, liquid_layer);
    assert!(is_blue(color));
    assert!(is_homogeneous(&app.world, liquid_layer));
}
```

## Stage 3: The Recovery - TDD Plan

### Phase 1: Condenser System

#### Test 3.1: Attach Condenser
```rust
#[test]
fn attach_condenser_to_flask_connects() {
    // Arrange
    let mut app = App::new();
    let flask = app.world.spawn(ContainerNode {
        container_type: ContainerType::Flask,
        ..default()
    }).id();
    let condenser = app.world.spawn(Condenser::default()).id();

    // Act
    attach_condenser(&mut app.world, condenser, flask);

    // Assert
    let condenser_data = app.world.entity(condenser).get::<Condenser>().unwrap();
    assert_eq!(flask, condenser_data.source_container);
}
```

### Phase 2: Evaporation System

#### Test 3.2: Water Evaporates at Boiling
```rust
#[test]
fn heat_solution_to_boiling_evaporates_water() {
    // Arrange
    let mut app = App::new();
    let container = app.world.spawn(ContainerNode::default()).id();
    let solution = create_cuso4_solution(0.2); // 200mL
    add_solution(&mut app.world, container, solution);

    // Act
    heat_to_temperature(&mut app.world, container, 100.0); // Boiling
    app.add_systems(Update, evaporation_system);
    for _ in 0..600 {
        app.update(); // 10 seconds
    }

    // Assert
    let liquid_layer = get_liquid_layer(&app.world, container);
    assert!(liquid_layer.height < initial_height());
}
```

### Phase 3: Condensation System

#### Test 3.3: Vapor Condenses in Condenser
```rust
#[test]
fn condense_vapor_in_condenser_produces_liquid() {
    // Arrange
    let mut app = App::new();
    let flask = app.world.spawn(ContainerNode::default()).id();
    let condenser = attach_condenser(&mut app.world, flask);
    let beaker = place_beaker_under_condenser(&mut app.world, condenser);
    add_vapor_to_container(&mut app.world, flask, H2O_ID, 0.1); // 100mL vapor

    // Act
    app.add_systems(Update, condensation_system);
    app.update();

    // Assert
    let beaker_data = app.world.entity(beaker).get::<ContainerNode>().unwrap();
    let liquid_layer = get_liquid_layer(&app.world, beaker);
    assert!(liquid_layer.height > 0.0);
}
```

### Phase 4: Supersaturation & Crystallization

#### Test 3.4: Supersaturation Detection
```rust
#[test]
fn evaporate_water_from_solution_becomes_supersaturated() {
    // Arrange
    let mut app = App::new();
    let container = app.world.spawn(ContainerNode::default()).id();
    let solution = create_cuso4_solution(0.2);
    add_solution(&mut app.world, container, solution);

    // Act
    heat_to_temperature(&mut app.world, container, 100.0);
    evaporate_water(&mut app.world, container, 0.15); // Evaporate 150mL

    // Assert
    let liquid_layer = get_liquid_layer(&app.world, container);
    assert!(is_supersaturated(&app.world, liquid_layer));
}
```

#### Test 3.5: Crystal Nucleation
```rust
#[test]
fn supersaturated_solution_nucleates_crystals() {
    // Arrange
    let mut app = App::new();
    let container = app.world.spawn(ContainerNode::default()).id();
    let solution = create_supersaturated_cuso4_solution();
    add_solution(&mut app.world, container, solution);

    // Act
    app.add_systems(Update, nucleation_system);
    app.update();

    // Assert
    let crystals = get_crystals(&app.world, container);
    assert!(crystals.len() > 0);
}
```

#### Test 3.6: Crystal Growth
```rust
#[test]
fn crystals_grow_over_time() {
    // Arrange
    let mut app = App::new();
    let container = app.world.spawn(ContainerNode::default()).id();
    let crystals = create_crystals(&mut app.world, container, 5);
    let initial_mass = get_total_crystal_mass(&app.world, &crystals);

    // Act
    app.add_systems(Update, crystal_growth_system);
    for _ in 0..600 {
        app.update(); // 10 seconds
    }

    // Assert
    let final_mass = get_total_crystal_mass(&app.world, &crystals);
    assert!(final_mass > initial_mass);
}
```

### Phase 5: Purity Calculation

#### Test 3.7: Calculate Water Purity
```rust
#[test]
fn condensed_water_high_purity() {
    // Arrange
    let mut app = App::new();
    let beaker = app.world.spawn(ContainerNode::default()).id();
    let water = create_water(0.1); // 100mL
    add_trace_impurity(&mut app.world, water, 0.0001); // 0.1mL impurity
    add_liquid(&mut app.world, beaker, water);

    // Act
    let purity = calculate_purity(&app.world, beaker, H2O_ID);

    // Assert
    assert!(purity > 0.99); // >99% pure
}
```

### Phase 6: Integration Test

#### Test 3.8: Complete Stage 3 Flow
```rust
#[test]
fn stage3_complete_flow_separates_water_and_crystals() {
    // Arrange
    let mut app = App::new();
    let flask = create_flask_with_cuso4_solution(&mut app.world, 0.2);
    let condenser = attach_condenser(&mut app.world, flask);
    let beaker = place_beaker_under_condenser(&mut app.world, condenser);

    // Act
    heat_to_boiling(&mut app.world, flask);
    app.add_systems(Update, (evaporation_system, condensation_system));
    for _ in 0..900 {
        app.update(); // Evaporate 150mL
    }
    stop_heat(&mut app.world, flask);
    app.add_systems(Update, crystallization_system);
    for _ in 0..300 {
        app.update(); // Wait for crystallization
    }

    // Assert
    let water_purity = calculate_purity(&app.world, beaker, H2O_ID);
    assert!(water_purity > 0.99);

    let crystals = get_crystals(&app.world, flask);
    assert!(crystals.len() > 0);
}
```

## Test Execution Strategy

### Unit Tests
- Run with `cargo test` (runs all tests)
- Run specific test: `cargo test test_name`
- Must pass before integration
- Fast execution (< 1 second total)

### Integration Tests
- Run with `cargo test --test integration`
- Test component interactions
- Moderate execution time (< 10 seconds)

### Bevy Integration Tests
- Use Bevy's test utilities
- Create test app with `App::new()`
- Run systems and assert results
- Longer execution time (< 60 seconds)

## Continuous Integration

### Pre-Commit
- Run all unit tests: `cargo test`
- Run code formatter: `cargo fmt --check`
- Run clippy: `cargo clippy`

### Pre-Merge
- Run all unit tests
- Run integration tests
- Generate test coverage report: `cargo tarpaulin`

### Pre-Release
- Run all tests (unit, integration)
- Performance benchmarks
- Memory leak detection: `cargo valgrind` or `cargo miri`

## Test Coverage Goals

- **Unit Tests:** > 80% code coverage
- **Integration Tests:** All critical paths covered
- **Bevy Integration Tests:** All stages playable end-to-end

## Next Steps

See:
- [11_Demo_POC_Plan.md](11_Demo_POC_Plan.md) - Proof of concept prototypes
- [12_Demo_Build_Plan.md](12_Demo_Build_Plan.md) - Incremental build plan
