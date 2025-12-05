import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    poolOptions: {
      forks: {
        minForks: 1,
        maxForks: 7,
      },
    },
    maxConcurrency: 5,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/test-utils/**',
        '**/mocks/**',
        '**/*.test.ts',
        '**/*.spec.ts',
      ],
      thresholds: {
        global: {
          branches: 95,
          functions: 95,
          lines: 95,
          statements: 95,
        },
      },
    },
    mockReset: true,
    clearMocks: true,
    restoreMocks: true,
    testTimeout: 10000,
    setupFiles: ['./src/test-utils/setup.ts'],
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
