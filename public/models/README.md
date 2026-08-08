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

## merlin-mk2-helicopter.glb

### Attribution (required — CC BY 4.0)

> "Merlin MK2 Helicopter" (https://skfb.ly/6VLMt) by sudreyskr is licensed
> under Creative Commons Attribution 4.0 (CC BY 4.0)
> (http://creativecommons.org/licenses/by/4.0/).

The source file's own embedded glTF metadata (`asset.extras`) independently
confirms this — author, license, and Sketchfab source URL are all present
in the file as supplied, not just in the brief that accompanied it. The
model has been modified for web use (geometry Draco-compressed, textures
resized and re-encoded — see Processing below); this attribution covers the
modified version per the license terms. This attribution is reproduced
verbatim in the credits section of `flight-lab/interactive-helicopter.html`
and on `references/index.html`. It must remain visible in both places and
in this file, including through any further re-optimization.

### Processing

Source file (42.98MB, not committed — Sketchfab download, kept locally
outside the repo) needed a different approach than the Boeing model: it has
8 materials × 3 PBR textures each (24 textures, several at 4096×4096 —
texture data alone was ~40MB of the 42.98MB total), where Boeing had none.

`@gltf-transform/cli`'s own `--texture-compress`/`--texture-size` flags
crash on this machine (`sharp`/`libvips` `colourspace: parameter space not
set` — a pre-existing, documented limitation, see the Boeing section above)
for *any* texture operation, not just format conversion, so texture
resizing was done manually instead of through the CLI's built-in step:

```bash
# 1. Geometry pass only (no texture-compress — it crashes here), unpacked
#    to loose files so the images can be processed independently:
npx @gltf-transform/cli optimize <source>.glb merlin.gltf \
  --compress draco --texture-compress false \
  --simplify false --join false --flatten false --instance false

# 2. Each extracted PNG resized to fit within 1024x1024 (down from up to
#    4096x4096) via Pillow, then re-saved: baseColor and metallicRoughness
#    as JPEG q90 (both tolerate lossy compression well; materials are all
#    alphaMode OPAQUE, so no alpha channel is lost), normal maps as JPEG
#    q92 (higher quality — compression artifacts distort normals more
#    visibly than color/roughness data, but at 1024px and q92 the
#    difference was not visually meaningful against keeping them
#    lossless). The gltf JSON's `images[].uri`/`mimeType` were updated to
#    match the new filenames — image dimensions aren't declared in glTF
#    JSON, so the resize itself needed no other JSON changes.

# 3. Re-packed with geometry re-compressed via Draco:
npx @gltf-transform/cli draco merlin.gltf public/models/merlin-mk2-helicopter.glb
```

**Why `--join/--flatten/--instance false`:** same reasoning as Boeing —
preserves the 8 named mesh parts (`Body`, `BodyTop`, `Prop`, `Sides`,
`Windows`, `BackWing`, `BackProp`, `Door`) that
`configs/merlin-mk2-helicopter.ts`'s hotspots bind to by name/position.

**Why `--simplify false`:** the source is already low-poly (35,862 total
vertices across all 8 meshes) — there's nothing worth decimating.

### Before / after

| | Source | Optimized |
|---|---|---|
| File size | 42.98 MB | 3.42 MB |
| Nodes | 19 | 19 (unchanged) |
| Mesh primitives | 8 | 8 (unchanged — no merging) |
| Materials | 8 | 8 (unchanged — this model's materials are genuine PBR textures, not flat colors, so palette-consolidation doesn't apply the way it did for Boeing) |
| Vertices | 35,862 | 35,865 (Draco re-quantization introduces a handful of duplicate boundary vertices — negligible) |
| Textures | 24 (up to 4096×4096 PNG) | 24 (capped at 1024×1024; baseColor/metallicRoughness/normal all JPEG) |
| Scene bounding box | -1285.57,-71.26,-884.02 → 903.69,498.93,860.38 | identical |

Verified via `npx @gltf-transform/cli inspect` before and after.

### Runtime note

Same as Boeing: uses `KHR_draco_mesh_compression` (required) and
`KHR_materials_clearcoat` (used, not required — three.js's `GLTFLoader`
supports it natively via `MeshPhysicalMaterial`, no extra configuration
needed). Unlike Boeing, this model's materials have real
`metallicRoughnessTexture` maps — the viewer's `Model.tsx` has a
Boeing-specific `metalness = 0` correction (for a compression artifact
Boeing's flat-color materials hit) that must **not** apply to this model;
it's gated behind `config.forceZeroMetalness`, which the Merlin config
leaves unset.

---

## `sukhoi-su35-fighter.glb`

> "Sukhoi SU-35 Fighter Jet" (https://skfb.ly/pwSpn) by Muhamad Mirza Arrafi
> is licensed under Creative Commons Attribution 4.0
> (http://creativecommons.org/licenses/by/4.0/).
>
> **Modified for web use.** Geometry Draco-compressed; textures resized to a
> 1024px cap and re-encoded from PNG to JPEG.

Used by `flight-lab/interactive-fighter-aircraft.html` and embedded in
`flight-lab/fighter-aircraft.html`.

### Processing

This model needed a two-step pipeline rather than a single `optimize` call,
because `@gltf-transform/cli`'s texture stage (libvips) refuses these
particular PNGs outright:

```
error: colourspace: parameter space not set
```

PIL reads them without complaint, so the textures were resized and
re-encoded first, in Python, and the geometry compressed afterwards:

```bash
# 1. textures: 1024px cap, PNG -> JPEG (WebP where alpha exists)
python shrink_textures.py sukhoi_su-35_fighter_jet.glb su35-tmp.glb 1024

# 2. geometry: Draco, preserving per-part mesh identity
npx @gltf-transform/cli optimize su35-tmp.glb sukhoi-su35-fighter.glb \
  --compress draco --texture-compress false \
  --simplify false --join false --flatten false --instance false
```

Order matters. Running `optimize` first produces `EXT_meshopt_compression`
bufferViews whose real data offsets live in the extension object rather than
in `bufferView.byteOffset`, so a naive container rewrite afterwards corrupts
them (`Invalid typed array length` on reload). Shrink textures on the plain
uncompressed source, then compress.

**Why `--compress draco` explicitly:** `optimize`'s default is meshopt, which
would require registering a `MeshoptDecoder` at runtime. The site already
self-hosts a Draco decoder at `/draco/` (see `Model.tsx`), so Draco is the
option that needs no viewer changes.

**Why `--join/--flatten/--instance false`:** preserves the separate meshes
that `configs/sukhoi-su35-fighter.ts` derives hotspot positions from.

### Before / after

| | Source | Optimized |
|---|---|---|
| File size | 11.33 MB | 1.40 MB |
| Mesh primitives | 15 | 15 (unchanged — no merging) |
| Materials | 13 | 10 (dedup removed 3 unused/duplicate) |
| Vertices | 141,780 | 142,125 (Draco re-quantization; negligible) |
| Textures | 8 PNG (up to 2048×2048, 4.6 MB total) | 8 JPEG (capped 1024×1024, ~0.8 MB total) |
| Scene bounding box | -7.13358,-2.14048,-11.41077 → 7.13358,3.77542,10.00856 | -7.13358,-2.14048,-11.41077 → 7.1342,3.77541,10.00856 |

Verified via `npx @gltf-transform/cli inspect` before and after.

### Scale note

This model is authored at **1 unit = 1 metre**, confirmed against three
independent dimensions of the real aircraft (21.42 vs 21.9 m length, 14.27 vs
15.3 m span, 5.92 vs 5.9 m height) rather than assumed. That's what makes the
anatomy-derived hotspot positions in its config defensible.

### Runtime note

Requires `KHR_draco_mesh_compression`, same as Boeing and the Merlin. Every
material's `metallicFactor` was verified to still be `0` *after* the Draco
pass, so this model must **not** set `config.forceZeroMetalness` — the Boeing
compression artifact that flag exists for did not occur here.
