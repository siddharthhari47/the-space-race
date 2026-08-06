import { MeshStandardMaterial } from "three";

// Shared, reused material instances — every component imports these rather
// than constructing its own, so the whole aircraft only ever allocates one
// material per surface type.
export const bodyMaterial = new MeshStandardMaterial({
  color: "#f2f5f8",
  roughness: 0.35,
  metalness: 0.12,
});

export const stripeMaterial = new MeshStandardMaterial({
  color: "#5eead4",
  roughness: 0.4,
  metalness: 0.15,
});

export const glassMaterial = new MeshStandardMaterial({
  color: "#0b1220",
  roughness: 0.12,
  metalness: 0.5,
});

export const engineMaterial = new MeshStandardMaterial({
  color: "#8a94a3",
  roughness: 0.5,
  metalness: 0.3,
});

export const engineIntakeMaterial = new MeshStandardMaterial({
  color: "#1b2331",
  roughness: 0.25,
  metalness: 0.4,
});

export const gearMaterial = new MeshStandardMaterial({
  color: "#c7ccd4",
  roughness: 0.3,
  metalness: 0.55,
});
