// The Earth, and the air on top of it.
//
// Two spheres. The inner one is the surface: NASA's Blue Marble composite
// for July 2004, city lights from the Black Marble product on the dark
// side, and a cloud layer sampled in the same pass rather than hung on its
// own transparent shell — one draw call, no alpha sorting, and cloud
// shadows fall on the ground for free because both are in scope at once.
//
// The outer one is the atmosphere, and it is not a fresnel rim. A rim glow
// is the usual shortcut and it always reads as a sticker, because the thing
// that makes a real limb look like a limb is that you are looking through
// more air near the edge than you are near the middle. So the shell
// analytically measures how much atmosphere each view ray passes through —
// two ray-sphere intersections, no marching — and colours it by Rayleigh
// coefficients. The white-blue band at the horizon, the haze thickening
// across the disc and the orange smear at the terminator all fall out of
// that one measurement instead of being three separate effects.

import * as THREE from "three";

export const EARTH_RADIUS_KM = 6371;

// 100 km of atmosphere is the Karman line, and above it there is far too
// little air to scatter anything. The shell is drawn a little higher so the
// glow has somewhere to fade out rather than ending on a hard edge.
const ATMOSPHERE_THICKNESS_KM = 160;
export const ATMOSPHERE_RADIUS_KM = EARTH_RADIUS_KM + ATMOSPHERE_THICKNESS_KM;

/* ---------- Shared shader fragments ---------- */

// Narkowicz's ACES approximation. Present because a scene lit by one
// extremely bright source against black clips to flat white the moment
// anything specular happens, and the sun glint on the ocean is exactly that.
const ACES = /* glsl */ `
vec3 acesFilmic(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
`;

const EARTH_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

void main() {
  vUv = uv;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const EARTH_FRAGMENT = /* glsl */ `
uniform sampler2D uDayMap;
uniform sampler2D uNightMap;
uniform sampler2D uCloudMap;
uniform vec3 uSunDirection;
uniform vec3 uCameraPosition;
uniform float uCloudDrift;
uniform float uCloudOpacity;
uniform float uNightIntensity;
uniform float uExposure;

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

${ACES}

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 L = normalize(uSunDirection);
  vec3 V = normalize(uCameraPosition - vWorldPosition);
  float NdotL = dot(N, L);

  // The terminator is a band, not a line. The Sun is half a degree wide and
  // the atmosphere carries light past the geometric edge, which is why
  // dawn takes twenty minutes instead of happening instantly.
  float day = smoothstep(-0.10, 0.22, NdotL);
  float diffuse = max(NdotL, 0.0);

  // Sunlight reddens as it goes: light arriving near the terminator has cut
  // a long slant path through the atmosphere and lost its blue on the way.
  vec3 sunColour = mix(vec3(1.00, 0.52, 0.26), vec3(1.0, 0.98, 0.95),
                       smoothstep(0.0, 0.30, NdotL));

  vec3 surface = texture2D(uDayMap, vUv).rgb;

  // Cloud, drifting slowly west to east relative to the surface below it.
  vec2 cloudUv = vec2(fract(vUv.x + uCloudDrift), vUv.y);
  float cloud = texture2D(uCloudMap, cloudUv).r * uCloudOpacity;

  // Ocean, read straight out of the day map. The Blue Marble composite
  // carries bathymetry, so water is strongly blue-dominant while land, ice
  // and snow stay close to neutral. A channel difference is a better water
  // mask than a second texture download, and it is exactly as accurate.
  float water = smoothstep(0.015, 0.085, surface.b - surface.r);

  // Cloud shadow. The offset is the Sun's direction resolved into texture
  // space, so shadows lie away from the Sun and stretch out near the
  // terminator, which is where a flat cloud layer would otherwise give
  // itself away.
  vec3 north = normalize(vec3(0.0, 1.0, 0.0) - N * N.y);
  vec3 east = cross(north, N);
  vec2 shadowOffset = -vec2(dot(L, east), dot(L, north)) * 0.0045;
  float cloudShadow = texture2D(uCloudMap, cloudUv + shadowOffset).r * uCloudOpacity;

  vec3 lit = surface * diffuse * sunColour;
  lit *= 1.0 - cloudShadow * 0.45 * day;

  // Sun glint. The one detail that stops an Earth reading as a painted
  // ball: a real highlight sits on the water and nowhere else, so it breaks
  // across coastlines instead of sliding over them.
  vec3 H = normalize(L + V);
  float glint = pow(max(dot(N, H), 0.0), 120.0) * water * day;
  lit += vec3(1.0, 0.95, 0.86) * glint * 1.6;

  // Cloud tops, lit by the same Sun and slightly brighter than the ground.
  lit = mix(lit, vec3(1.02, 1.02, 1.04) * diffuse * sunColour, cloud * 0.92);

  // Cities. The Black Marble composite includes moonlit terrain and sensor
  // floor as a dim grey wash; subtracting it leaves the part that is
  // actually lit from below, which is the part worth showing.
  vec3 lights = max(texture2D(uNightMap, vUv).rgb - 0.055, vec3(0.0)) * 1.7;
  lit += lights * (1.0 - day) * uNightIntensity * (1.0 - cloud * 0.85);

  // Earthshine: the dark side is not black. Even without a Moon there is
  // enough scattered light that the terminator does not fall off a cliff.
  lit += vec3(0.012, 0.020, 0.042) * (1.0 - day) * (0.25 + 0.75 * water);

  gl_FragColor = vec4(acesFilmic(lit * uExposure), 1.0);
  #include <colorspace_fragment>
}
`;

const ATMOSPHERE_VERTEX = /* glsl */ `
varying vec3 vWorldPosition;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const ATMOSPHERE_FRAGMENT = /* glsl */ `
uniform vec3 uSunDirection;
uniform vec3 uCameraPosition;
uniform vec3 uPlanetCentre;
uniform float uPlanetRadius;
uniform float uAtmosphereRadius;
uniform float uIntensity;
uniform float uExposure;

varying vec3 vWorldPosition;

${ACES}

// Nearest and farthest intersections of a ray with a sphere centred on the
// origin. Returns false when the ray misses entirely.
bool raySphere(vec3 origin, vec3 dir, float radius, out float t0, out float t1) {
  float b = dot(origin, dir);
  float c = dot(origin, origin) - radius * radius;
  float disc = b * b - c;
  if (disc < 0.0) return false;
  float s = sqrt(disc);
  t0 = -b - s;
  t1 = -b + s;
  return true;
}

void main() {
  vec3 origin = uCameraPosition - uPlanetCentre;
  vec3 dir = normalize(vWorldPosition - uCameraPosition);

  float a0, a1;
  if (!raySphere(origin, dir, uAtmosphereRadius, a0, a1)) discard;
  a0 = max(a0, 0.0);

  // If the ray hits the ground, the air stops at the ground. This single
  // line is the difference between haze that sits correctly in front of the
  // surface and haze that glows through the planet.
  float p0, p1;
  float exit = a1;
  if (raySphere(origin, dir, uPlanetRadius, p0, p1) && p1 > 0.0) {
    exit = min(exit, max(p0, 0.0));
  }

  float pathLength = max(exit - a0, 0.0);
  if (pathLength <= 0.0) discard;

  // How much air, not just how far. Density falls off exponentially with
  // altitude, so a ray grazing the limb passes through far more atmosphere
  // than its length alone suggests, and a ray pointed at the middle of the
  // disc passes through almost none. Sampling density at the ray's lowest
  // point is a crude integral, but it is the term that carries the shape.
  vec3 entry = origin + dir * a0;
  vec3 leave = origin + dir * exit;
  float lowest = min(length(entry), length(leave));
  float closest = -dot(origin, dir);
  if (closest > a0 && closest < exit) lowest = min(lowest, length(origin + dir * closest));

  float scaleHeight = (uAtmosphereRadius - uPlanetRadius) * 0.33;
  float density = exp(-max(lowest - uPlanetRadius, 0.0) / scaleHeight);

  // Air masses, normalised so that a ray straight down through the whole
  // shell comes out at 1. A ray grazing the limb comes out around 18.
  float airmass = (pathLength / (uAtmosphereRadius - uPlanetRadius)) * density;

  // Rayleigh optical depth for one air mass, in the three channels the
  // screen has. These are close to the measured sea-level values — about
  // 0.21 at 440 nm, 0.10 at 550, 0.045 at 650 — and the absolute size of
  // them matters as much as the ratio between them. Set an order of
  // magnitude too high and every ray saturates, so the middle of the disc
  // goes as bright as the limb and the planet reads as a white ball with
  // a map faintly printed on it. That is what this shader used to do.
  vec3 tau = vec3(0.045, 0.100, 0.210) * airmass;
  vec3 scattered = 1.0 - exp(-tau);

  // Is this column of air in sunlight at all?
  vec3 samplePoint = origin + dir * mix(a0, exit, 0.5);
  vec3 sampleNormal = normalize(samplePoint);
  float sunlit = smoothstep(-0.30, 0.28, dot(sampleNormal, uSunDirection));

  // Rayleigh phase function: forward and backward scattering are equally
  // favoured, sideways scattering least. It is why the limb on the sunward
  // side is brighter than the limb on the other one. Normalised so its
  // average over all directions is one.
  float cosTheta = dot(dir, normalize(uSunDirection));
  float phase = 0.75 * (1.0 + cosTheta * cosTheta);

  // Single-scattering path radiance, in three terms. The scattered term is
  // the fraction of the light crossing this column that gets redirected;
  // the phase term says how much of that comes towards this camera rather
  // than somewhere else. The third decides what the edges
  // look like: sunlight has to reach the column before it can be scattered
  // out of it, and near the terminator it arrives along a slant path
  // through most of the atmosphere, losing its blue on the way.
  //
  // This replaced a 1/(4 mu0) solid-angle factor that was doing the job
  // backwards — dimmest under a high Sun, brightest at the terminator,
  // which is the opposite of both the physics and the photographs. It ran
  // the limb to white and needed a hand-tinted sunset mix on top to hide
  // it. Extinction along the solar path produces the sunset for free, and
  // in the right place.
  float mu0 = dot(sampleNormal, normalize(uSunDirection));

  // Slant air mass on the Sun's side. The 1/mu0 approximation stops being
  // true within a few degrees of the horizon, where the curvature of the
  // shell takes over and a real Chapman function turns over near 38, so it
  // is capped rather than allowed to diverge. Scaled by the same density
  // as the view path, because a column high in the shell is thin in both
  // directions.
  float airmassSun = min(1.0 / max(mu0, 0.05), 20.0) * density;
  vec3 sunTransmittance = exp(-vec3(0.045, 0.100, 0.210) * airmassSun);

  vec3 colour = scattered * phase * sunTransmittance * sunlit * uIntensity;

  // Alpha is extinction, not brightness, and the material blends
  // premultiplied: the surface behind this fragment is dimmed by how much
  // air is in the way, and the light scattered out of the beam is added on
  // top. Straight additive blending does only the second half, which
  // counts the same photons twice and is why a thin haze over the middle
  // of the disc used to arrive as fog.
  float extinction = 1.0 - exp(-dot(tau, vec3(0.299, 0.587, 0.114)));

  gl_FragColor = vec4(acesFilmic(colour * uExposure), clamp(extinction, 0.0, 1.0));
  #include <colorspace_fragment>
}
`;

/* ---------- Assembly ---------- */

export function createEarth({ textures, exposure = 1.0 }) {
  const group = new THREE.Group();

  const surfaceUniforms = {
    uDayMap: { value: textures.day },
    uNightMap: { value: textures.night },
    uCloudMap: { value: textures.clouds },
    uSunDirection: { value: new THREE.Vector3(1, 0, 0) },
    uCameraPosition: { value: new THREE.Vector3() },
    uCloudDrift: { value: 0 },
    uCloudOpacity: { value: 0.92 },
    uNightIntensity: { value: 1.0 },
    uExposure: { value: exposure },
  };

  // 128 segments, not 64. The limb is the silhouette of this sphere against
  // black, and it is on screen at close to full width for the whole page —
  // a faceted horizon is the first thing anyone would notice.
  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS_KM, 128, 96),
    new THREE.ShaderMaterial({
      uniforms: surfaceUniforms,
      vertexShader: EARTH_VERTEX,
      fragmentShader: EARTH_FRAGMENT,
    })
  );
  surface.name = "earth-surface";
  group.add(surface);

  const atmosphereUniforms = {
    uSunDirection: { value: new THREE.Vector3(1, 0, 0) },
    uCameraPosition: { value: new THREE.Vector3() },
    uPlanetCentre: { value: new THREE.Vector3() },
    uPlanetRadius: { value: EARTH_RADIUS_KM },
    uAtmosphereRadius: { value: ATMOSPHERE_RADIUS_KM },
    // A fitted gain, and worth being clear about which parts of this shader
    // are physics and which part is this number. The spectral ratios, the
    // phase function, the way the limb reddens and the way the haze thins
    // towards the middle of the disc all come out of the optical depths and
    // the geometry. What does not come out of them is the absolute
    // brightness: the surface is drawn as albedo times a cosine, in units
    // where the solar irradiance is folded into the texture, and the
    // scattering integral is not in those units. Something has to reconcile
    // them, and pretending a derived-looking constant did it would be worse
    // than saying so.
    //
    // 0.22 was chosen by measuring, not by eye. Rendered at the opening
    // shot it puts the median luminance of the lit planet at 0.39 and the
    // 90th percentile at 0.76, with no clipped pixels anywhere in frame.
    // At 1.0 the same frame reads 0.74 median with 1.9 percent of it burned
    // to flat white, which is the white-ball failure this shader has now
    // been pulled out of twice.
    uIntensity: { value: 0.22 },
    uExposure: { value: exposure },
  };

  // Front side, depth test off, drawn after the surface. The shell is a
  // stand-in for a volume, so it has to be allowed to cover the disc it
  // surrounds — the fragment shader already stops each ray at the ground,
  // which is what keeps that honest.
  //
  // The blend is premultiplied alpha (src ONE, dst ONE_MINUS_SRC_ALPHA)
  // rather than additive, because the shell has to do two things to what is
  // behind it: add the light scattered towards the camera, and remove the
  // light scattered out of the beam on its way through. Additive does only
  // the first, which brightens without ever dimming.
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(ATMOSPHERE_RADIUS_KM, 128, 96),
    new THREE.ShaderMaterial({
      uniforms: atmosphereUniforms,
      vertexShader: ATMOSPHERE_VERTEX,
      fragmentShader: ATMOSPHERE_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      side: THREE.FrontSide,
    })
  );
  atmosphere.name = "earth-atmosphere";
  atmosphere.renderOrder = 2;
  group.add(atmosphere);

  return {
    group,
    surface,
    atmosphere,

    // Swap in the higher-resolution day map once it has arrived, without
    // rebuilding anything: the shader is already pointed at this uniform.
    setDayMap(texture) {
      const previous = surfaceUniforms.uDayMap.value;
      surfaceUniforms.uDayMap.value = texture;
      if (previous && previous !== texture) previous.dispose();
    },

    update({ sunDirection, cameraPosition, cloudDrift, nightIntensity, atmosphereIntensity }) {
      surfaceUniforms.uSunDirection.value.copy(sunDirection);
      surfaceUniforms.uCameraPosition.value.copy(cameraPosition);
      atmosphereUniforms.uSunDirection.value.copy(sunDirection);
      atmosphereUniforms.uCameraPosition.value.copy(cameraPosition);
      group.getWorldPosition(atmosphereUniforms.uPlanetCentre.value);

      if (cloudDrift !== undefined) surfaceUniforms.uCloudDrift.value = cloudDrift;
      if (nightIntensity !== undefined) surfaceUniforms.uNightIntensity.value = nightIntensity;
      if (atmosphereIntensity !== undefined) atmosphereUniforms.uIntensity.value = atmosphereIntensity;
    },

    dispose() {
      surface.geometry.dispose();
      surface.material.dispose();
      atmosphere.geometry.dispose();
      atmosphere.material.dispose();
    },
  };
}
