import { MeshStandardMaterial, DoubleSide } from "three";

// Shared, reused material instances — every component imports these rather
// than constructing its own. DoubleSide everywhere is deliberate: the
// lofted/lathed surfaces are authored blind (no WebGL preview in this
// environment), and DoubleSide makes winding-order mistakes invisible
// instead of rendering inside-out holes. At this poly count the cost is
// negligible.
export const bodyMaterial = new MeshStandardMaterial({
  color: "#f4f7fa",
  roughness: 0.28,
  metalness: 0.25,
  envMapIntensity: 0.9,
  side: DoubleSide,
});

export const stripeMaterial = new MeshStandardMaterial({
  color: "#5eead4",
  roughness: 0.3,
  metalness: 0.3,
  envMapIntensity: 0.9,
  side: DoubleSide,
});

export const glassMaterial = new MeshStandardMaterial({
  color: "#0a1120",
  roughness: 0.08,
  metalness: 0.6,
  envMapIntensity: 1.2,
});

export const engineMaterial = new MeshStandardMaterial({
  color: "#c8cdd6",
  roughness: 0.35,
  metalness: 0.75,
  envMapIntensity: 1.0,
  side: DoubleSide,
});

export const engineDarkMaterial = new MeshStandardMaterial({
  color: "#131a26",
  roughness: 0.4,
  metalness: 0.5,
  side: DoubleSide,
});

export const gearMaterial = new MeshStandardMaterial({
  color: "#2b3342",
  roughness: 0.45,
  metalness: 0.7,
});
