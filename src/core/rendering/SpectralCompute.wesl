// SpectralCompute - Main WESL Module (Unified Entry Point)
//
// This module aggregates all entry points into a single shader.
// The _forceInclude function references all entry points to prevent tree-shaking.

import package::wgsl::entry::main::{main, integrateSpectrum};
import package::wgsl::entry::spectrum::{computeSpectrumBox, averageSpectrum, finalCombine};
import package::wgsl::entry::blur_passes::{blurHorizontal, blurVertical, blurTransmittedH, blurTransmittedV};
import package::wgsl::entry::combine::{
  initBackgroundSpectrum,
  applyLayerAbsorption,
  combineScattered,
  applyAmbientLight,
  processLayerTransition,
  processLayerTransitionFast,
  processLayerTransitionVec4
};

// This function is never called but prevents WESL from tree-shaking the entry points.
// It creates references to all entry point functions.
fn _forceIncludeAllEntryPoints() {
  // Reference all entry points by "calling" them in dead code
  // The WESL linker sees these references and includes the functions
  if (false) {
    main(vec3<u32>(0u, 0u, 0u));
    integrateSpectrum(vec3<u32>(0u, 0u, 0u));
    computeSpectrumBox(vec3<u32>(0u, 0u, 0u));
    averageSpectrum(vec3<u32>(0u, 0u, 0u));
    finalCombine(vec3<u32>(0u, 0u, 0u));
    blurHorizontal(vec3<u32>(0u, 0u, 0u));
    blurVertical(vec3<u32>(0u, 0u, 0u));
    blurTransmittedH(vec3<u32>(0u, 0u, 0u));
    blurTransmittedV(vec3<u32>(0u, 0u, 0u));
    initBackgroundSpectrum(vec3<u32>(0u, 0u, 0u));
    applyLayerAbsorption(vec3<u32>(0u, 0u, 0u));
    combineScattered(vec3<u32>(0u, 0u, 0u));
    applyAmbientLight(vec3<u32>(0u, 0u, 0u));
    processLayerTransition(vec3<u32>(0u, 0u, 0u));
    processLayerTransitionFast(vec3<u32>(0u, 0u, 0u));
    processLayerTransitionVec4(vec3<u32>(0u, 0u, 0u));
  }
}
