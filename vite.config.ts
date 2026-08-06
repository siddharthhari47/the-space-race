import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Everything except the 3D aircraft viewer is a plain static site living in
// public/, copied verbatim by Vite (no bundling, no hashing, no HTML
// parsing). That matters: assets/js/simulators/registry.js stores module
// paths as plain strings, and simulation-container.js does a fully dynamic
// `import(meta.module)` that Vite's bundler cannot trace to rewrite a
// hashed filename. Keeping the whole existing site in publicDir sidesteps
// that risk entirely — Vite never touches it. The only thing actually
// built here is the React Three Fiber entry point, output to a fixed
// (non-hashed) filename so the HTML script tag never needs to change
// between builds.
export default defineConfig({
  plugins: [react()],
  publicDir: "public",
  server: {
    port: 5500,
  },
  preview: {
    port: 5500,
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        "aircraft-viewer": "src/aircraft-3d/main.tsx",
      },
      output: {
        entryFileNames: "assets/js/dist/[name].js",
        chunkFileNames: "assets/js/dist/[name]-chunk.js",
        assetFileNames: "assets/js/dist/[name][extname]",
      },
    },
  },
});
