import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for tests
 */
export default defineConfig({
  test: {
    include: ['src/tests/**/*.test.ts'],
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      exclude: ['src/core/**/*.test.ts'],
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
