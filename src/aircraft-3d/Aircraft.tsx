import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import Fuselage from "./Fuselage";
import Wings from "./Wings";
import Engines from "./Engines";
import LandingGear from "./LandingGear";

export default function Aircraft() {
  const ref = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.position.y = Math.sin(t * 0.6) * 0.08;
    ref.current.rotation.z = Math.sin(t * 0.45) * 0.02;
    ref.current.rotation.x = Math.sin(t * 0.35 + 1) * 0.015;
  });

  return (
    <group ref={ref}>
      <Fuselage />
      <Wings />
      <Engines />
      <LandingGear />
    </group>
  );
}
