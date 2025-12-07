# Physics Engine: The Solver

## Overview

The Physics Engine implements the core physical simulation using **Double Precision (64-bit)** floating-point arithmetic to support a **1 ppm (10⁻⁶)** simulation floor. This precision is critical for accurate chemical calculations, especially for trace impurities and inhibitor detection.

## 1. Solver Architecture

### 1.1 Precision Requirements

```csharp
public const double SIMULATION_FLOOR = 1e-6;  // 1 ppm
public const double MIN_CONCENTRATION = 1e-6; // Minimum detectable concentration
public const double EPSILON = 1e-9;           // Numerical precision threshold
```

**Rationale:**
- Chemical reactions can be sensitive to trace impurities (>1 ppm)
- Inhibitor detection requires ppm-level precision
- Phase transitions need accurate temperature calculations
- Pressure calculations accumulate errors over many layers

### 1.2 Update Cycle

```pseudocode
function PhysicsUpdate(deltaTime):
    // 1. Heat conduction (fast, stable)
    UpdateHeatConduction(deltaTime)
    
    // 2. Pressure calculations (depends on temperature, composition)
    UpdatePressure()
    
    // 3. Convection (depends on temperature gradient)
    UpdateConvection(deltaTime)
    
    // 4. Transport dynamics (layer sorting, mixing)
    UpdateTransportDynamics(deltaTime)
    
    // 5. Phase transitions (depends on P, T)
    UpdatePhaseTransitions(deltaTime)
```

## 2. Thermodynamics

### 2.1 Heat Conduction

Heat propagates through the 5-node radial structure:

```
N_OB → N_OS → N_Mat → N_IS → N_IB
```

**Fourier's Law of Heat Conduction:**

```
q = -k * A * (dT/dx)
```

Where:
- `q` = heat flux (W)
- `k` = thermal conductivity (W/(m·K))
- `A` = cross-sectional area (m²)
- `dT/dx` = temperature gradient (K/m)

**Algorithm:**

```pseudocode
function UpdateHeatConduction(deltaTime):
    for each container in containers:
        for each layer in container.Layers:
            // Heat flow: N_OB → N_OS
            q_OB_OS = CalculateHeatFlow(
                layer.N_OB.Temperature,
                layer.N_OS.Temperature,
                layer.N_OB.ThermalConductivity,
                layer.N_OS.ThermalConductivity,
                ContactArea(layer.N_OB, layer.N_OS),
                Thickness(layer.N_OS)
            )
            
            // Heat flow: N_OS → N_Mat
            q_OS_Mat = CalculateHeatFlow(
                layer.N_OS.Temperature,
                layer.N_Mat.Temperature,
                layer.N_OS.ThermalConductivity,
                layer.N_Mat.ThermalConductivity,
                ContactArea(layer.N_OS, layer.N_Mat),
                layer.N_Mat.Thickness
            )
            
            // Heat flow: N_Mat → N_IS
            q_Mat_IS = CalculateHeatFlow(
                layer.N_Mat.Temperature,
                layer.N_IS.Temperature,
                layer.N_Mat.ThermalConductivity,
                layer.N_IS.ThermalConductivity,
                ContactArea(layer.N_Mat, layer.N_IS),
                layer.N_IS.Thickness
            )
            
            // Heat flow: N_IS → N_IB
            q_IS_IB = CalculateHeatFlow(
                layer.N_IS.Temperature,
                layer.N_IB.Temperature,
                layer.N_IS.ThermalConductivity,
                layer.N_IB.ThermalConductivity,
                ContactArea(layer.N_IS, layer.N_IB),
                CalculateEffectiveThickness(layer.N_IS)
            )
            
            // Update temperatures (conserving energy)
            UpdateNodeTemperature(layer.N_OB, -q_OB_OS, deltaTime)
            UpdateNodeTemperature(layer.N_OS, q_OB_OS - q_OS_Mat, deltaTime)
            UpdateNodeTemperature(layer.N_Mat, q_OS_Mat - q_Mat_IS, deltaTime)
            UpdateNodeTemperature(layer.N_IS, q_Mat_IS - q_IS_IB, deltaTime)
            UpdateNodeTemperature(layer.N_IB, q_IS_IB, deltaTime)
```

**Temperature Update:**

```pseudocode
function UpdateNodeTemperature(node, heatFlow, deltaTime):
    // Q = m * c * ΔT
    // ΔT = Q / (m * c)
    heatAdded = heatFlow * deltaTime  // Joules
    mass = node.Volume * node.Density
    specificHeat = GetSpecificHeat(node.Composition, node.Temperature)
    deltaT = heatAdded / (mass * specificHeat)
    node.Temperature += deltaT
```

### 2.2 Convection (Rayleigh-Bénard)

**Principle:** Temperature gradients drive fluid motion.

**Stability Criterion:**

```pseudocode
function CalculateConvection(layer, container):
    // Find temperature at bottom and top of layer
    T_bottom = GetTemperatureAtHeight(layer.BaseHeight)
    T_top = GetTemperatureAtHeight(layer.BaseHeight + layer.Height)
    
    deltaT = T_bottom - T_top
    
    if deltaT > 0:  // Bottom hotter than top
        // Unstable: convection occurs
        // Increase mixing factor (rolling boil)
        rayleighNumber = CalculateRayleighNumber(deltaT, layer.Height, layer.Density, layer.Viscosity)
        
        if rayleighNumber > CRITICAL_RAYLEIGH:
            // Turbulent convection
            layer.MixingFactor = 1.0 + (rayleighNumber / CRITICAL_RAYLEIGH) * 0.5
        else:
            // Laminar convection
            layer.MixingFactor = 1.0 + (rayleighNumber / CRITICAL_RAYLEIGH) * 0.2
    else:  // T_bottom < T_top
        // Stable: fluid stratifies
        layer.MixingFactor = 0.1  // Minimal mixing
```

**Rayleigh Number:**

```
Ra = (g * β * ΔT * L³) / (ν * α)
```

Where:
- `g` = gravitational acceleration (9.81 m/s²)
- `β` = thermal expansion coefficient (1/K)
- `ΔT` = temperature difference (K)
- `L` = characteristic length (layer height, m)
- `ν` = kinematic viscosity (m²/s)
- `α` = thermal diffusivity (m²/s)

**Critical Rayleigh Number:** `Ra_c ≈ 1708` (for horizontal layer)

### 2.3 MixingRate vs MixingFactor

**Clarification:**
- **MixingRate**: Rate of change of mixing (1/s) - how fast layers mix
- **MixingFactor**: Multiplier for reaction rates and diffusion (dimensionless)

**MixingRate Calculation:**

```pseudocode
function CalculateMixingRate(layer, agitation):
    baseRate = 0.0  // No mixing by default
    
    // Agitation contribution
    if agitation > 0:
        baseRate += agitation * AGITATION_COEFFICIENT
    
    // Convection contribution
    if layer.MixingFactor > 1.0:
        baseRate += (layer.MixingFactor - 1.0) * CONVECTION_COEFFICIENT
    
    // Density-driven mixing (for miscible liquids)
    if layer.Type == Gradient:
        densityGradient = CalculateDensityGradient(layer)
        baseRate += densityGradient * DIFFUSION_COEFFICIENT
    
    return Clamp(baseRate, 0.0, MAX_MIXING_RATE)
```

**MixingFactor Application:**

```pseudocode
// Used in reaction rate law (see Chemistry Engine)
effectiveRate = baseRate * MixingFactor

// Used in diffusion calculations
effectiveDiffusion = baseDiffusion * MixingFactor
```

### 2.4 Phase Space

**State Determination:** Phase determined by `P` (pressure) and `T` (temperature) lookup.

#### Antoine Equation (Vapor Pressure)

```
log₁₀(P) = A - B / (T + C)
```

Where:
- `P` = vapor pressure (mmHg or Pa)
- `T` = temperature (K or °C, depending on constants)
- `A`, `B`, `C` = Antoine constants (substance-specific)

**Phase Lookup:**

```pseudocode
function DeterminePhase(composition, pressure, temperature):
    // Check if above critical point
    if temperature > composition.CriticalTemperature AND pressure > composition.CriticalPressure:
        return Phase.Supercritical
    
    // Calculate vapor pressure
    vaporPressure = CalculateAntoine(composition, temperature)
    
    if pressure < vaporPressure:
        return Phase.Gas
    else:
        // Check fusion curve for solid
        meltingPoint = CalculateMeltingPoint(composition, pressure)
        if temperature < meltingPoint:
            return Phase.Solid
        else:
            return Phase.Liquid
```

#### Fusion Curve

```
T_melt = T_melt₀ + (dT/dP) * (P - P₀)
```

Where:
- `T_melt₀` = melting point at reference pressure
- `dT/dP` = pressure dependence (typically small, ~0.01 K/bar)

### 2.5 Latent Heat

During phase transitions, temperature plateaus while latent heat is absorbed/released.

**Algorithm:**

```pseudocode
function UpdatePhaseTransition(node, deltaTime):
    currentPhase = DeterminePhase(node.Composition, node.Pressure, node.Temperature)
    
    if currentPhase != node.State:
        // Phase transition occurring
        latentHeat = GetLatentHeat(node.Composition, node.State, currentPhase)
        heatRequired = node.Mass * latentHeat
        
        // Calculate heat available
        heatAvailable = CalculateHeatFlowIntoNode(node) * deltaTime
        
        if heatAvailable >= heatRequired:
            // Complete transition
            node.State = currentPhase
            // Temperature adjusts to new phase
        else:
            // Partial transition
            transitionFraction = heatAvailable / heatRequired
            // Temperature remains at transition point
            node.Temperature = GetTransitionTemperature(node.Composition, node.State, currentPhase)
            // Update composition (partial phase change)
            UpdatePartialPhaseChange(node, transitionFraction)
    else:
        // Normal temperature update
        UpdateNodeTemperature(node, heatFlow, deltaTime)
```

**Latent Heat Values:**
- **Fusion (solid ↔ liquid):** ~334 kJ/kg (water)
- **Vaporization (liquid ↔ gas):** ~2257 kJ/kg (water)
- **Sublimation (solid ↔ gas):** Sum of fusion + vaporization

### 2.6 Supercriticality

Above the critical point, the meniscus vanishes and the fluid becomes a high-density solvent.

**Critical Point Properties:**

```csharp
public struct CriticalPoint
{
    public double Temperature;  // Critical temperature (K)
    public double Pressure;     // Critical pressure (Pa)
    public double Density;      // Critical density (kg/m³)
}
```

**Supercritical Behavior:**

```pseudocode
function HandleSupercritical(node):
    if node.State == Phase.Supercritical:
        // No meniscus (gas-liquid interface)
        // High density (liquid-like)
        // High diffusivity (gas-like)
        node.Density = InterpolateDensity(node.Temperature, node.Pressure, criticalPoint)
        node.Viscosity = CalculateSupercriticalViscosity(node.Temperature, node.Pressure)
        node.Diffusivity = CalculateSupercriticalDiffusivity(node.Temperature, node.Pressure)
        
        // Enhanced solvent properties
        node.SolventPower = CalculateSolventPower(node.Temperature, node.Pressure)
```

## 3. Hydrostatics & Displacement

### 3.1 Pressure Calculations

**Total Pressure:**

```
P_Total = P_Gas + (ρ * g * h)
```

Where:
- `P_Gas` = gas pressure at surface (Pa)
- `ρ` = fluid density (kg/m³)
- `g` = gravitational acceleration (9.81 m/s²)
- `h` = depth from surface (m)

**Algorithm:**

```pseudocode
function CalculatePressure(layer, container):
    // Gas pressure at surface
    surfaceLayer = GetSurfaceLayer(container)
    P_gas = CalculateGasPressure(surfaceLayer)
    
    // Hydrostatic pressure
    depth = layer.BaseHeight - surfaceLayer.BaseHeight
    rho = layer.Density
    
    P_hydrostatic = rho * GRAVITY * depth
    
    // Total pressure
    layer.Pressure = P_gas + P_hydrostatic
    
    // Update all nodes in layer
    for each node in [N_IB, N_IS, N_Mat, N_OS, N_OB]:
        node.Pressure = layer.Pressure
```

**Gas Pressure (Ideal Gas Law):**

```pseudocode
function CalculateGasPressure(layer):
    // P = nRT / V
    gasMoles = GetGasMoles(layer.Composition)
    volume = layer.N_IB.Volume  // Gas occupies bulk volume
    temperature = layer.Temperature
    
    R = 8.314  // Gas constant (J/(mol·K))
    P = (gasMoles * R * temperature) / volume
    
    return P
```

### 3.2 Archimedes Displacement

Solid objects displace fluid, raising the liquid level.

**Displacement Calculation:**

```pseudocode
function CalculateDisplacement(solidObject, container):
    totalDisplacedVolume = 0.0
    
    for each layer in solidObject.IntersectingLayers:
        // Calculate intersection volume
        intersectionHeight = CalculateIntersectionHeight(solidObject, layer)
        objectCrossSection = CalculateCrossSection(solidObject, layer.BaseHeight)
        displacedVolume = objectCrossSection * intersectionHeight
        totalDisplacedVolume += displacedVolume
        
        // Update layer (dilute with "displaced" fluid)
        // This creates a pressure increase
        UpdateLayerForDisplacement(layer, displacedVolume)
    
    // Raise global liquid level
    levelIncrease = totalDisplacedVolume / container.Geometry.CrossSectionalArea(container.CurrentLiquidLevel)
    container.CurrentLiquidLevel += levelIncrease
    
    return totalDisplacedVolume
```

**Buoyant Force:**

```pseudocode
function CalculateBuoyantForce(solidObject, container):
    displacedVolume = CalculateDisplacement(solidObject, container)
    fluidDensity = GetAverageDensity(solidObject.IntersectingLayers)
    buoyantForce = displacedVolume * fluidDensity * GRAVITY
    
    return buoyantForce
```

### 3.3 Thermal Bridge Effect

Solid objects conduct heat between layers (see [01_Simulation_Topology.md](01_Simulation_Topology.md#thermal-bridge-effect)).

## 4. Transport Dynamics: The "Lava Lamp"

### 4.1 Layer Sorting Algorithm

Layers attempt to order by density (Gas > Oil > Water > Solid).

**Density-Based Sorting:**

```pseudocode
function SortLayersByDensity(container):
    // Sort layers by average density (ascending: lightest on top)
    sortedLayers = Sort(container.Layers, key: layer => layer.Density)
    
    // Recalculate base heights
    currentHeight = 0.0
    for each layer in sortedLayers:
        layer.BaseHeight = currentHeight
        currentHeight += layer.Height
    
    container.Layers = sortedLayers
```

**Sorting Frequency:**

```pseudocode
function UpdateLayerSorting(container, deltaTime):
    // Only sort if significant density differences exist
    for i in range(0, container.Layers.Count - 1):
        densityDiff = container.Layers[i+1].Density - container.Layers[i].Density
        
        if densityDiff < -DENSITY_THRESHOLD:  // Lower layer is lighter
            // Unstable: trigger sorting
            SortLayersByDensity(container)
            break
```

### 4.2 Gradient Formation

**Immiscible Liquids (Oil/Water):**

```pseudocode
function UpdateImmiscibleGradient(layer):
    // Zero-height gradient (sharp interface)
    if layer.Type == Gradient:
        // Check if layers should merge
        if layer.MixingRate < MIN_MIXING_RATE:
            layer.Height = MIN_GRADIENT_HEIGHT  // ~1 mm
        else:
            // Some mixing occurring (emulsion)
            layer.Height = CalculateGradientHeight(layer.MixingRate, layer.DensityDelta)
```

**Miscible Liquids (Syrup/Water):**

```pseudocode
function UpdateMiscibleGradient(layer, deltaTime):
    // Tall gradient (slow mixing)
    if layer.Type == Gradient:
        // Height increases with mixing rate
        baseHeight = MIN_GRADIENT_HEIGHT
        mixingContribution = (layer.MixingRate / layer.DensityDelta) * deltaTime
        
        layer.Height = baseHeight + mixingContribution
        
        // Check merge threshold (TBD: exact value)
        if layer.Height > MERGE_THRESHOLD:
            MergeLayers(layer, adjacentLayers)
```

**Gradient Height Formula:**

```
GradientHeight = BaseHeight + (MixingRate / DensityDelta) * TimeStep
```

Where:
- `BaseHeight` = minimum interface thickness (1-5 mm)
- `MixingRate` = rate of mixing (1/s)
- `DensityDelta` = density difference (kg/m³)
- `TimeStep` = simulation timestep (s)

### 4.3 Agitation Effects

**Agitation increases gradient height until layers merge (emulsion):**

```pseudocode
function ApplyAgitation(layer, agitationLevel):
    // Agitation increases mixing rate
    baseMixingRate = layer.MixingRate
    agitationContribution = agitationLevel * AGITATION_MIXING_COEFFICIENT
    
    layer.MixingRate = baseMixingRate + agitationContribution
    
    // For gradient layers, agitation increases height
    if layer.Type == Gradient:
        layer.Height += agitationContribution * deltaTime
    
    // Check for emulsion (full merge)
    if layer.Height > EMULSION_THRESHOLD:
        CreateEmulsion(layer, adjacentLayers)
```

**Emulsion Creation:**

```pseudocode
function CreateEmulsion(gradientLayer, adjacentLayers):
    // Combine layers into single homogeneous layer
    newComposition = BlendCompositions(gradientLayer, adjacentLayers)
    newLayer = CreatePureLayer(newComposition)
    
    // Replace gradient and adjacent layers with emulsion
    ReplaceLayers([gradientLayer] + adjacentLayers, newLayer)
```

## 5. Performance Optimization

### 5.1 Lookup Tables

**Phase Space Lookup:**

```csharp
// Precompute phase boundaries
public class PhaseLookupTable
{
    private Dictionary<CompositionId, CriticalPoint> criticalPoints;
    private Dictionary<CompositionId, AntoineConstants> antoineConstants;
    
    public Phase LookupPhase(CompositionId id, double pressure, double temperature)
    {
        // Fast lookup instead of calculation
        // ...
    }
}
```

### 5.2 Caching

- Cache layer density calculations (only recalculate when composition changes)
- Cache surface area calculations for common geometries
- Cache thermal conductivity values

### 5.3 Update Frequency

- Heat conduction: Every tick (fast, stable)
- Pressure: Every tick (depends on temperature)
- Convection: Every 2-3 ticks (slower changes)
- Layer sorting: Only when density order changes
- Phase transitions: Every tick (critical for accuracy)

## 6. Edge Cases

### 6.1 Zero Pressure

- Vacuum conditions: `P_Gas = 0`
- Boiling point decreases (lower pressure = lower boiling point)

### 6.2 Negative Pressure

- Can occur in sealed containers with cooling
- Handle as tension (may cause cavitation)

### 6.3 Density Inversion

- Water at 4°C has maximum density
- Below 4°C, density decreases (ice floats)
- Handle special cases for water

### 6.4 Very Thin Layers

- Minimum layer height: `1e-6 m` (1 μm)
- Below threshold: merge with adjacent layer

## 7. Interaction Points

- **Simulation Topology** ([01_Simulation_Topology.md](01_Simulation_Topology.md)): Uses layer and node structure
- **Chemistry Engine** ([03_Chemistry_Engine.md](03_Chemistry_Engine.md)): Temperature and pressure affect reaction rates
- **Surface Physics** ([04_Surface_Physics.md](04_Surface_Physics.md)): Heat conduction through N_Mat affects N_IS
- **Visualization** ([06_Visualization.md](06_Visualization.md)): Temperature affects boid velocity

