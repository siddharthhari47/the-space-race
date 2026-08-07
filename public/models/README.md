# 3D Models

Static GLB assets for the reusable `InteractiveModelExplorer` framework
(`src/model-explorer/`). Each model here is referenced by a
`data-model="<config-key>"` attribute on a mount page, which selects the
matching config in `src/model-explorer/configs/`.

## boeing-777-300er.glb

### Attribution (required — CC BY 4.0)

> "Boeing 777-300ER Model" (https://skfb.ly/oSUMt) by hakai315 is licensed under
> Creative Commons Attribution 4.0 (CC BY 4.0)
> (http://creativecommons.org/licenses/by/4.0/).

This attribution is reproduced verbatim in the credits section of
`flight-lab/interactive-aircraft.html`. It must remain visible there and
in this file per the license terms, including if the model is further
modified, re-optimized, or re-exported.

### Processing

Source file (66MB, not committed — Sketchfab download, kept locally
outside the repo) was processed once with `@gltf-transform/cli` v4.4.2:

```bash
npx @gltf-transform/cli optimize <source>.glb public/models/boeing-777-300er.glb \
  --compress draco \
  --simplify false \
  --texture-compress false \
  --join false \
  --flatten false \
  --instance false
```

**Why these flags are off, not just left at `optimize`'s defaults:**
- `--join false --flatten false --instance false` — `optimize`'s defaults merge
  meshes to reduce draw calls, which on a first pass collapsed ~90% of the
  model's 287 mesh primitives into a single ~1.1M-vertex mesh and inflated the
  scene bounding box (a baked-transform bug triggered by the merge). The
  `InteractiveModelExplorer`'s hotspot highlighting works by computing each
  mesh's world-space bounding-box center and matching it against a hotspot's
  proximity radius — collapsing meshes together destroys the per-part
  granularity that depends on, so joining stays off for this model.
- `--simplify false` — no mesh decimation. The hotspot coordinates in
  `configs/boeing-777-300er.ts` were computed directly from this model's
  original geometry; decimation isn't needed for a 1.65MB result and avoids
  any risk of silently drifting those coordinates.
- `--texture-compress false` — this model has zero textures (materials are
  flat PBR color values), so there's nothing for this step to do; it was
  also crashing on this machine's image-processing dependency and is simply
  unnecessary here.

**What ran:** `dedup` (removes byte-identical duplicate resources), `palette`
(consolidated 85 flat-color materials into one shared material + a small
palette texture, remapping each mesh's UVs to its original color — visually
equivalent, far fewer draw calls), `weld` (merges duplicate vertices within
a primitive), `prune` (drops unreferenced data), `sparse` (storage
optimization), `draco` (geometry compression).

### Before / after

| | Source | Optimized |
|---|---|---|
| File size | 68.26 MB | 1.65 MB |
| Nodes | 430 | 430 (unchanged — required for hotspot positions) |
| Mesh primitives | 287 | 145 (dedup only; no meshes merged/lost) |
| Materials | 85 | 1 (palette-texture consolidation) |
| Vertices | 1,313,874 | unchanged (no simplification) |
| Scene bounding box | -22.82,-0.23,-21.38 → 26.08,11.91,21.95 | identical |

Verified via `npx @gltf-transform/cli inspect` before and after — node count
and scene bounding box are the load-bearing checks here, since the
hotspot coordinate system in `configs/boeing-777-300er.ts` depends on both.

### Runtime note

This file uses `KHR_draco_mesh_compression` (required extension) — the
loader must be configured with a Draco decoder (`useGLTF(url, true)` in
drei, or an explicit `DRACOLoader` on the `GLTFLoader` instance).
