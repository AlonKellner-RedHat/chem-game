# Performance Analysis - Rendering Bottlenecks

## Profile Summary (from performance-profile.json)

**Total Render Time**: ~3-4 seconds per frame (unacceptable for real-time)

### Breakdown:
- **Pass 2 (RGB Conversion)**: ~2725ms average (91.6% of total) - **CRITICAL BOTTLENECK**
- **Pass 1 (Spectrum Calculation)**: ~939ms average (31.6% of total) - Significant
- **Pass 3 (Normalization)**: ~15ms average (0.5%) - Fast ✓
- **Pixel Drawing**: ~37ms average (1.2%) - Fast ✓

## Root Cause Analysis

### Pass 2 Bottleneck (91.6% of time)
**Location**: `PixelLayerRenderer.render()` → Pass 2 loop

**What it does**:
```typescript
for (const { x, y } of pixelsToProcess) {
  // ... scattering filters ...

  // Convert spectrum to RGB - EXPENSIVE!
  const xyz = CIE.spectrumToXYZ(spectrum, illuminant);  // ~1-2ms per pixel
  const rgb = CIE.xyzToSRGB(xyz);                       // ~0.1ms per pixel
}
```

**Why it's slow**:
1. `CIE.spectrumToXYZ()` loops through entire spectrum (5000 points at full resolution)
2. For each spectrum point, performs:
   - `getIlluminant()` lookup
   - `getX()`, `getY()`, `getZ()` lookups with interpolation
   - Trapezoidal integration calculations
3. Called for **every pixel** (potentially 100k+ pixels at 1:1 resolution)

**Estimated cost**: ~1-2ms per pixel × 100k pixels = 100-200 seconds (but we see ~3s, so likely using larger pixel size)

### Pass 1 Bottleneck (31.6% of time)
**Location**: `PixelLayerRenderer.render()` → Pass 1 loop

**What it does**:
- Calculates spectrum for each pixel by applying filters
- Stores spectra in buffer

**Why it's slow**:
- Filter applications involve material calculations
- Multiple layers per pixel
- Anti-aliasing edge detection

## GPU Rendering Status

**Observation**: GPU path shows 1-5ms (very fast!) but then falls back to CPU.

**Likely causes**:
1. GPU renderer returning `null` (error caught and logged)
2. Canvas context issues
3. Shader compilation/linking failures
4. Framebuffer issues

**Check browser console** for:
- `"GPU rendering failed, falling back to CPU:"` errors
- `"GPU render returned null or invalid result"` warnings
- WebGL errors

## Optimization Strategies

### Priority 1: Fix GPU Rendering (Best Solution)
**Impact**: Would eliminate 95%+ of CPU rendering time
**Effort**: Medium
**Steps**:
1. Debug why GPU renderer returns null
2. Check WebGL context and shader compilation
3. Verify framebuffer setup
4. Test on macOS M4 (may have WebGL compatibility issues)

### Priority 2: Optimize CIE Conversions (If GPU can't be fixed)
**Impact**: Could reduce Pass 2 time by 50-80%
**Effort**: Medium-High

**Options**:
1. **Reduce spectrum resolution for RGB conversion**
   - Use full resolution (5000 points) for spectral distribution plot
   - Use lower resolution (100-200 points) for RGB conversion
   - Most color information is in visible range (380-700nm)

2. **Cache CIE conversion results**
   - Hash spectrum → cache XYZ/RGB
   - Works if many pixels have similar spectra
   - May not help if spectra are unique per pixel

3. **Pre-compute CIE lookup tables**
   - Pre-compute illuminant × CIE function products
   - Reduce per-pixel calculations

4. **Vectorize/batch CIE conversions**
   - Process multiple pixels at once
   - Reduce function call overhead

### Priority 3: Optimize Pass 1 (Spectrum Calculation)
**Impact**: Could reduce Pass 1 time by 20-40%
**Effort**: Medium

**Options**:
1. Cache filter results for identical properties
2. Optimize material calculations
3. Reduce redundant spectrum copies

### Priority 4: Increase CPU Pixel Size (Temporary Workaround)
**Impact**: Reduces pixel count, but degrades quality
**Effort**: Low
**Current**: Adaptive (1:1 for small screens, larger for big screens)
**Note**: Already implemented, but may need tuning

## Recommended Action Plan

1. **Immediate**: Check browser console for GPU errors
2. **Short-term**: Fix GPU rendering issues
3. **If GPU can't be fixed**: Implement spectrum resolution reduction for RGB conversion
4. **Long-term**: Consider WebGPU for better performance

## Expected Performance After Fixes

- **GPU rendering**: <50ms per frame (60 FPS achievable)
- **Optimized CPU**: 200-500ms per frame (2-5 FPS, acceptable for non-real-time)
- **Current CPU**: 3000-4000ms per frame (0.25 FPS, unacceptable)
