// The Saturn V: loading NASA's model, painting it, and flying it.
//
// The geometry is NASA's own -- their public-domain 3D-printable Saturn V,
// reassembled and reduced by tools/build-saturnv.py, which carries the full
// provenance and the licence position. It arrives as six bodies, because six
// things come apart over the mission: the S-IC, the interstage, the S-II and
// the escape tower on the way up, and then, days later, the S-IVB and the
// command and service module. The lander is a seventh body from a second
// file -- NASA's Lunar Module model, packed by tools/build-lm.py into the
// same format -- because it is a different model and not part of the rocket.
//
// The model has no texture coordinates, and does not need any. The black
// roll pattern -- which at a hundred and fifty pixels is the single thing
// that makes this read as a Saturn V rather than as a white stick -- is
// defined on the real vehicle in exactly the coordinates a body of
// revolution already has: bands at particular heights, panels at particular
// angles. The shader derives both from object-space position. No unwrap
// could describe it more directly, and storing UVs would only be storing
// the answer to a question the geometry already answers.

import * as THREE from "three";

import { LM_CENTRE_M, STACK_HEIGHT_M } from "./flight.js";

/* =========================================================================
   THE PAINT
   =========================================================================

   Read off NASA photograph 69-HC-... of the Apollo 11 launch, 16 July 1969,
   from the Apollo 11 image gallery at

     https://www.nasa.gov/wp-content/uploads/static/history/ap11ann/kippsphotos/apollo.html

   Used as reference only. Nothing here is a sampled photograph and no
   rendered frame on this site is presented as one -- the pattern below is
   painted arithmetically, which is the whole reason it can be read off a
   photograph without reproducing it.

   What the photograph shows, top to bottom: a dark escape tower and a dark
   metallic command module; a light service module with a narrow dark band
   near its base; a white S-II carrying UNITED STATES vertically in red; a
   broad black interstage, broken into panels with white between them; and
   a white S-IC with USA in red low down and black panels at its skirts.

   The lettering is not painted. At the size this is drawn, UNITED STATES is
   about two pixels tall, and two pixels of red mush is worse than nothing.

   Heights are metres above the engine plane, on the assembled model. */

const PAINT = /* glsl */ `
  // A band with soft edges, in metres.
  float band(float y, float lo, float hi, float soft) {
    return smoothstep(lo - soft, lo + soft, y) - smoothstep(hi - soft, hi + soft, y);
  }

  // Four panels at ninety degrees, the way the roll pattern is actually
  // laid out. cos(2a) is +/-1 four times around, so this is 1 on the
  // quadrant centres and 0 in the gaps between them.
  float quadrants(float a, float width) {
    return smoothstep(1.0 - width, 1.0 - width * 0.45, abs(cos(2.0 * a)));
  }

  vec3 paint(float y, float a) {
    vec3 white = vec3(0.855, 0.858, 0.845);
    vec3 black = vec3(0.055, 0.058, 0.065);
    vec3 grey  = vec3(0.470, 0.480, 0.500);

    vec3 c = white;
    float q = quadrants(a, 0.62);

    // S-IC. Dark aft skirt and engine fairings, then panels at the
    // intertank and again at the forward skirt.
    c = mix(c, black, band(y,  0.0,  3.6, 0.5));
    c = mix(c, black, band(y, 17.5, 21.0, 0.4) * q);
    c = mix(c, black, band(y, 35.8, 40.4, 0.4) * q);

    // The interstage: black, with white left between the panels. This is
    // the widest dark thing on the vehicle and it is what the eye finds.
    c = mix(c, black, band(y, 40.5, 49.1, 0.5) * (0.35 + 0.65 * q));

    // S-II forward skirt.
    c = mix(c, black, band(y, 68.6, 73.5, 0.4) * q);

    // Service module: light, with a narrow dark band low down.
    c = mix(c, grey * 1.55, band(y, 73.6, 95.4, 1.2));
    c = mix(c, black, band(y, 87.6, 90.4, 0.35));

    // Command module, then the tower, both dark and metallic.
    c = mix(c, grey * 0.86, band(y, 95.4,  98.6, 0.5));
    c = mix(c, grey * 0.62, band(y, 98.6, 111.0, 0.5));
    return c;
  }

  // THE LANDER, in its own metres: -3.52 at the footpads, +3.52 at the
  // docking hatch, with the descent stage below about -0.6 and the ascent
  // stage above it. Not read off any one photograph; this is the vehicle's
  // general and well-known livery -- a descent stage and legs wrapped in
  // amber insulating foil with darker panels among it, pale footpads, and an
  // ascent stage of grey panels that darken towards the docking tunnel.
  //
  // The foil is what makes it read as the Lunar Module at a distance, and
  // foil is never flat. A hash of position, quantised to cells a fifth of a
  // metre across, varies its brightness cell by cell; the sheen term below
  // does the rest.
  float landerFoil(float y) {
    return 1.0 - smoothstep(-0.70, -0.45, y);
  }

  vec3 paintLander(float y, float a, float r, vec3 obj) {
    vec3 gold   = vec3(0.80, 0.58, 0.22);
    vec3 amber  = vec3(0.46, 0.30, 0.10);
    vec3 black  = vec3(0.06, 0.06, 0.07);
    vec3 grey   = vec3(0.60, 0.61, 0.63);
    vec3 pale   = vec3(0.76, 0.77, 0.78);

    float cell = fract(sin(dot(floor(obj * 5.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);

    vec3 descent = mix(gold, amber, 0.35 * quadrants(a + 0.3927, 0.5));
    descent *= 0.80 + 0.40 * cell;
    descent = mix(descent, black, band(y, -2.2, -1.2, 0.15) * quadrants(a, 0.25) * step(r, 2.4));

    vec3 ascent = grey * (0.94 + 0.12 * cell);
    ascent = mix(ascent, grey * 0.5, smoothstep(2.2, 2.9, y));

    vec3 c = mix(descent, ascent, 1.0 - landerFoil(y));
    c = mix(c, pale, 1.0 - smoothstep(-3.25, -3.05, y));
    return c;
  }
`;

const VERT = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying float vHeight;
  varying float vAngle;
  varying vec3 vObj;

  void main() {
    vObj = position;
    vHeight = position.y;
    vAngle = atan(position.z, position.x);
    // Uniform scale throughout, so the model matrix's upper 3x3 rotates
    // normals correctly once renormalised. This has to be world space and
    // not view space: the sun is fixed in the world while the planet, and
    // the vehicle standing on it, turn underneath it.
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    // modelViewMatrix is composed on the CPU in doubles. Multiplying a
    // 380,000 km world position by viewMatrix on the GPU loses the small
    // offsets that separate the footpads from the lunar ground.
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;

  uniform vec3 uSun;
  uniform vec3 uCamera;
  uniform float uOpacity;
  uniform float uScorch;
  uniform float uLander;

  varying vec3 vObj;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPos;
  varying float vHeight;
  varying float vAngle;

  ${PAINT}

  void main() {
    vec3 n = normalize(vWorldNormal);
    vec3 base = uLander > 0.5
      ? paintLander(vHeight, vAngle, length(vObj.xz), vObj)
      : paint(vHeight, vAngle);

    // Sunlight, and a weak fill from the planet below so the shadowed side
    // is dark rather than absent. A launch vehicle against space has almost
    // no ambient light, but almost none is not none, and a silhouette with
    // a completely black half reads as a hole rather than as a rocket.
    float lambert = max(dot(n, uSun), 0.0);
    vec3 lit = base * (vec3(0.075, 0.085, 0.11) + vec3(1.08, 1.04, 0.98) * lambert);

    // A little specular on the metallic upper stages, which is most of what
    // separates the service module from a white cylinder.
    vec3 view = normalize(uCamera - vWorldPos);
    vec3 half_ = normalize(view + uSun);
    // On the lander the foil takes the specular instead, broader and
    // warmer, which is the glint every photograph of Eagle in sunlight has.
    float foil = uLander * landerFoil(vHeight);
    float shine = mix(smoothstep(70.0, 86.0, vHeight), 0.35 + 0.65 * foil, uLander);
    float spec = pow(max(dot(n, half_), 0.0), mix(42.0, 16.0, foil)) * shine;
    vec3 sheen = mix(vec3(0.85, 0.87, 0.92), vec3(1.0, 0.78, 0.40), foil);
    lit += sheen * spec * mix(0.45, 0.9, foil) * step(0.001, lambert);

    // Rim, so the unlit edge separates from the sky.
    float rim = pow(1.0 - max(dot(n, view), 0.0), 3.0);
    lit += vec3(0.30, 0.36, 0.46) * rim * 0.24;

    // Staging scorch: the S-II's plume plays straight onto the S-IC's
    // forward end for the moment they are still close, and the interstage
    // rides down through it. Darkening the top of whatever has just been
    // discarded is a cheap way to say so.
    lit *= 1.0 - uScorch * smoothstep(0.0, 1.0, vHeight / 60.0) * 0.55;

    gl_FragColor = vec4(lit, uOpacity);
    #include <colorspace_fragment>
  }
`;

/* =========================================================================
   THE BINARY
   ========================================================================= */

/** Decode the packed model that tools/build-saturnv.py writes. */
function decode(buffer) {
  const bytes = new Uint8Array(buffer);
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== "SATV") throw new Error("not a Saturn V model file");

  const view = new DataView(buffer);
  const headerLength = view.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + headerLength)));
  const base = 8 + headerLength;

  const parts = new Map();
  for (const part of header.parts) {
    const n = part.count;

    // Positions are 16-bit fractions of the body's own bounding box. The
    // dequantisation happens once here rather than per frame in a shader,
    // because it costs nothing at load and keeps the vertex shader honest.
    const q = new Uint16Array(buffer, base + part.pos, n * 3);
    const lo = part.min;
    const span = [part.max[0] - lo[0], part.max[1] - lo[1], part.max[2] - lo[2]];
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      positions[i * 3 + 0] = lo[0] + (q[i * 3 + 0] / 65535) * span[0];
      positions[i * 3 + 1] = lo[1] + (q[i * 3 + 1] / 65535) * span[1];
      positions[i * 3 + 2] = lo[2] + (q[i * 3 + 2] / 65535) * span[2];
    }

    const packedNormals = new Int8Array(buffer, base + part.nrm, n * 4);
    const normals = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      normals[i * 3 + 0] = packedNormals[i * 4 + 0] / 127;
      normals[i * 3 + 1] = packedNormals[i * 4 + 1] / 127;
      normals[i * 3 + 2] = packedNormals[i * 4 + 2] / 127;
    }

    const index = part.indexType === "u32"
      ? new Uint32Array(buffer, base + part.idx, part.indexCount).slice()
      : new Uint16Array(buffer, base + part.idx, part.indexCount).slice();

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    geometry.computeBoundingSphere();
    parts.set(part.name, geometry);
  }
  return { header, parts };
}

/* =========================================================================
   THE VEHICLE
   ========================================================================= */

// Where each engine cluster sits, in model metres above the engine plane.
// The plume module hangs its cones off these.
export const ENGINE_PLANE = { sic: 0.4, sii: 45.2, sivb: 69.4 };

// The bodies, and how each one leaves. The order is the order they are
// added in, which is the order they are drawn in; nothing here overlaps, so
// it does not matter, but keeping it bottom-to-top makes the rest readable.
const BODIES = [
  { name: "sic", part: "sic" },
  { name: "interstage", part: "interstage" },
  { name: "sii", part: "sii" },
  { name: "sivb", part: "sivb" },
  { name: "csm", part: "csm" },
  { name: "lm", part: "lm", lander: true },
  { name: "tower", part: "tower" },
];

const UP = new THREE.Vector3(0, 1, 0);

/* =========================================================================
   ONE COPY OF THE MODEL
   =========================================================================

   Only the flying vehicle draws this geometry now -- the second copy that
   used to stand in for it during the Saturn V interlude is gone; see the
   note in scene.js above DETAIL_URL for why and what replaced it. The
   loader below still fetches and decodes by URL into a shared cache rather
   than handing back a private copy, because a BufferGeometry is immutable
   once uploaded and three.js is happy to point several meshes at one --
   and that is exactly the shape a detail-resolution swap on the flight
   vehicle itself would need: a second URL decoded once, materials made
   fresh for whatever uses it, and disposeSaturnV() tracking each URL's
   buffers independently so retiring one model does not touch the other's.

   Which means nobody here may dispose the geometry directly. dispose()
   below releases only this vehicle's materials and leaves the buffers to
   disposeSaturnV(), which the scene calls on its way out. */

const loading = new Map();

/** @returns {Promise<{header: object, parts: Map<string, THREE.BufferGeometry>}>} */
export function loadSaturnV(url) {
  let pending = loading.get(url);
  if (!pending) {
    pending = fetch(url).then(async (response) => {
      if (!response.ok) throw new Error(`Saturn V model: HTTP ${response.status}`);
      return decode(await response.arrayBuffer());
    });
    // A rejected promise must not be cached, or one flaky response poisons
    // every later request for the life of the page.
    pending.catch(() => loading.delete(url));
    loading.set(url, pending);
  }
  return pending;
}

/** Release the shared geometry. Only the owner of the whole layer may call
 *  this, and only once nothing is drawing. */
export function disposeSaturnV(url) {
  const pending = loading.get(url);
  if (!pending) return;
  loading.delete(url);
  pending
    .then(({ parts }) => {
      for (const geometry of parts.values()) geometry.dispose();
    })
    .catch(() => {
      /* It never loaded. There is nothing to release. */
    });
}

/**
 * @param {object} opts
 * @param {string} opts.url  where the packed model lives
 * @returns {Promise<object>} the vehicle, once its geometry has arrived
 */
export async function createVehicle({ url, landerUrl }) {
  // The lander is a separate file and so a separate failure. If it does not
  // arrive the rocket still flies and the page still works -- the lunar act
  // has nothing to land, which is a worse page but not a broken one.
  const [{ parts }, landerModel] = await Promise.all([
    loadSaturnV(url),
    landerUrl ? loadSaturnV(landerUrl).catch(() => null) : Promise.resolve(null),
  ]);
  const geometryFor = (name) => parts.get(name) || (landerModel && landerModel.parts.get(name));

  // object3D  -- goes under earthGroup, so the vehicle turns with the planet
  //   stack   -- moved and pointed by the flight profile, scaled to km
  //     mesh  -- one per body, in model metres, displaced when it separates
  //
  // The vehicle stays a child of earthGroup for the entire mission, and
  // that is a rule rather than a convenience. Releasing it into an inertial
  // frame partway would mean multiplying the planet's accumulated spin --
  // which grows without bound while a tab sits open -- by a factor that
  // changes with scroll, and an unbounded angle times a varying factor is
  // an unbounded swing. The same trap took out the ground lock; see the
  // note in shots.js.
  const object3D = new THREE.Group();
  object3D.name = "saturnV";

  // Scaled per frame, not once: the drawn height of the vehicle grows as
  // the camera retreats, so that the separations stay big enough to see.
  // The whole argument is in flight.js next to stackScale. Everything
  // inside this group is in model metres and scales with it, so no part of
  // the vehicle moves relative to any other part when it changes.
  const stack = new THREE.Group();
  object3D.add(stack);

  const uniforms = {
    uSun: { value: new THREE.Vector3(1, 0, 0) },
    uCamera: { value: new THREE.Vector3() },
  };

  const meshes = new Map();
  const materials = [];
  for (const body of BODIES) {
    const geometry = geometryFor(body.part);
    if (!geometry) continue;
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uSun: uniforms.uSun,
        uCamera: uniforms.uCamera,
        uOpacity: { value: 1 },
        uScorch: { value: 0 },
        uLander: { value: body.lander ? 1 : 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: true,
      side: THREE.FrontSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    stack.add(mesh);
    meshes.set(body.name, mesh);
    materials.push(material);
  }

  const quaternion = new THREE.Quaternion();
  const axis = new THREE.Vector3();
  const scratch = new THREE.Vector3();

  // The lander's attitude, rebuilt every frame without allocating.
  const LM_X = new THREE.Vector3(1, 0, 0);
  const lmDocked = new THREE.Quaternion();
  const lmFlying = new THREE.Quaternion();
  const lmTurn = new THREE.Quaternion();
  const lmPitch = new THREE.Quaternion();
  const lmBasis = new THREE.Matrix4();
  const lmTrack = new THREE.Vector3();
  const lmRadial = new THREE.Vector3();
  const lmAcross = new THREE.Vector3();
  const lmHatch = new THREE.Vector3();
  const lmFront = new THREE.Vector3();

  /**
   * Place the vehicle for one frame.
   *
   * @param {object} f            the result of flightAt(p)
   * @param {number[]} padUp      pad surface normal, unit, Earth-fixed
   * @param {number[]} padHeading launch azimuth at the pad, unit, Earth-fixed
   * @param {object} frame        the result of vehicleFrame(...)
   * @param {THREE.Vector3} sunDirection   world space, unit
   * @param {THREE.Vector3} cameraPosition world space, km
   */
  function update({ flight, frame, sunDirection, cameraPosition }) {
    object3D.visible = flight.presence > 0.001;
    if (!object3D.visible) return;

    // The trajectory point is the engine plane of the full stack, and it
    // stays there for the whole flight. The alternative -- moving the
    // reference up to each surviving stage's own base as the one below it
    // goes -- would make the remaining vehicle lurch downwards at every
    // separation, which is a far worse artefact than the one it fixes. What
    // it costs is that after staging the survivor rides a little high: forty
    // model metres, which is a hundred and seventy-four kilometres drawn,
    // against an altitude that is already exaggerated twelvefold and by then
    // reads eight hundred. Nobody can see it. A lurch, everybody can see.
    stack.position.set(frame.position[0], frame.position[1], frame.position[2]);
    stack.scale.setScalar(flight.kmPerVehicleMetre);

    axis.set(frame.axis[0], frame.axis[1], frame.axis[2]).normalize();
    quaternion.setFromUnitVectors(UP, axis);
    stack.quaternion.copy(quaternion);

    uniforms.uSun.value.copy(sunDirection);
    uniforms.uCamera.value.copy(cameraPosition);

    for (const [name, mesh] of meshes) {
      // Every body flight.js knows about has a state. This only guards a
      // model file carrying a body it does not, which is drawn as-is.
      const state = flight.parts[name];
      if (!state) {
        mesh.visible = true;
        mesh.position.set(0, 0, 0);
        mesh.rotation.set(0, 0, 0);
        mesh.material.uniforms.uOpacity.value = flight.presence;
        mesh.material.uniforms.uScorch.value = 0;
        continue;
      }

      const opacity = state.opacity * flight.presence;
      mesh.visible = opacity > 0.004;
      if (!mesh.visible) continue;

      // Drift is down the stack's own axis, which is a good enough stand-in
      // for "backwards along the flight path": the two differ by the angle
      // of attack, and a launch vehicle flies at essentially none.
      mesh.position.set(0, -state.drift * STACK_HEIGHT_M, 0);

      // Tumble about two axes rather than one. A single-axis tumble reads
      // as a hinge; two read as a body with nothing holding it.
      mesh.rotation.set(state.spinRad * 0.55, 0, state.spinRad);

      mesh.material.uniforms.uOpacity.value = opacity;
      mesh.material.uniforms.uScorch.value = state.attached ? 0 : Math.min(1, state.drift * 0.8);
    }

    // Keep the tower ahead of the stack and off to one side, the way its
    // jettison motor actually throws it, rather than straight up the axis
    // where it would sit inside the spacecraft it has just left.
    const tower = meshes.get("tower");
    if (tower && tower.visible && !flight.parts.tower.attached) {
      const t = flight.parts.tower;
      tower.position.x += t.drift * STACK_HEIGHT_M * 0.42;
    }

    /* The lander's attitude, which is its own and not the stack's.

       The model's frame (tools/build-lm.py): +Y is the hatch on top, +Z the
       front, where the windows and the porch are. Its origin is its own
       middle, so every rotation below turns it in place.

       Docked, it rides upside down on Columbia's nose -- a half-turn about
       X -- and the gear-inspection yaw is a full turn about its own thrust
       axis, Y, underneath that.

       Flying free, the attitude is built against the Moon instead: hatch
       pointing back along the track (so the descent engine points forward,
       along it) and front facing the ground. Then the yaw to windows-up,
       about that same thrust axis -- a yaw right is negative about Y, with
       X across the vehicle to its left. Then the pitch towards upright,
       about the line across the track, which swings the hatch from
       backwards to straight up and the front from the ground to straight
       ahead. That is built in the stack's parent frame, where the track and
       the radial are known, and carried into the stack's own, where the
       mesh lives.

       roll blends the one into the other. flight.js has the times and the
       sources for every one of these numbers. */
    const lm = meshes.get("lm");
    const lmState = flight.parts.lm;
    if (lm && lm.visible && lmState) {
      lm.position.set(0, LM_CENTRE_M, 0);
      lmDocked
        .setFromAxisAngle(LM_X, Math.PI)
        .multiply(lmTurn.setFromAxisAngle(UP, 2 * Math.PI * (lmState.inspect || 0)));

      const roll = lmState.roll || 0;
      if (roll > 0 && frame.up && frame.forward) {
        lmTrack.set(frame.forward[0], frame.forward[1], frame.forward[2]).normalize();
        lmRadial.set(frame.up[0], frame.up[1], frame.up[2]).normalize();
        lmHatch.copy(lmTrack).negate();
        lmFront.copy(lmRadial).negate();
        lmAcross.crossVectors(lmHatch, lmFront);
        lmFlying.setFromRotationMatrix(lmBasis.makeBasis(lmAcross, lmHatch, lmFront));
        lmFlying.multiply(lmTurn.setFromAxisAngle(UP, -Math.PI * (lmState.faceUp || 0)));
        lmAcross.crossVectors(lmRadial, lmTrack).normalize();
        lmFlying.premultiply(lmPitch.setFromAxisAngle(lmAcross, (lmState.upright || 0) * Math.PI * 0.5));
        lmFlying.premultiply(lmPitch.copy(quaternion).invert());
        lmDocked.slerp(lmFlying, roll);
      }
      lm.quaternion.copy(lmDocked);
    }

    void scratch;
  }

  function dispose() {
    // Materials only. The geometry belongs to the loader's cache; see
    // disposeSaturnV above.
    for (const material of materials) material.dispose();
  }

  // Replace geometry on the existing bodies, retaining materials, transforms,
  // and attached exhaust. Older detail files contain a combined "upper";
  // leave the newer, separately staged S-IVB and CSM intact in that case.
  function upgradeGeometry(detailParts) {
    for (const [name, mesh] of meshes) {
      const geometry = detailParts.get(name);
      if (geometry) mesh.geometry = geometry;
    }
  }

  /** A material of exactly this vehicle's kind, for whatever eventually
   *  needs a second one -- a detail-resolution swap of this same stack is
   *  the obvious candidate; see the note in scene.js above DETAIL_URL. The
   *  shaders are the whole reason it would still look like the same
   *  rocket: the roll-pattern paint is computed from model height and
   *  angle in the fragment stage, so anything that reuses the geometry has
   *  to reuse the shader or it gets a white tube. Unused today; kept
   *  because the geometry-loading half of that swap -- loadSaturnV and
   *  disposeSaturnV, above -- is kept too. */
  function makeMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {
        uSun: { value: new THREE.Vector3(1, 0, 0) },
        uCamera: { value: new THREE.Vector3() },
        uOpacity: { value: 1 },
        uScorch: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: true,
      side: THREE.FrontSide,
    });
  }

  return {
    object3D,
    // Exposed for the Saturn V interlude in scene.js, which reads
    // stack.matrixWorld each frame to find the vehicle's own engine-plane
    // position and nose direction in world space -- see the note above
    // tourCameraWorld in tour.js for what it does with them. Nothing
    // outside this module should write to stack; update() above is still
    // the only thing that moves it.
    stack,
    update,
    dispose,
    meshes,
    makeMaterial,
    parts,
    upgradeGeometry,
  };
}
