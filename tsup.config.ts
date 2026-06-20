import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'react/index': 'src/react/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  treeshake: true,
  sourcemap: true,
  // Self-contained entries so scripts/postbuild.mjs can prepend "use client"
  // to a stable React bundle (code splitting would hoist core into a shared
  // chunk and complicate the directive placement).
  splitting: false,
  // Keep React out of the bundle; it's a peer dependency.
  external: ['react', 'react-dom'],
});
