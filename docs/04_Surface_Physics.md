# Surface Physics: Evolution & Crusting

## Overview

Surface Physics manages the dynamic behavior of the **N_IS (Inner Surface)** node, which represents the boundary film between the bulk fluid (N_IB) and the container wall (N_Mat). This layer handles wetting, residue accumulation, heterogeneous catalysis, nucleation, and can solidify into crusts that detach and create new containers.

## 1. Dynamic Thickness

### 1.1 N_IS Thickness Calculation

N_IS thickness is variable and depends on **Viscosity** and **Surface Tension**.

**Base Thickness Formula:**

```
Thickness = BaseThickness + ViscosityTerm + SurfaceTensionTerm
```

Where:
- `BaseThickness` = minimum film thickness (~50 μm)
- `ViscosityTerm` = contribution from fluid viscosity
- `SurfaceTensionTerm` = contribution from surface tension

**Detailed Calculation:**

```pseudocode
function CalculateNISThickness(layer):
    baseThickness = 50e-6  // 50 μm base thickness
    
    // Viscosity contribution (higher viscosity = thicker film)
    viscosity = layer.N_IB.Viscosity
    viscosityTerm = (viscosity / REFERENCE_VISCOSITY) * VISCOSITY_THICKNESS_COEFFICIENT
    
    // Surface tension contribution (lower surface tension = thicker film)
    surfaceTension = layer.N_IB.SurfaceTension
    surfaceTensionTerm = (1.0 - surfaceTension / REFERENCE_SURFACE_TENSION) * SURFACE_TENSION_COEFFICIENT
    
    // Wetting angle effect (better wetting = thinner film)
    wettingAngle = CalculateWettingAngle(layer.N_IB.Composition, layer.N_Mat.Material)
    wettingTerm = (wettingAngle / 180.0) * WETTING_THICKNESS_COEFFICIENT
    
    thickness = baseThickness + viscosityTerm - surfaceTensionTerm + wettingTerm
    
    // Clamp to reasonable range
    thickness = Clamp(thickness, MIN_NIS_THICKNESS, MAX_NIS_THICKNESS)
    
    return thickness
```

**Reference Values:**
- `REFERENCE_VISCOSITY` = 1.0 × 10⁻³ Pa·s (water at 20°C)
- `REFERENCE_SURFACE_TENSION` = 0.072 N/m (water-air)
- `MIN_NIS_THICKNESS` = 1 × 10⁻⁶ m (1 μm)
- `MAX_NIS_THICKNESS` = 5 × 10⁻³ m (5 mm, before crusting)

### 1.2 Wetting Angle

**Young's Equation:**

```
γ_sv = γ_sl + γ_lv * cos(θ)
```

Where:
- `γ_sv` = solid-vapor surface tension
- `γ_sl` = solid-liquid surface tension
- `γ_lv` = liquid-vapor surface tension
- `θ` = contact angle (wetting angle)

**Wetting Angle Calculation:**

```pseudocode
function CalculateWettingAngle(composition, material):
    // Lookup surface tensions
    gamma_sv = GetSolidVaporTension(material)
    gamma_sl = GetSolidLiquidTension(material, composition)
    gamma_lv = GetLiquidVaporTension(composition)
    
    // Calculate contact angle
    cos_theta = (gamma_sv - gamma_sl) / gamma_lv
    cos_theta = Clamp(cos_theta, -1.0, 1.0)
    theta = acos(cos_theta)
    
    return theta  // In degrees
```

**Wetting Behavior:**
- `θ < 90°`: Good wetting (hydrophilic) → thinner film
- `θ > 90°`: Poor wetting (hydrophobic) → thicker film
- `θ = 0°`: Perfect wetting → minimum film thickness

## 2. Cleaning: Serial Dilution

Cleaning requires **Serial Dilution**. Solvent in N_IB diffuses into N_IS to dilute residue.

### 2.1 Dilution Mechanism

```pseudocode
function ApplySerialDilution(layer, deltaTime):
    // Check if solvent is present in N_IB
    solventConcentration = GetSolventConcentration(layer.N_IB.Composition)
    
    if solventConcentration < MIN_SOLVENT_CONCENTRATION:
        return  // No cleaning
    
    // Residue in N_IS
    residueMass = GetResidueMass(layer.N_IS.Composition)
    
    if residueMass < MIN_RESIDUE_MASS:
        return  // Already clean
    
    // Diffusion of solvent into N_IS
    diffusionRate = CalculateDiffusion(layer.N_IB, layer.N_IS, solvent)
    
    // Dilution rate (TBD: exact formula)
    // Simplified: solvent diffuses in, dilutes residue
    dilutionRate = diffusionRate * DILUTION_COEFFICIENT
    
    // Remove residue (diluted away)
    residueRemoved = Min(dilutionRate * deltaTime, residueMass)
    RemoveFromComposition(layer.N_IS.Composition, residue, residueRemoved)
    
    // Add solvent to N_IS (dilution)
    AddToComposition(layer.N_IS.Composition, solvent, residueRemoved)
    
    // Update thickness (residue removal reduces thickness)
    thicknessReduction = residueRemoved / (RESIDUE_DENSITY * layer.N_IS.SurfaceArea)
    layer.N_IS.Thickness -= thicknessReduction
```

**Serial Dilution Algorithm (TBD: Specifics):**

The exact mechanics of serial dilution are TBD. The general principle is:
1. Solvent in N_IB diffuses into N_IS
2. Residue in N_IS is diluted by solvent
3. Diluted residue diffuses back to N_IB
4. Process repeats until residue concentration is below threshold

**Multiple Cleaning Cycles:**

```pseudocode
function PerformSerialDilution(layer, numCycles):
    for cycle in range(0, numCycles):
        // Add fresh solvent to N_IB
        AddSolvent(layer.N_IB, CLEANING_SOLVENT_VOLUME)
        
        // Wait for diffusion (simulate time)
        for step in range(0, DIFFUSION_STEPS):
            ApplySerialDilution(layer, DIFFUSION_TIMESTEP)
        
        // Check if clean
        residueMass = GetResidueMass(layer.N_IS.Composition)
        if residueMass < CLEAN_THRESHOLD:
            return true  // Clean
    
    return false  // Still dirty
```

## 3. Nucleation & Solidification

### 3.1 Supersaturation Detection

**Supersaturation occurs when concentration exceeds solubility:**

```pseudocode
function CheckSupersaturation(node):
    for each solute in node.Composition:
        currentConcentration = GetConcentration(node.Composition, solute)
        solubility = CalculateSolubility(solute, node.Temperature, node.Pressure)
        
        if currentConcentration > solubility:
            supersaturationRatio = currentConcentration / solubility
            return (true, solute, supersaturationRatio)
    
    return (false, null, 0.0)
```

**Solubility Calculation:**

```
S = S₀ * exp(-ΔH_sol / (R * T))
```

Where:
- `S` = solubility (mol/L)
- `S₀` = reference solubility
- `ΔH_sol` = enthalpy of solution (J/mol)
- `R` = gas constant
- `T` = temperature (K)

### 3.2 Nucleation Mechanics

**Preferential Seeding:** Crystals spawn in N_IS first (surface provides nucleation sites).

```pseudocode
function CheckNucleation(layer):
    // Check N_IS first (preferential)
    (isSupersaturated, solute, ratio) = CheckSupersaturation(layer.N_IS)
    
    if isSupersaturated:
        // Nucleation probability increases with supersaturation
        nucleationProbability = CalculateNucleationProbability(ratio, layer.Temperature)
        
        if Random() < nucleationProbability:
            CreateCrystal(layer.N_IS, solute)
            return
    
    // Check N_IB (bulk nucleation, less likely)
    (isSupersaturated, solute, ratio) = CheckSupersaturation(layer.N_IB)
    
    if isSupersaturated:
        // Lower probability for bulk nucleation
        nucleationProbability = CalculateNucleationProbability(ratio, layer.Temperature) * BULK_NUCLEATION_FACTOR
        
        if Random() < nucleationProbability:
            CreateCrystal(layer.N_IB, solute)
```

**Nucleation Probability:**

```
P = k_n * exp(-E_n / (R * T)) * (S/S₀ - 1)^n
```

Where:
- `k_n` = nucleation rate constant
- `E_n` = nucleation activation energy (J/mol)
- `S/S₀` = supersaturation ratio
- `n` = nucleation order (typically 2-3)

### 3.3 Crystal Growth

```pseudocode
function GrowCrystals(layer, deltaTime):
    for each crystal in layer.Crystals:
        // Growth rate depends on supersaturation
        supersaturation = CalculateSupersaturation(crystal.Solute, layer)
        
        if supersaturation > 1.0:
            growthRate = CalculateGrowthRate(crystal, supersaturation, layer.Temperature)
            crystal.Mass += growthRate * deltaTime
            crystal.Size = CalculateSize(crystal.Mass, crystal.Density)
            
            // Consume solute
            soluteConsumed = growthRate * deltaTime
            RemoveFromComposition(layer.Composition, crystal.Solute, soluteConsumed)
```

## 4. Crusting & Detachment

### 4.1 Crusting Threshold

**Rule:** If N_IS thickness > Max Threshold (e.g., 5mm), it detaches and becomes a **Hollow Solid Object** (Crust).

**Exact Conditions (TBD):**

The specification mentions 5mm, but exact conditions are TBD. Possible factors:
- Absolute thickness threshold
- Thickness relative to container size
- Composition (tar vs. crystals vs. residue)
- Temperature (hot crusts may be more pliable)

**Current Implementation:**

```pseudocode
function CheckCrusting(layer):
    if layer.N_IS.Thickness > CRUSTING_THRESHOLD:
        // Check composition (must be solidifiable)
        if IsSolidifiable(layer.N_IS.Composition):
            // Check other conditions (TBD)
            if CheckCrustingConditions(layer):
                DetachCrust(layer)
```

**Crusting Conditions (TBD):**

```pseudocode
function CheckCrustingConditions(layer):
    // Possible conditions:
    // - Temperature below solidification point
    // - Composition is primarily solid (tar, crystals)
    // - Time since last cleaning
    // - Pressure conditions
    
    // Placeholder: always true if thickness exceeded
    return true
```

### 4.2 Crust Detachment

```pseudocode
function DetachCrust(layer):
    // Create hollow solid object
    crust = CreateHollowSolidObject(layer.N_IS)
    
    // Transfer composition
    crust.Composition = layer.N_IS.Composition.Copy()
    
    // Set geometry (hollow cylinder/sphere)
    crust.InnerRadius = layer.Container.BaseRadius
    crust.OuterRadius = layer.Container.BaseRadius + layer.N_IS.Thickness
    crust.Height = layer.Height
    
    // Position (inside container, at layer position)
    crust.Position = layer.BaseHeight
    crust.ContainerId = layer.ContainerId
    
    // Remove N_IS content (now empty)
    layer.N_IS.Composition.Clear()
    layer.N_IS.Thickness = MIN_NIS_THICKNESS
    
    // Add crust to container's anchored objects
    layer.Container.AnchoredObjects.Add(crust)
    
    // Check for pressure sealing
    CheckPressureSealing(crust, layer.Container)
```

### 4.3 Hollow Solid Object

```csharp
public struct HollowSolidObject : IComponentData
{
    public EntityId Id;
    public double InnerRadius;
    public double OuterRadius;
    public double Height;
    public double BaseHeight;
    public Composition Composition;
    public bool IsSealed;  // Seals pressure if true
    public EntityId ContainerId;
}
```

**Properties:**
- **Hollow:** Has inner and outer radius (creates new container inside)
- **Solid:** Behaves like solid object (displaces fluid)
- **Sealed:** Can seal off pressure (explosion risk)

## 5. Pressure Sealing & Explosion Risk

### 5.1 Pressure Sealing Mechanics (TBD)

When a crust detaches, it can create a sealed volume inside the container.

```pseudocode
function CheckPressureSealing(crust, container):
    // Check if crust forms a seal
    if IsSealed(crust, container):
        crust.IsSealed = true
        
        // Calculate sealed volume
        sealedVolume = CalculateSealedVolume(crust, container)
        
        // Gas in sealed volume
        sealedGas = GetGasInVolume(container, sealedVolume)
        
        // Pressure in sealed volume (TBD: exact calculation)
        sealedPressure = CalculateSealedPressure(sealedGas, sealedVolume, container.Temperature)
        
        // Check explosion risk
        explosionRisk = CalculateExplosionRisk(crust, sealedPressure)
        
        if explosionRisk > EXPLOSION_THRESHOLD:
            TriggerExplosionWarning(crust, container)
```

**Sealing Detection:**

```pseudocode
function IsSealed(crust, container):
    // Check if crust forms complete seal
    // - Must contact container walls
    // - Must have no gaps
    // - Must be structurally sound
    
    // TBD: Exact conditions
    return CheckContact(crust, container) && CheckNoGaps(crust, container)
```

### 5.2 Explosion Risk Calculation (TBD)

**Factors:**
- Pressure difference (sealed vs. external)
- Crust strength (thickness, composition)
- Temperature (thermal expansion)
- Gas composition (flammable gases increase risk)

**Placeholder Formula:**

```
ExplosionRisk = (PressureDifference / CrustStrength) * TemperatureFactor * GasRiskFactor
```

Where:
- `PressureDifference` = sealed pressure - external pressure
- `CrustStrength` = material strength × thickness
- `TemperatureFactor` = thermal expansion contribution
- `GasRiskFactor` = flammability/explosiveness of gas

**TBD:** Exact formula and threshold values.

### 5.3 Explosion Event

```pseudocode
function TriggerExplosion(crust, container):
    // Release pressure
    ReleasePressure(container, sealedVolume)
    
    // Destroy crust
    RemoveObject(crust)
    
    // Damage container (if pressure was high)
    if sealedPressure > CONTAINER_RUPTURE_PRESSURE:
        DamageContainer(container)
    
    // Eject contents (if container ruptured)
    if container.IsRuptured:
        EjectContents(container)
    
    // Update visualization
    TriggerExplosionVisualization(crust, container)
```

## 6. Residue Accumulation

### 6.1 Residue Sources

- **Reaction products:** Some reactions produce non-volatile residues
- **Carbon tar:** From organic decomposition (see Chemistry Engine)
- **Crystals:** Precipitated solids
- **Corrosion products:** Material degradation

### 6.2 Residue Properties

```csharp
public struct Residue
{
    public ChemicalId Id;
    public double Mass;
    public double AdsorptionCoefficient;  // How strongly it sticks to surface
    public bool IsCleanable;              // Can be removed by cleaning
    public double CleaningSolvent;        // Which solvent removes it
}
```

### 6.3 Residue Effects

- **Increases N_IS thickness**
- **Reduces heat transfer** (insulating layer)
- **Blocks sight** (opacity)
- **Can become crust** (if thick enough)

## 7. Performance Considerations

### 7.1 Thickness Caching

- Cache N_IS thickness calculations (only recalculate when composition/viscosity changes)
- Update cache when cleaning occurs

### 7.2 Nucleation Optimization

- Only check supersaturation for known soluble compounds
- Pre-filter by temperature (some compounds only supersaturate at specific temperatures)

## 8. Edge Cases

### 8.1 Zero Thickness

- Minimum thickness: `1e-6 m` (1 μm)
- Below threshold: treat as zero (no N_IS layer)

### 8.2 Multiple Crusts

- Can multiple crusts form in same container?
- Handle overlapping crusts
- Priority: oldest crust is outermost

### 8.3 Crust Melting

- If temperature increases, crust may melt
- Convert back to N_IS layer
- Release any sealed pressure

## 9. Interaction Points

- **Simulation Topology** ([01_Simulation_Topology.md](01_Simulation_Topology.md)): N_IS is part of 5-node structure
- **Physics Engine** ([02_Physics_Engine.md](02_Physics_Engine.md)): Temperature affects nucleation and crusting
- **Chemistry Engine** ([03_Chemistry_Engine.md](03_Chemistry_Engine.md)): Carbon tar adsorbs to N_IS, reactions occur in N_IS
- **Visualization** ([06_Visualization.md](06_Visualization.md)): Crusts render as solid objects, N_IS renders as residue layer

