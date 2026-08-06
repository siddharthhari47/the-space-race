import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { engineMaterial, engineIntakeMaterial } from "./Materials";
import { FUSELAGE_RADIUS } from "./Fuselage";

const NACELLE_RADIUS = 0.22;
const NACELLE_LENGTH = 0.75;
const ENGINE_X = 0.55;
const ENGINE_Y = -0.55;
const ENGINE_Z = FUSELAGE_RADIUS * 0.85 + 1.3;

// A very small, fast sine offset per engine — reads as a subtle vibration
// rather than a distracting wobble.
function Nacelle({ mirror }: { mirror?: boolean }) {
  const ref = useRef<Group>(null);
  const seed = mirror ? Math.PI : 0;

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.position.y = ENGINE_Y + Math.sin(t * 40 + seed) * 0.004;
  });

  return (
    <group
      ref={ref}
      position={[ENGINE_X, ENGINE_Y, mirror ? -ENGINE_Z : ENGINE_Z]}
      rotation={[0, 0, Math.PI / 2]}
    >
      {/* pylon connecting the nacelle up to the wing */}
      <mesh material={engineMaterial} position={[0, NACELLE_RADIUS + 0.14, 0]} castShadow>
        <boxGeometry args={[0.08, 0.28, 0.3]} />
      </mesh>

      <mesh material={engineMaterial} castShadow>
        <cylinderGeometry args={[NACELLE_RADIUS, NACELLE_RADIUS * 0.92, NACELLE_LENGTH, 16]} />
      </mesh>
      <mesh material={engineIntakeMaterial} position={[0, NACELLE_LENGTH * 0.42, 0]}>
        <cylinderGeometry args={[NACELLE_RADIUS * 0.75, NACELLE_RADIUS * 0.8, 0.06, 16]} />
      </mesh>
    </group>
  );
}

export default function Engines() {
  return (
    <group>
      <Nacelle />
      <Nacelle mirror />
    </group>
  );
}
