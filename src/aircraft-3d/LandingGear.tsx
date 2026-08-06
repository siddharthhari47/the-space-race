import { gearMaterial } from "./Materials";

// Slim dark-metal struts and small wheels, tucked close to the body —
// believable without competing with the airframe for attention. Static
// this pass (no retraction animation).
function Strut({
  x,
  z,
  length,
}: {
  x: number;
  z: number;
  length: number;
}) {
  return (
    <group position={[x, -0.42, z]}>
      <mesh material={gearMaterial} position={[0, -length / 2, 0]} castShadow>
        <cylinderGeometry args={[0.026, 0.026, length, 10]} />
      </mesh>
      <mesh material={gearMaterial} position={[0, -length, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.1, 0.07, 16]} />
      </mesh>
    </group>
  );
}

export default function LandingGear() {
  return (
    <group>
      <Strut x={1.55} z={0} length={0.42} />
      <Strut x={-0.05} z={0.34} length={0.5} />
      <Strut x={-0.05} z={-0.34} length={0.5} />
    </group>
  );
}
