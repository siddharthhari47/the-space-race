import { useMemo } from "react";
import { loftGeometry, surfaceSections, airfoilLoop, type SurfaceStation } from "./Geometry";
import { bodyMaterial, stripeMaterial } from "./Materials";
import { FUSELAGE_RADIUS } from "./Fuselage";

// Main wing: tapered, swept, with quadratic upward flex and a raked tip —
// six lofted airfoil stations, not an extruded slab. The final two
// stations shrink and rise sharply, closing the tip into a modern raked
// wingtip without a separate winglet piece.
const WING_SPAN = 3.1;
const WING_STATIONS: SurfaceStation[] = [
  { span: 0, chord: 1.5, sweep: 0, rise: 0 },
  { span: 0.2, chord: 1.28, sweep: 0.28, rise: 0.015 },
  { span: 0.45, chord: 1.0, sweep: 0.62, rise: 0.075 },
  { span: 0.7, chord: 0.74, sweep: 0.96, rise: 0.18 },
  { span: 0.9, chord: 0.52, sweep: 1.24, rise: 0.3 },
  { span: 1.0, chord: 0.34, sweep: 1.4, rise: 0.4 },
  { span: 1.05, chord: 0.16, sweep: 1.5, rise: 0.52 },
];

const H_STAB_SPAN = 1.15;
const H_STAB_STATIONS: SurfaceStation[] = [
  { span: 0, chord: 0.62, sweep: 0, rise: 0 },
  { span: 0.5, chord: 0.44, sweep: 0.22, rise: 0.06 },
  { span: 1.0, chord: 0.26, sweep: 0.44, rise: 0.14 },
  { span: 1.05, chord: 0.12, sweep: 0.5, rise: 0.17 },
];

const V_STAB_SPAN = 1.05;
const V_STAB_STATIONS: SurfaceStation[] = [
  { span: 0, chord: 0.95, sweep: 0, rise: 0 },
  { span: 0.5, chord: 0.66, sweep: 0.42, rise: 0 },
  { span: 1.0, chord: 0.42, sweep: 0.78, rise: 0 },
  { span: 1.06, chord: 0.2, sweep: 0.86, rise: 0 },
];

const THIN_AIRFOIL = airfoilLoop(14, 0.09);

export default function Wings() {
  const wingRight = useMemo(
    () => loftGeometry(surfaceSections(WING_STATIONS, WING_SPAN, "z", 1)),
    []
  );
  const wingLeft = useMemo(
    () => loftGeometry(surfaceSections(WING_STATIONS, WING_SPAN, "z", -1)),
    []
  );
  const hStabRight = useMemo(
    () => loftGeometry(surfaceSections(H_STAB_STATIONS, H_STAB_SPAN, "z", 1, THIN_AIRFOIL)),
    []
  );
  const hStabLeft = useMemo(
    () => loftGeometry(surfaceSections(H_STAB_STATIONS, H_STAB_SPAN, "z", -1, THIN_AIRFOIL)),
    []
  );
  const vStab = useMemo(
    () => loftGeometry(surfaceSections(V_STAB_STATIONS, V_STAB_SPAN, "y", 1, THIN_AIRFOIL)),
    []
  );

  return (
    <group>
      {/* main wings, rooted into the belly fairing */}
      <group position={[0.25, -FUSELAGE_RADIUS * 0.55, 0]}>
        <mesh geometry={wingRight} material={bodyMaterial} castShadow />
        <mesh geometry={wingLeft} material={bodyMaterial} castShadow />
      </group>

      {/* horizontal stabilizers on the upswept tail */}
      <group position={[-1.85, 0.16, 0]}>
        <mesh geometry={hStabRight} material={bodyMaterial} castShadow />
        <mesh geometry={hStabLeft} material={bodyMaterial} castShadow />
      </group>

      {/* vertical stabilizer — the teal accent surface */}
      <group position={[-1.78, 0.2, 0]}>
        <mesh geometry={vStab} material={stripeMaterial} castShadow />
      </group>
    </group>
  );
}
