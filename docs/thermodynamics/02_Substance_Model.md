# Substance Model

## Overview

This document defines the pure substance data model that provides thermodynamic properties for all calculations. Each substance is an immutable data object containing physical properties organized by category.

---

## 1. Conceptual Model

### 1.1 Substance vs Material vs Molecule

| Term | Definition | Example |
|------|------------|---------|
| **Substance** | A thermodynamically pure chemical species with defined properties | Water (H₂O) |
| **Material** | A substance with optical/spectral properties for rendering | Water with absorption spectrum |
| **Molecule** | The chemical entity with structure and bonds | H-O-H molecular geometry |

This system focuses on **Substance** - the thermodynamic abstraction. A Substance may link to a Material for spectral rendering.

### 1.2 Immutability

Substances are immutable data:
- Created once with all properties
- Never modified after creation
- Thread-safe by design
- Easy to test and reason about

### 1.3 Property Categories

Properties are organized into categories corresponding to implementation stages:

| Category | Stage | Examples |
|----------|-------|----------|
| **Identity** | 1 | ID, name, formula, molar mass |
| **Volumetric** | 1 | Molar volume, density |
| **Thermal** | 3 | Heat capacity, thermal conductivity |
| **Transport** | 4 | Viscosity, diffusion coefficient |
| **Surface** | 5 | Surface tension, parachor |
| **Phase** | 6 | Boiling point, Henry's constant |
| **Electrical** | 7 | Dielectric constant, dipole moment |

---

## 2. Core Properties (Stage 1)

### 2.1 Identity Properties

```typescript
interface SubstanceIdentity {
  /** Unique identifier (typically chemical formula) */
  readonly id: SubstanceId;

  /** Human-readable name */
  readonly name: string;

  /** Chemical formula with proper subscripts for display */
  readonly formula: string;

  /** CAS Registry Number (optional) */
  readonly casNumber?: string;
}
```

### 2.2 Molar Mass

**Definition**: Mass of one mole of substance.

**Units**: g/mol

**Source**: Sum of atomic masses from periodic table.

```typescript
interface MolarMassProperty {
  /** Molar mass in g/mol. Exact value from atomic masses. */
  readonly molarMass: number;
}
```

**Reference Values**:
| Substance | Formula | Molar Mass (g/mol) |
|-----------|---------|-------------------|
| Water | H₂O | 18.01528 |
| Ethanol | C₂H₅OH | 46.06844 |
| Nitrogen | N₂ | 28.0134 |
| Carbon dioxide | CO₂ | 44.0095 |
| Sodium chloride | NaCl | 58.4428 |
| Glucose | C₆H₁₂O₆ | 180.156 |

### 2.3 Molar Volume

**Definition**: Volume occupied by one mole of substance.

**For Liquids**:

```typescript
interface LiquidMolarVolume {
  /**
   * Molar volume of liquid at reference conditions.
   * Units: L/mol
   * Reference: 25°C, 1 atm unless otherwise specified
   */
  readonly molarVolumeLiquid: number;

  /**
   * Temperature for reference molar volume.
   * Units: K
   */
  readonly molarVolumeLiquidRefTemp: number;
}
```

**Derivation from Density**:
```
V_m = M / ρ
```
where:
- V_m = molar volume (L/mol)
- M = molar mass (g/mol)
- ρ = density (g/L = kg/m³ × 1000)

**Reference Values** (at 25°C, 1 atm):
| Substance | Molar Volume (mL/mol) | Density (g/mL) |
|-----------|----------------------|----------------|
| Water | 18.069 | 0.9970 |
| Ethanol | 58.392 | 0.7893 |

**For Gases**:

At STP (273.15 K, 101.325 kPa), ideal gas molar volume = 22.414 L/mol

```typescript
interface GasMolarVolume {
  /**
   * Molar volume of gas at STP (ideal gas approximation).
   * Units: L/mol
   * For real gases, use compressibility factor.
   */
  readonly molarVolumeGasSTP: number;
}
```

### 2.4 Density

**Definition**: Mass per unit volume.

**Temperature Dependence**:

Liquid density varies with temperature. Common correlation:

```
ρ(T) = ρ_ref × [1 - α × (T - T_ref)]
```

where α is the thermal expansion coefficient.

```typescript
interface DensityProperty {
  /**
   * Density at reference temperature.
   * Units: kg/m³
   */
  readonly density: number;

  /**
   * Reference temperature for density.
   * Units: K
   */
  readonly densityRefTemp: number;

  /**
   * Thermal expansion coefficient (optional).
   * Units: 1/K
   * ρ(T) = ρ_ref × [1 - α × (T - T_ref)]
   */
  readonly thermalExpansion?: number;
}
```

---

## 3. Thermal Properties (Stage 3)

### 3.1 Heat Capacity

**Definition**: Energy required to raise temperature by 1 K.

**Cp vs Cv**:
- Cp = heat capacity at constant pressure (used for liquids and gases at 1 atm)
- Cv = heat capacity at constant volume (used for sealed systems)

For liquids: Cp ≈ Cv (incompressible)
For gases: Cp = Cv + R

**Temperature Dependence**:

Shomate Equation (NIST standard):
```
Cp(T) = A + B×t + C×t² + D×t³ + E/t²
```
where t = T/1000 (T in Kelvin)

```typescript
interface HeatCapacityProperty {
  /**
   * Molar heat capacity at constant pressure.
   * Units: J/(mol·K)
   * At reference temperature (usually 25°C)
   */
  readonly heatCapacityCp: number;

  /**
   * Shomate equation coefficients (optional, for T-dependence).
   * Cp(T) = A + B×t + C×t² + D×t³ + E/t² where t = T/1000
   */
  readonly shomate?: {
    A: number;
    B: number;
    C: number;
    D: number;
    E: number;
    validRangeK: [number, number];
  };
}
```

**Reference Values** (at 25°C):
| Substance | Cp (J/(mol·K)) | Cp (J/(g·K)) |
|-----------|---------------|--------------|
| Water (l) | 75.385 | 4.184 |
| Ethanol (l) | 112.3 | 2.438 |
| Water (g) | 33.6 | 1.864 |
| N₂ (g) | 29.124 | 1.040 |

### 3.2 Enthalpy of Vaporization

**Definition**: Energy required to convert 1 mole from liquid to gas at boiling point.

```typescript
interface VaporizationProperty {
  /**
   * Enthalpy of vaporization at normal boiling point.
   * Units: kJ/mol
   */
  readonly enthalpyVaporization: number;

  /**
   * Temperature for enthalpy value (usually normal boiling point).
   * Units: K
   */
  readonly enthalpyVaporizationTemp: number;
}
```

**Reference Values**:
| Substance | ΔH_vap (kJ/mol) | At T (K) |
|-----------|-----------------|----------|
| Water | 40.66 | 373.15 |
| Ethanol | 38.56 | 351.5 |

### 3.3 Thermal Conductivity

**Definition**: Rate of heat transfer per unit area per unit temperature gradient.

**Fourier's Law**:
```
q = -k × A × (dT/dx)
```

```typescript
interface ThermalConductivityProperty {
  /**
   * Thermal conductivity of liquid.
   * Units: W/(m·K)
   */
  readonly thermalConductivity: number;

  /**
   * Reference temperature for conductivity.
   * Units: K
   */
  readonly thermalConductivityRefTemp: number;
}
```

**Reference Values** (at 25°C):
| Substance | k (W/(m·K)) |
|-----------|-------------|
| Water | 0.607 |
| Ethanol | 0.171 |
| Air | 0.026 |

---

## 4. Transport Properties (Stage 4)

### 4.1 Dynamic Viscosity

**Definition**: Resistance to shear flow.

**Temperature Dependence** (Andrade equation):
```
ln(η) = A + B/T
```

Or more accurately:
```
η = A × exp(B / T)
```

```typescript
interface ViscosityProperty {
  /**
   * Dynamic viscosity.
   * Units: Pa·s (= kg/(m·s))
   * 1 cP = 0.001 Pa·s
   */
  readonly viscosity: number;

  /**
   * Reference temperature for viscosity.
   * Units: K
   */
  readonly viscosityRefTemp: number;

  /**
   * Andrade equation coefficients (optional).
   * η = A × exp(B / T)
   */
  readonly andrade?: {
    A: number;  // Pre-exponential (Pa·s)
    B: number;  // Activation parameter (K)
  };
}
```

**Reference Values** (at 25°C):
| Substance | η (mPa·s = cP) |
|-----------|----------------|
| Water | 0.890 |
| Ethanol | 1.074 |
| Glycerol | 934 |

### 4.2 Self-Diffusion Coefficient

**Definition**: Rate of molecular self-diffusion.

**Stokes-Einstein Equation**:
```
D = k_B × T / (6 × π × η × r)
```

where:
- k_B = Boltzmann constant
- η = viscosity
- r = molecular radius

```typescript
interface DiffusionProperty {
  /**
   * Self-diffusion coefficient.
   * Units: m²/s
   */
  readonly diffusionCoefficient: number;

  /**
   * Reference temperature for diffusion.
   * Units: K
   */
  readonly diffusionRefTemp: number;

  /**
   * Effective molecular radius for Stokes-Einstein.
   * Units: m
   */
  readonly molecularRadius?: number;
}
```

**Reference Values** (at 25°C):
| Substance | D (×10⁻⁹ m²/s) |
|-----------|----------------|
| Water | 2.30 |
| Ethanol | 1.08 |

---

## 5. Surface Properties (Stage 5)

### 5.1 Surface Tension

**Definition**: Force per unit length at liquid-air interface.

**Temperature Dependence** (Eötvös rule):
```
γ × V_m^(2/3) = k × (T_c - T - 6)
```

```typescript
interface SurfaceTensionProperty {
  /**
   * Surface tension at liquid-air interface.
   * Units: N/m (= J/m²)
   * 1 dyn/cm = 0.001 N/m
   */
  readonly surfaceTension: number;

  /**
   * Reference temperature for surface tension.
   * Units: K
   */
  readonly surfaceTensionRefTemp: number;

  /**
   * Temperature coefficient (optional).
   * Units: N/(m·K)
   * γ(T) ≈ γ_ref - k × (T - T_ref)
   */
  readonly surfaceTensionTempCoeff?: number;
}
```

**Reference Values** (at 25°C):
| Substance | γ (mN/m) |
|-----------|----------|
| Water | 71.97 |
| Ethanol | 21.97 |
| Mercury | 485.5 |

### 5.2 Parachor

**Definition**: Empirical constant for estimating mixture surface tension.

**Macleod-Sugden Correlation**:
```
γ^(1/4) = [P] × (ρ_L - ρ_V) / M
```

where [P] is the parachor.

```typescript
interface ParachorProperty {
  /**
   * Parachor for Macleod-Sugden correlation.
   * Units: (N/m)^(1/4) × (m³/mol) = (mN/m)^(1/4) × (cm³/mol) typically
   */
  readonly parachor: number;
}
```

**Reference Values**:
| Substance | [P] (cm³·(mN/m)^(1/4)/mol) |
|-----------|---------------------------|
| Water | 51.0 |
| Ethanol | 125.3 |

---

## 6. Phase Properties (Stage 6)

### 6.1 Phase Transition Points

```typescript
interface PhaseTransitionProperty {
  /**
   * Normal boiling point (at 101.325 kPa).
   * Units: K
   */
  readonly boilingPoint: number;

  /**
   * Normal freezing/melting point (at 101.325 kPa).
   * Units: K
   */
  readonly freezingPoint: number;

  /**
   * Triple point temperature (optional).
   * Units: K
   */
  readonly triplePointTemp?: number;

  /**
   * Triple point pressure (optional).
   * Units: kPa
   */
  readonly triplePointPressure?: number;
}
```

**Reference Values**:
| Substance | T_boil (K) | T_freeze (K) |
|-----------|------------|--------------|
| Water | 373.15 | 273.15 |
| Ethanol | 351.44 | 159.0 |
| N₂ | 77.36 | 63.15 |

### 6.2 Critical Properties

```typescript
interface CriticalProperty {
  /**
   * Critical temperature.
   * Units: K
   */
  readonly criticalTemperature: number;

  /**
   * Critical pressure.
   * Units: kPa
   */
  readonly criticalPressure: number;

  /**
   * Critical volume.
   * Units: L/mol
   */
  readonly criticalVolume: number;

  /**
   * Acentric factor (Pitzer factor).
   * Dimensionless.
   */
  readonly acentricFactor: number;
}
```

**Reference Values**:
| Substance | T_c (K) | P_c (kPa) | V_c (L/mol) | ω |
|-----------|---------|-----------|-------------|------|
| Water | 647.1 | 22064 | 0.0559 | 0.344 |
| Ethanol | 513.9 | 6148 | 0.167 | 0.644 |
| CO₂ | 304.1 | 7375 | 0.0940 | 0.225 |

### 6.3 Vapor Pressure (Antoine Equation)

```
log₁₀(P) = A - B / (T + C)
```

where P is in mmHg (or specified units) and T is in °C (or K, depending on source).

```typescript
interface AntoineProperty {
  /**
   * Antoine equation coefficients.
   * log₁₀(P) = A - B / (T + C)
   */
  readonly antoine: {
    A: number;
    B: number;
    C: number;
    /** Pressure units for result */
    pressureUnit: 'mmHg' | 'kPa' | 'bar';
    /** Temperature units for input */
    temperatureUnit: 'C' | 'K';
    /** Valid temperature range */
    validRange: [number, number];
  };
}
```

**Reference Values** (P in mmHg, T in °C):
| Substance | A | B | C | Range (°C) |
|-----------|-------|---------|---------|------------|
| Water | 8.07131 | 1730.63 | 233.426 | 1-100 |
| Ethanol | 8.20417 | 1642.89 | 230.300 | -57 to 80 |

### 6.4 Henry's Law Constant

**Definition**: Proportionality between gas partial pressure and dissolved concentration.

```
p_i = H × x_i
```

```typescript
interface HenryProperty {
  /**
   * Henry's law constant for dissolution in water.
   * Units: kPa (for p = H × x formulation)
   * At reference temperature.
   */
  readonly henryConstant?: number;

  /**
   * Reference temperature for Henry's constant.
   * Units: K
   */
  readonly henryRefTemp?: number;

  /**
   * Temperature dependence parameter.
   * ln(H₂/H₁) = -ΔH_sol/R × (1/T₂ - 1/T₁)
   */
  readonly henryTempDependence?: number;
}
```

**Reference Values** (in water at 25°C):
| Gas | H (kPa) | Solubility (mol/L at 1 atm) |
|-----|---------|----------------------------|
| O₂ | 4.259×10⁶ | 1.27×10⁻³ |
| N₂ | 8.65×10⁶ | 0.63×10⁻³ |
| CO₂ | 1.64×10⁵ | 3.36×10⁻² |

### 6.5 Colligative Constants

```typescript
interface ColligativeProperty {
  /**
   * Ebullioscopic constant (boiling point elevation).
   * Units: K·kg/mol
   * ΔT_b = K_b × m (molality)
   */
  readonly ebullioscopicConstant?: number;

  /**
   * Cryoscopic constant (freezing point depression).
   * Units: K·kg/mol
   * ΔT_f = K_f × m (molality)
   */
  readonly cryoscopicConstant?: number;
}
```

**Reference Values** (as solvent):
| Solvent | K_b (K·kg/mol) | K_f (K·kg/mol) |
|---------|----------------|----------------|
| Water | 0.512 | 1.86 |
| Ethanol | 1.22 | — |

---

## 7. Electrical Properties (Stage 7)

### 7.1 Dielectric Constant

**Definition**: Ratio of electric permittivity to vacuum permittivity.

```typescript
interface DielectricProperty {
  /**
   * Relative dielectric constant (permittivity).
   * Dimensionless.
   */
  readonly dielectricConstant: number;

  /**
   * Reference temperature for dielectric constant.
   * Units: K
   */
  readonly dielectricRefTemp: number;

  /**
   * Temperature coefficient (optional).
   * Units: 1/K
   * ε(T) ≈ ε_ref × [1 - α × (T - T_ref)]
   */
  readonly dielectricTempCoeff?: number;
}
```

**Reference Values** (at 25°C):
| Substance | ε_r |
|-----------|-----|
| Water | 78.4 |
| Ethanol | 24.5 |
| Methanol | 32.7 |
| Acetone | 20.7 |

### 7.2 Dipole Moment

**Definition**: Measure of molecular polarity.

```typescript
interface DipoleProperty {
  /**
   * Electric dipole moment.
   * Units: Debye (D)
   * 1 D = 3.336×10⁻³⁰ C·m
   */
  readonly dipoleMoment: number;
}
```

**Reference Values**:
| Substance | μ (D) |
|-----------|-------|
| Water | 1.85 |
| Ethanol | 1.69 |
| CO₂ | 0 |
| NH₃ | 1.47 |

---

## 8. OCP Extension Points

### 8.1 Substance Interface

The complete substance interface combines all property categories:

```typescript
/**
 * Complete substance definition with all thermodynamic properties.
 */
interface Substance extends
  SubstanceIdentity,
  MolarMassProperty,
  LiquidMolarVolume,
  GasMolarVolume,
  DensityProperty,
  HeatCapacityProperty,
  VaporizationProperty,
  ThermalConductivityProperty,
  ViscosityProperty,
  DiffusionProperty,
  SurfaceTensionProperty,
  ParachorProperty,
  PhaseTransitionProperty,
  CriticalProperty,
  AntoineProperty,
  HenryProperty,
  ColligativeProperty,
  DielectricProperty,
  DipoleProperty {

  /**
   * Link to spectral Material for rendering (optional).
   */
  readonly spectralMaterialId?: string;
}
```

### 8.2 Substance Registry

```typescript
/**
 * Registry for substance data.
 * Open for extension: new substances can be registered at runtime.
 */
class SubstanceRegistry {
  private substances: Map<SubstanceId, Substance> = new Map();

  /**
   * Register a new substance.
   */
  register(substance: Substance): void {
    if (this.substances.has(substance.id)) {
      throw new Error(`Substance ${substance.id} already registered`);
    }
    this.substances.set(substance.id, substance);
  }

  /**
   * Get substance by ID.
   */
  get(id: SubstanceId): Substance | undefined {
    return this.substances.get(id);
  }

  /**
   * Get substance or throw if not found.
   */
  getRequired(id: SubstanceId): Substance {
    const s = this.substances.get(id);
    if (!s) {
      throw new Error(`Substance ${id} not found`);
    }
    return s;
  }

  /**
   * List all registered substance IDs.
   */
  list(): SubstanceId[] {
    return Array.from(this.substances.keys());
  }
}
```

### 8.3 Adding New Property Types

To add a new property type:

1. Define the property interface
2. Extend the Substance type
3. Update substance data files
4. Add property calculator if needed

```typescript
// Example: Adding refractive index
interface RefractiveIndexProperty {
  readonly refractiveIndex: number;
  readonly refractiveIndexRefTemp: number;
  readonly refractiveIndexWavelength: number;  // nm
}

// Extend Substance type (use declaration merging or new interface)
```

---

## 9. Reference Substances

### 9.1 Water (H₂O)

```typescript
const WATER: Substance = {
  // Identity
  id: 'H2O',
  name: 'Water',
  formula: 'H₂O',
  casNumber: '7732-18-5',

  // Molar
  molarMass: 18.01528,
  molarVolumeLiquid: 0.018069,  // L/mol at 25°C
  molarVolumeLiquidRefTemp: 298.15,
  molarVolumeGasSTP: 22.414,

  // Density
  density: 997.05,  // kg/m³ at 25°C
  densityRefTemp: 298.15,
  thermalExpansion: 2.57e-4,  // 1/K

  // Thermal
  heatCapacityCp: 75.385,  // J/(mol·K)
  enthalpyVaporization: 40.66,  // kJ/mol
  enthalpyVaporizationTemp: 373.15,
  thermalConductivity: 0.607,  // W/(m·K)
  thermalConductivityRefTemp: 298.15,

  // Transport
  viscosity: 0.00089,  // Pa·s at 25°C
  viscosityRefTemp: 298.15,
  diffusionCoefficient: 2.30e-9,  // m²/s
  diffusionRefTemp: 298.15,

  // Surface
  surfaceTension: 0.07197,  // N/m at 25°C
  surfaceTensionRefTemp: 298.15,
  parachor: 51.0,

  // Phase
  boilingPoint: 373.15,
  freezingPoint: 273.15,
  triplePointTemp: 273.16,
  triplePointPressure: 0.61173,

  // Critical
  criticalTemperature: 647.1,
  criticalPressure: 22064,
  criticalVolume: 0.0559,
  acentricFactor: 0.344,

  // Antoine (P in mmHg, T in °C)
  antoine: {
    A: 8.07131,
    B: 1730.63,
    C: 233.426,
    pressureUnit: 'mmHg',
    temperatureUnit: 'C',
    validRange: [1, 100],
  },

  // Colligative (as solvent)
  ebullioscopicConstant: 0.512,
  cryoscopicConstant: 1.86,

  // Electrical
  dielectricConstant: 78.4,
  dielectricRefTemp: 298.15,
  dipoleMoment: 1.85,
};
```

### 9.2 Ethanol (C₂H₅OH)

```typescript
const ETHANOL: Substance = {
  // Identity
  id: 'C2H5OH',
  name: 'Ethanol',
  formula: 'C₂H₅OH',
  casNumber: '64-17-5',

  // Molar
  molarMass: 46.06844,
  molarVolumeLiquid: 0.058392,  // L/mol at 25°C
  molarVolumeLiquidRefTemp: 298.15,
  molarVolumeGasSTP: 22.414,

  // Density
  density: 789.3,  // kg/m³ at 25°C
  densityRefTemp: 298.15,
  thermalExpansion: 1.09e-3,  // 1/K

  // Thermal
  heatCapacityCp: 112.3,  // J/(mol·K)
  enthalpyVaporization: 38.56,  // kJ/mol
  enthalpyVaporizationTemp: 351.44,
  thermalConductivity: 0.171,  // W/(m·K)
  thermalConductivityRefTemp: 298.15,

  // Transport
  viscosity: 0.001074,  // Pa·s at 25°C
  viscosityRefTemp: 298.15,
  diffusionCoefficient: 1.08e-9,  // m²/s
  diffusionRefTemp: 298.15,

  // Surface
  surfaceTension: 0.02197,  // N/m at 25°C
  surfaceTensionRefTemp: 298.15,
  parachor: 125.3,

  // Phase
  boilingPoint: 351.44,
  freezingPoint: 159.0,

  // Critical
  criticalTemperature: 513.9,
  criticalPressure: 6148,
  criticalVolume: 0.167,
  acentricFactor: 0.644,

  // Antoine (P in mmHg, T in °C)
  antoine: {
    A: 8.20417,
    B: 1642.89,
    C: 230.300,
    pressureUnit: 'mmHg',
    temperatureUnit: 'C',
    validRange: [-57, 80],
  },

  // Colligative (as solvent)
  ebullioscopicConstant: 1.22,

  // Electrical
  dielectricConstant: 24.5,
  dielectricRefTemp: 298.15,
  dipoleMoment: 1.69,
};
```

### 9.3 Other Reference Substances

Additional substances to be defined with full property sets:
- **Nitrogen (N₂)** - Ideal gas reference
- **Carbon dioxide (CO₂)** - Non-ideal gas, high solubility
- **Sodium chloride (NaCl)** - Electrolyte, colligative effects
- **Glucose (C₆H₁₂O₆)** - Non-electrolyte solute

---

## 10. Interaction Points

- **[01_Design_Principles.md](01_Design_Principles.md)**: OCP patterns for registry
- **[03_Composition_System.md](03_Composition_System.md)**: Uses substance IDs
- **[04_Volume_System.md](04_Volume_System.md)**: Uses molar volumes
- **[05_Pressure_System.md](05_Pressure_System.md)**: Uses Antoine coefficients
- **[22_Data_Sources.md](22_Data_Sources.md)**: Citations for all values
