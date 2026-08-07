import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

interface AutoRotateControlsProps {
  target: [number, number, number];
  minDistance: number;
  maxDistance: number;
  // True while a hotspot is selected or the guided tour is playing — idle
  // auto-rotate must not fight a user (or the tour) currently looking at
  // something specific.
  suspended?: boolean;
}

// Promoted from src/aircraft-3d/main.tsx's IdleAutoRotateControls: pauses
// the moment the user grabs the model, resumes from the exact angle they
// left after a few seconds. `suspended` extends that behavior — while true,
// auto-rotate stays off and the resume timer never fires, so a fly-to
// animation or the guided tour keeps full control of the camera until the
// caller explicitly un-suspends.
const AutoRotateControls = forwardRef<OrbitControlsImpl, AutoRotateControlsProps>(
  function AutoRotateControls({ target, minDistance, maxDistance, suspended = false }, ref) {
    const [autoRotate, setAutoRotate] = useState(true);
    const resumeTimer = useRef<number | undefined>(undefined);
    const controlsRef = useRef<OrbitControlsImpl>(null);

    useImperativeHandle(ref, () => controlsRef.current as OrbitControlsImpl, []);

    return (
      <OrbitControls
        ref={controlsRef}
        target={target}
        enableDamping
        dampingFactor={0.06}
        rotateSpeed={0.9}
        enableZoom
        enablePan
        panSpeed={0.4}
        minDistance={minDistance}
        maxDistance={maxDistance}
        autoRotate={!suspended && autoRotate}
        autoRotateSpeed={0.5}
        onStart={() => {
          if (suspended) return;
          window.clearTimeout(resumeTimer.current);
          setAutoRotate(false);
        }}
        onEnd={() => {
          if (suspended) return;
          window.clearTimeout(resumeTimer.current);
          resumeTimer.current = window.setTimeout(() => setAutoRotate(true), 4000);
        }}
      />
    );
  }
);

export default AutoRotateControls;
