import { gearMaterial } from "./Materials";
import { FUSELAGE_RADIUS } from "./Fuselage";

const STRUT_RADIUS = 0.035;
const WHEEL_RADIUS = 0.14;
const WHEEL_THICKNESS = 0.09;

function Wheel({ position }: { position: [number, number, number] }) {
  return (
    <mesh material={gearMaterial} position={position} rotation={[Math.PI / 2, 0, 0]} castShadow>
      <cylinderGeometry args={[WHEEL_RADIUS, WHEEL_RADIUS, WHEEL_THICKNESS, 14]} />
    </mesh>
  );
}

function Strut({ x, z, length, wheelZOffset = 0 }: { x: number; z: number; length: number; wheelZOffset?: number }) {
  return (
    <group position={[x, -FUSELAGE_RADIUS * 0.75, z]}>
      <mesh material={gearMaterial} position={[0, -length / 2, 0]} castShadow>
        <cylinderGeometry args={[STRUT_RADIUS, STRUT_RADIUS, length, 8]} />
      </mesh>
      <Wheel position={[0, -length, wheelZOffset]} />
    </group>
  );
}

// Static gear only — no retraction animation this pass. Kept short and
// tucked close to the body so it reads as "landing gear" without becoming
// the kind of sprawling, overlap-prone cluster the old 2D illustration ran
// into around the wing root.
export default function LandingGear() {
  return (
    <group>
      <Strut x={1.7} z={0} length={0.5} />
      <Strut x={0.15} z={FUSELAGE_RADIUS * 0.5} length={0.62} />
      <Strut x={0.15} z={-FUSELAGE_RADIUS * 0.5} length={0.62} />
    </group>
  );
}
