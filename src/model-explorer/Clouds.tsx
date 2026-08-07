import { useMemo } from "react";
import * as THREE from "three";

// Procedural puffy-cloud sprites — no external texture fetch. drei's own
// <Cloud>/<Clouds> components default to a texture hosted on a third-party
// CDN (rawcdn.githack.com), which would make this scene depend on that CDN
// staying up at runtime. Everything else in this scene is already
// self-contained (procedural Lightformers instead of an HDRI fetch, a
// self-hosted Draco decoder) — this follows the same rule: the cloud
// "sprite" is a canvas texture generated once in the browser, not loaded
// from anywhere.
function makeCloudTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // A single soft radial gradient reads as a plain circular blob, not a
  // cloud. Overlapping several off-center soft circles of varying radius
  // builds an irregular, lumpy silhouette instead — the classic technique
  // for a puffy-cloud sprite.
  const puffs: Array<[number, number, number]> = [
    [64, 64, 40],
    [40, 70, 30],
    [88, 68, 32],
    [50, 45, 26],
    [78, 48, 28],
    [64, 85, 30],
  ];

  for (const [cx, cy, r] of puffs) {
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.6, "rgba(255,255,255,0.85)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }

  // Flat white puffs on a flat white-ish sky have almost no contrast —
  // confirmed live, that's exactly what read as "just looks like white."
  // `source-atop` confines this next fill to pixels the puffs above
  // already covered, so it shades the existing silhouette (brighter top,
  // cooler shadowed underside) instead of painting outside it — the
  // standard trick for making a flat billboard sprite read as
  // three-dimensional.
  ctx.globalCompositeOperation = "source-atop";
  const shade = ctx.createLinearGradient(0, 0, 0, size);
  shade.addColorStop(0, "rgba(255,255,255,0.15)");
  shade.addColorStop(0.55, "rgba(255,255,255,0)");
  shade.addColorStop(1, "rgba(190,205,225,0.35)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = "source-over";

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

interface CloudClusterProps {
  texture: THREE.Texture;
  center: [number, number, number];
  puffCount: number;
  spread: number;
  baseScale: number;
}

function CloudCluster({ texture, center, puffCount, spread, baseScale }: CloudClusterProps) {
  const puffs = useMemo(() => {
    const rand = (seed: number) => {
      // small deterministic pseudo-random so the cluster shape is stable
      // across re-renders without needing external state
      const x = Math.sin(seed * 12.9898) * 43758.5453;
      return x - Math.floor(x);
    };
    return Array.from({ length: puffCount }, (_, i) => {
      const a = rand(i + center[0]);
      const b = rand(i + center[1] + 7.3);
      const c = rand(i + center[2] + 13.1);
      return {
        position: [
          center[0] + (a - 0.5) * spread,
          center[1] + (b - 0.5) * spread * 0.35,
          center[2] + (c - 0.5) * spread,
        ] as [number, number, number],
        scale: baseScale * (0.7 + rand(i * 3.7) * 0.9),
        opacity: 0.8 + rand(i * 5.1) * 0.18,
      };
    });
  }, [center, puffCount, spread, baseScale]);

  return (
    <group>
      {puffs.map((p, i) => (
        <sprite key={i} position={p.position} scale={[p.scale, p.scale * 0.6, 1]}>
          <spriteMaterial
            map={texture}
            transparent
            opacity={p.opacity}
            depthWrite={false}
            fog={false}
          />
        </sprite>
      ))}
    </group>
  );
}

// A handful of clusters scattered around and below the aircraft at
// varying distance, so they read as atmospheric depth (some near, some
// far, some below eye level) rather than a flat backdrop pasted behind
// the model. A couple sit close to the default camera's line of sight
// (camera ~[60,28,65] looking at ~[1.6,4.2,0.3]) so clouds are actually
// visible without the user having to rotate first.
const CLUSTER_CENTERS: Array<[number, number, number]> = [
  [10, -8, 20],
  [-25, -12, -15],
  [45, -20, 35],
  [-60, -18, 40],
  [70, -25, -50],
  [-30, -35, -80],
  [90, -10, 60],
  [-100, -20, -20],
  [20, -40, 100],
];

export default function Clouds() {
  const texture = useMemo(() => makeCloudTexture(), []);

  return (
    <>
      {CLUSTER_CENTERS.map((center, i) => (
        <CloudCluster
          key={i}
          texture={texture}
          center={center}
          puffCount={5}
          spread={48}
          baseScale={50}
        />
      ))}
    </>
  );
}
