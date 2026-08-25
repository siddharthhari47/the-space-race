// Stars.
//
// Procedural, and stated as procedural: this is not a star catalogue and
// nothing on the page claims it is. What it does borrow from the real sky
// is the distribution. Naked-eye stars are not scattered evenly in
// brightness — each step down in magnitude roughly triples the count — so
// drawing a thousand identical dots produces something that reads as noise
// rather than as a sky. A handful of bright ones carrying a field of faint
// ones is the whole difference.
//
// The field is re-centred on the camera every frame and drawn before
// anything else with depth testing off, which puts it at infinity for free:
// no far-plane arithmetic, no precision trouble when the camera later
// travels a third of a million kilometres to the Moon.

import * as THREE from "three";

// Deterministic, so the sky does not reshuffle itself on every resize or
// reload. Same generator the rest of the site's canvases use.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VERTEX = /* glsl */ `
attribute float aSize;
attribute vec3 aColour;
uniform float uPixelRatio;
uniform float uScale;
varying vec3 vColour;
varying float vSize;

void main() {
  vColour = aColour;
  vSize = aSize;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  // No distance attenuation: these are meant to be infinitely far away, so
  // their size on screen must not change as the camera moves.
  gl_PointSize = aSize * uPixelRatio * uScale;
}
`;

const FRAGMENT = /* glsl */ `
uniform float uIntensity;
varying vec3 vColour;
varying float vSize;

void main() {
  // A soft disc rather than a square. Squares are the classic tell.
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d) * 2.0;
  float alpha = 1.0 - smoothstep(0.35, 1.0, r);
  if (alpha <= 0.0) discard;

  // Brighter stars bloom slightly wider than their core, which is a
  // property of the eye and the camera rather than of the star.
  float core = 1.0 - smoothstep(0.0, 0.55, r);
  vec3 colour = mix(vColour, vec3(1.0), core * 0.5);

  gl_FragColor = vec4(colour * uIntensity, alpha * alpha);
  #include <colorspace_fragment>
}
`;

export function createStarfield({ count = 2400, seed = 19690716, radius = 1e6 } = {}) {
  const rand = mulberry32(seed);

  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const colours = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    // Uniform on the sphere. Sampling latitude linearly instead of by
    // arccos is the standard mistake and it bunches stars at the poles.
    const u = rand() * 2 - 1;
    const theta = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    positions[i * 3] = s * Math.cos(theta) * radius;
    positions[i * 3 + 1] = u * radius;
    positions[i * 3 + 2] = s * Math.sin(theta) * radius;

    // Magnitude-like distribution: mostly faint, a few obvious.
    const roll = rand();
    const brightness = roll < 0.82 ? 0.18 + rand() * 0.3 : roll < 0.975 ? 0.5 + rand() * 0.35 : 0.9 + rand() * 0.5;
    sizes[i] = brightness * 2.0;

    // Real stars run from orange-red to blue-white. The spread is small on
    // purpose — a rainbow starfield is worse than a white one.
    const warmth = rand();
    const tint = warmth < 0.55 ? [1.0, 0.96, 0.9] : warmth < 0.85 ? [0.88, 0.93, 1.0] : [1.0, 0.86, 0.72];
    colours[i * 3] = tint[0];
    colours[i * 3 + 1] = tint[1];
    colours[i * 3 + 2] = tint[2];
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aColour", new THREE.BufferAttribute(colours, 3));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: 1 },
      uScale: { value: 1 },
      uIntensity: { value: 1 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.name = "starfield";
  // Drawn first, with depth testing off, so everything else paints over it.
  points.renderOrder = -10;
  points.frustumCulled = false;

  return {
    points,
    update({ cameraPosition, pixelRatio = 1, intensity = 1, scale = 1 }) {
      points.position.copy(cameraPosition);
      material.uniforms.uPixelRatio.value = pixelRatio;
      material.uniforms.uIntensity.value = intensity;
      material.uniforms.uScale.value = scale;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
