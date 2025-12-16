# Simulation Topology: The Coaxial Layered Stack

## Overview

The simulation topology defines the fundamental structure of the chemistry simulator. Instead of a fixed grid, the system uses a dynamic, physically interconnected graph of **Container Nodes** (glassware) and **Solid Objects**. Each container's content is represented as a vertical stack of layers that evolves every simulation tick.

## 1. Container Node Graph Structure

### 1.1 ContainerNode Data Structure

```csharp
public struct ContainerNode : IComponentData
{
    public EntityId Id;
    public ContainerType Type;  // Beaker, Flask, Y-Adapter, etc.
    public Geometry Geometry;
    public List<EntityId> Connections;  // Connected container IDs
    public List<LayerEntity> Layers;    // Vertical stack of layers
    public List<SolidObject> AnchoredObjects;  // Thermometers, stir bars, etc.
    public double TotalHeight;  // Container height in meters
    public double CurrentLiquidLevel;  // Height of liquid surface
}
```

### 1.2 Container Types

```csharp
public enum ContainerType
{
    Beaker,           // Open top, wide base
    Flask,            // Narrow neck, wide base
    TestTube,         // Narrow, tall
    YAdapter,         // Branching connector
    Condenser,        // Long, narrow, with cooling jacket
    Bath,             // Wide, shallow (horizontal expansion)
    SealedVessel      // Closed system (pressure vessel)
}
```

### 1.3 Geometry Structure

```csharp
public struct Geometry
{
    public double BaseRadius;      // Radius at bottom (meters)
    public double TopRadius;        // Radius at top (meters)
    public double Height;           // Total height (meters)
    public double WallThickness;    // Material thickness (meters)
    public MaterialType Material;   // Glass, Copper, etc.

    // Calculated properties
    public double Volume => CalculateVolume();
    public double SurfaceArea => CalculateSurfaceArea();
    public double CrossSectionalArea(double height) => CalculateCrossSection(height);
}
```

### 1.4 Connectivity

Containers connect via **Connection Points** that define flow paths:

```csharp
public struct ConnectionPoint
{
    public EntityId SourceContainer;
    public EntityId TargetContainer;
    public double Height;           // Connection height from base
    public double Diameter;          // Pipe diameter
    public ConnectionType Type;      // Open, Valve, Capillary
}
```

**Branching Logic:**
- Y-Adapters and similar branching containers support N connections
- Flow splits based on pressure differential (ΔP) across each path
- Flow direction determined by: `Flow = k * ΔP / Resistance`

Where:
- `k` = flow coefficient (depends on connection diameter, viscosity)
- `ΔP` = pressure difference between containers
- `Resistance` = frictional resistance (TBD: exact formula)

## 2. Vertical Structure: Dynamic Slicing

### 2.1 LayerEntity Data Structure

```csharp
public struct LayerEntity : IComponentData
{
    public EntityId Id;
    public LayerType Type;
    public double Height;              // Layer height in meters
    public double BaseHeight;          // Height from container base
    public Composition Composition;    // Chemical composition
    public PhysicalState State;        // Solid, Liquid, Gas, Supercritical
    public double Temperature;         // Temperature in Kelvin
    public double Density;             // Average density (kg/m³)
    public double Viscosity;           // Dynamic viscosity (Pa·s)
    public double SurfaceTension;      // Surface tension (N/m)

    // For gradient layers
    public double MixingRate;          // Rate of mixing (1/s)
    public double DensityDelta;        // Density difference driving separation

    // For transient layers
    public double Velocity;            // Vertical velocity (m/s)
    public TransientType TransientType; // Bubble, Precipitate, etc.
}
```

### 2.2 Layer Types

```csharp
public enum LayerType
{
    Pure,        // Homogeneous mixture (e.g., "Water")
    Gradient,    // Transition zone (e.g., "Oil/Water Interface")
    Transient    // Moving phase (e.g., "Bubble Swarm")
}
```

#### Pure Layer
- Single homogeneous composition
- Height determined by volume and container cross-section
- Stable unless mixing occurs

#### Gradient Layer
- Transition zone between two immiscible or slowly mixing liquids
- Height varies based on `MixingRate` vs `DensityDelta`
- **Height Calculation Formula:**

  ```
  GradientHeight = BaseHeight + (MixingRate / DensityDelta) * TimeStep
  ```

  Where:
  - `BaseHeight` = minimum interface thickness (typically 1-5 mm)
  - `MixingRate` = rate of mixing (increases with agitation)
  - `DensityDelta` = density difference between layers (kg/m³)
  - `TimeStep` = simulation timestep (seconds)

- For immiscible liquids (Oil/Water): `MixingRate ≈ 0` → Zero-height gradient (sharp line)
- For miscible liquids (Syrup/Water): `MixingRate > 0` → Tall gradient (slow mixing)
- When `GradientHeight` exceeds layer merge threshold (TBD), layers combine

#### Transient Layer
- Moving phases (bubbles rising, precipitates falling)
- Has velocity component
- Can span multiple vertical positions
- Examples:
  - **Bubble Swarm**: Gas bubbles rising through liquid
  - **Precipitate Cloud**: Solid particles falling
  - **Convection Cell**: Hot fluid rising, cool fluid falling

### 2.3 Layer Height Management

**Constraint:** Layer heights must sum to container liquid level (plus any overflow)

```
Σ(Layer.Height) ≤ Container.CurrentLiquidLevel
```

**Overflow Behavior:** (TBD - can layers exceed container height?)

**Height Calculation Algorithm:**

```pseudocode
function UpdateLayerHeights(container):
    totalVolume = 0
    for each layer in container.Layers:
        layerVolume = CalculateLayerVolume(layer, container.Geometry)
        totalVolume += layerVolume

    currentLevel = VolumeToHeight(totalVolume, container.Geometry)
    container.CurrentLiquidLevel = currentLevel

    // Adjust gradient layers based on mixing
    for each gradientLayer in container.Layers where Type == Gradient:
        densityDelta = CalculateDensityDelta(gradientLayer, adjacentLayers)
        mixingRate = CalculateMixingRate(gradientLayer, agitation)
        gradientLayer.Height = BaseHeight + (mixingRate / densityDelta) * TimeStep
        gradientLayer.Height = Clamp(gradientLayer.Height, MinHeight, MaxHeight)
```

## 3. Radial Structure: The 5-Node Slice

Every vertical layer is horizontally sliced into **5 Interacting Volumes** to simulate material properties, heat transfer, and cleaning.

### 3.1 Node Definitions

```csharp
public struct RadialNode : IComponentData
{
    public NodeType Type;
    public EntityId LayerId;      // Parent layer
    public double Volume;         // Node volume (m³)
    public double Temperature;    // Node temperature (K)
    public Composition Composition;
    public double Thickness;      // For surface nodes (meters)
}
```

```csharp
public enum NodeType
{
    InnerBulk,      // N_IB: Main fluid volume
    InnerSurface,   // N_IS: Boundary film (~50 μm)
    Material,       // N_Mat: Physical wall (Glass/Copper)
    OuterSurface,   // N_OS: External boundary
    OuterBulk       // N_OB: Environment (Air, Vacuum, Water Bath)
}
```

### 3.2 Volume Calculations

**Geometric Calculation Approach:**

For **surface nodes** (N_IS, N_OS):
```
Volume = SurfaceArea × Thickness
```

Where:
- `SurfaceArea` = contact area with adjacent node
- `Thickness` = node thickness (e.g., N_IS ≈ 50 μm)

For **bulk nodes** (N_IB, N_OB):
```
Volume = LayerVolume - (N_IS.Volume + N_Mat.Volume + N_OS.Volume)
```

For **material node** (N_Mat):
```
Volume = WallThickness × SurfaceArea
```

**Example Calculation:**

```pseudocode
function CalculateNodeVolumes(layer, container):
    layerVolume = CalculateLayerVolume(layer, container)
    surfaceArea = CalculateSurfaceArea(layer, container)

    // N_IS: Inner surface film
    nIS.Thickness = CalculateSurfaceThickness(layer.Viscosity, layer.SurfaceTension)
    nIS.Volume = surfaceArea * nIS.Thickness

    // N_Mat: Material wall
    nMat.Volume = container.Geometry.WallThickness * surfaceArea

    // N_OS: Outer surface
    nOS.Thickness = CalculateOuterSurfaceThickness(container, environment)
    nOS.Volume = CalculateOuterSurfaceArea(container) * nOS.Thickness

    // N_IB: Inner bulk (remaining volume)
    nIB.Volume = layerVolume - nIS.Volume - nMat.Volume

    // N_OB: Outer bulk (environment)
    nOB.Volume = CalculateEnvironmentVolume(container)  // Typically infinite/very large
```

### 3.3 Node Interactions

**Heat Conduction Path:**
```
N_OB → N_OS → N_Mat → N_IS → N_IB
```

**Material Transfer:**
- N_IB ↔ N_IS: Diffusion (cleaning, residue)
- N_IS → N_Mat: Corrosion
- N_Mat → N_IS: Material dissolution (if material is reactive)

**Surface Chemistry:**
- Heterogeneous catalysis occurs in N_IS
- Reactants must diffuse from N_IB to N_IS

## 4. Solid Objects: Anchored Entities

### 4.1 SolidObject Data Structure

```csharp
public struct SolidObject : IComponentData
{
    public EntityId Id;
    public SolidType Type;        // Thermometer, StirBar, Ingot, etc.
    public Geometry Geometry;      // Position, size, shape
    public EntityId ContainerId;   // Container it's in
    public double BaseHeight;      // Height of object base from container base
    public double Height;           // Object height
    public MaterialType Material;
    public double ThermalConductivity;

    // Calculated: which layers this object intersects
    public List<EntityId> IntersectingLayers;
}
```

### 4.2 Intersection Logic

**Rule:** Solid objects span all layers they physically intersect.

```pseudocode
function CalculateIntersections(solidObject, container):
    intersectingLayers = []
    objectTop = solidObject.BaseHeight + solidObject.Height
    objectBottom = solidObject.BaseHeight

    for each layer in container.Layers:
        layerTop = layer.BaseHeight + layer.Height
        layerBottom = layer.BaseHeight

        if (objectBottom < layerTop) AND (objectTop > layerBottom):
            intersectingLayers.Add(layer.Id)
            // Displace fluid in this layer
            DisplaceFluid(layer, solidObject, container)

    solidObject.IntersectingLayers = intersectingLayers
```

### 4.3 Displacement Calculation

**Archimedes Principle:**

```pseudocode
function DisplaceFluid(layer, solidObject, container):
    // Calculate volume of object within this layer
    intersectionHeight = Min(layerTop, objectTop) - Max(layerBottom, objectBottom)
    objectCrossSection = CalculateCrossSection(solidObject, layer.BaseHeight)
    displacedVolume = objectCrossSection * intersectionHeight

    // Raise liquid level
    container.CurrentLiquidLevel += displacedVolume / container.Geometry.CrossSectionalArea(layer.BaseHeight)

    // Update layer composition (dilute with "displaced" fluid)
    // This is handled by the physics engine
```

### 4.4 Thermal Bridge Effect

Solid objects conduct heat between layers:

```pseudocode
function ApplyThermalBridge(solidObject, container):
    if solidObject.IntersectingLayers.Count < 2:
        return  // No bridge if only one layer

    // Calculate heat flow through object
    topLayer = GetTopLayer(solidObject.IntersectingLayers)
    bottomLayer = GetBottomLayer(solidObject.IntersectingLayers)

    deltaT = topLayer.Temperature - bottomLayer.Temperature
    heatFlow = solidObject.ThermalConductivity * solidObject.CrossSection * deltaT / solidObject.Height

    // Distribute heat (handled by physics engine)
    TransferHeat(topLayer, bottomLayer, heatFlow)
```

## 5. Horizontal Expansion: Wide Containers

### 5.1 Bath Containers

Wide, shallow containers (Baths) allow horizontal neighbors:

```csharp
public struct HorizontalNeighbor
{
    public EntityId NeighborContainerId;
    public double ContactArea;      // Area of contact
    public double ContactHeight;    // Height of contact interface
}
```

**Interaction Rules:** (TBD - specific mechanics)

- Generally interact via N_OB layer of immersed objects
- Direct fluid connection if containers are open and connected
- Heat transfer through N_OB → N_OS interface

## 6. Geometry Calculations

### 6.1 Volume Calculations

```csharp
public double CalculateVolume(Geometry geometry)
{
    // Truncated cone volume
    if (geometry.BaseRadius != geometry.TopRadius)
    {
        return (Math.PI * geometry.Height / 3.0) *
               (geometry.BaseRadius * geometry.BaseRadius +
                geometry.BaseRadius * geometry.TopRadius +
                geometry.TopRadius * geometry.TopRadius);
    }
    // Cylinder
    return Math.PI * geometry.BaseRadius * geometry.BaseRadius * geometry.Height;
}
```

### 6.2 Surface Area Calculations

```csharp
public double CalculateSurfaceArea(Geometry geometry, double height)
{
    double radiusAtHeight = InterpolateRadius(geometry, height);
    // Lateral surface area of truncated cone
    double slantHeight = Math.Sqrt(
        geometry.Height * geometry.Height +
        Math.Pow(geometry.TopRadius - geometry.BaseRadius, 2)
    );
    return Math.PI * (geometry.BaseRadius + geometry.TopRadius) * slantHeight;
}
```

### 6.3 Cross-Sectional Area

```csharp
public double CalculateCrossSection(Geometry geometry, double height)
{
    double radius = InterpolateRadius(geometry, height);
    return Math.PI * radius * radius;
}
```

## 7. Node Connection Algorithms

### 7.1 Flow Splitting (TBD: Exact Formula)

**Basic Approach:**

```pseudocode
function CalculateFlowSplit(sourceContainer, connections):
    totalResistance = 0
    for each connection in connections:
        connection.Resistance = CalculateResistance(connection, fluidViscosity)
        totalResistance += 1.0 / connection.Resistance

    for each connection in connections:
        conductance = 1.0 / connection.Resistance
        flowFraction = conductance / totalResistance

        deltaP = CalculatePressureDifference(sourceContainer, connection.TargetContainer)
        connection.Flow = flowFraction * k * deltaP / connection.Resistance
```

**TBD:** Exact formula for resistance calculation and flow coefficient `k`.

## 8. Performance Considerations

### 8.1 Spatial Partitioning

For large numbers of containers, consider spatial partitioning:
- Grid-based partitioning for collision detection
- Quadtree for 2D spatial queries
- Only check connections for nearby containers

### 8.2 Layer Caching

- Cache layer height calculations when composition doesn't change
- Only recalculate when mixing occurs or layers are modified
- Precompute surface areas for common container geometries

### 8.3 Update Frequency

- Not all 5 radial nodes need full simulation every tick
- N_Mat and N_OS may update less frequently (thermal mass)
- N_IB and N_IS require per-tick updates (active chemistry)

## 9. Edge Cases

### 9.1 Empty Containers

- Container with no layers: `CurrentLiquidLevel = 0`
- All nodes exist but have zero volume/composition

### 9.2 Overflow

- **TBD:** Can layers exceed container height?
- If yes: implement overflow mechanics (spill to N_OB or connected containers)
- If no: enforce height constraint, potentially creating pressure

### 9.3 Zero-Height Layers

- Gradient layers can approach zero height (sharp interface)
- Minimum height threshold: `MinLayerHeight = 1e-6 m` (1 μm)

### 9.4 Branching Edge Cases

- Circular connections (A → B → C → A): handle pressure loops
- Dead-end branches: pressure builds until equilibrium

## 10. Interaction Points

- **Physics Engine** ([02_Physics_Engine.md](02_Physics_Engine.md)): Uses layer structure for heat transfer, pressure calculations
- **Chemistry Engine** ([03_Chemistry_Engine.md](03_Chemistry_Engine.md)): Reactions occur in N_IB or N_IS nodes
- **Surface Physics** ([04_Surface_Physics.md](04_Surface_Physics.md)): Manages N_IS thickness and properties
- **Visualization** ([06_Visualization.md](06_Visualization.md)): Renders layers and nodes in 5-layer shader
