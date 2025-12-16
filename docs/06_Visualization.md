# Visualization: The User Experience

## Overview

The Visualization system provides immediate, intuitive feedback on complex chemical processes through two main views: the **Macro-View** (5-layer shader rendering) and the **Micro-View** (boid-based atomic representation). This system bridges the abstract simulation data and the player's visual understanding.

## 1. Macro-View: The 5-Layer Shader

### 1.1 Render Order

The macro-view renders glassware and fluids in a specific order to create depth and visual hierarchy:

```
Render Order (back to front):
1. N_OB (Outer Bulk) - Bath distortion, environment
2. N_OS (Outer Surface) - Soot, condensation, insulation
3. N_Mat (Material) - Glass tint, material properties
4. N_IS (Inner Surface) - Residue, crystals, surface effects
5. N_IB (Inner Bulk) - Main fluid content
```

### 1.2 Glassware Render

#### N_OB (Outer Bulk) - Bath Distortion

**Purpose:** Visualize environment (water bath, air, vacuum)

```glsl
// Shader: N_OB_Render.shader
void RenderOuterBulk(float2 uv, float depth)
{
    // Bath distortion (if container is in water bath)
    if (IsInWaterBath)
    {
        float2 distortion = CalculateWaterDistortion(uv, time);
        uv += distortion * DISTORTION_STRENGTH;
    }

    // Environment color (water = blue, air = transparent, vacuum = dark)
    float3 color = GetEnvironmentColor(EnvironmentType);

    // Render with depth
    RenderWithDepth(color, depth);
}
```

**Effects:**
- **Water Bath:** Refraction distortion, blue tint
- **Air:** Transparent (no effect)
- **Vacuum:** Dark background

#### N_OS (Outer Surface) - Soot & Condensation

**Purpose:** Visualize external surface effects

```glsl
void RenderOuterSurface(float2 uv, Composition composition)
{
    // Soot accumulation
    float sootAmount = GetSootAmount(composition);
    float3 sootColor = float3(0.1, 0.1, 0.1);  // Dark gray/black

    // Condensation (water droplets)
    float condensation = GetCondensation(composition, temperature);
    float3 condensationColor = float3(0.8, 0.9, 1.0);  // Light blue

    // Blend
    float3 color = lerp(glassColor, sootColor, sootAmount);
    color = lerp(color, condensationColor, condensation);

    RenderWithOpacity(color, opacity);
}
```

**Effects:**
- **Soot:** Dark coating (from combustion)
- **Condensation:** Water droplets (from cooling)
- **Insulation:** Wrapping material (if present)

#### N_Mat (Material) - Glass Tint

**Purpose:** Visualize container material properties

```glsl
void RenderMaterial(float2 uv, MaterialType material)
{
    // Base material color
    float3 baseColor = GetMaterialColor(material);

    // Glass tint (slight blue/green)
    if (material == MaterialType.Glass)
    {
        baseColor = lerp(baseColor, float3(0.9, 0.95, 1.0), 0.1);
    }

    // Thickness effect (thicker = darker)
    float thickness = GetWallThickness(uv);
    float darkness = 1.0 - (thickness / MAX_THICKNESS) * 0.2;
    baseColor *= darkness;

    // Render with transparency
    RenderWithTransparency(baseColor, materialOpacity);
}
```

**Effects:**
- **Glass:** Slight blue/green tint, transparency
- **Copper:** Metallic orange/brown
- **Plastic:** Opaque, material-specific color

#### N_IS (Inner Surface) - Residue & Crystals

**Purpose:** Visualize surface accumulation

```glsl
void RenderInnerSurface(float2 uv, Composition composition, float thickness)
{
    // Residue color (from composition)
    float3 residueColor = GetResidueColor(composition);

    // Crystal sparkle (if crystals present)
    float crystalAmount = GetCrystalAmount(composition);
    float sparkle = CalculateSparkle(uv, time, crystalAmount);

    // Carbon tar (dark, opaque)
    float tarAmount = GetTarAmount(composition);
    float3 tarColor = float3(0.05, 0.05, 0.05);  // Very dark

    // Blend
    float3 color = lerp(residueColor, tarColor, tarAmount);
    color += sparkle * CRYSTAL_SPARKLE_STRENGTH;

    // Thickness affects opacity
    float opacity = CalculateOpacityFromThickness(thickness);

    RenderWithOpacity(color, opacity);
}
```

**Effects:**
- **Residue:** Colored film (composition-dependent)
- **Crystals:** Sparkle effect
- **Carbon Tar:** Dark, opaque coating
- **Thickness:** Affects opacity (thicker = more opaque)

#### N_IB (Inner Bulk) - Main Fluid

**Purpose:** Visualize fluid content (most important layer)

```glsl
void RenderInnerBulk(float2 uv, Composition composition, Phase phase)
{
    // Base color from composition
    float3 baseColor = GetCompositionColor(composition);

    // Beer-Lambert color calculation
    float3 absorbanceColor = CalculateBeerLambertColor(composition, uv);

    // Phase effects
    float3 phaseColor = ApplyPhaseEffects(baseColor, phase);

    // Blend
    float3 finalColor = lerp(baseColor, absorbanceColor, ABSORBANCE_STRENGTH);
    finalColor = ApplyPhaseVisualization(finalColor, phase);

    RenderWithDepth(finalColor, depth);
}
```

### 1.3 Beer-Lambert Color Calculation

**Beer-Lambert Law:**

```
A = ε * c * l
```

Where:
- `A` = absorbance (dimensionless)
- `ε` = molar absorptivity (L/(mol·cm))
- `c` = concentration (mol/L)
- `l` = path length (cm)

**Color Calculation:**

```glsl
float3 CalculateBeerLambertColor(Composition composition, float2 uv)
{
    float3 totalAbsorbance = float3(0.0, 0.0, 0.0);

    // Sum absorbance from all colored compounds
    for each chemical in composition:
        float concentration = GetConcentration(composition, chemical);
        float3 epsilon = GetMolarAbsorptivity(chemical);  // RGB per wavelength
        float pathLength = CalculatePathLength(uv);  // Distance through fluid

        float3 absorbance = epsilon * concentration * pathLength;
        totalAbsorbance += absorbance;

    // Convert absorbance to transmittance
    float3 transmittance = exp(-totalAbsorbance);

    // Apply to white light (or ambient light)
    float3 lightColor = GetAmbientLight();
    float3 color = lightColor * transmittance;

    return color;
}
```

**Wavelength Ranges:**
- **Red:** 620-750 nm
- **Green:** 495-570 nm
- **Blue:** 450-495 nm

**Trace Dyes:** Even very low concentrations (<1 ppm) can be visible if ε is high.

### 1.4 Phase Visualization

#### Liquid Phase

```glsl
float3 ApplyLiquidEffects(float3 color, float2 uv, float time)
{
    // Wobble effect (surface waves)
    float2 wobble = CalculateWobble(uv, time);
    uv += wobble * WOBBLE_STRENGTH;

    // Refraction (slight distortion)
    float refraction = CalculateRefraction(uv);
    color = SampleWithRefraction(color, uv, refraction);

    return color;
}
```

**Effects:**
- **Wobble:** Surface waves (time-based)
- **Refraction:** Light bending at interfaces

#### Gas Phase

```glsl
float3 ApplyGasEffects(float3 color, float2 uv, float time)
{
    // Fog effect (particles)
    float fog = CalculateFog(uv, time, density);
    color = lerp(color, fogColor, fog);

    // Turbulence (convection)
    float2 turbulence = CalculateTurbulence(uv, time);
    uv += turbulence * TURBULENCE_STRENGTH;

    return color;
}
```

**Effects:**
- **Fog:** Particle density visualization
- **Turbulence:** Convection patterns

#### Supercritical Phase

```glsl
float3 ApplySupercriticalEffects(float3 color, float2 uv, float time)
{
    // Distortion (high density, no meniscus)
    float2 distortion = CalculateSupercriticalDistortion(uv, time, density);
    uv += distortion * DISTORTION_STRENGTH;

    // High-density shimmer
    float shimmer = CalculateShimmer(uv, time);
    color += shimmer * SHIMMER_STRENGTH;

    return color;
}
```

**Effects:**
- **Distortion:** High-density fluid effects
- **Shimmer:** No clear gas-liquid interface

### 1.5 Gradient Dithering

For gradient layers, use dithered interpolation to smoothly blend between two compositions.

```glsl
float3 RenderGradientLayer(float2 uv, GradientLayer gradient)
{
    // Calculate position in gradient (0 = bottom, 1 = top)
    float gradientPosition = CalculateGradientPosition(uv, gradient);

    // Dithering (reduces banding)
    float dither = CalculateDither(uv);
    gradientPosition += dither * DITHER_STRENGTH;

    // Sample bottom and top compositions
    float3 bottomColor = GetCompositionColor(gradient.BottomComposition);
    float3 topColor = GetCompositionColor(gradient.TopComposition);

    // Interpolate
    float3 color = lerp(bottomColor, topColor, gradientPosition);

    return color;
}
```

**Dithering Algorithm:**

```glsl
float CalculateDither(float2 uv)
{
    // Blue noise or ordered dithering
    float2 grid = floor(uv * DITHER_GRID_SIZE);
    float ditherValue = Hash(grid);  // Pseudo-random
    return (ditherValue - 0.5) * 2.0;  // -1 to 1
}
```

## 2. Micro-View: The Lens

### 2.1 Lens Implementation

A drag-over circular overlay that visualizes the *state* of matter in N_IB.

```rust
#[derive(Component)]
pub struct MicroViewLens {
    pub radius: f32,              // Pixels
    pub position: Vec2,           // Screen position
    pub target_layer: Entity,      // Layer being viewed
    pub target_node: Entity,       // Node being viewed (N_IB)
}
```

### 2.2 Boid System

**Boids represent molar ratios** - each boid represents a certain number of moles.

#### Boid Data Structure

```rust
#[derive(Component)]
pub struct Boid {
    pub position: Vec2,          // Position in lens (normalized 0-1)
    pub velocity: Vec2,          // Velocity (proportional to temperature)
    pub chemical_id: u32,        // Which chemical this boid represents
    pub size: f32,               // Visual size
    pub color: Color,            // Chemical color
}
```

#### Logarithmic Molar Ratio to Boid Count

**Formula:**

```
BoidCount = floor(A * log10(MolarRatio + B) + C)
```

Where:
- `A` = scaling factor
- `B` = offset to handle trace amounts
- `C` = base count

**Implementation:**

```rust
pub fn calculate_boid_count(molar_ratio: f64, total_moles: f64) -> usize {
    if total_moles == 0.0 {
        return 0;
    }

    let ratio = molar_ratio / total_moles;

    // Logarithmic scaling
    let log_ratio = (ratio + LOG_OFFSET).log10();
    let boid_count = (BOID_SCALE * log_ratio + BASE_BOID_COUNT).floor() as usize;

    // Clamp to reasonable range
    boid_count.min(MAX_BOIDS_PER_CHEMICAL).max(0)
}
```

**Parameters:**
- `LOG_OFFSET = 1e-9` (handles trace amounts)
- `BOID_SCALE = 50.0`
- `BASE_BOID_COUNT = 10`
- `MAX_BOIDS_PER_CHEMICAL = 1000`

**Trace Amount Handling (TBD):**

For very low concentrations (<1 ppm), options:
1. **Minimum Representation:** Always show at least 1 boid if present
2. **Threshold:** Don't show if below threshold
3. **Special Marker:** Show as single "trace" boid with different appearance

**Current Approach:** Use logarithmic scaling with offset to handle trace amounts, but exact visualization is TBD.

### 2.3 Kinetic Energy Visualization

**Boid velocity ∝ temperature:**

```rust
pub fn update_boid_velocities(
    mut boids: Query<&mut Boid>,
    temperature: f64,
    mut rng: ResMut<GlobalRng>,
) {
    // Base velocity from temperature
    let base_speed = (temperature / REFERENCE_TEMPERATURE) as f32 * BASE_SPEED;

    for mut boid in boids.iter_mut() {
        // Random direction with temperature-based speed
        let angle = rng.gen_range(0.0..(2.0 * std::f32::consts::PI));
        let speed = base_speed * rng.gen_range(0.8..1.2);  // Some variation

        boid.velocity = Vec2::new(
            angle.cos() * speed,
            angle.sin() * speed
        );
    }
}
```

**Reference:** `REFERENCE_TEMPERATURE = 298.15 K` (room temperature)

### 2.4 Reaction Visualization

#### Bonding (Synthesis)

When a reaction successfully converts matter, boids of Reactant A and Reactant B **magnetize** towards each other.

```rust
pub fn visualize_bonding(
    reaction: &Reaction,
    mut reactant_a_boids: Query<&mut Boid, With<ReactantA>>,
    mut reactant_b_boids: Query<&mut Boid, With<ReactantB>>,
) {
    // Find nearest pairs
    let pairs = find_nearest_pairs(&reactant_a_boids, &reactant_b_boids);

    for pair in pairs {
        // Magnetic attraction
        let direction = (pair.b.position - pair.a.position).normalize();
        let attraction = calculate_attraction(&pair.a, &pair.b);

        if let Ok(mut a) = reactant_a_boids.get_mut(pair.a_entity) {
            a.velocity += direction * attraction * ATTRACTION_STRENGTH;
        }
        if let Ok(mut b) = reactant_b_boids.get_mut(pair.b_entity) {
            b.velocity += direction * attraction * ATTRACTION_STRENGTH;
        }
    }
}
```

#### Flash (Collision)

They collide, emit a small pulse/flash (color coded to exothermic/endothermic), and merge into Product C.

```rust
pub fn visualize_collision(
    commands: &mut Commands,
    reactant_a: Entity,
    reactant_b: Entity,
    reaction: &Reaction,
    position: Vec2,
) {
    // Flash effect
    let flash_color = if reaction.enthalpy_change < 0.0 {
        Color::RED  // Exothermic (hot)
    } else {
        Color::BLUE // Endothermic (cold)
    };

    create_flash(commands, position, flash_color, FLASH_DURATION);

    // Merge into product
    let product = create_product_boid(commands, reaction.product, position);
    commands.entity(reactant_a).despawn();
    commands.entity(reactant_b).despawn();
}
```

#### Decomposition

A single boid vibrates violently and splits into two.

```rust
pub fn visualize_decomposition(
    commands: &mut Commands,
    reactant: Entity,
    reaction: &Reaction,
    position: Vec2,
    mut rng: ResMut<GlobalRng>,
) {
    // Violent vibration (handled by animation system)
    commands.entity(reactant).insert(Vibrating {
        strength: VIBRATION_STRENGTH,
        duration: VIBRATION_DURATION,
    });

    // Split into products
    let split_direction = Vec2::from_angle(rng.gen_range(0.0..(2.0 * std::f32::consts::PI)));
    let product1_pos = position + split_direction * SPLIT_DISTANCE;
    let product2_pos = position - split_direction * SPLIT_DISTANCE;

    let product1 = create_product_boid(commands, reaction.product1, product1_pos);
    let product2 = create_product_boid(commands, reaction.product2, product2_pos);

    commands.entity(reactant).despawn();
}
```

### 2.5 Phase State Visualization

#### Solid Phase

```rust
pub fn visualize_solid_phase(
    mut boids: Query<&mut Boid>,
    mut rng: ResMut<GlobalRng>,
) {
    // Lock into vibrating grid
    for mut boid in boids.iter_mut() {
        // Grid position
        let grid_position = snap_to_grid(boid.position, GRID_SIZE);

        // Vibrate around grid position
        let angle = rng.gen_range(0.0..(2.0 * std::f32::consts::PI));
        let distance = rng.gen_range(0.0..VIBRATION_AMPLITUDE);
        let vibration = Vec2::from_angle(angle) * distance;
        boid.position = grid_position + vibration;

        // Low velocity (vibration only)
        boid.velocity = vibration * VIBRATION_SPEED;
    }
}
```

**Effects:**
- **Grid Lock:** Boids snap to grid positions
- **Vibration:** Small random movements (thermal vibration)

#### Liquid Phase

```rust
pub fn visualize_liquid_phase(
    mut boids: Query<&mut Boid>,
    time: Res<Time>,
) {
    // Cluster loosely with cohesion
    for mut boid in boids.iter_mut() {
        // Cohesion: attract to nearby boids of same type
        let cohesion = calculate_cohesion(&boid, &boids);

        // Separation: avoid too close
        let separation = calculate_separation(&boid, &boids);

        // Alignment: match velocity with neighbors
        let alignment = calculate_alignment(&boid, &boids);

        // Combine forces
        let force = cohesion * COHESION_WEIGHT +
                   separation * SEPARATION_WEIGHT +
                   alignment * ALIGNMENT_WEIGHT;

        boid.velocity += force * time.delta_secs();
    }
}
```

**Effects:**
- **Cohesion:** Boids cluster together
- **Separation:** Avoid overcrowding
- **Alignment:** Smooth flow

#### Gas Phase

```rust
pub fn visualize_gas_phase(
    mut boids: Query<&mut Boid>,
    time: Res<Time>,
) {
    // Fly freely, bouncing off lens walls
    for mut boid in boids.iter_mut() {
        // Update position
        boid.position += boid.velocity * time.delta_secs();

        // Bounce off walls
        if boid.position.x < 0.0 || boid.position.x > 1.0 {
            boid.velocity.x *= -1.0;
            boid.position.x = boid.position.x.clamp(0.0, 1.0);
        }

        if boid.position.y < 0.0 || boid.position.y > 1.0 {
            boid.velocity.y *= -1.0;
            boid.position.y = boid.position.y.clamp(0.0, 1.0);
        }
    }
}
```

**Effects:**
- **Free Flight:** High velocity, random directions
- **Wall Bouncing:** Elastic collisions with lens boundaries

## 3. Performance Optimization

### 3.1 Boid Culling

- Only render boids within lens bounds
- Cull boids below visibility threshold

### 3.2 Level of Detail (LOD)

- Reduce boid count at distance
- Simplify boid rendering when many boids present

### 3.3 Shader Optimization

- Use GPU instancing for boids
- Batch similar boids together

## 4. Interaction Points

- **Simulation Topology** ([01_Simulation_Topology.md](01_Simulation_Topology.md)): Renders layers and nodes
- **Physics Engine** ([02_Physics_Engine.md](02_Physics_Engine.md)): Temperature affects boid velocity
- **Chemistry Engine** ([03_Chemistry_Engine.md](03_Chemistry_Engine.md)): Reactions trigger boid animations
- **Surface Physics** ([04_Surface_Physics.md](04_Surface_Physics.md)): N_IS renders as residue layer
- **Knowledge Analysis** ([05_Knowledge_Analysis.md](05_Knowledge_Analysis.md)): Displays analysis results in UI
