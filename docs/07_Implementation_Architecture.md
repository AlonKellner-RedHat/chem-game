# Implementation Architecture: Phaser3 Scene System

## Overview

The implementation uses **Phaser3's Scene and GameObject system** to manage game entities and systems. Phaser3 provides a flexible scene-based architecture with built-in rendering, input handling, and physics capabilities, making it ideal for this web-based simulation.

## 1. GameObject and Component Definitions

### 1.1 Core Components

#### ContainerNode Class

```typescript
import Phaser from 'phaser';

export class ContainerNode extends Phaser.GameObjects.Container {
    public containerType: ContainerType;
    public geometry: GeometryData;
    public connections: ConnectionData[];
    public layers: Phaser.GameObjects.GameObject[];
    public anchoredObjects: Phaser.GameObjects.GameObject[];
    public totalHeight: number;
    public currentLiquidLevel: number;

    constructor(scene: Phaser.Scene, x: number, y: number) {
        super(scene, x, y);
        // Initialize properties
    }
}
```

#### LayerEntity Class

```typescript
export class LayerEntity extends Phaser.GameObjects.GameObject {
    public layerType: LayerType;
    public height: number;
    public baseHeight: number;
    public composition: CompositionData;
    public state: PhysicalState;
    public temperature: number;
    public density: number;
    public viscosity: number;
    public surfaceTension: number;
    public mixingRate: number;
    public densityDelta: number;
    public velocity: number;
    public transientType: TransientType;

    constructor(scene: Phaser.Scene, type: string) {
        super(scene, type);
        // Initialize properties
    }
}
```

#### RadialNode Component

```rust
#[derive(Component)]
pub struct RadialNode {
    pub node_type: NodeType,
    pub layer_entity: Entity,
    pub volume: f64,
    pub temperature: f64,
    pub composition: Handle<CompositionData>,
    pub thickness: f64,
    pub pressure: f64,
}
```

#### SolidObject Component

```rust
#[derive(Component)]
pub struct SolidObject {
    pub solid_entity: Entity,
    pub solid_type: SolidType,
    pub geometry: Handle<GeometryData>,
    pub container_entity: Entity,
    pub base_height: f64,
    pub height: f64,
    pub material: MaterialType,
    pub thermal_conductivity: f64,
    pub intersecting_layers: Vec<Entity>,
}
```

### 1.2 Data Structures

**Data classes** are used to store game state and are accessible through the Scene's data system or as class properties.

```typescript
export class GeometryData {
    public baseRadius: number;
    public topRadius: number;
    public height: number;
    public wallThickness: number;
    public material: MaterialType;

    constructor() {
        // Initialize properties
    }
}

export class CompositionData {
    public chemicals: ChemicalEntry[];

    constructor() {
        this.chemicals = [];
    }
}

export class ChemicalEntry {
    public chemicalId: number;
    public moles: number;

    constructor(id: number, moles: number) {
        this.chemicalId = id;
        this.moles = moles;
    }
}

export class ConnectionData {
    public targetContainer: Phaser.GameObjects.GameObject;
    public height: number;
    public diameter: number;
    public connectionType: ConnectionType;

    constructor() {
        // Initialize properties
    }
}
```

### 1.3 Update Flags

Update flags mark game objects for system processing:

```typescript
export class UpdateFlags {
    public needsHeatUpdate: boolean = false;
    public needsPressureUpdate: boolean = false;
    public needsReactionUpdate: boolean = false;
    public needsSurfaceUpdate: boolean = false;
    public needsVisualizationUpdate: boolean = false;
}
```

## 2. Scene Update Order

### 2.1 Update Dependencies

Scene update methods execute in a specific order to ensure data dependencies are met:

```
1. updateTopology()
   └─ Updates layer heights, node volumes, solid intersections

2. updatePhysics()
   ├─ updateHeatConduction() (depends on topology)
   ├─ updatePressureCalculation() (depends on topology, temperature)
   ├─ ConvectionSystem (depends on temperature)
   └─ TransportDynamicsSystem (depends on density, mixing)

3. ChemistryUpdateSystem
   ├─ ReactionMatchingSystem (depends on composition, temperature)
   ├─ ReactionExecutionSystem (depends on reactions, inhibition)
   └─ ProductPropagationSystem (depends on reactions)

4. SurfacePhysicsSystem
   ├─ ThicknessUpdateSystem (depends on viscosity, surface tension)
   ├─ CleaningSystem (depends on solvent, residue)
   ├─ NucleationSystem (depends on supersaturation)
   └─ CrustingSystem (depends on thickness, composition)

5. KnowledgeAnalysisSystem
   ├─ PurityCalculationSystem (depends on composition)
   ├─ PropagationSystem (depends on identification)
   └─ ToolAnalysisSystem (depends on node data)

6. VisualizationSystem
   ├─ MacroRenderSystem (depends on all node data)
   └─ MicroRenderSystem (depends on composition, temperature)
```

### 2.2 System Registration

```rust
use bevy::prelude::*;

pub fn setup_systems(app: &mut App) {
    app
        .add_systems(Update, (
            topology_update_system,
            heat_conduction_system.after(topology_update_system),
            pressure_calculation_system.after(topology_update_system),
            convection_system.after(heat_conduction_system),
            transport_dynamics_system.after(convection_system),
            // ... more systems
        ).chain());
}

fn topology_update_system(
    mut query: Query<&mut ContainerNode>,
) {
    // Update topology
}

fn heat_conduction_system(
    mut query: Query<&mut RadialNode>,
    layers: Query<&LayerEntity>,
) {
    // Heat conduction
}
```

## 3. Rust Performance Features

### 3.1 Zero-Cost Abstractions

Rust provides zero-cost abstractions similar to Burst compilation:

```rust
fn heat_conduction_system(
    mut nodes: Query<&mut RadialNode>,
    time: Res<Time>,
) {
    for mut node in nodes.iter_mut() {
        // Zero-cost abstractions - compiled to efficient code
        let delta_t = (node.temperature - neighbor.temperature).abs();
        let heat_flow = k * A * delta_t / distance;
        node.temperature += heat_flow * time.delta_secs_f64();
    }
}
```

### 3.2 Rust Performance Features

**Benefits:**
- Zero-cost abstractions (no runtime overhead)
- No garbage collection (deterministic performance)
- Cache-friendly data layouts (ECS architecture)
- Compile-time optimizations
- SIMD support (via crates like `packed_simd`)

**Memory Safety:**
- Ownership system prevents data races
- Borrow checker ensures memory safety
- No null pointer exceptions
- No use-after-free bugs

### 3.3 Mathematics

Use Rust's standard math or specialized crates:

```rust
use std::f64::consts::PI;

fn calculate_volume(geometry: &GeometryData) -> f64 {
    if geometry.base_radius != geometry.top_radius {
        // Truncated cone
        PI * geometry.height / 3.0 *
        (geometry.base_radius.powi(2) +
         geometry.base_radius * geometry.top_radius +
         geometry.top_radius.powi(2))
    } else {
        // Cylinder
        PI * geometry.base_radius.powi(2) * geometry.height
    }
}
```

## 4. Bevy 2D Integration

### 4.1 Rendering Pipeline

**Bevy 2D Renderer** integration:

```rust
use bevy::prelude::*;

fn setup_rendering(mut commands: Commands) {
    // Bevy handles rendering automatically
    // Systems update Transform, Sprite, Color components
}

fn render_macro_view(
    mut query: Query<(&Transform, &mut Sprite, &RadialNode)>,
) {
    for (transform, mut sprite, node) in query.iter_mut() {
        // Update sprite based on node data
        sprite.color = calculate_color(node);
    }
}
```

### 4.2 Sprite Rendering

```rust
#[derive(Component)]
pub struct Renderable {
    pub sprite_entity: Entity,
}

// Use Bevy's built-in components
// Transform - position, rotation, scale
// Sprite - texture, color, custom_size
// Color - RGBA color
```

### 4.3 Custom Rendering

**Custom Materials** for 5-layer rendering:

```rust
use bevy::prelude::*;
use bevy::sprite::Material2d;

#[derive(AsBindGroup, TypePath, Asset, Clone)]
pub struct LayerMaterial {
    #[uniform(0)]
    pub n_ob_color: Color,
    #[uniform(1)]
    pub n_os_color: Color,
    #[uniform(2)]
    pub n_mat_color: Color,
    #[uniform(3)]
    pub n_is_color: Color,
    #[uniform(4)]
    pub n_ib_color: Color,
}

impl Material2d for LayerMaterial {
    fn fragment_shader() -> bevy::render::render_resource::ShaderRef {
        "shaders/layer_material.wgsl".into()
    }
}
```

## 5. Frame-by-Frame Update Cycle

### 5.1 Update Sequence

```rust
use bevy::prelude::*;

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_systems(Update, (
            process_user_input,
            // ECS systems run automatically in order
            update_visualization,
            update_ui,
        ));
}

fn process_user_input(
    keyboard_input: Res<ButtonInput<KeyCode>>,
    mouse_input: Res<ButtonInput<MouseButton>>,
) {
    // Handle user input
}
```

### 5.2 Fixed Timestep

For physics accuracy, use fixed timestep:

```rust
use bevy::prelude::*;

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .insert_resource(Time::<Fixed>::from_seconds(1.0 / 60.0))
        .add_systems(FixedUpdate, physics_update_system);
}

fn physics_update_system(time: Res<Time<Fixed>>) {
    let fixed_delta_time = time.delta_secs_f64();
    // Physics calculations with fixed timestep
}
```

## 6. Memory Management

### 6.1 Rust Ownership

Rust's ownership system eliminates GC and provides deterministic memory management:

```rust
// ✅ Good: Stack-allocated, automatically freed
let layers: Vec<LayerEntity> = vec![/* ... */];

// ✅ Good: Heap-allocated, automatically freed when out of scope
let composition = Box::new(CompositionData { /* ... */ });

// ✅ Good: Reference counting for shared ownership
use std::rc::Rc;
let shared_data = Rc::new(CompositionData { /* ... */ });
```

### 6.2 Resource Management

Bevy's Resource system handles global data:

```rust
#[derive(Resource)]
pub struct CompositionCache {
    compositions: HashMap<Entity, Handle<CompositionData>>,
}

fn cache_composition(
    mut cache: ResMut<CompositionCache>,
    entity: Entity,
    composition: Handle<CompositionData>,
) {
    cache.compositions.insert(entity, composition);
}
```

### 6.3 Entity Management

Bevy handles entity lifecycle automatically:

```rust
fn create_container(
    mut commands: Commands,
    container_type: ContainerType,
) -> Entity {
    commands.spawn(ContainerNode {
        container_entity: Entity::PLACEHOLDER, // Will be set
        container_type,
        // ... other fields
    }).id()
}
```

## 7. Performance Optimization Targets

### 7.1 Frame Time Targets

- **60 FPS:** 16.67 ms per frame
- **Physics Update:** < 5 ms
- **Chemistry Update:** < 3 ms
- **Visualization:** < 8 ms
- **Total:** < 16 ms

### 7.2 Scalability Targets

- **100 containers:** < 5 ms physics
- **1000 layers:** < 10 ms physics
- **10,000 boids:** < 8 ms rendering

### 7.3 Optimization Strategies

#### Spatial Partitioning

```rust
use bevy::prelude::*;
use std::collections::HashMap;

#[derive(Resource)]
pub struct SpatialGrid {
    grid: HashMap<(i32, i32), Vec<Entity>>,
    cell_size: f32,
}

impl SpatialGrid {
    pub fn add_entity(&mut self, entity: Entity, position: Vec2) {
        let cell = self.get_cell(position);
        self.grid.entry(cell).or_insert_with(Vec::new).push(entity);
    }

    fn get_cell(&self, position: Vec2) -> (i32, i32) {
        (
            (position.x / self.cell_size) as i32,
            (position.y / self.cell_size) as i32,
        )
    }
}
```

#### Parallel Processing

```rust
use bevy::prelude::*;
use rayon::prelude::*;

fn parallel_reaction_processing(
    reactions: Query<&ReactionData>,
    nodes: Query<&NodeData>,
) {
    reactions.par_iter().for_each(|reaction| {
        // Process reaction in parallel
    });
}
```

#### Caching

```rust
#[derive(Resource)]
pub struct CachedCalculation {
    last_value: Option<f64>,
    last_frame: u32,
}

fn get_cached_value(
    mut cache: ResMut<CachedCalculation>,
    frame: Res<FrameCount>,
    calculate: impl Fn() -> f64,
) -> f64 {
    if cache.last_frame == frame.0 {
        cache.last_value.unwrap()
    } else {
        let value = calculate();
        cache.last_value = Some(value);
        cache.last_frame = frame.0;
        value
    }
}
```

## 8. System Interaction Diagrams

### 8.1 Data Flow

```
User Input
    ↓
Topology System (updates structure)
    ↓
Physics System (heat, pressure, transport)
    ↓
Chemistry System (reactions)
    ↓
Surface Physics System (surface effects)
    ↓
Knowledge System (analysis)
    ↓
Visualization System (rendering)
    ↓
Screen
```

### 8.2 Component Dependencies

```
ContainerNode
    ├─→ LayerEntity
    │   ├─→ RadialNode (N_IB, N_IS, N_Mat, N_OS, N_OB)
    │   └─→ CompositionData (Resource)
    └─→ SolidObject
        └─→ IntersectingLayers (Vec<Entity>)
```

## 9. Bevy-Specific Considerations

### 9.1 App Setup

Bevy app initialization:

```rust
use bevy::prelude::*;

fn main() {
    App::new()
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window {
                title: "Chemistry Simulator".into(),
                resolution: (1280.0, 720.0).into(),
                ..default()
            }),
            ..default()
        }))
        .add_plugins(ChemistryPlugins)
        .run();
}

pub struct ChemistryPlugins;

impl PluginGroup for ChemistryPlugins {
    fn build(self) -> PluginGroupBuilder {
        PluginGroupBuilder::start::<Self>()
            .add(CorePlugin)
            .add(PhysicsPlugin)
            .add(ChemistryPlugin)
            .add(VisualizationPlugin)
    }
}
```

### 9.2 Scene Management

```rust
use bevy::prelude::*;

fn load_container(
    mut commands: Commands,
    data: Res<ContainerData>,
) {
    let entity = commands.spawn(ContainerNode {
        container_type: data.container_type,
        geometry: data.geometry.clone(),
        // ... other fields
    }).id();

    // Add layers, connections, etc.
}
```

### 9.3 Debug Visualization

```rust
use bevy::prelude::*;

fn debug_visualization(
    mut gizmos: Gizmos,
    containers: Query<&ContainerNode>,
) {
    for container in containers.iter() {
        // Draw container bounds
        gizmos.rect_2d(
            Vec2::ZERO,
            0.0,
            Vec2::new(container.width, container.height),
            Color::WHITE,
        );
    }
}
```

## 10. Testing & Validation

### 10.1 Unit Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_heat_conduction() {
        let mut node1 = RadialNode {
            temperature: 100.0,
            ..default()
        };
        let mut node2 = RadialNode {
            temperature: 50.0,
            ..default()
        };

        heat_conduction_calculate(&mut node1, &mut node2, 1.0);

        assert!(node1.temperature < 100.0);
        assert!(node2.temperature > 50.0);
    }
}
```

### 10.2 Integration Tests

```rust
#[cfg(test)]
mod tests {
    use bevy::prelude::*;
    use bevy::ecs::system::SystemState;

    #[test]
    fn test_physics_system() {
        let mut app = App::new();
        app.add_systems(Update, physics_update_system);

        // Setup test world
        let entity = app.world.spawn((
            ContainerNode::default(),
            LayerEntity::default(),
        )).id();

        // Run systems
        app.update();

        // Assert results
        let node = app.world.entity(entity).get::<ContainerNode>().unwrap();
        assert!(node.current_liquid_level > 0.0);
    }
}
```

### 10.3 Performance Tests

```rust
#[test]
fn test_performance() {
    use std::time::Instant;

    let start = Instant::now();

    // Run simulation for 1000 frames
    for _ in 0..1000 {
        update_simulation();
    }

    let duration = start.elapsed();
    assert!(duration.as_millis() < 16000); // < 16ms per frame
}
```

## 11. Interaction Points

- **All Subsystems:** Bevy ECS provides the framework for all systems
- **Bevy Rendering:** Integration with Bevy's 2D renderer
- **User Input:** Bevy's input system for user interactions
- **Performance:** Rust's zero-cost abstractions enable high-performance simulation

## 12. Devcontainer Benefits

- **Full Development in Container:** All code, tests, and scenes editable in container
- **Text-Based Scenes:** `.scn.ron` files can be edited directly
- **No GUI Required:** Complete development workflow without Unity Editor
- **Consistent Environment:** Same setup across all developers
- **CI/CD Ready:** Easy integration with automated testing and building
