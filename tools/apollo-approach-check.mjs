// Regression checks for the visible coast/orbit jump and the late Moon reveal.
// Rendered composition still needs a browser pass; these check continuity and
// framing independently of scroll event timing or the WebGL renderer.
import assert from "node:assert/strict";
import * as THREE from "three";
import { lunarCameraWorld, lunarMissionP, followPosition, followTarget } from "../src/apollo/lunar.js";
import { moonAt, LAUNCH_EPOCH_MS, latLonToUnitVector, MOON_RADIUS_KM } from "../src/apollo/mission.js";
import { EARTH_RADIUS_KM } from "../src/apollo/earth.js";
import { flightAt, getSecondsAt, surfaceBasis, vehicleFrame, headingAt } from "../src/apollo/flight.js";
import { coastFrame, lunarFrame, TLI_P, LOI_P, TRANSFER } from "../src/apollo/translunar.js";

const vector = a => new THREE.Vector3(...a);
const basis = surfaceBasis(28.608422, -80.604133);
const departure = vehicleFrame(basis.up, headingAt(28.608422, -80.604133, 72), flightAt(TLI_P), EARTH_RADIUS_KM);

function sample(u, aspect = 16 / 9) {
  const p = lunarMissionP(u, 1.057);
  const moon = moonAt(LAUNCH_EPOCH_MS + getSecondsAt(p) * 1000);
  const d = latLonToUnitVector(moon.latDeg, moon.lonDeg);
  const moonDir = [d.x, d.y, d.z];
  const moonCenter = moonDir.map(v => v * moon.distanceKm);
  const frame = p > LOI_P
    ? lunarFrame(p, { moonCentre: moonCenter, moonDir, north: [0, 1, 0] })
    : coastFrame(p, {
      departUp: departure.up, departFwd: departure.forward, moonDir,
      handoverKm: Math.hypot(...departure.position) - TRANSFER.perigeeKm,
    });
  const shot = lunarCameraWorld(u, aspect, {
    origin: frame.position, axis: frame.forward, moonCenter,
    kmPerVehicleMetre: flightAt(p).kmPerVehicleMetre,
    altitudeKm: frame.lunar?.altitudeKm ?? Infinity, missionP: p,
  });
  const camera = new THREE.PerspectiveCamera(shot.fovDeg, aspect, 0.001, 1e7);
  camera.position.fromArray(shot.position);
  camera.up.fromArray(shot.up);
  camera.lookAt(vector(shot.target));
  camera.rotateZ(shot.rollDeg * Math.PI / 180);
  camera.setViewOffset(aspect * 1000, 1000, -shot.shiftX * aspect * 500, shot.shiftY * 500, aspect * 1000, 1000);
  camera.updateMatrixWorld();
  return { p, frame, shot, camera, moonCenter };
}

// Previously, latitude projection at LOI teleported the ship by ~70 km and
// changed its heading by ~34 degrees. Tiny scroll deltas must stay tiny.
for (const aspect of [16 / 9, 4 / 3]) {
  const before = sample(0.3 - 1e-8, aspect), after = sample(0.3 + 1e-8, aspect);
  assert(vector(before.frame.position).distanceTo(vector(after.frame.position)) < 0.002,
    "coast and orbit must join within two metres at an infinitesimal scroll step");
  assert(vector(before.frame.axis).angleTo(vector(after.frame.axis)) < 1e-5,
    "ship heading must not snap at orbit insertion");
  assert(before.camera.quaternion.angleTo(after.camera.quaternion) < 1e-5,
    "camera must not snap at orbit insertion");

  let previous = null;
  for (let i = 0; i <= 1200; i++) {
    const s = sample(0.3 * i / 1200, aspect);
    const angularRadius = Math.asin(MOON_RADIUS_KM / s.camera.position.distanceTo(vector(s.moonCenter)));
    if (previous) {
      assert(s.p >= previous.p, "forward scroll must advance mission time");
      assert(angularRadius >= previous.angularRadius, "the approaching Moon must grow continuously");
      assert(angularRadius / previous.angularRadius < 1.01,
        `no final rush in the Moon's apparent size at u=${0.3 * i / 1200}: ${angularRadius / previous.angularRadius}`);
    }
    const framed = vector(s.shot.target).project(s.camera);
    assert(Math.abs(framed.x) < 0.75 && Math.abs(framed.y) < 0.75 && framed.z < 1,
      "the ship must stay inside the frame throughout the reveal");
    previous = { p: s.p, angularRadius };
  }
}

// Five orders of magnitude of closing distance must not leave the aim point
// behind at the Earth once the camera has arrived beside the spacecraft.
const subject = [380000, 0, 0], start = [0, 0, 10000], end = [380000, 0, 10];
const initialAim = [0, 0, 0];
assert.deepEqual(followPosition(start, end, subject, 0), start);
assert.deepEqual(followPosition(start, end, subject, 1), end);
assert.deepEqual(followTarget(initialAim, subject, start, start, 0), initialAim);
assert.deepEqual(followTarget(initialAim, subject, start, end, 1), subject);
for (const w of [0.4, 0.5, 0.7, 0.9, 0.99]) {
  const position = followPosition(start, end, subject, w);
  const target = followTarget(initialAim, subject, start, position, w);
  const shipRay = vector(subject).sub(vector(position));
  const aimRay = vector(target).sub(vector(position));
  assert(shipRay.angleTo(aimRay) < 10 * Math.PI / 180,
    "ship must be acquired during handover, not only on the final frame");
}

console.log("Approach checks: orbit seam, continuous Moon growth, ship framing and camera handover passed.");
