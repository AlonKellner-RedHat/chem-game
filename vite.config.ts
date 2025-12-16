import { defineConfig } from 'vite';
import weslPlugin from 'wesl-plugin/vite';
import { staticBuildExtension, linkBuildExtension } from 'wesl-plugin';

/**
 * Vite configuration for Phaser 4 + WebGPU implementation
 * 
 * WESL Plugin Extensions:
 * - staticExtension: Build-time linking for production (import with ?static)
 * - linkBuildExtension: Runtime linking for development (import with ?link)
 */
export default defineConfig({
  root: 'src',
  base: './',
  plugins: [
    weslPlugin({
      extensions: [staticBuildExtension, linkBuildExtension],
    }),
  ],
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
  assetsInclude: ['**/*.wgsl', '**/*.wesl'],
  optimizeDeps: {
    // Phaser 4 will be added here once installed
  },
});
