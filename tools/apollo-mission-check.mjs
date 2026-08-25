// The Apollo mission model, checked against things that are true whether or
// not this code exists.
//
// The visual layer cannot be verified headlessly — a WebGL Earth either
// looks right or it doesn't, and no assertion tells you which. So the parts
// that *can* be reduced to arithmetic are kept in a module with no DOM and
// no three.js, and this file is what holds them to account.
//
// The solar model is the interesting case. Its job is to put the Sun where
// it actually was at 13:32 UTC on 16 July 1969, and the way to know it does
// that is not to compare it against the number this code produced last
// week. It is to check it against facts with outside sources: the Sun is
// overhead at the tropics at the solstices, it crosses the equator at the
// equinoxes, and at noon UTC on any day of the year it stands within a few
// degrees of the Greenwich meridian, because that is what noon UTC means.
//
// Run: node tools/apollo-mission-check.mjs

import { readFileSync } from "node:fs";

import {
  LC39A,
  LAUNCH_EPOCH_MS,
  PHASES,
  latLonToUnitVector,
  phaseAt,
  smootherstep,
  subSolarPoint,
  sunElevationDeg,
} from "../src/apollo/mission.js";
import { SHOTS, shotAt, shotToCamera } from "../src/apollo/shots.js";
import { envelopeAt, ENVELOPE } from "../src/apollo/launchsite.js";
import { discOnScreen } from "./apollo-framing.mjs";

// scene.js cannot be imported here: it pulls in three.js, which wants a
// document. The one number in it worth asserting on is read from the source
// instead. That is a weaker kind of check and it is still worth having --
// the rotation rate is published as fact on the References page, and the
// failure it guards against is the code and that page drifting apart.
const SCENE_SRC = readFileSync(new URL("../src/apollo/scene.js", import.meta.url), "utf8");

const TAU = Math.PI * 2;

let failures = 0;

function check(label, value, lo, hi, unit = "") {
  const ok = Number.isFinite(value) && value >= lo && value <= hi;
  if (!ok) failures++;
  console.log(
    `${ok ? "ok  " : "FAIL"}  ${label.padEnd(46)} ${value.toFixed(3).padStart(10)} ${unit.padEnd(5)} expected ${lo} to ${hi}`
  );
}

function assert(label, condition, detail = "") {
  if (!condition) failures++;
  console.log(`${condition ? "ok  " : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
}

/* ---------- The Sun goes where the calendar says ---------- */

console.log("\nSOLAR MODEL — declination against the seasons\n");

// Solstices and equinoxes for 2024, to the hour. The obliquity of the
// ecliptic is 23.44 degrees, so the Sun's declination must reach very
// nearly that at the solstices and pass through zero at the equinoxes.
check("June solstice declination", subSolarPoint(Date.UTC(2024, 5, 20, 20, 51)).latDeg, 23.35, 23.45, "deg");
check("December solstice declination", subSolarPoint(Date.UTC(2024, 11, 21, 9, 20)).latDeg, -23.45, -23.35, "deg");
check("March equinox declination", subSolarPoint(Date.UTC(2024, 2, 20, 3, 6)).latDeg, -0.15, 0.15, "deg");
check("September equinox declination", subSolarPoint(Date.UTC(2024, 8, 22, 12, 44)).latDeg, -0.15, 0.15, "deg");

console.log("\nSOLAR MODEL — noon UTC puts the Sun over Greenwich\n");

// This is the check that actually exercises the sidereal-time machinery. At
// 12:00 UTC the Sun is on the Greenwich meridian give or take the equation
// of time, which never exceeds about 16 minutes — a touch over 4 degrees.
for (const [label, ms] of [
  ["1969-07-16 12:00 UTC", Date.UTC(1969, 6, 16, 12, 0)],
  ["2000-01-01 12:00 UTC", Date.UTC(2000, 0, 1, 12, 0)],
  ["2024-02-11 12:00 UTC", Date.UTC(2024, 1, 11, 12, 0)],
  ["2024-11-03 12:00 UTC", Date.UTC(2024, 10, 3, 12, 0)],
]) {
  check(`sub-solar longitude, ${label}`, subSolarPoint(ms).lonDeg, -4.2, 4.2, "deg");
}

/* ---------- The Sun over Florida, 16 July 1969 ---------- */

console.log("\nAPOLLO 11 LAUNCH — 1969-07-16 13:32:00 UTC\n");

const sun = subSolarPoint(LAUNCH_EPOCH_MS);
// Mid-July is about three and a half weeks past the June solstice, so the
// declination has fallen a couple of degrees off its 23.44 maximum.
check("sub-solar latitude", sun.latDeg, 20.8, 21.8, "deg");
// 13:32 UTC is an hour and a half past noon UTC, so the sub-solar point has
// moved about 22 degrees west of Greenwich.
check("sub-solar longitude", sun.lonDeg, -24.5, -19.5, "deg");

const elevation = sunElevationDeg(LAUNCH_EPOCH_MS, LC39A.latDeg, LC39A.lonDeg);
// Launch was 09:32 EDT, roughly four hours before local solar noon, at a
// latitude where the mid-July noon Sun reaches about 83 degrees. A morning
// Sun a third of the way up the sky is what the launch photography shows,
// and the one thing this must not produce is a night-time launch site.
check("Sun elevation at LC-39A", elevation, 30, 43, "deg");
assert("launch site is in daylight", elevation > 0, `elevation ${elevation.toFixed(1)} deg`);

// Local solar time at the pad, recovered from the hour angle. Should land
// near 08:00 — EDT ran an hour ahead of the 75 deg W standard meridian,
// which in turn ran ahead of LC-39A's own meridian at 80.6 deg W.
const hourAngle = LC39A.lonDeg - sun.lonDeg;
const solarTime = 12 + hourAngle / 15;
check("local solar time at the pad", solarTime, 7.6, 8.5, "h");

/* ---------- Surface geometry ---------- */

console.log("\nSURFACE GEOMETRY\n");

const mag = (v) => Math.hypot(v.x, v.y, v.z);
const ksc = latLonToUnitVector(LC39A.latDeg, LC39A.lonDeg);

check("|LC-39A surface vector|", mag(ksc), 0.9999, 1.0001);
// Florida is north of the equator and in the western hemisphere, which in
// this frame means +Y and +Z. Getting the longitude sign backwards would
// put the pad in the Indian Ocean and this is what catches it.
assert("LC-39A is in the northern hemisphere", ksc.y > 0, `y = ${ksc.y.toFixed(4)}`);
assert("LC-39A is in the western hemisphere", ksc.z > 0, `z = ${ksc.z.toFixed(4)}`);

const origin = latLonToUnitVector(0, 0);
check("0N 0E lies on +X", origin.x, 0.9999, 1.0001);
const west90 = latLonToUnitVector(0, -90);
check("0N 90W lies on +Z", west90.z, 0.9999, 1.0001);
const northPole = latLonToUnitVector(90, 0);
check("north pole lies on +Y", northPole.y, 0.9999, 1.0001);

/* ---------- The timeline is contiguous ---------- */

console.log("\nTIMELINE\n");

assert("timeline starts at 0", PHASES[0].from === 0, `${PHASES[0].from}`);
assert("timeline covers past 1", PHASES[PHASES.length - 1].to >= 1, `${PHASES[PHASES.length - 1].to}`);

let contiguous = true;
for (let i = 1; i < PHASES.length; i++) {
  if (PHASES[i].from !== PHASES[i - 1].to) {
    contiguous = false;
    console.log(`      gap between ${PHASES[i - 1].key} and ${PHASES[i].key}`);
  }
}
assert("no gaps or overlaps between phases", contiguous);

// Every progress value must resolve to exactly one phase, including the
// ends. A scroll container that reports 1.0 at the bottom is normal, and
// a lookup that returns undefined there would take the whole scene down.
let allResolve = true;
for (let i = 0; i <= 1000; i++) {
  if (!phaseAt(i / 1000)) allResolve = false;
}
assert("every progress value resolves to a phase", allResolve);
assert("progress 0 is pre-launch", phaseAt(0).key === "prelaunch", phaseAt(0).key);
assert("progress 1 is the lunar approach", phaseAt(1).key === "lunar", phaseAt(1).key);

/* ---------- Easing ---------- */

console.log("\nEASING\n");

check("smootherstep at the start", smootherstep(0, 1, 0), -1e-9, 1e-9);
check("smootherstep at the end", smootherstep(0, 1, 1), 1 - 1e-9, 1 + 1e-9);
check("smootherstep at the midpoint", smootherstep(0, 1, 0.5), 0.4999, 0.5001);
assert("smootherstep clamps below its range", smootherstep(0, 1, -5) === 0);
assert("smootherstep clamps above its range", smootherstep(0, 1, 5) === 1);

// Monotonic, and never leaves [0,1]. A camera easing that overshoots would
// send the camera through the planet.
let monotonic = true;
let inRange = true;
let prev = -1;
for (let i = 0; i <= 500; i++) {
  const v = smootherstep(0, 1, i / 500);
  if (v < prev - 1e-12) monotonic = false;
  if (v < 0 || v > 1) inRange = false;
  prev = v;
}
assert("smootherstep is monotonic", monotonic);
assert("smootherstep never leaves [0,1]", inRange);

console.log("\nROTATION\n");

// There used to be two sections here, one checking that angles were reduced
// into the shortest way round and one checking that the ground lock only
// ever tightened. Both are gone with the lock itself -- see the note in
// shots.js. What replaces them is the property the lock was in the way of:
// the planet turns at one steady rate, in one direction, for the whole
// page, and nothing in the camera path is allowed to cancel it.

const spinMatch = SCENE_SRC.match(/EARTH_SPIN_DEG_PER_SEC = ([0-9.]+);/);
assert("scene.js still declares a rotation rate", Boolean(spinMatch));
check("the planet turns at the rate the References page states", Number(spinMatch[1]), 0.4499, 0.4501, "deg/s");
assert("nothing cancels it -- no camera spin left in scene.js", !/cameraSpin|groundLock/.test(SCENE_SRC));

// The camera rig is a pure function of scroll position now, with no term
// that depends on the clock. That is what guarantees the rotation cannot be
// cancelled: there is nothing in the rig for it to be cancelled against.
let rigIsStatic = true;
for (let i = 0; i <= 200; i++) {
  const a = shotToCamera(shotAt(i / 200));
  const b = shotToCamera(shotAt(i / 200));
  for (const k of ["position", "forward", "up", "target"]) {
    for (let c = 0; c < 3; c++) if (a[k][c] !== b[k][c]) rigIsStatic = false;
  }
}
assert("the camera rig depends on scroll alone", rigIsStatic);

const IGNITION = PHASES.find((ph) => ph.key === "ignition");

console.log("\nLAUNCH GLOW\n");

// Section 9 of the brief is emphatic that nothing about the launch's light
// may switch on or off, so the envelope is checked for continuity rather
// than only for its values.

check("the pad is visible before anything happens", envelopeAt(0), 0.05, 0.4);
check("it is brighter once ignition starts", envelopeAt(IGNITION.from), 0.35, 0.7);
check("full brightness at liftoff", envelopeAt(0.115), 1 - 1e-9, 1 + 1e-9);
check("mostly gone by mid-ascent", envelopeAt(0.22), 0.0, 0.2);
check("gone once the vehicle is away", envelopeAt(0.32), -1e-12, 1e-12);
check("still gone at the Moon", envelopeAt(1), -1e-12, 1e-12);

assert(
  "ignition is brighter than the pre-launch pad",
  envelopeAt(IGNITION.from) > envelopeAt(0) + 0.1
);

// Every knot is hit exactly. A curve that misses its own control points is
// not the curve that was authored.
let knotsExact = true;
for (const k of ENVELOPE) {
  if (Math.abs(envelopeAt(k.p) - k.v) > 1e-9) knotsExact = false;
}
assert("the envelope passes through every knot", knotsExact);

// No step anywhere. At this sample spacing the steepest legitimate part of
// the curve moves about 0.017 per sample, so anything past 0.05 is a jump
// rather than a ramp.
let biggestStep = 0;
let envInRange = true;
let envPrev = envelopeAt(0);
for (let i = 1; i <= 2000; i++) {
  const v = envelopeAt(i / 2000);
  biggestStep = Math.max(biggestStep, Math.abs(v - envPrev));
  if (v < 0 || v > 1) envInRange = false;
  envPrev = v;
}
check("largest single step in the envelope", biggestStep, 0, 0.05);
assert("the envelope stays within [0,1]", envInRange);

console.log("\nTHE RETREAT\n");

// The altitude column is scheduled so that d(log d)/dp -- the rate at which
// the planet's apparent size changes relative to its size, which is what the
// eye reads for something receding -- ramps in once and then holds. These
// check that property rather than the numbers, because the numbers are
// generated from the property and it is the property that is the point.

const R_KM = 6371;
const HOLD_END = 0.185;
const dist = (x) => shotAt(x).altitudeKm + R_KM;

// Every keyframe is reached exactly. A spline that misses its own control
// points is not the one that was authored.
let shotKnotsExact = true;
for (const k of SHOTS) {
  if (Math.abs(shotAt(k.p).altitudeKm - k.altitudeKm) / k.altitudeKm > 1e-6) shotKnotsExact = false;
}
assert("the camera passes through every authored altitude", shotKnotsExact);

// Never back towards the planet once the retreat has started. A dip is a
// spline overshoot, and on screen it is the Earth growing again mid-departure.
let everCloser = null;
let prevD = dist(HOLD_END);
for (let i = 0; i <= 4000; i++) {
  const x = HOLD_END + (1 - HOLD_END) * (i / 4000);
  const d = dist(x);
  if (d < prevD - 1e-6 && everCloser === null) everCloser = x;
  prevD = d;
}
assert("the camera never doubles back towards Earth", everCloser === null);

let altsSane = true;
for (let i = 0; i <= 2000; i++) {
  const a = shotAt(i / 2000).altitudeKm;
  if (!(a > 100 && a < 400000)) altsSane = false;
}
assert("the camera stays outside the Earth and inside the far plane", altsSane);

// The rate itself. This is the check that would have caught the schedule
// this one replaced, whose rate doubled at one keyframe and reversed at the
// next, and the two attempts after it that were worse.
const RATE_AT = (x) => {
  const e = 0.001;
  const a = Math.max(0, x - e);
  const b = Math.min(1, x + e);
  return Math.log(dist(b) / dist(a)) / (b - a);
};
let peakRate = 0;
for (let i = 0; i <= 1000; i++) peakRate = Math.max(peakRate, Math.abs(RATE_AT(i / 1000)));

let worstJump = 0;
let worstAt = 0;
for (let i = 1; i <= 1000; i++) {
  const j = Math.abs(RATE_AT(i / 1000) - RATE_AT((i - 1) / 1000)) / peakRate;
  if (j > worstJump) {
    worstJump = j;
    worstAt = i / 1000;
  }
}
check("peak retreat rate", peakRate, 6, 12, "per unit p");
check("largest rate jump in a thousandth of the page, at p=" + worstAt.toFixed(3), worstJump, 0, 0.02);

// And it has to be a ramp, not a plateau with a step in it: once the rate is
// up, it stays up.
let rateFalls = null;
let prevRate = Math.abs(RATE_AT(0.3));
for (let i = 0; i <= 700; i++) {
  const x = 0.3 + 0.7 * (i / 700);
  const r = Math.abs(RATE_AT(x));
  if (r < prevRate - 0.05 && rateFalls === null) rateFalls = x;
  prevRate = r;
}
assert("the retreat never changes gear downwards", rateFalls === null);

// Framing bounds, so a later edit cannot quietly point the camera at nothing
// or open the lens past what the composition survives. The lens shift now
// runs to about half a frame, because that is what carries the planet out of
// shot; the ceiling is set above that and no higher.
let framingSane = true;
for (let i = 0; i <= 2000; i++) {
  const sh = shotAt(i / 2000);
  if (!(sh.aim >= 0 && sh.aim <= 1.25)) framingSane = false;
  if (!(sh.fovDeg >= 25 && sh.fovDeg <= 45)) framingSane = false;
  if (!(Math.abs(sh.offsetX) <= 0.4 && Math.abs(sh.offsetY) <= 0.65)) framingSane = false;
}
assert("aim, field of view and lens shift stay inside their bounds", framingSane);

// The lens shift is what makes the planet leave rather than shrink in place,
// and its whole value depends on going one way. A shift that creeps back the
// other way is a slow sideways slide that changes direction partway down the
// page, which is exactly the complaint this was built to answer.
//
// Two checks, because there are two different claims. The authored numbers
// are required to be monotone exactly: that is the rule for editing the
// table and there is no reason to break it. The interpolated curve is not,
// and cannot be -- a cubic through a flat run followed by a ramp undershoots
// slightly before it climbs, which is a property of Hermite interpolation
// and not of these values. So that one is held to a threshold of visibility
// rather than to zero, and the measured figure is printed, so an edit that
// turns a rounding artefact into a slide fails here.
let knotsMonotonic = true;
for (let i = 1; i < SHOTS.length; i++) {
  if (SHOTS[i].offsetX < SHOTS[i - 1].offsetX) knotsMonotonic = false;
  if (SHOTS[i].offsetY < SHOTS[i - 1].offsetY) knotsMonotonic = false;
}
assert("every authored lens shift is at or beyond the one before it", knotsMonotonic);

let worstDip = 0;
let maxX = -Infinity;
let maxY = -Infinity;
for (let i = 0; i <= 20000; i++) {
  const sh = shotAt(i / 20000);
  maxX = Math.max(maxX, sh.offsetX);
  maxY = Math.max(maxY, sh.offsetY);
  worstDip = Math.max(worstDip, 2 * (maxX - sh.offsetX), 2 * (maxY - sh.offsetY));
}
check("worst backward slide the interpolation adds", worstDip, 0, 0.02, "of a half-frame");

// The planet has to be gone by the bottom of the page, and it has to still
// be there most of the way down. Measured properly rather than from the
// angular radius alone: the disc is off-axis, so where its top edge lands
// depends on where the camera is pointing as well as how big it looks, and
// the difference between those two answers at the bottom of the page is the
// difference between gone and not.
let lastVisible = 0;
for (let i = 0; i <= 400; i++) {
  const x = i / 400;
  if (discOnScreen(shotAt(x)).coverage > 0) lastVisible = x;
}
check("the planet leaves the frame, and not before", lastVisible, 0.85, 0.96, "of the page");

console.log(`\n${failures === 0 ? "All checks passed." : `${failures} CHECK(S) FAILED.`}\n`);
process.exit(failures === 0 ? 0 : 1);
