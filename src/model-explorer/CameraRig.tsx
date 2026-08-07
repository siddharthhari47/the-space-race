import { useEffect, useRef } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import AutoRotateControls from "./AutoRotateControls";
import { useCameraFlyTo } from "./useCameraFlyTo";
import type { HotspotConfig, ModelExplorerConfig } from "./types";

interface CameraRigProps {
  config: ModelExplorerConfig;
  selectedHotspot: HotspotConfig | null;
}

// Owns the OrbitControls instance and drives the camera fly-to whenever
// the selected hotspot changes — including back to the default overview
// when a hotspot is deselected, so closing the sidebar always returns to
// a predictable view rather than leaving the camera wherever the last
// fly-to left it.
export default function CameraRig({ config, selectedHotspot }: CameraRigProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { flyTo } = useCameraFlyTo(controlsRef);

  useEffect(() => {
    const destination = selectedHotspot
      ? { position: selectedHotspot.cameraPosition, target: selectedHotspot.cameraTarget }
      : config.cameraDefault;
    flyTo(destination);
    // config.cameraDefault is a stable reference for a given config module,
    // and flyTo's identity is stable across renders (memoized on the
    // controls ref) — only the selection itself should retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHotspot]);

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
