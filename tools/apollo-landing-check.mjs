import assert from "node:assert/strict";
import { landingEffectsAt } from "../src/apollo/landing-effects.js";
import { at, getSecondsAt } from "../src/apollo/flight.js";
import { lunarCameraWorld } from "../src/apollo/lunar.js";

const start = getSecondsAt(at("poweredDescent"));
const contact = getSecondsAt(at("touchdown"));
for (const time of [0, start - 1, start, contact, contact + 100]) {
  const { throttle, dust } = landingEffectsAt(time);
  assert.equal(throttle, 0, `no lingering exhaust at ${time}`);
  assert.equal(dust, 0, `no lingering dust at ${time}`);
}
assert(landingEffectsAt(start + 10).throttle > 0);
assert(landingEffectsAt(contact - 15).dust > 0.9);

// A discontinuity does not get smaller with twice as many samples.
for (const key of ["throttle", "dust"]) {
  const maxStep = (n) => {
    let previous = landingEffectsAt(start - 1)[key], worst = 0;
    for (let i = 1; i <= n; i++) {
      const t = start - 1 + (contact - start + 2) * i / n;
      const value = landingEffectsAt(t)[key];
      assert(Number.isFinite(value) && value >= 0 && value <= 1);
      worst = Math.max(worst, Math.abs(value - previous));
      previous = value;
    }
    return worst;
  };
  assert(maxStep(40000) / maxStep(20000) < 0.52, `${key} must have continuous cutoffs`);
}

const times = [start + 2, start + 350, contact - 45, contact - 1];
const forward = times.map(landingEffectsAt);
const backward = [...times].reverse().map(landingEffectsAt).reverse();
assert.deepEqual(forward, backward, "reverse scroll reproduces the same effects");

// On a fixed touchdown pose, the whole camera rig must settle and then hold.
// Checking the placed camera catches orbit drift as well as lens/framing drift.
const pose = {
  origin: [384400 + 1737.4 + 0.316, 0, 0],
  axis: [0, 1, 0],
  moonCenter: [384400, 0, 0],
  kmPerVehicleMetre: 10 / 110.6,
  altitudeKm: 0.316,
};
for (const aspect of [16 / 9, 4 / 3]) {
  const shot = (u) => lunarCameraWorld(u, aspect, pose);
  const contactShot = shot(0.94);
  for (const u of [0.945, 0.975, 1]) {
    assert.deepEqual(shot(u), contactShot, `camera holds after contact at ${aspect}`);
  }
  const distanceToRest = (h) => Math.hypot(...shot(0.94 - h).position
    .map((v, i) => v - contactShot.position[i]));
  assert(distanceToRest(0.0005) / distanceToRest(0.001) < 0.3,
    "camera arrives at contact with zero speed, rather than an abrupt stop");
}
console.log("Landing checks: effect boundaries, continuity, reverse scrubbing and settled camera hold passed.");
