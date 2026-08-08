import { useCallback, useRef } from "react";
import * as THREE from "three";
import type { HotspotConfig } from "./types";

interface MeshEntry {
  mesh: THREE.Mesh;
  box: THREE.Box3;
  diagonal: number;
  baseColor: THREE.Color;
  baseEmissive: THREE.Color;
  baseEmissiveIntensity: number;
}

// A mesh whose own bounding-box diagonal exceeds this is treated as a
// large, scene-spanning structural piece and excluded from a position
// hotspot's match unless that hotspot opts in via `includeLargeMeshes`.
// This is a per-model value, not a universal constant — it only makes
// sense relative to that model's own unit scale. Boeing's GLB (~66-unit
// overall bounding-box diagonal, "wing" mesh ~46 units) uses the default
// of 20 below; the Merlin helicopter's GLB is authored at a completely
// different scale (~2850-unit overall diagonal, its "Prop"/rotor mesh
// alone ~2450) and sets its own `largeMeshDiagonalThreshold` in its
// config accordingly — without that, every mesh on a model at this scale
// would count as "large" and nothing would highlight by default.
const DEFAULT_LARGE_MESH_DIAGONAL_THRESHOLD = 20;

const HIGHLIGHT_EMISSIVE = new THREE.Color("#5eead4");
const HIGHLIGHT_EMISSIVE_INTENSITY = 0.55;
// Dimming is done by darkening color, not lowering opacity — this scene's
// background is near-black (#05070f), and alpha-blending a light-grey
// aircraft material down to ~20% opacity over that background renders as
// nearly indistinguishable from the background itself (confirmed via a
// live screenshot: a dimmed model was structurally present in the canvas
// but visually gone). Multiplying color toward black keeps every mesh
// fully opaque — avoiding both the contrast problem and any
// transparency-sort artifacts from mixing opaque and alpha-blended
// meshes in one scene — while still reading clearly as "dimmed" against
// the bright, emissive-highlighted selection.
const DIM_COLOR_FACTOR = 0.32;

function materialsOf(mesh: THREE.Mesh): THREE.MeshStandardMaterial[] {
  const m = mesh.material;
  return (Array.isArray(m) ? m : [m]) as THREE.MeshStandardMaterial[];
}

function restore(entry: MeshEntry) {
  for (const material of materialsOf(entry.mesh)) {
    material.color.copy(entry.baseColor);
    material.emissive.copy(entry.baseEmissive);
    material.emissiveIntensity = entry.baseEmissiveIntensity;
    material.needsUpdate = true;
  }
}

// Highlight/dim without relying on semantic mesh names (this model has
// none). Matching is point-to-box, not center-to-center: some parts on
// this model (the "wing" node, for one) are a single mesh spanning far
// beyond any one hotspot's local radius, so a mesh's *bounding-box
// center* can sit nowhere near a hotspot placed on it. Box3.distanceToPoint
// correctly returns 0 for a hotspot placed inside that mesh's bounding
// volume regardless of where its center lands. One accepted side effect:
// a few centerline hotspots (Fuselage, Landing Gear) will incidentally
// also highlight the wing mesh, since its bounding box genuinely
// overlaps that region in this model's particular mesh segmentation —
// documented here rather than special-cased, since the alternative
// (excluding "large" meshes from incidental matches) would also risk
// breaking the Wing hotspot's own match against that same mesh.
export function useModelHighlight(largeMeshDiagonalThreshold: number = DEFAULT_LARGE_MESH_DIAGONAL_THRESHOLD) {
  const entriesRef = useRef<MeshEntry[]>([]);
  const nodesByName = useRef<Map<string, THREE.Object3D>>(new Map());

  const registerScene = useCallback((scene: THREE.Group) => {
    const entries: MeshEntry[] = [];
    const names = new Map<string, THREE.Object3D>();

    scene.traverse((obj) => {
      if (obj.name) names.set(obj.name, obj);
      const mesh = obj as THREE.Mesh;
      if (!(mesh as THREE.Mesh).isMesh) return;

      const [firstMaterial] = materialsOf(mesh);
      const box = new THREE.Box3().setFromObject(mesh);
      const size = box.getSize(new THREE.Vector3());
      entries.push({
        mesh,
        box,
        diagonal: size.length(),
        baseColor: firstMaterial.color.clone(),
        baseEmissive: firstMaterial.emissive.clone(),
        baseEmissiveIntensity: firstMaterial.emissiveIntensity,
      });
    });

    entriesRef.current = entries;
    nodesByName.current = names;
  }, []);

  const clearHighlight = useCallback(() => {
    entriesRef.current.forEach(restore);
  }, []);

  const applyHotspot = useCallback((hotspot: HotspotConfig) => {
    const entries = entriesRef.current;

    let matched: Set<THREE.Mesh>;
    if (hotspot.bind === "position") {
      const point = new THREE.Vector3(...hotspot.position);
      matched = new Set(
        entries
          .filter((e) => hotspot.includeLargeMeshes || e.diagonal <= largeMeshDiagonalThreshold)
          .filter((e) => e.box.distanceToPoint(point) <= hotspot.radius)
          .map((e) => e.mesh)
      );
    } else {
      matched = new Set<THREE.Mesh>();
      const node = nodesByName.current.get(hotspot.nodeName);
      node?.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if ((mesh as THREE.Mesh).isMesh) matched.add(mesh);
      });
    }

    for (const entry of entries) {
      const isMatch = matched.has(entry.mesh);
      for (const material of materialsOf(entry.mesh)) {
        if (isMatch) {
          material.color.copy(entry.baseColor);
          material.emissive.copy(HIGHLIGHT_EMISSIVE);
          material.emissiveIntensity = HIGHLIGHT_EMISSIVE_INTENSITY;
        } else {
          material.color.copy(entry.baseColor).multiplyScalar(DIM_COLOR_FACTOR);
          material.emissive.copy(entry.baseEmissive);
          material.emissiveIntensity = entry.baseEmissiveIntensity;
        }
        material.needsUpdate = true;
      }
    }
  }, []);

  return { registerScene, applyHotspot, clearHighlight };
}
