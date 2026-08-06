import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Group } from "three";
import { engineMaterial, engineDarkMaterial, stripeMaterial } from "./Materials";

const NACELLE_LENGTH = 0.82;
const ENGINE_X = 0.72;
const ENGINE_Y = -0.62;
const ENGINE_Z = 1.12;

// One lathed profile per nacelle: the outline runs from the exhaust,
// bulges over the cowling, and curls inward at the front to form a
// naturally rounded intake lip — a single smooth surface instead of
// stacked cylinders. Lathe-local +Y becomes world +X (intake forward)
// via the same -90° Z rotation the fuselage uses.
function buildNacelleGeometry(): THREE.BufferGeometry {
  const profile = [
    new THREE.Vector2(0.155, 0.02),
    new THREE.Vector2(0.21, 0.0),
    new THREE.Vector2(0.275, 0.12),
    new THREE.Vector2(0.295, 0.32),
    new THREE.Vector2(0.285, 0.55),
    new THREE.Vector2(0.26, 0.72),
    new THREE.Vector2(0.225, NACELLE_LENGTH),
    new THREE.Vector2(0.195, NACELLE_LENGTH - 0.015),
    new THREE.Vector2(0.183, NACELLE_LENGTH - 0.09),
    new THREE.Vector2(0.185, 0.6),
  ];
  return new THREE.LatheGeometry(profile, 40);
}

function Nacelle({ mirror }: { mirror?: boolean }) {
  const ref = useRef<Group>(null);
  const geometry = useMemo(buildNacelleGeometry, []);
  const seed = mirror ? Math.PI : 0;

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.position.y = ENGINE_Y + Math.sin(t * 40 + seed) * 0.0035;
  });

  const z = mirror ? -ENGINE_Z : ENGINE_Z;

  return (
    <group ref={ref} position={[ENGINE_X, ENGINE_Y, z]}>
      <mesh geometry={geometry} material={engineMaterial} rotation={[0, 0, -Math.PI / 2]} castShadow />

      {/* fan disk + spinner cone, visible through the intake */}
      <mesh material={engineDarkMaterial} position={[NACELLE_LENGTH - 0.14, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <circleGeometry args={[0.18, 28]} />
      </mesh>
      <mesh material={engineMaterial} position={[NACELLE_LENGTH - 0.1, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.045, 0.1, 16]} />
      </mesh>

      {/* teal intake lip accent ring */}
      <mesh material={stripeMaterial} position={[NACELLE_LENGTH - 0.005, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.207, 0.012, 10, 36]} />
      </mesh>

      {/* pylon blending the nacelle up into the wing */}
      <mesh material={engineMaterial} position={[-0.05, 0.3, 0]} rotation={[0, 0, 0.25]} castShadow>
        <boxGeometry args={[0.42, 0.34, 0.055]} />
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
