# Surface Tension

## Overview

This document defines the surface tension system, which determines the cohesive force at liquid-air interfaces. Surface tension affects meniscus shape, droplet formation, and wetting behavior. This is an instantaneous property—it describes current interfacial energy, not dynamic spreading.

---

## 1. First Principles

### 1.1 Molecular Imbalance at Surface

Surface tension arises from asymmetric molecular forces at interfaces:

**Bulk molecules**: Surrounded by neighbors on all sides → balanced forces
**Surface molecules**: Missing neighbors above → net inward pull

This creates:
- A tendency to minimize surface area
- A "skin" that resists stretching
- Energy cost for creating new surface

### 1.2 Definition

**Surface tension** (γ): Force per unit length required to stretch the surface, or equivalently, energy per unit area of surface.

```
γ = F / L = dG / dA
```

where:
- γ = surface tension (N/m = J/m²)
- F = force required to stretch surface (N)
- L = length of stretched edge (m)
- dG = Gibbs energy change (J)
- dA = area change (m²)

### 1.3 Units

| Unit | Symbol | Value |
|------|--------|-------|
| SI | N/m = J/m² | 1 |
| CGS | dyn/cm = erg/cm² | 0.001 N/m |
| mN/m | milli-newton per meter | 0.001 N/m |

**Common values at 25°C**:
| Substance | γ (mN/m) |
|-----------|----------|
| Water | 71.97 |
| Ethanol | 21.97 |
| Methanol | 22.1 |
| Acetone | 23.5 |
| Mercury | 485.5 |
| Hexane | 18.4 |

---

## 2. Pure Component Surface Tension (Stage 5)

### 2.1 Temperature Dependence

Surface tension **decreases** with temperature (molecules have more energy to escape):

**Linear approximation**:
```
γ(T) = γ_ref - k × (T - T_ref)
```

**Eötvös Rule** (more physical):
```
γ × V_m^(2/3) = k × (T_c - T - 6)
```

where:
- V_m = molar volume
- T_c = critical temperature
- k ≈ 2.1 × 10⁻⁷ J/(K·mol^(2/3))

**Reference**: Eötvös, L. (1886). Ann. Phys. 263: 448.

At critical point (T = T_c), surface tension vanishes.

### 2.2 Data Structure

```typescript
interface SurfaceTensionData {
  /** Surface tension at reference temperature in N/m */
  readonly surfaceTension: number;

  /** Reference temperature in K */
  readonly surfaceTensionRefTemp: number;

  /** Temperature coefficient in N/(m·K) */
  readonly surfaceTensionTempCoeff?: number;

  /** Parachor for Macleod-Sugden correlation */
  readonly parachor?: number;
}
```

### 2.3 Temperature Correction

```typescript
/**
 * Calculate surface tension at temperature T.
 * γ(T) = γ_ref - k × (T - T_ref)
 */
function calculateSurfaceTension(
  substance: Substance,
  temperature: number
): number {
  const gamma_ref = substance.surfaceTension;
  const T_ref = substance.surfaceTensionRefTemp;

  if (substance.surfaceTensionTempCoeff) {
    const k = substance.surfaceTensionTempCoeff;
    return gamma_ref - k * (temperature - T_ref);
  }

  return gamma_ref;
}
```

---

## 3. Mixture Surface Tension

### 3.1 Surface Enrichment

In mixtures, the component with lower surface tension tends to **concentrate at the surface**, reducing the overall surface tension below the linear average.

For water-ethanol:
- Ethanol (γ = 22 mN/m) enriches at the surface
- Surface tension drops rapidly with small ethanol additions

### 3.2 Linear Mixing (Inaccurate)

Simple mole-fraction weighted average:
```
γ_mix = Σ x_i × γ_i
```

This **overestimates** surface tension for most mixtures.

### 3.3 Macleod-Sugden Correlation

Uses the parachor [P], an empirical constant:
```
γ^(1/4) = ([P] / V_m) × (ρ_L - ρ_V)
```

For mixtures:
```
γ^(1/4) = Σ (x_i × [P]_i) × (ρ_L / M_avg)
```

**Reference**: Macleod, D.B. (1923). Trans. Faraday Soc. 19: 38.

### 3.4 Tamura-Kurata-Odani Equation

For mixtures:
```
γ_mix = Σ ψ_i × γ_i
```

where ψ_i is the **surface** mole fraction (not bulk):
```
ψ_i = (x_i × V_i^(2/3)) / Σ(x_j × V_j^(2/3))
```

### 3.5 Implementation

```typescript
interface SurfaceTensionMixingRule {
  readonly id: string;
  readonly name: string;

  calculate(
    pureValues: Map<SubstanceId, number>,      // N/m
    moleFractions: Map<SubstanceId, number>,
    molarVolumes: Map<SubstanceId, number>,    // m³/mol
    temperature: number
  ): number;
}

/**
 * Macleod-Sugden mixing rule using parachors.
 */
class MacleodSugdenMixingRule implements SurfaceTensionMixingRule {
  readonly id = 'macleod-sugden';
  readonly name = 'Macleod-Sugden Parachor Method';

  calculate(
    pureValues: Map<SubstanceId, number>,
    moleFractions: Map<SubstanceId, number>,
    molarVolumes: Map<SubstanceId, number>,
    temperature: number,
    parachors: Map<SubstanceId, number>
  ): number {
    // γ^(1/4) = Σ (x_i × [P]_i) / V_m_mix

    // Calculate mixture molar volume
    let V_mix = 0;
    for (const [id, x] of moleFractions) {
      V_mix += x * (molarVolumes.get(id) ?? 0);
    }

    // Calculate sum of parachor contributions
    let parachorSum = 0;
    for (const [id, x] of moleFractions) {
      const P = parachors.get(id) ?? 0;
      parachorSum += x * P;
    }

    // γ^(1/4) = parachor_sum / V_m (in appropriate units)
    const gamma14 = parachorSum / (V_mix * 1e6);  // Convert units

    return Math.pow(gamma14, 4);
  }
}

/**
 * Simple surface mole fraction method.
 */
class SurfaceFractionMixingRule implements SurfaceTensionMixingRule {
  readonly id = 'surface-fraction';
  readonly name = 'Surface Fraction Method';

  calculate(
    pureValues: Map<SubstanceId, number>,
    moleFractions: Map<SubstanceId, number>,
    molarVolumes: Map<SubstanceId, number>,
    temperature: number
  ): number {
    // Calculate surface fractions
    // ψ_i = (x_i × V_i^(2/3)) / Σ(x_j × V_j^(2/3))

    let denominator = 0;
    for (const [id, x] of moleFractions) {
      const V = molarVolumes.get(id) ?? 0;
      denominator += x * Math.pow(V, 2/3);
    }

    let gamma_mix = 0;
    for (const [id, x] of moleFractions) {
      const V = molarVolumes.get(id) ?? 0;
      const gamma = pureValues.get(id) ?? 0;
      const psi = (x * Math.pow(V, 2/3)) / denominator;
      gamma_mix += psi * gamma;
    }

    return gamma_mix;
  }
}
```

---

## 4. Water-Ethanol System

### 4.1 Experimental Data

| x_ethanol | γ (mN/m) | Linear prediction |
|-----------|----------|------------------|
| 0.0 | 71.97 | 71.97 |
| 0.05 | 52 | 69.5 |
| 0.10 | 42 | 67.0 |
| 0.20 | 34 | 62.0 |
| 0.40 | 28 | 52.0 |
| 0.60 | 26 | 42.0 |
| 0.80 | 24 | 32.0 |
| 1.0 | 21.97 | 21.97 |

**Key observation**: Even 5% ethanol drops surface tension from 72 to 52 mN/m!

This dramatic decrease is because ethanol molecules concentrate at the surface, even at low bulk concentrations.

### 4.2 Surface Excess

The Gibbs adsorption isotherm relates surface tension change to surface excess concentration:
```
Γ = -(1/RT) × (∂γ/∂ln(a))
```

Positive Γ means the solute accumulates at the surface.

---

## 5. Applications

### 5.1 Meniscus Height

In a capillary tube:
```
h = (2 × γ × cos(θ)) / (ρ × g × r)
```

where:
- h = height of rise (m)
- γ = surface tension (N/m)
- θ = contact angle
- ρ = density (kg/m³)
- g = gravity (m/s²)
- r = capillary radius (m)

### 5.2 Droplet Size

Minimum stable droplet radius (Kelvin equation related):
```
r_min ∝ γ / ΔP
```

Higher surface tension → larger minimum droplets.

### 5.3 Visual Realism

Surface tension affects:
- Meniscus shape in containers
- Droplet roundness
- Wetting of container walls

### 5.4 Implementation

```typescript
interface CapillaryInput {
  readonly composition: Composition;
  readonly temperature: number;
  readonly capillaryRadius: number;     // m
  readonly contactAngle: number;        // radians
}

interface CapillaryResult {
  /** Surface tension in N/m */
  readonly surfaceTension: number;

  /** Capillary rise height in m */
  readonly riseHeight: number;

  /** Capillary rise in mm */
  readonly riseHeightMm: number;
}

/**
 * Calculate capillary rise height.
 * h = (2 × γ × cos(θ)) / (ρ × g × r)
 */
function calculateCapillaryRise(
  input: CapillaryInput,
  registry: SubstanceRegistry,
  mixingRule: SurfaceTensionMixingRule
): CapillaryResult {
  const { composition, temperature, capillaryRadius, contactAngle } = input;

  // Get surface tension
  const gamma = calculateMixtureSurfaceTension(
    composition, temperature, registry, mixingRule
  );

  // Get density
  const density = calculateDensity(composition, temperature, registry);

  // Capillary rise
  const h = (2 * gamma * Math.cos(contactAngle)) / (density * 9.80665 * capillaryRadius);

  return {
    surfaceTension: gamma,
    riseHeight: h,
    riseHeightMm: h * 1000,
  };
}
```

---

## 6. Interfacial Tension

### 6.1 Liquid-Liquid Interfaces

For immiscible liquids:
```
γ_12 = interfacial tension between phases 1 and 2
```

**Antonoff's Rule** (approximate):
```
γ_12 ≈ |γ_1 - γ_2|
```

**Girifalco-Good Equation** (better):
```
γ_12 = γ_1 + γ_2 - 2 × Φ × √(γ_1 × γ_2)
```

where Φ ≈ 0.5-1.0 depends on molecular similarity.

### 6.2 Future Extension

For the phase separation demo, interfacial tension between immiscible layers will be needed.

---

## 7. TDD Validation Data

### 7.1 Pure Component Tests

```typescript
describe('SurfaceTension - Pure', () => {
  it('should give γ = 72 mN/m for water at 25°C', () => {
    const comp = pureComposition('H2O', 1.0);
    const gamma = calculateMixtureSurfaceTension(comp, 298.15, registry, rule);

    expect(gamma * 1000).toBeCloseTo(72, 0);  // mN/m
  });

  it('should give γ = 22 mN/m for ethanol at 25°C', () => {
    const comp = pureComposition('C2H5OH', 1.0);
    const gamma = calculateMixtureSurfaceTension(comp, 298.15, registry, rule);

    expect(gamma * 1000).toBeCloseTo(22, 0);
  });

  it('should decrease with temperature', () => {
    const comp = pureComposition('H2O', 1.0);
    const gamma25 = calculateMixtureSurfaceTension(comp, 298.15, registry, rule);
    const gamma50 = calculateMixtureSurfaceTension(comp, 323.15, registry, rule);

    expect(gamma50).toBeLessThan(gamma25);
  });
});
```

### 7.2 Mixture Tests

```typescript
describe('SurfaceTension - Mixtures', () => {
  it('should show rapid decrease with small ethanol addition', () => {
    const comp = createComposition({ 'H2O': 0.95, 'C2H5OH': 0.05 });
    const gamma = calculateMixtureSurfaceTension(comp, 298.15, registry, rule);

    // Should be much lower than 72 mN/m (not linear)
    expect(gamma * 1000).toBeLessThan(60);
    expect(gamma * 1000).toBeGreaterThan(40);
  });

  it('should be between pure values for any mixture', () => {
    const comp = createComposition({ 'H2O': 0.5, 'C2H5OH': 0.5 });
    const gamma = calculateMixtureSurfaceTension(comp, 298.15, registry, rule);

    expect(gamma * 1000).toBeLessThan(72);
    expect(gamma * 1000).toBeGreaterThan(22);
  });
});
```

### 7.3 Capillary Rise Tests

```typescript
describe('CapillaryRise', () => {
  it('should calculate correct rise for water in 1mm tube', () => {
    const comp = pureComposition('H2O', 1.0);
    const result = calculateCapillaryRise({
      composition: comp,
      temperature: 298.15,
      capillaryRadius: 0.0005,  // 0.5 mm radius = 1 mm diameter
      contactAngle: 0,          // Perfect wetting
    }, registry, rule);

    // h = 2 × 0.072 / (997 × 9.8 × 0.0005) ≈ 0.029 m = 29 mm
    expect(result.riseHeightMm).toBeCloseTo(29, 0);
  });
});
```

---

## 8. Interaction Points

- **[02_Substance_Model.md](02_Substance_Model.md)**: Surface tension data, parachors
- **[04_Volume_System.md](04_Volume_System.md)**: Molar volumes for mixing rules
- **[06_Gravity_Hydrostatics.md](06_Gravity_Hydrostatics.md)**: Density for capillary calculations
- **[17_Container_Model.md](17_Container_Model.md)**: Meniscus visualization
