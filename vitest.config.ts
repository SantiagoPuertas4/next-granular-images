import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    restoreMocks: true,
    unstubEnvs: true,
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/cli/index.ts', 'src/types/**'],
      reporter: ['text-summary', 'text', 'lcov'],
      thresholds: {
        'src/cli/core/**': { lines: 85, statements: 85, branches: 80, functions: 85 },
        'src/cli/utils/**': { lines: 85, statements: 85, branches: 80, functions: 85 },
        'src/client/**': { lines: 85, statements: 85, branches: 80, functions: 85 },
        'src/cli/commands/**': { lines: 70 },
      },
    },
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node' },
      },
      {
        extends: true,
        test: {
          name: 'pipeline',
          include: ['tests/pipeline/**/*.test.ts'],
          environment: 'node',
          pool: 'forks',
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'typegen',
          include: ['tests/typegen/**/*.test.ts'],
          environment: 'node',
          pool: 'forks',
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'cli',
          include: ['tests/cli/**/*.test.ts'],
          environment: 'node',
          pool: 'forks',
          globalSetup: ['tests/cli/build.ts'],
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'react',
          include: ['tests/react/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['tests/react/setup.ts'],
        },
      },
    ],
  },
});
