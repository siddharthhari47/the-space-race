import { useMemo } from "react";
import * as THREE from "three";
import { bodyMaterial, glassMaterial } from "./Materials";

export const FUSELAGE_LENGTH = 4.6;
export const FUSELAGE_RADIUS = 0.52;

// One continuous lathed surface: rounded nose, constant mid-body, long
// tapering tail — then sculpted at the vertex level (flattened belly,
// upswept tail) so it reads as a designed aircraft body rather than a
// revolved primitive. In lathe-local space the length axis is +Y (y=0 is
// the tail, y=LENGTH the nose); the mesh is rotated so local +Y becomes
// world +X (nose forward) and local +X becomes world -Y (down), which is
// why "flatten the belly" reads as scaling positive local X below.
function buildFuselageGeometry(): THREE.BufferGeometry {
  const profile: THREE.Vector2[] = [];
  const STEPS = 40;

  profile.push(new THREE.Vector2(0.012, -0.01));
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    let r: number;
    if (t < 0.35) {
      // tail taper, gentle power curve up to full radius
      r = 0.12 + 0.88 * Math.pow(t / 0.35, 0.75);
    } else if (t < 0.85) {
      r = 1;
    } else {
      // elliptical nose rounding
      const u = (t - 0.85) / 0.15;
      r = Math.sqrt(Math.max(0, 1 - u * u));
    }
    profile.push(new THREE.Vector2(Math.max(0.012, r * FUSELAGE_RADIUS), t * FUSELAGE_LENGTH));
  }
  profile.push(new THREE.Vector2(0.012, FUSELAGE_LENGTH + 0.01));

  const geometry = new THREE.LatheGeometry(profile, 48);

  const positions = geometry.getAttribute("position");
  const TAIL_ZONE = 1.5;
  for (let i = 0; i < positions.count; i++) {
    let x = positions.getX(i);
    const y = positions.getY(i);

    // flatten the belly slightly (local +X is world "down")
    if (x > 0) x *= 0.93;

    // upsweep the tail cone (world "up" is local -X)
    if (y < TAIL_ZONE) {
      const k = (TAIL_ZONE - y) / TAIL_ZONE;
      x -= 0.24 * k * k;
    }

    positions.setX(i, x);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

export default function Fuselage() {
  const geometry = useMemo(buildFuselageGeometry, []);

  return (
    <group>
      <mesh
        geometry={geometry}
        material={bodyMaterial}
        rotation={[0, 0, -Math.PI / 2]}
        position={[-FUSELAGE_LENGTH / 2, 0, 0]}
        castShadow
        receiveShadow
      />

      {/* cockpit: one dark glossy visor band wrapped over the nose,
          integrated rather than individual windows */}
      <mesh
        material={glassMaterial}
        position={[FUSELAGE_LENGTH * 0.335, FUSELAGE_RADIUS * 0.34, 0]}
        rotation={[0, 0, -0.35]}
        scale={[1, 0.55, 0.88]}
      >
        <sphereGeometry args={[FUSELAGE_RADIUS * 0.58, 24, 16]} />
      </mesh>

      {/* wing-root belly fairing: a squashed ellipsoid blending the wings
          into the lower fuselage the way real airliners do */}
      <mesh
        material={bodyMaterial}
        position={[0.1, -FUSELAGE_RADIUS * 0.72, 0]}
        scale={[1.15, 0.3, 0.52]}
        castShadow
      >
        <sphereGeometry args={[1, 24, 16]} />
      </mesh>
    </group>
  );
}
