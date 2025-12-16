/**
 * GPU Profiler Tests
 *
 * Tests the profiling infrastructure for SpectralCompute.
 * Note: Full GPU tests require a WebGPU context which isn't available in jsdom.
 * These tests verify the profiler logic and data structures.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type BottleneckType,
  GPUProfiler,
  type ProfilingReport,
} from '../../core/rendering/GPUProfiler';

// Mock GPUDevice for testing without actual WebGPU
const createMockDevice = (): GPUDevice => {
  const features = new Set<string>();

  return {
    features,
    createQuerySet: vi.fn(() => ({
      destroy: vi.fn(),
    })),
    createBuffer: vi.fn(() => ({
      size: 1024,
      destroy: vi.fn(),
      mapAsync: vi.fn(),
      getMappedRange: vi.fn(() => new ArrayBuffer(1024)),
      unmap: vi.fn(),
    })),
    queue: {
      submit: vi.fn(),
      writeBuffer: vi.fn(),
      writeTexture: vi.fn(),
      onSubmittedWorkDone: vi.fn(() => Promise.resolve()),
    },
  } as unknown as GPUDevice;
};

describe('GPUProfiler', () => {
  let mockDevice: GPUDevice;
  let profiler: GPUProfiler;

  beforeEach(() => {
    mockDevice = createMockDevice();
    profiler = new GPUProfiler(mockDevice);
  });

  describe('initialization', () => {
    it('should create profiler with device', () => {
      expect(profiler).toBeInstanceOf(GPUProfiler);
    });

    it('should be enabled by default', () => {
      expect(profiler.isEnabled()).toBe(true);
    });

    it('should detect timestamp query support', () => {
      // Mock device without timestamp-query
      expect(profiler.hasTimestampQuerySupport()).toBe(false);

      // Mock device with timestamp-query
      // Note: In jsdom, GPUBufferUsage is not defined, so timestamp query init will fail
      // even if the feature is present. This is expected in the test environment.
      const deviceWithTimestamp = createMockDevice();
      (deviceWithTimestamp.features as Set<string>).add('timestamp-query');
      const profilerWithTimestamp = new GPUProfiler(deviceWithTimestamp);
      // In jsdom, timestamp init fails due to missing GPUBufferUsage, so this will be false
      // In a real WebGPU environment, this would be true
      expect(profilerWithTimestamp.hasTimestampQuerySupport()).toBe(false);
    });

    it('should toggle enabled state', () => {
      profiler.setEnabled(false);
      expect(profiler.isEnabled()).toBe(false);

      profiler.setEnabled(true);
      expect(profiler.isEnabled()).toBe(true);
    });
  });

  describe('session management', () => {
    it('should start and end a session', () => {
      expect(profiler.getSessionCount()).toBe(0);

      profiler.startSession(0);
      profiler.endSession();

      expect(profiler.getSessionCount()).toBe(1);
    });

    it('should track multiple sessions', () => {
      for (let i = 0; i < 5; i++) {
        profiler.startSession(i);
        profiler.endSession();
      }

      expect(profiler.getSessionCount()).toBe(5);
    });

    it('should get the latest session', () => {
      profiler.startSession(42);
      profiler.endSession();

      const session = profiler.getLatestSession();
      expect(session).not.toBeNull();
      expect(session!.frameId).toBe(42);
    });

    it('should clear sessions', () => {
      profiler.startSession(0);
      profiler.endSession();
      profiler.startSession(1);
      profiler.endSession();

      expect(profiler.getSessionCount()).toBe(2);
      profiler.clearSessions();
      expect(profiler.getSessionCount()).toBe(0);
    });
  });

  describe('dispatch tracking', () => {
    it('should track dispatches within a session', () => {
      profiler.startSession(0);

      profiler.beginDispatch('testDispatch', 'testEntryPoint');
      profiler.endDispatch([10, 10, 1], [8, 8, 1], 1000, 2000);

      profiler.endSession();

      const session = profiler.getLatestSession();
      expect(session!.dispatches).toHaveLength(1);
      expect(session!.dispatches[0].name).toBe('testDispatch');
      expect(session!.dispatches[0].entryPoint).toBe('testEntryPoint');
      expect(session!.dispatches[0].totalInvocations).toBe(10 * 10 * 1 * 8 * 8 * 1);
    });

    it('should calculate bandwidth for dispatches', () => {
      profiler.startSession(0);

      profiler.beginDispatch('bandwidth_test', 'entry');
      // Simulate some time passing (in a real scenario, this would be actual compute time)
      profiler.endDispatch([100, 100, 1], [8, 8, 1], 1000000, 1000000);

      profiler.endSession();

      const dispatch = profiler.getLatestSession()!.dispatches[0];
      // Bandwidth is calculated only if duration > 0.001ms
      // In a fast test environment, duration may be too short, so we check either:
      // - bandwidth is defined (duration was long enough), or
      // - duration is very short (< 0.001ms) which explains why no bandwidth
      if (dispatch.durationMs > 0.001) {
        expect(dispatch.estimatedBandwidthGBs).toBeDefined();
        expect(dispatch.estimatedBandwidthGBs).toBeGreaterThan(0);
      } else {
        // Duration too short to calculate meaningful bandwidth
        expect(dispatch.estimatedBandwidthGBs).toBeUndefined();
      }
      // Always verify the byte estimates were recorded
      expect(dispatch.estimatedBytesRead).toBe(1000000);
      expect(dispatch.estimatedBytesWritten).toBe(1000000);
    });
  });

  describe('pass tracking', () => {
    it('should group dispatches into passes', () => {
      profiler.startSession(0);

      profiler.beginPass('renderPass');
      profiler.beginDispatch('dispatch1', 'entry1');
      profiler.endDispatch([10, 10, 1], [8, 8, 1], 100, 100);
      profiler.beginDispatch('dispatch2', 'entry2');
      profiler.endDispatch([10, 10, 1], [8, 8, 1], 200, 200);
      profiler.endPass();

      profiler.endSession();

      const session = profiler.getLatestSession();
      expect(session!.passes).toHaveLength(1);
      expect(session!.passes[0].name).toBe('renderPass');
      expect(session!.passes[0].dispatches).toHaveLength(2);
      expect(session!.passes[0].totalBytesRead).toBe(300);
      expect(session!.passes[0].totalBytesWritten).toBe(300);
    });
  });

  describe('layer tracking', () => {
    it('should track layer iterations', () => {
      profiler.startSession(0);

      profiler.beginLayer(0, 3, true, 0.5);
      profiler.beginDispatch('absorption', 'applyLayerAbsorption', { layer: 0 });
      profiler.endDispatch([10, 10, 1], [8, 8, 1], 100, 100);
      profiler.endLayer();

      profiler.beginLayer(1, 2, false, 0);
      profiler.beginDispatch('absorption', 'applyLayerAbsorption', { layer: 1 });
      profiler.endDispatch([10, 10, 1], [8, 8, 1], 100, 100);
      profiler.endLayer();

      profiler.endSession();

      const session = profiler.getLatestSession();
      expect(session!.layers).toHaveLength(2);
      expect(session!.layers[0].layerIndex).toBe(0);
      expect(session!.layers[0].shapeCount).toBe(3);
      expect(session!.layers[0].hasScattering).toBe(true);
      expect(session!.layers[1].hasScattering).toBe(false);
    });
  });

  describe('buffer tracking', () => {
    it('should track buffer allocations', () => {
      const mockBuffer = {
        size: 1024 * 1024,
        destroy: vi.fn(),
      } as unknown as GPUBuffer;

      profiler.trackBuffer(mockBuffer, 'testBuffer', 'storage', 'f32');

      profiler.startSession(0);
      profiler.endSession();

      const session = profiler.getLatestSession();
      expect(session!.memory.buffers).toHaveLength(1);
      expect(session!.memory.buffers[0].name).toBe('testBuffer');
      expect(session!.memory.buffers[0].size).toBe(1024 * 1024);
      expect(session!.memory.totalAllocated).toBe(1024 * 1024);
    });

    it('should untrack destroyed buffers', () => {
      const mockBuffer = {
        size: 1024,
        destroy: vi.fn(),
      } as unknown as GPUBuffer;

      profiler.trackBuffer(mockBuffer, 'testBuffer', 'storage');
      profiler.untrackBuffer(mockBuffer);

      profiler.startSession(0);
      profiler.endSession();

      const session = profiler.getLatestSession();
      expect(session!.memory.buffers).toHaveLength(0);
    });
  });

  describe('bottleneck analysis', () => {
    it('should analyze compute-bound dispatches', () => {
      profiler.startSession(0);

      // Simulate a compute-heavy dispatch (high ops/byte, long duration)
      profiler.beginDispatch('computeHeavy', 'entry');
      // Small bytes, many invocations, longish duration
      profiler.endDispatch([100, 100, 1], [8, 8, 1], 100, 100);

      profiler.endSession();

      const session = profiler.getLatestSession();
      // With many invocations (640000) and few bytes (200), ops/byte is high
      // This should be classified as compute-bound
      expect(session!.bottlenecks.primaryBottleneck).toBeDefined();
    });

    it('should identify hotspots', () => {
      profiler.startSession(0);

      // Create multiple dispatches with varying durations
      profiler.beginDispatch('slow', 'entry');
      profiler.endDispatch([100, 100, 1], [8, 8, 1], 1000, 1000);

      profiler.beginDispatch('fast', 'entry');
      profiler.endDispatch([10, 10, 1], [8, 8, 1], 100, 100);

      profiler.endSession();

      const session = profiler.getLatestSession();
      expect(session!.bottlenecks.hotspots.length).toBeGreaterThan(0);
    });
  });

  describe('report generation', () => {
    it('should generate a complete report', () => {
      // Record multiple sessions
      for (let i = 0; i < 3; i++) {
        profiler.startSession(i);

        profiler.beginPass('testPass');
        profiler.beginDispatch('testDispatch', 'testEntry');
        profiler.endDispatch([10, 10, 1], [8, 8, 1], 1000, 1000);
        profiler.endPass();

        profiler.endSession();
      }

      const report = profiler.generateReport([800, 600], 16, 4500);

      // Check metadata
      expect(report.metadata.resolution).toEqual([800, 600]);
      expect(report.metadata.spectralSamples).toBe(16);
      expect(report.metadata.plotResolution).toBe(4500);
      expect(report.metadata.framesProfiled).toBe(3);

      // Check summary
      expect(report.summary.avgFrameTimeMs).toBeGreaterThan(0);
      expect(report.summary.minFrameTimeMs).toBeGreaterThan(0);
      expect(report.summary.maxFrameTimeMs).toBeGreaterThan(0);
      expect(report.summary.primaryBottleneck).toBeDefined();

      // Check passes
      expect(report.passes.length).toBeGreaterThan(0);

      // Check bottlenecks
      expect(report.bottlenecks).toBeDefined();
      expect(['compute', 'memory', 'latency', 'balanced']).toContain(
        report.bottlenecks.primaryBottleneck
      );
    });

    it('should throw when no sessions recorded', () => {
      expect(() => profiler.generateReport([800, 600], 16, 4500)).toThrow(
        'No profiling sessions recorded'
      );
    });

    it('should include raw sessions when enabled', () => {
      profiler.setIncludeRawSessions(true);

      profiler.startSession(0);
      profiler.endSession();

      const report = profiler.generateReport([800, 600], 16, 4500);
      expect(report.rawSessions).toBeDefined();
      expect(report.rawSessions!.length).toBe(1);
    });
  });

  describe('recommendations', () => {
    it('should generate recommendations for high memory usage', () => {
      // Track a large buffer
      const largeBuffer = {
        size: 200 * 1024 * 1024, // 200 MB
        destroy: vi.fn(),
      } as unknown as GPUBuffer;

      profiler.trackBuffer(largeBuffer, 'largeBuffer', 'storage');

      profiler.startSession(0);
      profiler.endSession();

      const session = profiler.getLatestSession();
      const memoryRec = session!.recommendations.find((r) => r.issue.includes('memory'));
      expect(memoryRec).toBeDefined();
    });

    it('should generate recommendations for many layers', () => {
      profiler.startSession(0);

      // Simulate 6+ layers
      for (let i = 0; i < 7; i++) {
        profiler.beginLayer(i, 1, false, 0);
        profiler.beginDispatch('absorption', 'entry', { layer: i });
        profiler.endDispatch([10, 10, 1], [8, 8, 1], 100, 100);
        profiler.endLayer();
      }

      profiler.endSession();

      const session = profiler.getLatestSession();
      const layerRec = session!.recommendations.find((r) => r.issue.includes('layer'));
      expect(layerRec).toBeDefined();
    });
  });

  describe('disabled profiling', () => {
    it('should not record when disabled', () => {
      profiler.setEnabled(false);

      profiler.startSession(0);
      profiler.beginDispatch('test', 'entry');
      profiler.endDispatch([10, 10, 1], [8, 8, 1], 100, 100);
      profiler.endSession();

      expect(profiler.getSessionCount()).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('should destroy resources', () => {
      profiler.startSession(0);
      profiler.endSession();

      // Should not throw
      expect(() => profiler.destroy()).not.toThrow();

      // Sessions should be cleared
      expect(profiler.getSessionCount()).toBe(0);
    });
  });
});

describe('ProfilingReport structure', () => {
  it('should have correct type structure', () => {
    // Type-level test to ensure our interfaces are correct
    const mockReport: ProfilingReport = {
      metadata: {
        timestamp: new Date().toISOString(),
        device: 'Test GPU',
        features: ['timestamp-query'],
        resolution: [800, 600],
        spectralSamples: 16,
        plotResolution: 4500,
        framesProfiled: 10,
      },
      summary: {
        avgFrameTimeMs: 16.67,
        minFrameTimeMs: 14.0,
        maxFrameTimeMs: 20.0,
        avgGpuTimeMs: 12.0,
        avgCpuOverheadMs: 4.0,
        primaryBottleneck: 'compute' as BottleneckType,
        hotspots: ['applyLayerAbsorption', 'blurHorizontal'],
      },
      passes: [],
      layers: [],
      memory: {
        totalAllocated: 50 * 1024 * 1024,
        buffers: [],
        peakUsage: 60 * 1024 * 1024,
      },
      bottlenecks: {
        primaryBottleneck: 'compute',
        confidence: 0.85,
        hotspots: ['applyLayerAbsorption'],
        computeBoundPasses: ['applyLayerAbsorption'],
        memoryBoundPasses: ['blurHorizontal'],
        latencyBoundPasses: [],
        details: {
          avgComputeIntensity: 15.0,
          avgBandwidthUtilization: 80.0,
          dispatchOverhead: 0.1,
          asyncWaitTime: 0.05,
        },
      },
      recommendations: [
        {
          issue: 'Layer absorption pass is compute-bound',
          impact: 'medium',
          suggestion: 'Consider precomputing absorption tables',
          affectedPasses: ['applyLayerAbsorption'],
        },
      ],
    };

    expect(mockReport.metadata.framesProfiled).toBe(10);
    expect(mockReport.summary.primaryBottleneck).toBe('compute');
    expect(mockReport.recommendations).toHaveLength(1);
  });
});
