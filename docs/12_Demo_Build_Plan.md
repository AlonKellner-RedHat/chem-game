# Demo Build Plan: Incremental Development

## Overview

This document outlines the incremental build plan for the 3-stage demo MVP. The plan follows a TDD approach with POC validation, building from minimal functionality to complete interactive demo.

## Build Phases

### Phase 0: Foundation (Week 1)
**Goal:** Set up project structure and core infrastructure

#### Tasks
1. **Project Setup**
   - Create TypeScript/Phaser3 project
   - Set up Phaser3 Scene system
   - Configure package.json and tsconfig.json
   - Set up folder structure

2. **Core Infrastructure**
   - Debug view system
   - Grid system
   - Input system (drag & drop)
   - Basic rendering pipeline

3. **Testing Framework**
   - Vitest/Jest test framework setup
   - Test folder structure
   - CI/CD configuration

#### Deliverables
- ✅ Project structure
- ✅ Debug view (empty but functional)
- ✅ Grid system
- ✅ Basic input handling

#### Success Criteria
- Project builds and runs
- Debug view displays
- Grid visible
- Mouse input works

---

### Phase 1: Container System (Week 2) - **Future Work**
**Goal:** Basic container creation and management

#### Tasks
1. **Container GameObject System**
   - ContainerNode class/component
   - Container creation system
   - Container placement system
   - Grid snapping

2. **Composition System**
   - CompositionData class
   - Chemical tracking
   - Molar calculations

3. **Visual Rendering**
   - Basic container shapes (Phaser3 Graphics)
   - Composition visualization
   - Debug view integration

#### Tests
- Container creation
- Grid placement
- Composition tracking
- Visual rendering

#### Deliverables
- ✅ Containers can be created
- ✅ Containers snap to grid
- ✅ Composition tracked
- ✅ Basic visuals

#### Success Criteria
- Can create and place containers
- Composition visible in debug view
- Visuals render correctly

---

### Phase 2: Solid & Liquid Addition (Week 3) - **Future Work**
**Goal:** Add solids and liquids to containers

#### Tasks
1. **Solid System**
   - Solid addition to containers
   - Layer creation for solids
   - Solid visualization

2. **Liquid System**
   - Liquid pouring mechanics
   - Liquid layer creation
   - Liquid visualization

3. **Drag & Drop**
   - Cabinet inventory system
   - Drag from cabinet
   - Drop into containers

#### Tests
- Add solid to container
- Pour liquid into container
- Drag & drop mechanics
- Layer creation

#### Deliverables
- ✅ Solids can be added
- ✅ Liquids can be poured
- ✅ Drag & drop works
- ✅ Layers created correctly

#### Success Criteria
- Can add Malachite to flask
- Can pour acid into flask
- Visuals update correctly

---

### Phase 3: Heat System (Week 4)
**Goal:** Heat transfer and temperature management

#### Tasks
1. **Heat Source System**
   - Bunsen Burner entity
   - Temperature control (knob)
   - Flame visualization

2. **Heat Transfer**
   - Heat conduction algorithm
   - Temperature updates
   - Thermal equilibrium

3. **Temperature Visualization**
   - Thermometer UI
   - Temperature in debug view
   - Visual feedback (flame color)

#### Tests
- Heat source creation
- Heat transfer to container
- Temperature updates
- Thermal equilibrium

#### Deliverables
- ✅ Burner can be placed
- ✅ Heat transfers to container
- ✅ Temperature updates
- ✅ Visual feedback

#### Success Criteria
- Can place burner
- Can adjust temperature
- Container heats up
- Temperature visible

---

### Phase 4: Stage 1 - Decomposition (Week 5)
**Goal:** Complete Stage 1 (Malachite → CO₂)

#### Tasks
1. **Reaction System**
   - Reaction definition
   - Reaction triggering
   - Product generation
   - Composition updates

2. **Malachite Decomposition**
   - Decomposition reaction
   - Temperature trigger (200°C)
   - Product generation (CuO, CO₂, H₂O)
   - Visual feedback

3. **Balloon System**
   - Balloon attachment
   - Gas collection
   - Balloon inflation
   - Composition tracking

4. **Micro View**
   - Zoom lens
   - Boid system (basic)
   - Reaction visualization

#### Tests
- Malachite decomposition
- CO₂ production
- Balloon inflation
- Composition tracking

#### Deliverables
- ✅ Stage 1 playable
- ✅ Decomposition works
- ✅ Balloon inflates
- ✅ CO₂ collected

#### Success Criteria
- Can complete Stage 1
- CO₂ collected in balloon
- All tests pass

---

### Phase 5: Stage 2 - Dissolution (Week 6)
**Goal:** Complete Stage 2 (CuO → Blue Solution)

#### Tasks
1. **Dissolution Reaction**
   - CuO + H₂SO₄ reaction
   - Slow reaction at room temp
   - Heat/agitation effects
   - Solution color calculation

2. **Agitation System**
   - Stirring rod
   - Mixing rate increase
   - Visual feedback

3. **Solution Properties**
   - Color calculation (Beer-Lambert)
   - Homogeneity detection
   - Composition tracking

#### Tests
- Dissolution reaction
- Heat/agitation effects
- Solution color
- Homogeneity

#### Deliverables
- ✅ Stage 2 playable
- ✅ Dissolution works
- ✅ Solution turns blue
- ✅ Homogeneous solution

#### Success Criteria
- Can complete Stage 2
- Blue solution created
- All tests pass

---

### Phase 6: Stage 3 - Crystallization (Week 7)
**Goal:** Complete Stage 3 (Solution → Water + Crystals)

#### Tasks
1. **Condenser System**
   - Condenser attachment
   - Cooling water connection
   - Vapor condensation
   - Liquid collection

2. **Evaporation System**
   - Water evaporation
   - Vapor generation
   - Liquid level updates
   - Boiling visualization

3. **Crystallization System**
   - Supersaturation detection
   - Crystal nucleation
   - Crystal growth
   - Crystal visualization

4. **Purity System**
   - Purity calculation
   - Purity display
   - Success validation

#### Tests
- Evaporation
- Condensation
- Supersaturation
- Crystallization
- Purity calculation

#### Deliverables
- ✅ Stage 3 playable
- ✅ Water separated
- ✅ Crystals formed
- ✅ Purity > 99%

#### Success Criteria
- Can complete Stage 3
- Water and crystals separated
- Purity > 99%
- All tests pass

---

### Phase 7: Polish & Integration (Week 8)
**Goal:** Polish, debug, and final integration

#### Tasks
1. **Visual Polish**
   - Improve visuals (minimal but polished)
   - Animation smoothing
   - Color refinement
   - UI cleanup

2. **Debug View Enhancement**
   - Comprehensive information
   - Better formatting
   - Collapsible sections
   - Export functionality

3. **Performance Optimization**
   - Profile and optimize
   - Memory optimization
   - Frame rate targets
   - Zero-cost abstractions (Rust)

4. **Integration Testing**
   - End-to-end tests
   - Play mode tests
   - Bug fixes
   - Edge case handling

#### Tests
- All previous tests
- Performance tests
- Integration tests
- Play mode tests

#### Deliverables
- ✅ Polished visuals
- ✅ Enhanced debug view
- ✅ Optimized performance
- ✅ All stages integrated

#### Success Criteria
- 60 FPS maintained
- All tests pass
- No major bugs
- Demo is playable

---

## Build Milestones

### Milestone 1: Foundation (End of Week 1)
- Project structure
- Core infrastructure
- Debug view

### Milestone 2: Basic Systems (End of Week 3)
- Containers
- Solids & liquids
- Drag & drop

### Milestone 3: Heat & Reactions (End of Week 5)
- Heat system
- Stage 1 complete

### Milestone 4: Full Demo (End of Week 7)
- All 3 stages playable
- Core functionality complete

### Milestone 5: MVP Release (End of Week 8)
- Polished
- Optimized
- Fully tested

## Testing Strategy

### Unit Tests
- Written before implementation
- Run on every commit
- Must pass before merge

### Integration Tests
- Test component interactions
- Run before merging to main
- Cover critical paths

### Play Mode Tests
- Test complete user flows
- Run before release
- Validate all stages

### Performance Tests
- Frame rate monitoring
- Memory profiling
- GC analysis

## Risk Management

### High-Risk Areas
1. **Reaction System:** Complex, may need iteration
2. **Crystallization:** Supersaturation detection tricky
3. **Performance:** ECS/DOTS learning curve

### Mitigation
- POC validation before full implementation
- Early performance testing
- Incremental complexity
- Regular code reviews

## Dependencies

### External
- Phaser3 3.80+
- Node.js 18+
- TypeScript 5.0+
- Vitest or Jest (for testing)

### Internal
- Core documentation (01-08)
- POC validation (11)
- TDD plan (10)

## Success Metrics

### Technical
- **Performance:** 60 FPS maintained
- **Memory:** < 200MB
- **Code Coverage:** > 80%
- **Test Pass Rate:** 100%

### Functional
- **Stage 1:** Malachite → CO₂ extraction
- **Stage 2:** CuO → Blue solution
- **Stage 3:** Solution → Water + Crystals
- **All Stages:** Playable without guides

### Quality
- **Bugs:** < 5 critical bugs
- **Performance:** Meets targets
- **Usability:** Intuitive interaction

## Timeline Summary

| Week | Phase | Focus |
|------|-------|-------|
| 1 | Foundation | Project setup, infrastructure |
| 2 | Container System | Containers, composition |
| 3 | Solid & Liquid | Addition mechanics |
| 4 | Heat System | Temperature, heat transfer |
| 5 | Stage 1 | Decomposition, balloon |
| 6 | Stage 2 | Dissolution, agitation |
| 7 | Stage 3 | Evaporation, crystallization |
| 8 | Polish | Integration, optimization |

## Next Steps

1. **Start Phase 0:** Set up project structure
2. **Validate POCs:** Run POC tests (see [11_Demo_POC_Plan.md](11_Demo_POC_Plan.md))
3. **Begin TDD:** Write tests for Phase 1 (see [10_Demo_TDD_Plan.md](10_Demo_TDD_Plan.md))
4. **Iterate:** Build, test, iterate

## Documentation

- **Demo Spec:** [09_Demo_Specification.md](09_Demo_Specification.md)
- **TDD Plan:** [10_Demo_TDD_Plan.md](10_Demo_TDD_Plan.md)
- **POC Plan:** [11_Demo_POC_Plan.md](11_Demo_POC_Plan.md)
- **Core Docs:** [01-08_*.md](00_Index.md)

