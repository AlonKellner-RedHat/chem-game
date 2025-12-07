/**
 * SolutionProperties defines the mutable properties of a solution
 * These can be adjusted via UI controls
 */
export interface SolutionProperties {
  // Per-molecule concentrations (Molarity)
  moleculeConcentrations: Map<string, number>; // moleculeId -> [mol/L]

  // Environmental
  temperature: number; // Kelvin
  pressure: number; // atm
  depth: number; // m (path length in meters)

  // Particulates
  bubbleDensity: number; // 0-1
  particleDensity: number; // 0-1
  particleSize: number; // nm

  // Phase
  phase: 'liquid' | 'gas' | 'solid' | 'crystal';
}

