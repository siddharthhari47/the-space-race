import { Suspense, useCallback, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import Scene from "./Scene";
import Sidebar from "./Sidebar";
import LoadingOverlay from "./LoadingOverlay";
import { useGuidedTour } from "./useGuidedTour";
import type { HotspotConfig, ModelExplorerConfig } from "./types";

interface ExplorerShellProps {
  config: ModelExplorerConfig;
  // "full" (default): the dedicated-page exhibit — side-by-side sidebar
  // drawer, unchanged from the original single-model behavior.
  // "embedded": a compact instance meant to sit inline in theory-page
  // prose (see model-viewer-embed.js) — sidebar renders inline/stacked
  // instead of as a drawer, and a specific hotspot can be pre-selected on
  // load via focusHotspotId. Both modes get the same Reset View / Guided
  // Tour toolbar. Hotspot markers stay interactive either way — embedded
  // mode narrows the starting view, it doesn't lock the viewer to one
  // part.
  mode?: "full" | "embedded";
  focusHotspotId?: string;
}

// Top-level layout and state owner: canvas region + a sidebar that opens
// on hotspot selection, plus a credits footer rendered straight from
// config.credit (not hand-written per-page HTML), so every future model
// automatically carries correct attribution with zero page edits.
export default function ExplorerShell({ config, mode = "full", focusHotspotId }: ExplorerShellProps) {
  const [selectedHotspot, setSelectedHotspot] = useState<HotspotConfig | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const markerRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Pure: applies a hotspot's selection with no awareness of *why* it was
  // selected. Used both by direct marker clicks and by the guided tour's
  // own auto-advance — kept separate so the tour driving a selection
  // doesn't loop back into the tour-pausing logic a manual click needs.
  const applySelection = useCallback((hotspot: HotspotConfig, index: number) => {
    setSelectedHotspot(hotspot);
    setFocusIndex(index);
  }, []);

  // Embedded instances can ask to open already focused on one part (e.g. a
  // theory page's "Main Rotor" embed) — applied once the model has loaded.
  const initialFocusAppliedRef = useRef(false);
  const handleModelLoaded = useCallback(
    (_scene: THREE.Group) => {
      if (mode === "embedded" && focusHotspotId && !initialFocusAppliedRef.current) {
        const index = config.hotspots.findIndex((h) => h.id === focusHotspotId);
        if (index !== -1) {
          initialFocusAppliedRef.current = true;
          applySelection(config.hotspots[index], index);
        }
      }
    },
    [mode, focusHotspotId, config.hotspots, applySelection]
  );

  const tour = useGuidedTour({
    hotspots: config.hotspots,
    dwellMs: config.guidedTourDwellMs,
    applySelection,
  });

  const selectHotspot = useCallback(
    (hotspot: HotspotConfig, index: number) => {
      if (tour.isPlaying) tour.pause();
      applySelection(hotspot, index);
    },
    [tour, applySelection]
  );

  const closeSidebar = useCallback(() => {
    if (tour.isPlaying) tour.exit();
    setSelectedHotspot(null);
  }, [tour]);

  // A plain state change to selectedHotspot isn't enough to drive a reset
  // on its own: if the user free-rotated/zoomed without ever selecting a
  // hotspot, selectedHotspot is already null, so setting it to null again
  // wouldn't retrigger CameraRig's fly-to effect. resetSignal is a bump
  // counter CameraRig also watches, so "Reset View" always flies back to
  // the default even from an untouched selection state.
  const [resetSignal, setResetSignal] = useState(0);
  const resetView = useCallback(() => {
    if (tour.isPlaying) tour.exit();
    setSelectedHotspot(null);
    setResetSignal((n) => n + 1);
  }, [tour]);

  const registerMarkerRef = useCallback((index: number, el: HTMLButtonElement | null) => {
    markerRefs.current[index] = el;
  }, []);

  // Roving tabindex across hotspot markers, matching the Home/End/Arrow
  // pattern already used by expandable-diagram.js's pin list and
  // interactive-aircraft.js's category tabs elsewhere on the site.
  const handleMarkerKeydown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const count = config.hotspots.length;
      if (count === 0) return;

      let nextIndex: number | null = null;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        nextIndex = (focusIndex + 1) % count;
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        nextIndex = (focusIndex - 1 + count) % count;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = count - 1;
      } else if (event.key === "Escape" && selectedHotspot) {
        closeSidebar();
        return;
      }

      if (nextIndex === null) return;
      event.preventDefault();
      setFocusIndex(nextIndex);
      markerRefs.current[nextIndex]?.focus();
    },
    [config.hotspots.length, focusIndex, selectedHotspot, closeSidebar]
  );

  return (
    <div className={mode === "embedded" ? "explorer-shell explorer-shell--embedded" : "explorer-shell"}>
      <div className="explorer-toolbar">
        <button type="button" className="btn btn-secondary" onClick={resetView}>
          Reset View
        </button>
        {tour.hasStops &&
          (tour.isPlaying ? (
            <button type="button" className="btn btn-secondary" onClick={tour.pause}>
              Pause Guided Tour
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={tour.play}>
              Start Guided Tour
            </button>
          ))}
      </div>

      <div className="explorer-main">
        <div className="explorer-canvas-region" onKeyDown={handleMarkerKeydown}>
          <Canvas
            shadows
            camera={{
              position: config.cameraDefault.position,
              fov: 35,
              near: 0.1,
              far: config.cameraFar ?? 5000,
            }}
            dpr={[1, 2]}
          >
            {/* Sky-colored fog matching GradientSky's horizon color — skip
                entirely when showEnvironment is off, so a model presented
                with no environment dressing doesn't still pick up a
                sky-blue tint at its own far edges. Per-model distance
                override via config.fogDistance — see types.ts. */}
            {(config.showEnvironment ?? true) && (
              <fog
                attach="fog"
                args={["#cfe3ff", config.fogDistance?.near ?? 150, config.fogDistance?.far ?? 500]}
              />
            )}
            <Suspense fallback={null}>
              <Scene
                config={config}
                onModelLoaded={handleModelLoaded}
                selectedHotspot={selectedHotspot}
                resetSignal={resetSignal}
                focusIndex={focusIndex}
                onSelectHotspot={selectHotspot}
                registerMarkerRef={registerMarkerRef}
              />
            </Suspense>
          </Canvas>
          <LoadingOverlay />
        </div>

        <Sidebar
          hotspot={selectedHotspot}
          onClose={closeSidebar}
          tour={
            tour.isPlaying
              ? {
                  currentStopNumber: tour.currentStopNumber,
                  totalStops: tour.totalStops,
                  onNext: tour.next,
                  onPrev: tour.prev,
                  onPause: tour.pause,
                  onExit: closeSidebar,
                }
              : null
          }
        />
      </div>

      <p className="explorer-credit">
        {config.title} — {config.credit.author}:{" "}
        <a href={config.credit.modelUrl} target="_blank" rel="noopener noreferrer">
          {config.credit.modelUrlLabel}
        </a>{" "}
        licensed under{" "}
        <a href={config.credit.licenseUrl} target="_blank" rel="noopener noreferrer">
          {config.credit.licenseLabel}
        </a>
        .
      </p>
    </div>
  );
}
