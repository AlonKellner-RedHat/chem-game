import { defineConfig } from 'vitest/config';
import { linkBuildExtension, staticBuildExtension } from 'wesl-plugin';
import weslPlugin from 'wesl-plugin/vite';

/**
 * Vitest configuration for tests
 *
 * WGSL/WESL shader tests use wesl-test which requires WebGPU.
 * Non-WGSL tests use jsdom environment.
 */
export default defineConfig({
  plugins: [
    weslPlugin({
      extensions: [staticBuildExtension, linkBuildExtension],
      weslToml: 'src/core/rendering/wesl.toml',
    }),
  ],
  test: {
    include: ['src/tests/**/*.test.ts'],
    // Note: tests/ directory contains legacy tests that reference non-existent modules
    // They need to be updated or removed before being re-enabled
    // Use jsdom by default, WGSL tests will use node environment
    environment: 'jsdom',
    globals: true,
    // Increase timeout for GPU tests
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      exclude: ['src/core/**/*.test.ts'],
    },
    // Pool configuration for GPU tests
    poolOptions: {
      threads: {
        singleThread: true, // GPU tests need single thread
      },
    },
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
});
