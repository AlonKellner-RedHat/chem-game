# Demo POC Plan: Proof of Concept Prototypes

## Overview

This document outlines proof-of-concept prototypes to validate critical systems before full implementation. Each POC is a minimal, isolated implementation focusing on a single core mechanic.

## POC Strategy

### Principles
1. **Minimal Scope:** Each POC tests one core mechanic
2. **Quick Iteration:** Build in 1-2 days, validate, iterate
3. **Isolated:** No dependencies on other systems
4. **Measurable:** Clear success/failure criteria

### POC Structure
```
POCs/
  POC1_ContainerSystem/
  POC2_HeatTransfer/
  POC3_ReactionSystem/
  POC4_BalloonSystem/
  POC5_Dissolution/
  POC6_Evaporation/
  POC7_Crystallization/
```

## POC 1: Container System

### Goal
Validate basic container creation, placement, and composition tracking.

### Scope
- Create container entity (Flask)
- Place on grid
- Add solid (Malachite)
- Track composition
- Visualize in debug view

### Implementation
```csharp
// Minimal ECS setup
public struct ContainerPOC : IComponentData
{
    public ContainerType Type;
    public float2 Position;
    public BlobAssetReference<CompositionData> Composition;
}

public class ContainerPOCSystem : SystemBase
{
    protected override void OnUpdate()
    {
        // Create container
        // Add solid
        // Update composition
    }
}
```

### Success Criteria
- ✅ Container created and placed
- ✅ Solid added to container
- ✅ Composition tracked correctly
- ✅ Debug view shows composition

### Validation
- Manual test: Create container, add solid, check debug view
- Automated test: Unit test for composition tracking

### Timeline
- **Day 1:** Implementation
- **Day 2:** Testing and validation

## POC 2: Heat Transfer

### Goal
Validate heat transfer from heat source to container.

### Scope
- Create heat source (Bunsen Burner)
- Place below container
- Transfer heat to container
- Update temperature over time
- Visualize temperature in debug view

### Implementation
```csharp
public struct HeatSourcePOC : IComponentData
{
    public double Temperature;
    public float2 Position;
}

public struct TemperaturePOC : IComponentData
{
    public double Temperature;
    public double HeatCapacity;
}

public class HeatTransferPOCSystem : SystemBase
{
    protected override void OnUpdate()
    {
        // Calculate heat flow
        // Update temperatures
    }
}
```

### Success Criteria
- ✅ Heat source transfers heat to container
- ✅ Temperature increases over time
- ✅ Temperature stabilizes at equilibrium
- ✅ Debug view shows temperature

### Validation
- Manual test: Place burner, heat container, observe temperature rise
- Automated test: Temperature increases from 20°C to target temperature

### Timeline
- **Day 1:** Implementation
- **Day 2:** Testing and validation

## POC 3: Reaction System

### Goal
Validate reaction triggering and product generation.

### Scope
- Define Malachite decomposition reaction
- Trigger at 200°C
- Generate products (CuO, CO₂, H₂O)
- Update composition
- Visualize in debug view

### Implementation
```csharp
public struct ReactionPOC : IComponentData
{
    public ReactionId Id;
    public double TriggerTemperature;
    public BlobAssetReference<ReactantList> Reactants;
    public BlobAssetReference<ProductList> Products;
}

public class ReactionPOCSystem : SystemBase
{
    protected override void OnUpdate()
    {
        // Check temperature
        // Trigger reaction
        // Generate products
    }
}
```

### Success Criteria
- ✅ Reaction triggers at correct temperature
- ✅ Reactants consumed
- ✅ Products generated
- ✅ Composition updated correctly

### Validation
- Manual test: Heat to 200°C, observe reaction, check products
- Automated test: Reaction triggers at 200°C, products match expected

### Timeline
- **Day 1:** Implementation
- **Day 2:** Testing and validation

## POC 4: Balloon System

### Goal
Validate balloon attachment, inflation, and gas collection.

### Scope
- Attach balloon to container
- Collect gas from container
- Inflate balloon based on gas volume
- Track composition in balloon
- Visualize inflation

### Implementation
```csharp
public struct BalloonPOC : IComponentData
{
    public Entity AttachedContainer;
    public double Volume;
    public double Radius;
    public BlobAssetReference<CompositionData> Composition;
}

public class BalloonPOCSystem : SystemBase
{
    protected override void OnUpdate()
    {
        // Collect gas from container
        // Update balloon volume
        // Update balloon radius
    }
}
```

### Success Criteria
- ✅ Balloon attaches to container
- ✅ Gas collected from container
- ✅ Balloon inflates with gas volume
- ✅ Composition tracked in balloon

### Validation
- Manual test: Attach balloon, generate gas, observe inflation
- Automated test: Balloon volume matches gas volume

### Timeline
- **Day 1:** Implementation
- **Day 2:** Testing and validation

## POC 5: Dissolution

### Goal
Validate liquid addition and dissolution reaction.

### Scope
- Pour liquid into container
- Create liquid layer
- Dissolve solid in liquid
- Update composition
- Change solution color

### Implementation
```csharp
public struct LiquidPOC : IComponentData
{
    public double Volume;
    public BlobAssetReference<CompositionData> Composition;
    public Color SolutionColor;
}

public class DissolutionPOCSystem : SystemBase
{
    protected override void OnUpdate()
    {
        // Process dissolution reaction
        // Update composition
        // Calculate solution color
    }
}
```

### Success Criteria
- ✅ Liquid added to container
- ✅ Solid dissolves in liquid
- ✅ Solution color changes (clear → blue)
- ✅ Composition updated correctly

### Validation
- Manual test: Pour acid, observe dissolution, check color
- Automated test: Solid mass decreases, solution color is blue

### Timeline
- **Day 1:** Implementation
- **Day 2:** Testing and validation

## POC 6: Evaporation

### Goal
Validate water evaporation from solution.

### Scope
- Heat solution to boiling
- Evaporate water
- Generate vapor
- Update liquid level
- Track vapor composition

### Implementation
```csharp
public struct EvaporationPOC : IComponentData
{
    public double BoilingPoint;
    public double EvaporationRate;
    public BlobAssetReference<CompositionData> Vapor;
}

public class EvaporationPOCSystem : SystemBase
{
    protected override void OnUpdate()
    {
        // Check temperature
        // Calculate evaporation rate
        // Generate vapor
        // Update liquid level
    }
}
```

### Success Criteria
- ✅ Water evaporates at boiling point
- ✅ Vapor generated
- ✅ Liquid level decreases
- ✅ Vapor composition is pure water

### Validation
- Manual test: Heat to boiling, observe evaporation, check vapor
- Automated test: Liquid level decreases, vapor is pure water

### Timeline
- **Day 1:** Implementation
- **Day 2:** Testing and validation

## POC 7: Crystallization

### Goal
Validate supersaturation detection and crystal formation.

### Scope
- Detect supersaturation
- Nucleate crystals
- Grow crystals over time
- Visualize crystals
- Track crystal mass

### Implementation
```csharp
public struct CrystalPOC : IComponentData
{
    public double Mass;
    public double Size;
    public float2 Position;
    public ChemicalId ChemicalId;
}

public class CrystallizationPOCSystem : SystemBase
{
    protected override void OnUpdate()
    {
        // Check supersaturation
        // Nucleate crystals
        // Grow crystals
    }
}
```

### Success Criteria
- ✅ Supersaturation detected
- ✅ Crystals nucleate
- ✅ Crystals grow over time
- ✅ Crystal mass increases

### Validation
- Manual test: Create supersaturated solution, observe crystals, check growth
- Automated test: Crystals form and grow

### Timeline
- **Day 1:** Implementation
- **Day 2:** Testing and validation

## POC Integration Test

### Goal
Validate all POCs work together.

### Scope
- Combine all POCs
- Test Stage 1 flow (Malachite → CO₂)
- Test Stage 2 flow (CuO → Blue solution)
- Test Stage 3 flow (Solution → Water + Crystals)

### Implementation
- Integrate all POC systems
- Create test scenes for each stage
- Run end-to-end tests

### Success Criteria
- ✅ All POCs integrated
- ✅ Stage 1 completes successfully
- ✅ Stage 2 completes successfully
- ✅ Stage 3 completes successfully

### Validation
- Manual test: Play through all stages
- Automated test: Play mode tests pass

### Timeline
- **Day 3:** Integration
- **Day 4:** Testing and bug fixes

## POC Execution Plan

### Week 1: Core Systems
- **Day 1-2:** POC 1 (Container System)
- **Day 3-4:** POC 2 (Heat Transfer)
- **Day 5:** POC 3 (Reaction System)

### Week 2: Stage-Specific Systems
- **Day 1-2:** POC 4 (Balloon System)
- **Day 3-4:** POC 5 (Dissolution)
- **Day 5:** POC 6 (Evaporation)

### Week 3: Advanced Systems
- **Day 1-2:** POC 7 (Crystallization)
- **Day 3-4:** POC Integration
- **Day 5:** Validation and documentation

## POC Success Metrics

### Technical Metrics
- **Performance:** > 60 FPS
- **Memory:** < 100MB
- **Code Coverage:** > 70%

### Functional Metrics
- **All POCs:** Core mechanics work
- **Integration:** POCs work together
- **Stages:** All stages playable

## Risk Mitigation

### High-Risk POCs
- **POC 3 (Reaction System):** Complex, may need iteration
- **POC 7 (Crystallization):** Supersaturation detection tricky

### Mitigation
- Build simpler versions first
- Validate core mechanics before adding complexity
- Iterate based on test results

## Next Steps

After POC validation:
1. Review POC results
2. Identify issues and improvements
3. Proceed to full implementation (see [12_Demo_Build_Plan.md](12_Demo_Build_Plan.md))

