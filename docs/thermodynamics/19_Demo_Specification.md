# Demo Specification

## Overview

This document specifies the demo scenarios for each implementation stage. Each demo validates that the corresponding thermodynamic systems are working correctly and provides visual/interactive confirmation of the physics.

---

## 1. Demo Philosophy

### 1.1 Purpose

Each demo should:
1. **Validate** the implemented calculations against expected values
2. **Visualize** the properties in an intuitive way
3. **Allow interaction** to explore how properties change
4. **Be self-contained** and not require later stages

### 1.2 Demo Structure

Each demo includes:
- **Setup**: Initial containers and compositions
- **Display**: What properties to show
- **Interaction**: What the user can change
- **Validation**: Expected values to verify correctness

---

## 2. Stage 1 Demo: Moles and Volume

### 2.1 Scenario: Water-Ethanol Volume Mixing

**Setup**:
- Container A: Pure water (adjustable amount)
- Container B: Pure ethanol (adjustable amount)
- Container C: Mixture result

**Display**:
- Moles of each component
- Ideal volume (calculated as sum)
- Actual volume (with excess volume)
- Excess volume (V^E)
- Fill levels in containers

**Interaction**:
- Sliders to adjust water and ethanol amounts
- "Mix" button to combine into Container C
- Reset button

**Validation Points**:

| Water (mol) | Ethanol (mol) | x_ethanol | V_ideal (mL) | V_excess (mL) | V_actual (mL) |
|-------------|---------------|-----------|--------------|---------------|---------------|
| 5.55 | 0 | 0.0 | 100.0 | 0 | 100.0 |
| 4.44 | 0.93 | 0.17 | 100.0 | -2.2 | 97.8 |
| 2.77 | 1.71 | 0.38 | 100.0 | -3.8 | 96.2 |
| 0 | 2.14 | 1.0 | 125.0 | 0 | 125.0 |

### 2.2 UI Layout

```
┌─────────────────────────────────────────────────────────────┐
│  STAGE 1: MOLES AND VOLUME                                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────┐     ┌─────────┐     ┌─────────┐                │
│  │  WATER  │     │ ETHANOL │     │ MIXTURE │                │
│  │         │     │         │     │         │                │
│  │  ████   │     │  ████   │     │  ████   │                │
│  │  ████   │     │  ████   │     │  ████   │                │
│  │  ████   │     │         │     │  ████   │                │
│  └─────────┘     └─────────┘     └─────────┘                │
│   5.55 mol        1.71 mol        7.26 mol                  │
│                                                              │
│  Water: [========|--] 5.55 mol                              │
│  Ethanol: [====|------] 1.71 mol                            │
│                                              [MIX] [RESET]  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Ideal Volume:    200.0 mL                            │   │
│  │ Excess Volume:    -3.8 mL                            │   │
│  │ Actual Volume:   196.2 mL  ◄ 1.9% contraction       │   │
│  │                                                       │   │
│  │ Mole Fractions:  x_water = 0.76, x_ethanol = 0.24   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Stage 2 Demo: Pressure

### 3.1 Scenario A: Ideal Gas in Sealed Container

**Setup**:
- Sealed container with gas (N₂ or air)
- Adjustable moles, volume, temperature

**Display**:
- Pressure calculated from PV = nRT
- Real-time update as parameters change

**Validation Points**:

| n (mol) | V (L) | T (K) | P (kPa) |
|---------|-------|-------|---------|
| 1.0 | 22.414 | 273.15 | 101.3 |
| 1.0 | 22.414 | 373.15 | 138.4 |
| 2.0 | 22.414 | 273.15 | 202.6 |

### 3.2 Scenario B: Vapor Pressure

**Setup**:
- Open container with pure liquid
- Temperature slider

**Display**:
- Vapor pressure at current temperature
- Boiling indicator when P_vapor = P_atm

**Validation Points** (water):

| T (°C) | P_vapor (kPa) |
|--------|---------------|
| 25 | 3.17 |
| 50 | 12.3 |
| 100 | 101.3 |

### 3.3 Scenario C: Hydrostatic Pressure

**Setup**:
- Tall container with liquid
- Pressure gauge at different depths

**Display**:
- Surface pressure
- Pressure at bottom
- Pressure gradient visualization

**Validation** (water):
- 10 cm depth: +0.98 kPa
- 1 m depth: +9.8 kPa

---

## 4. Stage 3 Demo: Thermal Properties

### 4.1 Scenario: Heat of Mixing

**Setup**:
- Container A: Water at 25°C
- Container B: Ethanol at 25°C
- Mix and observe temperature change

**Display**:
- Initial temperatures
- Final temperature after mixing
- Heat capacity of mixture
- Excess enthalpy released

**Validation**:

| x_ethanol | Initial T (°C) | Final T (°C) | ΔT (°C) |
|-----------|----------------|--------------|---------|
| 0.2 | 25 | 28 | +3 |
| 0.4 | 25 | 31 | +6 |
| 0.5 | 25 | 33 | +8 |

### 4.2 Scenario: Heat Capacity Comparison

**Setup**:
- Multiple containers with different liquids
- Same mass of each

**Display**:
- Heat capacity of each
- Energy required to heat by 10°C

**Validation**:

| Liquid | Cp (J/g·K) | Energy for 100g × 10K (kJ) |
|--------|------------|---------------------------|
| Water | 4.18 | 4.18 |
| Ethanol | 2.44 | 2.44 |
| Glycerol | 2.38 | 2.38 |

---

## 5. Stage 4 Demo: Transport Properties

### 5.1 Scenario: Viscosity Comparison

**Setup**:
- Multiple containers with different liquids
- Visual "flow rate" indicator

**Display**:
- Viscosity of each liquid
- Relative pouring time indicator

**Validation**:

| Liquid | η (cP) | Relative pour time |
|--------|--------|-------------------|
| Water | 0.89 | 1.0× |
| Ethanol | 1.07 | 1.2× |
| Water-Ethanol (40%) | 2.9 | 3.3× |
| Glycerol | 934 | 1050× |

### 5.2 Scenario: Water-Ethanol Viscosity Maximum

**Setup**:
- Slider to adjust water-ethanol ratio
- Graph of viscosity vs composition

**Display**:
- Current composition
- Viscosity value
- Position on graph

**Key Observation**: Maximum viscosity at ~40% ethanol, not 50%.

---

## 6. Stage 5 Demo: Surface Tension

### 6.1 Scenario: Surface Tension Comparison

**Setup**:
- Multiple liquids in capillary tubes
- Same tube diameter

**Display**:
- Surface tension value
- Capillary rise height
- Meniscus shape

**Validation**:

| Liquid | γ (mN/m) | Rise in 1mm tube (mm) |
|--------|----------|----------------------|
| Water | 72 | 29 |
| Ethanol | 22 | 8.9 |
| Water + 5% ethanol | ~50 | ~20 |

### 6.2 Scenario: Surface Tension vs Ethanol %

**Setup**:
- Slider to adjust ethanol percentage
- Graph of surface tension vs composition

**Key Observation**: Rapid drop with small ethanol additions.

---

## 7. Stage 6 Demo: Phase Properties

### 7.1 Scenario: Freezing Point Depression

**Setup**:
- Container with water
- Add salt (NaCl) or sugar (glucose)
- Observe freezing point change

**Display**:
- Solute concentration
- Effective molality
- New freezing point

**Validation** (in water):

| Solute | Molality | ΔT_f (°C) | New T_f (°C) |
|--------|----------|-----------|--------------|
| NaCl 1m | 1.0 | -3.5 | -3.5 |
| Glucose 1m | 1.0 | -1.86 | -1.86 |

### 7.2 Scenario: Gas Solubility

**Setup**:
- Container with water
- Adjustable gas pressure above

**Display**:
- Henry's constant
- Dissolved gas concentration
- Supersaturation indicator if pressure drops

**Validation** (O₂ in water at 25°C):

| P_O2 (atm) | [O₂] (mmol/L) |
|------------|---------------|
| 0.21 (air) | 0.27 |
| 1.0 (pure O₂) | 1.26 |

---

## 8. Stage 7 Demo: Advanced Properties

### 8.1 Scenario: Osmotic Pressure

**Setup**:
- Two containers separated by membrane
- Different concentrations

**Display**:
- Concentration in each
- Osmotic pressure difference
- Direction of solvent flow indicator

**Validation** (0.1 M glucose):
- Π ≈ 2.5 atm

### 8.2 Scenario: Dielectric Constant

**Setup**:
- Slider to adjust water-ethanol ratio
- Ion solvation energy display

**Display**:
- Dielectric constant
- Born solvation energy for Na⁺
- Electrolyte solubility indicator

---

## 9. Integrated Demo: Full Property Dashboard

### 9.1 Scenario: Complete Container Analysis

**Setup**:
- Single container with adjustable composition
- Temperature control

**Display**: Full property panel showing all calculated values:

```
┌────────────────────────────────────────────────────────────────┐
│  CONTAINER PROPERTIES                                           │
├────────────────────────────────────────────────────────────────┤
│  COMPOSITION: Water 50%, Ethanol 50%  │  TEMPERATURE: 25°C     │
├────────────────────────────────────────┴───────────────────────┤
│                                                                 │
│  VOLUME & DENSITY                    │  THERMAL                 │
│  ─────────────────                   │  ───────                 │
│  Ideal Volume:    100.0 mL           │  Heat Capacity: 93.9 J/mol·K
│  Actual Volume:    96.2 mL           │  Thermal Cond: 0.31 W/m·K
│  Density:         867 kg/m³          │  Heat of Mix: -800 J/mol │
│                                       │                          │
│  PRESSURE                             │  TRANSPORT               │
│  ────────                             │  ─────────               │
│  Surface:         101.3 kPa          │  Viscosity:   1.6 cP     │
│  Bottom (+10cm):  102.2 kPa          │  Diffusion:   1.5e-9 m²/s│
│  Vapor Pressure:  7.2 kPa            │                          │
│                                       │                          │
│  SURFACE                              │  PHASE                   │
│  ───────                              │  ─────                   │
│  Surface Tension: 28 mN/m            │  Boiling Pt:  78°C       │
│  Meniscus:        5 mm               │  Freezing Pt: -40°C      │
│                                       │                          │
│  ADVANCED                             │                          │
│  ────────                             │                          │
│  Osmotic Pressure: 0 kPa             │                          │
│  Dielectric:       42                │                          │
│                                       │                          │
└────────────────────────────────────────────────────────────────┘
```

### 9.2 Interactive Elements

- Composition sliders for each substance
- Temperature slider
- Container geometry selector
- Reset to presets (pure water, pure ethanol, 50:50, seawater, etc.)

---

## 10. Implementation Notes

### 10.1 Demo Framework

```typescript
interface DemoScenario {
  readonly id: string;
  readonly name: string;
  readonly stage: number;
  readonly description: string;

  /** Initial container setup */
  readonly setup: ContainerSetup[];

  /** What properties to display */
  readonly displayProperties: PropertySet[];

  /** Validation points for testing */
  readonly validationPoints: ValidationPoint[];
}

interface ContainerSetup {
  readonly containerId: string;
  readonly geometry: string;
  readonly composition: Record<SubstanceId, number>;
  readonly temperature: number;
}

interface ValidationPoint {
  readonly description: string;
  readonly property: string;
  readonly expectedValue: number;
  readonly tolerance: number;
}
```

### 10.2 Demo Runner

```typescript
class DemoRunner {
  private readonly registry: SubstanceRegistry;
  private readonly models: ModelRegistry;

  /**
   * Run a demo and validate all points.
   */
  runDemo(scenario: DemoScenario): DemoResult {
    // Create containers from setup
    const containers = scenario.setup.map(s =>
      new Container(/* ... */)
    );

    // Validate all points
    const validations = scenario.validationPoints.map(point => {
      const actual = this.getProperty(containers, point.property);
      const passed = Math.abs(actual - point.expectedValue) <= point.tolerance;
      return { point, actual, passed };
    });

    return {
      scenario,
      containers,
      validations,
      allPassed: validations.every(v => v.passed),
    };
  }
}
```

---

## 11. Interaction Points

- **[17_Container_Model.md](17_Container_Model.md)**: Container state source
- **[18_Spectral_Integration.md](18_Spectral_Integration.md)**: Visual rendering
- **[20_Implementation_Architecture.md](20_Implementation_Architecture.md)**: Code structure
- **[21_Test_Plan.md](21_Test_Plan.md)**: Validation data
