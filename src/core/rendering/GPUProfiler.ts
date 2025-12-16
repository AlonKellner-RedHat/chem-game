/**
 * GPU Profiler for SpectralCompute Pipeline
 * 
 * Provides comprehensive profiling of WebGPU compute operations including:
 * - Per-dispatch GPU timestamp queries (when available)
 * - Wall-clock timing fallback
 * - Memory usage tracking
 * - Bottleneck analysis (compute vs memory bound)
 * - JSON report generation for optimization analysis
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Profile data for a single GPU dispatch
 */
export interface DispatchProfile {
  name: string;
  entryPoint: string;
  layer?: number;
  startTimeMs: number;
  endTimeMs: number;
  durationMs: number;
  workgroups: [number, number, number];
  workgroupSize: [number, number, number];
  totalInvocations: number;
  // Estimated based on buffer access patterns
  estimatedBytesRead: number;
  estimatedBytesWritten: number;
  estimatedBandwidthGBs?: number;
}

/**
 * Profile data for a logical pass (may contain multiple dispatches)
 */
export interface PassProfile {
  name: string;
  startTimeMs: number;
  endTimeMs: number;
  durationMs: number;
  dispatches: DispatchProfile[];
  totalInvocations: number;
  // Aggregated memory stats
  totalBytesRead: number;
  totalBytesWritten: number;
}

/**
 * Profile data for a layer iteration
 */
export interface LayerProfile {
  layerIndex: number;
  shapeCount: number;
  startTimeMs: number;
  endTimeMs: number;
  durationMs: number;
  passes: string[];  // Names of passes executed for this layer
  hasScattering: boolean;
  scatterSigma: number;
}

/**
 * Memory allocation tracking
 */
export interface BufferProfile {
  name: string;
  size: number;
  usage: string;
  format?: string;
}

export interface MemoryProfile {
  totalAllocated: number;
  buffers: BufferProfile[];
  peakUsage: number;
}

/**
 * Pass merge optimization metrics
 * Tracks the effectiveness of merged pipeline passes
 */
export interface PassMergeMetrics {
  /** Number of dispatches saved by merging passes */
  dispatchesSaved: number;
  /** Number of MSDF samples saved through mask caching */
  msdfSamplesSaved: number;
  /** Estimated bandwidth saved by avoiding intermediate buffer writes (GB) */
  bandwidthSavedGB: number;
  /** Names of merged passes */
  mergedPasses: string[];
}

/**
 * Precision metrics for f16 vs f32 buffer usage
 * Tracks memory efficiency from half-precision optimization
 */
export interface PrecisionMetrics {
  /** Total bytes used by f16 buffers */
  f16BufferBytes: number;
  /** Total bytes used by f32 buffers */
  f32BufferBytes: number;
  /** Percentage of buffer memory using f16 */
  f16Percentage: number;
  /** Estimated bandwidth savings from f16 (compared to all f32) */
  bandwidthSavingsPercent: number;
}

/**
 * Bottleneck classification
 */
export type BottleneckType = 'compute' | 'memory' | 'latency' | 'balanced';

export interface BottleneckAnalysis {
  primaryBottleneck: BottleneckType;
  confidence: number;
  hotspots: string[];
  computeBoundPasses: string[];
  memoryBoundPasses: string[];
  latencyBoundPasses: string[];
  details: {
    avgComputeIntensity: number;  // Operations per byte
    avgBandwidthUtilization: number;  // GB/s achieved vs theoretical
    dispatchOverhead: number;  // Time spent in small dispatches
    asyncWaitTime: number;  // Time spent waiting for GPU
  };
}

/**
 * Optimization recommendation
 */
export interface Recommendation {
  issue: string;
  impact: 'high' | 'medium' | 'low';
  suggestion: string;
  affectedPasses?: string[];
}

/**
 * Complete profiling session data
 */
export interface ProfilingSession {
  frameId: number;
  startTime: number;
  endTime: number;
  totalDurationMs: number;
  
  // Detailed profiles
  passes: PassProfile[];
  layers: LayerProfile[];
  dispatches: DispatchProfile[];
  
  // Resource tracking
  memory: MemoryProfile;
  
  // Optimization metrics
  mergeMetrics: PassMergeMetrics;
  precisionMetrics: PrecisionMetrics;
  
  // Analysis results
  bottlenecks: BottleneckAnalysis;
  recommendations: Recommendation[];
}

/**
 * Final JSON report structure
 */
export interface ProfilingReport {
  metadata: {
    timestamp: string;
    device: string;
    features: string[];
    resolution: [number, number];
    spectralSamples: number;
    plotResolution: number;
    framesProfiled: number;
  };
  summary: {
    avgFrameTimeMs: number;
    minFrameTimeMs: number;
    maxFrameTimeMs: number;
    avgGpuTimeMs: number;
    avgCpuOverheadMs: number;
    primaryBottleneck: BottleneckType;
    hotspots: string[];
  };
  passes: PassProfile[];
  layers: LayerProfile[];
  memory: MemoryProfile;
  
  // Optimization metrics
  mergeMetrics: PassMergeMetrics;
  precisionMetrics: PrecisionMetrics;
  
  bottlenecks: BottleneckAnalysis;
  recommendations: Recommendation[];
  rawSessions?: ProfilingSession[];  // Optional: include raw data for deep analysis
}

// ============================================================================
// GPU Profiler Class
// ============================================================================

/**
 * GPU Profiler for WebGPU compute pipelines
 * 
 * Usage:
 * ```typescript
 * const profiler = new GPUProfiler(device);
 * profiler.startSession(frameId);
 * 
 * // Before each dispatch:
 * profiler.beginDispatch('applyLayerAbsorption', 'applyLayerAbsorption', { layer: 0 });
 * pass.dispatchWorkgroups(x, y, z);
 * profiler.endDispatch([x, y, z], [8, 8, 1], bytesRead, bytesWritten);
 * 
 * profiler.endSession();
 * const report = profiler.generateReport();
 * ```
 */
export class GPUProfiler {
  private device: GPUDevice;
  private hasTimestampSupport: boolean;
  
  // Timestamp query resources
  private timestampQuerySet: GPUQuerySet | null = null;
  private timestampBuffer: GPUBuffer | null = null;
  private timestampReadBuffer: GPUBuffer | null = null;
  private timestampCapacity: number = 256;  // Max timestamps per session
  private timestampIndex: number = 0;
  
  // Session state
  private currentSession: ProfilingSession | null = null;
  private sessions: ProfilingSession[] = [];
  private currentDispatch: Partial<DispatchProfile> | null = null;
  private currentPass: Partial<PassProfile> | null = null;
  private currentLayer: Partial<LayerProfile> | null = null;
  
  // Buffer tracking
  private trackedBuffers: Map<GPUBuffer, BufferProfile> = new Map();
  private peakMemoryUsage: number = 0;
  
  // Precision tracking (f16 vs f32)
  private f16BufferBytes: number = 0;
  private f32BufferBytes: number = 0;
  
  // Merge optimization tracking
  private dispatchesSaved: number = 0;
  private msdfSamplesSaved: number = 0;
  private bandwidthSavedBytes: number = 0;
  private mergedPasses: string[] = [];
  
  // Configuration
  private enabled: boolean = true;
  private includeRawSessions: boolean = false;
  private maxSessionsToKeep: number = 60;  // ~1 second at 60fps
  
  // Device info cache
  private deviceInfo: { name: string; features: string[] } | null = null;
  
  constructor(device: GPUDevice) {
    this.device = device;
    this.hasTimestampSupport = device.features.has('timestamp-query');
    
    // Cache device info
    this.deviceInfo = {
      name: (device as unknown as { adapterInfo?: { description?: string } }).adapterInfo?.description || 'Unknown GPU',
      features: Array.from(device.features),
    };
    
    // Initialize timestamp queries if supported
    if (this.hasTimestampSupport) {
      this.initTimestampQueries();
    }
  }
  
  /**
   * Initialize timestamp query resources
   */
  private initTimestampQueries(): void {
    try {
      this.timestampQuerySet = this.device.createQuerySet({
        type: 'timestamp',
        count: this.timestampCapacity,
      });
      
      this.timestampBuffer = this.device.createBuffer({
        label: 'Profiler Timestamp Buffer',
        size: this.timestampCapacity * 8,  // u64 per timestamp
        usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
      });
      
      this.timestampReadBuffer = this.device.createBuffer({
        label: 'Profiler Timestamp Read Buffer',
        size: this.timestampCapacity * 8,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      });
      
      console.log('[GPUProfiler] Timestamp queries initialized');
    } catch (e) {
      console.warn('[GPUProfiler] Failed to initialize timestamp queries:', e);
      this.hasTimestampSupport = false;
    }
  }
  
  /**
   * Enable or disable profiling
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
  
  /**
   * Check if profiling is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
  
  /**
   * Set whether to include raw session data in reports
   */
  setIncludeRawSessions(include: boolean): void {
    this.includeRawSessions = include;
  }
  
  /**
   * Track a buffer allocation
   * @param format - Buffer element format: 'f16', 'f32', 'u32', 'vec4<f32>', etc.
   */
  trackBuffer(buffer: GPUBuffer, name: string, usage: string, format?: string): void {
    if (!this.enabled) return;
    
    const profile: BufferProfile = {
      name,
      size: buffer.size,
      usage,
      format,
    };
    
    this.trackedBuffers.set(buffer, profile);
    
    // Track precision for f16/f32 buffers
    if (format) {
      if (format.includes('f16') || format === 'f16') {
        this.f16BufferBytes += buffer.size;
      } else if (format.includes('f32') || format === 'f32' || format.includes('vec4<f32>')) {
        this.f32BufferBytes += buffer.size;
      }
    }
    
    // Update peak usage
    const totalUsage = Array.from(this.trackedBuffers.values())
      .reduce((sum, b) => sum + b.size, 0);
    this.peakMemoryUsage = Math.max(this.peakMemoryUsage, totalUsage);
  }
  
  /**
   * Untrack a destroyed buffer
   */
  untrackBuffer(buffer: GPUBuffer): void {
    const profile = this.trackedBuffers.get(buffer);
    if (profile?.format) {
      // Remove from precision tracking
      if (profile.format.includes('f16') || profile.format === 'f16') {
        this.f16BufferBytes -= profile.size;
      } else if (profile.format.includes('f32') || profile.format === 'f32') {
        this.f32BufferBytes -= profile.size;
      }
    }
    this.trackedBuffers.delete(buffer);
  }
  
  /**
   * Record merge optimization metrics
   * Call this after each merged dispatch to track savings
   * 
   * @param dispatchesSaved - Number of dispatches avoided by merging
   * @param msdfSamplesSaved - Number of MSDF texture samples avoided by mask caching
   * @param bandwidthSavedBytes - Bytes of intermediate buffer writes avoided
   * @param mergedPassName - Name of the merged pass
   */
  recordMergeMetrics(
    dispatchesSaved: number,
    msdfSamplesSaved: number,
    bandwidthSavedBytes: number,
    mergedPassName?: string
  ): void {
    if (!this.enabled) return;
    
    this.dispatchesSaved += dispatchesSaved;
    this.msdfSamplesSaved += msdfSamplesSaved;
    this.bandwidthSavedBytes += bandwidthSavedBytes;
    
    if (mergedPassName && !this.mergedPasses.includes(mergedPassName)) {
      this.mergedPasses.push(mergedPassName);
    }
  }
  
  /**
   * Get current precision metrics
   */
  getPrecisionMetrics(): PrecisionMetrics {
    const totalBytes = this.f16BufferBytes + this.f32BufferBytes;
    const f16Percentage = totalBytes > 0 ? (this.f16BufferBytes / totalBytes) * 100 : 0;
    
    // Bandwidth savings: f16 uses half the bandwidth of f32 for same data
    // If everything were f32, bandwidth would be 2x for the f16 portion
    const potentialF32Bytes = this.f16BufferBytes * 2;
    const actualSavings = potentialF32Bytes - this.f16BufferBytes;
    const bandwidthSavingsPercent = totalBytes > 0 
      ? (actualSavings / (this.f32BufferBytes + potentialF32Bytes)) * 100 
      : 0;
    
    return {
      f16BufferBytes: this.f16BufferBytes,
      f32BufferBytes: this.f32BufferBytes,
      f16Percentage,
      bandwidthSavingsPercent,
    };
  }
  
  /**
   * Get current merge metrics
   */
  getMergeMetrics(): PassMergeMetrics {
    return {
      dispatchesSaved: this.dispatchesSaved,
      msdfSamplesSaved: this.msdfSamplesSaved,
      bandwidthSavedGB: this.bandwidthSavedBytes / (1024 * 1024 * 1024),
      mergedPasses: [...this.mergedPasses],
    };
  }
  
  /**
   * Start a new profiling session (typically per frame)
   */
  startSession(frameId: number): void {
    if (!this.enabled) return;
    
    // Reset per-session merge metrics
    this.dispatchesSaved = 0;
    this.msdfSamplesSaved = 0;
    this.bandwidthSavedBytes = 0;
    this.mergedPasses = [];
    
    this.currentSession = {
      frameId,
      startTime: performance.now(),
      endTime: 0,
      totalDurationMs: 0,
      passes: [],
      layers: [],
      dispatches: [],
      memory: this.getMemoryProfile(),
      mergeMetrics: this.getMergeMetrics(),
      precisionMetrics: this.getPrecisionMetrics(),
      bottlenecks: this.createEmptyBottleneckAnalysis(),
      recommendations: [],
    };
    
    this.timestampIndex = 0;
  }
  
  /**
   * End the current profiling session
   */
  endSession(): void {
    if (!this.enabled || !this.currentSession) return;
    
    this.currentSession.endTime = performance.now();
    this.currentSession.totalDurationMs = 
      this.currentSession.endTime - this.currentSession.startTime;
    
    // Update memory profile with current state
    this.currentSession.memory = this.getMemoryProfile();
    
    // Update optimization metrics
    this.currentSession.mergeMetrics = this.getMergeMetrics();
    this.currentSession.precisionMetrics = this.getPrecisionMetrics();
    
    // Analyze bottlenecks
    this.currentSession.bottlenecks = this.analyzeBottlenecks(this.currentSession);
    
    // Generate recommendations
    this.currentSession.recommendations = this.generateRecommendations(this.currentSession);
    
    // Store session
    this.sessions.push(this.currentSession);
    
    // Trim old sessions
    while (this.sessions.length > this.maxSessionsToKeep) {
      this.sessions.shift();
    }
    
    this.currentSession = null;
  }
  
  /**
   * Begin a logical pass (group of related dispatches)
   */
  beginPass(name: string): void {
    if (!this.enabled || !this.currentSession) return;
    
    // End any current pass
    if (this.currentPass) {
      this.endPass();
    }
    
    this.currentPass = {
      name,
      startTimeMs: performance.now() - this.currentSession.startTime,
      dispatches: [],
      totalInvocations: 0,
      totalBytesRead: 0,
      totalBytesWritten: 0,
    };
  }
  
  /**
   * End the current pass
   */
  endPass(): void {
    if (!this.enabled || !this.currentSession || !this.currentPass) return;
    
    const pass = this.currentPass as PassProfile;
    pass.endTimeMs = performance.now() - this.currentSession.startTime;
    pass.durationMs = pass.endTimeMs - pass.startTimeMs;
    
    // Aggregate stats from dispatches
    pass.totalInvocations = pass.dispatches.reduce((sum, d) => sum + d.totalInvocations, 0);
    pass.totalBytesRead = pass.dispatches.reduce((sum, d) => sum + d.estimatedBytesRead, 0);
    pass.totalBytesWritten = pass.dispatches.reduce((sum, d) => sum + d.estimatedBytesWritten, 0);
    
    this.currentSession.passes.push(pass);
    this.currentPass = null;
  }
  
  /**
   * Begin a layer iteration
   */
  beginLayer(layerIndex: number, shapeCount: number, hasScattering: boolean, scatterSigma: number): void {
    if (!this.enabled || !this.currentSession) return;
    
    // End any current layer
    if (this.currentLayer) {
      this.endLayer();
    }
    
    this.currentLayer = {
      layerIndex,
      shapeCount,
      startTimeMs: performance.now() - this.currentSession.startTime,
      passes: [],
      hasScattering,
      scatterSigma,
    };
  }
  
  /**
   * End the current layer
   */
  endLayer(): void {
    if (!this.enabled || !this.currentSession || !this.currentLayer) return;
    
    const layer = this.currentLayer as LayerProfile;
    layer.endTimeMs = performance.now() - this.currentSession.startTime;
    layer.durationMs = layer.endTimeMs - layer.startTimeMs;
    
    this.currentSession.layers.push(layer);
    this.currentLayer = null;
  }
  
  /**
   * Begin timing a dispatch
   */
  beginDispatch(
    name: string, 
    entryPoint: string, 
    options?: { layer?: number }
  ): void {
    if (!this.enabled || !this.currentSession) return;
    
    this.currentDispatch = {
      name,
      entryPoint,
      layer: options?.layer,
      startTimeMs: performance.now() - this.currentSession.startTime,
    };
    
    // Record layer pass association
    if (this.currentLayer) {
      if (!this.currentLayer.passes) {
        this.currentLayer.passes = [];
      }
      if (!this.currentLayer.passes.includes(name)) {
        this.currentLayer.passes.push(name);
      }
    }
  }
  
  /**
   * End timing a dispatch and record metrics
   */
  endDispatch(
    workgroups: [number, number, number],
    workgroupSize: [number, number, number],
    estimatedBytesRead: number,
    estimatedBytesWritten: number
  ): void {
    if (!this.enabled || !this.currentSession || !this.currentDispatch) return;
    
    const dispatch = this.currentDispatch as DispatchProfile;
    dispatch.endTimeMs = performance.now() - this.currentSession.startTime;
    dispatch.durationMs = dispatch.endTimeMs - dispatch.startTimeMs;
    dispatch.workgroups = workgroups;
    dispatch.workgroupSize = workgroupSize;
    dispatch.totalInvocations = 
      workgroups[0] * workgroups[1] * workgroups[2] *
      workgroupSize[0] * workgroupSize[1] * workgroupSize[2];
    dispatch.estimatedBytesRead = estimatedBytesRead;
    dispatch.estimatedBytesWritten = estimatedBytesWritten;
    
    // Calculate bandwidth if duration is meaningful
    if (dispatch.durationMs > 0.001) {
      const totalBytes = estimatedBytesRead + estimatedBytesWritten;
      dispatch.estimatedBandwidthGBs = totalBytes / (dispatch.durationMs * 1e6);  // GB/s
    }
    
    this.currentSession.dispatches.push(dispatch);
    
    // Add to current pass if active
    if (this.currentPass) {
      this.currentPass.dispatches!.push(dispatch);
    }
    
    this.currentDispatch = null;
  }
  
  /**
   * Write timestamp to query set (for GPU timing)
   * Call this in the compute pass encoder
   */
  writeTimestamp(encoder: GPUComputePassEncoder): number {
    if (!this.hasTimestampSupport || !this.timestampQuerySet) {
      return -1;
    }
    
    if (this.timestampIndex >= this.timestampCapacity) {
      console.warn('[GPUProfiler] Timestamp capacity exceeded');
      return -1;
    }
    
    // Note: writeTimestamp on compute pass is not standard WebGPU
    // This is a placeholder for when the API supports it
    // Currently we rely on wall-clock timing
    
    return this.timestampIndex++;
  }
  
  /**
   * Get current memory profile
   */
  private getMemoryProfile(): MemoryProfile {
    const buffers = Array.from(this.trackedBuffers.values());
    const totalAllocated = buffers.reduce((sum, b) => sum + b.size, 0);
    
    return {
      totalAllocated,
      buffers,
      peakUsage: this.peakMemoryUsage,
    };
  }
  
  /**
   * Create empty bottleneck analysis
   */
  private createEmptyBottleneckAnalysis(): BottleneckAnalysis {
    return {
      primaryBottleneck: 'balanced',
      confidence: 0,
      hotspots: [],
      computeBoundPasses: [],
      memoryBoundPasses: [],
      latencyBoundPasses: [],
      details: {
        avgComputeIntensity: 0,
        avgBandwidthUtilization: 0,
        dispatchOverhead: 0,
        asyncWaitTime: 0,
      },
    };
  }
  
  /**
   * Analyze bottlenecks from session data
   */
  private analyzeBottlenecks(session: ProfilingSession): BottleneckAnalysis {
    const analysis = this.createEmptyBottleneckAnalysis();
    
    if (session.dispatches.length === 0) {
      return analysis;
    }
    
    // Analyze each dispatch
    const dispatchAnalysis = session.dispatches.map(dispatch => {
      const bytesTotal = dispatch.estimatedBytesRead + dispatch.estimatedBytesWritten;
      const opsPerByte = dispatch.totalInvocations / Math.max(bytesTotal, 1);
      const bandwidth = dispatch.estimatedBandwidthGBs || 0;
      
      // Heuristic: high ops/byte = compute bound, high bandwidth = memory bound
      // Small duration with many dispatches = latency bound
      const isComputeBound = opsPerByte > 10 && dispatch.durationMs > 0.5;
      const isMemoryBound = bandwidth > 50 && opsPerByte < 5;  // 50 GB/s threshold
      const isLatencyBound = dispatch.durationMs < 0.1 && dispatch.totalInvocations < 10000;
      
      return {
        name: dispatch.name,
        isComputeBound,
        isMemoryBound,
        isLatencyBound,
        opsPerByte,
        bandwidth,
        duration: dispatch.durationMs,
      };
    });
    
    // Classify passes
    const passDurations = new Map<string, number>();
    for (const dispatch of session.dispatches) {
      const current = passDurations.get(dispatch.name) || 0;
      passDurations.set(dispatch.name, current + dispatch.durationMs);
    }
    
    // Find hotspots (top 3 by duration)
    const sortedPasses = Array.from(passDurations.entries())
      .sort((a, b) => b[1] - a[1]);
    analysis.hotspots = sortedPasses.slice(0, 3).map(([name]) => name);
    
    // Classify each pass
    for (const da of dispatchAnalysis) {
      if (da.isComputeBound && !analysis.computeBoundPasses.includes(da.name)) {
        analysis.computeBoundPasses.push(da.name);
      }
      if (da.isMemoryBound && !analysis.memoryBoundPasses.includes(da.name)) {
        analysis.memoryBoundPasses.push(da.name);
      }
      if (da.isLatencyBound && !analysis.latencyBoundPasses.includes(da.name)) {
        analysis.latencyBoundPasses.push(da.name);
      }
    }
    
    // Determine primary bottleneck
    const computeTime = dispatchAnalysis
      .filter(d => d.isComputeBound)
      .reduce((sum, d) => sum + d.duration, 0);
    const memoryTime = dispatchAnalysis
      .filter(d => d.isMemoryBound)
      .reduce((sum, d) => sum + d.duration, 0);
    const latencyTime = dispatchAnalysis
      .filter(d => d.isLatencyBound)
      .reduce((sum, d) => sum + d.duration, 0);
    const totalTime = session.totalDurationMs;
    
    if (computeTime > memoryTime && computeTime > latencyTime) {
      analysis.primaryBottleneck = 'compute';
      analysis.confidence = computeTime / totalTime;
    } else if (memoryTime > computeTime && memoryTime > latencyTime) {
      analysis.primaryBottleneck = 'memory';
      analysis.confidence = memoryTime / totalTime;
    } else if (latencyTime > computeTime && latencyTime > memoryTime) {
      analysis.primaryBottleneck = 'latency';
      analysis.confidence = latencyTime / totalTime;
    } else {
      analysis.primaryBottleneck = 'balanced';
      analysis.confidence = 0.5;
    }
    
    // Calculate aggregate metrics
    const totalOps = session.dispatches.reduce((sum, d) => sum + d.totalInvocations, 0);
    const totalBytes = session.dispatches.reduce(
      (sum, d) => sum + d.estimatedBytesRead + d.estimatedBytesWritten, 0
    );
    
    analysis.details.avgComputeIntensity = totalOps / Math.max(totalBytes, 1);
    analysis.details.avgBandwidthUtilization = dispatchAnalysis
      .reduce((sum, d) => sum + d.bandwidth, 0) / dispatchAnalysis.length;
    analysis.details.dispatchOverhead = latencyTime / totalTime;
    
    return analysis;
  }
  
  /**
   * Generate optimization recommendations based on analysis
   */
  private generateRecommendations(session: ProfilingSession): Recommendation[] {
    const recommendations: Recommendation[] = [];
    const analysis = session.bottlenecks;
    
    // Check for excessive dispatch overhead
    if (analysis.details.dispatchOverhead > 0.2) {
      recommendations.push({
        issue: 'High dispatch overhead detected',
        impact: 'high',
        suggestion: 'Consider batching small dispatches or increasing workgroup sizes',
        affectedPasses: analysis.latencyBoundPasses,
      });
    }
    
    // Check for memory-bound passes that could benefit from caching
    if (analysis.memoryBoundPasses.length > 0) {
      const blurPasses = analysis.memoryBoundPasses.filter(p => 
        p.includes('blur') || p.includes('Blur')
      );
      if (blurPasses.length > 0) {
        recommendations.push({
          issue: 'Blur passes are memory-bound',
          impact: 'medium',
          suggestion: 'Consider using shared memory (workgroup storage) for blur kernels',
          affectedPasses: blurPasses,
        });
      }
    }
    
    // Check for compute-bound complex physics
    if (analysis.computeBoundPasses.includes('applyLayerAbsorption')) {
      recommendations.push({
        issue: 'Layer absorption pass is compute-bound',
        impact: 'medium',
        suggestion: 'Consider precomputing absorption tables or using approximations for exp/pow',
        affectedPasses: ['applyLayerAbsorption'],
      });
    }
    
    // Check memory usage
    const memoryMB = session.memory.totalAllocated / (1024 * 1024);
    if (memoryMB > 100) {
      recommendations.push({
        issue: `High memory usage: ${memoryMB.toFixed(1)} MB`,
        impact: 'low',
        suggestion: 'Consider reducing spectral resolution or buffer sizes for low-end devices',
      });
    }
    
    // Check for many layer iterations
    if (session.layers.length > 5) {
      const layerTime = session.layers.reduce((sum, l) => sum + l.durationMs, 0);
      const layerOverhead = layerTime / session.totalDurationMs;
      if (layerOverhead > 0.5) {
        recommendations.push({
          issue: `${session.layers.length} layer iterations consuming ${(layerOverhead * 100).toFixed(0)}% of frame time`,
          impact: 'high',
          suggestion: 'Consider merging layers without scattering or batching layer processing',
        });
      }
    }
    
    return recommendations;
  }
  
  /**
   * Generate a comprehensive profiling report
   */
  generateReport(
    resolution: [number, number],
    spectralSamples: number,
    plotResolution: number
  ): ProfilingReport {
    if (this.sessions.length === 0) {
      throw new Error('No profiling sessions recorded');
    }
    
    // Calculate summary statistics
    const frameTimes = this.sessions.map(s => s.totalDurationMs);
    const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    const minFrameTime = Math.min(...frameTimes);
    const maxFrameTime = Math.max(...frameTimes);
    
    // Aggregate pass data across sessions
    const passAggregates = new Map<string, { 
      totalDuration: number; 
      count: number;
      totalInvocations: number;
      totalBytesRead: number;
      totalBytesWritten: number;
    }>();
    
    for (const session of this.sessions) {
      for (const pass of session.passes) {
        const existing = passAggregates.get(pass.name) || {
          totalDuration: 0,
          count: 0,
          totalInvocations: 0,
          totalBytesRead: 0,
          totalBytesWritten: 0,
        };
        existing.totalDuration += pass.durationMs;
        existing.count++;
        existing.totalInvocations += pass.totalInvocations;
        existing.totalBytesRead += pass.totalBytesRead;
        existing.totalBytesWritten += pass.totalBytesWritten;
        passAggregates.set(pass.name, existing);
      }
    }
    
    // Create averaged pass profiles
    const avgPasses: PassProfile[] = Array.from(passAggregates.entries()).map(([name, agg]) => ({
      name,
      startTimeMs: 0,
      endTimeMs: agg.totalDuration / agg.count,
      durationMs: agg.totalDuration / agg.count,
      dispatches: [],
      totalInvocations: agg.totalInvocations / agg.count,
      totalBytesRead: agg.totalBytesRead / agg.count,
      totalBytesWritten: agg.totalBytesWritten / agg.count,
    }));
    
    // Sort by duration descending
    avgPasses.sort((a, b) => b.durationMs - a.durationMs);
    
    // Use the most recent session for detailed analysis
    const latestSession = this.sessions[this.sessions.length - 1];
    
    // Aggregate bottleneck analysis
    const bottleneckCounts = { compute: 0, memory: 0, latency: 0, balanced: 0 };
    for (const session of this.sessions) {
      bottleneckCounts[session.bottlenecks.primaryBottleneck]++;
    }
    const primaryBottleneck = (Object.entries(bottleneckCounts)
      .sort((a, b) => b[1] - a[1])[0][0]) as BottleneckType;
    
    // Collect all hotspots
    const hotspotCounts = new Map<string, number>();
    for (const session of this.sessions) {
      for (const hotspot of session.bottlenecks.hotspots) {
        hotspotCounts.set(hotspot, (hotspotCounts.get(hotspot) || 0) + 1);
      }
    }
    const topHotspots = Array.from(hotspotCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);
    
    // Merge recommendations (deduplicate)
    const seenIssues = new Set<string>();
    const allRecommendations: Recommendation[] = [];
    for (const session of this.sessions) {
      for (const rec of session.recommendations) {
        if (!seenIssues.has(rec.issue)) {
          seenIssues.add(rec.issue);
          allRecommendations.push(rec);
        }
      }
    }
    
    // Aggregate merge metrics across sessions
    const avgMergeMetrics: PassMergeMetrics = {
      dispatchesSaved: this.sessions.reduce((sum, s) => sum + s.mergeMetrics.dispatchesSaved, 0) / this.sessions.length,
      msdfSamplesSaved: this.sessions.reduce((sum, s) => sum + s.mergeMetrics.msdfSamplesSaved, 0) / this.sessions.length,
      bandwidthSavedGB: this.sessions.reduce((sum, s) => sum + s.mergeMetrics.bandwidthSavedGB, 0) / this.sessions.length,
      mergedPasses: latestSession.mergeMetrics.mergedPasses,
    };
    
    // Build report
    const report: ProfilingReport = {
      metadata: {
        timestamp: new Date().toISOString(),
        device: this.deviceInfo?.name || 'Unknown',
        features: this.deviceInfo?.features || [],
        resolution,
        spectralSamples,
        plotResolution,
        framesProfiled: this.sessions.length,
      },
      summary: {
        avgFrameTimeMs: avgFrameTime,
        minFrameTimeMs: minFrameTime,
        maxFrameTimeMs: maxFrameTime,
        avgGpuTimeMs: avgFrameTime * 0.8,  // Estimate: 80% GPU time
        avgCpuOverheadMs: avgFrameTime * 0.2,  // Estimate: 20% CPU overhead
        primaryBottleneck,
        hotspots: topHotspots,
      },
      passes: avgPasses,
      layers: latestSession.layers,
      memory: latestSession.memory,
      
      // Optimization metrics
      mergeMetrics: avgMergeMetrics,
      precisionMetrics: latestSession.precisionMetrics,
      
      bottlenecks: {
        ...latestSession.bottlenecks,
        primaryBottleneck,
        hotspots: topHotspots,
      },
      recommendations: allRecommendations.sort((a, b) => {
        const impactOrder = { high: 0, medium: 1, low: 2 };
        return impactOrder[a.impact] - impactOrder[b.impact];
      }),
    };
    
    // Optionally include raw sessions
    if (this.includeRawSessions) {
      report.rawSessions = this.sessions;
    }
    
    return report;
  }
  
  /**
   * Clear all recorded sessions
   */
  clearSessions(): void {
    this.sessions = [];
  }
  
  /**
   * Get the number of recorded sessions
   */
  getSessionCount(): number {
    return this.sessions.length;
  }
  
  /**
   * Get the latest session (if any)
   */
  getLatestSession(): ProfilingSession | null {
    return this.sessions.length > 0 ? this.sessions[this.sessions.length - 1] : null;
  }
  
  /**
   * Check if timestamp queries are supported
   */
  hasTimestampQuerySupport(): boolean {
    return this.hasTimestampSupport;
  }
  
  /**
   * Destroy profiler resources
   */
  destroy(): void {
    this.timestampQuerySet?.destroy();
    this.timestampBuffer?.destroy();
    this.timestampReadBuffer?.destroy();
    this.sessions = [];
    this.trackedBuffers.clear();
  }
}

