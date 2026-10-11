// Launch Complex 39A, as a point of light on a turning planet.
//
// This is the smallest possible piece of the Apollo sequence and it is worth
// building on its own, because everything that comes after hangs off it: the
// vehicle launches from here, the ascent camera has to know where here is,
// and "here" is now a moving target. The Earth rotates, so the pad rotates
// with it, and any object that belongs to the ground has to be a child of
// earthGroup rather than a thing placed once in world space.
//
// What this deliberately is not: a pin, a marker, a label, a callout, or
// anything a visitor would read as a map annotation. From the opening shot
// the pad is a couple of pixels of warm light on the edge of the daylight
// side. If it takes a second look to notice, that is the intended effect.
//
// On honesty: at 3,150 km, in daylight, a rocket on a pad is far below the
// resolution of anything you could see, and so is its exhaust. This glow is
// an exaggeration in exactly the way the vehicle's size will be, and it is
// written down on the references page rather than quietly hoped over.

import * as THREE from "three";

import { EARTH_RADIUS_KM } from "./earth.js";
import { clamp, latLonToUnitVector, smoothstep } from "./mission.js";

// How far above the surface the sprite's centre sits. Small enough that the
// light reads as coming from the ground, large enough that the quad is not
// half-buried in a sphere approximated by 128 x 96 quads.
const LIFT_KM = 18;

// Radius of the glow quad in kilometres. Measured at the opening framing on a
// 1600-wide frame: 2.89 km to the pixel, so the quad is 54 px across and the
// part of it bright enough to see is about 18. A light, not a dot, and
// nowhere near a label. Both numbers scale with the viewport, which is the
// right behaviour — it is a thing of a certain size on the ground, not a
// certain number of pixels.
const GLOW_RADIUS_KM = 78;

// Beyond this the pad is not a thing anyone can see and drawing it just adds
// an aliasing sparkle to a shrinking planet. The mission has left Earth by
// the time the camera is this far out anyway.
const FADE_START_KM = 9000;
const FADE_END_KM = 42000;

/* =========================================================================
   THE BRIGHTNESS ENVELOPE
   =========================================================================

   Keyed to scroll progress rather than to phase names, because §9 of the
   brief is emphatic that nothing about the exhaust may switch on or off, and
   the same argument applies to the light that precedes it. A phase lookup
   returns "prelaunch" or "ignition" and gives you a step; a curve gives you
   a ramp.

   Per-segment smoothstep is used here, which is the exact thing that was
   wrong for the camera path in shots.js. It is right here. That curve was
   describing motion, where a zero derivative at every knot reads as ten
   separate stalls; this one is describing brightness, where flat spots at
   the knots are what a light coming up and going down actually looks like. */

const ENVELOPE = [
  { p: 0.0, v: 0.24 },    // the pad exists, and that is all it says
  { p: 0.06, v: 0.32 },
  { p: 0.075, v: 0.46 },  // ignition begins
  { p: 0.1, v: 1.0 },
  { p: 0.115, v: 1.0 },   // liftoff
  { p: 0.16, v: 0.55 },   // the light is leaving the ground
  { p: 0.22, v: 0.12 },
  { p: 0.32, v: 0.0 },
  { p: 1.0, v: 0.0 },
];

function rampAt(table, p) {
  const x = clamp(p, 0, 1);
  let i = 0;
  while (i < table.length - 2 && x >= table[i + 1].p) i++;
  const a = table[i];
  const b = table[i + 1];
  return a.v + (b.v - a.v) * smoothstep(a.p, b.p, x);
}

function envelopeAt(p) {
  return rampAt(ENVELOPE, p);
}

/* =========================================================================
   IGNITION
   =========================================================================

   The pad glow above says "something is here". This says "it has started",
   and it is the loudest thing in the whole layer for about four hundredths
   of the page.

   It exists because of a specific complaint: the vehicle used to arrive out
   of nothing. Fixing that by growing it from sub-pixel (flight.js does the
   growing) solves half the problem and creates the other half, because a
   speck growing out of an empty patch of ocean is still an event with no
   cause. The flash is the cause. The eye is pulled to the brightest thing
   in the frame, arrives at the pad while the vehicle is still too small to
   resolve, and is already looking at the right eighty pixels when something
   climbs out of them.

   Timing is the real sequence, not a dramatic invention. Engine start is at
   T-6.9 s and holddown release is at T-0: the five F-1s spend nearly seven
   seconds at full thrust with the vehicle still bolted to the pad, which is
   why the peak here sits at p 0.092 -- roughly T-4 -- and is already coming
   down by liftoff. The light blooms before anything moves. That is what
   happened.

   Two things about it are exaggerated and neither is hidden. The size: at
   the opening framing the peak is about a hundred and seventy pixels across,
   which on the ground is five hundred kilometres, and no ignition is five
   hundred kilometres wide. And the growth: it swells as it decays, in the
   manner of the steam cloud off the deluge system rather than of the flame,
   which is a real thing happening at a wildly unreal scale. Both are on
   /references/ with the rest of the exaggerations.

   Intensity and radius are deliberately two curves and not one. A single
   curve would tie the brightest instant to the biggest instant, and the
   whole read here is the opposite: a small hard white core first, spreading
   and cooling afterwards. */

const FLASH = [
  { p: 0.0, v: 0.0 },
  { p: 0.068, v: 0.0 },   // dark. the pad glow is doing all the work
  { p: 0.092, v: 1.0 },   // all five running, holddown arms still on
  { p: 0.118, v: 0.86 },  // liftoff, and the light starts to leave with it
  { p: 0.15, v: 0.34 },
  { p: 0.195, v: 0.0 },   // gone well before there is a rocket to look at
  { p: 1.0, v: 0.0 },
];

// It never draws at zero radius: the sprite is switched off by intensity,
// and a quad that collapses to a point on the way there would sparkle
// through one frame on its way out.
const FLASH_MIN_RADIUS_KM = 560;
const FLASH_MAX_RADIUS_KM = 1500;

function flashAt(p) {
  return rampAt(FLASH, p);
}

function flashRadiusKm(p) {
  const spread = smoothstep(FLASH[1].p, FLASH[5].p, clamp(p, 0, 1));
  return FLASH_MIN_RADIUS_KM + (FLASH_MAX_RADIUS_KM - FLASH_MIN_RADIUS_KM) * spread;
}

/* The core is a second, much smaller radius, and the reason it exists is
   worth writing down because it is a decision about the page and not about
   the rocket.

   The light is drawn in two places. The wide part -- the spread above --
   is a sprite in the scene, underneath the page's readability wash, which
   dims it to roughly a sixth. That is the correct place for it: a broad
   soft bloom sitting behind a column of type is exactly what the wash is
   for. The bright part is drawn in DOM above the wash, where nothing dims
   it, and that is the only way to get a light that actually looks like a
   light -- see flare.js.

   Which means the DOM half is the half that can hurt the text, so its size
   is a budget rather than a free choice. Measured: at the peak, with the
   bright half drawn at the full spread radius, the worst contrast cost to
   any line of type in the frame was 0.41 -- nothing. Two hundred and fifty
   pixels of scroll later, at a little over half intensity but nearly twice
   the radius, "Atmosphere & Altitude" went from 7.17 to 1.39. It was never
   the brightness that broke the page. It was the spreading, at the moment
   the light was too wide to be a light and too bright to be a background.

   So the bright half does not spread. The spreading, which is the part
   with no business over a paragraph, is left entirely to the sprite under
   the wash.

   Which leaves the question of what the core does instead, and the first
   answer here was wrong in an instructive way. It grew on its own ramp,
   120 km to 260 km, tracking the flame building rather than the light
   dying -- so it reached its widest at tower clear, at half intensity,
   which is precisely the frame where the camera has the directory's
   right-hand column under it. Measured cost to "Atmosphere & Altitude"
   there: 6.53 down to 2.46. Smaller than the spreading version's damage,
   and still a heading nobody can read.

   The fix is not a smaller number, it is the right curve. The core is the
   light at the pad, and after holddown release the flame is bolted to a
   rocket that is leaving: what is left on the ground shrinks as it dims,
   because it is the same event running down. So the radius rides the
   intensity directly. Brightest and widest at the same instant, and gone
   as a point rather than as a fading disc -- which is both what the pad
   actually does and, not coincidentally, what keeps the light off the type
   in the frames where the type has moved underneath it. */

/* One more difference between the two halves, and it is not a fudge to get
   a measurement down -- though it does that too.

   The wide half is scattered light: the deluge system puts something like
   a thousand cubic metres of water under the vehicle and the flame lights
   the steam, so the spill is a cloud that stays lit for a moment after the
   thing lighting it has gone. The core is the flame, and the flame leaves
   on the rocket. A source and its scattering do not decay together; the
   source goes first.

   Raising the intensity to a power is the cheapest way to say that -- it
   is exactly 1 where the curve is 1, so the peak is untouched, and it
   pulls the tail down hard. 1.8 was chosen against the contrast
   measurements: at tower clear the sharp half drops from 0.58 to 0.37 and
   the worst cost to any line of type in the frame falls with it. */

const FLASH_CORE_DECAY = 1.8;

function flashCoreAt(p) {
  return Math.pow(flashAt(p), FLASH_CORE_DECAY);
}

// Radius of the bright core, in kilometres, as a floor plus a swing the
// core's own intensity rides. The floor is not zero for the usual reason:
// the element is switched off by intensity, and something collapsing to a
// point on its way there sparkles through the last frame.
const FLASH_CORE_FLOOR_KM = 30;
const FLASH_CORE_SWING_KM = 170;

function flashCoreRadiusKm(p) {
  return FLASH_CORE_FLOOR_KM + FLASH_CORE_SWING_KM * flashCoreAt(p);
}

/* =========================================================================
   THE SPRITE TEXTURE
   =========================================================================

   Built as a DataTexture rather than by painting into a canvas, so this
   module stays free of the DOM and can be imported by the headless checks
   the same way the rest of the mission code can. */

function glowTexture(size = 64) {
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - c) / c;
      const dy = (y - c) / c;
      const r = Math.min(1, Math.hypot(dx, dy));

      // Two lobes. A single Gaussian reads as a fuzzy ball; a tight core
      // inside a wide, faint halo reads as a light source seen through air,
      // which is what this is meant to be.
      const core = Math.exp(-r * r * 26);
      const halo = Math.exp(-r * r * 3.2) * 0.35;

      // The (1 - r) factor drives the whole thing to exactly zero at the
      // inscribed circle, so the quad never shows its own square edge.
      const v = Math.min(1, core + halo) * (1 - r);

      const i = (y * size + x) * 4;
      data[i] = Math.round(255 * Math.min(1, v));
      data[i + 1] = Math.round(255 * Math.min(1, v * 0.84));
      data[i + 2] = Math.round(255 * Math.min(1, v * 0.64));
      data[i + 3] = Math.round(255 * v);
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/* The flash halo, which is the same idea with the core taken out.
   glowTexture's tight inner lobe is what makes the pad read as a point;
   this one is only the wide lobe, because the point is being drawn in DOM
   and two hard cores stacked on the same pixel would fight. What is left
   is the spill -- light in the air around the pad -- which is soft by
   nature and loses nothing by being drawn under the page's wash. */

function haloTexture(size = 64) {
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - c) / c;
      const dy = (y - c) / c;
      const r = Math.min(1, Math.hypot(dx, dy));

      const v = Math.exp(-r * r * 3.4) * (1 - r);

      const i = (y * size + x) * 4;
      data[i] = Math.round(255 * Math.min(1, v));
      data[i + 1] = Math.round(255 * Math.min(1, v * 0.8));
      data[i + 2] = Math.round(255 * Math.min(1, v * 0.58));
      data[i + 3] = Math.round(255 * v);
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/* ========================================================================= */

export function createLaunchSite({ latDeg, lonDeg }) {
  const current = { latDeg, lonDeg };
  const normal = latLonToUnitVector(latDeg, lonDeg);
  const surfaceNormal = new THREE.Vector3(normal.x, normal.y, normal.z);

  const texture = glowTexture();
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    blending: THREE.AdditiveBlending,

    // No depth testing, on purpose. The camera's near and far planes are 100
    // and 4,000,000 km, a depth range of forty thousand to one, and asking
    // that buffer to resolve a quad sitting 18 km off a 6,371 km sphere gets
    // you z-fighting rather than occlusion. Whether the pad is on the near
    // side is a question with an exact answer — see facing, below — so it is
    // answered directly instead of being handed to the depth buffer.
    depthTest: false,
    depthWrite: false,
    opacity: 0,
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.setScalar(GLOW_RADIUS_KM);
  sprite.renderOrder = 3;
  sprite.frustumCulled = false;

  // The glow hangs off a node at the pad rather than carrying its own copy
  // of the position, because the flare has to be measured from the same
  // point and a sprite is a bad place to hang anything: its matrix carries
  // the billboard rotation and its own quad scale, and a child inherits
  // both. The group is what everything outside this file treats as "the
  // launch site" -- what gets added to earthGroup, what setLocation moves,
  // and what worldPosition reports.
  const haloTex = haloTexture();
  const haloMaterial = new THREE.SpriteMaterial({
    map: haloTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    opacity: 0,
  });

  const halo = new THREE.Sprite(haloMaterial);
  halo.renderOrder = 2;
  halo.frustumCulled = false;

  const root = new THREE.Group();
  root.position.copy(surfaceNormal).multiplyScalar(EARTH_RADIUS_KM + LIFT_KM);
  // Halo first, so the pad's own point of light sits on top of its spill
  // rather than inside it.
  root.add(halo);
  root.add(sprite);

  // How much of the pad the camera can currently see: the product of the
  // limb test and the distance fade, recomputed every frame in update() and
  // kept here so screenFlare() can apply exactly the same occlusion without
  // doing the geometry twice.
  let seenNow = 0;

  const worldPos = new THREE.Vector3();
  const worldNormal = new THREE.Vector3();
  const toCamera = new THREE.Vector3();

  return {
    object3D: root,

    // Where the pad is, in latitude and longitude, and a way to move it.
    //
    // It moves because the brief no longer requires Florida. The vehicle
    // launches from wherever the opening framing happens to be looking, so
    // that a reader who arrives at the top of the page finds the pad on the
    // daylit face of the planet in front of them rather than round the far
    // side. scene.js re-picks the site on every prelaunch frame and freezes
    // it at engine start; see the note there for the trade that involves.
    //
    // The cost of moving it is that for as long as the site is being
    // re-picked, the glow holds still on screen while the coastlines travel
    // past underneath, because it is being kept at a fixed place in the
    // frame rather than at a fixed place on the ground. At the opening
    // framing the glow is a soft blob seventy-eight kilometres across with
    // no edge to register against, so there is nothing for the eye to catch
    // it slipping against; from engine start onwards it is nailed to the
    // ground and the slipping stops for good.
    get latDeg() {
      return current.latDeg;
    },
    get lonDeg() {
      return current.lonDeg;
    },

    setLocation(latDeg, lonDeg) {
      if (latDeg === current.latDeg && lonDeg === current.lonDeg) return;
      current.latDeg = latDeg;
      current.lonDeg = lonDeg;
      const n = latLonToUnitVector(latDeg, lonDeg);
      surfaceNormal.set(n.x, n.y, n.z);
      root.position.copy(surfaceNormal).multiplyScalar(EARTH_RADIUS_KM + LIFT_KM);
    },

    // Where the pad is right now, in world space, after the planet's
    // rotation has been applied. This is the hook the vehicle needs: it has
    // to leave from wherever the ground has carried the pad to.
    worldPosition(target) {
      return root.getWorldPosition(target || worldPos);
    },

    // The outward surface normal at the pad, also rotated. Straight up, as
    // far as anyone standing there is concerned.
    worldNormal(target) {
      const out = target || worldNormal;
      out.copy(surfaceNormal);
      root.parent && out.applyQuaternion(root.parent.quaternion);
      return out.normalize();
    },

    update({ cameraPosition, progress }) {
      root.getWorldPosition(worldPos);

      worldNormal.copy(surfaceNormal);
      if (root.parent) worldNormal.applyQuaternion(root.parent.quaternion);

      // Is the pad on the side of the planet facing us? The dot of the local
      // up against the direction to the camera is positive on the near side,
      // zero exactly at the limb, negative round the back. Fading it out
      // across the first quarter of that range means the light dims as it
      // approaches the horizon and is gone before it would have to clip
      // through the edge of the globe, which is also what it would really do
      // — that last bit of atmosphere is a long way to see through.
      toCamera.copy(cameraPosition).sub(worldPos).normalize();
      const facing = smoothstep(0.0, 0.26, worldNormal.dot(toCamera));

      // Distance. Sprites already shrink with perspective, so this is only
      // here to take the last sub-pixel sparkle away cleanly rather than
      // leaving it to flicker.
      const range = cameraPosition.length() - EARTH_RADIUS_KM;
      const near = 1 - smoothstep(FADE_START_KM, FADE_END_KM, range);

      seenNow = facing * near;

      // The wide half of the ignition light. Same intensity curve and the
      // same occlusion as everything else at the pad, so if the site turns
      // past the limb mid-flash the whole light goes round the back
      // together.
      const flash = flashAt(progress) * seenNow;
      haloMaterial.opacity = flash * 0.62;
      halo.visible = haloMaterial.opacity > 0.002;
      if (halo.visible) halo.scale.setScalar(flashRadiusKm(progress));

      material.opacity = envelopeAt(progress) * seenNow;
      sprite.visible = material.opacity > 0.002;
    },

    /* Where the ignition flare belongs on screen, and how hard.
     *
     * Returned in CSS pixels from the top-left of the canvas, so the caller
     * can hand it straight to a transform. `intensity` already carries the
     * limb occlusion, so a flare that fires as the pad turns past the
     * horizon goes round the back with the pad instead of hanging in the
     * sky where the pad used to be.
     *
     * The radius is the same kilometres the sprite version used, projected
     * the way a sprite would have been -- the flare is the size of a thing
     * on the ground at that distance, not a fixed number of pixels, so it
     * grows and shrinks with the framing exactly as everything else here
     * does. Returns null when there is nothing to draw, which is most of
     * the page.
     */
    screenFlare({ camera, width, height, progress }) {
      const intensity = flashCoreAt(progress) * seenNow;
      if (intensity <= 0.002) return null;

      root.getWorldPosition(worldPos);
      const distance = worldPos.distanceTo(camera.position);
      // Half the frame's height in kilometres at the pad's distance. The
      // camera's fov is vertical, which is why this is the height and not
      // the width.
      const halfKm = Math.tan((camera.fov * Math.PI) / 360) * distance;

      const ndc = worldPos.clone().project(camera);
      if (ndc.z > 1) return null;

      return {
        x: (ndc.x * 0.5 + 0.5) * width,
        y: (1 - (ndc.y * 0.5 + 0.5)) * height,
        radiusPx: (flashCoreRadiusKm(progress) / (2 * halfKm)) * height,
        intensity,
      };
    },

    dispose() {
      texture.dispose();
      material.dispose();
      haloTex.dispose();
      haloMaterial.dispose();
    },
  };
}

export {
  ENVELOPE,
  envelopeAt,
  FLASH,
  flashAt,
  flashCoreAt,
  flashCoreRadiusKm,
  flashRadiusKm,
  GLOW_RADIUS_KM,
};
