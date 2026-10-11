# The Apollo layer — where it is, and what comes next

The homepage carries a persistent visual layer: a curved Earth in the
lower-right, lit for 13:32 GMT on 16 July 1969, whose camera is driven by how
far down the page you have scrolled. It is decoration. The page is a complete,
readable directory without it, and it never takes the scroll away from you.

This file is the working plan. It is written for whoever picks the work up
next, including me.

## Camera handover fix, 23 September 2026

`journey.js` keeps the spacecraft camera acquired after the Saturn tour.
The last upper-stage shot blends directly into the lunar following shot;
there is no intervening return to the Earth camera. The transfer heading
also eases from the departure tangent instead of snapping at TLI. The
directory wash retains enough light to keep the departing craft visible.

Validation: mission, landing, approach and new journey checks pass; the
journey check samples 4,001 coast poses at three desktop aspect ratios and
checks the actual spacecraft's projection, camera range and adjacent turn.
Browser scroll checks cover the tour exit and Earth departure. Preview
serves `dist`, so rebuild before viewing changes.

## Previous state, 22 September 2026

The Stage D notes below are historical. The current implementation includes
the translunar transfer, lunar camera, CSM/LM separation, descent attitude,
touchdown, and NASA moonwalk film. Those are no longer upcoming features.

This polish pass adds:

- A 720vh lunar act, a camera arc around Eagle,
  lower and tighter framing through descent, and a held shot at contact.
  Caption positions remain tied to the same mission beats. The opening
  trajectory and the Saturn V tour keep their original scroll span.
- The camera follows the ship during coast, beginning before the lunar
  section. Earth falls behind; a continuous arc brings the Moon into view.
  Camera range interpolates logarithmically around the subject. The first
  lunar beat uses a distance-based playback curve so the Moon grows steadily.
- The coast now matches the orbit's entry position and heading. Previously
  those differed by about 70 km and 34 degrees, hidden by the distant camera.
- Progressive 4K NASA LROC colour and LOLA-derived normal maps replace the
  desktop Moon's flat shading. The global page wash opens over the lunar
  act, and lower exposure preserves surface contrast. Small procedural
  crater stamps were removed; only fine grain remains illustrative.
- Warm sunlight against cooler shadow fill, subtle optical falloff during
  the close-up acts, and moving structure in the engine exhaust. The
  rocket tour opens the page's readability wash so the hardware is clear.

- Progressive detailed geometry for the Saturn V's matching bodies on
  high-quality devices. The older detail file's combined upper stage is
  deliberately skipped so independent S-IVB/CSM staging survives.
- Correct output colour conversion on the vehicle shader.
- Camera-relative GPU projection for the Moon, vehicle, and exhaust. The
  former world-space projection lost precision at lunar distances and made
  the legs flicker into the ground even though the CPU pose was correct.
- LOLA terrain normals and filtered regolith grain near the surface,
  an approximate sunlight-directed ground shadow, restrained descent
  exhaust, and a scroll-reversible radial dust sheet. Terrain and effects
  are illustrative, disclosed on References, and not survey or telemetry.
- Stars in the opaque render queue, before the Moon. A negative render
  order within the transparent queue still drew stars over opaque ground.
- A local feathered caption shade and a scroll-driven fade out of the
  Apollo layer as the film enters. Scrolling back restores it.
- Fine surface detail and heavier model geometry are skipped on the low
  quality path. Moon GPU resources are released on scene destruction.
- Phone captions remain visible in normal document flow, with the same
  page gutters. Desktop caption timing is disabled at the 720px breakpoint;
  the closed mobile navigation is hidden and clipped outside the viewport.

Validation: production build and mission checks pass; the new
`node tools/apollo-approach-check.mjs` verifies a continuous coast/orbit
handover, monotone Moon growth, ship framing and camera acquisition.
`node tools/apollo-landing-check.mjs` verifies effect boundaries, bounded
values, continuous cutoffs, identical forward/backward evaluation, and a
camera that settles smoothly and holds after contact at 16:9 and 4:3.
Desktop browser inspection covers Earth behind the ship, the crescent Moon
reveal, orbit, descent, touchdown, ground occlusion, and shader
compilation, plus the film transition in both scroll directions. At a
390px phone viewport, the captions remain visible, there is no horizontal
overflow, and the navigation opens and closes above its backdrop. Broader
hardware performance profiling remains open.

Local review server: `npm run preview -- --host 127.0.0.1 --strictPort`,
port 5500. It serves `dist`, so source changes require a rebuild.

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

**Stage 3 — the launch site.** Built at Launch Complex 39A
(28.608422 N, 80.604133 W, NASA SP-2000-4029), then deliberately moved: see
Stage 4 below. The pad light is a glow quad 78 km across, occluded
analytically by the curve of the planet, so it fades out properly when its
part of the world turns away instead of stranding a dot on the limb. Its
brightness is invented and is disclosed as invented — at the opening framing
one pixel covers 2.9 km of ground and a Saturn V is four hundredths of a
pixel.

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

**Stage 4 — the Saturn V.** Not procedural after all. NASA publishes its own
3D-printable Saturn V (`science.nasa.gov/3d-resources/saturn-v-rocket/`,
`Saturn V Rocket.zip`, 3,306,320 bytes, twelve STLs, 165,560 triangles), it is
public domain, and — the part that decided it — it arrives already cut into
pieces at very nearly the planes the vehicle really separates at. Staging is
the whole point of this sequence, so a model that is already split where the
rocket splits beat one with exact proportions. `tools/build-saturnv.py`
reassembles it, decimates it to **29,505 triangles / 323 KB gzipped**, and
groups it into the five bodies that move independently: S-IC, interstage,
S-II, upper (S-IVB + SLA + SM + CM) and escape tower. The model has no
colours, so `vehicle.js` paints the roll pattern with a shader from band
positions along the stack; NASA's launch photography was used as reference
only and no photograph is reproduced.

*Where it launches from.* The brief asked for Florida; the user then asked for
an arbitrary site that still reads as Apollo 11, and this is that. At engine
start `scene.js` casts a ray at a fixed screen point, takes wherever it lands
on the daylit surface, and freezes it. On the current shot list that is about
32.4 N, 79.5 W — the western Atlantic. Disclosed on `/references/`, explicitly
as *not* Merritt Island. The launch azimuth is 330°, chosen so the climb
crosses the frame; it is not presented as Apollo 11's, because that figure was
not found in a source that could be checked.

*Two exaggerations, both disclosed.* The stack is drawn 480 km tall (≈ 4,340×
life size) and **grows to 2.4× that** as the camera retreats — without the
growth the whole vehicle is 43 px when the S-II drops away. `ALTITUDE_GAIN` is
now **16** (was 12), so the 190.8 km parking orbit is drawn at 3,053 km.
Downrange is not gained.

**Stage 5 — ignition and exhaust.** `plume.js`. Nineteen jets — three main
clusters and four groups of retros and ullage motors — and **not one
visibility flag in the file**. Every jet is drawn every frame; a plume goes
out because its throttle ramp reached zero. Length, radius, flare, Mach
diamonds and colour all read off that one number, so nothing can step. Colours
follow the propellants: sooty orange for the S-IC, near-clear blue-white for
the hydrogen stages.

Two things that took a second pass. At the pad the cone points down into the
planet and the depth buffer eats it, so the first render had a Saturn V at
full thrust with **no visible flame at all**; the main plume is now clamped to
the room it actually has and a pad cloud carries the low-altitude stretch. And
a plume that keeps its full vacuum flare while its length collapses is a
mushroom — the S-IC tail-off was a squat pink ball for four seconds — so
expansion is tied to throttle as well as to ambient pressure.

**Stage 6 — scroll-linked ascent.** `flight.js` is a pure function of `p`:
nothing integrates, nothing accumulates. Scroll back up and the S-IC returns
and re-attaches exactly.

*The bug this stage nearly shipped with.* The vehicle hangs off `earthGroup`,
so it inherited the planet's 0.45 °/s spin. Measured: ten degrees of spin —
**twenty-two seconds of somebody reading the page** — carried the vehicle from
mid-frame out to NDC 0.67,−0.70, and twenty degrees put it off screen
entirely. The composition depended on how fast you read. Fixed by walking the
pad's longitude backwards by exactly the angle `earthGroup` has turned, so the
two cancel: the vehicle now holds still while the ground streams underneath,
verified invariant out to 400° of spin. The factor on `spinRad` is exactly
one and never varies, which is what keeps it safe — `spinRad` accumulates
without bound.

**Stage 7 — staging.** All four separations are visible and were checked
frame by frame against rendered crops: S-IC at p = 0.375 (retros firing,
gap opening, S-II lighting at 0.379), the aft interstage at 0.400, the escape
tower at 0.404, S-II at 0.555. Drawn stack height through the sequence:
145 px at first staging, 139 at interstage, 75 at second staging.

**Checked, not eyeballed.** `tools/apollo-mission-check.mjs` grew a flight
section. Continuity is asserted by *refinement* rather than by a tolerance:
sample each drive signal at N and at 2N and compare the largest step. Anything
with a bounded derivative halves; a value that jumps does not shrink at all.
Every signal returns exactly 0.500. It also asserts cutoff precedes separation
for both stages, that separated parts never come back, that the drawn stack
height only grows, and — reproducing `scene.js`'s pad ray from constants read
out of the source — that the vehicle stays inside the frame at 16:9 and 4:3
for the whole ascent (worst 0.854 of a half-frame at p ≈ 0.467).

**Measured legibility.** Sixty-one scroll positions × every line of text that
sits on the backdrop rather than on a card: 51 failing pixels in total, of
which 31 blobs are individual stars (1–6 px, neutral) and the largest
non-star region is 18 px at 4.26:1. No body copy sits over the limb any more.

**Stage 13 — the terminal count.** `countdown.js`. The hook: the one part
of this layer that says up front that something is going to happen, so that
scrolling is a decision rather than a discovery. Type in the empty sky above
the limb, top right — that corner is black on the hero framing while the
bottom right is full of sunlit cloud. No panel, no border, no button; a
bordered countdown is a widget and the brief rules out anything that reads as
a HUD. The clock warms from white towards flame colour and the tracking opens
across the last fifteen seconds, and that is the whole animation.

It is a pure function of scroll, like everything else here — scroll and it
counts, stop and it holds, scroll back and it counts up. It is created in JS
rather than written into `index.html` so that a browser which declined the
WebGL layer never gets a count for a launch that is not coming, and it is
gone by T+63 s, before there is a rocket for it to sit on top of.

The commentary is Jack King's, quoted from NASA's own *Apollo 11 Highlights,
Day 1* transcript. Two findings worth keeping: NASA's transcript reads "All
engines running" and "Ignition sequence starts", not the far more commonly
quoted *all engine running* / *ignition sequence start* — this file was first
written with the popular version and it was wrong. And King's spoken count
really does skip eight and seven, because he filled those two seconds with
the call. Only four sentences are used; the rest of that paragraph is King
reading the clock aloud, and a caption saying "T minus 25 seconds" beside a
clock reading 21 is a visible error. `apollo-mission-check.mjs` now asserts
that no caption states a time, so it cannot be padded back in later.

`getSecondsAt`'s first knot moved from T−600 to T−60 to serve this, and that
is disclosed on `/references/` with the other authored figures.

### The arrival and the ignition light

Two problems, one of them named by the brief: the rocket appeared out of
nowhere.

It did, literally. The vehicle used to fade up on *opacity* between p 0.086
and 0.125 at full symbolic size the whole way — a dissolve, not an approach.
`stackScale` is now the product of two ramps, `emerge` and `growth`, and the
first runs from a floor of 0.004 up to 1 by p 0.27. The stack is drawn 1.9 km
tall at engine start, which is 0.66 px at the opening framing, and reaches
207 px by p 0.28. It genuinely arrives by getting closer. The floor is not
zero because `clearance` divides by the drawn stack height and `plume.js`
divides by `clearance`. Multiplying the ramps rather than blending them is
what keeps the product monotone by construction.

The light is the harder half, and the reason is a measurement worth keeping:

**The page's readability wash caps the entire WebGL layer at about a sixth of
full brightness below roughly 1,100 document pixels.** Drawn as an additive
sprite, the flash read `(255, 255, 255)` from `gl.readPixels` and `(45, 47,
52)` in a screenshot of the same pixel. Nothing done inside the canvas — a
tighter core, glare arms, a bigger quad — can beat a ceiling. The vehicle
does not care, because it only needs relative contrast; a light does.

So the flash is drawn twice. The wide halo is a sprite in the scene, under
the wash, which is the right place for a broad soft bloom behind type. The
bright core is `flare.js`, an HTML element inside `main` at `z-index: -1`,
which paints above `main`'s background and below `main`'s content — so it is
as bright as it likes and the text still paints last. Measured at the peak:
`(255, 254, 253)`.

Painting above the wash costs something, and it is not contrast against the
glyphs — it is that light type over a patch the flare has brightened is
unreadable whatever order things painted in. That cost was measured on every
run of type whose *glyph* rectangle fell inside the flare, at five points
through the ignition. Three findings:

- The brightest instant is the safest one. At the peak, nothing.
- What breaks the page is **spreading**, not brightness. With the core sized
  from the halo's radius, "Atmosphere & Altitude" fell from 7.17 to 1.39 at
  tower clear — half intensity, twice the width.
- Tying the core's radius to its own intensity, and giving that intensity a
  1.8 power so the source dies faster than its scattering, brought the worst
  cost anywhere to **−0.93**, with the one affected heading still at 5.53.

`flashCoreAt` / `flashCoreRadiusKm` carry that, and the mission check asserts
the properties rather than the numbers: the core is widest at the instant it
is brightest, it never spreads wider than its halo, and its step halves under
refinement.

**On viewports ≤ 720 px neither the count nor the flare runs at all.** The
desktop placements are not corners, they are holes — empty sky in the top
right, the gutter between the directory's two columns. A 390 px viewport has
no such space: the largest run of rows untouched by type moves from the top of
the frame to the bottom and back as the page scrolls, and a fixed element
cannot sit in a moving gap. Left alone, the eyebrow printed across the hero
copy and the flare sat on a directory description. Mobile now gets the halo
under the wash and nothing on top of the words.

The loss worth naming: **mobile no longer gets the countdown hook.** The fix
is not a different corner — it is to set the clock as a real line of type in
the hero and let it scroll away with the content, which is a change to the
page rather than to this layer, and so is the site owner's call.

### The Saturn V tour, and what "smoother" turned out to mean

The brief for this pass was one sentence: *"stretch the zoom out towards the
ship more, it just feels too abrupt if I'm scrolling quickly."* The first
guess was that the blend ramp was too short, so it went from 130 px of
scroll to about 650. That helped and was not the problem. Sweeping candidate
ramps showed the worst rate of change staying at u ≈ 0.906 no matter which
ramp was used, which is the signature of a fault that is not in the ramp at
all. It was authored straight into the shot table: spanM went 60 → 217 across
0.025 of u, about 54 px of scroll, under a comment that cheerfully said "the
pull-out opens, fast". **d(ln spanM)/du was 155.** Nothing else in the table
came close.

So the shot table was rebuilt around a measured objective rather than by eye.
`tools/scratch/score.mjs` scores a candidate table on framing rate, dolly
rate in frame-widths, whether each caption's subject is inside the frame and
big enough to be the subject, whether the vehicle is in shot at both ends,
and whether the closing pull-out only ever opens. It was written first and
validated by making it reproduce every bug already known to be in the shipped
table before any candidate was scored against it.

The design that came out of it is a **travelling dolly**: spanM stays near 74
metres for the whole walk instead of oscillating between 50 and 217, and the
camera simply moves along the vehicle. That works because of one piece of
arithmetic. At spanM 74 every caption's subject already clears 18% of the
frame width — the S-IC is 57%, the S-II 32%, the S-IVB 31%, the interstage
region 18%, the escape tower 20%. There was never a reason to push in and
pull out between captions, and doing so was the whole source of the
abruptness. The approach then gets the room the request asked for: 220 m of
vehicle across the frame at the top, closing to 74 by the first caption, a
steady 5.4 in d(ln size)/du measured on the running page against 155 before.

**The caption ladder moved, and it is pacing, not fact.** Caption u is
derived from each note's `top` in museum.css, so it is authored there:
`u = (top_vh - 62) / 200`. The interstage → escape tower leg is 60 m of stack,
the longest in the walk, and at the old spacing it could not be crossed
without either exceeding the dolly rate or opening the frame so wide the
tower stopped being the subject. The five notes were redistributed to 138,
160, 190, 212 and 232vh (u 0.38, 0.49, 0.64, 0.75, 0.85), which gives that
leg half again as much scroll and hands the closing pull-out 0.15 of u
instead of 0.10. Three files agree on those numbers and all three have to be
edited together: the stylesheet, `tools/scratch/score.mjs`, and the CAPTIONS
table in `tools/apollo-mission-check.mjs`.

Two assertions in the mission check were re-authored rather than satisfied,
which is worth being explicit about. Its CAPTIONS table still listed the
parts in stacking order, from before the captions were reordered to the order
the parts actually separate — so it had been checking the camera against a
sequence the page no longer reads. And it measured "full size" at u=0.12 and
wanted 0.86 of the frame there, which quietly required the tour to open
already on top of the vehicle: the exact thing this pass was asked to undo.
It now asks that the vehicle is never a speck on approach and is full size by
the first caption, which is what "full size" was protecting.

### The blend was aiming at nothing, twice

Rebuilding the table made the tour itself correct and did not fix the page,
because the interlude does not cut to the tour camera, it blends toward it.
`applyTourBlend` blended the aim by slerping between the mission camera's
quaternion and the tour camera's. An orientation is only a good one at the
position it was computed for: tourOrient points at the vehicle *from the tour
camera's seat*, and halfway through the blend the camera is nowhere near that
seat, so half of that rotation aims it at the gap between the two shots.

Measured on the running page, with every corner of every visible mesh in the
vehicle projected into the camera that drew the frame: at tourU 0.13, and
again from 0.92 to 0.95, **not one corner was inside the frame.** Two
stretches of empty sky, one on the way in and one on the way out, precisely
where the blend weight was between zero and one and nowhere else. Every
offline check passed through both, because the tour camera alone is framed
correctly at both — only the blend between them was broken. The longer ramp
made it visible; it did not cause it.

The aim is now blended as a **point** instead. `tourTarget` is already a
point on the vehicle's axis; the mission camera's own view ray sampled at the
same range gives the other end; the segment between two points near the
vehicle stays near the vehicle. Both ends stay exact — at weight 0 it
reproduces the mission camera's rotation, at weight 1 it repeats
tourOrient's construction line for line.

`tools/apollo-blend-probe.mjs` is the guard, and it is the only check here
that needs a browser, because the blended camera's aim depends on the
vehicle's live pose and that is a running page rather than a formula. It was
confirmed to work the way everything else in this layer is: the old blend was
put back, the probe failed on four sampled positions, and the fix was
restored.

---

## Next

### Stage D1 — the Moon is in the scene, and it is the real one

The Moon's position is not computed. Every other body on this page is, but
a truncated lunar series written from memory is the exact species of thing
that reads as authoritative and is quietly a degree wrong, so `mission.js`
now carries eleven rows transcribed out of JPL Horizons on DE441 — target
Moon (301), observer geocentric (500@399), twelve-hourly across the mission
— with the query recorded above them so anyone can run it and compare.
`moonAt(ms)` interpolates linearly between them, which at that spacing is
good to a few arcminutes against a half-degree disc.

The one subtlety, and it is the whole reason `gmstDeg` was pulled out of
`subSolarPoint`: longitude is read against Greenwich **as it stood at the
launch epoch**, once, and never against Greenwich at the time being asked
for. Using `gmstDeg(ms)` there instead is an easy edit, it is invisible, and
it passes almost every check — the distance is untouched and the two
definitions agree exactly at t=0. What it does is whirl the Moon right
around the planet once per mission day, which is backwards: the Moon does
not orbit the Earth daily, the Earth turns underneath it. The check that
catches it measures how fast the Moon crosses the sky, and the mutation
takes that from 12.4 to 349 degrees a day.

`moon.js` draws it. Two things there are worth knowing. The shading is
Lommel-Seeliger rather than Lambert, because the real full Moon is not a
shaded ball — it is a flat disc, bright to the limb, and about ten times
brighter at full than at half rather than twice. That is the opposition
effect and it is the single thing that makes a rendered Moon read as the
Moon. And the mesh is tidally locked, near side to Earth, on the
orientation convention `tools/build-moon-texture.py` recovered from the
model's own accessors and confirmed against Tycho and Mare Crisium.

The Moon hangs off the **scene**, not off `earthGroup`. `earthGroup` spins
108 times faster than the real planet so the surface visibly moves; a Moon
parented to it would be swung round the Earth a hundred times a day. There
is a source-level check for this, because it has no numeric output.

Verified: 22 assertions in `apollo-mission-check.mjs`, six mutation tests
(live GMST, flipped longitude, left-handed basis, far side facing Earth,
inverted earthshine, wrong parent) each seen to fail the check that claims
to guard it, and a headless-Chrome probe confirming the shader compiles and
the Moon tracks the mission clock 403,921 → 395,550 km.

Two numbers came out of this that are facts about the mission rather than
about the code, and both are now on the References page: the Moon was near
apogee, so the range starts above 403,900 km and not at the 384,400 km
everyone quotes; and it was 22.2 degrees from the Sun, a crescent 1.8 days
old, which *is* the launch window — Tranquility had to be at its own
sunrise for the shadows to be readable.

### Stage D2 — the trajectory does not go to the Moon yet

Measured, not assumed. The vehicle flies a great circle from the pad at
azimuth 330 and keeps flying it; the Moon is wherever the ephemeris puts
it, and those are unrelated. The probe reads the Moon's NDC x between -1.2
and +31.9 across the page — never once in frame — and from p=0.85 the
camera-to-Moon distance *grows*, 399,664 to 573,664 km, while the Moon is
actually getting closer to Earth. The camera is flying away from it.

The fix is to slerp the post-TLI direction toward the Moon's arrival
position rather than to bend the launch. That is also the more physically
honest of the two: a real translunar trajectory leaves the launch plane.

### Stage D3 — the cruise camera

Earth-anchored framing dies here. Camera-to-vehicle goes 23,868 → 407,614
km between p=0.723 and p=0.750, which puts the vehicle at about one pixel.
Stage D needs a camera in the spacecraft's frame — the same shape as
`tour.js`, blended in with the point-aim method that is now proven. The
altitude column in `shots.js` from p=0.794 onward will not survive it.

### Stage D4 — the Lunar Module

`vehicle.js` has five bodies: `sic, interstage, sii, upper, tower`. There is
no LM, and §19 of the brief forbids inventing one. There is a real one:
NASA-3D-Resources, `3D Models/Apollo Lunar Module/Apollo Lunar Module.glb`,
716,840 bytes, verified glTF 2.0 by its magic bytes. 100,628 polygons, so it
needs the same decimation pipeline `saturnv.bin` went through (2.4 MB source
to 549 KB shipped).

### Stage D5 — the video

`https://images-assets.nasa.gov/video/ksc_080504_apollo/ksc_080504_apollo~orig.mp4`
— live, 200, `video/mp4`, 4,880,515 bytes. First step: 21 July 1969,
02:56:15 UTC, GET 109:24:15. Note the page clock currently only reaches GET
069:31 at p=1, so `getSecondsAt`'s last knot has to move for the landing to
be reachable at all.


Work one stage at a time. Do not attempt several at once.

### Stage 8 — Earth orbit (p 0.675–0.765)
### Stage 9 — translunar injection (p 0.765–0.845)
### Stage 10 — the Moon (p 0.955–1.0)
- It enters gradually and stays small at first. No oversized decorative moon.
- The empty sky past p ≈ 0.94 is deliberately reserved for this. Do not fill
  it with anything else.
- **The asset is done and shipped: `public/assets/textures/moon-2k.webp`.**
  The Moon is drawn the way the Earth is — a sphere with one colour map on
  it — and NASA's mesh is deliberately not shipped. `moon_small.glb` is
  13.2 MB of which 12.2 MB is the texture; the geometry buys displacement of
  about ±0.8% of the radius, well under a pixel of silhouette at the size the
  Moon is drawn. The texture was worth taking and the mesh was not.
- That texture is a **cube-cross atlas**, not an equirectangular map, so it
  cannot be wrapped onto a sphere as-is. `tools/build-moon-texture.py`
  reprojects it, and reproduces the shipped file byte-for-byte. The six face
  maps were fitted from the model's own POSITION/TEXCOORD_0 rather than
  guessed (max residual 0.00016 UV), and the orientation was confirmed by
  measuring Tycho and Mare Crisium against their published coordinates rather
  than assumed. Credited on /references/ under "NASA Lunar Imagery".
- Still to do: the sphere, its lighting, and the approach itself — see the
  camera note under "Things to revisit".

### Stage 11 — integrate and tune
### Stage 12 — performance and responsive
- Mobile: simpler Earth, fewer particles, lighter model, normal scrolling,
  readable text. Desktop is primary but mobile must not be broken.
- The count and the flare are suppressed below 720 px rather than adapted.
  If mobile is to get the hook back, it wants the clock in the flow of the
  hero, not another fixed corner.

---

## Things to revisit, honestly stated

- **The vehicle is one pixel for the whole back half of the page, and the
  cause is not the one recorded here before.** Measured at a 1080-tall
  window, drawn height against camera distance: 118 px at p = 0.700, 83 px at
  0.723 where the interlude hands back, then **5 px at 0.750 and 1 px from
  0.800 all the way to 1.0**. The earlier note blamed the stack-scale ramp
  ending at p = 0.70 while the camera kept retreating. That is real but it is
  the smaller half. The camera's own altitude only goes 16,900 km to 37,400
  over that stretch; the camera-to-vehicle distance goes **23,868 km to
  407,614 km between p = 0.723 and p = 0.750 alone**, because after
  translunar injection the vehicle leaves and the camera does not. It is
  still an Earth-anchored shot watching something depart at translunar
  speed.

  So extending the growth ramp cannot fix this on its own — holding the
  apparent size across that stretch would need roughly a twenty-fold growth,
  drawing the stack taller than the Earth is wide. The fix is a camera
  change, not a scale change: past the interlude the shot has to stop being
  anchored to Earth and start travelling with the spacecraft, Earth shrinking
  behind it and the Moon growing ahead. That is Stage 10's real content, and
  the altitude column in `shots.js` from p = 0.794 onward was authored for
  the old, anchored reading of the shot and will not survive it.
  Measured by `tools/scratch/exit_size.mjs`.
- **Legibility has not been re-measured with the vehicle in frame.** The
  sixty-one-position sweep below predates the Saturn V. On-backdrop text is
  sparse through the ascent — one to three elements per viewport — but spans
  nearly the full width, so horizontal avoidance is not available. Re-run it.
- **The launch site drifts before ignition.** While the pad is still being
  re-picked, the glow holds still on screen while coastlines travel
  underneath. It is a soft 78 km blob with no edge to register against, and
  from engine start it is frozen, but it is a real artefact.
- **`stackBaseIndex` is computed and not used.** The trajectory reference
  stays at the full stack's engine plane for the whole flight, so the
  survivor rides about 40 model metres high after staging rather than
  lurching downwards at every separation. The field is there for a better
  answer if one turns up.


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
node tools/apollo-blend-probe.mjs     # the blended camera, on a running page
npm run build                         # both Vite builds; preview serves dist/
```

Run the check and the build after any change to the shot table.

`apollo-blend-probe.mjs` is the odd one out: it drives headless Chrome
against a running preview, because it answers the one question that cannot
be answered by arithmetic — whether the camera is looking at the vehicle
*while it is blending between two shots*, which depends on the vehicle's
live pose. It needs `npm run build && npm run preview` first, takes about
thirty seconds, and is worth running after any change to `tourWeightAt`,
`applyTourBlend`, or the shot table's two ends. `tools/scratch/score.mjs`
scores a candidate shot table offline and is how the current one was
chosen.

The browser preview pane does not fire `requestAnimationFrame` or
`IntersectionObserver`, so scroll reveals read as `opacity: 0` and lazy images
never load *in the pane*. Those are pane artefacts, not bugs. To inspect a
frame, use the handle the scene exposes:

```js
window.__apollo.setProgress(0.42);
window.__apollo.renderFrame(0);
// then gl.readPixels() in the same synchronous block
```
