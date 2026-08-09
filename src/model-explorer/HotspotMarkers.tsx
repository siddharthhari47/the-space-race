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
// raycasting every marker against the model's meshes each frame is a real
// cost on the "mid-range laptop" performance target, and these models'
// forms are broadly convex enough that an occasional marker showing
// through the far side of the fuselage is a minor cosmetic issue.
//
// Part names are NOT shown permanently. An earlier version rendered every
// label all the time, which meant eleven of them on a fighter and
// eighteen on an airliner competing for the same few hundred pixels; it
// read as clutter over the model rather than as information about it.
// (A screen-space collision pass was tried in between, hiding labels that
// overlapped a nearer one. It worked, but it solved a problem that only
// existed because the labels were always on in the first place.)
//
// Now a name appears when you point at a marker or select one, so the
// default view is just the model and its markers, and the text shows up
// exactly when you've expressed interest in a specific part. All of that
// is CSS — see .explorer-hotspot-label in style.css — which keeps this
// component free of any per-frame work.
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
            <div className={isSelected ? "explorer-hotspot is-selected" : "explorer-hotspot"}>
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
              <span className="explorer-hotspot-label" aria-hidden="true">
                {hotspot.label}
              </span>
            </div>
          </Html>
        );
      })}
    </>
  );
}
