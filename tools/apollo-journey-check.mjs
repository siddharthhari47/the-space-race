import assert from 'node:assert/strict';
import * as THREE from 'three';
import { journeyCameraWorld, journeyWeightAt } from '../src/apollo/journey.js';
import { moonAt, LAUNCH_EPOCH_MS, latLonToUnitVector } from '../src/apollo/mission.js';
import { EARTH_RADIUS_KM } from '../src/apollo/earth.js';
import { flightAt, getSecondsAt, surfaceBasis, vehicleFrame, headingAt } from '../src/apollo/flight.js';
import { coastFrame, TLI_P, TRANSFER } from '../src/apollo/translunar.js';

const basis = surfaceBasis(28.608422, -80.604133);
const heading = headingAt(28.608422, -80.604133, 72);
const departure = vehicleFrame(basis.up, heading, flightAt(TLI_P), EARTH_RADIUS_KM);
const v = a => new THREE.Vector3(...a);
const tourFrom = 0.487416, tourTo = 0.699082;
function sample(p, aspect) {
  const flight = flightAt(p);
  const moon = moonAt(LAUNCH_EPOCH_MS + getSecondsAt(p) * 1000);
  const d = latLonToUnitVector(moon.latDeg, moon.lonDeg);
  const moonDir = [d.x, d.y, d.z];
  const frame = p <= TLI_P ? vehicleFrame(basis.up, heading, flight, EARTH_RADIUS_KM)
    : coastFrame(p, { departUp: departure.up, departFwd: departure.forward, moonDir,
      handoverKm: Math.hypot(...departure.position) - TRANSFER.perigeeKm });
  const tourU = Math.min(1, (p - tourFrom) / (tourTo - tourFrom));
  assert.equal(journeyWeightAt(tourU), 1, 'camera must never release the ship after the tour');
  const shot = journeyCameraWorld({ progress: p, tourU, lunarU: 0, tourFrom, tourTo }, aspect, {
    origin: frame.position, axis: frame.axis, trackAxis: frame.forward, earthCenter: [0, 0, 0],
    moonCenter: moonDir.map(x => x * moon.distanceKm), missionP: p,
    kmPerVehicleMetre: flight.kmPerVehicleMetre, altitudeKm: Infinity,
  });
  const camera = new THREE.PerspectiveCamera(shot.fovDeg, aspect, 0.001, 1e7);
  camera.position.fromArray(shot.position);
  camera.up.fromArray(shot.up);
  camera.lookAt(v(shot.target));
  camera.rotateZ(shot.rollDeg * Math.PI / 180);
  camera.setViewOffset(aspect * 1000, 1000, -shot.shiftX * aspect * 500, shot.shiftY * 500, aspect * 1000, 1000);
  camera.updateMatrixWorld();
  // The actual upper spacecraft, independently of the authored camera target.
  const ship = v(frame.position).addScaledVector(v(frame.axis), 98 * flight.kmPerVehicleMetre);
  const projected = ship.clone().project(camera);
  assert(Math.abs(projected.x) < 0.95 && Math.abs(projected.y) < 0.95 && projected.z < 1,
    `spacecraft left the frame at p=${p}: ${projected.toArray()}`);
  return { camera, frame, range: camera.position.distanceTo(ship) / flight.kmPerVehicleMetre };
}
let worstAngle = 0;
for (const aspect of [16 / 9, 4 / 3, 1146 / 958]) {
  let previous;
  for (let i = 0; i <= 4000; i++) {
    const current = sample(0.667 + i * (1.06 - 0.667) / 4000, aspect);
    assert(current.range < 180, 'camera must remain beside the ship, not retreat toward Earth');
    if (previous) {
      const angle = current.camera.quaternion.angleTo(previous.camera.quaternion);
      worstAngle = Math.max(worstAngle, angle);
      assert(angle < 0.015, `camera jerks between adjacent scroll samples: ${angle}`);
      assert(Math.abs(Math.log(current.range / previous.range)) < 0.02, 'camera range must change gradually');
    }
    previous = current;
  }
  const before = sample(TLI_P - 1e-8, aspect), after = sample(TLI_P + 1e-8, aspect);
  assert(before.camera.quaternion.angleTo(after.camera.quaternion) < 1e-5, 'TLI must not snap camera heading');
}
console.log(`Journey checks passed: continuous spacecraft framing through tour exit and coast; maximum adjacent turn ${(worstAngle * 180 / Math.PI).toFixed(3)} degrees.`);
