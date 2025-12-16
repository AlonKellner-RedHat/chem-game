# Chemistry Simulator Documentation Index

## Overview

This documentation set provides comprehensive technical specifications for the **Systemic 2D Chemistry Simulator**, breaking down the system into detailed subsystem documents. Each document focuses on a specific aspect of the simulation, with detailed algorithms, data structures, mathematical formulations, and interaction patterns.

## Document Structure

### Core Simulation Documents

1. **[01_Simulation_Topology.md](01_Simulation_Topology.md)**
   - Container graph structure and connectivity
   - Vertical slicing (LayerEntity system)
   - 5-node radial architecture (N_IB, N_IS, N_Mat, N_OS, N_OB)
   - Geometry and spatial relationships
   - Solid object intersection mechanics

2. **[02_Physics_Engine.md](02_Physics_Engine.md)**
   - Thermodynamics (conduction, convection, phase transitions)
   - Hydrostatics and pressure calculations
   - Transport dynamics (layer sorting, gradient formation)
   - Double precision solver architecture

3. **[03_Chemistry_Engine.md](03_Chemistry_Engine.md)**
   - Reaction priority system
   - Kinetics and rate laws
   - Surface chemistry (heterogeneous catalysis, corrosion)
   - Fallback systems (brown sludge, carbon tar)

4. **[04_Surface_Physics.md](04_Surface_Physics.md)**
   - Dynamic surface thickness (N_IS)
   - Wetting and cleaning mechanics
   - Nucleation and solidification
   - Crusting and pressure sealing

### Analysis & Visualization

5. **[05_Knowledge_Analysis.md](05_Knowledge_Analysis.md)**
   - Fog of war and purity calculation
   - Forward/backward propagation
   - In-situ analysis tools

6. **[06_Visualization.md](06_Visualization.md)**
   - Macro-view rendering (5-layer shader)
   - Micro-view lens (boid system)
   - Reaction and phase visualization

### Implementation

7. **[07_Implementation_Architecture.md](07_Implementation_Architecture.md)**
   - Phaser3 Scene structure
   - Phaser3 integration
   - Scene update order
   - Performance optimization

8. **[08_Design_Decisions_Issues.md](08_Design_Decisions_Issues.md)**
   - Design decisions made
   - Unresolved issues (TBD items)
   - Potential improvements

### Demo & MVP Documents

9. **[09_Demo_Specification.md](09_Demo_Specification.md)**
   - 3-stage demo specification
   - Interaction mechanics
   - Visual design (minimal)
   - Debug view specification

10. **[10_Demo_TDD_Plan.md](10_Demo_TDD_Plan.md)**
    - Test-driven development plan
    - Unit, integration, and play mode tests
    - Test requirements for each stage

11. **[11_Demo_POC_Plan.md](11_Demo_POC_Plan.md)**
    - Proof of concept prototypes
    - POC validation strategy
    - Risk mitigation

12. **[12_Demo_Build_Plan.md](12_Demo_Build_Plan.md)**
    - Incremental build plan
    - 8-week development timeline
    - Milestones and deliverables

## Cross-References

### Key Concepts Across Documents

- **5-Node Radial Structure**: Defined in [01_Simulation_Topology.md](01_Simulation_Topology.md#5-node-radial-architecture), used throughout [02_Physics_Engine.md](02_Physics_Engine.md#heat-conduction) and [03_Chemistry_Engine.md](03_Chemistry_Engine.md#reaction-node-selection)
- **LayerEntity System**: Core data structure in [01_Simulation_Topology.md](01_Simulation_Topology.md#layerentity-data-structure), manipulated by [02_Physics_Engine.md](02_Physics_Engine.md#layer-sorting) and [04_Surface_Physics.md](04_Surface_Physics.md#dynamic-thickness)
- **MixingRate vs MixingFactor**: Clarified in [08_Design_Decisions_Issues.md](08_Design_Decisions_Issues.md#mixing-terminology), used in [02_Physics_Engine.md](02_Physics_Engine.md#mixing-calculations)
- **Reaction Priority Stack**: Defined in [03_Chemistry_Engine.md](03_Chemistry_Engine.md#reaction-priority-stack), executed in [07_Implementation_Architecture.md](07_Implementation_Architecture.md#system-execution-order)
- **Purity Calculation**: Algorithm in [05_Knowledge_Analysis.md](05_Knowledge_Analysis.md#purity-calculation), based on molar fractions as specified in [08_Design_Decisions_Issues.md](08_Design_Decisions_Issues.md#purity-calculation)

## Reading Order

### For Understanding the System
1. Start with [01_Simulation_Topology.md](01_Simulation_Topology.md) to understand the fundamental structure
2. Read [02_Physics_Engine.md](02_Physics_Engine.md) for the physical simulation mechanics
3. Read [03_Chemistry_Engine.md](03_Chemistry_Engine.md) for chemical reactions
4. Read [04_Surface_Physics.md](04_Surface_Physics.md) for surface-specific behaviors
5. Read [05_Knowledge_Analysis.md](05_Knowledge_Analysis.md) for the game loop mechanics
6. Read [06_Visualization.md](06_Visualization.md) for rendering
7. Read [07_Implementation_Architecture.md](07_Implementation_Architecture.md) for implementation details

### For Implementation
1. Start with [07_Implementation_Architecture.md](07_Implementation_Architecture.md) for the overall structure
2. Reference [08_Design_Decisions_Issues.md](08_Design_Decisions_Issues.md) for design decisions
3. Implement subsystems in order: Topology → Physics → Chemistry → Surface → Analysis → Visualization

### For Demo Development
1. Read [09_Demo_Specification.md](09_Demo_Specification.md) for demo requirements
2. Follow [11_Demo_POC_Plan.md](11_Demo_POC_Plan.md) to validate core systems
3. Use [10_Demo_TDD_Plan.md](10_Demo_TDD_Plan.md) for test-driven development
4. Execute [12_Demo_Build_Plan.md](12_Demo_Build_Plan.md) for incremental build

## Document Conventions

- **TBD**: Items marked as "TBD" require further specification (see [08_Design_Decisions_Issues.md](08_Design_Decisions_Issues.md))
- **Mathematical Formulations**: All equations include variable definitions
- **Data Structures**: TypeScript-style definitions with type information
- **Algorithms**: Step-by-step pseudocode
- **Performance Notes**: Computational complexity where relevant

## Version History

- **Initial Version**: Comprehensive expansion of the original specification document
- **Design Decisions**: Clarifications on layer heights, node volumes, mixing terminology, solid intersection, purity calculation, and boid scaling
- **Demo Specification**: Added 3-stage demo specification with TDD plan, POC plan, and incremental build plan
