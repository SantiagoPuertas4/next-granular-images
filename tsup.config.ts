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
    outDir: 'dist/cli',
    banner: {
      js: '#!/usr/bin/env node',
    },
  }
]);
