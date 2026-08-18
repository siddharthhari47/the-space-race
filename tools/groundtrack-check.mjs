// Ground track model vs published values, plus the self-proving cases.
//
// The interesting assertions here are the ones the model has no way to fake:
// a geostationary orbit must collapse to a stationary point, and the highest
// latitude any track reaches must equal the inclination exactly. Neither is
// coded for — both fall out of the spherical trigonometry.
//
// Run: node tools/groundtrack-check.mjs

import {
  groundTrack, period, speed, westShift, footprintRadius, horizonAngle,
  sunSyncInclination, R_EARTH, SIDEREAL_DAY,
} from "../public/assets/js/systems/groundtrack.js";

let failures = 0;
function check(label, value, lo, hi, unit = "") {
  const ok = value >= lo && value <= hi;
  if (!ok) failures++;
  console.log(
    `${ok ? "ok  " : "FAIL"}  ${label.padEnd(34)} ${value.toFixed(3).padStart(11)} ${unit.padEnd(7)} expected ${lo}-${hi}`
  );
}

console.log("=== Published comparisons ===");
check("ISS period", period(408) / 60, 92, 93.5, "min");
check("ISS speed", speed(408), 7.6, 7.72, "km/s");
check("ISS westward shift / orbit", westShift(408), 22, 24, "deg");
check("ISS horizon half-angle", horizonAngle(408) * (180 / Math.PI), 19, 21, "deg");
check("ISS footprint radius", footprintRadius(408), 2100, 2300, "km");
check("sun-sync inclination @ 700 km", sunSyncInclination(700), 98.0, 98.4, "deg");
check("sun-sync inclination @ 800 km", sunSyncInclination(800), 98.4, 98.8, "deg");
check("GEO period", period(35786) / 60, 1435, 1437, "min");

console.log("\n=== Self-proving cases ===");

// Geostationary: zero inclination at the altitude whose period is a sidereal
// day must not move at all. Nothing in the code special-cases this.
const geo = groundTrack({ altKm: 35786, incDeg: 0, orbits: 3, samples: 400 });
const lonSpread = Math.max(...geo.map((p) => p.lon)) - Math.min(...geo.map((p) => p.lon));
const latSpread = Math.max(...geo.map((p) => Math.abs(p.lat)));
check("GEO longitude drift over 3 days", lonSpread, 0, 0.05, "deg");
check("GEO latitude excursion", latSpread, 0, 0.001, "deg");

// Maximum latitude must equal inclination, for prograde and retrograde alike.
for (const inc of [0, 28.5, 51.6, 90, 98.2]) {
  const track = groundTrack({ altKm: 500, incDeg: inc, orbits: 2, samples: 1200 });
  const maxLat = Math.max(...track.map((p) => Math.abs(p.lat)));
  const expected = inc <= 90 ? inc : 180 - inc;
  check(`max latitude at i=${inc}`, maxLat, expected - 0.3, expected + 0.3, "deg");
}

// Every sample must be a real coordinate on the planet.
const iss = groundTrack({ altKm: 408, incDeg: 51.6, orbits: 4, samples: 900 });
const bad = iss.filter(
  (p) => !isFinite(p.lat) || !isFinite(p.lon) || Math.abs(p.lat) > 90.001 || Math.abs(p.lon) > 180.001
);
console.log(bad.length === 0 ? "ok    all samples are valid coordinates" : `FAIL  ${bad.length} invalid samples`);
if (bad.length) failures++;

// A retrograde orbit must drift the opposite way in the inertial part of the
// longitude term relative to a prograde one at the same altitude.
const pro = groundTrack({ altKm: 700, incDeg: 45, orbits: 1, samples: 200 });
const retro = groundTrack({ altKm: 700, incDeg: 135, orbits: 1, samples: 200 });
const proEast = pro[50].lon - pro[0].lon;
const retroEast = retro[50].lon - retro[0].lon;
console.log(
  `\nquarter-orbit longitude change: prograde ${proEast.toFixed(1)} deg, retrograde ${retroEast.toFixed(1)} deg`
);
if (Math.sign(proEast) === Math.sign(retroEast)) {
  console.log("FAIL  prograde and retrograde drift the same way");
  failures++;
} else {
  console.log("ok    prograde and retrograde travel opposite ways, as they must");
}

console.log("\n=== Reference table ===");
console.log("orbit        alt(km)  period(min)  v(km/s)  west/orbit  footprint(km)");
for (const [n, alt, inc] of [["ISS", 408, 51.6], ["Sun-sync", 700, 98.2], ["GPS", 20180, 55], ["GEO", 35786, 0]]) {
  console.log(
    `${n.padEnd(12)} ${String(alt).padStart(6)}  ${(period(alt) / 60).toFixed(1).padStart(10)}  ` +
      `${speed(alt).toFixed(2).padStart(7)}  ${westShift(alt).toFixed(1).padStart(10)}  ${footprintRadius(alt).toFixed(0).padStart(12)}`
  );
  void inc;
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} checks failed.`);
process.exit(failures === 0 ? 0 : 1);
