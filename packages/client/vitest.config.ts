import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/utils.ts', 'src/api.ts', 'src/store.ts', 'src/component-loader.ts', 'src/animation-manager.ts', 'src/download-manager.ts', 'src/sequence-executor.ts'],
      exclude: ['src/tests/**', 'src/**/*.d.ts'],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80
      }
    }
  }
});
