import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
    },
    coverage: {
      provider: 'v8',
      include: [
        'src/db/utils.ts',
        'src/core/event-bus.ts',
        'src/core/session.ts',
        'src/core/skill-runner.ts',
        'src/core/provider-service.ts',
        'src/api/index.ts',
        'src/middleware.ts',
        'src/plugin/loader.ts',
      ],
      exclude: ['src/tests/**', 'src/**/*.d.ts'],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 75,
        lines: 80,
      },
    },
  },
});
