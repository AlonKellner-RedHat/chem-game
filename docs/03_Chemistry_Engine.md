# Chemistry Engine: Systemic Reactions

## Overview

The Chemistry Engine implements a systemic reaction system where reactions can occur in any node (N_IB or N_IS) based on composition, temperature, pressure, and surface availability. The system uses a priority-based reaction stack to ensure critical reactions (like combustion) occur before slower processes.

## 1. Reaction Priority Stack

### 1.1 Priority Levels

```csharp
public enum ReactionPriority
{
    Combustion = 0,      // Highest priority (fast, exothermic)
    Redox = 1,           // Oxidation-reduction
    Precipitation = 2,  // Solid formation
    AcidBase = 3,        // Neutralization
    Complexation = 4,   // Complex formation
    Organic = 5         // Lowest priority (slow, fallback to brown sludge)
}
```

**Execution Order:**
1. Process all Combustion reactions
2. Process all Redox reactions
3. Process all Precipitation reactions
4. Process all Acid/Base reactions
5. Process all Complexation reactions
6. Process all Organic reactions (with fallback)

### 1.2 Reaction Data Structure

```csharp
public struct Reaction
{
    public ReactionId Id;
    public ReactionPriority Priority;
    public List<Reactant> Reactants;
    public List<Product> Products;
    public double RateConstant;        // k (temperature-dependent)
    public double ActivationEnergy;    // E_a (J/mol)
    public bool RequiresSurface;       // Heterogeneous catalysis
    public bool RequiresCatalyst;       // Needs specific catalyst
    public CatalystType CatalystType;  // If RequiresCatalyst
    public double EnthalpyChange;      // ΔH (J/mol) - exothermic if negative
}
```

```csharp
public struct Reactant
{
    public ChemicalId ChemicalId;
    public double Stoichiometry;       // Moles per reaction
    public double MinConcentration;   // Minimum to react (mol/L)
}
```

```csharp
public struct Product
{
    public ChemicalId ChemicalId;
    public double Stoichiometry;
    public double Yield;               // Fraction (0-1) for side reactions
}
```

## 2. Reaction Node Selection

### 2.1 N_IB vs N_IS Selection

**Bulk Reactions (N_IB):**
- Homogeneous reactions (all reactants in same phase)
- Fast reactions (combustion, acid-base)
- No surface requirement

**Surface Reactions (N_IS):**
- Heterogeneous catalysis
- Corrosion (acid attack on material)
- Surface-limited reactions

**Algorithm:**

```pseudocode
function SelectReactionNode(reaction, layer):
    if reaction.RequiresSurface:
        // Must occur in N_IS
        if HasRequiredCatalyst(layer.N_IS, reaction):
            return layer.N_IS
        else:
            return null  // Cannot react
    else:
        // Can occur in N_IB (bulk)
        if HasRequiredReactants(layer.N_IB, reaction):
            return layer.N_IB
        else:
            return null
```

### 2.2 Catalyst Detection

```pseudocode
function HasRequiredCatalyst(node, reaction):
    if not reaction.RequiresCatalyst:
        return true

    // Check if catalyst is present
    catalyst = GetCatalyst(node.Composition, reaction.CatalystType)

    if catalyst == null:
        return false

    // Check catalyst concentration (must be > threshold)
    catalystConc = GetConcentration(node.Composition, catalyst)
    return catalystConc > MIN_CATALYST_CONCENTRATION
```

**Catalyst Types:**

```csharp
public enum CatalystType
{
    MetalSurface,      // N_Mat is metal (Copper, Platinum, etc.)
    Acid,              // H⁺ ions
    Base,              // OH⁻ ions
    Enzyme,            // Biological catalyst
    SolidCoating       // Catalyst coating on N_IS
}
```

## 3. Heterogeneous Catalysis Diffusion

For surface reactions, reactants must diffuse from N_IB to N_IS.

### 3.1 Diffusion Model

**Fick's First Law:**

```
J = -D * (dc/dx)
```

Where:
- `J` = flux (mol/(m²·s))
- `D` = diffusion coefficient (m²/s)
- `dc/dx` = concentration gradient (mol/(m³·m))

**Algorithm:**

```pseudocode
function CalculateDiffusionToSurface(layer, reactant):
    // Concentration in bulk
    c_IB = GetConcentration(layer.N_IB.Composition, reactant)

    // Concentration at surface (assume zero if reaction is fast)
    c_IS = GetConcentration(layer.N_IS.Composition, reactant)

    // Concentration gradient
    deltaC = c_IB - c_IS
    distance = layer.N_IS.Thickness  // Diffusion distance

    // Diffusion coefficient (temperature-dependent)
    D = CalculateDiffusionCoefficient(reactant, layer.Temperature, layer.Viscosity)

    // Flux
    flux = D * (deltaC / distance)

    // Mass transfer per timestep
    surfaceArea = CalculateSurfaceArea(layer)
    massTransferred = flux * surfaceArea * deltaTime

    return massTransferred
```

**Diffusion Coefficient (Stokes-Einstein):**

```
D = (k_B * T) / (6 * π * η * r)
```

Where:
- `k_B` = Boltzmann constant (1.38 × 10⁻²³ J/K)
- `T` = temperature (K)
- `η` = dynamic viscosity (Pa·s)
- `r` = molecular radius (m)

### 3.2 Surface Reaction Rate

```pseudocode
function CalculateSurfaceReactionRate(reaction, layer):
    // Check if reactants have diffused to surface
    for each reactant in reaction.Reactants:
        available = GetConcentration(layer.N_IS.Composition, reactant.ChemicalId)
        required = reactant.MinConcentration

        if available < required:
            // Not enough at surface - rate limited by diffusion
            diffusionRate = CalculateDiffusionToSurface(layer, reactant)
            return diffusionRate / reactant.Stoichiometry
        else:
            // Enough at surface - rate limited by reaction kinetics
            return CalculateReactionRate(reaction, layer.N_IS)
```

## 4. Corrosion Calculations

Acids in N_IS attack N_Mat (material wall).

### 4.1 Corrosion Detection

```pseudocode
function CheckCorrosion(layer):
    // Check if acid is present in N_IS
    acidConcentration = GetAcidConcentration(layer.N_IS.Composition)

    if acidConcentration < MIN_ACID_CONCENTRATION:
        return  // No corrosion

    // Check if material is susceptible
    material = layer.N_Mat.Material
    if not IsCorrodible(material):
        return  // Material is resistant (e.g., glass, Teflon)

    // Calculate corrosion rate
    corrosionRate = CalculateCorrosionRate(acidConcentration, material, layer.Temperature)

    return corrosionRate
```

### 4.2 Corrosion Rate

```
Rate = k_corrosion * [H⁺]^n * A * exp(-E_a / (R * T))
```

Where:
- `k_corrosion` = corrosion rate constant
- `[H⁺]` = hydrogen ion concentration (mol/L)
- `n` = reaction order (typically 0.5-1.0)
- `A` = surface area (m²)
- `E_a` = activation energy (J/mol)
- `R` = gas constant (8.314 J/(mol·K))
- `T` = temperature (K)

**Material Susceptibility:**

```csharp
public struct MaterialCorrosion
{
    public MaterialType Material;
    public double CorrosionRateConstant;
    public double ActivationEnergy;
    public bool IsResistant;  // Glass, Teflon, etc.
}
```

### 4.3 Material Degradation

```pseudocode
function ApplyCorrosion(layer, corrosionRate, deltaTime):
    // Remove material from N_Mat
    materialLost = corrosionRate * deltaTime * layer.N_Mat.SurfaceArea

    layer.N_Mat.Thickness -= materialLost / (layer.N_Mat.Density * layer.N_Mat.SurfaceArea)

    // Add corrosion products to N_IS
    corrosionProducts = GetCorrosionProducts(layer.N_Mat.Material)
    AddToComposition(layer.N_IS.Composition, corrosionProducts, materialLost)

    // Check for material failure
    if layer.N_Mat.Thickness < MIN_WALL_THICKNESS:
        TriggerMaterialFailure(layer, container)
```

## 5. Unified Rate Law

### 5.1 Rate Law Formula

```
Rate = k * [Conc] * 2^(ΔT/10) * Mixing * SurfaceArea
```

Where:
- `k` = rate constant (temperature-dependent)
- `[Conc]` = concentration term (product of reactant concentrations)
- `ΔT` = temperature difference from reference (K)
- `Mixing` = MixingFactor (from physics engine)
- `SurfaceArea` = reaction surface area (TBD: calculation method)

**Detailed Form:**

```pseudocode
function CalculateReactionRate(reaction, node, layer):
    // Base rate constant (Arrhenius)
    k = reaction.RateConstant * exp(-reaction.ActivationEnergy / (R * node.Temperature))

    // Concentration term (product of reactant concentrations)
    concTerm = 1.0
    for each reactant in reaction.Reactants:
        conc = GetConcentration(node.Composition, reactant.ChemicalId)
        concTerm *= pow(conc, reactant.Stoichiometry)

    // Temperature factor (doubles every 10K)
    deltaT = node.Temperature - REFERENCE_TEMPERATURE
    tempFactor = pow(2.0, deltaT / 10.0)

    // Mixing factor (from physics engine)
    mixingFactor = layer.MixingFactor

    // Surface area (TBD: exact calculation method)
    // For bulk reactions: use node volume
    // For surface reactions: use N_IS surface area
    if reaction.RequiresSurface:
        surfaceArea = CalculateSurfaceArea(layer.N_IS)
    else:
        surfaceArea = node.Volume  // Volume-based for bulk

    // Total rate
    rate = k * concTerm * tempFactor * mixingFactor * surfaceArea

    return rate
```

### 5.2 Surface Area Calculation (TBD)

**Options:**
1. **Geometric:** Use actual surface area of N_IS
2. **Effective:** Use volume-based effective area
3. **Catalyst-specific:** Use catalyst surface area if present

**Placeholder Implementation:**

```pseudocode
function CalculateReactionSurfaceArea(reaction, node, layer):
    if reaction.RequiresSurface:
        // Use N_IS surface area
        return CalculateSurfaceArea(layer.N_IS)
    else:
        // Bulk reaction: use volume as proxy
        return node.Volume
```

## 6. Kinetics & Inhibition

### 6.1 Inhibitor Detection

**Inhibitor Tagging:**

```csharp
public struct Chemical
{
    public ChemicalId Id;
    public string Name;
    public bool IsInhibitor;           // Tagged as [INHIBITOR]
    public double InhibitionThreshold; // Minimum concentration to inhibit (ppm)
    public List<ReactionId> InhibitedReactions;  // Which reactions it inhibits
}
```

**Inhibition Check:**

```pseudocode
function CheckInhibition(reaction, node):
    // Check for inhibitors in composition
    for each chemical in node.Composition:
        if chemical.IsInhibitor:
            concentration = GetConcentration(node.Composition, chemical.Id)
            concentrationPPM = concentration * MOLAR_MASS_TO_PPM_CONVERSION

            // Check if above threshold (>1 ppm)
            if concentrationPPM > MAX(chemical.InhibitionThreshold, 1e-6):
                // Check if this inhibitor affects this reaction
                if reaction.Id in chemical.InhibitedReactions:
                    return true  // Reaction is inhibited

    return false
```

### 6.2 Rate Clamping

```pseudocode
function ApplyInhibition(reaction, node, baseRate):
    if CheckInhibition(reaction, node):
        // Clamp rate to zero
        return 0.0
    else:
        return baseRate
```

**Inhibition Mechanism:**

- Competitive: Inhibitor competes with reactant for active site
- Non-competitive: Inhibitor binds elsewhere, changes enzyme/catalyst shape
- Uncompetitive: Inhibitor binds to enzyme-substrate complex

For simplicity, we use **complete inhibition** (rate = 0) when inhibitor > threshold.

## 7. Reaction Execution

### 7.1 Reaction Processing Algorithm

```pseudocode
function ProcessReactions(container, deltaTime):
    // Process by priority
    for priority in [Combustion, Redox, Precipitation, AcidBase, Complexation, Organic]:
        reactions = GetReactionsByPriority(priority)

        for each reaction in reactions:
            for each layer in container.Layers:
                // Select node
                node = SelectReactionNode(reaction, layer)
                if node == null:
                    continue

                // Check inhibition
                if CheckInhibition(reaction, node):
                    continue

                // Calculate rate
                rate = CalculateReactionRate(reaction, node, layer)
                rate = ApplyInhibition(reaction, node, rate)

                // Execute reaction
                ExecuteReaction(reaction, node, rate, deltaTime)
```

### 7.2 Reaction Execution

```pseudocode
function ExecuteReaction(reaction, node, rate, deltaTime):
    // Calculate moles consumed/produced
    molesConsumed = rate * deltaTime

    // Check reactant availability
    limitingReactant = FindLimitingReactant(reaction, node.Composition)
    maxMoles = GetAvailableMoles(node.Composition, limitingReactant)

    // Clamp to available
    actualMoles = Min(molesConsumed, maxMoles)

    // Consume reactants
    for each reactant in reaction.Reactants:
        molesToRemove = actualMoles * reactant.Stoichiometry
        RemoveFromComposition(node.Composition, reactant.ChemicalId, molesToRemove)

    // Produce products
    for each product in reaction.Products:
        molesToAdd = actualMoles * product.Stoichiometry * product.Yield
        AddToComposition(node.Composition, product.ChemicalId, molesToAdd)

    // Update temperature (exothermic/endothermic)
    heatReleased = reaction.EnthalpyChange * actualMoles
    UpdateNodeTemperature(node, heatReleased, deltaTime)

    // Trigger visualization (see Visualization document)
    if actualMoles > 0:
        TriggerReactionVisualization(reaction, node, actualMoles)
```

## 8. Fallback System

### 8.1 Brown Sludge

Unmatched organic reactions at high heat convert mass to **Carbon Tar**.

```pseudocode
function HandleOrganicFallback(reaction, node, deltaTime):
    // Check if organic reaction failed to match
    if reaction.Priority == Organic and not HasMatchedReaction(reaction):
        // Check temperature
        if node.Temperature > ORGANIC_DECOMPOSITION_TEMPERATURE:
            // Convert to carbon tar
            organicMass = GetOrganicMass(node.Composition)
            tarMass = organicMass * CARBON_CONVERSION_EFFICIENCY

            // Remove organic compounds
            RemoveOrganicCompounds(node.Composition)

            // Add carbon tar
            AddToComposition(node.Composition, CARBON_TAR_ID, tarMass)

            // Update temperature (exothermic)
            heatReleased = tarMass * CARBON_FORMATION_ENTHALPY
            UpdateNodeTemperature(node, heatReleased, deltaTime)
```

### 8.2 Carbon Tar Properties

```csharp
public struct CarbonTar
{
    public double Mass;
    public double AdsorptionCoefficient;  // High adsorption
    public double ThermalConductivity;    // Low (insulating)
    public double Opacity;                // High (blocks sight)
}
```

### 8.3 Tar Adsorption

Tar has high adsorption; it moves instantly to N_IS, coating the glass.

```pseudocode
function ApplyTarAdsorption(layer):
    tarMass = GetTarMass(layer.N_IB.Composition)

    if tarMass > 0:
        // Instant adsorption to N_IS
        adsorptionRate = tarMass * CARBON_TAR_ADSORPTION_COEFFICIENT

        // Move tar to N_IS
        RemoveFromComposition(layer.N_IB.Composition, CARBON_TAR_ID, adsorptionRate)
        AddToComposition(layer.N_IS.Composition, CARBON_TAR_ID, adsorptionRate)

        // Update N_IS properties
        layer.N_IS.Thickness += adsorptionRate / (CARBON_TAR_DENSITY * layer.N_IS.SurfaceArea)
        layer.N_IS.Opacity = CalculateOpacity(layer.N_IS.Composition)
        layer.N_IS.ThermalConductivity = CalculateThermalConductivity(layer.N_IS.Composition)
```

**Effects:**
- **Blocks Heat:** Low thermal conductivity reduces heat transfer
- **Blocks Sight:** High opacity prevents visual inspection
- **Fouling:** Thick tar layer can detach as crust (see Surface Physics)

## 9. Reaction Product Propagation

### 9.1 Immediate Propagation

Products are added to the node where the reaction occurred.

### 9.2 Diffusion Propagation

Products can diffuse to adjacent nodes/layers:

```pseudocode
function PropagateReactionProducts(layer, products, deltaTime):
    // Products in N_IS can diffuse to N_IB
    for each product in products:
        if product.Location == NodeType.InnerSurface:
            // Diffuse to bulk
            diffusionRate = CalculateDiffusion(layer.N_IS, layer.N_IB, product)
            TransferMass(layer.N_IS, layer.N_IB, product, diffusionRate * deltaTime)

    // Products in N_IB can move to adjacent layers
    // (handled by transport dynamics in Physics Engine)
```

## 10. Performance Optimization

### 10.1 Reaction Matching

- Pre-filter reactions by available reactants (don't check impossible reactions)
- Cache reaction matches (only recalculate when composition changes)
- Batch reactions by priority to reduce iterations

### 10.2 Priority-Based Early Exit

- If high-priority reactions consume all reactants, skip lower-priority reactions
- Only process Organic reactions if no higher-priority reactions occurred

## 11. Edge Cases

### 11.1 Zero Concentration

- Handle division by zero in concentration calculations
- Minimum concentration: `1e-9 mol/L` (below detection)

### 11.2 Explosive Reactions

- Very fast exothermic reactions (combustion)
- May cause rapid pressure/temperature increase
- Check for explosion conditions (see Surface Physics)

### 11.3 Reversible Reactions

- Some reactions are reversible (equilibrium)
- Currently not implemented (forward-only)
- **Future:** Add equilibrium constants and reverse reactions

## 12. Interaction Points

- **Simulation Topology** ([01_Simulation_Topology.md](01_Simulation_Topology.md)): Uses node structure (N_IB, N_IS)
- **Physics Engine** ([02_Physics_Engine.md](02_Physics_Engine.md)): Temperature and MixingFactor affect rates
- **Surface Physics** ([04_Surface_Physics.md](04_Surface_Physics.md)): Tar adsorption affects N_IS thickness
- **Knowledge Analysis** ([05_Knowledge_Analysis.md](05_Knowledge_Analysis.md)): Reaction products affect composition identification
- **Visualization** ([06_Visualization.md](06_Visualization.md)): Reactions trigger boid animations
