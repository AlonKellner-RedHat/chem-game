# Test Plan

## Overview

This document defines the comprehensive TDD (Test-Driven Development) strategy for the thermodynamics engine. All property calculations must be validated against published literature values.

---

## 1. TDD Methodology

### 1.1 Test-First Approach

For each property calculator:
1. **Write tests first** with expected values from literature
2. **Implement minimal code** to pass tests
3. **Refactor** for clarity and OCP compliance
4. **Document** accuracy achieved

### 1.2 Test Categories

| Category | Purpose | Frequency |
|----------|---------|-----------|
| **Unit** | Test individual functions | Every function |
| **Integration** | Test property pipelines | Every system |
| **Validation** | Compare to literature | Key data points |
| **Regression** | Prevent breaking changes | All tests |

### 1.3 Accuracy Requirements

| Property | Tolerance | Rationale |
|----------|-----------|-----------|
| Molar mass | Exact | Defined value |
| Volume | ±1% | Non-ideal mixing limits |
| Pressure (ideal gas) | ±0.1% | Exact formula |
| Vapor pressure | ±2% | Antoine correlation |
| Heat capacity | ±2% | Polynomial fits |
| Viscosity | ±5% | Mixture rules |
| Surface tension | ±3% | Correlation accuracy |
| Diffusion | ±10% | High data scatter |
| Activity coefficients | ±5% | Model dependent |

---

## 2. Test Structure

### 2.1 File Organization

```
src/tests/thermodynamics/
├── stage1/
│   ├── Substance.test.ts
│   ├── Composition.test.ts
│   └── Volume.test.ts
├── stage2/
│   ├── IdealGas.test.ts
│   ├── VaporPressure.test.ts
│   ├── Activity.test.ts
│   └── Hydrostatic.test.ts
├── stage3/
│   ├── HeatCapacity.test.ts
│   ├── HeatOfMixing.test.ts
│   └── ThermalConductivity.test.ts
├── stage4/
│   ├── Viscosity.test.ts
│   └── Diffusion.test.ts
├── stage5/
│   └── SurfaceTension.test.ts
├── stage6/
│   ├── Colligative.test.ts
│   └── HenryLaw.test.ts
├── stage7/
│   ├── OsmoticPressure.test.ts
│   └── Dielectric.test.ts
└── integration/
    ├── ContainerState.test.ts
    └── WaterEthanol.test.ts
```

### 2.2 Test File Template

```typescript
import { describe, it, expect } from 'vitest';  // or jest
import { /* functions to test */ } from '../path/to/module';
import { registry } from '../fixtures/registry';

describe('ModuleName', () => {
  describe('functionName', () => {
    // Basic functionality
    it('should handle typical input correctly', () => {
      // Arrange
      const input = { /* ... */ };

      // Act
      const result = functionName(input);

      // Assert
      expect(result).toBeCloseTo(expectedValue, precision);
    });

    // Edge cases
    it('should handle empty composition', () => {
      // ...
    });

    // Validation against literature
    it('should match literature value at standard conditions', () => {
      // Source: [citation]
      // ...
    });
  });
});
```

---

## 3. Stage 1 Tests: Foundations

### 3.1 Substance Tests

```typescript
describe('Substance', () => {
  describe('water', () => {
    it('should have molar mass 18.015 g/mol', () => {
      expect(WATER.molarMass).toBeCloseTo(18.015, 3);
    });

    it('should have density 997 kg/m³ at 25°C', () => {
      expect(WATER.density).toBeCloseTo(997, 0);
    });

    it('should have boiling point 373.15 K', () => {
      expect(WATER.boilingPoint).toBeCloseTo(373.15, 2);
    });
  });

  describe('ethanol', () => {
    it('should have molar mass 46.068 g/mol', () => {
      expect(ETHANOL.molarMass).toBeCloseTo(46.068, 3);
    });
  });
});
```

### 3.2 Composition Tests

```typescript
describe('Composition', () => {
  describe('getMoleFractions', () => {
    it('should sum to 1.0', () => {
      const comp = createComposition({ H2O: 1.0, C2H5OH: 0.5 });
      const fractions = getMoleFractions(comp);

      let sum = 0;
      for (const x of fractions.values()) {
        sum += x;
      }

      expect(sum).toBeCloseTo(1.0, 10);
    });
  });

  describe('combineCompositions', () => {
    it('should conserve total moles', () => {
      const a = createComposition({ H2O: 1.0 });
      const b = createComposition({ H2O: 0.5, C2H5OH: 0.5 });

      const combined = combineCompositions(a, b);

      expect(getTotalMoles(combined)).toBeCloseTo(2.0, 10);
    });
  });
});
```

### 3.3 Volume Tests

```typescript
describe('Volume', () => {
  // Source: Benson & Kiyohara (1979)
  const WATER_ETHANOL_VE = [
    { xEtOH: 0.0, VE_mL: 0 },
    { xEtOH: 0.1, VE_mL: -0.35 },
    { xEtOH: 0.2, VE_mL: -0.65 },
    { xEtOH: 0.3, VE_mL: -0.88 },
    { xEtOH: 0.4, VE_mL: -1.00 },
    { xEtOH: 0.5, VE_mL: -1.02 },
    { xEtOH: 0.6, VE_mL: -0.94 },
    { xEtOH: 0.7, VE_mL: -0.78 },
    { xEtOH: 0.8, VE_mL: -0.55 },
    { xEtOH: 0.9, VE_mL: -0.28 },
    { xEtOH: 1.0, VE_mL: 0 },
  ];

  it.each(WATER_ETHANOL_VE)(
    'should give V^E ≈ $VE_mL mL/mol at x_ethanol = $xEtOH',
    ({ xEtOH, VE_mL }) => {
      const result = WATER_ETHANOL_MODEL.calculate(1 - xEtOH, xEtOH, 298.15);
      expect(result * 1000).toBeCloseTo(VE_mL, 0);  // ±0.5 mL/mol
    }
  );
});
```

---

## 4. Stage 2 Tests: Pressure

### 4.1 Ideal Gas Tests

```typescript
describe('IdealGas', () => {
  it('should give P = 101.325 kPa at STP', () => {
    const P = calculateIdealGasPressure({
      moles: 1.0,
      temperature: 273.15,
      volume: 22.414,
    });

    expect(P).toBeCloseTo(101.325, 2);
  });

  it('should satisfy PV = nRT', () => {
    const n = 2.5;
    const T = 350;
    const V = 50;

    const P = calculateIdealGasPressure({ moles: n, temperature: T, volume: V });

    expect(P * V).toBeCloseTo(n * 8.314 * T, 1);
  });
});
```

### 4.2 Vapor Pressure Tests

```typescript
describe('VaporPressure', () => {
  // Source: NIST Chemistry WebBook
  const WATER_VP = [
    { T_C: 0, P_kPa: 0.6113 },
    { T_C: 25, P_kPa: 3.169 },
    { T_C: 50, P_kPa: 12.34 },
    { T_C: 75, P_kPa: 38.56 },
    { T_C: 100, P_kPa: 101.325 },
  ];

  it.each(WATER_VP)(
    'should give P ≈ $P_kPa kPa for water at $T_C°C',
    ({ T_C, P_kPa }) => {
      const P = calculateAntoineVaporPressure(T_C + 273.15, WATER.antoine);
      expect(P).toBeCloseTo(P_kPa, 1);
    }
  );
});
```

### 4.3 Activity Coefficient Tests

```typescript
describe('Activity', () => {
  // Source: Gmehling et al. (2012) VLE data
  const WATER_ETHANOL_GAMMA = [
    { xEtOH: 0.1, gamma_H2O: 1.01, gamma_EtOH: 2.35 },
    { xEtOH: 0.3, gamma_H2O: 1.11, gamma_EtOH: 1.60 },
    { xEtOH: 0.5, gamma_H2O: 1.30, gamma_EtOH: 1.23 },
    { xEtOH: 0.7, gamma_H2O: 1.65, gamma_EtOH: 1.06 },
    { xEtOH: 0.9, gamma_H2O: 2.30, gamma_EtOH: 1.00 },
  ];

  it.each(WATER_ETHANOL_GAMMA)(
    'should give γ_water ≈ $gamma_H2O at x_ethanol = $xEtOH',
    ({ xEtOH, gamma_H2O }) => {
      const comp = createComposition({ H2O: 1 - xEtOH, C2H5OH: xEtOH });
      const gammas = margules.calculate(comp, 298.15);

      expect(gammas.get('H2O')).toBeCloseTo(gamma_H2O, 1);
    }
  );
});
```

---

## 5. Stage 3 Tests: Thermal

### 5.1 Heat Capacity Tests

```typescript
describe('HeatCapacity', () => {
  // Source: NIST Chemistry WebBook
  const PURE_CP = [
    { substance: 'H2O', Cp: 75.385 },
    { substance: 'C2H5OH', Cp: 112.3 },
    { substance: 'glycerol', Cp: 218.9 },
  ];

  it.each(PURE_CP)(
    'should give Cp ≈ $Cp J/(mol·K) for $substance',
    ({ substance, Cp }) => {
      const comp = pureComposition(substance, 1.0);
      const result = calculateHeatCapacity({ composition: comp, temperature: 298.15 }, registry);

      expect(result.molarCp).toBeCloseTo(Cp, 0);
    }
  );
});
```

### 5.2 Heat of Mixing Tests

```typescript
describe('HeatOfMixing', () => {
  // Source: Larkin (1975)
  const WATER_ETHANOL_HE = [
    { xEtOH: 0.2, HE_J: -510 },
    { xEtOH: 0.4, HE_J: -780 },
    { xEtOH: 0.5, HE_J: -800 },
    { xEtOH: 0.6, HE_J: -730 },
    { xEtOH: 0.8, HE_J: -400 },
  ];

  it.each(WATER_ETHANOL_HE)(
    'should give H^E ≈ $HE_J J/mol at x_ethanol = $xEtOH',
    ({ xEtOH, HE_J }) => {
      const result = WATER_ETHANOL_ENTHALPY.calculate(1 - xEtOH, xEtOH, 298.15);
      expect(result).toBeCloseTo(HE_J, -1);  // ±50 J/mol
    }
  );
});
```

---

## 6. Stage 4 Tests: Transport

### 6.1 Viscosity Tests

```typescript
describe('Viscosity', () => {
  // Source: CRC Handbook
  const PURE_VISCOSITY = [
    { substance: 'H2O', eta_cP: 0.890 },
    { substance: 'C2H5OH', eta_cP: 1.074 },
    { substance: 'glycerol', eta_cP: 934 },
  ];

  it.each(PURE_VISCOSITY)(
    'should give η ≈ $eta_cP cP for $substance at 25°C',
    ({ substance, eta_cP }) => {
      const comp = pureComposition(substance, 1.0);
      const eta = calculateMixtureViscosity(comp, 298.15, registry, arrhenius);

      expect(eta * 1000).toBeCloseTo(eta_cP, 0);  // Pa·s to cP
    }
  );

  // Water-ethanol maximum
  it('should show viscosity maximum around x_ethanol = 0.4', () => {
    const mixtures = [0.2, 0.3, 0.4, 0.5, 0.6].map(x => ({
      x,
      eta: calculateMixtureViscosity(
        createComposition({ H2O: 1 - x, C2H5OH: x }),
        298.15, registry, grunberg
      ),
    }));

    const maxIdx = mixtures.reduce((iMax, item, i, arr) =>
      item.eta > arr[iMax].eta ? i : iMax, 0);

    expect(mixtures[maxIdx].x).toBeCloseTo(0.4, 1);
  });
});
```

---

## 7. Stage 5 Tests: Surface

### 7.1 Surface Tension Tests

```typescript
describe('SurfaceTension', () => {
  // Source: CRC Handbook
  const PURE_GAMMA = [
    { substance: 'H2O', gamma_mNm: 71.97 },
    { substance: 'C2H5OH', gamma_mNm: 21.97 },
    { substance: 'methanol', gamma_mNm: 22.1 },
  ];

  it.each(PURE_GAMMA)(
    'should give γ ≈ $gamma_mNm mN/m for $substance',
    ({ substance, gamma_mNm }) => {
      const comp = pureComposition(substance, 1.0);
      const gamma = calculateMixtureSurfaceTension(comp, 298.15, registry, rule);

      expect(gamma * 1000).toBeCloseTo(gamma_mNm, 0);
    }
  );

  // Rapid drop with ethanol
  it('should show rapid decrease with small ethanol additions', () => {
    const pure = pureComposition('H2O', 1.0);
    const with5 = createComposition({ H2O: 0.95, C2H5OH: 0.05 });

    const gammaPure = calculateMixtureSurfaceTension(pure, 298.15, registry, rule);
    const gammaWith5 = calculateMixtureSurfaceTension(with5, 298.15, registry, rule);

    // Should drop by at least 20%
    expect((gammaPure - gammaWith5) / gammaPure).toBeGreaterThan(0.2);
  });
});
```

---

## 8. Stage 6-7 Tests: Phase & Advanced

### 8.1 Colligative Tests

```typescript
describe('Colligative', () => {
  it('should give ΔT_f = 1.86 K for 1 molal glucose in water', () => {
    // 1 mol glucose in 1 kg water (55.5 mol)
    const comp = createComposition({ H2O: 55.5, glucose: 1.0 });
    const result = calculateColligativeProperties(comp, 'H2O', registry);

    expect(result.freezingPointDepression).toBeCloseTo(1.86, 1);
  });

  it('should give doubled effect for NaCl', () => {
    const comp = createComposition({ H2O: 55.5, NaCl: 1.0 });
    const result = calculateColligativeProperties(comp, 'H2O', registry);

    // i ≈ 1.87 for NaCl
    expect(result.freezingPointDepression).toBeCloseTo(3.5, 0);
  });
});
```

### 8.2 Henry's Law Tests

```typescript
describe('HenryLaw', () => {
  // Source: Sander (2015) compilation
  it('should give [O2] ≈ 1.3 mmol/L at 1 atm, 25°C', () => {
    const solvent = pureComposition('H2O', 55.5);
    const result = calculateGasSolubility({
      gasId: 'O2',
      partialPressure: 101.325,
      solvent,
      temperature: 298.15,
    }, registry);

    expect(result.molarity * 1000).toBeCloseTo(1.3, 0);  // mmol/L
  });
});
```

---

## 9. Integration Tests

### 9.1 Container State Tests

```typescript
describe('ContainerState', () => {
  it('should calculate consistent state for water', () => {
    const container = new Container(
      BEAKER_100ML,
      pureComposition('H2O', 5.55),  // ~100 mL
      298.15,
      registry,
      models
    );

    const state = container.state;

    // Volume checks
    expect(state.volume.totalVolume).toBeCloseTo(0.1, 2);  // 100 mL
    expect(state.fillFraction).toBeCloseTo(1.0, 1);

    // Density check
    expect(state.density).toBeCloseTo(997, 0);

    // Pressure check
    expect(state.surfacePressure).toBeCloseTo(101.3, 0);

    // Property checks
    expect(state.viscosity * 1000).toBeCloseTo(0.89, 1);  // cP
    expect(state.surfaceTension * 1000).toBeCloseTo(72, 0);  // mN/m
  });
});
```

### 9.2 Water-Ethanol System Tests

```typescript
describe('WaterEthanolSystem', () => {
  it('should pass all validation points at 50% composition', () => {
    const comp = createComposition({ H2O: 1.0, C2H5OH: 1.0 });
    const T = 298.15;

    // Volume contraction
    const volume = calculateVolume({ composition: comp, temperature: T }, registry, excessRegistry);
    expect(volume.excessVolume).toBeLessThan(0);  // Contraction

    // Viscosity maximum region
    const eta = calculateMixtureViscosity(comp, T, registry, grunberg);
    expect(eta * 1000).toBeGreaterThan(1.5);  // > both pure

    // Surface tension between pure values
    const gamma = calculateMixtureSurfaceTension(comp, T, registry, surfaceRule);
    expect(gamma * 1000).toBeLessThan(72);
    expect(gamma * 1000).toBeGreaterThan(22);
  });
});
```

---

## 10. Test Data Sources

All test data comes from peer-reviewed sources:

| Property | Primary Source | Secondary |
|----------|----------------|-----------|
| Pure properties | CRC Handbook | NIST WebBook |
| Vapor pressure | NIST | Perry's |
| Excess volume | Benson & Kiyohara (1979) | DECHEMA |
| Excess enthalpy | Larkin (1975) | DECHEMA |
| Activity coefficients | Gmehling et al. (2012) | DECHEMA |
| Viscosity | CRC Handbook | Viswanath (2007) |
| Surface tension | CRC Handbook | Jasper (1972) |
| Henry's constants | Sander (2015) | NIST |

See **[22_Data_Sources.md](22_Data_Sources.md)** for full citations.

---

## 11. Interaction Points

- **[01_Design_Principles.md](01_Design_Principles.md)**: TDD methodology
- **[20_Implementation_Architecture.md](20_Implementation_Architecture.md)**: Code structure
- **[22_Data_Sources.md](22_Data_Sources.md)**: Reference data
