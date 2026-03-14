import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'node18',
    splitting: false,
    treeshake: true,
    external: ['express'],
  },
  {
    entry: ['src/bin.ts'],
    format: ['esm'],
    dts: false,
    sourcemap: false,
    clean: false,
    target: 'node18',
    banner: { js: '#!/usr/bin/env node' },
  },
]);
