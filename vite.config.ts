import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Everything except the model explorer viewer is a plain static site living
// in public/, copied verbatim by Vite (no bundling, no hashing, no HTML
// parsing). That matters: assets/js/simulators/registry.js stores module
// paths as plain strings, and simulation-container.js does a fully dynamic
// `import(meta.module)` that Vite's bundler cannot trace to rewrite a
// hashed filename. Keeping the whole existing site in publicDir sidesteps
// that risk entirely — Vite never touches it. The only thing actually
// built here is the React Three Fiber entry point, output to a fixed
// (non-hashed) filename so the HTML script tag never needs to change
// between builds. Any chunk Rollup emits for this entry (e.g. from
// src/model-explorer/main.tsx's `import.meta.glob` over per-model config
// files) also lands at a stable, non-hashed name via the same output rules.
export default defineConfig({
  plugins: [react()],
  publicDir: "public",
  server: {
    port: 5500,
  },
  preview: {
    port: 5500,
    // vite preview otherwise serves /assets/ with max-age=31536000,immutable.
    // The two bundles here are deliberately unhashed so the HTML never has to
    // change between builds, which means an immutable header tells the browser
    // to keep yesterday's JavaScript forever: you rebuild, reload, and see the
    // old page with no indication anything is stale. This is a local review
    // server, so nothing is gained by caching at all. Production is served by
    // Vercel straight out of dist/ and is unaffected by this.
    headers: {
      "Cache-Control": "no-store",
    },
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        "model-explorer": "src/model-explorer/main.tsx",
      },
      output: {
        entryFileNames: "assets/js/dist/[name].js",
        chunkFileNames: "assets/js/dist/[name]-chunk.js",
        assetFileNames: "assets/js/dist/[name][extname]",
      },
    },
  },
});
