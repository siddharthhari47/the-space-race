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

function envelopeAt(p) {
  const x = clamp(p, 0, 1);
  let i = 0;
  while (i < ENVELOPE.length - 2 && x >= ENVELOPE[i + 1].p) i++;
  const a = ENVELOPE[i];
  const b = ENVELOPE[i + 1];
  return a.v + (b.v - a.v) * smoothstep(a.p, b.p, x);
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

/* ========================================================================= */

export function createLaunchSite({ latDeg, lonDeg }) {
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
  sprite.position.copy(surfaceNormal).multiplyScalar(EARTH_RADIUS_KM + LIFT_KM);
  sprite.scale.setScalar(GLOW_RADIUS_KM);
  sprite.renderOrder = 3;
  sprite.frustumCulled = false;

  const worldPos = new THREE.Vector3();
  const worldNormal = new THREE.Vector3();
  const toCamera = new THREE.Vector3();

  return {
    object3D: sprite,

    // Where the pad is right now, in world space, after the planet's
    // rotation has been applied. This is the hook the vehicle needs: it has
    // to leave from wherever the ground has carried the pad to.
    worldPosition(target) {
      return sprite.getWorldPosition(target || worldPos);
    },

    // The outward surface normal at the pad, also rotated. Straight up, as
    // far as anyone standing there is concerned.
    worldNormal(target) {
      const out = target || worldNormal;
      out.copy(surfaceNormal);
      sprite.parent && out.applyQuaternion(sprite.parent.quaternion);
      return out.normalize();
    },

    update({ cameraPosition, progress }) {
      sprite.getWorldPosition(worldPos);

      worldNormal.copy(surfaceNormal);
      if (sprite.parent) worldNormal.applyQuaternion(sprite.parent.quaternion);

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

      material.opacity = envelopeAt(progress) * facing * near;
      sprite.visible = material.opacity > 0.002;
    },

    dispose() {
      texture.dispose();
      material.dispose();
    },
  };
}

export { ENVELOPE, envelopeAt, GLOW_RADIUS_KM };
