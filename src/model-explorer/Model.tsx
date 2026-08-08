import { useEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Vec3 } from "./types";

// Self-hosted Draco decoder (copied from three/examples/jsm/libs/draco/gltf
// into public/draco/) — keeps model loading free of any external CDN
// dependency, consistent with the procedural scene's earlier choice to
// build lighting from Lightformers rather than fetch an external HDRI.
useGLTF.setDecoderPath("/draco/");

interface ModelProps {
  url: string;
  onLoaded?: (scene: THREE.Group) => void;
  forceZeroMetalness?: boolean;
  spinNodes?: Array<{ nodeName: string; axis: Vec3; radiansPerSecond: number }>;
}

export default function Model({ url, onLoaded, forceZeroMetalness, spinNodes }: ModelProps) {
  const { scene } = useGLTF(url, true);

  // Break the shared-material graph on purpose: some source models reuse a
  // small palette of materials across many unrelated meshes, so mutating
  // one mesh's material for a highlight/dim effect would otherwise
  // visually affect every other mesh sharing that same material instance.
  // Cloning once per mesh, here, at load time, means later highlight logic
  // only ever needs to mutate each mesh's own clone. This is the direct
  // inverse of the old src/aircraft-3d/Materials.ts, which deliberately
  // shared instances since procedural geometry never needed independent
  // per-part state.
  const clonedScene = useMemo(() => {
    const cloned = scene.clone(true);
    cloned.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.material) {
        const materials = Array.isArray(mesh.material)
          ? mesh.material.map((m) => m.clone())
          : [mesh.material.clone()];
        mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
        if (forceZeroMetalness) {
          for (const m of materials as THREE.MeshStandardMaterial[]) {
            // Boeing-only correction: every one of that model's 85 source
            // materials explicitly sets metallicFactor: 0 (verified
            // directly against the source glTF JSON) — that aircraft skin
            // has no genuinely metallic surfaces. The @gltf-transform
            // palette-texture compression pass that consolidated those 85
            // materials into one baked some of them to metalness 1 instead
            // (confirmed live: a fully metallic, fully rough surface
            // renders almost black without strong environment
            // reflection). Forcing metalness back to the verified source
            // value fixes it for every camera angle. Gated behind
            // config.forceZeroMetalness because it's wrong for any model
            // with real metallicRoughnessTexture maps (e.g. the Merlin
            // helicopter) — forcing those to 0 would flatten genuine
            // material response.
            m.metalness = 0;
          }
        }
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return cloned;
  }, [scene, forceZeroMetalness]);

  useEffect(() => {
    clonedScene.updateMatrixWorld(true);
    onLoaded?.(clonedScene);
  }, [clonedScene, onLoaded]);

  // Resolved once per model/spin-config change, not per frame — findable by
  // name since these are the same node names the hotspot configs already
  // reference. rotateOnWorldAxis (not obj.rotation.y) is deliberate: some
  // nodes carry their own small baked tilt/orientation from the source file
  // (a rotor's coning angle, for one), and rotating around the node's own
  // local axis would spin around that tilted axis instead of the intended
  // world-space one.
  const spinTargetsRef = useRef<Array<{ object: THREE.Object3D; axis: THREE.Vector3; speed: number }>>([]);
  useEffect(() => {
    spinTargetsRef.current = (spinNodes ?? [])
      .map((spin) => {
        const object = clonedScene.getObjectByName(spin.nodeName);
        if (!object) return null;
        return { object, axis: new THREE.Vector3(...spin.axis).normalize(), speed: spin.radiansPerSecond };
      })
      .filter((entry): entry is { object: THREE.Object3D; axis: THREE.Vector3; speed: number } => entry !== null);
  }, [clonedScene, spinNodes]);

  const reduceMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  useFrame((_state, delta) => {
    if (reduceMotion) return;
    for (const { object, axis, speed } of spinTargetsRef.current) {
      object.rotateOnWorldAxis(axis, speed * delta);
    }
  });

  return <primitive object={clonedScene} />;
}
