// The exhaust.
//
// THE BUG THIS FILE EXISTS TO NOT HAVE
//
// The brief names one specific failure from the previous attempt: the flame
// gets abruptly cut off. So the rule here is stronger than "fade it out
// nicely". There is no visibility flag on any plume in this file. Not one.
// Every plume mesh is added once and is drawn on every single frame from
// prelaunch to the Moon, and its length, its width, its brightness and its
// colour are read off continuous functions of scroll progress. At an engine
// cutoff the intensity reaches exactly zero because the throttle ramp
// reaches exactly zero, and the geometry is still there, drawing nothing.
//
// That is deliberately slightly wasteful — twenty-one draw calls (four main
// jets, sixteen small motors and one soot copy of the S-IC jet, all but the
// soot additive, plus the pad cloud sprites), most of them contributing no
// pixels most of the time — and it buys the one
// property that matters: there is no line of code anywhere that can turn a
// flame off, so no scroll position can catch one being turned off.
//
// A stage's plume disappears when that stage separates, and it disappears
// because the plume is a child of the stage's own mesh and the stage has
// left. It is not switched off; it is carried away. The engines have already
// been shut down for a moment by then, in every case, because that is the
// real order of events:
//
//   S-IC outboard cutoff   000:02:41  ->  S-IC/S-II staging  000:02:44
//   S-II  outboard cutoff  000:09:13  ->  S-II/S-IVB staging 000:09:15
//
// So the sequence a viewer sees is thrust tailing off, then the stage coming
// apart, which is the sequence that happened.
//
// Timings: Apollo 11 Flight Journal, NASA History Division,
// https://www.apollojournals.org/afj/ap11fj/01launch.html

import * as THREE from "three";

import { STACK_HEIGHT_M } from "./flight.js";
import { landingEffectsAt } from "./landing-effects.js";

/* =========================================================================
   GEOMETRY
   =========================================================================

   One unit cone, shared by everything. It runs from y = 0 at the throat to
   y = -1 at the tail with unit radius, and the vertex shader gives it its
   actual length, its radius profile and its expansion. Sharing it means the
   twenty-one jets cost one buffer between them. */

function makeCone(rings, segments) {
  const positions = new Float32Array((rings + 1) * (segments + 1) * 3);
  const indices = [];
  let k = 0;
  for (let i = 0; i <= rings; i++) {
    // Rings bunched toward the throat, where the shape actually changes.
    const v = Math.pow(i / rings, 1.35);
    for (let j = 0; j <= segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      positions[k++] = Math.cos(a);
      positions[k++] = -v;
      positions[k++] = Math.sin(a);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * (segments + 1) + j;
      const b = a + segments + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/* =========================================================================
   SHADERS
   ========================================================================= */

/* What the shaders are drawing, and why it is built this way.

   Each jet is still one cone, and a cone is a shell, so nothing here is a
   real volume. What the fragment shader does is stand in for one.

   Turbulence is a three-octave value noise in the plume's own metres,
   carried down the axis with uTime so the structure travels away from the
   engine instead of shimmering in place. The domain is x, y and z and not
   angle and length, so it is not a stripe pattern that repeats round the
   cone. It brightens and dims the flame and it also eats the rim, which is
   what breaks the silhouette up. The two upper octaves fade out as the noise
   cells get down to a pixel, using the screen-space derivative of the
   domain, so a plume that is only a few pixels across goes smooth and does
   not sparkle.

   The five F-1s are found by a ray. The camera looks through the shell at
   some point on it, and the fragment works out where that ray runs through
   the circle the plume has at this height, then adds up five soft jets at
   three points along that chord. That is enough to see five separate jets
   from the side and four round one from behind. The jets spread as they
   travel and run into each other a few bell diameters down, which is the
   shape the flame has in photographs: separate at the nozzles, one column
   below.

   The collar is the dark band at the lip. Additive blending cannot make
   anything darker, so for the S-IC the emission between the jets is turned
   down for the first few metres, and a second, normal-blended, nearly black
   copy of the same cone sits over it. It is a visual decision and not a
   measurement: a dark lip makes the five jets read as five separate things
   before they merge, and that is the only reason it is there. How long it is
   and how dark is chosen by eye and not read off anything.

   None of this decides whether anything is visible. Every term is a
   continuous function of uIntensity, which is the throttle. */

const COMMON = /* glsl */ `
  uniform float uOut;
  uniform float uBell;
  uniform float uCluster;

  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }

  float vnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float n000 = hash13(i);
    float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
    return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
               mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
  }

  // Three octaves around 0.5. fw is how many noise cells one pixel covers;
  // an octave whose cells are smaller than about half a pixel is faded to
  // its mean rather than left to alias.
  float fbm3(vec3 p, float fw) {
    float s = 0.0;
    float amp = 0.5;
    for (int k = 0; k < 3; k++) {
      float w = 1.0 - smoothstep(0.22, 0.65, fw);
      s += amp * (vnoise(p) - 0.5) * w;
      p = p * 2.03 + vec3(7.1, 3.7, 5.3);
      fw *= 2.03;
      amp *= 0.5;
    }
    return clamp(0.5 + s * 1.25, 0.0, 1.0);
  }

  // Five soft jets: four outboard on the axes and one in the middle. They
  // start narrower than the bells, spread with distance down the plume and
  // lose strength as they spread, so they read as five at the exit and as one
  // column further down. dist is in metres from the throat.
  //
  // What a pixel sees is a line through the plume, from P across to the far
  // side of the circle in direction D. The jet's glow along that line has a
  // closed form, a bell curve in the line's distance from the jet's axis, so
  // this takes that distance directly. Sampling three points along the chord
  // instead misses a jet a metre wide whenever the chord steps over it, and
  // the outboard engines went missing from the side that way.
  float jetLine(vec2 P, vec2 D, float chord, vec2 c, float inv) {
    vec2 w = c - P;
    float t = dot(w, D);
    float d2 = dot(w, w) - t * t;
    // Only count a jet that lies between the near surface and the far one.
    float within = smoothstep(-1.0, 0.5, t) * (1.0 - smoothstep(chord - 0.5, chord + 1.0, t));
    return exp(-d2 * inv) * within;
  }

  float jetsAlong(vec2 P, vec2 D, float dist) {
    float pd = dot(P, D);
    // Whichever side of the cone the rasteriser hands over, look toward the
    // middle of it.
    vec2 inward = pd < 0.0 ? D : -D;
    float chord = 2.0 * abs(pd);
    float spread = 1.0 + dist * 0.018;
    float rj = uBell * (0.42 + dist * 0.04);
    float inv = 1.0 / (rj * rj);
    float o = uOut * spread;
    float sum = jetLine(P, inward, chord, vec2(0.0), inv)
              + jetLine(P, inward, chord, vec2(o, 0.0), inv)
              + jetLine(P, inward, chord, vec2(-o, 0.0), inv)
              + jetLine(P, inward, chord, vec2(0.0, o), inv)
              + jetLine(P, inward, chord, vec2(0.0, -o), inv);
    return sum * exp(-dist / 34.0) / (1.0 + dist * 0.02);
  }
`;

const VERT = /* glsl */ `
  uniform float uLength;
  uniform float uRadius;
  uniform float uExpand;
  uniform float uNeck;
  uniform float uTime;
  uniform float uLump;

  varying float vV;
  varying float vFace;
  varying float vAngle;
  varying float vM;
  varying vec2 vLoc;
  varying vec2 vDir;

  void main() {
    float v = -position.y;
    vV = v;
    vM = v * uLength;
    vAngle = atan(position.z, position.x);

    // The radius profile. A pinch just past the throat (uNeck says how
    // deep: the F-1 cluster is wide at the exit, so it hardly pinches), a
    // flare that grows as the ambient pressure falls, and a close at the
    // tail so the plume ends in a point rather than in a cut-off tube.
    float neck  = uNeck + (1.0 - uNeck) * smoothstep(0.0, 0.10, v);
    float flare = 1.0 + uExpand * pow(v, 0.62);
    float taper = 1.0 - 0.62 * pow(v, 3.2);
    // Slow lobes in the radius, growing with distance, so the outline is
    // lumpy before the fragment shader has even touched it.
    float lobes = 1.0 + uLump * smoothstep(0.03, 0.5, v)
      * (0.6 * sin(vAngle * 3.0 + v * 13.0 - uTime * 2.3)
       + 0.4 * sin(vAngle * 5.0 - v * 21.0 - uTime * 3.1));
    float r = uRadius * neck * flare * taper * lobes;

    vec3 local = vec3(position.x * r, -v * uLength, position.z * r);
    vLoc = local.xz;
    vec3 camLocal = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
    vec2 toward = local.xz - camLocal.xz;
    vDir = toward / max(length(toward), 1e-4);
    vec4 world = modelMatrix * vec4(local, 1.0);

    // A slender emissive shell looks like a volume if it is brightest where
    // you are looking straight through it and dimmest at the silhouette,
    // which is the opposite of a rim light. The radial direction is a good
    // enough normal for something this slender.
    vec3 radial = normalize(mat3(modelMatrix) * vec3(position.x, 0.0, position.z));
    vec3 view = normalize(cameraPosition - world.xyz);
    vFace = pow(abs(dot(radial, view)), 0.85);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(local, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;

  uniform vec3 uCore;
  uniform vec3 uEdge;
  uniform vec3 uTail;
  uniform float uIntensity;
  uniform float uDiamonds;
  uniform float uPhase;
  uniform float uTime;
  uniform float uTurb;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uCollar;

  varying float vV;
  varying float vFace;
  varying float vAngle;
  varying float vM;
  varying vec2 vLoc;
  varying vec2 vDir;

  ${COMMON}

  void main() {
    float vac = 1.0 - uDiamonds;

    // Turbulence, carried down the axis.
    vec3 q = vec3(vLoc.x, vM - uTime * uSpeed, vLoc.y) / uScale;
    float fw = length(fwidth(q));
    float turb = fbm3(q, fw);
    // A second, slower and larger pass keeps the big shapes from lining up
    // with the small ones.
    float big = fbm3(q * 0.35 + vec3(3.0, 1.0, 9.0), fw * 0.35);

    // Colour: white-yellow at the exit, orange, then a deep smoky red.
    vec3 c = mix(uCore, uEdge, smoothstep(0.0, 0.40, vV));
    c = mix(c, uTail, smoothstep(0.34, 0.92, vV));

    // Mach diamonds. They exist because the exhaust is over- or
    // under-expanded against an ambient pressure, so they belong to the
    // lower atmosphere and uDiamonds carries them away with it.
    float shock = 1.0 + uDiamonds * 0.6 * exp(-vV * 7.0)
                      * (0.5 + 0.5 * cos(vV * 74.0 + uPhase));

    // The rim is eroded by the noise, more so further down the plume where
    // the flow has had time to break up, and it is softer in thin air.
    float ragged = uTurb * (0.25 + 0.75 * smoothstep(0.0, 0.45, vV));
    float soft = mix(0.20, 0.42, vac);
    // How far across the plume this pixel is, as a straight screen-space
    // fraction: 0 on the silhouette, 1 in the middle. vFace is a cosine and
    // is nearly flat until the very edge, so erosion measured in it only
    // nibbles a hair-thin sliver. The noise only moves the rim; in the middle
    // of the plume it is left alone, or the body of the flame would be full
    // of holes.
    float cosv = pow(vFace, 1.0 / 0.85);
    float across = 1.0 - sqrt(max(0.0, 1.0 - cosv * cosv));
    float rimOnly = 1.0 - smoothstep(0.3, 0.8, across);
    float edge = across + ((turb - 0.5) * 0.8 + (big - 0.5) * 0.5) * ragged * rimOnly;
    float m = smoothstep(0.0, soft, edge);

    float fall = (1.0 - smoothstep(0.4, 1.0, vV)) * exp(-vV * 0.4);
    float collar = uCollar > 0.0 ? mix(0.16, 1.0, smoothstep(0.0, uCollar, vM)) : 1.0;
    float lit = mix(1.0 - 0.55 * uTurb, 1.0 + 0.5 * uTurb, turb);
    // Just past the exit the gas between the jets is still dim, and it
    // brightens as the jets mix into it, so the five stay readable.
    float mixed = mix(0.2, 1.0, smoothstep(2.0, 26.0, vM));
    float bulk = vFace * fall * shock * lit * collar * m * (uCluster > 0.0 ? mixed : 1.0);

    float jets = 0.0;
    if (uCluster > 0.0 && vM < 90.0) {
      jets = jetsAlong(vLoc, vDir, vM) * vFace * 0.85 * (1.0 - vac * 0.6);
    }

    vec3 col = mix(c, uCore * 1.1, clamp(jets, 0.0, 1.0));
    float a = uIntensity * 0.9 * (bulk * 1.25 + jets * fall);
    // Soft ceiling, so the hottest part runs to white by way of cream and
    // not by clipping a whole region flat.
    a = 1.4 * (1.0 - exp(-a / 1.4));
    gl_FragColor = vec4(col, a);
  }
`;

// The dark band at the nozzle lip and the smoke at the rim. Normal blending,
// so it can take light away, which the additive flame cannot do. Same cone,
// same uniforms, so it cannot get out of step with the flame it sits on.
const SOOT_FRAG = /* glsl */ `
  precision highp float;

  uniform float uIntensity;
  uniform float uTime;
  uniform float uTurb;
  uniform float uScale;
  uniform float uSpeed;
  uniform float uCollar;
  uniform float uDiamonds;

  varying float vV;
  varying float vFace;
  varying float vAngle;
  varying float vM;
  varying vec2 vLoc;
  varying vec2 vDir;

  ${COMMON}

  void main() {
    vec3 q = vec3(vLoc.x, vM - uTime * uSpeed, vLoc.y) / uScale;
    float turb = fbm3(q * 0.8 + vec3(11.0, 2.0, 5.0), length(fwidth(q)) * 0.8);

    float jets = jetsAlong(vLoc, vDir, vM) * vFace * 0.85;
    float lip = (1.0 - smoothstep(0.0, uCollar * 1.3, vM)) * (1.0 - clamp(jets * 1.6, 0.0, 1.0));
    lip *= smoothstep(0.0, 0.3, vFace);

    float rim = (1.0 - smoothstep(0.0, 0.3, 1.0 - sqrt(max(0.0, 1.0 - pow(vFace, 2.35))) + (turb - 0.5) * 0.3))
              * smoothstep(0.07, 0.4, vV) * (1.0 - smoothstep(0.55, 0.95, vV))
              * turb * turb * 1.6;

    float gate = clamp(uIntensity * 2.0, 0.0, 1.0);
    float across = 1.0 - sqrt(max(0.0, 1.0 - pow(vFace, 2.35)));
    float a = gate * smoothstep(0.12, 0.5, across)
            * (0.62 * lip + 0.1 * rim * (1.0 - 0.5 * (1.0 - uDiamonds)));
    gl_FragColor = vec4(0.07, 0.03, 0.012, a);
  }
`;

/* =========================================================================
   THE JETS
   =========================================================================

   Lengths and radii are in model metres on the Saturn V, which is the frame
   the vehicle's geometry is in.

   These are drawn sizes, not measured ones. An F-1 cluster's visible plume
   ran to several vehicle lengths at altitude and its exact extent depended
   on ambient pressure through the whole climb; 130 m is chosen to read as
   enormous at the size this is drawn without swamping the vehicle it is
   pushing. The references page says so. */

const MAIN = [
  {
    key: "lm", parent: "lm", y: -2.3, length: 7, radius: 0.48,
    // An understated vacuum exhaust, attached to the lander's own attitude.
    // Visibility and dimensions are illustrative, not measured radiance.
    core: [0.82, 0.87, 1.0], edge: [0.38, 0.45, 0.65], gain: 0.24, vac: 2.8,
    look: { turb: 0.25, scale: 1.2, speed: 14, lump: 0.03 },
  },
  {
    key: "sic", parent: "sic", y: 1.2, length: 130, radius: 7.6,
    // RP-1 and LOX: a sooty, brilliant orange-white flame. This is the one
    // everybody has seen.
    core: [1.00, 0.94, 0.74], edge: [1.00, 0.42, 0.10], gain: 1.00, vac: 3.1,
    // The cluster. The outboard engines sit 4.4 m off the axis and the bells
    // are about 1.9 m in radius; both were measured off the vehicle model's
    // own mesh (looking up the stack from underneath), so the jets line up
    // with the bells that are drawn and are not the real engine spacing.
    // The tail is a deep smoky red-orange, and the collar is the length in
    // metres over which the lip stays dark.
    look: {
      turb: 1.0, scale: 4.2, speed: 38, lump: 0.07, neck: 0.95,
      cluster: true, out: 4.4, bell: 1.9, collar: 7, soot: true,
      tail: [0.60, 0.17, 0.06],
    },
  },
  {
    key: "sii", parent: "sii", y: 45.6, length: 48, radius: 3.3,
    // Hydrogen and LOX burn nearly clear. The real J-2 cluster is close to
    // invisible in daylight; drawn at full transparency it would read as a
    // broken engine, so it is a pale blue-white, faint but present.
    core: [0.86, 0.93, 1.00], edge: [0.42, 0.56, 0.96], gain: 0.52, vac: 1.5,
    look: { turb: 0.5, scale: 6, speed: 26, lump: 0.04 },
  },
  {
    key: "sivb", parent: "sivb", y: 69.8, length: 33, radius: 2.2,
    core: [0.88, 0.94, 1.00], edge: [0.44, 0.58, 0.97], gain: 0.48, vac: 1.7,
    look: { turb: 0.45, scale: 5, speed: 24, lump: 0.04 },
  },
];

// The small motors that make a separation read as a separation. Retros push
// the spent stage back, so they point forward; ullage motors settle the
// propellant in the stage about to light, so they point aft. Four of each,
// spaced at ninety degrees, which is how they were mounted.
const AUX = [
  { key: "sicRetro",   parent: "sic",   y: 38.4, radius: 5.3, forward: true,  length: 11, width: 1.15 },
  { key: "siiUllage",  parent: "sii",   y: 45.4, radius: 5.4, forward: false, length: 8,  width: 0.85 },
  { key: "siiRetro",   parent: "sii",   y: 71.8, radius: 5.2, forward: true,  length: 10, width: 1.05 },
  { key: "sivbUllage", parent: "sivb", y: 69.6, radius: 3.5, forward: false, length: 7,  width: 0.75 },
];

/* The cloud at the pad.
 *
 * A cone pointing down the vehicle's axis is the right shape for exhaust in
 * flight and the wrong shape for exhaust at liftoff, because at liftoff
 * there is a planet four metres below the engine bells and the exhaust has
 * nowhere to go but sideways. Drawn as a cone it goes into the ground: the
 * first render of this showed a Saturn V at full thrust with no visible
 * flame at all, because four hundred kilometres of drawn plume were inside
 * the Earth with the depth buffer correctly hiding every bit of it.
 *
 * So the main plume is clamped to the room it actually has, and what fills
 * the gap is this: a bright cloud around the base, at its strongest while
 * the vehicle is still on the pad and gone by the time it is a length and a
 * half up. That is also what the real thing looks like -- the flame trench
 * throws the exhaust sideways and the pad disappears into it.
 */
function cloudTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  // One bright centre and a ring of lobes round it at fixed, uneven spacing,
  // so the sprite is lumpy and turning it shows a different outline from every
  // angle. The lobes are fixed numbers and not random, so the texture is the
  // same on every load.
  const lobes = [
    [0.50, 0.50, 0.50, 1.0],
    [0.30, 0.42, 0.26, 0.55], [0.68, 0.34, 0.24, 0.5], [0.74, 0.62, 0.27, 0.55],
    [0.44, 0.74, 0.25, 0.5], [0.22, 0.66, 0.20, 0.4], [0.58, 0.20, 0.19, 0.4],
  ];
  for (const [x, y, r, k] of lobes) {
    const g = ctx.createRadialGradient(x * size, y * size, 0, x * size, y * size, r * size);
    g.addColorStop(0.0, `rgba(255,246,228,${k})`);
    g.addColorStop(0.22, `rgba(255,214,150,${0.72 * k})`);
    g.addColorStop(0.55, `rgba(224,150,80,${0.26 * k})`);
    g.addColorStop(1.0, "rgba(180,110,60,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const CLOUD_Y = 12;      // model metres up the stack, so it wraps the base
const CLOUD_SPAN = 145;  // model metres across at full spread
// Three sprites share the one texture and turn at different speeds and in
// different directions, each a different size, so the cloud is always
// changing shape slowly and never repeats on a short cycle. Share is the
// fraction of the cloud's brightness each one carries; the shares add to one.
const CLOUD_LAYERS = [
  { size: 1.00, share: 0.46, turn: 0.07, start: 0.0, lift: 0.0 },
  { size: 0.82, share: 0.30, turn: -0.11, start: 2.1, lift: 0.04 },
  { size: 1.18, share: 0.24, turn: 0.045, start: 4.0, lift: -0.03 },
];

const AUX_CORE = [1.0, 0.95, 0.80];
const AUX_EDGE = [1.0, 0.66, 0.30];
const TILT = 0.30; // radians the small motors are canted away from the body

/**
 * Build the exhaust and hang it off the vehicle's own meshes.
 *
 * @param {Map<string, THREE.Object3D>} meshes  the vehicle's five bodies
 */
// smoothstep, locally, so this file does not reach into mission.js for one
// three-line function it uses twice.
function smoothstep01(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function createPlume({ meshes }) {
  const geometry = makeCone(26, 28);
  const jets = [];
  const materials = [];

  function addJet({ parent, position, quaternion, length, radius, core, edge, phase, look = {} }) {
    const host = meshes.get(parent);
    if (!host) return null;
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uLength: { value: length },
        uRadius: { value: radius },
        uExpand: { value: 0.2 },
        uCore: { value: new THREE.Color().fromArray(core) },
        uEdge: { value: new THREE.Color().fromArray(edge) },
        uIntensity: { value: 0 },
        uDiamonds: { value: 1 },
        uPhase: { value: phase },
        uTime: { value: 0 },
        uTail: { value: new THREE.Color().fromArray(look.tail || edge) },
        uTurb: { value: look.turb ?? 0.5 },
        uScale: { value: look.scale ?? 2 },
        uSpeed: { value: look.speed ?? 20 },
        uLump: { value: look.lump ?? 0.04 },
        uNeck: { value: look.neck ?? 0.52 },
        uCollar: { value: look.collar ?? 0 },
        uCluster: { value: look.cluster ? 1 : 0 },
        uOut: { value: look.out ?? 4 },
        uBell: { value: look.bell ?? 2 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    if (quaternion) mesh.quaternion.copy(quaternion);
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    host.add(mesh);
    materials.push(material);
    if (look.soot) {
      // The soot shares the flame's uniforms outright, so it is the same
      // shape at the same throttle by construction. It is drawn after the
      // flame so it can darken it.
      const sootMaterial = new THREE.ShaderMaterial({
        uniforms: material.uniforms,
        vertexShader: VERT,
        fragmentShader: SOOT_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.FrontSide,
      });
      const soot = new THREE.Mesh(geometry, sootMaterial);
      soot.position.copy(position);
      soot.frustumCulled = false;
      soot.renderOrder = 5;
      host.add(soot);
      materials.push(sootMaterial);
    }
    return { mesh, material, baseLength: length };
  }

  for (const spec of MAIN) {
    const jet = addJet({
      parent: spec.parent,
      position: new THREE.Vector3(0, spec.y, 0),
      quaternion: null,
      length: spec.length,
      radius: spec.radius,
      core: spec.core,
      edge: spec.edge,
      phase: 0,
      look: spec.look,
    });
    if (jet) jets.push({ ...jet, kind: "main", spec });
  }

  const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
  for (const spec of AUX) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const dirX = Math.cos(a);
      const dirZ = Math.sin(a);
      // Cant the jet outward from the body, then, for a retro, turn the
      // whole thing to point forward.
      const q = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(-dirZ, 0, dirX).normalize(),
        spec.forward ? -TILT : TILT
      );
      if (spec.forward) q.multiply(flip);
      const jet = addJet({
        parent: spec.parent,
        position: new THREE.Vector3(dirX * spec.radius, spec.y, dirZ * spec.radius),
        quaternion: q,
        length: spec.length,
        radius: spec.width,
        core: AUX_CORE,
        edge: AUX_EDGE,
        phase: i * 1.7,
        look: { turb: 0.5, scale: 1.5, speed: 12, lump: 0.05 },
      });
      if (jet) jets.push({ ...jet, kind: "aux", spec });
    }
  }

  const cloudMap = cloudTexture();
  const cloudMaterial = new THREE.SpriteMaterial({
    map: cloudMap,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    // Same reasoning as the pad light in launchsite.js: the depth range here
    // is forty thousand to one, and asking it to resolve a quad sitting on
    // the surface against the surface gets z-fighting rather than occlusion.
    depthTest: false,
    opacity: 0,
  });
  const clouds = [];
  const sicMesh = meshes.get("sic");
  for (const layer of CLOUD_LAYERS) {
    // Each layer gets its own material because a sprite's rotation lives on
    // the material, but they all point at the one texture.
    const material = cloudMaterial.clone();
    const sprite = new THREE.Sprite(material);
    sprite.position.set(0, CLOUD_Y + layer.lift * CLOUD_SPAN, 0);
    sprite.scale.setScalar(CLOUD_SPAN * layer.size);
    sprite.renderOrder = 3;
    sprite.frustumCulled = false;
    if (sicMesh) sicMesh.add(sprite);
    clouds.push({ sprite, material, layer });
  }

  /**
   * One frame. Reads the flight profile and writes uniforms. There is no
   * branch in here that hides anything.
   */
  function update({ flight, elapsed = 0 }) {
    // Ambient pressure, as far as this needs it: how far the vehicle is
    // above the part of the atmosphere that shapes a plume. Uses the real
    // altitude, not the drawn one, because it is physics and not framing.
    const vacuum = Math.min(1, Math.max(0, (flight.realAltitudeKm - 3) / 62));

    // How much room there is under the engines before the ground, in model
    // metres. flight.clearance is in drawn vehicle lengths, so this converts
    // it into the units the plume geometry is authored in.
    const room = flight.clearance * STACK_HEIGHT_M;

    // The pad cloud: full while the vehicle is sitting on the ground, gone
    // once it is a length and a half up. It follows the S-IC throttle, so it
    // builds through the hold-down and never appears without thrust behind
    // it -- and, like everything else here, it has no on/off anywhere.
    // The cloud has to carry the whole low-altitude stretch on its own,
    // because the visible length of the main plume there is not what the
    // clamp allows but simply how much room there is above the ground: put
    // any more in and the depth buffer eats the surplus. So this does not
    // fade out as the vehicle clears the pad -- it grows and thins, the way
    // the column does, and hands over to the plume around a length up.
    const onPad = 1 - smoothstep01(0.05, 1.35, flight.clearance);
    const cloudOpacity = flight.throttle.sic * onPad * flight.presence * 0.5;
    const cloudSpan = CLOUD_SPAN * (0.6 + 0.4 * flight.throttle.sic) * (1 + 0.9 * Math.min(1, flight.clearance));
    for (const c of clouds) {
      c.material.opacity = cloudOpacity * c.layer.share * 1.3;
      c.sprite.scale.setScalar(cloudSpan * c.layer.size);
      c.material.rotation = c.layer.start + elapsed * c.layer.turn;
    }

    for (const jet of jets) {
      const u = jet.material.uniforms;
      u.uTime.value = elapsed;
      const level = jet.kind === "main"
        ? (jet.spec.key === "lm" ? landingEffectsAt(flight.getSeconds).throttle : flight.throttle[jet.spec.key])
        : flight.auxiliary[jet.spec.key];

      if (jet.kind === "main") {
        u.uIntensity.value = Math.pow(level, 0.82) * jet.spec.gain * flight.presence;
        // Throttling down shortens the plume as well as dimming it. Both
        // reach zero together, and both are continuous in p, so the flame
        // shrinks into the bell rather than stopping.
        // Never longer than the room it has. Without this the plume runs
        // into the planet at liftoff and the depth buffer eats all of it.
        const want = jet.baseLength * Math.pow(level, 0.5) * (0.72 + 0.55 * vacuum);
        u.uLength.value = jet.spec.parent === "sic" ? Math.min(want, room * 0.92 + 3) : want;
        // Expansion is tied to throttle as well as to ambient pressure. It
        // has to be: a plume that keeps its full vacuum flare while its
        // length collapses is a mushroom, and that is exactly what the
        // S-IC tail-off looked like before this line -- a squat pink ball
        // under the vehicle for the last four seconds of the burn.
        u.uExpand.value = (0.18 + jet.spec.vac * vacuum) * (0.35 + 0.65 * level);
        u.uDiamonds.value = 1 - vacuum;
      } else {
        // Small motors fire in vacuum and have no shock structure worth
        // drawing at this size.
        u.uIntensity.value = level * 0.75 * flight.presence;
        u.uLength.value = jet.baseLength * Math.pow(level, 0.4);
        u.uExpand.value = 1.4;
        u.uDiamonds.value = 0;
      }
    }
  }

  function dispose() {
    cloudMap.dispose();
    cloudMaterial.dispose();
    for (const c of clouds) c.material.dispose();
    geometry.dispose();
    for (const material of materials) material.dispose();
  }

  return { update, dispose, jetCount: jets.length };
}
