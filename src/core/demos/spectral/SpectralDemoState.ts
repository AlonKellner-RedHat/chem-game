import { SolutionProperties } from '../../spectral/SolutionProperties';

/**
 * State snapshot for dirty checking
 */
export interface RenderState {
  squareProperties: SolutionProperties;
  circleProperties: SolutionProperties;
  triangleProperties: SolutionProperties;
  squareX: number;
  squareY: number;
  squareSize: number;
  circleX: number;
  circleY: number;
  circleRadius: number;
  triangleX: number;
  triangleY: number;
  triangleSize: number;
  uvMode: boolean;
  darkMode: boolean;
}

/**
 * Manages state for SpectralDemo including shape properties, positions, and dirty flag tracking
 */
export class SpectralDemoState {
  // Shape properties
  public squareProperties: SolutionProperties;
  public circleProperties: SolutionProperties;
  public triangleProperties: SolutionProperties;

  // Shape positions
  public squareX: number = 200;
  public squareY: number = 360;
  public squareSize: number = 200;
  public circleX: number = 400;
  public circleY: number = 360;
  public circleRadius: number = 150;
  public triangleX: number = 300;
  public triangleY: number = 360;
  public triangleSize: number = 180;

  // Mode state
  public uvMode: boolean = false;
  public darkMode: boolean = false;

  // Dirty flag tracking
  private isDirty: boolean = true; // Start dirty to ensure initial render
  private lastRenderState: RenderState | null = null;

  constructor(
    squareProperties: SolutionProperties,
    circleProperties: SolutionProperties,
    triangleProperties: SolutionProperties
  ) {
    this.squareProperties = squareProperties;
    this.circleProperties = circleProperties;
    this.triangleProperties = triangleProperties;
  }

  /**
   * Check if state has changed since last render
   * Compares current state with lastRenderState
   */
  checkDirtyState(): boolean {
    if (this.isDirty) {
      return true;
    }

    if (!this.lastRenderState) {
      return true;
    }

    const currentState = this.getState();
    return !this.statesEqual(currentState, this.lastRenderState);
  }

  /**
   * Mark state as dirty (force next render)
   */
  markDirty(): void {
    this.isDirty = true;
  }

  /**
   * Mark state as clean (after successful render)
   */
  markClean(): void {
    this.isDirty = false;
    this.lastRenderState = this.getState();
  }

  /**
   * Get current state snapshot
   */
  getState(): RenderState {
    return {
      squareProperties: this.deepCopyProperties(this.squareProperties),
      circleProperties: this.deepCopyProperties(this.circleProperties),
      triangleProperties: this.deepCopyProperties(this.triangleProperties),
      squareX: this.squareX,
      squareY: this.squareY,
      squareSize: this.squareSize,
      circleX: this.circleX,
      circleY: this.circleY,
      circleRadius: this.circleRadius,
      triangleX: this.triangleX,
      triangleY: this.triangleY,
      triangleSize: this.triangleSize,
      uvMode: this.uvMode,
      darkMode: this.darkMode,
    };
  }

  /**
   * Update state (marks as dirty)
   */
  updateState(updates: Partial<RenderState>): void {
    if (updates.squareProperties !== undefined) {
      this.squareProperties = updates.squareProperties;
    }
    if (updates.circleProperties !== undefined) {
      this.circleProperties = updates.circleProperties;
    }
    if (updates.triangleProperties !== undefined) {
      this.triangleProperties = updates.triangleProperties;
    }
    if (updates.squareX !== undefined) {
      this.squareX = updates.squareX;
    }
    if (updates.squareY !== undefined) {
      this.squareY = updates.squareY;
    }
    if (updates.squareSize !== undefined) {
      this.squareSize = updates.squareSize;
    }
    if (updates.circleX !== undefined) {
      this.circleX = updates.circleX;
    }
    if (updates.circleY !== undefined) {
      this.circleY = updates.circleY;
    }
    if (updates.circleRadius !== undefined) {
      this.circleRadius = updates.circleRadius;
    }
    if (updates.triangleX !== undefined) {
      this.triangleX = updates.triangleX;
    }
    if (updates.triangleY !== undefined) {
      this.triangleY = updates.triangleY;
    }
    if (updates.triangleSize !== undefined) {
      this.triangleSize = updates.triangleSize;
    }
    if (updates.uvMode !== undefined) {
      this.uvMode = updates.uvMode;
    }
    if (updates.darkMode !== undefined) {
      this.darkMode = updates.darkMode;
    }
    this.markDirty();
  }

  /**
   * Compare two state snapshots for equality
   */
  private statesEqual(state1: RenderState, state2: RenderState): boolean {
    return (
      this.propertiesEqual(state1.squareProperties, state2.squareProperties) &&
      this.propertiesEqual(state1.circleProperties, state2.circleProperties) &&
      this.propertiesEqual(state1.triangleProperties, state2.triangleProperties) &&
      state1.squareX === state2.squareX &&
      state1.squareY === state2.squareY &&
      state1.squareSize === state2.squareSize &&
      state1.circleX === state2.circleX &&
      state1.circleY === state2.circleY &&
      state1.circleRadius === state2.circleRadius &&
      state1.triangleX === state2.triangleX &&
      state1.triangleY === state2.triangleY &&
      state1.triangleSize === state2.triangleSize &&
      state1.uvMode === state2.uvMode &&
      state1.darkMode === state2.darkMode
    );
  }

  /**
   * Compare two SolutionProperties for equality
   */
  private propertiesEqual(
    props1: SolutionProperties,
    props2: SolutionProperties
  ): boolean {
    if (
      props1.temperature !== props2.temperature ||
      props1.pressure !== props2.pressure ||
      props1.depth !== props2.depth ||
      props1.bubbleDensity !== props2.bubbleDensity ||
      props1.particleDensity !== props2.particleDensity ||
      props1.particleSize !== props2.particleSize ||
      props1.phase !== props2.phase
    ) {
      return false;
    }

    // Compare molecule concentrations
    const conc1 = props1.moleculeConcentrations;
    const conc2 = props2.moleculeConcentrations;

    if (conc1.size !== conc2.size) {
      return false;
    }

    for (const [key, value] of conc1) {
      if (conc2.get(key) !== value) {
        return false;
      }
    }

    return true;
  }

  /**
   * Deep copy SolutionProperties
   */
  private deepCopyProperties(props: SolutionProperties): SolutionProperties {
    const concentrations = new Map<string, number>();
    for (const [key, value] of props.moleculeConcentrations) {
      concentrations.set(key, value);
    }

    return {
      moleculeConcentrations: concentrations,
      temperature: props.temperature,
      pressure: props.pressure,
      depth: props.depth,
      bubbleDensity: props.bubbleDensity,
      particleDensity: props.particleDensity,
      particleSize: props.particleSize,
      phase: props.phase,
    };
  }
}

