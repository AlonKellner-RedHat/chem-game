# Knowledge & Analysis: The Game Loop

## Overview

The Knowledge & Analysis system implements the "fog of war" mechanics and analysis tools that allow players to identify unknown substances, trace their origins, and understand chemical processes. This system bridges the simulation (which knows everything) and the player's knowledge (which is limited).

## 1. Fog of War: Purity-Based Identification

### 1.1 Purity Calculation

**Method:** Molar fraction based (as specified in design decisions).

**Formula:**

```
Purity = (Moles of Target Chemical) / (Total Moles in Sample)
```

**Algorithm:**

```pseudocode
function CalculatePurity(sample, targetChemical):
    targetMoles = GetMoles(sample.Composition, targetChemical)
    totalMoles = GetTotalMoles(sample.Composition)

    if totalMoles == 0:
        return 0.0

    purity = targetMoles / totalMoles
    return purity
```

**Purity Ranges:**

```csharp
public enum PurityLevel
{
    Trace,      // < 66%: "Unknown Sludge"
    Unrefined,  // 66-99%: "Dirty [Name]"
    Pure        // > 99%: "[Name]"
}
```

**Thresholds:**
- **Trace:** `Purity < 0.66` (66%)
- **Unrefined:** `0.66 ≤ Purity < 0.99` (66-99%)
- **Pure:** `Purity ≥ 0.99` (≥99%)

### 1.2 Identification Display

```pseudocode
function GetDisplayName(sample, targetChemical):
    purity = CalculatePurity(sample, targetChemical)

    if purity < 0.66:
        return "Unknown Sludge"
    elif purity < 0.99:
        return "Dirty " + targetChemical.Name
    else:
        return targetChemical.Name
```

**Example:**
- 50% water, 50% salt → "Unknown Sludge"
- 80% water, 20% salt → "Dirty Water"
- 99.5% water, 0.5% salt → "Water"

### 1.3 Multi-Component Identification

For samples with multiple significant components:

```pseudocode
function IdentifySample(sample):
    components = GetSignificantComponents(sample, threshold=0.05)  // >5% each

    if components.Count == 0:
        return "Unknown Sludge"
    elif components.Count == 1:
        return GetDisplayName(sample, components[0])
    else:
        // Multiple components: show all significant ones
        names = []
        for component in components:
            purity = CalculatePurity(sample, component)
            if purity >= 0.66:
                names.Add(component.Name)

        if names.Count > 0:
            return Join(names, " + ")
        else:
            return "Unknown Sludge"
```

## 2. Forward Propagation: Sample → Source

### 2.1 Forward Propagation Algorithm

**Principle:** If you identify a sample, you can identify its source (where it came from).

```pseudocode
function PropagateForward(sample, sourceContainer):
    // Identify sample
    sampleIdentity = IdentifySample(sample)

    // Find source (container where sample came from)
    sourceComposition = GetComposition(sourceContainer, sample.Location)

    // Calculate purity in source
    for each chemical in sampleIdentity.IdentifiedChemicals:
        sourcePurity = CalculatePurity(sourceComposition, chemical)

        // If source has significant amount, identify it
        if sourcePurity >= PROPAGATION_THRESHOLD:
            IdentifyChemical(sourceContainer, chemical, sourcePurity)
```

**Propagation Threshold:** `0.10` (10%) - if source has at least 10% of identified chemical, propagate identification.

### 2.2 Propagation Chain

```pseudocode
function PropagateForwardChain(identifiedSample, maxDepth=10):
    queue = [(identifiedSample, 0)]  // (sample, depth)
    identified = Set()

    while queue.Count > 0:
        (sample, depth) = queue.Pop()

        if depth > maxDepth:
            continue

        // Find sources
        sources = FindSources(sample)

        for source in sources:
            if source not in identified:
                PropagateForward(sample, source)
                identified.Add(source)

                // Continue propagation
                sourceSample = GetSample(source)
                queue.Push((sourceSample, depth + 1))
```

**Example:**
1. Identify "Water" in beaker A
2. Beaker A was filled from container B
3. Propagate: Container B also contains "Water" (if >10%)
4. Container B was filled from container C
5. Propagate: Container C also contains "Water" (if >10%)

## 3. Backward Propagation: Products → Reactants

### 3.1 Backward Propagation Algorithm

**Principle:** If you identify reaction products, you can identify the reactants that produced them.

```pseudocode
function PropagateBackward(products, reactionDatabase):
    // Find reactions that produce these products
    possibleReactions = FindReactionsProducing(products, reactionDatabase)

    // For each possible reaction, identify reactants
    for reaction in possibleReactions:
        for reactant in reaction.Reactants:
            // Check if reactant is present in source containers
            sources = FindSourceContainers(products)

            for source in sources:
                reactantPurity = CalculatePurity(source.Composition, reactant.ChemicalId)

                if reactantPurity >= PROPAGATION_THRESHOLD:
                    IdentifyChemical(source, reactant.ChemicalId, reactantPurity)
```

### 3.2 Reaction Matching

```pseudocode
function FindReactionsProducing(products, reactionDatabase):
    matchingReactions = []

    for reaction in reactionDatabase:
        // Check if reaction produces any of the identified products
        reactionProducts = GetProductChemicals(reaction)

        matchCount = 0
        for product in products:
            if product in reactionProducts:
                matchCount += 1

        // If significant match, include reaction
        if matchCount >= MIN_PRODUCT_MATCHES:
            matchingReactions.Add(reaction)

    return matchingReactions
```

**Example:**
1. Identify "Sodium Chloride" and "Water" as products
2. Find reaction: `HCl + NaOH → NaCl + H₂O`
3. Propagate: Source containers likely contain "Hydrochloric Acid" and "Sodium Hydroxide"
4. Check sources: If >10% of each reactant, identify them

## 4. In-Situ Analysis Tools

### 4.1 Tool Interface

```csharp
public interface IAnalysisTool
{
    AnalysisResult Analyze(Node node, Layer layer);
    string ToolName { get; }
    bool CanAnalyze(NodeType nodeType);
}
```

### 4.2 Thermometer

**Measures:** Temperature

```csharp
public class Thermometer : IAnalysisTool
{
    public AnalysisResult Analyze(Node node, Layer layer)
    {
        return new AnalysisResult
        {
            ToolName = "Thermometer",
            Value = layer.Temperature,
            Unit = "K",
            DisplayValue = FormatTemperature(layer.Temperature)
        };
    }

    public bool CanAnalyze(NodeType nodeType)
    {
        return nodeType == NodeType.InnerBulk || nodeType == NodeType.InnerSurface;
    }
}
```

**Display:** Temperature in Kelvin, Celsius, or Fahrenheit (user preference).

### 4.3 Manometer

**Measures:** Pressure

```csharp
public class Manometer : IAnalysisTool
{
    public AnalysisResult Analyze(Node node, Layer layer)
    {
        return new AnalysisResult
        {
            ToolName = "Manometer",
            Value = layer.Pressure,
            Unit = "Pa",
            DisplayValue = FormatPressure(layer.Pressure)
        };
    }

    public bool CanAnalyze(NodeType nodeType)
    {
        return nodeType == NodeType.InnerBulk;
    }
}
```

**Display:** Pressure in Pa, atm, or bar (user preference).

### 4.4 Conductivity Meter

**Measures:** Electrical conductivity (indicates ion concentration)

```pseudocode
function CalculateConductivity(composition, temperature):
    totalConductivity = 0.0

    for each ion in composition:
        ionConcentration = GetConcentration(composition, ion)
        ionConductivity = GetIonConductivity(ion, temperature)
        totalConductivity += ionConcentration * ionConductivity

    return totalConductivity
```

**Ion Conductivity (Kohlrausch's Law):**

```
Λ = Λ₀ - K * √c
```

Where:
- `Λ` = molar conductivity (S·m²/mol)
- `Λ₀` = limiting molar conductivity
- `K` = constant
- `c` = concentration (mol/m³)

**Implementation:**

```csharp
public class ConductivityMeter : IAnalysisTool
{
    public AnalysisResult Analyze(Node node, Layer layer)
    {
        double conductivity = CalculateConductivity(layer.N_IB.Composition, layer.Temperature);

        return new AnalysisResult
        {
            ToolName = "Conductivity Meter",
            Value = conductivity,
            Unit = "S/m",
            DisplayValue = FormatConductivity(conductivity)
        };
    }
}
```

**Interpretation:**
- High conductivity → High ion concentration (salts, acids, bases)
- Low conductivity → Low ion concentration (pure water, organic solvents)

### 4.5 pH Meter

**Measures:** pH (acidity/basicity)

```pseudocode
function CalculatepH(composition, temperature):
    // Find H⁺ concentration
    hPlusConcentration = GetConcentration(composition, H_PLUS_ION)

    // pH = -log₁₀([H⁺])
    pH = -log10(hPlusConcentration)

    return pH
```

**Implementation:**

```csharp
public class pHMeter : IAnalysisTool
{
    public AnalysisResult Analyze(Node node, Layer layer)
    {
        double pH = CalculatepH(layer.N_IB.Composition, layer.Temperature);

        return new AnalysisResult
        {
            ToolName = "pH Meter",
            Value = pH,
            Unit = "pH",
            DisplayValue = FormatpH(pH)
        };
    }
}
```

**Interpretation:**
- `pH < 7`: Acidic
- `pH = 7`: Neutral
- `pH > 7`: Basic

### 4.6 Refractometer

**Measures:** Refractive index (indicates composition/concentration)

**Refractive Index Calculation:**

```
n = n₀ + Σ(cᵢ * dn/dcᵢ)
```

Where:
- `n` = refractive index
- `n₀` = solvent refractive index
- `cᵢ` = concentration of component i
- `dn/dcᵢ` = refractive index increment

**Implementation:**

```csharp
public class Refractometer : IAnalysisTool
{
    public AnalysisResult Analyze(Node node, Layer layer)
    {
        double refractiveIndex = CalculateRefractiveIndex(layer.N_IB.Composition, layer.Temperature);

        return new AnalysisResult
        {
            ToolName = "Refractometer",
            Value = refractiveIndex,
            Unit = "n",
            DisplayValue = FormatRefractiveIndex(refractiveIndex)
        };
    }
}
```

**Interpretation:**
- Higher refractive index → Higher concentration/density
- Can identify pure substances (known refractive indices)

## 5. Analysis Result Aggregation

### 5.1 Result Structure

```csharp
public struct AnalysisResult
{
    public string ToolName;
    public double Value;
    public string Unit;
    public string DisplayValue;
    public DateTime Timestamp;
    public EntityId NodeId;
    public EntityId LayerId;
}
```

### 5.2 Result Display

```pseudocode
function DisplayAnalysisResults(node, layer):
    results = []

    // Run all applicable tools
    for tool in availableTools:
        if tool.CanAnalyze(node.Type):
            result = tool.Analyze(node, layer)
            results.Add(result)

    // Display results
    for result in results:
        Display(result.ToolName + ": " + result.DisplayValue + " " + result.Unit)
```

### 5.3 Result History

```csharp
public class AnalysisHistory
{
    private List<AnalysisResult> history;

    public void AddResult(AnalysisResult result)
    {
        history.Add(result);
    }

    public List<AnalysisResult> GetHistory(EntityId nodeId, TimeSpan duration)
    {
        return history.Where(r => r.NodeId == nodeId &&
                                  r.Timestamp > DateTime.Now - duration).ToList();
    }
}
```

**Use Cases:**
- Track temperature changes over time
- Monitor pH changes during reaction
- Detect pressure buildup

## 6. Tool Calibration & Accuracy

### 6.1 Measurement Uncertainty

```csharp
public struct MeasurementUncertainty
{
    public double AbsoluteError;
    public double RelativeError;  // Percentage
}
```

**Example:**
- Thermometer: ±0.1 K absolute error
- pH Meter: ±0.01 pH absolute error
- Conductivity: ±1% relative error

### 6.2 Calibration

```pseudocode
function CalibrateTool(tool, reference):
    // Measure reference value
    measuredValue = tool.Analyze(reference.Node, reference.Layer)
    trueValue = reference.TrueValue

    // Calculate error
    error = measuredValue - trueValue

    // Apply calibration
    tool.CalibrationOffset = -error
```

## 7. Performance Considerations

### 7.1 Caching

- Cache purity calculations (only recalculate when composition changes)
- Cache tool results (update when composition/temperature changes)

### 7.2 Propagation Optimization

- Limit propagation depth (prevent infinite loops)
- Cache propagation results (don't re-propagate if nothing changed)

## 8. Edge Cases

### 8.1 Zero Moles

- If total moles = 0, purity is undefined
- Return "Empty" or "Unknown"

### 8.2 Trace Impurities

- Very low concentrations (<1 ppm) may not affect purity calculation
- But can still inhibit reactions (see Chemistry Engine)

### 8.3 Multiple Identifications

- Sample may match multiple chemicals
- Show all matches above threshold
- Prioritize by concentration

## 9. Interaction Points

- **Simulation Topology** ([01_Simulation_Topology.md](01_Simulation_Topology.md)): Tools analyze nodes (N_IB, N_IS)
- **Physics Engine** ([02_Physics_Engine.md](02_Physics_Engine.md)): Temperature and pressure from physics
- **Chemistry Engine** ([03_Chemistry_Engine.md](03_Chemistry_Engine.md)): Reaction database for backward propagation
- **Visualization** ([06_Visualization.md](06_Visualization.md)): Display analysis results in UI
