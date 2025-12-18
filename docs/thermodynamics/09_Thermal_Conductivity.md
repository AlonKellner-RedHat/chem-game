# Thermal Conductivity

## Overview

This document defines the thermal conductivity system, which determines the rate at which heat transfers through a material. This is a rate capability—it tells you how fast heat CAN transfer, not how much HAS transferred over time.

---

## 1. First Principles

### 1.1 Molecular Heat Transfer

Heat transfers through liquids via molecular collisions:
1. Hot molecules vibrate/move faster
2. They collide with cooler neighbors
3. Energy transfers from hot to cold
4. Net heat flows down the temperature gradient

### 1.2 Fourier's Law

**One-dimensional heat conduction**:
```
q = -k × A × (dT/dx)
```

where:
- q = heat flow rate (W = J/s)
- k = thermal conductivity (W/(m·K))
- A = cross-sectional area (m²)
- dT/dx = temperature gradient (K/m)

The negative sign indicates heat flows from hot to cold.

**Reference**: Fourier, J. (1822). "Théorie analytique de la chaleur"

### 1.3 Units

Thermal conductivity k: W/(m·K) = J/(s·m·K)

| Material | k (W/(m·K)) |
|----------|-------------|
| Copper | 400 |
| Glass | 1.0 |
| Water | 0.60 |
| Ethanol | 0.17 |
| Air | 0.026 |
| Insulation | 0.03-0.05 |

---

## 2. Pure Component Conductivity (Stage 3)

### 2.1 Temperature Dependence

For liquids, thermal conductivity typically **decreases** with temperature:
```
k(T) = k_ref × [1 - α × (T - T_ref)]
```

where α is a small positive coefficient.

For gases, thermal conductivity typically **increases** with temperature.

### 2.2 Data Structure

```typescript
interface ThermalConductivityData {
  /** Thermal conductivity at reference temperature in W/(m·K) */
  readonly thermalConductivity: number;

  /** Reference temperature in K */
  readonly thermalConductivityRefTemp: number;

  /** Temperature coefficient (optional) */
  readonly thermalConductivityTempCoeff?: number;
}
```

### 2.3 Reference Values (at 25°C)

| Substance | k (W/(m·K)) |
|-----------|-------------|
| Water | 0.607 |
| Ethanol | 0.171 |
| Glycerol | 0.285 |
| Methanol | 0.200 |
| Acetone | 0.161 |
| n-Hexane | 0.124 |

**Source**: CRC Handbook of Chemistry and Physics

---

## 3. Mixture Conductivity

### 3.1 Simple Linear Mixing

The simplest approach (volume-fraction weighted):
```
k_mix = Σ φ_i × k_i
```

where φ_i is the volume fraction.

This is often inaccurate for non-ideal mixtures.

### 3.2 Filippov Equation

Better for liquid mixtures:
```
k_mix = x₁ × k₁ + x₂ × k₂ - 0.72 × x₁ × x₂ × |k₁ - k₂|
```

**Properties**:
- Accounts for non-linear mixing
- Gives k_mix between k₁ and k₂
- 0.72 is an empirical constant

**Reference**: Filippov, L.P. (1968). Int. J. Heat Mass Transfer 11: 331.

### 3.3 Li Mixing Rule

More general form:
```
k_mix = Σ Σ φ_i × φ_j × k_ij
```

where:
```
k_ij = 2 / (1/k_i + 1/k_j)  (harmonic mean)
```

### 3.4 Implementation

```typescript
interface ThermalConductivityMixingRule {
  readonly id: string;
  readonly name: string;

  /**
   * Calculate mixture thermal conductivity.
   *
   * @param pureValues - Conductivity of each pure component (W/(m·K))
   * @param moleFractions - Mole fractions
   * @param volumeFractions - Volume fractions
   * @param temperature - Temperature in K
   * @returns Mixture thermal conductivity in W/(m·K)
   */
  calculate(
    pureValues: Map<SubstanceId, number>,
    moleFractions: Map<SubstanceId, number>,
    volumeFractions: Map<SubstanceId, number>,
    temperature: number
  ): number;
}

/**
 * Filippov mixing rule for binary liquid mixtures.
 */
class FilippovMixingRule implements ThermalConductivityMixingRule {
  readonly id = 'filippov';
  readonly name = 'Filippov Mixing Rule';

  calculate(
    pureValues: Map<SubstanceId, number>,
    moleFractions: Map<SubstanceId, number>,
    volumeFractions: Map<SubstanceId, number>,
    temperature: number
  ): number {
    const substances = Array.from(pureValues.keys());

    if (substances.length === 1) {
      return pureValues.get(substances[0])!;
    }

    if (substances.length === 2) {
      const [id1, id2] = substances;
      const x1 = moleFractions.get(id1) ?? 0;
      const x2 = moleFractions.get(id2) ?? 0;
      const k1 = pureValues.get(id1)!;
      const k2 = pureValues.get(id2)!;

      // Filippov equation
      return x1 * k1 + x2 * k2 - 0.72 * x1 * x2 * Math.abs(k1 - k2);
    }

    // For multi-component: use pairwise approximation
    let kMix = 0;
    for (const [id, x] of moleFractions) {
      kMix += x * (pureValues.get(id) ?? 0);
    }
    return kMix;
  }
}
```

---

## 4. Heat Transfer Rate Calculation

### 4.1 Steady-State Conduction

For heat transfer through a liquid layer:
```
q = k × A × ΔT / L
```

where:
- q = heat transfer rate (W)
- k = thermal conductivity (W/(m·K))
- A = cross-sectional area (m²)
- ΔT = temperature difference (K)
- L = layer thickness (m)

### 4.2 Thermal Resistance

Analogous to electrical resistance:
```
R_thermal = L / (k × A)
```

Heat flow:
```
q = ΔT / R_thermal
```

### 4.3 Implementation

```typescript
interface HeatTransferInput {
  readonly composition: Composition;
  readonly temperature: number;       // K
  readonly crossSectionArea: number;  // m²
  readonly layerThickness: number;    // m
  readonly temperatureDifference: number;  // K (across layer)
}

interface HeatTransferResult {
  /** Thermal conductivity of mixture in W/(m·K) */
  readonly thermalConductivity: number;

  /** Thermal resistance in K/W */
  readonly thermalResistance: number;

  /** Heat transfer rate in W */
  readonly heatTransferRate: number;

  /** Heat flux in W/m² */
  readonly heatFlux: number;
}

/**
 * Calculate heat transfer rate through a liquid layer.
 *
 * Note: This is the instantaneous rate capability, not accumulated heat.
 */
function calculateHeatTransfer(
  input: HeatTransferInput,
  registry: SubstanceRegistry,
  mixingRule: ThermalConductivityMixingRule
): HeatTransferResult {
  const { composition, temperature, crossSectionArea, layerThickness, temperatureDifference } = input;

  // Get pure component conductivities
  const pureValues = new Map<SubstanceId, number>();
  for (const id of composition.moles.keys()) {
    const substance = registry.getRequired(id);
    pureValues.set(id, substance.thermalConductivity);
  }

  // Calculate fractions
  const moleFractions = getMoleFractions(composition);
  const volumeFractions = getIdealVolumeFractions(composition, registry);

  // Calculate mixture conductivity
  const k = mixingRule.calculate(pureValues, moleFractions, volumeFractions, temperature);

  // Calculate thermal resistance and heat transfer
  const R = layerThickness / (k * crossSectionArea);
  const q = temperatureDifference / R;
  const flux = q / crossSectionArea;

  return {
    thermalConductivity: k,
    thermalResistance: R,
    heatTransferRate: q,
    heatFlux: flux,
  };
}
```

---

## 5. Characteristic Times

### 5.1 Thermal Diffusivity

Thermal diffusivity relates conductivity to heat capacity:
```
α = k / (ρ × Cp)
```

where:
- α = thermal diffusivity (m²/s)
- k = thermal conductivity (W/(m·K))
- ρ = density (kg/m³)
- Cp = specific heat capacity (J/(kg·K))

### 5.2 Characteristic Time

Time scale for heat to diffuse a distance L:
```
t_thermal = L² / α
```

### 5.3 Implementation

```typescript
interface ThermalDiffusivityResult {
  /** Thermal diffusivity in m²/s */
  readonly diffusivity: number;

  /** Characteristic time to diffuse across given distance in seconds */
  readonly characteristicTime: number;
}

/**
 * Calculate thermal diffusivity and characteristic time.
 *
 * Note: characteristicTime is an indicator, not a simulation result.
 */
function calculateThermalDiffusivity(
  composition: Composition,
  temperature: number,
  characteristicLength: number,  // m
  registry: SubstanceRegistry,
  mixingRule: ThermalConductivityMixingRule
): ThermalDiffusivityResult {
  // Get thermal conductivity
  const k = calculateMixtureConductivity(composition, temperature, registry, mixingRule);

  // Get density
  const density = calculateDensity(composition, temperature, registry);  // kg/m³

  // Get specific heat capacity
  const cpResult = calculateHeatCapacity({ composition, temperature }, registry);
  const specificCp = cpResult.specificCp * 1000;  // J/(kg·K)

  // Thermal diffusivity
  const alpha = k / (density * specificCp);

  // Characteristic time
  const tChar = characteristicLength * characteristicLength / alpha;

  return {
    diffusivity: alpha,
    characteristicTime: tChar,
  };
}
```

---

## 6. Water-Ethanol System

### 6.1 Conductivity Data

| x_ethanol | k (W/(m·K)) |
|-----------|-------------|
| 0.0 | 0.607 |
| 0.2 | 0.440 |
| 0.4 | 0.320 |
| 0.6 | 0.240 |
| 0.8 | 0.190 |
| 1.0 | 0.171 |

### 6.2 Non-Linear Behavior

The water-ethanol system shows significant deviation from linear mixing:
- Linear prediction at x=0.5: (0.607 + 0.171)/2 = 0.389 W/(m·K)
- Actual value: ~0.28 W/(m·K)
- Filippov prediction: ~0.31 W/(m·K) (better)

---

## 7. TDD Validation Data

### 7.1 Pure Component Tests

```typescript
describe('ThermalConductivity - Pure', () => {
  it('should give k = 0.607 W/(m·K) for water at 25°C', () => {
    const comp = pureComposition('H2O', 1.0);
    const k = calculateMixtureConductivity(comp, 298.15, registry, filippovRule);

    expect(k).toBeCloseTo(0.607, 2);
  });

  it('should give k = 0.171 W/(m·K) for ethanol at 25°C', () => {
    const comp = pureComposition('C2H5OH', 1.0);
    const k = calculateMixtureConductivity(comp, 298.15, registry, filippovRule);

    expect(k).toBeCloseTo(0.171, 2);
  });
});
```

### 7.2 Mixture Tests

```typescript
describe('ThermalConductivity - Mixture', () => {
  it('should give k between pure values for 50:50 water-ethanol', () => {
    const comp = createComposition({ 'H2O': 0.5, 'C2H5OH': 0.5 });
    const k = calculateMixtureConductivity(comp, 298.15, registry, filippovRule);

    expect(k).toBeGreaterThan(0.171);  // > pure ethanol
    expect(k).toBeLessThan(0.607);     // < pure water
    expect(k).toBeCloseTo(0.31, 1);    // Filippov prediction
  });
});
```

### 7.3 Heat Transfer Tests

```typescript
describe('HeatTransfer', () => {
  it('should calculate correct heat transfer rate', () => {
    const comp = pureComposition('H2O', 1.0);
    const result = calculateHeatTransfer({
      composition: comp,
      temperature: 298.15,
      crossSectionArea: 0.01,    // 0.01 m² (10 cm × 10 cm)
      layerThickness: 0.10,      // 10 cm
      temperatureDifference: 10, // 10 K
    }, registry, filippovRule);

    // q = k × A × ΔT / L = 0.607 × 0.01 × 10 / 0.1 = 0.607 W
    expect(result.heatTransferRate).toBeCloseTo(0.607, 2);
  });
});
```

---

## 8. Interaction Points

- **[02_Substance_Model.md](02_Substance_Model.md)**: Pure component conductivities
- **[04_Volume_System.md](04_Volume_System.md)**: Volume fractions for mixing rules
- **[07_Heat_Capacity.md](07_Heat_Capacity.md)**: Cp for thermal diffusivity
- **[17_Container_Model.md](17_Container_Model.md)**: Heat transfer rate as property
