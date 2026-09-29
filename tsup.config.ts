import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/client/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    clean: true,
    external: ['react', 'next'],
    outDir: 'dist/client',
    banner: {
      js: '"use client";',
    },
  },
  {
    entry: ['src/cli/index.ts'],
    format: ['cjs', 'esm'],
    dts: false,
    clean: false,
    platform: 'node',
    target: 'node20',
    // __filename/__dirname/import.meta.url work in both the CJS and ESM builds.
    shims: true,
    // p-queue is ESM-only: bundle it so the CommonJS CLI never has to
    // require() an ES module.
    noExternal: ['p-queue', 'p-timeout', 'eventemitter3'],
    outDir: 'dist/cli',
    banner: {
      js: '#!/usr/bin/env node',
    },
  }
]);
