import { useMemo, useRef } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { HotspotConfig } from "./types";

interface HotspotMarkersProps {
  hotspots: HotspotConfig[];
  selectedId: string | null;
  focusIndex: number;
  onSelect: (hotspot: HotspotConfig, index: number) => void;
  registerRef: (index: number, el: HTMLButtonElement | null) => void;
}

// Screen-space padding around each label when testing for collisions, so
// two labels that merely touch still count as crowded.
const LABEL_GAP_PX = 4;

// Recheck every Nth frame rather than every frame. The labels only need to
// keep up with camera movement, and at 60fps this still re-evaluates about
// ten times a second — fast enough that it reads as continuous while
// costing almost nothing.
const CHECK_INTERVAL_FRAMES = 6;

// Markers are fixed-pixel-size screen overlays (no distanceFactor), so
// click targets stay a consistent size regardless of camera distance —
// matching how .diagram-pin behaves in the 2D expandable-diagram
// component. Shipping without occlusion (drei's Html `occlude` prop):
// raycasting 18 markers against ~145 meshes every frame is a real cost on
// the "mid-range laptop" performance target, and this model's forms are
// broadly convex enough that an occasional marker showing through the far
// side of the fuselage is a minor cosmetic issue, not a functional one.
//
// Every part's name is shown as a permanent label beneath its dot, not
// just on hover/select — replaces the old mesh highlight/dim effect
// (removed: it mutated material color across the whole model on every
// selection, which read as flicker/glitching on some meshes) as the way
// a viewer identifies what they're looking at.
//
// Those permanent labels do collide with each other, though. Eleven of
// them on a 21-metre aircraft, or eighteen on an airliner, overlap into an
// unreadable pile at the default zoom. The useFrame pass below resolves
// that the way a map label engine does: project every marker to screen
// space, walk them nearest-camera-first, and hide any label whose box
// overlaps one already placed. Nearest wins, because the part you're
// closest to is the one you're most likely looking at.
//
// Two deliberate choices here. The dot always stays visible even when its
// label is hidden, so every hotspot remains findable and clickable at any
// zoom — only the text is suppressed. And the DOM is mutated directly
// through refs rather than through React state, because this runs inside
// the render loop and setState here would re-render the whole marker tree
// several times a second for a change that is purely visual.
export default function HotspotMarkers({
  hotspots,
  selectedId,
  focusIndex,
  onSelect,
  registerRef,
}: HotspotMarkersProps) {
  const labelRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const frameCount = useRef(0);
  const projected = useRef(new THREE.Vector3());

  const worldPositions = useMemo(
    () =>
      hotspots.map(
        (h) => new THREE.Vector3(...(h.bind === "position" ? h.position : h.cameraTarget))
      ),
    [hotspots]
  );

  useFrame(({ camera, size }) => {
    frameCount.current += 1;
    if (frameCount.current % CHECK_INTERVAL_FRAMES !== 0) return;

    const candidates: Array<{
      el: HTMLSpanElement;
      isSelected: boolean;
      behindCamera: boolean;
      distance: number;
      left: number;
      right: number;
      top: number;
      bottom: number;
    }> = [];

    for (let i = 0; i < worldPositions.length; i++) {
      const el = labelRefs.current[i];
      if (!el) continue;

      const world = worldPositions[i];
      projected.current.copy(world).project(camera);

      // z > 1 after projection means the point is behind the near plane,
      // where the x/y components are mirrored and meaningless.
      const behindCamera = projected.current.z > 1;
      const x = (projected.current.x * 0.5 + 0.5) * size.width;
      const y = (-projected.current.y * 0.5 + 0.5) * size.height;

      // offsetWidth/Height are the label's real rendered box. They stay
      // valid while hidden because hiding is done with opacity, not
      // display:none — see .explorer-hotspot-label.is-crowded in style.css.
      const halfWidth = el.offsetWidth / 2 + LABEL_GAP_PX;
      const height = el.offsetHeight + LABEL_GAP_PX;

      candidates.push({
        el,
        isSelected: hotspots[i].id === selectedId,
        behindCamera,
        distance: camera.position.distanceTo(world),
        left: x - halfWidth,
        right: x + halfWidth,
        top: y,
        bottom: y + height,
      });
    }

    candidates.sort((a, b) => a.distance - b.distance);

    const placed: typeof candidates = [];
    for (const c of candidates) {
      if (c.behindCamera) {
        c.el.classList.add("is-crowded");
        continue;
      }

      // A selected hotspot always keeps its label, and still occupies space
      // so nothing else is drawn on top of it.
      const overlaps =
        !c.isSelected &&
        placed.some(
          (p) => !(c.right < p.left || c.left > p.right || c.bottom < p.top || c.top > p.bottom)
        );

      if (overlaps) {
        c.el.classList.add("is-crowded");
      } else {
        c.el.classList.remove("is-crowded");
        placed.push(c);
      }
    }
  });

  return (
    <>
      {hotspots.map((hotspot, index) => {
        const position = hotspot.bind === "position" ? hotspot.position : hotspot.cameraTarget;
        const isSelected = selectedId === hotspot.id;

        return (
          <Html key={hotspot.id} position={position} center zIndexRange={[20, 0]} occlude={false}>
            <div className="explorer-hotspot">
              <button
                ref={(el) => registerRef(index, el)}
                type="button"
                className="explorer-hotspot-marker"
                aria-expanded={isSelected}
                aria-label={hotspot.label}
                tabIndex={index === focusIndex ? 0 : -1}
                onClick={() => onSelect(hotspot, index)}
              >
                <span className="explorer-hotspot-dot" />
              </button>
              <span
                ref={(el) => {
                  labelRefs.current[index] = el;
                }}
                className="explorer-hotspot-label"
                aria-hidden="true"
              >
                {hotspot.label}
              </span>
            </div>
          </Html>
        );
      })}
    </>
  );
}
