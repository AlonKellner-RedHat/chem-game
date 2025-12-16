// SpectralCompute - Main WESL Module (Unified Entry Point)
//
// This module aggregates all entry points into a single shader.
// WESL static build includes all imported items.

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
