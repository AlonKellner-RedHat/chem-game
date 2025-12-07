import { defineConfig } from 'vite';

/**
 * Vite configuration for Phaser 4 + WebGPU implementation
 * 
 * This config builds the src-p4/ directory as a separate application
 * that can run alongside the Phaser 3 version during migration.
 */
export default defineConfig({
  root: 'src-p4',
  base: './',
  build: {
    outDir: '../dist-p4',
    emptyOutDir: true,
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@': '/src-p4',
      '@core': '/src-p4/core',
      '@scenes': '/src-p4/scenes',
      '@physics': '/src-p4/core/physics',
      '@rendering': '/src-p4/core/rendering',
      '@ui': '/src-p4/core/ui',
    },
  },
  server: {
    port: 5174, // Different port from Phaser 3 version (5173)
  },
  assetsInclude: ['**/*.wgsl'],
  optimizeDeps: {
    // Phaser 4 will be added here once installed
  },
});

