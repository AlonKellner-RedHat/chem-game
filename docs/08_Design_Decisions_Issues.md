# Design Decisions & Issues

## Overview

This document tracks design decisions made during specification development, unresolved issues requiring further specification, and potential improvements for future consideration.

## 1. Clarifications Made

### 1.1 Layer Height Calculation

**Decision:** Layer heights are derived from physics (MixingRate vs DensityDelta).

**Formula:**
```
GradientHeight = BaseHeight + (MixingRate / DensityDelta) * TimeStep
```

**Rationale:** Based on physical principles of mixing and density-driven separation. Gradient layers represent transition zones between immiscible or slowly mixing liquids.

**Reference:** [01_Simulation_Topology.md](01_Simulation_Topology.md#layer-height-management), [02_Physics_Engine.md](02_Physics_Engine.md#gradient-formation)

### 1.2 Node Volumes

**Decision:** Geometric calculation (surface area × thickness) for surface nodes, fixed for bulk nodes.

**Approach:**
- **N_IS, N_OS:** `Volume = SurfaceArea × Thickness`
- **N_IB, N_OB:** `Volume = LayerVolume - (surface node volumes)`
- **N_Mat:** `Volume = WallThickness × SurfaceArea`

**Rationale:** Surface nodes have physical thickness (e.g., N_IS ≈ 50 μm), so volume should be calculated geometrically. Bulk nodes represent the remaining volume.

**Reference:** [01_Simulation_Topology.md](01_Simulation_Topology.md#volume-calculations)

### 1.3 Mixing Terminology

**Decision:** MixingRate (rate of change) and MixingFactor (multiplier) are different concepts.

**Definitions:**
- **MixingRate:** Rate of change of mixing (1/s) - how fast layers mix together
- **MixingFactor:** Multiplier for reaction rates and diffusion (dimensionless) - affects reaction kinetics

**Usage:**
- MixingRate: Used in gradient height calculations, layer merging
- MixingFactor: Used in reaction rate law, diffusion calculations

**Reference:** [02_Physics_Engine.md](02_Physics_Engine.md#mixingrate-vs-mixingfactor)

### 1.4 Solid Intersection

**Decision:** Solid objects span all layers they physically intersect.

**Behavior:**
- Calculate intersection with each layer based on object geometry
- Object displaces fluid in all intersecting layers
- Object acts as thermal bridge between layers

**Rationale:** Physically accurate - objects don't exist in a single layer, they occupy space across multiple layers.

**Reference:** [01_Simulation_Topology.md](01_Simulation_Topology.md#intersection-logic)

### 1.5 Purity Calculation

**Decision:** Molar fraction based.

**Formula:**
```
Purity = (Moles of Target Chemical) / (Total Moles in Sample)
```

**Thresholds:**
- **Trace:** < 66% → "Unknown Sludge"
- **Unrefined:** 66-99% → "Dirty [Name]"
- **Pure:** ≥ 99% → "[Name]"

**Rationale:** Molar fraction is the standard chemical measure of composition. Mass fraction could be misleading for compounds with very different molecular weights.

**Reference:** [05_Knowledge_Analysis.md](05_Knowledge_Analysis.md#purity-calculation)

### 1.6 Boid Scaling

**Decision:** Logarithmic scaling for wide concentration ranges.

**Formula:**
```
BoidCount = floor(A * log10(MolarRatio + B) + C)
```

**Rationale:** Handles wide concentration ranges (from trace amounts to pure substances) without requiring thousands of boids for high concentrations or zero boids for trace amounts.

**Reference:** [06_Visualization.md](06_Visualization.md#logarithmic-molar-ratio-to-boid-count)

## 2. Unresolved Issues Requiring Specification

### 2.1 Reaction Rate Surface Area Calculation

**Issue:** The unified rate law includes `SurfaceArea`, but the exact calculation method is TBD.

**Options:**
1. **Geometric:** Use actual surface area of N_IS for surface reactions
2. **Effective:** Use volume-based effective area for bulk reactions
3. **Catalyst-specific:** Use catalyst surface area if present

**Current Placeholder:** Uses N_IS surface area for surface reactions, node volume for bulk reactions.

**Reference:** [03_Chemistry_Engine.md](03_Chemistry_Engine.md#surface-area-calculation-tbd)

**Action Required:** Specify exact calculation method or confirm placeholder approach.

### 2.2 Gradient Merge Threshold

**Issue:** When do gradient layers fully combine? Exact threshold is TBD.

**Current Behavior:** When `GradientHeight > MERGE_THRESHOLD`, layers merge into emulsion.

**Questions:**
- What is the exact threshold value?
- Does it depend on composition, temperature, or other factors?
- Should merge be instantaneous or gradual?

**Reference:** [02_Physics_Engine.md](02_Physics_Engine.md#gradient-formation)

**Action Required:** Define merge threshold and conditions.

### 2.3 Pressure Sealing Mechanics

**Issue:** When a crust detaches, how is pressure sealing calculated? Exact mechanics are TBD.

**Current Behavior:** Crust can become sealed if it forms complete seal, but exact conditions are undefined.

**Questions:**
- What constitutes a "complete seal"?
- How is sealed pressure calculated?
- What happens to gas in sealed volume?

**Reference:** [04_Surface_Physics.md](04_Surface_Physics.md#pressure-sealing-mechanics-tbd)

**Action Required:** Define sealing detection and pressure calculation.

### 2.4 Explosion Risk Calculation

**Issue:** Explosion risk calculation formula is TBD.

**Factors Identified:**
- Pressure difference (sealed vs. external)
- Crust strength (thickness, composition)
- Temperature (thermal expansion)
- Gas composition (flammability)

**Placeholder Formula:**
```
ExplosionRisk = (PressureDifference / CrustStrength) * TemperatureFactor * GasRiskFactor
```

**Reference:** [04_Surface_Physics.md](04_Surface_Physics.md#explosion-risk-calculation-tbd)

**Action Required:** Define exact formula and threshold values.

### 2.5 Trace Amount Handling in Boid Visualization

**Issue:** How to visualize trace amounts (<1 ppm) in boid system? Exact approach is TBD.

**Options:**
1. **Minimum Representation:** Always show at least 1 boid if present
2. **Threshold:** Don't show if below threshold
3. **Special Marker:** Show as single "trace" boid with different appearance

**Current Approach:** Logarithmic scaling with offset, but exact visualization is TBD.

**Reference:** [06_Visualization.md](06_Visualization.md#trace-amount-handling-tbd)

**Action Required:** Specify visualization approach for trace amounts.

### 2.6 Container Overflow Behavior

**Issue:** Can layers exceed container height? Behavior is TBD.

**Options:**
1. **Allow Overflow:** Layers can exceed height, spill to N_OB or connected containers
2. **Enforce Constraint:** Layers cannot exceed height, creates pressure

**Current Behavior:** Constraint enforced, but overflow mechanics not defined.

**Reference:** [01_Simulation_Topology.md](01_Simulation_Topology.md#layer-height-management)

**Action Required:** Define overflow behavior or confirm constraint enforcement.

### 2.7 Branching Flow Split Algorithm

**Issue:** Flow splits based on ΔP, but exact formula is TBD.

**Current Approach:**
```
Flow = k * ΔP / Resistance
```

**Questions:**
- How is resistance calculated?
- What is the flow coefficient `k`?
- How does viscosity affect flow?

**Reference:** [01_Simulation_Topology.md](01_Simulation_Topology.md#node-connection-algorithms)

**Action Required:** Define exact flow splitting formula.

### 2.8 Horizontal Neighbor Interaction Rules

**Issue:** Wide containers (Baths) allow horizontal neighbors, but specific interaction rules are TBD.

**Current Behavior:** Generally interact via N_OB layer of immersed objects.

**Questions:**
- Direct fluid connection if containers are open?
- Heat transfer through N_OB → N_OS interface?
- Pressure equalization?

**Reference:** [01_Simulation_Topology.md](01_Simulation_Topology.md#horizontal-expansion-wide-containers)

**Action Required:** Define interaction mechanics for horizontal neighbors.

### 2.9 Serial Dilution Cleaning Algorithm

**Issue:** Serial dilution cleaning algorithm specifics are TBD.

**General Principle:**
1. Solvent in N_IB diffuses into N_IS
2. Residue in N_IS is diluted by solvent
3. Diluted residue diffuses back to N_IB
4. Process repeats until residue concentration is below threshold

**Questions:**
- Exact diffusion rates?
- Dilution efficiency?
- Number of cycles required?

**Reference:** [04_Surface_Physics.md](04_Surface_Physics.md#serial-dilution-algorithm-tbd)

**Action Required:** Define exact serial dilution mechanics.

### 2.10 Crust Detachment Threshold

**Issue:** 5mm mentioned, but exact conditions are TBD.

**Current Behavior:** If N_IS thickness > 5mm and composition is solidifiable, crust detaches.

**Questions:**
- Absolute threshold or relative to container size?
- Does composition affect threshold?
- Temperature dependence?
- Time-based (must be thick for duration)?

**Reference:** [04_Surface_Physics.md](04_Surface_Physics.md#crusting-threshold)

**Action Required:** Define exact crusting conditions.

## 3. Potential Simplifications/Improvements

### 3.1 Performance Optimizations

#### Caching Layer Height Calculations

**Suggestion:** Cache layer height calculations to avoid recalculation every tick.

**Implementation:** Only recalculate when:
- Composition changes
- Mixing rate changes
- Adjacent layers change

**Benefit:** Reduces computational cost, especially for stable systems.

**Reference:** [01_Simulation_Topology.md](01_Simulation_Topology.md#performance-considerations)

#### Precompute Surface Areas

**Suggestion:** Precompute surface areas for common container geometries.

**Implementation:** Lookup table for standard geometries (beaker, flask, test tube).

**Benefit:** Avoids repeated geometric calculations.

**Reference:** [01_Simulation_Topology.md](01_Simulation_Topology.md#geometry-calculations)

#### Lookup Tables for Phase Space

**Suggestion:** Use lookup tables for phase space calculations (Antoine equation).

**Implementation:** Precompute phase boundaries for common chemicals.

**Benefit:** Faster than calculating Antoine equation every frame.

**Reference:** [02_Physics_Engine.md](02_Physics_Engine.md#lookup-tables)

#### Batch Reaction Calculations

**Suggestion:** Batch reaction calculations by priority to reduce iterations.

**Implementation:** Process all reactions of same priority in single batch.

**Benefit:** Better cache locality, reduced overhead.

**Reference:** [03_Chemistry_Engine.md](03_Chemistry_Engine.md#performance-optimization)

#### Spatial Partitioning

**Suggestion:** Consider spatial partitioning for large numbers of containers.

**Implementation:** Grid-based or quadtree partitioning for container queries.

**Benefit:** Reduces connection checks from O(n²) to O(n log n).

**Reference:** [01_Simulation_Topology.md](01_Simulation_Topology.md#spatial-partitioning)

### 3.2 Precision Considerations

#### 1 ppm Floor Evaluation

**Suggestion:** Evaluate whether 1 ppm floor is necessary everywhere or just for inhibitors.

**Current:** 1 ppm floor used throughout simulation.

**Consideration:**
- Inhibitors require 1 ppm precision
- Other calculations may not need such precision
- Could improve performance by using single precision for non-critical calculations

**Reference:** [02_Physics_Engine.md](02_Physics_Engine.md#precision-requirements)

### 3.3 Representation Simplifications

#### Gradient Layer Representation

**Suggestion:** Consider simplifying gradient layer representation for performance.

**Current:** Gradient layers track mixing rate and density delta.

**Consideration:**
- Could use simpler model for very thin gradients
- Could approximate as sharp interface if mixing is very slow

**Reference:** [01_Simulation_Topology.md](01_Simulation_Topology.md#gradient-layer)

#### Radial Node Update Frequency

**Suggestion:** Evaluate if all 5 radial nodes need full simulation every tick.

**Current:** All nodes update every tick.

**Consideration:**
- N_Mat and N_OS may update less frequently (thermal mass)
- N_IB and N_IS require per-tick updates (active chemistry)

**Reference:** [01_Simulation_Topology.md](01_Simulation_Topology.md#update-frequency)

### 3.4 Feature Additions

#### Reversible Reactions

**Suggestion:** Add equilibrium constants and reverse reactions.

**Current:** Forward-only reactions.

**Benefit:** More realistic chemistry, especially for acid-base and complexation reactions.

**Reference:** [03_Chemistry_Engine.md](03_Chemistry_Engine.md#reversible-reactions)

#### Multiple Crust Handling

**Suggestion:** Handle multiple crusts in same container.

**Current:** Single crust per container.

**Consideration:** Overlapping crusts, priority (oldest is outermost).

**Reference:** [04_Surface_Physics.md](04_Surface_Physics.md#multiple-crusts)

#### Crust Melting

**Suggestion:** If temperature increases, crust may melt.

**Current:** Crusts are permanent once formed.

**Benefit:** More realistic behavior, allows recovery from crusting.

**Reference:** [04_Surface_Physics.md](04_Surface_Physics.md#crust-melting)

## 4. Documentation Cross-References

### 4.1 Decision Tracking

All design decisions are documented in their respective subsystem documents:
- **Topology:** [01_Simulation_Topology.md](01_Simulation_Topology.md)
- **Physics:** [02_Physics_Engine.md](02_Physics_Engine.md)
- **Chemistry:** [03_Chemistry_Engine.md](03_Chemistry_Engine.md)
- **Surface:** [04_Surface_Physics.md](04_Surface_Physics.md)
- **Knowledge:** [05_Knowledge_Analysis.md](05_Knowledge_Analysis.md)
- **Visualization:** [06_Visualization.md](06_Visualization.md)
- **Architecture:** [07_Implementation_Architecture.md](07_Implementation_Architecture.md)

### 4.2 Issue Tracking

All TBD items are marked with "TBD" in their respective documents and listed in this document for tracking.

## 5. Future Considerations

### 5.1 Scalability

- **Large Systems:** How to handle hundreds of containers efficiently?
- **Complex Reactions:** How to handle reaction networks with thousands of reactions?
- **Real-Time Performance:** Can we maintain 60 FPS with complex setups?

### 5.2 Accuracy vs. Performance

- **Trade-offs:** When to simplify physics for performance?
- **Adaptive Quality:** Can we reduce precision for distant/less important containers?

### 5.3 User Experience

- **Visual Feedback:** Are current visualizations clear enough?
- **Tool Usability:** Are analysis tools intuitive?
- **Learning Curve:** How to teach players the system?

## 6. Version History

- **v1.0:** Initial specification expansion
- **Design Decisions:** Clarifications on layer heights, node volumes, mixing terminology, solid intersection, purity calculation, boid scaling
- **Unresolved Issues:** 10 TBD items identified for future specification
