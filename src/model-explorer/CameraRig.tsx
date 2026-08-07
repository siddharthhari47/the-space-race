import { useEffect, useRef } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import AutoRotateControls from "./AutoRotateControls";
import { useCameraFlyTo } from "./useCameraFlyTo";
import type { HotspotConfig, ModelExplorerConfig } from "./types";

interface CameraRigProps {
  config: ModelExplorerConfig;
  selectedHotspot: HotspotConfig | null;
  // A bump counter, not a boolean — "Reset View" needs to fly back to
  // the default even when selectedHotspot is *already* null (the user
  // free-rotated/zoomed without ever selecting a hotspot), where a plain
  // state change wouldn't retrigger this effect on its own.
  resetSignal: number;
}

// Owns the OrbitControls instance and drives the camera fly-to whenever
// the selected hotspot changes — including back to the default overview
// when a hotspot is deselected, so closing the sidebar always returns to
// a predictable view rather than leaving the camera wherever the last
// fly-to left it.
export default function CameraRig({ config, selectedHotspot, resetSignal }: CameraRigProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { flyTo } = useCameraFlyTo(controlsRef);

  useEffect(() => {
    const destination = selectedHotspot
      ? { position: selectedHotspot.cameraPosition, target: selectedHotspot.cameraTarget }
      : config.cameraDefault;
    flyTo(destination);
    // config.cameraDefault is a stable reference for a given config module,
    // and flyTo's identity is stable across renders (memoized on the
    // controls ref) — only the selection itself (or an explicit reset)
    // should retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHotspot, resetSignal]);

  return (
    <AutoRotateControls
      ref={controlsRef}
      target={config.cameraDefault.target}
      minDistance={config.controlsLimits.minDistance}
      maxDistance={config.controlsLimits.maxDistance}
      suspended={!!selectedHotspot}
    />
  );
}
