import * as THREE from "three";

// Lofts a series of cross-sections (each an equal-length ring of points)
// into one continuous indexed surface with smooth shared-vertex normals —
// the core technique that makes wings and stabilizers read as sculpted
// surfaces instead of extruded slabs.
export function loftGeometry(sections: THREE.Vector3[][]): THREE.BufferGeometry {
  const sectionCount = sections.length;
  const ringSize = sections[0].length;

  const positions: number[] = [];
  sections.forEach((section) => section.forEach((p) => positions.push(p.x, p.y, p.z)));

  const indices: number[] = [];
  for (let i = 0; i < sectionCount - 1; i++) {
    for (let j = 0; j < ringSize; j++) {
      const jn = (j + 1) % ringSize;
      const a = i * ringSize + j;
      const b = i * ringSize + jn;
      const c = (i + 1) * ringSize + j;
      const d = (i + 1) * ringSize + jn;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// A closed airfoil outline (NACA-style thickness distribution with gentle
// camber), returned as a loop running trailing edge → upper surface →
// leading edge → lower surface. x runs 0 (leading edge) to 1 (trailing
// edge) before being scaled by chord.
export function airfoilLoop(samples = 14, thickness = 0.12): [number, number][] {
  const yt = (x: number) =>
    5 *
    thickness *
    (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  const camber = (x: number) => 0.025 * Math.sin(Math.PI * x);

  const points: [number, number][] = [];
  for (let i = 0; i <= samples; i++) {
    const x = 1 - i / samples;
    points.push([x, camber(x) + yt(x)]);
  }
  for (let i = 1; i < samples; i++) {
    const x = i / samples;
    points.push([x, camber(x) - yt(x)]);
  }
  return points;
}

export interface SurfaceStation {
  /** 0 at root, 1 at tip */
  span: number;
  chord: number;
  /** chordwise shift (sweep), applied along -X (toward the tail) */
  sweep: number;
  /** offset perpendicular to the span axis (wing flex / dihedral) */
  rise: number;
}

// Builds lofted sections for a lifting surface. `spanAxis` chooses whether
// the surface extends along Z (wings, horizontal stabilizers) or Y
// (vertical stabilizer); `direction` mirrors it.
export function surfaceSections(
  stations: SurfaceStation[],
  spanLength: number,
  spanAxis: "z" | "y",
  direction = 1,
  airfoil = airfoilLoop()
): THREE.Vector3[][] {
  return stations.map((station) => {
    return airfoil.map(([cx, cy]) => {
      const chordwise = -station.sweep + (0.3 - cx) * station.chord;
      const thicknesswise = cy * station.chord;
      const spanwise = station.span * spanLength * direction;

      if (spanAxis === "z") {
        return new THREE.Vector3(chordwise, station.rise + thicknesswise, spanwise);
      }
      return new THREE.Vector3(chordwise, spanwise, station.rise + thicknesswise);
    });
  });
}
