// One subject-locked camera from the Saturn tour through lunar landing.
import { smootherstep } from "./mission.js";
import { tourCameraWorld } from "./tour.js";
import { lunarCameraWorld, followPosition } from "./lunar.js";
import { slerp } from "./translunar.js";

export const journeyWeightAt = tourU => tourU < 0 ? 0 : smootherstep(0, 0.30, tourU);

export function journeyCameraWorld({ progress, tourU, lunarU, tourFrom, tourTo }, aspect, rig) {
  const start = tourFrom + (tourTo - tourFrom) * 0.85;
  const blend = smootherstep(start, Math.max(tourTo + 0.20, start + 0.1), progress);
  const destination = () => lunarCameraWorld(lunarU, aspect, { ...rig, axis: rig.trackAxis });
  if (blend === 1) return destination();

  // Ease to the final upper-stage view instead of pulling back to empty
  // space or letting the old tour's target slide down the discarded stages.
  const t = Math.min(1, Math.max(0, (tourU - 0.85) / 0.05));
  const heldU = tourU <= 0.85 ? tourU : 0.85 + 0.05 * (t - 0.5 * t * t);
  const from = tourCameraWorld(heldU, aspect, rig);
  if (blend === 0) return from;
  const to = destination();
  const mix = (a, b) => a + (b - a) * blend;
  const target = from.target.map((v, i) => mix(v, to.target[i]));
  const offset = followPosition(
    from.position.map((v, i) => v - from.target[i]),
    to.position.map((v, i) => v - to.target[i]), [0, 0, 0], blend);
  return {
    position: target.map((v, i) => v + offset[i]), target,
    up: slerp(from.up, to.up, blend),
    fovDeg: mix(from.fovDeg, to.fovDeg), rollDeg: mix(from.rollDeg, to.rollDeg),
    shiftX: mix(from.shiftX, to.shiftX), shiftY: mix(from.shiftY, to.shiftY),
  };
}
