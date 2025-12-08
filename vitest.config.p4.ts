import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for Phaser 4 implementation tests
 */
export default defineConfig({
  test: {
    include: ['src-p4/tests/**/*.test.ts'],
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src-p4/core/**/*.ts'],
      exclude: ['src-p4/core/**/*.test.ts'],
    },
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
});



