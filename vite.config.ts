import { defineConfig } from 'vite';

/**
 * Vite configuration for Phaser 4 + WebGPU implementation
 */
export default defineConfig({
  root: 'src',
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@': '/src',
      '@core': '/src/core',
      '@scenes': '/src/scenes',
      '@physics': '/src/core/physics',
      '@rendering': '/src/core/rendering',
      '@ui': '/src/core/ui',
    },
  },
  server: {
    port: 5174,
  },
  assetsInclude: ['**/*.wgsl'],
  optimizeDeps: {
    // Phaser 4 will be added here once installed
  },
});
