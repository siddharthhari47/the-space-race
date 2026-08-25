# The Apollo layer — where it is, and what comes next

The homepage carries a persistent visual layer: a curved Earth in the
lower-right, lit for 13:32 GMT on 16 July 1969, whose camera is driven by how
far down the page you have scrolled. It is decoration. The page is a complete,
readable directory without it, and it never takes the scroll away from you.

This file is the working plan. It is written for whoever picks the work up
next, including me.

---

## The rules this layer is built under

These came from the brief and they are not negotiable later on convenience
grounds.

- **The mission happens to the website. The website does not happen to the
  mission.** Content is primary. The visualization never covers text, never
  blocks navigation, never intercepts a click.
- **No scroll hijacking.** No scroll-locked cinematic. No "enter the
  experience". State is calculated from real page progress and nothing else.
- **Eye candy, not a dashboard.** No telemetry panels, no HUD, no giant
  labels, no instructional overlays. The intended reaction is "wait, is there
  a rocket launching in the corner?"
- **Scale is the point.** The Earth bleeds past the viewport; you never see
  the whole globe. The vehicle starts small against it.
- **No invented NASA assets.** Procedural and 3D rendering is fine. A
  rendered frame must never be presented as historical NASA photography.
- **Everything factual gets a citation** on `/references/`, and copyrighted
  source material stays in the gitignored local folder — facts come out, the
  files never go in.

---

## Done

**Stage 1 — audit.** Nothing was rewritten. The nav, directory, exhibits,
written rooms and About page are as they were.

**Stage 2 — the Earth.** NASA Blue Marble day, night lights and clouds, at 4K
day / 2K everything else, built by `tools/build-earth-textures.py`. Real
sub-solar point, atmospheric scattering, ocean response, night-side
illumination. The planet turns at 0.45 °/s — about 108× the real rate, so that
something moves inside a visit. That exaggeration is disclosed on
`/references/`.

**Stage 3 — Kennedy.** Launch Complex 39A at 28.608422 N, 80.604133 W
(NASA SP-2000-4029). The pad light is a glow quad 78 km across, occluded
analytically by the curve of the planet, so it fades out properly when Florida
turns away instead of stranding a dot on the limb. Its brightness is invented
and is disclosed as invented — at the opening framing one pixel covers 2.9 km
of ground and a Saturn V is four hundredths of a pixel.

**Camera.** An eleven-knot shot list in `shots.js`, interpolated with C¹ cubic
Hermite (altitude splined in log space so equal scroll buys equal apparent
size change). `tools/apollo-framing.mjs` reimplements the projection outside
three.js so framing can be measured rather than eyeballed.

**Four fixes, most recently:**

1. *The rotation reversing.* Two causes. The ground lock — which rotated the
   camera to keep the pad pinned — cancelled the spin exactly from p ≈ 0.10,
   so the planet stopped turning. It is gone; see the long note in `shots.js`
   for why no version of it is stable. Separately, the scroll-driven pan
   changed sign around p ≈ 0.42 as the retreat began. Widening the lens-shift
   ramp covers it: the pan now changes direction **zero times** across the
   whole page.
2. *The hard horizontal division.* Two gradients over one continuous backdrop
   cannot be made to meet. Composited darkness fell 0.886 → 0.205 in a single
   pixel at the hero's bottom edge. There is now one gradient on `main` and
   nothing else may add a second. Worst step is now 0.0015 per pixel.
3. *The zoom-out.* The planet's top edge sat at y ≈ 0 across the whole back
   half, so it deflated in place instead of receding. Monotone lens-shift
   ramps now slide it into the bottom-right corner: centroid 0.27,−0.51 →
   0.59,−0.98, coverage 39% → 0, last visible at p = 0.940.
4. *About.* "Who is writing this" → "About me"; the greeting is its own
   display line; the prose is held to a 68ch measure like the rest of the site.

**Measured legibility.** Sixty-one scroll positions × every line of text that
sits on the backdrop rather than on a card: 51 failing pixels in total, of
which 31 blobs are individual stars (1–6 px, neutral) and the largest
non-star region is 18 px at 4.26:1. No body copy sits over the limb any more.

---

## Next

Work one stage at a time. Do not attempt several at once.

### Stage 4 — the Saturn V
- The Sketchfab CC model in the brief is auth-gated. Proposal: build it
  procedurally from published NASA dimensions (110.6 m, S-IC 10.1 m diameter,
  five F-1s). Better for staging, better for load time, legally clean. **If
  you would rather have the real GLB, drop it in and it swaps.**
- It must be a child of `earthGroup` so it turns with the planet. Hook it to
  `launchSite.worldPosition()` / `worldNormal()`.
- Scale has to be exaggerated — 110.6 m against 6,371 km is invisible. Say so
  on `/references/`; the note is already drafted there.

### Stage 5 — ignition and exhaust
- **The known bug to avoid:** the plume must not cut off. Every property —
  length, width, opacity, colour temperature — interpolates continuously.
  There is no `FLAME ON → FLAME OFF` anywhere.
- On staging the plume disappears because *that stage separated*, not because
  a flag flipped.

### Stage 6 — scroll-linked ascent
The shot list already carries the framing. This is the vehicle moving along
it, not new camera work.

### Stage 7 — staging
S-IC sep at p = 0.375, S-II sep at 0.555, S-IVB from 0.6. Phase boundaries are
in `mission.js` and the shot knots land on them deliberately — if you move a
phase you must move its knot.

### Stage 8 — Earth orbit (p 0.675–0.765)
### Stage 9 — translunar injection (p 0.765–0.845)
### Stage 10 — the Moon (p 0.955–1.0)
- NASA `moon_small.glb`. It enters gradually and stays small at first.
  No oversized decorative moon.
- The empty sky past p ≈ 0.94 is deliberately reserved for this. Do not fill
  it with anything else.

### Stage 11 — integrate and tune
### Stage 12 — performance and responsive
- Mobile: simpler Earth, fewer particles, lighter model, normal scrolling,
  readable text. Desktop is primary but mobile must not be broken.

---

## Things to revisit, honestly stated

- **The tail altitude schedule was tuned against an empty frame.** It will
  want re-tuning once the Moon and the vehicle are in it (Stages 4 and 10).
- **Removing the ground lock has a cost.** Leave a tab open for a minute or
  two and Florida rotates away, taking the pad light with it. The occlusion
  fade handles that correctly rather than leaving a light stranded, but it
  does mean the launch site is not always on screen. This was the right
  trade — a continuously turning planet reads far better than a pinned one —
  but it is a trade.
- **Stars pass behind body text.** 1–6 px each. Strictly this fails a
  contrast check on those pixels; in practice a single bright point does not
  impede a glyph. Left alone rather than dimming the sky.
- **Open question for the user:** is 0.45 °/s the right speed? It now governs
  how long the pad stays in view, so it matters more than it did.

---

## Tools

```bash
node tools/apollo-mission-check.mjs   # phases, framing bounds, drift, rotation
node tools/apollo-framing.mjs         # framing table for the shot list
node tools/apollo-framing.mjs --drift # surface drift, in detail
npm run build                         # both Vite builds; preview serves dist/
```

Run the check and the build after any change to the shot table.

The browser preview pane does not fire `requestAnimationFrame` or
`IntersectionObserver`, so scroll reveals read as `opacity: 0` and lazy images
never load *in the pane*. Those are pane artefacts, not bugs. To inspect a
frame, use the handle the scene exposes:

```js
window.__apollo.setProgress(0.42);
window.__apollo.renderFrame(0);
// then gl.readPixels() in the same synchronous block
```
