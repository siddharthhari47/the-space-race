import { useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

// Self-hosted Draco decoder (copied from three/examples/jsm/libs/draco/gltf
// into public/draco/) — keeps model loading free of any external CDN
// dependency, consistent with the procedural scene's earlier choice to
// build lighting from Lightformers rather than fetch an external HDRI.
useGLTF.setDecoderPath("/draco/");

interface ModelProps {
  url: string;
  onLoaded?: (scene: THREE.Group) => void;
}

export default function Model({ url, onLoaded }: ModelProps) {
  const { scene } = useGLTF(url, true);

  // Break the shared-material graph on purpose: the source model reuses a
  // small palette of materials across many unrelated meshes (85 -> 1 after
  // the palette-texture compression pass), so mutating one mesh's material
  // for a highlight/dim effect would otherwise visually affect every other
  // mesh sharing that same material instance. Cloning once per mesh, here,
  // at load time, means later highlight logic only ever needs to mutate
  // each mesh's own clone. This is the direct inverse of the old
  // src/aircraft-3d/Materials.ts, which deliberately shared instances
  // since procedural geometry never needed independent per-part state.
  const clonedScene = useMemo(() => {
    const cloned = scene.clone(true);
    cloned.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.material) {
        const materials = Array.isArray(mesh.material)
          ? mesh.material.map((m) => m.clone())
          : [mesh.material.clone()];
        mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
        for (const m of materials as THREE.MeshStandardMaterial[]) {
          // Every one of this model's 85 source materials explicitly sets
          // metallicFactor: 0 (verified directly against the source glTF
          // JSON) — this aircraft skin has no genuinely metallic surfaces.
          // The @gltf-transform palette-texture compression pass that
          // consolidated those 85 materials into one baked some of them
          // to metalness 1 instead (confirmed live: a fully metallic,
          // fully rough surface renders almost black without strong
          // environment reflection). Forcing metalness back to the
          // verified source value fixes it for every camera angle.
          m.metalness = 0;
        }
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return cloned;
  }, [scene]);

  useEffect(() => {
    clonedScene.updateMatrixWorld(true);
    onLoaded?.(clonedScene);
  }, [clonedScene, onLoaded]);

  return <primitive object={clonedScene} />;
}
