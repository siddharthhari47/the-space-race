import { useMemo } from "react";
import * as THREE from "three";

// Replaces drei's <Sky>. That component is a literal box mesh whose
// fragment shader hardcodes the camera position as world origin (0,0,0) —
// not a uniform, a compile-time constant in the GLSL — and clamps any
// view direction pointing below the horizon to the same pale, hazy
// horizon color (zenithAngle = acos(max(0.0, dot(up, direction)))). Both
// are fine when the camera stays within a few hundred units of origin
// (true for the Boeing config), but produce real, confirmed bugs
// otherwise: a visible box edge for a model/camera operating thousands of
// units from origin (the helicopter), and a flat pale-white wash for
// *any* camera angle that dips below the horizon on *either* model
// (reported directly, twice, as "the bottom looks white").
//
// This sky has no such assumptions. It's a large sphere, vertex-colored
// (not a shader depending on camera position at all), rendered from the
// inside (BackSide) and unlit (MeshBasicMaterial — not affected by scene
// lighting/exposure). Color depends only on each vertex's own local Y —
// a deliberately blue "horizon" color rather than the drei Sky's pale
// clamp, held constant below the equator too, so every view direction
// reads as sky-blue, exactly what was actually asked for.
interface GradientSkyProps {
  radius?: number;
}

const ZENITH_COLOR = new THREE.Color("#3d7fd6");
const HORIZON_COLOR = new THREE.Color("#8ec5ff");

export default function GradientSky({ radius = 2500 }: GradientSkyProps) {
  const geometry = useMemo(() => {
    const geo = new THREE.SphereGeometry(radius, 32, 24);
    const position = geo.attributes.position;
    const colors = new Float32Array(position.count * 3);
    const color = new THREE.Color();
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i) / radius; // -1 (nadir) to 1 (zenith)
      // Above the equator: blend zenith -> horizon. At/below the
      // equator: hold the horizon color — no clamp-to-white, no
      // "ground" concept, just consistently blue.
      const t = Math.max(0, y);
      color.copy(HORIZON_COLOR).lerp(ZENITH_COLOR, t);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [radius]);

  return (
    <mesh geometry={geometry} renderOrder={-1}>
      <meshBasicMaterial vertexColors side={THREE.BackSide} fog={false} depthWrite={false} />
    </mesh>
  );
}
