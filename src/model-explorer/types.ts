export type Vec3 = [number, number, number];

export interface HotspotContent {
  purpose: string;
  howItWorks: string;
  facts: string[];
  role: string;
  relatedAircraft?: string;
}

interface HotspotBase {
  id: string;
  label: string;
  shortDescription: string;
  content: HotspotContent;
  // Absolute world-space camera position/target on fly-to, rather than a
  // relative offset/distance formula — with no way to preview a fly-to
  // visually in this environment, two literal vec3s are the easiest thing
  // to hand-tune by eye later ("move X up a bit") than a recomputed offset.
  cameraPosition: Vec3;
  cameraTarget: Vec3;
  // Position in the guided tour sequence; hotspots without this are
  // reachable by direct click but skipped during the guided tour.
  tourOrder?: number;
  // "geometric" = placed from a computed world-space mesh bounding-box
  // cluster with real evidence (position/size/symmetry). "estimated" = no
  // distinct geometric signal existed for this part on this model; placed
  // from aircraft anatomy alone and needs a visual sign-off once deployed.
  confidence: "geometric" | "estimated";
}

// Binds a hotspot's highlight to every mesh whose world-space bounding box
// comes within `radius` of `position` — measured point-to-box (Three.js
// `Box3.distanceToPoint`), not center-to-center. That distinction matters:
// this model's "wing" is a single mesh spanning the entire wingspan, so
// its bounding-box *center* sits near the fuselage centerline regardless
// of where along the span a hotspot is placed — a center-to-center test
// would never match it. Point-to-box distance is 0 for any hotspot placed
// inside that mesh's (large) bounding volume, which is what actually
// selects it correctly. One consequence: a large enough mesh's bounding
// box can overlap several unrelated hotspots' local radii — this model's
// "wing" mesh was confirmed (via a live screenshot) to incidentally light
// up for the Landing Gear hotspot before `includeLargeMeshes` existed.
// useModelHighlight excludes oversized meshes from matching by default;
// only a hotspot that opts in (like this model's "wing" entry) matches
// them.
// Used throughout for this Boeing 777 GLB, which has no usable per-part
// node names (every node is a raw FBX-export artifact like
// "NurbsPath.028").
export interface PositionHotspot extends HotspotBase {
  bind: "position";
  position: Vec3;
  radius: number;
  // Opt-in escape hatch for the rare hotspot that's *supposed* to match a
  // large, scene-spanning mesh (this model's "wing" node covers the
  // entire wingspan as one piece). Without this, useModelHighlight
  // excludes any mesh whose own bounding-box diagonal is disproportionate
  // to the hotspot's radius, so one huge mesh doesn't visually dominate
  // every nearby hotspot's highlight (confirmed live: the wing mesh was
  // incidentally lighting up for the Landing Gear hotspot before this
  // existed, since its bounding box genuinely overlaps that area).
  includeLargeMeshes?: boolean;
}

// Binds a hotspot's highlight to a named node's entire mesh subtree —
// for future models authored with real part names (e.g. a hand-built
// CubeSat with "SolarPanel_L"). Not exercised by the Boeing config, but
// designed in from the start so the framework doesn't need to change to
// support a cleaner model later.
export interface NodeHotspot extends HotspotBase {
  bind: "node";
  nodeName: string;
  radius?: number;
}

export type HotspotConfig = PositionHotspot | NodeHotspot;

export interface ModelCredit {
  text: string;
  modelUrl: string;
  modelUrlLabel: string;
  author: string;
  licenseLabel: string;
  licenseUrl: string;
}

// Reserved extension point for future overlay layers (aerodynamics
// lift/drag, systems diagrams). No overlay content is implemented in this
// pass — this field exists so a future model's config can add one without
// any viewer code changing.
export interface OverlayConfig {
  id: string;
  label: string;
}

export interface ModelExplorerConfig {
  modelUrl: string;
  title: string;
  credit: ModelCredit;
  cameraDefault: {
    position: Vec3;
    target: Vec3;
  };
  controlsLimits: {
    minDistance: number;
    maxDistance: number;
  };
  hotspots: HotspotConfig[];
  guidedTourDwellMs: number;
  overlays?: OverlayConfig[];
  // Boeing-specific correction (see Model.tsx) for a compression artifact
  // in a model whose source materials are all verified metallicFactor: 0.
  // Leave unset for any model with genuine metallic/roughness textures —
  // forcing metalness to 0 on those would flatten real material response.
  forceZeroMetalness?: boolean;
  // Per-model large-mesh cutoff for useModelHighlight's includeLargeMeshes
  // opt-in — only meaningful relative to this model's own unit scale (see
  // useModelHighlight.ts). Omit to use the Boeing-calibrated default (20).
  largeMeshDiagonalThreshold?: number;
  // Multiplies every light in Scene.tsx's shared rig (ambient, directional,
  // every Lightformer). That rig was tuned against the Boeing model, whose
  // materials are flat matte color with zero textures — a model with real
  // metallicRoughness textures can pick up much stronger specular response
  // from the same lights and blow out to a washed-out, low-contrast look
  // (confirmed live on the Merlin helicopter). Default 1 (no change).
  lightingIntensityScale?: number;
  // Nodes to continuously rotate around a WORLD-space axis (not the node's
  // own local axis, which may carry an arbitrary baked tilt/orientation
  // from the source file) — e.g. a helicopter's main and tail rotors.
  // Skipped entirely under prefers-reduced-motion.
  spinNodes?: Array<{ nodeName: string; axis: Vec3; radiansPerSecond: number }>;
  // A flat circular ground pad rendered beneath the model, for the models
  // (like a parked helicopter) that read better grounded than mid-flight.
  groundPad?: { radius: number; center: Vec3 };
  // Scene fog near/far distance, in this model's own units. The default
  // (150/500) was tuned for Boeing's ~90-unit overall scale — a model at a
  // much larger scale (the Merlin helicopter, ~2850 units) sits entirely
  // past that far distance at any normal camera distance, rendering as
  // 100% fog color and making the whole model invisible against a
  // similarly-colored sky. Confirmed live as the real cause of "I can't
  // see anything," not a lighting/exposure problem.
  fogDistance?: { near: number; far: number };
  // Camera far clip plane. Default 5000 (past the Sky dome's own distance
  // of 3000) was fine for Boeing's ~90-unit scale, but a model at a much
  // larger scale can have its own geometry sit farther from the camera
  // than 5000 units at a normal viewing distance — parts of it get
  // silently clipped out of the frame entirely, not just fogged. Checked
  // by hand for the Merlin config: default camera-to-target distance
  // (~3900) plus the model's own radius (~1700) exceeds 5000.
  cameraFar?: number;
}
