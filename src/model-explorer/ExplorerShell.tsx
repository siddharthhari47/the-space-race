import { Suspense, useCallback, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import Scene from "./Scene";
import Sidebar from "./Sidebar";
import LoadingOverlay from "./LoadingOverlay";
import { useModelHighlight } from "./useModelHighlight";
import { useGuidedTour } from "./useGuidedTour";
import type { HotspotConfig, ModelExplorerConfig } from "./types";

interface ExplorerShellProps {
  config: ModelExplorerConfig;
}

// Top-level layout and state owner: canvas region + a sidebar that opens
// on hotspot selection, plus a credits footer rendered straight from
// config.credit (not hand-written per-page HTML), so every future model
// automatically carries correct attribution with zero page edits.
export default function ExplorerShell({ config }: ExplorerShellProps) {
  const [selectedHotspot, setSelectedHotspot] = useState<HotspotConfig | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const markerRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const { registerScene, applyHotspot, clearHighlight } = useModelHighlight();

  const handleModelLoaded = useCallback(
    (scene: THREE.Group) => {
      registerScene(scene);
    },
    [registerScene]
  );

  // Pure: applies a hotspot's selection with no awareness of *why* it was
  // selected. Used both by direct marker clicks and by the guided tour's
  // own auto-advance — kept separate so the tour driving a selection
  // doesn't loop back into the tour-pausing logic a manual click needs.
  const applySelection = useCallback(
    (hotspot: HotspotConfig, index: number) => {
      setSelectedHotspot(hotspot);
      setFocusIndex(index);
      applyHotspot(hotspot);
    },
    [applyHotspot]
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
    clearHighlight();
  }, [tour, clearHighlight]);

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
    <div className="explorer-shell">
      {tour.hasStops && (
        <div className="explorer-toolbar">
          {tour.isPlaying ? (
            <button type="button" className="btn btn-secondary" onClick={tour.pause}>
              Pause Guided Tour
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={tour.play}>
              Start Guided Tour
            </button>
          )}
        </div>
      )}

      <div className="explorer-main">
        <div className="explorer-canvas-region" onKeyDown={handleMarkerKeydown}>
          <Canvas
            shadows
            camera={{ position: config.cameraDefault.position, fov: 35, near: 0.1, far: 500 }}
            dpr={[1, 2]}
          >
            <color attach="background" args={["#05070f"]} />
            <fog attach="fog" args={["#05070f", 90, 220]} />
            <Suspense fallback={null}>
              <Scene
                config={config}
                onModelLoaded={handleModelLoaded}
                selectedHotspot={selectedHotspot}
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
