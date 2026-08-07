import { useCallback, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { easeStandard } from "./bezierEasing";
import type { Vec3 } from "./types";

interface FlyToTarget {
  position: Vec3;
  target: Vec3;
}

interface Animation {
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  startTarget: THREE.Vector3;
  endTarget: THREE.Vector3;
  startTime: number;
  onComplete?: () => void;
}

const FLY_DURATION_MS = 1400;

// An explicit start->end tween, not drei/maath's exponential-damping
// approach — damping is asymptotic ("done" is a fuzzy epsilon threshold),
// which doesn't give the guided tour a crisp "this fly-to finished, now
// dwell, then advance" signal the way a fixed-duration tween's t>=1 does.
export function useCameraFlyTo(controlsRef: RefObject<OrbitControlsImpl | null>) {
  const { camera } = useThree();
  const animRef = useRef<Animation | null>(null);

  const flyTo = useCallback(
    (to: FlyToTarget, onComplete?: () => void) => {
      const controls = controlsRef.current;
      if (!controls) return;

      const endPos = new THREE.Vector3(...to.position);
      const endTarget = new THREE.Vector3(...to.target);

      // The global CSS reduced-motion rule can't reach into the canvas —
      // this is the explicit JS-side check the framework needs to honor
      // prefers-reduced-motion for camera movement.
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion) {
        animRef.current = null;
        camera.position.copy(endPos);
        controls.target.copy(endTarget);
        controls.update();
        onComplete?.();
        return;
      }

      animRef.current = {
        startPos: camera.position.clone(),
        endPos,
        startTarget: controls.target.clone(),
        endTarget,
        startTime: performance.now(),
        onComplete,
      };
    },
    [camera, controlsRef]
  );

  useFrame(() => {
    const anim = animRef.current;
    if (!anim) return;
    const controls = controlsRef.current;
    if (!controls) {
      animRef.current = null;
      return;
    }

    const elapsed = performance.now() - anim.startTime;
    const t = Math.min(elapsed / FLY_DURATION_MS, 1);
    const eased = easeStandard(t);

    camera.position.lerpVectors(anim.startPos, anim.endPos, eased);
    controls.target.lerpVectors(anim.startTarget, anim.endTarget, eased);
    controls.update();

    if (t >= 1) {
      const { onComplete } = anim;
      animRef.current = null;
      onComplete?.();
    }
  });

  return { flyTo };
}
