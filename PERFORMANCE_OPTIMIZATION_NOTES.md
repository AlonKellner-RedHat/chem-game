# Performance Optimization Notes

## Current Status (After Downsampling Optimization)

**Profile Results:**
- Pass 2 (RGB Conversion): ~2563ms average (85.9% of total) - **6% improvement**
- Pass 1 (Spectrum Calculation): ~1096ms average (36.7% of total)
- Total: ~3-4 seconds per frame

**Downsampling Impact:**
- Reduced spectrum from 5000 points → 200 points (96% reduction)
- Only 6% improvement in Pass 2 time
- **Root cause**: Still doing per-pixel CIE conversions (100k+ pixels = 100k+ conversions)

## Analysis

The downsampling optimization helps reduce the inner loop (5000 → 200 iterations), but the real bottleneck is the **number of pixels** being processed, not the spectrum resolution.

**Math:**
- Before: 100k pixels × 5000 spectrum points = 500M operations
- After: 100k pixels × 200 spectrum points = 20M operations
- **25x reduction in operations, but only 6% time improvement**

This suggests:
1. The CIE conversion overhead (function calls, lookups) dominates
2. Memory access patterns may be inefficient
3. JavaScript function call overhead is significant

## Next Optimization Strategies

### Priority 1: Fix GPU Rendering (Best Solution)
**Expected Impact**: 95%+ performance improvement (3-4s → <50ms)
**Status**: GPU path shows 1-6ms but falls back to CPU
**Action**: Check browser console for `[GPU]` error messages

### Priority 2: Further Reduce Spectrum Resolution
**Current**: 200 points
**Proposed**: 100 points (or even 50 for very fast conversion)
**Expected Impact**: Additional 20-30% improvement in Pass 2
**Trade-off**: Slight color accuracy loss (may be acceptable)

### Priority 3: Cache CIE Conversions
**Idea**: Hash spectrum → cache XYZ/RGB result
**Expected Impact**: 50-80% improvement if many pixels share similar spectra
**Challenge**: Spectrum objects need consistent hashing

### Priority 4: Batch Processing
**Idea**: Process multiple pixels in parallel using Web Workers
**Expected Impact**: 2-4x improvement (limited by CPU cores)
**Complexity**: High (requires refactoring)

### Priority 5: Optimize CIE Lookup Functions
**Idea**: Pre-compute lookup tables, reduce function call overhead
**Expected Impact**: 10-20% improvement
**Complexity**: Medium

## Immediate Next Steps

1. **Check GPU Errors**: Look for `[GPU]` messages in browser console
2. **Reduce Target Points**: Try 100 or 50 points instead of 200
3. **Profile CIE Functions**: Add timing to `getX()`, `getY()`, `getZ()`, `getIlluminant()`
4. **Consider Caching**: If many pixels have identical spectra, cache results

## GPU Error Investigation

When running the app, check browser console for:
- `[GPU] Initializing GPUPixelRenderer...`
- `[GPU] GPU renderer initialized successfully` OR error messages
- `[GPU] Shader compilation failed` (if shaders fail)
- `[GPU] GPU rendering failed` (if rendering fails)

If GPU is failing, the error messages will tell us why (shader compilation, framebuffer issues, WebGL context problems, etc.)

