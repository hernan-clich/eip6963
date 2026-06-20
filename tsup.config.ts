import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    index: "src/index.ts",
    "react/index": "src/react/index.ts",
  },
  // Keep React out of the bundle; it's a peer dependency.
  external: ["react", "react-dom"],
  format: ["esm", "cjs"],
  sourcemap: true,
  // Self-contained entries so scripts/postbuild.mjs can prepend "use client"
  // to a stable React bundle (code splitting would hoist core into a shared
  // chunk and complicate the directive placement).
  splitting: false,
  treeshake: true,
});
