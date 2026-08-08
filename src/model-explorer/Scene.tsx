import { Environment, Lightformer, Sky } from "@react-three/drei";
import * as THREE from "three";
import Model from "./Model";
import CameraRig from "./CameraRig";
import HotspotMarkers from "./HotspotMarkers";
import Clouds from "./Clouds";
import type { HotspotConfig, ModelExplorerConfig } from "./types";

interface SceneProps {
  config: ModelExplorerConfig;
  onModelLoaded?: (scene: THREE.Group) => void;
  selectedHotspot: HotspotConfig | null;
  resetSignal: number;
  focusIndex: number;
  onSelectHotspot: (hotspot: HotspotConfig, index: number) => void;
  registerMarkerRef: (index: number, el: HTMLButtonElement | null) => void;
}

// Same direction used for both the visible sun disc (Sky) and the actual
// key light, so the shading on the model always matches where the sun
// appears to be — a mismatch would read as subtly wrong even to someone
// who couldn't say why.
const SUN_POSITION: [number, number, number] = [500, 220, 300];

// Lighting rig ported from src/aircraft-3d/main.tsx's Scene(), originally
// tuned for a dark "floating in space" background. Swapped to a daytime
// sky (drei's procedural Sky — physically-based Preetham model, no
// external HDRI/texture fetch, consistent with keeping this bundle
// self-contained) since an airliner reads better against open sky than a
// starfield. Ambient light raised accordingly: a bright sky bounces
// noticeably more fill light onto the underside of the model than the
// near-black space background did. No ground-contact shadow: the model is
// meant to read as flying, not resting on invisible glass, so a shadow
// blob directly underneath it was working against the scene rather than
// selling it — puffy cloud sprites (Clouds.tsx) carry the "in the sky"
// feeling instead.
export default function Scene({
  config,
  onModelLoaded,
  selectedHotspot,
  resetSignal,
  focusIndex,
  onSelectHotspot,
  registerMarkerRef,
}: SceneProps) {
  // Scales the whole rig at once — see types.ts's lightingIntensityScale
  // comment. This rig was tuned against Boeing's flat matte, zero-texture
  // materials; a model with real metallicRoughness textures (the Merlin
  // helicopter) reflects it far more strongly and blows out to a
  // washed-out look at the same intensities, confirmed live.
  const lightScale = config.lightingIntensityScale ?? 1;

  return (
    <>
      {/* Lower turbidity + higher rayleigh than the initial pass: the first
          version read as pale/washed-out rather than blue, which left
          the white cloud sprites with almost no contrast against the
          background — exactly the "just looks like white" problem. */}
      <Sky sunPosition={SUN_POSITION} turbidity={1.5} rayleigh={3} mieCoefficient={0.003} mieDirectionalG={0.8} distance={3000} />

      <Environment resolution={256} frames={1}>
        <Lightformer intensity={2 * lightScale} position={[0, 40, 0]} scale={[90, 40, 1]} rotation-x={Math.PI / 2} />
        <Lightformer intensity={1 * lightScale} position={[-45, 15, 30]} scale={[40, 22, 1]} rotation-y={Math.PI / 3} />
        <Lightformer intensity={0.7 * lightScale} position={[45, 10, -30]} scale={[40, 20, 1]} rotation-y={-Math.PI / 3} />
        <Lightformer intensity={0.3 * lightScale} color="#bcd7ff" position={[0, -25, 0]} scale={[80, 30, 1]} rotation-x={-Math.PI / 2} />
      </Environment>

      <directionalLight position={SUN_POSITION} intensity={1.4 * lightScale} castShadow shadow-mapSize={[2048, 2048]} />
      <ambientLight intensity={0.4 * lightScale} />

      <Model
        url={config.modelUrl}
        onLoaded={onModelLoaded}
        forceZeroMetalness={config.forceZeroMetalness}
        spinNodes={config.spinNodes}
      />

      {config.groundPad && (
        <mesh
          position={config.groundPad.center}
          rotation-x={-Math.PI / 2}
          receiveShadow
        >
          <circleGeometry args={[config.groundPad.radius, 48]} />
          <meshStandardMaterial color="#2a3040" roughness={0.95} metalness={0} />
        </mesh>
      )}

      <HotspotMarkers
        hotspots={config.hotspots}
        selectedId={selectedHotspot?.id ?? null}
        focusIndex={focusIndex}
        onSelect={onSelectHotspot}
        registerRef={registerMarkerRef}
      />

      <Clouds />

      <CameraRig config={config} selectedHotspot={selectedHotspot} resetSignal={resetSignal} />
    </>
  );
}
