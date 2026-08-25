import { defineConfig } from "vite";

// The homepage's Apollo layer, built separately from the model explorer.
//
// Both entries use three, and putting them in one build is the obvious
// thing to do — Rollup notices the shared dependency and hoists three into
// a chunk both entries import. The measurement says not to:
//
//   one build, shared chunk   apollo 20.7 kB + three chunk 684 kB
//                             = 705 kB minified, 185 kB gzipped, 2 requests
//   separate builds           apollo 485 kB
//                             = 485 kB minified, 125 kB gzipped, 1 request
//
// The shared chunk is the union of what both entries need, and the model
// explorer needs far more of three than this does — React Three Fiber and
// drei reach into loaders, controls and helpers the Apollo layer never
// touches. Hoisting therefore hands the homepage 60 kB of compressed
// JavaScript for code it will not run, plus a second round trip, in
// exchange for a cache hit on a page most visitors never open. Two builds,
// each tree-shaken against its own entry, is the cheaper trade.
//
// This build appends to the same dist/ the main build produces, so it must
// not empty the directory and must not copy public/ a second time. It runs
// after the main build (see the build script in package.json), never alone.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    rollupOptions: {
      input: {
        apollo: "src/apollo/main.js",
      },
      output: {
        entryFileNames: "assets/js/dist/[name].js",
        chunkFileNames: "assets/js/dist/[name]-chunk.js",
        assetFileNames: "assets/js/dist/[name][extname]",
      },
    },
  },
});
