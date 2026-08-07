import { ContactShadows, Environment, Lightformer, Stars } from "@react-three/drei";
import * as THREE from "three";
import Model from "./Model";
import CameraRig from "./CameraRig";
import HotspotMarkers from "./HotspotMarkers";
import type { HotspotConfig, ModelExplorerConfig } from "./types";

interface SceneProps {
  config: ModelExplorerConfig;
  onModelLoaded?: (scene: THREE.Group) => void;
  selectedHotspot: HotspotConfig | null;
  focusIndex: number;
  onSelectHotspot: (hotspot: HotspotConfig, index: number) => void;
  registerMarkerRef: (index: number, el: HTMLButtonElement | null) => void;
}

// Lighting rig ported from src/aircraft-3d/main.tsx's Scene(), with
// positions/scale/ContactShadows/Stars parameters scaled up roughly 10-12x
// to match this model's real scene bounding box (~49 x 12 x 43 units,
// versus the old procedural aircraft's ~4-5 unit scale). Kept as
// procedural Lightformers rather than an external HDRI fetch, same
// reasoning as before: self-contained bundle, no runtime dependency on a
// CDN staying up.
export default function Scene({
  config,
  onModelLoaded,
  selectedHotspot,
  focusIndex,
  onSelectHotspot,
  registerMarkerRef,
}: SceneProps) {
  return (
    <>
      <Environment resolution={256} frames={1}>
        <Lightformer intensity={2} position={[0, 40, 0]} scale={[90, 40, 1]} rotation-x={Math.PI / 2} />
        <Lightformer intensity={1} position={[-45, 15, 30]} scale={[40, 22, 1]} rotation-y={Math.PI / 3} />
        <Lightformer intensity={0.7} position={[45, 10, -30]} scale={[40, 20, 1]} rotation-y={-Math.PI / 3} />
        <Lightformer intensity={0.35} color="#5eead4" position={[0, -25, 0]} scale={[80, 30, 1]} rotation-x={-Math.PI / 2} />
      </Environment>

      <directionalLight position={[40, 50, 25]} intensity={0.8} castShadow shadow-mapSize={[2048, 2048]} />
      <ambientLight intensity={0.15} />

      <Model url={config.modelUrl} onLoaded={onModelLoaded} />

      <HotspotMarkers
        hotspots={config.hotspots}
        selectedId={selectedHotspot?.id ?? null}
        focusIndex={focusIndex}
        onSelect={onSelectHotspot}
        registerRef={registerMarkerRef}
      />

      <ContactShadows position={[1.6, -0.25, 0.3]} opacity={0.4} scale={80} blur={2.5} far={16} />

      <Stars radius={150} depth={80} count={1200} factor={3} saturation={0} fade speed={0.4} />

      <CameraRig config={config} selectedHotspot={selectedHotspot} />
    </>
  );
}
