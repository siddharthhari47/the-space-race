import { Html } from "@react-three/drei";
import type { HotspotConfig } from "./types";

interface HotspotMarkersProps {
  hotspots: HotspotConfig[];
  selectedId: string | null;
  focusIndex: number;
  onSelect: (hotspot: HotspotConfig, index: number) => void;
  registerRef: (index: number, el: HTMLButtonElement | null) => void;
}

// Markers are fixed-pixel-size screen overlays (no distanceFactor), so
// click targets stay a consistent size regardless of camera distance —
// matching how .diagram-pin behaves in the 2D expandable-diagram
// component. Shipping without occlusion (drei's Html `occlude` prop):
// raycasting 18 markers against ~145 meshes every frame is a real cost on
// the "mid-range laptop" performance target, and this model's forms are
// broadly convex enough that an occasional marker showing through the far
// side of the fuselage is a minor cosmetic issue, not a functional one.
export default function HotspotMarkers({
  hotspots,
  selectedId,
  focusIndex,
  onSelect,
  registerRef,
}: HotspotMarkersProps) {
  return (
    <>
      {hotspots.map((hotspot, index) => {
        const position = hotspot.bind === "position" ? hotspot.position : hotspot.cameraTarget;
        const isSelected = selectedId === hotspot.id;

        return (
          <Html key={hotspot.id} position={position} center zIndexRange={[20, 0]} occlude={false}>
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
          </Html>
        );
      })}
    </>
  );
}
