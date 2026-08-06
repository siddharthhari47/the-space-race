import { bodyMaterial, stripeMaterial, glassMaterial } from "./Materials";

// Nose points toward +X, tail toward -X. A capsule gives a clean rounded
// nose and tail "for free" — exactly the low-poly, no-outline look we want,
// with no hand-drawn taper curve to get wrong.
export const FUSELAGE_RADIUS = 0.55;
export const FUSELAGE_LENGTH = 4.2;
export const FUSELAGE_TIP_X = FUSELAGE_LENGTH / 2 + FUSELAGE_RADIUS;

export default function Fuselage() {
  return (
    <group rotation={[0, 0, Math.PI / 2]}>
      <mesh material={bodyMaterial} castShadow receiveShadow>
        <capsuleGeometry args={[FUSELAGE_RADIUS, FUSELAGE_LENGTH, 8, 16]} />
      </mesh>

      {/* cheatline stripe: a thin box riding the lower half of the body,
          simpler and more predictable than matching a curved band to the
          capsule's surface with an arc-sliced cylinder */}
      <mesh material={stripeMaterial} position={[0, -FUSELAGE_RADIUS * 0.5, 0]}>
        <boxGeometry args={[FUSELAGE_LENGTH * 0.9, FUSELAGE_RADIUS * 0.22, FUSELAGE_RADIUS * 2.1]} />
      </mesh>

      {/* cockpit: a shallow dome sitting proud of the nose, not an
          individually modeled window per the brief */}
      <mesh
        material={glassMaterial}
        position={[FUSELAGE_LENGTH * 0.4, FUSELAGE_RADIUS * 0.3, 0]}
        rotation={[0, 0, Math.PI * 0.06]}
      >
        <sphereGeometry args={[FUSELAGE_RADIUS * 0.48, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
      </mesh>
    </group>
  );
}
