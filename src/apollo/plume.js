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
// That is deliberately slightly wasteful — nineteen additive draw calls, most
// of them contributing no pixels most of the time — and it buys the one
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
   nineteen jets cost one buffer between them. */

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

const VERT = /* glsl */ `
  uniform float uLength;
  uniform float uRadius;
  uniform float uExpand;

  varying float vV;
  varying float vFace;
  varying float vAngle;

  void main() {
    float v = -position.y;
    vV = v;
    vAngle = atan(position.z, position.x);

    // The radius profile. A pinch just past the throat, a flare that grows
    // as the ambient pressure falls, and a close at the tail so the plume
    // ends in a point rather than in a cut-off tube.
    float neck  = 0.52 + 0.48 * smoothstep(0.0, 0.10, v);
    float flare = 1.0 + uExpand * pow(v, 0.62);
    float taper = 1.0 - 0.62 * pow(v, 3.2);
    float r = uRadius * neck * flare * taper;

    vec3 local = vec3(position.x * r, -v * uLength, position.z * r);
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
  uniform float uIntensity;
  uniform float uDiamonds;
  uniform float uPhase;
  uniform float uTime;

  varying float vV;
  varying float vFace;
  varying float vAngle;

  void main() {
    vec3 c = mix(uCore, uEdge, smoothstep(0.0, 0.52, vV));

    // Mach diamonds. They exist because the exhaust is over- or
    // under-expanded against an ambient pressure, so they belong to the
    // lower atmosphere and uDiamonds carries them away with it.
    float shock = 1.0 + uDiamonds * 0.6 * exp(-vV * 7.0)
                      * (0.5 + 0.5 * cos(vV * 74.0 + uPhase));

    // Flowing structure keeps an engine alive when scrolling pauses.
    // Throttle still controls all ignition/cutoff boundaries exactly.
    float flow = 0.88 + 0.08 * sin(vV * 36.0 - uTime * 12.0 + uPhase)
      + 0.04 * sin(vV * 71.0 - uTime * 19.0 + vAngle * 3.0);
    float fall = (1.0 - smoothstep(0.28, 1.0, vV)) * exp(-vV * 0.65);
    float a = uIntensity * vFace * fall * shock * flow;

    gl_FragColor = vec4(c, a);
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
  },
  {
    key: "sic", parent: "sic", y: 1.2, length: 130, radius: 6.6,
    // RP-1 and LOX: a sooty, brilliant orange-white flame. This is the one
    // everybody has seen.
    core: [1.00, 0.94, 0.74], edge: [1.00, 0.42, 0.10], gain: 1.00, vac: 3.1,
  },
  {
    key: "sii", parent: "sii", y: 45.6, length: 48, radius: 3.3,
    // Hydrogen and LOX burn nearly clear. The real J-2 cluster is close to
    // invisible in daylight; drawn at full transparency it would read as a
    // broken engine, so it is a pale blue-white, faint but present.
    core: [0.86, 0.93, 1.00], edge: [0.42, 0.56, 0.96], gain: 0.52, vac: 1.5,
  },
  {
    key: "sivb", parent: "sivb", y: 69.8, length: 33, radius: 2.2,
    core: [0.88, 0.94, 1.00], edge: [0.44, 0.58, 0.97], gain: 0.48, vac: 1.7,
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
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, "rgba(255,246,228,1)");
  g.addColorStop(0.22, "rgba(255,214,150,0.72)");
  g.addColorStop(0.55, "rgba(224,150,80,0.26)");
  g.addColorStop(1.0, "rgba(180,110,60,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const CLOUD_Y = 12;      // model metres up the stack, so it wraps the base
const CLOUD_SPAN = 145;  // model metres across at full spread

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
  const geometry = makeCone(26, 20);
  const jets = [];
  const materials = [];

  function addJet({ parent, position, quaternion, length, radius, core, edge, phase }) {
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
  const cloud = new THREE.Sprite(cloudMaterial);
  cloud.position.set(0, CLOUD_Y, 0);
  cloud.scale.setScalar(CLOUD_SPAN);
  cloud.renderOrder = 3;
  cloud.frustumCulled = false;
  const sicMesh = meshes.get("sic");
  if (sicMesh) sicMesh.add(cloud);

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
    cloudMaterial.opacity = flight.throttle.sic * onPad * flight.presence * 0.5;
    cloud.scale.setScalar(
      CLOUD_SPAN * (0.6 + 0.4 * flight.throttle.sic) * (1 + 0.9 * Math.min(1, flight.clearance)),
    );

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
    geometry.dispose();
    for (const material of materials) material.dispose();
  }

  return { update, dispose, jetCount: jets.length };
}
