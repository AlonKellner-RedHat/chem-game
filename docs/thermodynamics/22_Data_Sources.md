# Data Sources

## Overview

This document provides complete reference documentation for all physical constants, property data, and model parameters used in the thermodynamics engine. Every value must have a citation.

---

## 1. Physical Constants

### 1.1 Fundamental Constants (CODATA 2018)

| Constant | Symbol | Value | Units | Source |
|----------|--------|-------|-------|--------|
| Gas constant | R | 8.314462618 | J/(mol·K) | CODATA 2018 |
| Avogadro constant | N_A | 6.02214076 × 10²³ | mol⁻¹ | CODATA 2018 |
| Boltzmann constant | k_B | 1.380649 × 10⁻²³ | J/K | CODATA 2018 |
| Elementary charge | e | 1.602176634 × 10⁻¹⁹ | C | CODATA 2018 |
| Vacuum permittivity | ε₀ | 8.8541878128 × 10⁻¹² | F/m | CODATA 2018 |

**Reference**: Tiesinga, E., et al. (2021). "CODATA Recommended Values of the Fundamental Physical Constants: 2018". Rev. Mod. Phys. 93, 025010.

### 1.2 Standard Conditions

| Condition | Value | Notes |
|-----------|-------|-------|
| Standard Temperature | 298.15 K (25°C) | IUPAC definition |
| Standard Pressure | 100 kPa | IUPAC 1982 |
| Standard Atmosphere | 101.325 kPa | Historical |
| Standard Gravity | 9.80665 m/s² | Conventional |

---

## 2. Primary Data Sources

### 2.1 CRC Handbook

**Full Citation**: Rumble, J.R. (Ed.) (2023). *CRC Handbook of Chemistry and Physics*, 104th Edition. CRC Press.

**Used For**:
- Pure component properties (all substances)
- Viscosity data
- Surface tension data
- Dielectric constants
- Heat capacity values

**Reliability**: Very high. Standard reference for physical chemistry.

### 2.2 NIST Chemistry WebBook

**URL**: https://webbook.nist.gov/chemistry/

**Used For**:
- Vapor pressure (Antoine coefficients)
- Heat capacity (Shomate coefficients)
- Enthalpy of vaporization
- Critical properties

**Reliability**: Very high. Curated by NIST.

### 2.3 DECHEMA Chemistry Data Series

**Full Citation**: DECHEMA e.V. (Various years). *Chemistry Data Series*. DECHEMA, Frankfurt.

**Volumes Used**:
- Vol. I: Vapor-Liquid Equilibrium Data Collection
- Vol. III: Heats of Mixing Data Collection
- Vol. V: Liquid-Liquid Equilibrium Data Collection

**Used For**:
- Activity coefficient parameters
- Excess enthalpy data
- Excess volume data

**Reliability**: Very high. Industry standard for VLE data.

### 2.4 Perry's Chemical Engineers' Handbook

**Full Citation**: Green, D.W.; Southard, M.Z. (Eds.) (2019). *Perry's Chemical Engineers' Handbook*, 9th Edition. McGraw-Hill.

**Used For**:
- Transport properties
- Henry's law constants
- Correlation equations

---

## 3. Substance Property Data

### 3.1 Water (H₂O)

| Property | Value | Units | Source |
|----------|-------|-------|--------|
| Molar mass | 18.01528 | g/mol | IUPAC |
| Density (25°C) | 997.05 | kg/m³ | CRC |
| Molar volume (25°C) | 18.069 | mL/mol | Calculated |
| Boiling point | 373.15 | K | CRC |
| Freezing point | 273.15 | K | CRC |
| Critical T | 647.1 | K | CRC |
| Critical P | 22064 | kPa | CRC |
| Heat capacity (25°C) | 75.385 | J/(mol·K) | NIST |
| Enthalpy vaporization | 40.66 | kJ/mol | CRC |
| Viscosity (25°C) | 0.890 | mPa·s | CRC |
| Surface tension (25°C) | 71.97 | mN/m | CRC |
| Thermal conductivity | 0.607 | W/(m·K) | CRC |
| Dielectric constant | 78.4 | — | CRC |
| Dipole moment | 1.85 | D | CRC |
| K_b (ebullioscopic) | 0.512 | K·kg/mol | CRC |
| K_f (cryoscopic) | 1.86 | K·kg/mol | CRC |

**Antoine Coefficients** (P in mmHg, T in °C, 1-100°C):
- A = 8.07131
- B = 1730.63
- C = 233.426

Source: NIST Chemistry WebBook

### 3.2 Ethanol (C₂H₅OH)

| Property | Value | Units | Source |
|----------|-------|-------|--------|
| Molar mass | 46.06844 | g/mol | IUPAC |
| Density (25°C) | 789.3 | kg/m³ | CRC |
| Molar volume (25°C) | 58.39 | mL/mol | Calculated |
| Boiling point | 351.44 | K | CRC |
| Freezing point | 159.0 | K | CRC |
| Critical T | 513.9 | K | CRC |
| Critical P | 6148 | kPa | CRC |
| Heat capacity (25°C) | 112.3 | J/(mol·K) | NIST |
| Enthalpy vaporization | 38.56 | kJ/mol | CRC |
| Viscosity (25°C) | 1.074 | mPa·s | CRC |
| Surface tension (25°C) | 21.97 | mN/m | CRC |
| Thermal conductivity | 0.171 | W/(m·K) | CRC |
| Dielectric constant | 24.5 | — | CRC |
| Dipole moment | 1.69 | D | CRC |
| K_b (ebullioscopic) | 1.22 | K·kg/mol | CRC |

**Antoine Coefficients** (P in mmHg, T in °C, -57 to 80°C):
- A = 8.20417
- B = 1642.89
- C = 230.300

Source: NIST Chemistry WebBook

### 3.3 Other Common Substances

#### Nitrogen (N₂)
| Property | Value | Units | Source |
|----------|-------|-------|--------|
| Molar mass | 28.0134 | g/mol | IUPAC |
| Boiling point | 77.36 | K | CRC |
| Heat capacity (gas, 25°C) | 29.124 | J/(mol·K) | NIST |
| Henry constant (water, 25°C) | 8.65 × 10⁶ | kPa | Sander |

#### Oxygen (O₂)
| Property | Value | Units | Source |
|----------|-------|-------|--------|
| Molar mass | 31.998 | g/mol | IUPAC |
| Boiling point | 90.19 | K | CRC |
| Heat capacity (gas, 25°C) | 29.378 | J/(mol·K) | NIST |
| Henry constant (water, 25°C) | 4.26 × 10⁶ | kPa | Sander |

#### Carbon Dioxide (CO₂)
| Property | Value | Units | Source |
|----------|-------|-------|--------|
| Molar mass | 44.0095 | g/mol | IUPAC |
| Critical T | 304.1 | K | CRC |
| Critical P | 7375 | kPa | CRC |
| Henry constant (water, 25°C) | 1.64 × 10⁵ | kPa | Sander |

#### Sodium Chloride (NaCl)
| Property | Value | Units | Source |
|----------|-------|-------|--------|
| Molar mass | 58.4428 | g/mol | IUPAC |
| Density (25°C) | 2165 | kg/m³ | CRC |
| Melting point | 1074 | K | CRC |
| Van't Hoff factor | 1.87 | — | Experimental |

#### Glucose (C₆H₁₂O₆)
| Property | Value | Units | Source |
|----------|-------|-------|--------|
| Molar mass | 180.156 | g/mol | IUPAC |
| Density (25°C) | 1540 | kg/m³ | CRC |
| Van't Hoff factor | 1.00 | — | Non-electrolyte |

---

## 4. Model Parameters

### 4.1 Water-Ethanol Excess Volume

**Redlich-Kister Coefficients** at 25°C (water = component 1):

| Coefficient | Value | Units |
|-------------|-------|-------|
| A₀ | -4.231 × 10⁻³ | L/mol |
| A₁ | -0.382 × 10⁻³ | L/mol |
| A₂ | +0.529 × 10⁻³ | L/mol |

**Source**: Benson, G.C.; Kiyohara, O. (1979). "Thermodynamics of Aqueous Mixtures of Nonelectrolytes. I. Excess Volumes of Water-n-Alcohol Mixtures at Several Temperatures". J. Solution Chem. 8: 791-802.

**Experimental Data**:

| x_ethanol | V^E (mL/mol) |
|-----------|--------------|
| 0.1 | -0.35 |
| 0.2 | -0.65 |
| 0.3 | -0.88 |
| 0.4 | -1.00 |
| 0.5 | -1.02 |
| 0.6 | -0.94 |
| 0.7 | -0.78 |
| 0.8 | -0.55 |
| 0.9 | -0.28 |

### 4.2 Water-Ethanol Excess Enthalpy

**Redlich-Kister Coefficients** at 25°C:

| Coefficient | Value | Units |
|-------------|-------|-------|
| B₀ | -3200 | J/mol |
| B₁ | +400 | J/mol |
| B₂ | +200 | J/mol |

**Source**: Larkin, J.A. (1975). "Thermodynamic Properties of Aqueous Non-electrolyte Mixtures. I. Excess Enthalpy for Water + Ethanol at 298.15 K". J. Chem. Thermodyn. 7: 137-148.

**Experimental Data**:

| x_ethanol | H^E (J/mol) |
|-----------|-------------|
| 0.1 | -280 |
| 0.2 | -510 |
| 0.3 | -680 |
| 0.4 | -780 |
| 0.5 | -800 |
| 0.6 | -730 |
| 0.7 | -590 |
| 0.8 | -400 |
| 0.9 | -190 |

### 4.3 Activity Coefficient Parameters

**Water-Ethanol Van Laar** at 25°C:

| Parameter | Value |
|-----------|-------|
| A₁₂ | 0.92 |
| A₂₁ | 0.95 |

**Source**: Gmehling, J., et al. (2012). *Chemical Thermodynamics for Process Simulation*. Wiley-VCH.

### 4.4 Viscosity Parameters

**Water-Ethanol Grunberg-Nissan** at 25°C:

| Parameter | Value |
|-----------|-------|
| G | +2.2 |

**Source**: Herráez, J.V.; Belda, R. (2006). "Refractive Indices, Densities and Excess Molar Volumes of Monoalcohols + Water". J. Solution Chem. 35: 1315-1328.

---

## 5. Henry's Law Constants

**Source**: Sander, R. (2015). "Compilation of Henry's law constants (version 4.0) for water as solvent". Atmos. Chem. Phys. 15: 4399-4981.

| Gas | H (kPa) at 25°C | Solubility (mol/L at 1 atm) |
|-----|-----------------|----------------------------|
| O₂ | 4.259 × 10⁶ | 1.27 × 10⁻³ |
| N₂ | 8.65 × 10⁶ | 0.63 × 10⁻³ |
| CO₂ | 1.64 × 10⁵ | 3.36 × 10⁻² |
| H₂ | 7.04 × 10⁶ | 0.78 × 10⁻³ |
| He | 1.29 × 10⁷ | 0.37 × 10⁻³ |
| Ar | 4.0 × 10⁶ | 1.4 × 10⁻³ |
| CH₄ | 4.1 × 10⁶ | 1.3 × 10⁻³ |
| NH₃ | 1.61 × 10³ | 57 |
| SO₂ | 4.0 × 10³ | 1.2 |

---

## 6. Temperature Dependence Parameters

### 6.1 Andrade Viscosity Coefficients

η = A × exp(B/T)

| Substance | A (Pa·s) | B (K) | Valid Range |
|-----------|----------|-------|-------------|
| Water | 2.414 × 10⁻⁵ | 570 | 273-373 K |
| Ethanol | 5.15 × 10⁻⁵ | 525 | 200-350 K |
| Glycerol | 9.54 × 10⁻⁶ | 3500 | 290-370 K |

**Source**: CRC Handbook, Table 6-233

### 6.2 Surface Tension Temperature Coefficients

γ(T) = γ_ref - k × (T - T_ref)

| Substance | γ_ref (mN/m) | k (mN/(m·K)) | T_ref (K) |
|-----------|--------------|--------------|-----------|
| Water | 71.97 | 0.15 | 298.15 |
| Ethanol | 21.97 | 0.08 | 298.15 |

**Source**: CRC Handbook

### 6.3 Dielectric Constant Temperature Coefficients

ε(T) = ε_ref × [1 - α × (T - T_ref)]

| Substance | ε_ref | α (1/K) | T_ref (K) |
|-----------|-------|---------|-----------|
| Water | 78.4 | 0.0045 | 298.15 |
| Ethanol | 24.5 | 0.0040 | 298.15 |

**Source**: CRC Handbook

---

## 7. Bibliography

### Primary References

1. **Benson, G.C.; Kiyohara, O.** (1979). "Thermodynamics of Aqueous Mixtures of Nonelectrolytes. I. Excess Volumes of Water-n-Alcohol Mixtures at Several Temperatures". *J. Solution Chem.* 8: 791-802.

2. **Gmehling, J.; Kolbe, B.; Kleiber, M.; Rarey, J.** (2012). *Chemical Thermodynamics for Process Simulation*. Wiley-VCH, Weinheim.

3. **Green, D.W.; Southard, M.Z.** (Eds.) (2019). *Perry's Chemical Engineers' Handbook*, 9th Edition. McGraw-Hill.

4. **Larkin, J.A.** (1975). "Thermodynamic Properties of Aqueous Non-electrolyte Mixtures. I. Excess Enthalpy for Water + Ethanol at 298.15 K". *J. Chem. Thermodyn.* 7: 137-148.

5. **Rumble, J.R.** (Ed.) (2023). *CRC Handbook of Chemistry and Physics*, 104th Edition. CRC Press.

6. **Sander, R.** (2015). "Compilation of Henry's law constants (version 4.0) for water as solvent". *Atmos. Chem. Phys.* 15: 4399-4981.

### Model Derivations

7. **Andrade, E.N.C.** (1930). "The Viscosity of Liquids". *Nature* 125: 309-310.

8. **Antoine, C.** (1888). "Tensions des vapeurs; nouvelle relation entre les tensions et les températures". *Comptes Rendus* 107: 681-684, 778-780, 836-837.

9. **Grunberg, L.; Nissan, A.H.** (1949). "Mixture Law for Viscosity". *Nature* 164: 799-800.

10. **Macleod, D.B.** (1923). "On a Relation between Surface Tension and Density". *Trans. Faraday Soc.* 19: 38-41.

11. **Redlich, O.; Kister, A.T.** (1948). "Algebraic Representation of Thermodynamic Properties and the Classification of Solutions". *Ind. Eng. Chem.* 40(2): 345-348.

12. **van Laar, J.J.** (1910). "Über Dampfspannungen von binären Gemischen". *Z. Phys. Chem.* 72: 723-751.

### Historical/Foundational

13. **Clausius, R.** (1850). "Über die bewegende Kraft der Wärme". *Annalen der Physik* 155: 368-397.

14. **Fick, A.** (1855). "Über Diffusion". *Annalen der Physik* 170: 59-86.

15. **Fourier, J.** (1822). *Théorie analytique de la chaleur*. Paris: Firmin Didot.

16. **Henry, W.** (1803). "Experiments on the Quantity of Gases Absorbed by Water". *Phil. Trans. R. Soc. Lond.* 93: 29-274.

17. **van't Hoff, J.H.** (1887). "Die Rolle des osmotischen Druckes in der Analogie zwischen Lösungen und Gasen". *Z. Phys. Chem.* 1: 481-508.

---

## 8. Data Quality Notes

### 8.1 Uncertainty Estimates

| Data Type | Typical Uncertainty |
|-----------|---------------------|
| Molar mass | ±0.001 g/mol |
| Density | ±0.1% |
| Boiling/Freezing point | ±0.1 K |
| Heat capacity | ±1% |
| Vapor pressure | ±2% |
| Viscosity | ±2% |
| Surface tension | ±1% |
| Excess properties | ±5% |

### 8.2 Temperature Range Validity

Most data is valid for 273-373 K (0-100°C). Extrapolation outside this range may introduce significant errors.

### 8.3 Concentration Limitations

Excess property correlations are fitted for binary mixtures. Multi-component predictions use pairwise approximations with additional uncertainty.

---

## 9. Interaction Points

- **[02_Substance_Model.md](02_Substance_Model.md)**: Uses this data
- **[21_Test_Plan.md](21_Test_Plan.md)**: Test validation sources
- All property documents reference this for data values
