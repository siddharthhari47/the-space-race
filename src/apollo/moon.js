// The Moon.
//
// An analytic sphere with NASA's CGI Moon Kit colour and terrain normals.
// A lightweight colour map loads first; desktop progressively adds the 4K
// LROC mosaic and LOLA-derived normals built by tools/build-moon-maps.py.
// Normals change the lighting, not the contact radius or the silhouette.
//
// The shading is the part worth reading. A Moon lit by plain Lambert
// diffuse looks wrong in a way people notice without being able to name it,
// because the real full Moon is not a shaded ball — it is a flat disc,
// bright all the way to the limb. That is not an artistic observation, it
// is the defining photometric property of lunar regolith: the surface is a
// deep, porous layer of shadowing particles, so as the phase angle closes
// the shadows hide behind the grains that cast them and the disc brightens
// far faster than geometry says it should. Astronomers call it the
// opposition effect, and it is why the full Moon is roughly ten times
// brighter than the half Moon rather than twice.
//
// So the diffuse term below is Lommel-Seeliger rather than Lambert — the
// single-scattering law for a semi-infinite particulate surface, in which
// brightness goes as mu0 / (mu0 + mu) instead of as mu0 alone. It is the
// standard base for lunar photometry and it gives the limb-to-limb flatness
// for free. It is blended with a little Lambert, which is the
// "lunar-Lambert" form used for correcting spacecraft imagery; the mix here
// is tuned by eye rather than fitted, and this sentence is the disclosure.
//
// Everything else on this page is lit by the same frozen sunWorld the Earth
// is, and so is this.

import * as THREE from "three";
import { smootherstep } from "./mission.js";
import { landingEffectsAt } from "./landing-effects.js";

export { MOON_RADIUS_KM } from "./mission.js";

/* THE MESH IS A STENCIL; THE SPHERE IS WORKED OUT PER PIXEL

   Ninety-six by sixty-four flat triangles make a good Moon seen whole and a
   poor one stood on. Every triangle is a chord of the sphere, and across the
   middle of one the drawn ground sinks as much as 1.45 km below the real
   radius. Nobody could see that from orbit. At Tranquility Base it put
   1.29 km of air under Eagle's footpads -- twice the lander's drawn height --
   and kinked the horizon where two triangles met.

   So the triangles are no longer the surface. The sphere they are built on
   is blown up by a tenth of a per cent (SHELL, in createMoon), which is
   enough to enclose the true sphere everywhere, and each pixel it covers
   works out where its own line of sight meets the true radius. That point
   is the one lit and textured; a pixel whose line of sight misses is thrown
   away. The limb is then round at any distance, and the ground is where the
   radius says it is, which is what the lander's altitude is measured
   against.

   The ray is put together relative to the Moon's centre. World positions
   out here are a third of a million kilometres from the origin, where a
   32-bit float cannot tell apart points 30 m apart: invisible from orbit,
   ruinous from half a kilometre up. uCamFromMoon is subtracted on the CPU,
   in doubles, and the vertex it is taken from is one Moon-radius long.

   The depth written is the depth of that point too, not of the triangle the
   pixel came through. It has to be. The triangles are chords, so their
   middles dip back toward the true ground, and standing at Tranquility Base
   the camera and the lander are both inside that dip: a triangle's own depth
   put the ground in front of Eagle's legs. It is ordinary perspective
   depth, which is what every other shader on this page writes: none of them
   include three's logarithmic-depth chunks, so the renderer's
   logarithmicDepthBuffer setting never reaches them, and a Moon that wrote
   logarithmic depth among them hid the lander completely. */
const MOON_VERTEX = /* glsl */ `
uniform vec3 uCamFromMoon;
varying vec3 vRay;

void main() {
  vRay = mat3(modelMatrix) * position - uCamFromMoon;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const MOON_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform sampler2D uNormalMap;
uniform float uNormalStrength;
uniform vec3 uSunDirection;
uniform vec3 uCamFromMoon;
uniform float uRadius;
uniform mat3 uBasis;
uniform float uInside;
uniform vec3 uEarthDirection;
uniform float uEarthshine;
uniform float uEarthshineGain;
uniform float uExposure;
uniform vec2 uProjZ;
uniform float uSurfaceDetail;
uniform vec3 uLander;
uniform float uLanderScale;
uniform float uLandingActive;
uniform vec2 uDust;

varying vec3 vRay;

// Narkowicz's ACES approximation, the same one earth.js uses. Both bodies
// are in frame together for the whole lunar act, so they have to go through
// the same curve or the Moon reads as belonging to a different photograph.
vec3 acesFilmic(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

// Illustrative relief layered over NASA's global map. It does not change
// the spherical contact surface or claim to reconstruct Tranquility Base.
float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
             mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
}
float relief(vec2 p) {
  // Only sub-map grain is procedural. Crater slopes come from LOLA data.
  return 0.002 * noise(p * 2.3) + 0.0008 * noise(p * 17.0);
}

void main() {
  vec3 D = normalize(vRay);
  vec3 O = uCamFromMoon;
  float b = dot(O, D);
  // Through the point of closest approach, rather than b*b - (|O|^2 - R^2).
  // With the camera out by the Earth those two terms are each around 1e11
  // and cancel to kilometres of noise at the limb.
  vec3 closest = O - b * D;
  float disc = uRadius * uRadius - dot(closest, closest);
  float t = -b - sqrt(max(disc, 0.0));
  vec3 P = O + t * D;
  vec3 N = normalize(P);

  // Texture coordinates for that point, laid out exactly as three.js's
  // SphereGeometry lays them -- u from the far side's centre meridian, v up
  // from the south pole -- so the map lands where it always did.
  vec3 local = transpose(uBasis) * N;
  float phi = atan(local.z, -local.x);
  float uA = fract(phi / 6.283185307179586);
  float v = 1.0 - acos(clamp(local.y, -1.0, 1.0)) / 3.141592653589793;
  // u jumps from 1 back to 0 on that meridian, and a mip level chosen from
  // the jump draws a seam down the far side. uB is the same coordinate with
  // its jump on the opposite meridian; whichever changes more slowly across
  // this pixel supplies the gradients. All of these, and the coverage
  // below, are taken before anything is discarded, because a derivative
  // after a discard is not guaranteed to mean anything.
  float uB = fract(phi / 6.283185307179586 + 0.5) - 0.5;
  vec2 gA = vec2(dFdx(uA), dFdy(uA));
  vec2 gB = vec2(dFdx(uB), dFdy(uB));
  vec2 gu = dot(gB, gB) < dot(gA, gA) ? gB : gA;
  vec2 gv = vec2(dFdx(v), dFdy(v));

  // How much of this pixel the sphere covers, for an antialiased limb. With
  // multisampling, alphaToCoverage turns it into sample coverage; without,
  // it only decides which pixels are kept.
  float coverage = clamp(disc / max(fwidth(disc), 1e-6) + 0.5, 0.0, 1.0);

  // From outside the shell, every line of sight that meets the Moon comes
  // in through a front face, so back faces are skipped rather than drawn
  // twice. Close to the ground the front faces are overhead or inside the
  // near plane, and the back faces do the work.
  if (uInside < 0.5 && !gl_FrontFacing) discard;
  // A line of sight that points away from the Moon's centre can still pass
  // through the Moon behind the camera -- anything tilted up from the
  // ground does -- and that crossing is not in view.
  if (coverage <= 0.0 || b >= 0.0) discard;

  // The hit's distance along the view axis, not along the ray, put through
  // the camera's projection: uProjZ is the z row's depth and constant terms.
  float viewDepth = -t * (mat3(viewMatrix) * D).z;
  gl_FragDepth = 0.5 * (uProjZ.y / viewDepth - uProjZ.x) + 0.5;

  vec3 L = normalize(uSunDirection);
  vec3 V = -D;

  if (uNormalStrength > 0.0) {
    vec3 mapped = textureGrad(uNormalMap, vec2(uA, v),
      vec2(gu.x, gv.x), vec2(gu.y, gv.y)).xyz * 2.0 - 1.0;
    vec3 east = normalize(vec3(local.z, 0.0, -local.x));
    vec3 north = normalize(cross(local, east));
    vec3 terrainNormal = normalize(east * mapped.x + north * mapped.y + local * mapped.z);
    N = normalize(mix(N, uBasis * terrainNormal, uNormalStrength));
  }

  float detail = uSurfaceDetail * (1.0 - smoothstep(12.0, 80.0, t));
  vec2 groundUV = local.yz * uRadius;
  float grain = 0.5;
  if (uSurfaceDetail > 0.001) {
    float height = relief(groundUV);
    vec3 dx = dFdx(P), dy = dFdy(P);
    vec3 rx = cross(dy, N), ry = cross(N, dx);
    float determinant = dot(dx, rx);
    vec3 slope = sign(determinant) * (dFdx(height) * rx + dFdy(height) * ry);
    vec3 bumped = normalize(max(abs(determinant), 1e-12) * N - slope);
    N = normalize(mix(N, bumped, detail * 0.65));
    // Suppress subpixel grain on the horizon instead of letting it sparkle.
    float grainWeight = 1.0 - smoothstep(0.2, 1.0, length(fwidth(groundUV * 90.0)));
    grain = mix(0.5, noise(groundUV * 90.0), grainWeight);
  }

  float mu0 = dot(N, L);
  float mu = max(dot(N, V), 0.0);

  // The terminator, and how soft it is. On Earth this is a wide band
  // because air carries light past the geometric edge; here there is no
  // air, so the only thing softening it is that the Sun is a disc about
  // half a degree wide rather than a point. Lunar sunrise takes about a
  // kilometre of ground to happen in, and shadows on the Moon really are
  // that hard -- hence a smoothstep of a few thousandths, not Earth's 0.3.
  float lit = smoothstep(-0.0046, 0.0046, mu0);
  float m0 = max(mu0, 0.0);

  // Lommel-Seeliger. The guard keeps the grazing limb, where mu0 and mu go
  // to zero together, from dividing its way to infinity.
  float ls = m0 / max(m0 + mu, 0.02);

  // Lunar-Lambert mix. Mostly the scattering law, with enough Lambert left
  // in to keep some roundness near the crescent, where a pure
  // Lommel-Seeliger disc starts to look like cut cardboard.
  float diffuse = lit * (1.55 * ls + 0.30 * m0);

  vec3 albedo = textureGrad(uMap, vec2(uA, v), vec2(gu.x, gv.x), vec2(gu.y, gv.y)).rgb;

  // Sunlight is very slightly warm and the regolith very slightly brown.
  // The Moon is not the neutral grey the eye remembers it as.
  vec3 sunColour = vec3(1.0, 0.975, 0.94);
  vec3 colour = albedo * diffuse * sunColour;
  colour *= 1.0 + detail * (grain - 0.5) * 0.42;

  if (uLandingActive > 0.001) {
    vec3 up = normalize(uLander);
    float sunHeight = dot(up, L);
    vec3 along = normalize(L - up * sunHeight);
    vec3 across = normalize(cross(up, along));
    float height = max(0.0, length(uLander) - uRadius);
    // Project the body away from the Sun onto the local ground plane.
    float castLength = height / max(0.08, sunHeight);
    vec3 centre = up * uRadius - along * castLength * 0.5;
    vec3 offset = P - centre;
    float width = 2.7 * uLanderScale;
    float stretch = castLength * 0.5 + width / max(0.16, sunHeight);
    vec2 shadowUV = vec2(dot(offset, along) / stretch, dot(offset, across) / width);
    float softness = 0.16 + min(0.8, height * 0.25);
    float shadow = 1.0 - smoothstep(1.0 - softness, 1.0 + softness, length(shadowUV));
    shadow *= uLandingActive * smoothstep(0.0, 0.08, sunHeight)
      * (1.0 - smoothstep(2.0, 8.0, height));
    colour *= 1.0 - 0.78 * shadow;

    // A thin radial sheet on the ground, not an atmospheric smoke cloud.
    vec3 feet = up * uRadius;
    vec3 delta = P - feet;
    vec2 dustUV = vec2(dot(delta, along), dot(delta, across));
    float radius = length(dustUV);
    float angle = atan(dustUV.y, dustUV.x);
    float streak = 0.55 + 0.45 * sin(angle * 43.0 + sin(angle * 17.0));
    float rings = 0.7 + 0.3 * sin(radius * 28.0 - uDust.y * 1.8);
    float sheet = exp(-radius * 1.1) * smoothstep(0.08, 0.35, radius);
    colour = mix(colour, vec3(0.19, 0.175, 0.15),
      uDust.x * sheet * streak * rings * 0.46 * uLandingActive);
  }

  /* Earthshine -- the old Moon in the new Moon's arms. The night side of
     the Moon is not black: it is lit by an Earth four times the Moon's
     width and far brighter, which is why the whole disc stays faintly
     visible inside a thin crescent.

     The strength here is exaggerated, and because the real factor is
     knowable it is worth stating rather than glossing: earthshine is on the
     order of fourteen magnitudes fainter than direct sunlight on the Moon,
     a ratio of a few hundred thousand to one. A physically weighted value
     would render as pure black; the eye catches it in the sky only because
     the eye's dynamic range beats a screen's by orders of magnitude. So it
     is drawn up to visibility, exactly the way flight.js draws up the
     parking orbit, and for the same reason.

     uEarthshine carries how full the Earth is as seen from the Moon, which
     runs opposite to the lunar phase: earthshine is strongest at new Moon,
     when we are looking at the unlit hemisphere and the Moon is looking at
     a full Earth. */
  float earthFacing = max(dot(N, normalize(uEarthDirection)), 0.0);
  vec3 earthColour = vec3(0.66, 0.68, 0.72);
  colour += albedo * earthColour * earthFacing * uEarthshine * uEarthshineGain * (1.0 - lit);

  gl_FragColor = vec4(acesFilmic(colour * uExposure), coverage);
  #include <colorspace_fragment>
}
`;

export function createMoon({ map, radiusKm, exposure = 1.0, surfaceDetail = true }) {
  const uniforms = {
    uMap: { value: map },
    uNormalMap: { value: map },
    uNormalStrength: { value: 0 },
    uSunDirection: { value: new THREE.Vector3(1, 0, 0) },
    uCamFromMoon: { value: new THREE.Vector3() },
    uRadius: { value: radiusKm },
    uBasis: { value: new THREE.Matrix3() },
    uInside: { value: 0 },
    uProjZ: { value: new THREE.Vector2() },
    uEarthDirection: { value: new THREE.Vector3(-1, 0, 0) },
    uEarthshine: { value: 0 },
    uEarthshineGain: { value: 1 },
    uExposure: { value: exposure },
    uSurfaceDetail: { value: 0 },
    uLander: { value: new THREE.Vector3() },
    uLanderScale: { value: 0.09 },
    uLandingActive: { value: 0 },
    uDust: { value: new THREE.Vector2() },
  };

  /* HOW HARD THE CAMERA IS LOOKING

     The Moon reflects about twelve per cent of what hits it -- it is the
     colour of worn asphalt, and only looks white because it is the
     brightest thing in a night sky. Exposed for a spacecraft in direct
     sunlight it comes out nearly black, which is exactly what the first
     render of the lunar act did: a lit vehicle, a caption, and a faint
     curve of horizon that had to be looked for.

     That is not a rendering error, it is a photographic one, and it has the
     photographer's answer. Every picture anyone has seen from lunar orbit
     was exposed for the ground. Apollo's Hasselblads were reset shot to
     shot; nobody photographed Tranquility at the setting they used for a
     sunlit hull. A modest exposure lift as the camera closes in preserves
     the surface contrast while making the ground legible.

     Earthshine has to come down by roughly as much as the exposure goes
     up, and this is the part that is easy to get wrong. Its strength in the
     shader is already an exaggeration by five orders of magnitude, chosen
     so that a Moon seen small and whole keeps a visible night side. Lift
     the exposure under that and the night side ends up brighter than the
     sunlit one -- measured, not feared: at four and a half times exposure
     the earthshine term came out at 0.43 against the lit surface's 0.34.
     So the gain falls as the exposure rises, and the two together keep
     lunar night dark and lunar morning bright, which is the ordering the
     eye checks first. */
  const FAR_KM = 60000;   // the Moon is a destination
  const NEAR_KM = 400;    // the Moon is the ground
  const CLOSE_EXPOSURE = 1.8;
  const CLOSE_EARTHSHINE = 0.2;

  /* The mesh is only the stencil the sphere is drawn through (THE MESH IS A
     STENCIL, above), so 96 by 64 no longer decides how round anything
     looks, only how tightly the stencil fits. SHELL is how far it is blown
     up. A 96 by 64 sphere's deepest triangle sits 0.084% inside its radius,
     at the equator, so a tenth of a per cent encloses the true sphere
     everywhere with a little to spare.

     INSIDE_KM is the height below which the back faces are drawn as well
     as the front ones. The shell itself ends 1.7 km up; the rest of the
     margin is for the camera's near plane, which can clip the face directly
     below it before the camera is anywhere near that face. Drawing both
     sides costs overdraw and nothing else, so the margin is generous. */
  const SHELL = 1.001;
  const INSIDE_KM = 30;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radiusKm * SHELL, 96, 64),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: MOON_VERTEX,
      fragmentShader: MOON_FRAGMENT,
      side: THREE.DoubleSide,
      alphaToCoverage: true,
    })
  );
  // The near plane moves from frame to frame (updateNearPlane, in scene.js),
  // and this is called with the projection the Moon is actually drawn with.
  mesh.onBeforeRender = (renderer, scene, camera) => {
    const e = camera.projectionMatrix.elements;
    uniforms.uProjZ.value.set(e[10], e[14]);
  };
  mesh.name = "moon";
  mesh.matrixAutoUpdate = false;

  const ex = new THREE.Vector3();
  const ey = new THREE.Vector3();
  const ez = new THREE.Vector3();

  return {
    mesh,
    uniforms,

    upgradeMaps({ map: colour, normalMap }) {
      const previous = uniforms.uMap.value;
      uniforms.uMap.value = colour;
      uniforms.uNormalMap.value = normalMap;
      uniforms.uNormalStrength.value = 1;
      previous?.dispose();
    },

    setLander({ position, moonCentre, scale, seconds, active }) {
      uniforms.uLandingActive.value = active;
      if (!active) return;
      uniforms.uLander.value.copy(position).sub(moonCentre);
      uniforms.uLanderScale.value = scale;
      const effects = landingEffectsAt(seconds);
      uniforms.uDust.value.set(effects.dust, effects.phase);
    },

    /* Put the Moon somewhere and point it the right way.

       `position` is where the Moon is, in world kilometres. `northAxis` is
       the direction of lunar north. `sunDirection` is the same frozen
       vector the Earth is lit by.

       The orientation is not free: the Moon is tidally locked, so the same
       hemisphere faces the Earth always, and the face everyone grew up
       looking at is the only face that may point at us. Getting that
       backwards would put the far side — which almost nobody would
       recognise, but everybody would feel was wrong — in the middle of the
       disc. build-moon-texture.py fixes the convention: in the mesh's own
       frame +X is the centre of the near side, +Y is lunar north, and lunar
       east is -Z, all three confirmed there against Tycho and Mare Crisium
       rather than assumed. So +X is aimed down the line to the Earth and
       the other two axes follow from it.

       Libration is not modelled. The Moon really does rock about eight
       degrees in longitude and seven in latitude over a month, which is how
       we get to see 59% of the surface rather than 50%; across the days
       this page covers it would come to a degree or so of roll. */
    place({ position, northAxis, sunDirection, cameraPosition }) {
      ex.copy(position).negate().normalize();
      ey.copy(northAxis).addScaledVector(ex, -ex.dot(northAxis)).normalize();
      ez.crossVectors(ex, ey);

      mesh.matrix.makeBasis(ex, ey, ez).setPosition(position);
      mesh.matrixWorldNeedsUpdate = true;

      uniforms.uSunDirection.value.copy(sunDirection);
      // Subtracted here, in doubles, and never on the GPU.
      uniforms.uCamFromMoon.value.copy(cameraPosition).sub(position);
      uniforms.uBasis.value.set(ex.x, ey.x, ez.x, ex.y, ey.y, ez.y, ex.z, ey.z, ez.z);
      uniforms.uEarthDirection.value.copy(ex);

      // How full the Earth is from here: 1 at new Moon, 0 at full Moon.
      // ex points Moon-to-Earth, so a Moon sitting between Earth and Sun
      // has ex opposite the Sun and this comes out at one.
      uniforms.uEarthshine.value = (1 - ex.dot(sunDirection)) / 2;

      // Height above the surface, not distance to the centre, so the
      // hand-over happens at a height rather than at a number that would
      // mean something different on a different-sized body.
      const altitudeKm = cameraPosition.distanceTo(position) - radiusKm;
      uniforms.uSurfaceDetail.value = surfaceDetail ? 1 - smootherstep(30, 200, altitudeKm) : 0;
      uniforms.uInside.value = altitudeKm < INSIDE_KM ? 1 : 0;
      const close = smootherstep(FAR_KM, NEAR_KM, altitudeKm);
      uniforms.uExposure.value = exposure + (CLOSE_EXPOSURE - exposure) * close;
      uniforms.uEarthshineGain.value = 1 + (CLOSE_EARTHSHINE - 1) * close;
    },

    dispose() {
      mesh.geometry.dispose();
      mesh.material.dispose();
      uniforms.uMap.value?.dispose();
      if (uniforms.uNormalMap.value !== uniforms.uMap.value) uniforms.uNormalMap.value?.dispose();
    },
  };
}
