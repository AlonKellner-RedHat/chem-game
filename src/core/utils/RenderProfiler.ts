/**
 * RenderProfiler - Performance profiling utility for rendering pipeline
 * Uses browser User Timing API (performance.mark/measure) for DevTools integration
 * Outputs structured console logs and JSON file exports
 */
export class RenderProfiler {
  private enabled: boolean = false;
  private renderCount: number = 0;
  private currentRenderId: number = 0;
  private timingData: Array<{
    renderId: number;
    timestamp: number;
    timings: Record<string, number>;
  }> = [];

  constructor() {
    // Check URL parameter for profiling
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      this.enabled = urlParams.get('profile') === 'true';
    }
  }

  /**
   * Check if profiling is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Enable or disable profiling
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Get current render count
   */
  getRenderCount(): number {
    return this.renderCount;
  }

  /**
   * Start a new render profiling session
   */
  startRender(): number {
    if (!this.enabled) return 0;
    
    this.renderCount++;
    this.currentRenderId = this.renderCount;
    const timestamp = performance.now();
    
    performance.mark(`render-${this.currentRenderId}-start`);
    
    this.timingData.push({
      renderId: this.currentRenderId,
      timestamp,
      timings: {},
    });
    
    return this.currentRenderId;
  }

  /**
   * Start a timing block
   */
  start(label: string): void {
    if (!this.enabled) return;
    
    const fullLabel = `render-${this.currentRenderId}-${label}`;
    performance.mark(`${fullLabel}-start`);
  }

  /**
   * End a timing block and record the duration
   */
  end(label: string): number {
    if (!this.enabled) return 0;
    
    const fullLabel = `render-${this.currentRenderId}-${label}`;
    const startMark = `${fullLabel}-start`;
    const endMark = `${fullLabel}-end`;
    
    performance.mark(endMark);
    performance.measure(fullLabel, startMark, endMark);
    
    const measure = performance.getEntriesByName(fullLabel, 'measure')[0];
    const duration = measure ? measure.duration : 0;
    
    // Store timing data
    if (this.timingData.length > 0) {
      const currentRender = this.timingData[this.timingData.length - 1];
      this.setNestedTiming(currentRender.timings, label, duration);
    }
    
    return duration;
  }

  /**
   * Set nested timing value (supports dot notation like "gpuPath.textureUpdates")
   * If a parent path already has a numeric value, it will be preserved as a "total" property
   */
  private setNestedTiming(obj: Record<string, any>, path: string, value: number): void {
    const parts = path.split('.');
    let current = obj;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      // If this part is a number (was set as a total), convert it to an object with a "total" property
      if (typeof current[part] === 'number') {
        const existingTotal = current[part];
        current[part] = { total: existingTotal };
      } else if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    }
    
    const finalPart = parts[parts.length - 1];
    // If we're setting a value on something that's already an object, add it
    // Otherwise, just set it
    if (typeof current[finalPart] === 'object' && current[finalPart] !== null) {
      // Object already exists, add the value (this shouldn't happen normally)
      current[finalPart]._value = value;
    } else {
      current[finalPart] = value;
    }
  }

  /**
   * End the current render and return its ID
   */
  endRender(): number {
    if (!this.enabled || this.currentRenderId === 0) return 0;
    
    const renderId = this.currentRenderId;
    performance.mark(`render-${renderId}-end`);
    performance.measure(`render-${renderId}-total`, `render-${renderId}-start`, `render-${renderId}-end`);
    
    const measure = performance.getEntriesByName(`render-${renderId}-total`, 'measure')[0];
    if (measure && this.timingData.length > 0) {
      const currentRender = this.timingData[this.timingData.length - 1];
      currentRender.timings.totalTime = measure.duration;
    }
    
    return renderId;
  }

  /**
   * Output formatted report to console
   */
  report(): void {
    if (!this.enabled || this.timingData.length === 0) return;
    
    const lastRender = this.timingData[this.timingData.length - 1];
    console.log(`\n[Performance] Render #${lastRender.renderId}`);
    this.printTimings(lastRender.timings, 0);
    
    if (this.timingData.length > 1) {
      this.printSummary();
    }
  }

  /**
   * Recursively print timing tree
   */
  private printTimings(timings: Record<string, any>, indent: number): void {
    const indentStr = '  '.repeat(indent);
    
    for (const [key, value] of Object.entries(timings)) {
      if (typeof value === 'number') {
        const warning = value > 100 ? ' ⚠️ BOTTLENECK' : '';
        console.log(`${indentStr}${key}: ${value.toFixed(2)}ms${warning}`);
      } else if (typeof value === 'object' && value !== null) {
        console.log(`${indentStr}${key}:`);
        this.printTimings(value, indent + 1);
      }
    }
  }

  /**
   * Print summary across all renders
   */
  private printSummary(): void {
    const totalRenders = this.timingData.length;
    const avgTotal = this.timingData.reduce((sum, r) => sum + (r.timings.totalTime || 0), 0) / totalRenders;
    
    // Find bottlenecks (operations > 100ms on average)
    const bottlenecks: Array<{ operation: string; averageTime: number }> = [];
    const operationTotals = new Map<string, number[]>();
    
    for (const render of this.timingData) {
      this.collectOperations(render.timings, '', operationTotals);
    }
    
    for (const [operation, times] of operationTotals.entries()) {
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      if (avg > 100) {
        bottlenecks.push({ operation, averageTime: avg });
      }
    }
    
    bottlenecks.sort((a, b) => b.averageTime - a.averageTime);
    
    console.log(`\n[Performance] Summary`);
    console.log(`  Renders: ${totalRenders}`);
    console.log(`  Average Total Time: ${avgTotal.toFixed(2)}ms`);
    if (bottlenecks.length > 0) {
      console.log(`  Bottlenecks:`);
      for (const bottleneck of bottlenecks.slice(0, 5)) {
        console.log(`    ${bottleneck.operation}: ${bottleneck.averageTime.toFixed(2)}ms avg`);
      }
    }
  }

  /**
   * Collect all operation timings recursively
   */
  private collectOperations(
    timings: Record<string, any>,
    prefix: string,
    operationTotals: Map<string, number[]>
  ): void {
    for (const [key, value] of Object.entries(timings)) {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      
      if (typeof value === 'number') {
        if (!operationTotals.has(fullPath)) {
          operationTotals.set(fullPath, []);
        }
        operationTotals.get(fullPath)!.push(value);
      } else if (typeof value === 'object' && value !== null) {
        this.collectOperations(value, fullPath, operationTotals);
      }
    }
  }

  /**
   * Export timing data to JSON file
   */
  exportJSON(): void {
    if (!this.enabled || this.timingData.length === 0) return;
    
    // Calculate summary
    const totalRenders = this.timingData.length;
    const avgTotal = this.timingData.reduce((sum, r) => sum + (r.timings.totalTime || 0), 0) / totalRenders;
    
    const operationTotals = new Map<string, number[]>();
    for (const render of this.timingData) {
      this.collectOperations(render.timings, '', operationTotals);
    }
    
    const bottlenecks: Array<{ operation: string; averageTime: number; percentage: number }> = [];
    for (const [operation, times] of operationTotals.entries()) {
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      if (avg > 100) {
        bottlenecks.push({
          operation,
          averageTime: avg,
          percentage: (avg / avgTotal) * 100,
        });
      }
    }
    bottlenecks.sort((a, b) => b.averageTime - a.averageTime);
    
    const exportData = {
      timestamp: new Date().toISOString(),
      renders: this.timingData.map(r => ({
        renderId: r.renderId,
        timestamp: r.timestamp,
        ...r.timings,
      })),
      summary: {
        totalRenders,
        averageTotalTime: avgTotal,
        bottlenecks: bottlenecks.slice(0, 10),
      },
    };
    
    // Create JSON string
    const jsonStr = JSON.stringify(exportData, null, 2);
    
    // Try to download file (browser environment)
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      try {
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'performance-profile.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('[Performance] Exported profile to performance-profile.json');
      } catch (error) {
        console.error('[Performance] Failed to export JSON:', error);
        console.log('[Performance] JSON data:', jsonStr);
      }
    } else {
      // Node.js environment - write to console
      console.log('[Performance] JSON data:');
      console.log(jsonStr);
    }
  }

  /**
   * Reset all timing data
   */
  reset(): void {
    this.renderCount = 0;
    this.currentRenderId = 0;
    this.timingData = [];
    
    if (typeof performance !== 'undefined') {
      // Clear all performance marks and measures
      performance.clearMarks();
      performance.clearMeasures();
    }
  }

  /**
   * Get current render ID
   */
  getCurrentRenderId(): number {
    return this.currentRenderId;
  }
}

// Singleton instance
let profilerInstance: RenderProfiler | null = null;

/**
 * Get the global profiler instance
 */
export function getProfiler(): RenderProfiler {
  if (!profilerInstance) {
    profilerInstance = new RenderProfiler();
  }
  return profilerInstance;
}

