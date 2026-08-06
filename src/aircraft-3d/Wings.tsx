import { useMemo } from "react";
import * as THREE from "three";
import { bodyMaterial } from "./Materials";
import { FUSELAGE_RADIUS, FUSELAGE_TIP_X } from "./Fuselage";

const EXTRUDE_SETTINGS = {
  depth: 0.08,
  bevelEnabled: true,
  bevelThickness: 0.02,
  bevelSize: 0.02,
  bevelSegments: 2,
} as const;

// A flat 2D outline extruded for thickness, then laid horizontal with a
// single rotation.x = -PI/2. That rotation is the standard "make an
// extruded shape lie flat" move: it keeps the shape's local X as world X
// (front/back — the fuselage's own axis) and turns the shape's local Y
// (drawn as "up" on paper) into world Z (left/right), so a wing planform
// sketched exactly as you'd draw it on paper — leading edge, tip, trailing
// edge — comes out correctly oriented with no further guessing.
function buildPlanform(points: [number, number][]) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    shape.lineTo(points[i][0], points[i][1]);
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, EXTRUDE_SETTINGS);
}

function SweptSurface({
  points,
  position,
  mirror,
}: {
  points: [number, number][];
  position: [number, number, number];
  mirror?: boolean;
}) {
  const geometry = useMemo(() => buildPlanform(points), [points]);

  return (
    <group position={position} scale={[1, 1, mirror ? -1 : 1]}>
      <mesh geometry={geometry} material={bodyMaterial} rotation={[-Math.PI / 2, 0, 0]} castShadow />
    </group>
  );
}

const MAIN_WING_ROOT_X = 0.3;
const MAIN_WING_POINTS: [number, number][] = [
  [0.9, 0],
  [-0.3, 2.6],
  [-0.9, 2.6],
  [-0.5, 0],
];

const H_STAB_ROOT_X = -2.0;
const H_STAB_POINTS: [number, number][] = [
  [0.45, 0],
  [0.05, 1.1],
  [-0.25, 1.1],
  [-0.1, 0],
];

const V_STAB_POINTS: [number, number][] = [
  [0.75, 0],
  [0.15, 1.15],
  [-0.25, 1.15],
  [-0.1, 0],
];

export default function Wings() {
  const vStabGeometry = useMemo(() => buildPlanform(V_STAB_POINTS), []);
  const wingZ = FUSELAGE_RADIUS * 0.85;
  const stabZ = FUSELAGE_RADIUS * 0.55;

  return (
    <group>
      {/* main wings, slightly below the fuselage centerline */}
      <SweptSurface points={MAIN_WING_POINTS} position={[MAIN_WING_ROOT_X, -0.05, wingZ]} />
      <SweptSurface points={MAIN_WING_POINTS} position={[MAIN_WING_ROOT_X, -0.05, -wingZ]} mirror />

      {/* winglets, angled up from each wingtip */}
      <group position={[MAIN_WING_ROOT_X - 0.3, 0.15, wingZ + 2.6]} rotation={[Math.PI * 0.32, 0, 0]}>
        <mesh material={bodyMaterial} castShadow>
          <boxGeometry args={[0.35, 0.5, 0.06]} />
        </mesh>
      </group>
      <group position={[MAIN_WING_ROOT_X - 0.3, 0.15, -(wingZ + 2.6)]} rotation={[-Math.PI * 0.32, 0, 0]}>
        <mesh material={bodyMaterial} castShadow>
          <boxGeometry args={[0.35, 0.5, 0.06]} />
        </mesh>
      </group>

      {/* horizontal stabilizers at the tail */}
      <SweptSurface points={H_STAB_POINTS} position={[H_STAB_ROOT_X, 0.12, stabZ]} />
      <SweptSurface points={H_STAB_POINTS} position={[H_STAB_ROOT_X, 0.12, -stabZ]} mirror />

      {/* vertical stabilizer: unlike the horizontal surfaces, this one
          wants no rotation at all — ExtrudeGeometry's default orientation
          (shape's X/Y = world X/Y, extrusion = thin world Z) already
          stands it upright with its chord along the fuselage axis */}
      <mesh
        geometry={vStabGeometry}
        material={bodyMaterial}
        position={[FUSELAGE_TIP_X * -0.78, FUSELAGE_RADIUS * 0.85, 0]}
        castShadow
      />
    </group>
  );
}
