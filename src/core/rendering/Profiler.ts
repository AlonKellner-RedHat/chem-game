/**
 * GPU Profiler
 * 
 * Tracks performance metrics for the spectral compute pipeline.
 * Provides logging, rolling averages, and report generation.
 * 
 * Enhanced with detailed GPU dispatch profiling for bottleneck analysis.
 */

import { PassTiming, SpectralComputePipeline } from './SpectralCompute';
import { 
  ProfilingReport as GPUProfilingReport, 
  BottleneckAnalysis,
  Recommendation,
} from './GPUProfiler';

/**
 * Logging mode for the profiler
 */
export type LoggingMode = 'silent' | 'summary' | 'verbose';

/**
 * Frame metrics collected during a single frame
 */
export interface FrameMetrics {
  frameNumber: number;
  timestamp: number;
  frameTime: number;           // Total JS frame time (ms)
  passTimings: PassTiming[];   // GPU pass timings
  readbackTime: number;        // Buffer readback time (ms)
  cacheHit: boolean;           // Whether spectrum cache was used
}

/**
 * Summary statistics
 */
export interface SummaryStats {
  avgFPS: number;
  avgFrameTime: number;
  avgPass0: number;   // Color computation
  avgPass1: number;   // Normalization
  avgPass2: number;   // Spectrum box (parallel)
  avgPass3: number;   // Averaging
  avgReadback: number;
  cacheHitRate: number;
  minFrameTime: number;
  maxFrameTime: number;
}

/**
 * Configuration for the profiler
 */
export interface ProfilerConfig {
  boxSize: number;
  plotResolution: number;
  averageRadius: number;
  colorResolution: number;
  screenWidth: number;
  screenHeight: number;
}

/**
 * Full profiling report for analysis
 */
export interface ProfilingReport {
  timestamp: string;
  config: ProfilerConfig;
  summary: SummaryStats;
  frames: FrameMetrics[];
  warnings: string[];
  deviceInfo: {
    hasF16: boolean;
    hasTimestampQuery: boolean;
  };
  // Enhanced GPU profiling data (optional - only present if GPU profiling is enabled)
  gpuProfiling?: GPUProfilingReport;
}

/**
 * Profiler class for tracking GPU performance
 */
export class Profiler {
  private loggingMode: LoggingMode = 'silent';
  private windowSize: number = 60;  // Rolling window in frames
  private logIntervalSeconds: number = 5;  // Log interval in summary mode
  
  private frames: FrameMetrics[] = [];
  private frameNumber: number = 0;
  private lastLogTime: number = 0;
  
  // Current frame state
  private currentFrameStart: number = 0;
  private currentPassTimings: PassTiming[] = [];
  private currentReadbackTime: number = 0;
  private currentCacheHit: boolean = false;
  
  // Device capabilities
  private hasF16: boolean = false;
  private hasTimestampQuery: boolean = false;
  
  // Configuration snapshot
  private config: ProfilerConfig = {
    boxSize: 30,
    plotResolution: 4500,
    averageRadius: 5,
    colorResolution: 16,
    screenWidth: 1280,
    screenHeight: 720,
  };
  
  // Reference to SpectralComputePipeline for GPU profiling
  private computePipeline: SpectralComputePipeline | null = null;
  private gpuProfilingEnabled: boolean = false;
  
  constructor() {
    this.lastLogTime = performance.now();
  }
  
  /**
   * Set the SpectralComputePipeline reference for GPU profiling
   */
  setComputePipeline(pipeline: SpectralComputePipeline): void {
    this.computePipeline = pipeline;
  }
  
  /**
   * Enable/disable GPU profiling (detailed dispatch-level analysis)
   */
  setGPUProfilingEnabled(enabled: boolean): void {
    this.gpuProfilingEnabled = enabled;
    if (this.computePipeline) {
      this.computePipeline.setProfilingEnabled(enabled, false);
      console.log(`[Profiler] GPU profiling: ${enabled ? 'ENABLED' : 'DISABLED'}`);
    } else {
      console.warn('[Profiler] Cannot enable GPU profiling: no compute pipeline set');
    }
  }
  
  /**
   * Check if GPU profiling is enabled
   */
  isGPUProfilingEnabled(): boolean {
    return this.gpuProfilingEnabled;
  }
  
  /**
   * Set logging mode
   */
  setLoggingMode(mode: LoggingMode): void {
    this.loggingMode = mode;
    console.log(`[Profiler] Logging mode: ${mode}`);
  }
  
  /**
   * Set rolling window size
   */
  setWindowSize(frames: number): void {
    this.windowSize = frames;
  }
  
  /**
   * Update device capabilities
   */
  setDeviceCapabilities(hasF16: boolean, hasTimestampQuery: boolean): void {
    this.hasF16 = hasF16;
    this.hasTimestampQuery = hasTimestampQuery;
  }
  
  /**
   * Update configuration
   */
  updateConfig(config: Partial<ProfilerConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  /**
   * Start a new frame
   */
  startFrame(): void {
    this.currentFrameStart = performance.now();
    this.currentPassTimings = [];
    this.currentReadbackTime = 0;
    this.currentCacheHit = false;
  }
  
  /**
   * Record pass timings from the compute pipeline
   */
  recordPassTimings(timings: PassTiming[]): void {
    this.currentPassTimings = timings;
  }
  
  /**
   * Record readback time
   */
  recordReadbackTime(time: number): void {
    this.currentReadbackTime = time;
  }
  
  /**
   * Record cache hit status
   */
  recordCacheHit(hit: boolean): void {
    this.currentCacheHit = hit;
  }
  
  /**
   * End frame and record metrics
   */
  endFrame(): void {
    const now = performance.now();
    const frameTime = now - this.currentFrameStart;
    
    const metrics: FrameMetrics = {
      frameNumber: this.frameNumber++,
      timestamp: now,
      frameTime,
      passTimings: this.currentPassTimings,
      readbackTime: this.currentReadbackTime,
      cacheHit: this.currentCacheHit,
    };
    
    // Add to rolling window
    this.frames.push(metrics);
    if (this.frames.length > this.windowSize) {
      this.frames.shift();
    }
    
    // Log based on mode
    if (this.loggingMode === 'verbose') {
      this.logFrame(metrics);
    } else if (this.loggingMode === 'summary') {
      if (now - this.lastLogTime >= this.logIntervalSeconds * 1000) {
        this.logSummary();
        this.lastLogTime = now;
      }
    }
  }
  
  /**
   * Log a single frame (verbose mode)
   */
  private logFrame(metrics: FrameMetrics): void {
    const passInfo = metrics.passTimings
      .map(p => `${p.name}: ${p.duration.toFixed(2)}ms`)
      .join(', ');
    
    console.log(
      `[Profiler] Frame ${metrics.frameNumber}: ` +
      `total=${metrics.frameTime.toFixed(2)}ms, ` +
      `${passInfo}, ` +
      `readback=${metrics.readbackTime.toFixed(2)}ms, ` +
      `cache=${metrics.cacheHit ? 'HIT' : 'MISS'}`
    );
  }
  
  /**
   * Log summary statistics
   */
  private logSummary(): void {
    const summary = this.getSummary();
    
    console.log(
      `[Profiler] Summary (${this.frames.length} frames): ` +
      `FPS=${summary.avgFPS.toFixed(1)}, ` +
      `frame=${summary.avgFrameTime.toFixed(2)}ms, ` +
      `P0=${summary.avgPass0.toFixed(2)}ms, ` +
      `P1=${summary.avgPass1.toFixed(2)}ms, ` +
      `P2=${summary.avgPass2.toFixed(2)}ms, ` +
      `P3=${summary.avgPass3.toFixed(2)}ms, ` +
      `readback=${summary.avgReadback.toFixed(2)}ms, ` +
      `cacheHit=${(summary.cacheHitRate * 100).toFixed(1)}%`
    );
  }
  
  /**
   * Get current metrics
   */
  getMetrics(): FrameMetrics | null {
    return this.frames.length > 0 ? this.frames[this.frames.length - 1] : null;
  }
  
  /**
   * Get summary statistics from rolling window
   */
  getSummary(): SummaryStats {
    if (this.frames.length === 0) {
      return {
        avgFPS: 0,
        avgFrameTime: 0,
        avgPass0: 0,
        avgPass1: 0,
        avgPass2: 0,
        avgPass3: 0,
        avgReadback: 0,
        cacheHitRate: 0,
        minFrameTime: 0,
        maxFrameTime: 0,
      };
    }
    
    let totalFrameTime = 0;
    let totalPass0 = 0;
    let totalPass1 = 0;
    let totalPass2 = 0;
    let totalPass3 = 0;
    let totalReadback = 0;
    let cacheHits = 0;
    let minFrameTime = Infinity;
    let maxFrameTime = 0;
    
    for (const frame of this.frames) {
      totalFrameTime += frame.frameTime;
      totalReadback += frame.readbackTime;
      
      if (frame.cacheHit) cacheHits++;
      if (frame.frameTime < minFrameTime) minFrameTime = frame.frameTime;
      if (frame.frameTime > maxFrameTime) maxFrameTime = frame.frameTime;
      
      for (const pass of frame.passTimings) {
        if (pass.name.includes('Pass 0')) totalPass0 += pass.duration;
        else if (pass.name.includes('Pass 1')) totalPass1 += pass.duration;
        else if (pass.name.includes('Pass 2')) totalPass2 += pass.duration;
        else if (pass.name.includes('Pass 3')) totalPass3 += pass.duration;
      }
    }
    
    const count = this.frames.length;
    const avgFrameTime = totalFrameTime / count;
    
    return {
      avgFPS: avgFrameTime > 0 ? 1000 / avgFrameTime : 0,
      avgFrameTime,
      avgPass0: totalPass0 / count,
      avgPass1: totalPass1 / count,
      avgPass2: totalPass2 / count,
      avgPass3: totalPass3 / count,
      avgReadback: totalReadback / count,
      cacheHitRate: cacheHits / count,
      minFrameTime,
      maxFrameTime,
    };
  }
  
  /**
   * Generate warnings based on metrics
   */
  private generateWarnings(): string[] {
    const warnings: string[] = [];
    const summary = this.getSummary();
    
    if (summary.avgFPS < 30) {
      warnings.push(`Low FPS: ${summary.avgFPS.toFixed(1)} (target: 60)`);
    }
    
    if (summary.avgFrameTime > 33) {
      warnings.push(`High frame time: ${summary.avgFrameTime.toFixed(2)}ms (target: <16.6ms)`);
    }
    
    if (summary.avgPass2 > 10) {
      warnings.push(`Spectrum box computation slow: ${summary.avgPass2.toFixed(2)}ms`);
    }
    
    if (summary.avgReadback > 5) {
      warnings.push(`Buffer readback slow: ${summary.avgReadback.toFixed(2)}ms`);
    }
    
    if (summary.cacheHitRate < 0.5) {
      warnings.push(`Low cache hit rate: ${(summary.cacheHitRate * 100).toFixed(1)}%`);
    }
    
    // Check for frame time spikes
    const spikeCount = this.frames.filter(f => f.frameTime > summary.avgFrameTime * 2).length;
    if (spikeCount > this.windowSize * 0.1) {
      warnings.push(`Frame time spikes: ${spikeCount} frames > 2x average`);
    }
    
    return warnings;
  }
  
  /**
   * Generate full profiling report
   */
  generateReport(): ProfilingReport {
    const report: ProfilingReport = {
      timestamp: new Date().toISOString(),
      config: this.config,
      summary: this.getSummary(),
      frames: [...this.frames],  // Copy to avoid mutation
      warnings: this.generateWarnings(),
      deviceInfo: {
        hasF16: this.hasF16,
        hasTimestampQuery: this.hasTimestampQuery,
      },
    };
    
    // Include GPU profiling data if available
    if (this.gpuProfilingEnabled && this.computePipeline) {
      try {
        if (this.computePipeline.getProfilingSessionCount() > 0) {
          report.gpuProfiling = this.computePipeline.generateProfilingReport();
        }
      } catch (e) {
        console.warn('[Profiler] Could not generate GPU profiling report:', e);
      }
    }
    
    return report;
  }
  
  /**
   * Download report as JSON file
   */
  downloadReport(): void {
    const report = this.generateReport();
    const json = JSON.stringify(report, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `profiling-report-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('[Profiler] Report downloaded');
  }
  
  /**
   * Get formatted display string for UI overlay
   */
  getDisplayText(): string[] {
    const summary = this.getSummary();
    const lines: string[] = [];
    
    // FPS with color coding
    const fpsColor = summary.avgFPS >= 55 ? 'green' : summary.avgFPS >= 30 ? 'yellow' : 'red';
    lines.push(`FPS: ${summary.avgFPS.toFixed(1)} [${fpsColor}]`);
    lines.push(`Frame: ${summary.avgFrameTime.toFixed(2)}ms (${summary.minFrameTime.toFixed(1)}-${summary.maxFrameTime.toFixed(1)})`);
    lines.push(`---`);
    lines.push(`Pass 0 (Color): ${summary.avgPass0.toFixed(2)}ms`);
    lines.push(`Pass 1 (Norm): ${summary.avgPass1.toFixed(2)}ms`);
    lines.push(`Pass 2 (Spectrum): ${summary.avgPass2.toFixed(2)}ms`);
    lines.push(`Pass 3 (Average): ${summary.avgPass3.toFixed(2)}ms`);
    lines.push(`Readback: ${summary.avgReadback.toFixed(2)}ms`);
    lines.push(`---`);
    lines.push(`Cache: ${(summary.cacheHitRate * 100).toFixed(0)}% hit`);
    lines.push(`f16: ${this.hasF16 ? 'ON' : 'OFF'}`);
    
    // GPU profiling status
    lines.push(`---`);
    if (this.gpuProfilingEnabled) {
      const sessionCount = this.computePipeline?.getProfilingSessionCount() ?? 0;
      lines.push(`GPU Profiling: ON (${sessionCount} frames)`);
    } else {
      lines.push(`GPU Profiling: OFF`);
    }
    
    lines.push(`---`);
    lines.push(`[P] Toggle overlay`);
    lines.push(`[G] Toggle GPU profiling`);
    lines.push(`[D] Download report`);
    
    return lines;
  }
  
  /**
   * Reset all metrics
   */
  reset(): void {
    this.frames = [];
    this.frameNumber = 0;
  }
}

// Global profiler instance
export const profiler = new Profiler();

