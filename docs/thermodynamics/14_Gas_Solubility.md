# Gas Solubility

## Overview

This document defines the gas solubility system using Henry's Law. This determines how much gas dissolves in a liquid at a given partial pressure and temperature. This is an equilibrium property—it describes the saturation concentration, not the rate of dissolution.

---

## 1. First Principles

### 1.1 Gas-Liquid Equilibrium

At equilibrium:
- Rate of gas molecules entering liquid = rate leaving
- Dissolved gas concentration reaches a steady value
- This equilibrium depends on partial pressure and temperature

### 1.2 Why Gases Dissolve

Gas molecules dissolve when:
1. They collide with the liquid surface
2. They have favorable interactions with solvent molecules
3. They lose kinetic energy and become "trapped"

**Factors affecting solubility**:
- Higher pressure → more gas molecules hitting surface → higher solubility
- Higher temperature → more kinetic energy → lower solubility (usually)
- Molecular interactions (polarity, hydrogen bonding)

---

## 2. Henry's Law (Stage 6)

### 2.1 Statement

**Henry's Law**: At constant temperature, the amount of gas dissolved in a liquid is directly proportional to the partial pressure of that gas above the liquid.

```
p_i = H_i × x_i
```

or equivalently:
```
c_i = k_H × p_i
```

where:
- p_i = partial pressure of gas i (kPa or atm)
- H_i = Henry's law constant (kPa)
- x_i = mole fraction of dissolved gas
- c_i = concentration of dissolved gas (mol/L)
- k_H = Henry's law solubility constant (mol/(L·kPa))

**Reference**: Henry, W. (1803). Phil. Trans. R. Soc. Lond. 93: 29-274.

### 2.2 Different Forms

Henry's law has multiple equivalent forms:

| Form | Equation | Units of H |
|------|----------|------------|
| Mole fraction | p = H × x | kPa or atm |
| Molarity | c = k_H × p | mol/(L·atm) |
| Volatility | x = p / H | - |

### 2.3 Temperature Dependence

Solubility generally **decreases** with temperature:

```
ln(H₂/H₁) = -ΔH_sol/R × (1/T₂ - 1/T₁)
```

where ΔH_sol is the enthalpy of solution (usually negative for gases).

**Van't Hoff equation form**:
```
d(ln H) / d(1/T) = ΔH_sol / R
```

### 2.4 Reference Values (in water at 25°C)

| Gas | H (kPa) | k_H (mol/(L·atm)) | Solubility* |
|-----|---------|-------------------|-------------|
| O₂ | 4.26 × 10⁶ | 1.26 × 10⁻³ | Low |
| N₂ | 8.65 × 10⁶ | 6.2 × 10⁻⁴ | Very low |
| CO₂ | 1.64 × 10⁵ | 3.36 × 10⁻² | Moderate |
| H₂ | 7.04 × 10⁶ | 7.8 × 10⁻⁴ | Very low |
| He | 1.29 × 10⁷ | 3.7 × 10⁻⁴ | Very low |
| NH₃ | 1.61 × 10³ | 57 | Very high |
| SO₂ | 4.0 × 10³ | 1.2 | High |

*At 1 atm partial pressure

---

## 3. Data Structure

```typescript
interface HenryLawData {
  /** Henry's law constant (p = H × x form) in kPa */
  readonly henryConstant: number;

  /** Reference temperature in K */
  readonly henryRefTemp: number;

  /** Temperature dependence: -ΔH_sol/R in K */
  readonly henryTempCoeff?: number;
}
```

---

## 4. Saturation Calculation

### 4.1 Dissolved Moles at Saturation

```typescript
interface GasSolubilityInput {
  /** Gas substance ID */
  readonly gasId: SubstanceId;
  /** Partial pressure of gas in kPa */
  readonly partialPressure: number;
  /** Solvent composition */
  readonly solvent: Composition;
  /** Temperature in K */
  readonly temperature: number;
}

interface GasSolubilityResult {
  /** Mole fraction of dissolved gas at saturation */
  readonly moleFraction: number;
  /** Moles of gas dissolved per mole of solvent */
  readonly molesPerMoleSolvent: number;
  /** Molarity of dissolved gas (mol/L) */
  readonly molarity: number;
  /** Mass concentration (g/L) */
  readonly massConcentration: number;
  /** Henry's constant at temperature */
  readonly henryConstant: number;
}

/**
 * Calculate gas solubility at given partial pressure.
 * x = p / H
 */
function calculateGasSolubility(
  input: GasSolubilityInput,
  registry: SubstanceRegistry
): GasSolubilityResult {
  const { gasId, partialPressure, solvent, temperature } = input;

  const gas = registry.getRequired(gasId);

  // Get Henry's constant at temperature
  let H = gas.henryConstant ?? Infinity;

  if (gas.henryRefTemp && gas.henryTempCoeff && temperature !== gas.henryRefTemp) {
    // Temperature correction
    const invT = 1 / temperature - 1 / gas.henryRefTemp;
    H = H * Math.exp(gas.henryTempCoeff * invT);
  }

  // Mole fraction: x = p / H
  const moleFraction = H > 0 ? partialPressure / H : 0;

  // Calculate solvent volume for molarity
  const solventMoles = getTotalMoles(solvent);
  const solventVolume = calculateVolume(
    { composition: solvent, temperature },
    registry,
    excessRegistry
  ).totalVolume;  // L

  // Moles dissolved per mole of solvent
  const molesPerMoleSolvent = moleFraction / (1 - moleFraction);

  // Molarity
  const molesGas = solventMoles * molesPerMoleSolvent;
  const molarity = molesGas / solventVolume;

  // Mass concentration
  const massConcentration = molarity * gas.molarMass;

  return {
    moleFraction,
    molesPerMoleSolvent,
    molarity,
    massConcentration,
    henryConstant: H,
  };
}
```

---

## 5. Degassing (Supersaturation)

### 5.1 Pressure Reduction

When pressure above a solution decreases:
- Equilibrium concentration decreases
- Solution becomes supersaturated
- Gas tends to escape (bubbling)

### 5.2 Supersaturation Indicator

```typescript
interface SupersaturationInput {
  /** Current dissolved gas moles */
  readonly dissolvedMoles: number;
  /** Saturation moles at current conditions */
  readonly saturationMoles: number;
}

interface SupersaturationResult {
  /** Supersaturation ratio (>1 means supersaturated) */
  readonly ratio: number;
  /** Whether solution is supersaturated */
  readonly isSuperSaturated: boolean;
  /** Excess moles that would escape at equilibrium */
  readonly excessMoles: number;
}

/**
 * Calculate supersaturation state.
 */
function calculateSupersaturation(
  input: SupersaturationInput
): SupersaturationResult {
  const { dissolvedMoles, saturationMoles } = input;

  const ratio = saturationMoles > 0 ? dissolvedMoles / saturationMoles : 0;
  const isSuperSaturated = ratio > 1.0;
  const excessMoles = isSuperSaturated ? dissolvedMoles - saturationMoles : 0;

  return {
    ratio,
    isSuperSaturated,
    excessMoles,
  };
}
```

### 5.3 Applications

**Opening a soda bottle**:
- CO₂ at high pressure (~3 atm) when sealed
- Opening reduces pressure to 1 atm
- Saturation concentration drops by 3×
- Excess CO₂ escapes as bubbles

**Decompression sickness (bends)**:
- N₂ dissolved in blood at high pressure (diving)
- Rapid ascent → N₂ bubbles form in blood
- Slow ascent allows gradual degassing

---

## 6. Multi-Gas Systems

### 6.1 Independent Solubility

For gas mixtures, each gas dissolves independently:
```
x_i = p_i / H_i
```

Total dissolved gas:
```
x_total = Σ x_i
```

### 6.2 Air Dissolved in Water

At 1 atm, 25°C:
- N₂ (p = 0.78 atm): x ≈ 9 × 10⁻⁶
- O₂ (p = 0.21 atm): x ≈ 5 × 10⁻⁶
- Ar (p = 0.01 atm): x ≈ 0.3 × 10⁻⁶

Total: ~14 × 10⁻⁶ or 14 ppm (parts per million)

---

## 7. Solvent Effects

### 7.1 Salting Out

Adding electrolytes decreases gas solubility:
```
log(S₀/S) = k_s × I
```

where:
- S₀ = solubility in pure water
- S = solubility in salt solution
- k_s = Setschenow constant
- I = ionic strength

### 7.2 Organic Solvents

Different solvents have different Henry's constants:
- Non-polar gases (N₂, O₂) more soluble in organic solvents
- Polar gases (NH₃, HCl) more soluble in water

---

## 8. TDD Validation Data

### 8.1 Oxygen Solubility Tests

```typescript
describe('GasSolubility - O2 in water', () => {
  it('should give correct O2 solubility at 1 atm, 25°C', () => {
    const solvent = pureComposition('H2O', 55.5);  // 1 kg water
    const result = calculateGasSolubility({
      gasId: 'O2',
      partialPressure: 101.325,  // 1 atm in kPa
      solvent,
      temperature: 298.15,
    }, registry);

    // Expected: ~1.26 mmol/L = 1.26e-3 mol/L
    expect(result.molarity).toBeCloseTo(1.26e-3, 4);
  });

  it('should give higher solubility at lower temperature', () => {
    const solvent = pureComposition('H2O', 55.5);

    const result25 = calculateGasSolubility({
      gasId: 'O2',
      partialPressure: 101.325,
      solvent,
      temperature: 298.15,
    }, registry);

    const result5 = calculateGasSolubility({
      gasId: 'O2',
      partialPressure: 101.325,
      solvent,
      temperature: 278.15,  // 5°C
    }, registry);

    expect(result5.molarity).toBeGreaterThan(result25.molarity);
  });
});
```

### 8.2 CO2 Solubility Tests

```typescript
describe('GasSolubility - CO2', () => {
  it('should give correct CO2 solubility at 1 atm, 25°C', () => {
    const solvent = pureComposition('H2O', 55.5);
    const result = calculateGasSolubility({
      gasId: 'CO2',
      partialPressure: 101.325,
      solvent,
      temperature: 298.15,
    }, registry);

    // Expected: ~33.6 mmol/L (much higher than O2)
    expect(result.molarity).toBeCloseTo(33.6e-3, 3);
  });

  it('should show CO2 >> O2 solubility', () => {
    const solvent = pureComposition('H2O', 55.5);

    const co2 = calculateGasSolubility({
      gasId: 'CO2',
      partialPressure: 101.325,
      solvent,
      temperature: 298.15,
    }, registry);

    const o2 = calculateGasSolubility({
      gasId: 'O2',
      partialPressure: 101.325,
      solvent,
      temperature: 298.15,
    }, registry);

    // CO2 is ~25× more soluble than O2
    expect(co2.molarity / o2.molarity).toBeCloseTo(25, -0.5);
  });
});
```

### 8.3 Supersaturation Tests

```typescript
describe('Supersaturation', () => {
  it('should detect supersaturation when pressure drops', () => {
    // Initial: CO2 at 3 atm (like sealed soda)
    // Final: CO2 at 1 atm (opened soda)

    const dissolved = 3.0;  // moles at 3 atm
    const saturation = 1.0;  // moles at 1 atm

    const result = calculateSupersaturation({
      dissolvedMoles: dissolved,
      saturationMoles: saturation,
    });

    expect(result.isSuperSaturated).toBe(true);
    expect(result.ratio).toBeCloseTo(3.0, 1);
    expect(result.excessMoles).toBeCloseTo(2.0, 1);
  });
});
```

---

## 9. Interaction Points

- **[02_Substance_Model.md](02_Substance_Model.md)**: Henry's constants
- **[05_Pressure_System.md](05_Pressure_System.md)**: Partial pressures
- **[17_Container_Model.md](17_Container_Model.md)**: Dissolved gas tracking
- **[22_Data_Sources.md](22_Data_Sources.md)**: Henry's law data
