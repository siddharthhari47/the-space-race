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

import * as THREE from "three";

import { createMoon } from "../src/apollo/moon.js";

import {
  LC39A,
  LAUNCH_EPOCH_MS,
  LUNAR_NORTH,
  MOON_RADIUS_KM,
  PHASES,
  latLonToUnitVector,
  moonAt,
  phaseAt,
  smootherstep,
  subSolarPoint,
  sunElevationDeg,
} from "../src/apollo/mission.js";
import { SHOTS, shotAt, shotToCamera } from "../src/apollo/shots.js";
import {
  LANDER_TIMES,
  LAST_U,
  LAUNCH_AZIMUTH_DEG,
  at,
  flightAt,
  getSecondsAt,
  headingAt,
  landerUpright,
  pAtSeconds,
  surfaceBasis,
  vehicleFrame,
} from "../src/apollo/flight.js";
import {
  LANDER_HALF_KM,
  LUNAR_ORBIT_RADIUS_KM,
  lunarFrame,
  lunarRadiusAt,
} from "../src/apollo/translunar.js";
import { lunarCameraWorld, lunarMissionP } from "../src/apollo/lunar.js";
import {
  envelopeAt,
  ENVELOPE,
  FLASH,
  flashAt,
  flashCoreRadiusKm,
  flashRadiusKm,
} from "../src/apollo/launchsite.js";
import { callAt, countdownAt, formatGET } from "../src/apollo/countdown.js";
import {
  TOUR_SHOTS,
  tourCameraAt,
  tourCameraWorld,
  tourDistanceM,
  tourWeightAt,
} from "../src/apollo/tour.js";
import { cameraBasis, discOnScreen, project } from "./apollo-framing.mjs";

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

/* ---------- The ignition flash ----------

   The flash is the answer to "the rocket appears out of nowhere": it gives
   the arrival a cause and puts the eye on the pad before there is anything
   there to see. These check that it is genuinely an event and not just a
   brighter pad -- that it is absent when the page opens, enormous across
   ignition, and gone again before it could sit on top of the vehicle it was
   supposed to introduce. */

check("no flash when the page opens", flashAt(0), -1e-12, 1e-12);
check("still nothing at the last quiet knot", flashAt(0.06), -1e-12, 1e-12);
check("peak flash at p=0.092", flashAt(0.092), 1 - 1e-9, 1 + 1e-9);
check("still most of it at liftoff", flashAt(0.115), 0.6, 0.95);
check("gone before the ascent proper", flashAt(0.2), -1e-12, 1e-12);
check("still gone at the Moon", flashAt(1), -1e-12, 1e-12);

// It has to outshine the pad glow it sits on top of, or it is not an
// event, it is a slightly warmer patch. Both are drawn additively into the
// same pixels, so this compares what each contributes there.
assert(
  "the flash is the brightest thing at the pad when it fires",
  flashAt(0.092) > envelopeAt(0.092) + 0.1
);

// Peak brightness must come before peak size. The read is a hard white
// core that then spreads and cools; if the largest instant were also the
// brightest, it would read as a fog bank switching on.
assert(
  "the flash peaks in brightness well before it peaks in size",
  flashRadiusKm(0.092) < 0.55 * flashRadiusKm(FLASH[5].p)
);

// The radius only ever grows, for the same reason the drawn stack height
// only ever grows: a light that swelled and then contracted would read as
// the camera moving rather than as something happening on the ground.
{
  let worstDrop = 0;
  let flashStep = 0;
  let flashPrev = flashAt(0);
  let radiusPrev = flashRadiusKm(0);
  for (let i = 1; i <= 2000; i++) {
    const x = i / 2000;
    const v = flashAt(x);
    const r = flashRadiusKm(x);
    flashStep = Math.max(flashStep, Math.abs(v - flashPrev));
    worstDrop = Math.min(worstDrop, r - radiusPrev);
    flashPrev = v;
    radiusPrev = r;
  }
  check("largest single step in the flash", flashStep, 0, 0.05);
  check("worst backward step in the flash radius", worstDrop, -1e-9, Infinity, "km");
}

assert(
  "the flash passes through every knot",
  FLASH.every((k) => Math.abs(flashAt(k.p) - k.v) < 1e-9)
);

/* The core is the half of the light drawn in DOM, above the page's
   readability wash, where nothing dims it -- so it is the half that can
   make a line of type unreadable, and these are the properties that keep
   it from doing so. See flare.js for the measurements behind them. */

check("the core is a point when the light peaks", flashCoreRadiusKm(0.092), 195, 205, "km");
check("the core has collapsed by tower clear", flashCoreRadiusKm(0.135), 30, 135, "km");
check("the core is gone once the ascent starts", flashCoreRadiusKm(0.2), 29.9, 30.1, "km");

assert(
  "the core never spreads wider than the halo it sits in",
  Array.from({ length: 401 }, (_, i) => i / 400).every(
    (p) => flashCoreRadiusKm(p) < flashRadiusKm(p)
  )
);

// The point of the rewrite: brightest and widest at the same instant, so
// the light never reaches its largest while it is on its way out.
{
  let peakP = 0;
  let widestP = 0;
  for (let i = 0; i <= 2000; i++) {
    const p = i / 2000;
    if (flashAt(p) > flashAt(peakP)) peakP = p;
    if (flashCoreRadiusKm(p) > flashCoreRadiusKm(widestP)) widestP = p;
  }
  check("the core is widest at the instant it is brightest", widestP - peakP, -1e-9, 1e-9);
}

{
  const step = (n) => {
    let worst = 0;
    for (let i = 0; i < n; i++) {
      const a = flashCoreRadiusKm(i / n);
      const b = flashCoreRadiusKm((i + 1) / n);
      worst = Math.max(worst, Math.abs(b - a));
    }
    return worst;
  };
  // 2000 samples, matching the flash's own step check above. The bound is
  // looser than the flash's because raising the curve to a power steepens
  // it -- which is the point of doing it. Six and a half kilometres of
  // radius per two-thousandth of the page is about two pixels per three
  // pixels of scroll, and the refinement test below is what actually
  // proves the signal is not jumping.
  check("largest single step in the core radius", step(2000), 0, 8, "km");
  assert("the core radius halves its step under refinement", step(800) < step(400) * 0.62);
}

console.log("\nTHE TOUR CAMERA\n");

/* tourCameraAt's own body frame -- x along the vehicle, camera at (camX,
   riseM, distance) looking at (camX + leadM, 0, 0) -- checked here on its
   own terms, independent of where scene.js ends up placing it in the
   world (that placement is tourCameraWorld, checked further down in THE
   CAMERA BLEND STAYS ABOVE THE PLANET). Nothing here is about how it
   looks -- that is a screenshot's job. These are the two things that can
   be wrong arithmetically and cannot be seen until somebody scrolls three
   screens to find them: whether the vehicle is actually in the frame, and
   whether each caption arrives beside the part it describes.

   The projection is done by hand rather than through three.js, because the
   point of a check is to be a second opinion. Camera at (camX, riseM,
   distance) looking at (camX + leadM, 0, 0) with up +Y, which is what
   THREE.Camera.lookAt builds. Roll is ignored: it never exceeds 1.6
   degrees, and including it would make this a re-implementation of the
   thing it is checking rather than a check on it. */

const STACK_M = 110.6;
const TOUR_ASPECT = 16 / 9;

// Shared with THE INTERLUDE section, further down: the geometry museum.css
// and scene.js's measureTour() agree on for turning a caption's position
// into the tour progress ("u") it belongs to. A caption whose CSS `top` is T
// vh down the section reaches LIT_AT of a viewport down the window -- the
// height a note sits at when it is fully lit -- at u = (T/100 - LIT_AT) /
// TRAVEL_VH; see the comment above .interlude in museum.css, which runs the
// same algebra by hand to justify the five `top` values it sets, and
// measureTour(), which runs it on the real DOM. Declared once here so both
// consumers read the same numbers rather than two copies that could drift.
const LIT_AT = 0.62; // where a note's top sits at its own moment
const TRAVEL_VH = 2; // the section is three viewports, two of travel

// Where a point on or around the vehicle lands in normalised device
// coordinates, or null if it is behind the camera. xM runs along the axis;
// yM and zM are the offset off it, which is how the silhouette of a
// ten-metre cylinder gets tested rather than the line down its middle.
function tourNdcAt(u, xM, yM = 0, zM = 0, aspect = TOUR_ASPECT) {
  const shot = tourCameraAt(u);
  const dist = tourDistanceM(shot.spanM, aspect, shot.fovDeg);

  const cam = [shot.camX, shot.riseM, dist];
  const aim = [shot.camX + shot.leadM, 0, 0];

  // three.js cameras look down their own -Z, so the basis is built from
  // the vector pointing back from the subject.
  const back = [cam[0] - aim[0], cam[1] - aim[1], cam[2] - aim[2]];
  const bl = Math.hypot(back[0], back[1], back[2]);
  const z = [back[0] / bl, back[1] / bl, back[2] / bl];

  // x = normalize(cross(up, z)) with up = +Y, which reduces to (z2, 0, -z0)
  const cx = [z[2], 0, -z[0]];
  const cl = Math.hypot(cx[0], cx[1], cx[2]);
  const x = [cx[0] / cl, cx[1] / cl, cx[2] / cl];

  // y = cross(z, x)
  const y = [
    z[1] * x[2] - z[2] * x[1],
    z[2] * x[0] - z[0] * x[2],
    z[0] * x[1] - z[1] * x[0],
  ];

  const v = [xM - cam[0], yM - cam[1], zM - cam[2]];
  const a = v[0] * x[0] + v[1] * x[1] + v[2] * x[2];
  const b = v[0] * y[0] + v[1] * y[1] + v[2] * y[2];
  const c = v[0] * z[0] + v[1] * z[1] + v[2] * z[2];

  const depth = -c;
  if (depth <= 0) return null;

  const halfV = Math.tan((shot.fovDeg * Math.PI) / 360);
  // shiftX and shiftY are a frustum offset, which is exactly a translation
  // in normalised device coordinates -- so on this side of the check they
  // are an addition rather than a second call to setViewOffset. That the two
  // routes agree is the thing worth checking, and the framing assertions
  // below are what check it.
  return {
    x: a / depth / (halfV * aspect) + shot.shiftX,
    y: b / depth / halfV + shot.shiftY,
    depth,
  };
}

const tourNdc = (u, xM, aspect = TOUR_ASPECT) => tourNdcAt(u, xM, 0, 0, aspect);

const inFrame = (n) => n !== null && Math.abs(n.x) <= 1 && Math.abs(n.y) <= 1;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// The shot the whole section exists for. The brief asked that the Saturn V
// "come across the screen full size", so at the wide knot both ends have to
// be inside the frame -- on a cinema-shaped window and on a squarer one,
// which is the reason the shot table is authored in metres-across-the-frame
// rather than in metres-from-the-camera.
for (const [name, aspect] of [
  ["16:9", 16 / 9],
  ["4:3", 4 / 3],
]) {
  const ends = [0, STACK_M].map((xM) => tourNdc(0.12, xM, aspect));
  assert(
    `the whole vehicle is in frame at the wide shot (${name})`,
    ends.every(inFrame),
    ends.map((n) => (n ? n.x.toFixed(3) : "behind")).join(" .. ")
  );
}

/* ...and fills it. A vehicle drawn across a third of the window is not
   "full size", it is a model on a shelf.

   This used to measure that at u=0.12 and want 0.86 of the frame there,
   which quietly encoded a close entry: the tour opened already on top of
   the vehicle. The approach is deliberately long now -- the shot opens at
   220 m of vehicle across the frame and takes until the first caption to
   close to 74 -- because scrolling quickly through a short approach read
   as a lurch. So the requirement splits in two. The vehicle is never a
   speck (it is well clear of the horizon-dot the brief warns against from
   the first frame of the tour), and it is full size by the time the page
   starts naming parts, which is what "full size" was there to protect. */
{
  const early = tourNdc(0.12, 0, TOUR_ASPECT);
  const earlyTip = tourNdc(0.12, STACK_M, TOUR_ASPECT);
  check(
    "how much of the frame the vehicle spans on approach",
    Math.abs(earlyTip.x - early.x) / 2,
    0.3,
    0.86
  );
  const near = tourNdc(0.38, 0, TOUR_ASPECT);
  const nearTip = tourNdc(0.38, STACK_M, TOUR_ASPECT);
  check(
    "how much of the frame width the vehicle spans by the first caption",
    Math.abs(nearTip.x - near.x) / 2,
    0.86,
    2.0
  );
}

// The camera is never blended toward a shot that has nothing in it. From
// the moment tourWeightAt lifts off zero to the moment it returns to zero,
// some part of the vehicle is in the tour frame.
{
  const probes = [0, 20, 40, 60, 80, 100, STACK_M];
  const blank = [];
  for (let i = 0; i <= 400; i++) {
    const u = i / 400;
    if (tourWeightAt(u) > 0.01 && !probes.some((xM) => inFrame(tourNdc(u, xM)))) blank.push(u);
  }
  assert(
    "the vehicle is in the tour frame whenever the camera blend is live",
    blank.length === 0,
    blank.length ? `first blank at u=${blank[0].toFixed(3)}` : ""
  );
}

// The camera stays outside the vehicle. The S-IC is 10.05 m across the
// fins, so a standoff under about six metres is a camera inside the first
// stage looking at the back of its own tank.
{
  let closest = Infinity;
  for (let i = 0; i <= 400; i++) {
    const shot = tourCameraAt(i / 400);
    closest = Math.min(
      closest,
      Math.hypot(shot.riseM, tourDistanceM(shot.spanM, TOUR_ASPECT, shot.fovDeg))
    );
  }
  check("closest the camera comes to the vehicle's axis", closest, 20, 200, "m");
}

/* Each caption against the part it names.

   The `top` values in museum.css are derived from these u values -- a note
   centred in the viewport sits at 200u + 50 - h/2 viewport heights down the
   section -- so if a knot moves here and the stylesheet does not, the page
   describes an engine bell while the camera is looking at a spacecraft.
   This is the assertion that catches that, and the extents are the ones
   measured off the model file rather than guessed. */
/* In the order the page reads them, which is the order the parts actually
   left the vehicle -- not the order they are stacked. The escape tower goes
   at GET 197, long before S-II cutoff, so it is read third and the camera
   has to come back down the stack for the S-II afterwards.

   The extents are framing extents, not part extents. Two of them are wider
   than the thing the caption names because tour.js clamps spanM at 50 m: a
   3 m interstage ring can never fill more than 6% of the frame, so what the
   shot actually frames is the region around it, and that region is what has
   to be in view. The captions say as much themselves -- "the black ring is
   the interstage", "a lattice above the command module". */
const CAPTIONS = [
  ["the F-1s", 0.38, 0, 42],
  ["the interstage region", 0.49, 37, 50],
  ["the escape tower over the CM", 0.64, 96, 110.6],
  ["the S-II", 0.75, 45, 69],
  ["the S-IVB", 0.85, 69, 92],
];

for (const [label, u, from, to] of CAPTIONS) {
  const n = tourNdc(u, (from + to) / 2);
  assert(
    `${label} are in frame when their caption is`,
    inFrame(n),
    n ? `ndc x ${n.x.toFixed(2)}, y ${n.y.toFixed(2)}` : "behind the camera"
  );
}

/* And the caption is legible, which is a different question and the one
   the first draft of this section got wrong.

   The failure it exists to catch is specific and was on screen: grey text
   at 0.97rem over the sunlit side of the S-II, which is near enough white.
   No amount of scrim fixes that, because the scrim is under the vehicle and
   not over it. The vehicle has to be somewhere else, and shiftY in the shot
   table is where "somewhere else" is written down.

   The box is the caption column measured off the laid-out page rather than
   guessed at. On the three desktop sizes it was read at -- 1920x1080,
   1440x900, 1280x800 -- a note is 480 px wide at the page gutter and
   between 12.9 and 20.6 viewport heights tall, which is x from -0.96 to
   -0.20 and, sitting with its top at 0.62 of the window, y from -0.24 down
   to -0.84. Widest of each, and then a little more, because a caption whose
   descenders touch a propellant tank is not much better than one lying on
   it.

   And it is not only tested at the caption's own moment. scene.js fades
   each note out over 0.045 to 0.10 either side, so it is still legible --
   still worth not putting a rocket behind -- for some way in both
   directions, sliding up the window as it goes. The sweep below is over the
   interval where a note is above a fifth of full brightness, which for that
   ramp is 0.082 of the tour: sixteen viewport heights of travel, or a
   third of the window. That is the part of this that cannot be eyeballed,
   and it is the part that fails first.

   The vehicle is treated as a cylinder of radius 5.1 m about its axis --
   the real tanks are 10.06 m across -- sampled all the way round, so what
   is compared against the box is the projected silhouette and not the axis.
   The S-IC's fins reach twice that, but only over the bottom four metres,
   and the shot that has them in it also has them well to the right. */
{
  const R = 5.1;
  const NOTE_VH = 0.21;   // the tallest a note gets, in viewport heights
  const SPREAD = 0.082;   // how far either side of its moment it stays lit
  // LIT_AT and TRAVEL_VH are declared once, above, and shared with THE
  // INTERLUDE section further down.

  // Slide the note through the window across the lit interval, take the
  // union, and pad. Up the window is +y, and scrolling forward moves a note
  // up, so the earliest moment gives the lowest box and the latest the
  // highest.
  const vhToNdc = (vh) => 1 - 2 * vh;
  const highest = vhToNdc(LIT_AT - SPREAD * TRAVEL_VH);
  const lowest = vhToNdc(LIT_AT + NOTE_VH + SPREAD * TRAVEL_VH);
  const BOX = { x0: -1, x1: -0.16, y0: lowest - 0.04, y1: highest + 0.04 };

  for (const [label, u] of CAPTIONS) {
    let worst = null;
    for (let j = 0; j <= 24; j++) {
      const uu = clamp01(u + ((j / 24) * 2 - 1) * SPREAD);
      if (tourWeightAt(uu) <= 0.01) continue;
      for (let i = 0; i <= 120; i++) {
        const xM = (i / 120) * STACK_M;
        for (let k = 0; k < 24; k++) {
          const a = (k / 24) * Math.PI * 2;
          const n = tourNdcAt(uu, xM, R * Math.cos(a), R * Math.sin(a));
          if (!n) continue;
          if (n.x >= BOX.x0 && n.x <= BOX.x1 && n.y >= BOX.y0 && n.y <= BOX.y1) {
            if (!worst || n.y > worst.y) worst = { ...n, uu };
          }
        }
      }
    }
    assert(
      `nothing of the vehicle is behind ${label} caption`,
      worst === null,
      worst
        ? `intrudes at ndc x ${worst.x.toFixed(2)}, y ${worst.y.toFixed(2)} (u ${worst.uu.toFixed(3)})`
        : `box y ${BOX.y0.toFixed(2)} to ${BOX.y1.toFixed(2)}`
    );
  }
}

// Gone by the time About Me arrives, and not there before the section is.
check("the camera blend is off at the top of the section", tourWeightAt(0), -1e-9, 1e-9);
check("the camera blend is off at the bottom", tourWeightAt(1), -1e-9, 1e-9);
check("the camera blend is fully on through the walk", tourWeightAt(0.5), 0.999, 1.001);

// The pull-out's whole reason to exist: by the end of the tour the camera
// has to have settled into a frame that still contains the vehicle, because
// this is the frame a lunar sequence gets built into next. "some part of
// the vehicle is in shot" (checked above) is a different, weaker claim -- a
// frame holding only the escape tower while the engines have already slid
// off the left edge satisfies that check and is still a broken pull-out.
// This checks both extreme ends of the vehicle by name -- the engine plane
// and the tip of the escape tower, the two points that define how long the
// thing is -- over the window where the pull-out does its work, and wants
// both inside the frame with room to spare, not just inside it.
{
  const MARGIN = 0.85; // stay inside this, not merely inside +/-1
  for (const [name, aspect] of [
    ["16:9", 16 / 9],
    ["4:3", 4 / 3],
  ]) {
    let worst = null;
    for (let i = 0; i <= 140; i++) {
      const u = 0.93 + (i / 140) * 0.07;
      const engine = tourNdcAt(u, 0, 0, 0, aspect);
      const tower = tourNdcAt(u, STACK_M, 0, 0, aspect);
      for (const [label, n] of [
        ["engine plane", engine],
        ["tower tip", tower],
      ]) {
        const bad = !n || Math.abs(n.x) > MARGIN || Math.abs(n.y) > MARGIN;
        if (bad) {
          const mag = n ? Math.max(Math.abs(n.x), Math.abs(n.y)) : Infinity;
          if (!worst || mag > worst.mag) worst = { mag, label, u, n };
        }
      }
    }
    assert(
      `both ends of the vehicle stay framed through the pull-out (${name})`,
      worst === null,
      worst
        ? `${worst.label} at u=${worst.u.toFixed(3)} -- ${worst.n ? `ndc x ${worst.n.x.toFixed(2)}, y ${worst.n.y.toFixed(2)}` : "behind the camera"}`
        : ""
    );
  }
}

// The same refinement argument as everything else on this layer: a bounded
// derivative halves its largest step when the sampling doubles, and a jump
// does not. camX is the one that would show, because it is what slides the
// vehicle across the frame.
{
  const step = (n) => {
    let worst = 0;
    for (let i = 0; i < n; i++) {
      worst = Math.max(worst, Math.abs(tourCameraAt((i + 1) / n).camX - tourCameraAt(i / n).camX));
    }
    return worst;
  };
  assert("the tour camera halves its step under refinement", step(1000) < step(500) * 0.62);
}

// The same argument again, for the two other signals this revision turns
// on. A framing that "undulates" between captions -- tighter at the beat,
// a little looser between -- is only a breath if the undulation itself has
// no corner in it; a swell with a cusp reads as a stutter, not a breath.
// And a camera that never reverses along the vehicle's axis still has to
// get there by an unbroken path through actual space: camX alone does not
// say how far back or how high the camera sits, so it is not, on its own,
// "the camera's position". spanM and 3D position are checked the same way
// as camX above -- refine the sampling and the worst step should roughly
// halve, because a genuine cusp does not.
{
  const stepOf = (n, f) => {
    let worst = 0;
    for (let i = 0; i < n; i++) {
      worst = Math.max(worst, Math.abs(f((i + 1) / n) - f(i / n)));
    }
    return worst;
  };

  const spanStep = (n) => stepOf(n, (u) => tourCameraAt(u).spanM);
  assert(
    "the tour's framing (spanM) halves its step under refinement",
    spanStep(1000) < spanStep(500) * 0.62
  );

  // Position in metres, at one fixed aspect so the comparison means the
  // same thing at both sample rates. This is where spanM, camX and riseM
  // meet -- the point in space a viewer would actually watch dolly through.
  const posAt = (u) => {
    const shot = tourCameraAt(u);
    const distance = tourDistanceM(shot.spanM, TOUR_ASPECT, shot.fovDeg);
    return [shot.camX, shot.riseM, distance];
  };
  const posStep = (n) => {
    let worst = 0;
    for (let i = 0; i < n; i++) {
      const a = posAt(i / n);
      const b = posAt((i + 1) / n);
      worst = Math.max(worst, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
    }
    return worst;
  };
  assert(
    "the tour camera's 3D position halves its step under refinement",
    posStep(1000) < posStep(500) * 0.62
  );

  // And the frame offset that does the actual composing -- the mechanism
  // this revision was told not to touch, only to keep smooth.
  const shiftStep = (n) => {
    let worst = 0;
    for (let i = 0; i < n; i++) {
      const a = tourCameraAt(i / n);
      const b = tourCameraAt((i + 1) / n);
      worst = Math.max(worst, Math.hypot(b.shiftX - a.shiftX, b.shiftY - a.shiftY));
    }
    return worst;
  };
  assert(
    "the tour's frame shift halves its step under refinement",
    shiftStep(1000) < shiftStep(500) * 0.62
  );
}

/* This used to assert that camX never gave ground back -- that the dolly
   walked the vehicle tail to tip and never reversed. That rule is gone, and
   it is worth saying why rather than quietly deleting it. It was written
   when the captions ran up the stack in spatial order. They now run in
   chronological order, because each part separates from the vehicle as you
   finish reading about it, and chronologically the escape tower goes at
   GET 197 -- long before the S-II finishes at 553. So the camera must visit
   the tip and then come back down. Monotone camX and truthful ordering
   cannot both hold, and the ordering is the one carrying the meaning.

   What replaces it is not weaker, it is just the right question. A dolly
   that reverses is not the problem; a dolly that reverses FAST is. Both
   bounds below are rates, and both are expressed the way the eye reads them
   rather than the way the numbers are stored: framing as a ratio, because
   going 200 m to 100 m and 100 m to 50 m cost the same attention, and the
   dolly in frame-widths rather than metres, because crossing half a frame
   is the same event whether the frame is 60 m or 200 m wide. */
const TOUR_RATE_SAMPLES = 4000;
{
  let worstSpan = 0, worstSpanU = 0, worstDolly = 0, worstDollyU = 0;
  for (let i = 1; i <= TOUR_RATE_SAMPLES; i++) {
    const a = tourCameraAt((i - 1) / TOUR_RATE_SAMPLES);
    const b = tourCameraAt(i / TOUR_RATE_SAMPLES);
    const span = (Math.log(b.spanM) - Math.log(a.spanM)) * TOUR_RATE_SAMPLES;
    if (Math.abs(span) > Math.abs(worstSpan)) {
      worstSpan = span;
      worstSpanU = i / TOUR_RATE_SAMPLES;
    }
    const dolly = (Math.abs(b.camX - a.camX) * TOUR_RATE_SAMPLES) / b.spanM;
    if (dolly > worstDolly) {
      worstDolly = dolly;
      worstDollyU = i / TOUR_RATE_SAMPLES;
    }
  }
  check(
    `the framing never changes faster than this (worst at u=${worstSpanU.toFixed(3)})`,
    Math.abs(worstSpan),
    0,
    12,
    "/u"
  );
  check(
    `the dolly never crosses frames faster than this (worst at u=${worstDollyU.toFixed(3)})`,
    worstDolly,
    0,
    6,
    "w/u"
  );
}

/* The two ends. The tour is blended in and out of the mission camera, and
   a blend toward a frame with nothing in it is a cut to an empty shot no
   matter how smooth the interpolation is -- which is exactly how the old
   ending got past every rate check in this file. u = 0 matters for the same
   reason at the other end: the approach now begins at the very top of the
   section, so the shot it is approaching has to have the vehicle in it from
   the first pixel. */
const STACK_TIP_M = 110.6;
for (const u of [0, 1]) {
  for (const [aspectName, aspect] of [["16:9", 16 / 9], ["4:3", 4 / 3]]) {
    const a = tourNdcAt(u, 0, 0, 0, aspect);
    const b = tourNdcAt(u, STACK_TIP_M, 0, 0, aspect);
    assert(
      `the vehicle is in front of the camera at u=${u}, ${aspectName}`,
      Boolean(a && b)
    );
    if (!a || !b) continue;
    assert(
      `some of the vehicle is inside the frame at u=${u}, ${aspectName}`,
      Math.min(a.x, b.x) <= 1 && Math.max(a.x, b.x) >= -1 &&
        Math.min(a.y, b.y) <= 1 && Math.max(a.y, b.y) >= -1,
      `x ${a.x.toFixed(2)}..${b.x.toFixed(2)}, y ${a.y.toFixed(2)}..${b.y.toFixed(2)}`
    );
  }
}

/* And the closing move only ever opens up. The log-span spline can overshoot
   between knots, and an overshoot here reads as the pull-out stalling and
   then lurching again -- the frame widens, tightens a little, widens once
   more. It is small in the numbers and very visible on screen. */
assert(
  "the closing pull-out only ever opens up",
  (() => {
    let prev = tourCameraAt(0.88).spanM;
    for (let u = 0.88; u <= 1.0001; u += 0.002) {
      const s = tourCameraAt(u).spanM;
      if (s < prev - 0.5) return false;
      prev = s;
    }
    return true;
  })()
);

assert(
  "the tour passes through every authored framing",
  TOUR_SHOTS.every((k) => Math.abs(tourCameraAt(k.u).camX - k.camX) < 1e-6)
);

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


/* =========================================================================
   THE FLIGHT PROFILE
   =========================================================================

   Section 9 of the brief is one instruction: the exhaust must not get
   abruptly cut off. The way that bug gets written is a boolean -- some
   `if (stageBurning)` that flips between two frames -- so the checks here
   are not "does the plume look right", which nothing headless can answer.
   They are: does any number the plume is driven by ever jump? If none of
   them does, the plume cannot, because plume.js has no branch in it.

   Everything below is sampled on p rather than on time, because p is the
   only input. That is also what makes scrolling back up reverse exactly. */

const FLIGHT_SAMPLES = 20000;
const flightSamples = [];
for (let i = 0; i <= FLIGHT_SAMPLES; i++) flightSamples.push(flightAt(i / FLIGHT_SAMPLES));

// The mission clock only ever runs forwards.
{
  let worst = 0;
  for (let i = 1; i < flightSamples.length; i++) {
    worst = Math.min(worst, flightSamples[i].getSeconds - flightSamples[i - 1].getSeconds);
  }
  check("smallest step in the mission clock", worst, 0, Infinity, "s");
}

/* Every signal the plume is driven by, tested for the one thing section 9
   forbids: a discontinuity.

   The first version of this measured the largest step each signal takes
   between adjacent samples and compared it against a tolerance, and it
   failed on six signals that are perfectly continuous -- because a J-2
   cutoff is *supposed* to be fast, and "fast" and "discontinuous" are not
   the same thing. Picking a tolerance was really picking a speed limit,
   which is a composition decision wearing an assertion's clothes.

   So this asks the question directly instead. Sample the signal at N points
   and take the largest step; sample it at 2N and take the largest step
   again. For anything with a bounded derivative the second number is half
   the first, because the steps are the derivative times the spacing. For a
   value that jumps -- a boolean, an `if (burning)`, the bug -- the largest
   step is the height of the jump and refining the sampling does not shrink
   it at all. The ratio separates the two cleanly and needs no tuning.

   The tail-off ramps are checked separately, further down, for how long
   they take. That is where the speed limit belongs. */
const DRIVES = [
  ["throttle sic", (f) => f.throttle.sic],
  ["throttle sii", (f) => f.throttle.sii],
  ["throttle sivb", (f) => f.throttle.sivb],
  ["aux sicRetro", (f) => f.auxiliary.sicRetro],
  ["aux siiUllage", (f) => f.auxiliary.siiUllage],
  ["aux siiRetro", (f) => f.auxiliary.siiRetro],
  ["aux sivbUllage", (f) => f.auxiliary.sivbUllage],
  ["presence", (f) => f.presence],
  ["clearance", (f) => f.clearance],
  ["real altitude", (f) => f.realAltitudeKm],
  ["drawn stack height", (f) => f.stackHeightKm],
  ["vehicle scale", (f) => f.kmPerVehicleMetre],
  ["pitch", (f) => f.pitchRad],
  ["drawn downrange", (f) => f.downrangeKm],
];

function largestStep(get, n) {
  let worst = 0;
  let worstAt = 0;
  let prev = get(flightAt(0));
  for (let i = 1; i <= n; i++) {
    const x = i / n;
    const v = get(flightAt(x));
    const step = Math.abs(v - prev);
    if (step > worst) {
      worst = step;
      worstAt = x;
    }
    prev = v;
  }
  return { worst, worstAt };
}

for (const [label, get] of DRIVES) {
  const coarse = largestStep(get, 10000);
  const fine = largestStep(get, 20000);
  // A step that survives refinement is a step in the value. One that halves
  // is a steep piece of a continuous curve.
  const ratio = coarse.worst === 0 ? 0 : fine.worst / coarse.worst;
  check(`${label} is continuous, steepest at p=${fine.worstAt.toFixed(4)}`, ratio, 0, 0.62);
}

// Throttles are throttles: never negative, never more than open.
{
  let lo = Infinity;
  let hi = -Infinity;
  for (const f of flightSamples) {
    for (const v of [f.throttle.sic, f.throttle.sii, f.throttle.sivb]) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  check("lowest throttle anywhere on the page", lo, -1e-12, 1);
  check("highest throttle anywhere on the page", hi, 0, 1 + 1e-12);
}

/* Cutoff comes before separation, every time, and the plume is already out
   when the stage goes. This is the ordering in the Apollo 11 Flight Journal
   and it is also the only ordering that looks right: a stage that departs
   with its engines lit reads as a mistake, and a stage whose flame vanishes
   at the instant of separation reads as the flame being switched off, which
   is the bug section 9 is about. */
for (const [stage, sepKey] of [["sic", "staging1"], ["sii", "staging2"]]) {
  const sepP = at(sepKey);
  const atSep = flightAt(sepP).throttle[stage];
  assert(`${stage} is out before it separates`, atSep === 0, `throttle at separation ${atSep}`);

  // And it was burning shortly before, so "out" means "shut down", not
  // "never lit".
  const before = flightAt(sepP - 0.02).throttle[stage];
  assert(`${stage} was still burning 0.02 of a page earlier`, before > 0.5, `throttle ${before.toFixed(3)}`);

  // The tail-off is a ramp, not a step: find where it last held full thrust
  // and confirm the way down took a measurable stretch of page.
  let lastFull = 0;
  for (const f of flightSamples) if (f.throttle[stage] > 0.75) lastFull = f.p;
  check(`${stage} tail-off length`, sepP - lastFull, 0.002, 0.05, "of the page");
}

// The drawn stack only ever grows. It varies -- the argument for that is in
// flight.js -- but a vehicle that shrank and then grew again would read as
// the camera changing its mind.
{
  let worstDrop = 0;
  for (let i = 1; i < flightSamples.length; i++) {
    worstDrop = Math.min(worstDrop, flightSamples[i].stackHeightKm - flightSamples[i - 1].stackHeightKm);
  }
  check("worst backward step in the drawn stack height", worstDrop, -1e-9, Infinity, "km");
  check(
    "largest drawn stack height",
    flightSamples[flightSamples.length - 1].stackHeightKm,
    480,
    480 * 2.4 + 1e-9,
    "km"
  );
}

/* Separated parts leave and keep leaving. Nothing comes back, nothing
   re-appears once it has faded, and both happen smoothly -- the parts are
   drawn by the same shader as the stack, so a step in either number is a
   piece of hardware teleporting. */
for (const part of ["sic", "sii", "interstage", "tower"]) {
  let worstDrift = 0;
  let worstFade = 0;
  let stepDrift = 0;
  let stepFade = 0;
  for (let i = 1; i < flightSamples.length; i++) {
    const a = flightSamples[i - 1].parts[part];
    const b = flightSamples[i].parts[part];
    const dd = Math.abs(b.drift) - Math.abs(a.drift);
    worstDrift = Math.min(worstDrift, dd);
    worstFade = Math.max(worstFade, b.opacity - a.opacity);
    stepDrift = Math.max(stepDrift, Math.abs(dd));
    stepFade = Math.max(stepFade, Math.abs(b.opacity - a.opacity));
  }
  assert(`${part} never comes back`, worstDrift >= -1e-9 && worstFade <= 1e-9);
  check(`${part} drift is continuous`, stepDrift, 0, 0.01, "lengths");
  check(`${part} fade is continuous`, stepFade, 0, 0.01);
}

console.log("\nTHE INTERLUDE\n");

/* #saturn-v's five captions each name a part of the vehicle, and the part
   has to come off just after its caption is the thing the reader is looking
   at -- not before, which would describe hardware that has already gone,
   and not so long after that the reader has scrolled past the caption by
   the time it happens. flight.js pins the five separations to exactly this;
   this is the assertion that checks it holds, named directly in the comment
   above EVENTS there.

   A caption's own moment has to be read out of museum.css rather than typed
   in twice, for the reason every other derived number in this file is --
   two copies drift. The rule for turning a `top` into the u it was written
   for is LIT_AT and TRAVEL_VH, above, run backwards exactly the way
   measureTour() in scene.js runs them on the real DOM.

   Turning that u into a page progress p needs where the interlude itself
   sits on the page, and that is the one number here with no formula behind
   it: it depends on the rendered height of every section above it, which
   only exists once a browser has actually laid the page out. INTERLUDE_FROM
   and INTERLUDE_TO are measured off the built page rather than derived, and
   are given a little slack on the "inside the interlude" check below for
   exactly that reason -- they are the brief's numbers, not a recomputation
   of them. */
const MUSEUM_CSS = readFileSync(new URL("../public/assets/css/museum.css", import.meta.url), "utf8");

const INTERLUDE_FROM = 0.491;
const INTERLUDE_TO = 0.723;

// note class suffix, the vh its CSS `top` is set to (read from the
// stylesheet rather than copied), and the event it introduces.
/* The third column is the extent the shot has to hold when that caption
   lights, in metres from the engine plane, because a caption that arrives
   while the camera is pointed somewhere else is worse than no caption. The
   stack: S-IC 0-42, interstage 42-45, S-II 45-69, S-IVB 69-92, spacecraft
   92-100, escape tower 100-110.6.

   Two of the extents are wider than the part their caption names, and the
   reason is arithmetic rather than taste. tourCameraAt clamps spanM at 50,
   so the tightest shot the page can produce is 50 m across. The interstage
   is a 3 m band -- 6% of the tightest possible frame -- so requiring it to
   be a readable fraction of the width requires something the clamp forbids.
   What the "Separation" caption is actually about is the two stages coming
   apart with the black ring between them, so the extent is the region around
   the ring. The escape tower is the same problem one step milder, and its
   own caption calls it "a lattice above the command module", so the command
   module's top belongs in the shot with it. */
const INTERLUDE_CAPTIONS = [
  ["sic", "staging1", [0, 42], "the S-IC"],
  ["stage", "interstageOff", [37, 50], "the interstage region"],
  ["tower", "towerOff", [96, 110.6], "the escape tower over the CM"],
  ["sii", "staging2", [45, 69], "the S-II"],
  ["sivb", "tliIgnition", [69, 92], "the S-IVB"],
];

for (const [note, eventKey, [partLo, partHi], partName] of INTERLUDE_CAPTIONS) {
  const topMatch = new RegExp(`\\.interlude-note--${note}\\s*\\{\\s*top:\\s*([\\d.]+)vh`).exec(MUSEUM_CSS);
  assert(`museum.css still positions .interlude-note--${note}`, Boolean(topMatch));

  const topVh = Number(topMatch[1]);
  const captionU = (topVh / 100 - LIT_AT) / TRAVEL_VH;
  const captionP = INTERLUDE_FROM + captionU * (INTERLUDE_TO - INTERLUDE_FROM);
  const eventP = at(eventKey);

  assert(
    `${eventKey} fires inside the interlude`,
    eventP >= INTERLUDE_FROM && eventP <= INTERLUDE_TO,
    `p=${eventP.toFixed(3)}, interlude ${INTERLUDE_FROM} to ${INTERLUDE_TO}`
  );
  check(
    `${eventKey} comes apart just after the ${note} caption lights (u=${captionU.toFixed(3)}, p=${captionP.toFixed(3)})`,
    eventP - captionP,
    0,
    0.03
  );

  /* And the camera is looking at the thing the caption describes. The
     captions run in chronological order -- each part leaves the vehicle as
     you finish reading about it -- which is deliberate, and which makes the
     camera's path along the stack non-monotone: it has to be at the engines,
     then the interstage, then all the way up at the escape tower, then back
     down to the S-II, then up again to the S-IVB. Nothing about that ordering
     is negotiable, so the only way it can be wrong is by the camera being
     somewhere else when the words arrive. That is what this measures. */
  for (const [aspectName, aspect] of [["16:9", 16 / 9], ["4:3", 4 / 3]]) {
    const lo = tourNdcAt(captionU, partLo, 0, 0, aspect);
    const hi = tourNdcAt(captionU, partHi, 0, 0, aspect);
    assert(
      `${partName} is in front of the camera when the ${note} caption lights, ${aspectName}`,
      Boolean(lo && hi)
    );
    if (!lo || !hi) continue;

    const outside = Math.max(Math.abs(lo.x), Math.abs(hi.x), Math.abs(lo.y), Math.abs(hi.y));
    check(
      `${partName} sits inside the ${aspectName} frame at the ${note} caption`,
      outside,
      0,
      0.95
    );
    // A part can be inside the frame and still be too small to be the
    // subject of a paragraph about it. The interstage is the binding case:
    // it is a three-metre band, so framing it at all means framing it tight.
    check(
      `${partName} is big enough to be the subject, ${aspectName}`,
      Math.abs(hi.x - lo.x) / 2,
      0.18,
      1.6,
      "of width"
    );
  }
}

/* =========================================================================
   THE VEHICLE STAYS IN THE FRAME
   =========================================================================

   flight.js says the shipped azimuth and gains are settled by looking, and
   that this file asserts the pair still works. This is that assertion.

   Two things have to be reproduced here that live in scene.js: the screen
   point the launch site is aimed at, and the planet's radius. Both are read
   out of the source rather than copied, so if either moves this check fails
   loudly instead of quietly measuring the wrong composition.

   The planet's rotation does not appear anywhere below, and that is not an
   omission. Since the pad's longitude walks backwards by exactly the angle
   earthGroup has turned, the vehicle's world position is independent of how
   long the page has been open -- which is the whole point of that code, and
   is checked in the browser against the renderer rather than here. */
const EARTH_SRC = readFileSync(new URL("../src/apollo/earth.js", import.meta.url), "utf8");
const R_FROM_SOURCE = Number(/EARTH_RADIUS_KM\s*=\s*([\d.]+)/.exec(EARTH_SRC)[1]);
check("the radius this file uses matches earth.js", R_FROM_SOURCE - R_KM, -1e-9, 1e-9, "km");

const padTarget = /PAD_TARGET_NDC\s*=\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/.exec(SCENE_SRC);
assert("scene.js still aims the pad at a fixed screen point", !!padTarget);
const PAD_NDC = [Number(padTarget[1]), Number(padTarget[2])];
const PAD_LAT_LIMIT = Number(/PAD_LAT_LIMIT\s*=\s*([\d.]+)/.exec(SCENE_SRC)[1]);
const IGNITION_P = at("enginesStart");

function vnorm(a) {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

// scene.js unprojects PAD_TARGET_NDC and intersects the planet. project()
// in apollo-framing is that map forwards; this is the same map backwards,
// evaluated at unit depth, which is all a ray needs.
function padAtIgnition(aspect) {
  const basis = cameraBasis(shotAt(IGNITION_P));
  const t = Math.tan((basis.fovDeg * Math.PI) / 360);
  const cx = (PAD_NDC[0] - 2 * basis.offsetX) * t * aspect;
  const cy = (PAD_NDC[1] + 2 * basis.offsetY) * t;
  const dir = vnorm([
    basis.x[0] * cx + basis.y[0] * cy - basis.z[0],
    basis.x[1] * cx + basis.y[1] * cy - basis.z[1],
    basis.x[2] * cx + basis.y[2] * cy - basis.z[2],
  ]);

  const o = basis.eye;
  const b = o[0] * dir[0] + o[1] * dir[1] + o[2] * dir[2];
  const c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - R_KM * R_KM;
  const disc = b * b - c;
  const k = disc >= 0 ? -b - Math.sqrt(disc) : -b;
  const hit = vnorm([o[0] + dir[0] * k, o[1] + dir[1] * k, o[2] + dir[2] * k]);

  // The daylight correction, same form as scene.js. If the ray already
  // lands in the sun this does nothing, which is the case for the shipped
  // shot list -- asserted below rather than assumed.
  const sun = subSolarPoint(LAUNCH_EPOCH_MS);
  const sv = latLonToUnitVector(sun.latDeg, sun.lonDeg);
  const lit = hit[0] * sv.x + hit[1] * sv.y + hit[2] * sv.z;

  let latDeg = Math.asin(Math.max(-1, Math.min(1, hit[1]))) * (180 / Math.PI);
  latDeg = Math.max(-PAD_LAT_LIMIT, Math.min(PAD_LAT_LIMIT, latDeg));
  const lonDeg = Math.atan2(-hit[2], hit[0]) * (180 / Math.PI);
  return { latDeg, lonDeg, lit, hitSurface: disc >= 0 };
}

// Two aspect ratios, because the composition has to survive both a wide
// desktop window and a squarer one, and the horizontal margin is the one
// that runs out first.
for (const [label, aspect] of [["16:9", 16 / 9], ["4:3", 4 / 3]]) {
  const pad = padAtIgnition(aspect);
  assert(`the pad ray reaches the surface, ${label}`, pad.hitSurface);
  check(`the pad is in daylight, ${label}`, pad.lit, 0.22, 1.01);

  const basisPad = surfaceBasis(pad.latDeg, pad.lonDeg);
  const heading = headingAt(pad.latDeg, pad.lonDeg, LAUNCH_AZIMUTH_DEG);

  let worst = 0;
  let worstAt = 0;
  let offFrame = 0;
  for (let i = 0; i <= 600; i++) {
    // Engine start to a little past orbital insertion: the stretch where
    // there is a vehicle to lose.
    const p = IGNITION_P + (0.7 - IGNITION_P) * (i / 600);
    const f = flightAt(p);
    const frame = vehicleFrame(basisPad.up, heading, f, R_KM);
    const cam = cameraBasis(shotAt(p));

    // Both ends of the drawn stack, since it is the tip that leaves first.
    const axis = frame.axis;
    const tipKm = f.stackHeightKm;
    const ends = [
      frame.position,
      [
        frame.position[0] + axis[0] * tipKm,
        frame.position[1] + axis[1] * tipKm,
        frame.position[2] + axis[2] * tipKm,
      ],
    ];
    for (const end of ends) {
      const ndc = project(cam, end, aspect);
      const m = ndc === null ? 99 : Math.max(Math.abs(ndc.x), Math.abs(ndc.y));
      if (m > worst) {
        worst = m;
        worstAt = p;
      }
      if (m > 1) offFrame++;
    }
  }
  check(`vehicle stays in frame, ${label}, worst at p=${worstAt.toFixed(3)}`, worst, 0, 0.97);
  assert(`nothing off the edge, ${label}`, offFrame === 0, `${offFrame} samples outside`);
}

/* =========================================================================
   THE CAMERA BLEND STAYS ABOVE THE PLANET
   =========================================================================

   scene.js does not cut to the tour camera, it blends toward it -- and the
   two cameras are not close together. The mission camera is thousands of
   kilometres out; the tour camera is a couple of hundred kilometres from
   the vehicle. A blend that lerps position component by component draws a
   straight line between the two, and a straight line between two points
   that are each safely above a sphere is not guaranteed to stay above it:
   it can cut a chord that dips closer to the centre than either endpoint.

   scene.js's applyTourBlend avoids this by never lerping position
   directly. It lerps *distance from Earth's centre* -- a plain number,
   which stays within the interval between its two endpoints by
   construction, the way any lerp of two numbers above a floor stays above
   that floor -- and slerps *direction from Earth's centre* separately,
   then recombines them. slerpDir below mirrors scene.js's slerpDirection
   exactly, in plain arrays instead of THREE.Vector3, so this file does not
   need three.js to check it.

   That construction only guarantees the blended distance stays between the
   two endpoint distances -- it says nothing about whether either endpoint
   is itself a good shot. So the check below is not vacuous just because it
   is built on a formula that cannot overshoot: it still fails if a knot
   ever moves a shot's own distance from Earth's centre inside the margin.
   Confirmed by hand while this section was being written: with SHOTS[0]'s
   riseM in tour.js temporarily changed from 16 to -1050 (a knot moved far
   enough to put that shot's own camera near the planet), this file printed

     FAIL  the camera blend stays above the planet, 16:9, worst at u=0.071   5467.613 km    expected 6521 to Infinity
     FAIL  the camera blend stays above the planet, 4:3, worst at u=0.071   5496.699 km    expected 6521 to Infinity

   before the edit was reverted and this file went back to printing "All
   checks passed." The check also fails if the margin below is raised past
   the real clearance the shipped shot list happens to leave, which is
   several hundred kilometres on both aspect ratios -- the margin here is
   set well under that on purpose, to catch a future shot that wanders
   close rather than to describe today's numbers. */

function vlen(a) {
  return Math.hypot(a[0], a[1], a[2]);
}

// Mirrors scene.js's slerpDirection: spherical interpolation between two
// unit vectors, falling back to a plain lerp on top of each other when
// sin(theta) would be dividing by (near enough) zero.
function slerpDir(a, b, t) {
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const theta = Math.acos(dot);
  if (theta < 1e-6) {
    return vnorm([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
  }
  const s = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / s;
  const wb = Math.sin(t * theta) / s;
  return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb];
}

const EARTH_SAFE_MARGIN_KM = 150;

// tourCameraWorld falls back to an arbitrary perpendicular (stablePerp)
// when the vehicle's nose points close enough along the radial from
// Earth's centre that "away from Earth, perpendicular to the nose" stops
// being well defined. That needs cos(pitch) near 1. Confirmed here rather
// than just asserted in a comment: across the interlude, pitch runs from
// about 51 degrees at the top to exactly 90 at the bottom, so cos(pitch)
// runs from about 0.63 down to 0 and never comes near 1 -- the fallback in
// tour.js exists for robustness, not because this shot list needs it.
{
  const aspect = TOUR_ASPECT;
  const pad = padAtIgnition(aspect);
  const basisPad = surfaceBasis(pad.latDeg, pad.lonDeg);
  const heading = headingAt(pad.latDeg, pad.lonDeg, LAUNCH_AZIMUTH_DEG);
  let worst = -1;
  for (let i = 0; i <= 400; i++) {
    const u = i / 400;
    const p = INTERLUDE_FROM + u * (INTERLUDE_TO - INTERLUDE_FROM);
    const f = flightAt(p);
    const frame = vehicleFrame(basisPad.up, heading, f, R_KM);
    const radial = vnorm(frame.position);
    const along = Math.abs(
      radial[0] * frame.axis[0] + radial[1] * frame.axis[1] + radial[2] * frame.axis[2]
    );
    if (along > worst) worst = along;
  }
  check("the nose never lines up with the radial (stablePerp stays unused)", worst, 0, 0.9);
}

for (const [label, aspect] of [["16:9", 16 / 9], ["4:3", 4 / 3]]) {
  const pad = padAtIgnition(aspect);
  const basisPad = surfaceBasis(pad.latDeg, pad.lonDeg);
  const heading = headingAt(pad.latDeg, pad.lonDeg, LAUNCH_AZIMUTH_DEG);

  let worst = Infinity;
  let worstU = 0;
  for (let i = 0; i <= 800; i++) {
    const u = i / 800;
    const p = INTERLUDE_FROM + u * (INTERLUDE_TO - INTERLUDE_FROM);
    const f = flightAt(p);
    const frame = vehicleFrame(basisPad.up, heading, f, R_KM);
    const mission = shotToCamera(shotAt(p), R_KM);
    const tour = tourCameraWorld(u, aspect, {
      origin: frame.position,
      axis: frame.axis,
      earthCenter: [0, 0, 0],
      kmPerVehicleMetre: f.kmPerVehicleMetre,
    });

    const missionR = vlen(mission.position);
    const tourR = vlen(tour.position);
    const blendedR = missionR + (tourR - missionR) * tourWeightAt(u);
    if (blendedR < worst) {
      worst = blendedR;
      worstU = u;
    }
  }
  check(
    `the camera blend stays above the planet, ${label}, worst at u=${worstU.toFixed(3)}`,
    worst,
    R_KM + EARTH_SAFE_MARGIN_KM,
    Infinity,
    "km"
  );
}

/* ---------- The terminal count ----------

   The count is the first thing anybody sees and the only part of this
   layer that makes a factual claim in words, so it gets the same treatment
   as the geometry: assertions, not a look at it.

   The one that matters is the last. A caption that names a number while
   the clock beside it reads a different number is a visible error, and it
   is exactly the kind of error that gets reintroduced later by someone who
   thinks the commentary looks thin and reaches for another line of the
   transcript to pad it out. Most of that transcript is King reading the
   clock aloud. */

console.log("\nTHE TERMINAL COUNT\n");

assert("the count opens at T-60", countdownAt(0).clock === "T\u221200:01:00", countdownAt(0).clock);

// A countdown clock holds its last second up until zero. Flooring instead
// of ceiling shows a stopped 00 for the whole of that final second.
assert("the last second reads 01, not 00", formatGET(-0.9) === "T\u221200:00:01", formatGET(-0.9));
assert("zero reads T+00:00:00", formatGET(0) === "T+00:00:00", formatGET(0));
assert("the count crosses zero exactly at liftoff",
  countdownAt(at("liftoff") - 1e-6).seconds < 0 && countdownAt(at("liftoff")).seconds >= 0);

// It is decoration and it has to leave. A count still on screen during the
// first-stage burn is a telemetry readout sitting on top of the rocket.
{
  let opacity = countdownAt(0).opacity;
  let monotone = true;
  for (let i = 1; i <= 4000; i++) {
    const o = countdownAt(i / 4000).opacity;
    if (o > opacity + 1e-12) monotone = false;
    opacity = o;
  }
  assert("the count never brightens once it starts fading", monotone);
}
check("count opacity at liftoff", countdownAt(at("liftoff")).opacity, 0.999, 1.001);
check("count opacity by p=0.21", countdownAt(0.21).opacity, 0, 0);
check("count opacity at first staging", countdownAt(at("staging1")).opacity, 0, 0);

// No caption may state a time.
{
  const seen = new Set();
  for (let i = 0; i <= 20000; i++) seen.add(callAt(countdownAt(i / 20000).seconds));
  const numeric = [...seen].filter(
    (text) => text && /\bT\s*[-\u2212]|\d+\s*seconds\b|^\s*(thirty|twenty|fifteen|ten)\b/i.test(text)
  );
  assert("no caption restates the clock", numeric.length === 0,
    numeric.join(" | ") || `${seen.size} distinct captions, none numeric`);
}


/* =========================================================================
   THE MOON
   =========================================================================

   The ephemeris is transcribed from JPL Horizons rather than computed, so
   there is no formula here to check. What these check is that it has been
   read into the scene correctly, which is the part that could plausibly be
   wrong in a way nobody would ever see: a sign error in the longitude puts
   the Moon on the wrong side of the planet, and a Moon drawn two hundred
   pixels wide on a black field looks equally plausible wherever it is. */

const sunAtLaunch = (() => {
  const s = subSolarPoint(LAUNCH_EPOCH_MS);
  return latLonToUnitVector(s.latDeg, s.lonDeg);
})();

const dot3 = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const angleDeg = (a, b) => (Math.acos(Math.max(-1, Math.min(1, dot3(a, b)))) * 180) / Math.PI;
const moonDirAt = (ms) => {
  const m = moonAt(ms);
  return latLonToUnitVector(m.latDeg, m.lonDeg);
};

/* The best check available on the frame, and it costs nothing.

   The Sun lies in the plane of the ecliptic. That is not an approximation
   or an observation, it is what the ecliptic IS: the plane of the Earth's
   orbit, seen from inside it. So the angle from the ecliptic pole to the
   Sun is exactly ninety degrees, always. Any error in the obliquity, in the
   right-ascension convention, in gmstDeg or in latLonToUnitVector would
   move it off ninety, and four separate things have to be right together
   for this one number to come out. */
{
  const north = latLonToUnitVector(LUNAR_NORTH.latDeg, LUNAR_NORTH.lonDeg);
  check("ecliptic pole to Sun, which must be 90", angleDeg(north, sunAtLaunch), 89.99, 90.01, "deg");
}

/* Elongation, and why the launch window was where it was.

   Apollo 11 left two days after new Moon, and from Earth the Moon was a
   young crescent about twenty-two degrees from the Sun. That is not a
   coincidence and it is not aesthetics: the landing site had to be near its
   own sunrise, so that a low Sun threw long shadows off the boulders and
   Armstrong could read the ground he was setting down on. Wanting sunrise
   over Tranquility on the 20th is what fixed a launch on the 16th, and this
   number is that decision, seen from Earth.

   A value here that is not a thin crescent means the ephemeris and the
   solar geometry have been read against different frames. The two are
   computed by entirely separate code from entirely separate sources, which
   is what makes them worth comparing at all. */
/* The Moon never leaves the ecliptic by more than about five degrees.

   The lunar orbit is inclined 5.145 degrees to the plane of the Earth's
   orbit, and that inclination is famously stable -- it is why eclipses need
   the Moon to be near a node and why we do not get one every month. So the
   Moon's ecliptic latitude is bounded, hard, by a number that has nothing
   to do with the Sun, with Greenwich, or with anything else this file
   computes.

   That independence is the point. The elongation check below reads the
   Moon against the Sun, so it is insensitive to errors that move both -- a
   flipped longitude sign reflects the Moon about the Greenwich meridian and
   moves elongation by under four degrees, which is inside any honest
   tolerance. Ecliptic latitude has no such blind spot: reflect the Moon and
   this leaves the five-degree band immediately. */
{
  const pole = latLonToUnitVector(LUNAR_NORTH.latDeg, LUNAR_NORTH.lonDeg);
  let worst = 0;
  for (let i = 0; i <= 64; i++) {
    const beta = 90 - angleDeg(moonDirAt(LAUNCH_EPOCH_MS + getSecondsAt(i / 64) * 1000), pole);
    worst = Math.max(worst, Math.abs(beta));
  }
  check("how far the Moon strays from the ecliptic", worst, 0, 5.145, "deg");
}

{
  const elong = angleDeg(moonDirAt(LAUNCH_EPOCH_MS), sunAtLaunch);
  check("Sun-Earth-Moon elongation at launch", elong, 20, 26, "deg");
  check("the Moon's age at launch", elong / 12.19, 1.5, 2.2, "days");
}

/* Distance, apparent size, and closing. */
{
  const SAMPLES = 64;
  let minKm = Infinity;
  let maxKm = 0;
  let monotone = true;
  let previous = Infinity;
  for (let i = 0; i <= SAMPLES; i++) {
    const km = moonAt(LAUNCH_EPOCH_MS + getSecondsAt((i * LAST_U) / SAMPLES) * 1000).distanceKm;
    minKm = Math.min(minKm, km);
    maxKm = Math.max(maxKm, km);
    if (km > previous + 1e-6) monotone = false;
    previous = km;
  }

  // Perigee and apogee bound every distance the Moon can ever be at.
  check("closest the Moon gets on this page", minKm, 356400, 406800, "km");
  check("furthest the Moon gets on this page", maxKm, 356400, 406800, "km");

  // It was near apogee at launch, which is why the range starts above
  // 400,000 km and not at the 384,400 km everyone quotes.
  check("the Moon's distance at the top of the page", maxKm, 400000, 406800, "km");

  assert("the Moon only ever gets closer as the page scrolls", monotone);

  /* How fast the Moon is allowed to move across the sky, and why this is
     the check the rest of them miss.

     moonAt reads longitude against Greenwich as it stood at the LAUNCH
     epoch, once, and never against Greenwich at the time being asked for.
     Using gmstDeg(ms) there instead would be an easy and completely
     invisible mistake: every check above still passes, because the distance
     is untouched and the geometry at the launch instant is identical -- the
     two definitions agree exactly at t=0 and nowhere else. What it would do
     is whirl the Moon right around the planet once per mission day, which
     is backwards. The Moon does not orbit the Earth daily; the Earth turns
     underneath it.

     So this measures the thing that actually distinguishes them. The real
     Moon moves about 13.2 degrees a day against the stars. Read against a
     live GMST it would appear to move some 360 degrees a day on top of
     that, and the per-step rate below would come out roughly thirty times
     too large. */
  {
    let worstRatePerDay = 0;
    let previousDir = null;
    let previousDay = 0;
    for (let i = 0; i <= SAMPLES; i++) {
      const day = getSecondsAt((i * LAST_U) / SAMPLES) / 86400;
      const dir = moonDirAt(LAUNCH_EPOCH_MS + day * 86400000);
      if (previousDir && day - previousDay > 1e-4) {
        worstRatePerDay = Math.max(worstRatePerDay, angleDeg(previousDir, dir) / (day - previousDay));
      }
      previousDir = dir;
      previousDay = day;
    }
    check("how fast the Moon crosses the sky, worst step", worstRatePerDay, 11, 15, "deg/day");

    /* The bound below is derived, not observed. The page now ends at
       touchdown, 369940 s after range zero, which is 4.282 days. A sidereal
       month is 27.32 days, so a Moon moving at its mean rate sweeps
       360 * 4.282 / 27.32 = 56.4 degrees in that time. The real Moon is
       eccentric and was near apogee, where it moves slowest, so the answer
       should sit a little under the mean -- hence a window either side of
       it rather than a number. The old window was 30-45 because the page
       used to stop at 69.5 hours; widening it to fit was not the fix. */
    const sweep = angleDeg(moonDirAt(LAUNCH_EPOCH_MS), moonDirAt(LAUNCH_EPOCH_MS + getSecondsAt(LAST_U) * 1000));
    check("how far the Moon moves over the whole page", sweep, 50, 60, "deg");
  }

  // Half a degree, the number everyone knows. It is also the only thing
  // that can check the drawn radius, since the distance is transcribed and
  // therefore cannot be checked against anything else here.
  const angDiam = (ms) => (2 * Math.asin(MOON_RADIUS_KM / moonAt(ms).distanceKm) * 180) / Math.PI;
  check("apparent size of the Moon at launch", angDiam(LAUNCH_EPOCH_MS), 0.48, 0.53, "deg");
  check("apparent size at the bottom of the page",
    angDiam(LAUNCH_EPOCH_MS + getSecondsAt(LAST_U) * 1000), 0.48, 0.53, "deg");

  // The camera's far plane is 4,000,000 km. If the Moon ever fell outside
  // it, the Moon would simply not be drawn -- silently, on a black
  // background, which is the least debuggable failure this page has.
  assert("the Moon is inside the camera's far plane", maxKm < 4000000,
    Math.round(maxKm) + " km against a 4,000,000 km far plane");
}

/* Tidal locking, checked by driving the real code rather than restating it.

   createMoon builds a three.js mesh, but nothing here needs a GL context --
   a Matrix4 is arithmetic. So this calls the same place() the scene calls,
   sixty times a second, and reads the matrix it actually produced. The
   check fails if the basis is ever built left-handed, or if the near side
   ever ends up pointing away from the Earth. */
{
  const north = latLonToUnitVector(LUNAR_NORTH.latDeg, LUNAR_NORTH.lonDeg);
  const northVec = new THREE.Vector3(north.x, north.y, north.z);
  const moon = createMoon({ map: null, radiusKm: MOON_RADIUS_KM });

  const m = moonAt(LAUNCH_EPOCH_MS);
  const dir = moonDirAt(LAUNCH_EPOCH_MS);
  const position = new THREE.Vector3(dir.x, dir.y, dir.z).multiplyScalar(m.distanceKm);

  moon.place({
    position,
    northAxis: northVec,
    sunDirection: new THREE.Vector3(sunAtLaunch.x, sunAtLaunch.y, sunAtLaunch.z),
    cameraPosition: new THREE.Vector3(0, 0, 0),
  });

  const basis = moon.mesh.matrix;
  const localX = new THREE.Vector3().setFromMatrixColumn(basis, 0);
  const localY = new THREE.Vector3().setFromMatrixColumn(basis, 1);
  const localZ = new THREE.Vector3().setFromMatrixColumn(basis, 2);
  const toEarth = position.clone().negate().normalize();

  check("the near side points at the Earth", localX.dot(toEarth), 0.99999, 1.00001);
  check("lunar north still points north", localY.dot(northVec), 0.9, 1.0);
  check("the frame is right-handed",
    localZ.dot(new THREE.Vector3().crossVectors(localX, localY)), 0.99999, 1.00001);
  check("the frame is orthogonal", Math.abs(localX.dot(localY)), 0, 1e-6);
  check("the Moon is drawn where it is", moon.mesh.matrix.elements[14] / position.z, 0.99999, 1.00001);

  /* The Moon was nearly new, so the Earth over Tranquility was nearly full
     and earthshine was near its strongest. This reads the same fact the
     elongation check reads, but through the shader's own uniform: if
     place() ever gets this sign backwards the dark limb goes black at new
     Moon and bright at full, which is exactly wrong, and which looks
     completely fine in any single still frame. */
  check("how full the Earth is, seen from the Moon", moon.uniforms.uEarthshine.value, 0.9, 1.0);

  moon.dispose();
}

/* The Moon must not be a child of earthGroup.

   earthGroup turns 108 times faster than the real planet, so that the
   surface visibly moves within a visit. A Moon parented to it would be
   swung right around the Earth a hundred times a day -- an error that would
   be obvious and that nobody would be able to name. Source check, in the
   same spirit as the rotation-rate check further up: what is being guarded
   is structural and has no numeric output to compare. */
{
  assert("the Moon hangs off the scene, not off the spinning Earth",
    /scene\.add\(moon\.mesh\)/.test(SCENE_SRC) && !/earthGroup\.add\(\s*moon/.test(SCENE_SRC));
}

/* =========================================================================
   THE LUNAR ACT
   =========================================================================

   Lunar orbit insertion to touchdown, which lunar.js and translunar.js call
   "the lunar act" in their own comments. Inside the interlude the reader's
   own u (0 at the top, 1 at the bottom) is not mission progress -- a day in
   orbit and the twelve minutes of the descent cannot share a scrollbar in
   proportion to their length -- so lunarMissionP(u, fromP) re-times it
   against a table of published moments, and everything below is either
   that map or something built on it: the mission clock, the feet's height
   above the ground, the camera's height above the ground, the lander's
   attitude, and Columbia's departure.

   fromP is where the page was when the interlude began -- 1.038 to 1.100
   across the viewports the layout supports -- and is threaded through the
   first two checks below for exactly that reason. None of this needs
   three.js or a DOM. lunarFrame and lunarCameraWorld are plain vector
   arithmetic, same as coastFrame and tourCameraWorld earlier in this file,
   so they are driven here directly rather than approximated. */

console.log("\nTHE LUNAR ACT\n");

const LUNAR_FROM_PS = [1.038, 1.057, 1.08, 1.1];

/* The re-timing only runs forward. u is a scroll position and has to read
   both ways, so lunarMissionP, and the mission clock it feeds through
   getSecondsAt, must never step backward -- at any of the four fromP a
   viewport can start the interlude at.

   It must also never jump. BEATS in lunar.js is piecewise-linear, so the
   largest change between two nearby samples is bounded by its steepest
   single segment -- poweredDescent to the start of the face-up yaw, about
   0.54 of p per unit of u -- times the sample spacing. At 2000 steps across
   u in [0,1] that segment alone produces a step of about 0.00027 in p and
   about 218 seconds of mission clock; measured directly below. The bounds
   given here are a little over four times those measured values: enough
   margin that a knot moving a little would not trip this, not so much that
   an actual break in the ramp -- two knots swapped, or a row duplicated --
   could hide inside it. */
for (const fromP of LUNAR_FROM_PS) {
  const SAMPLES = 2000;
  let pMonotone = true;
  let secondsMonotone = true;
  let worstPStep = 0;
  let worstSecondsStep = 0;
  let prevP = null;
  let prevSeconds = null;
  for (let i = 0; i <= SAMPLES; i++) {
    const u = i / SAMPLES;
    const p = lunarMissionP(u, fromP);
    const seconds = getSecondsAt(p);
    if (prevP !== null) {
      const dp = p - prevP;
      const dSeconds = seconds - prevSeconds;
      if (dp < -1e-9) pMonotone = false;
      if (dSeconds < -1e-6) secondsMonotone = false;
      worstPStep = Math.max(worstPStep, dp);
      worstSecondsStep = Math.max(worstSecondsStep, dSeconds);
    }
    prevP = p;
    prevSeconds = seconds;
  }
  assert(`lunarMissionP(u, ${fromP}) never runs backward`, pMonotone);
  assert(`the mission clock through it never runs backward, fromP=${fromP}`, secondsMonotone);
  check(`largest step in p between neighbouring samples, fromP=${fromP}`, worstPStep, 0, 0.001);
  check(`largest step in mission seconds between neighbouring samples, fromP=${fromP}`,
    worstSecondsStep, 0, 1000, "s");
}

/* Seven of BEATS's rows sit directly on named EVENTS rather than on a
   LANDER_TIMES moment read by pAtSeconds; these are those seven, and this
   is the check that they land exactly where they say. Every one of them is
   past u=0.3, where lunarMissionP stops referring to fromP at all -- see
   the function itself -- so the same seven knots are checked at all four
   fromP values below without four different expected answers to keep
   track of. */
{
  const KNOTS = [
    [0.3, "loiIgnition"],
    [0.34, "loiCutoff"],
    [0.54, "undock"],
    [0.62, "separation"],
    [0.66, "descentOrbit"],
    [0.76, "poweredDescent"],
    [0.94, "touchdown"],
  ];
  for (const fromP of LUNAR_FROM_PS) {
    for (const [u, key] of KNOTS) {
      check(`lunarMissionP(${u}, ${fromP}) lands on ${key}`, lunarMissionP(u, fromP) - at(key), -1e-9, 1e-9);
    }
  }
}

/* The feet's height above the ground. lunarRadiusAt tracks the vehicle's
   own middle, a hundred model metres above the engine plane and half the
   lander's own height above its feet (LANDER_HALF_KM, see the comment
   above it in translunar.js) -- so the feet's altitude is that radius, less
   the offset, less the Moon's own radius. It must never go below the
   ground, it must be exactly the ground at and after touchdown, it must
   pass through the published 50,000 ft at powered descent ignition, and it
   must never climb back up between descent orbit insertion and touchdown. */
{
  const FOOT_KM = 0.0003048;
  const feetKm = (p) => lunarRadiusAt(p) - LANDER_HALF_KM - MOON_RADIUS_KM;
  const fromP = LUNAR_FROM_PS[1]; // any of the four; the knot check above covers the other three

  const SAMPLES = 2000;
  let worstNegative = 0;
  for (let i = 0; i <= SAMPLES; i++) {
    const feet = feetKm(lunarMissionP(i / SAMPLES, fromP));
    worstNegative = Math.min(worstNegative, feet);
  }
  assert("feet altitude is never negative over u in [0,1]", worstNegative >= -1e-9,
    `worst ${worstNegative.toExponential(3)} km`);

  check("feet altitude at touchdown", feetKm(at("touchdown")), -1e-6, 1e-6, "km");
  check("feet altitude just past touchdown (u=1)", feetKm(lunarMissionP(1, fromP)), -1e-6, 1e-6, "km");
  check("feet altitude at powered descent ignition", feetKm(at("poweredDescent")),
    50000 * FOOT_KM - 0.001, 50000 * FOOT_KM + 0.001, "km");

  let worstIncrease = 0;
  const pA = at("descentOrbit");
  const pB = at("touchdown");
  let prevFeet = null;
  for (let i = 0; i <= SAMPLES; i++) {
    const feet = feetKm(pA + ((pB - pA) * i) / SAMPLES);
    if (prevFeet !== null) worstIncrease = Math.max(worstIncrease, feet - prevFeet);
    prevFeet = feet;
  }
  assert("feet altitude never climbs back up from descent orbit insertion to touchdown",
    worstIncrease <= 1e-9, `worst increase ${worstIncrease.toExponential(3)} km`);
}

/* The camera never dips into the ground. lunarFrame and lunarCameraWorld
   are the real functions scene.js calls every frame -- not restated here,
   driven -- against a made-up Moon rather than the real one, because the
   geometry does not care which Moon it is fed and a made-up one is easier
   to place at a round number. moonCentre and moonDir stand in for wherever
   the real Moon is; north only has to be some unit vector orthogonal to
   moonDir, since lunarFrame removes whatever component of it is not.

   scene.js itself builds `origin` from vehicle.stack's own world position,
   which needs a renderer and cannot be reproduced here. What is reproduced
   instead is what lunarFrame hands that same rig -- the position it says
   the vehicle is actually at -- which carries the same altitude and is all
   lunarCameraWorld's own ground clamp (GROUND_CLEARANCE_M in lunar.js) ever
   sees. Both lunarFrame and lunarCameraWorld ran cleanly under Node without
   this fallback, so the altitudeKm/riseM shortcut the brief allows for was
   not needed. */
{
  const moonCentre = [384400, 0, 0];
  const moonDir = [1, 0, 0]; // unit vector, Earth's centre to the Moon
  const north = [0, 1, 0]; // unit vector orthogonal to moonDir

  const fromP = LUNAR_FROM_PS[1];
  const SAMPLES = 2000;
  let worstMargin = Infinity;
  let worstU = 0;
  for (let i = 0; i <= SAMPLES; i++) {
    const u = 0.6 + (0.4 * i) / SAMPLES;
    const p = lunarMissionP(u, fromP);
    const flight = flightAt(p);
    const frame = lunarFrame(p, { moonCentre, moonDir, north });
    const cam = lunarCameraWorld(u, 16 / 9, {
      origin: frame.position,
      axis: frame.axis,
      moonCenter: moonCentre,
      kmPerVehicleMetre: flight.kmPerVehicleMetre,
      altitudeKm: frame.lunar.altitudeKm,
    });
    const d = Math.hypot(
      cam.position[0] - moonCentre[0],
      cam.position[1] - moonCentre[1],
      cam.position[2] - moonCentre[2]
    );
    const margin = d - MOON_RADIUS_KM;
    if (margin < worstMargin) {
      worstMargin = margin;
      worstU = u;
    }
  }
  check(`the lunar camera stays above the ground for u in [0.6, 1], worst at u=${worstU.toFixed(3)}`,
    worstMargin, 0, Infinity, "km");
}

/* The lander's attitude, read the way the renderer reads it -- off
   flightAt(p).parts.lm rather than off lander() or landerUpright()
   directly -- at the moments the comments above those functions in
   flight.js name explicitly, plus the one point on the pitch trace
   (Figure 5-5 of the Mission Report) that has an exact published fraction:
   about 55 degrees of the way from horizontal to standing, just before
   P64, which uprightAt reads as 35/90. */
{
  const lm = (p) => flightAt(p).parts.lm;

  check("lander roll at undock", lm(at("undock")).roll, 0, 0);
  check("lander inspect at undock", lm(at("undock")).inspect, 0, 0);
  check("lander roll at descent orbit insertion", lm(at("descentOrbit")).roll, 1, 1);
  check("lander inspect at descent orbit insertion", lm(at("descentOrbit")).inspect, 1, 1);
  check("lander faceUp at touchdown", lm(at("touchdown")).faceUp, 1, 1);
  check("lander upright at touchdown", lm(at("touchdown")).upright, 1, 1);

  const pP64 = pAtSeconds(LANDER_TIMES.p64);
  check("lander upright at P64", landerUpright(pP64), 35 / 90 - 1e-9, 35 / 90 + 1e-9);

  const SAMPLES = 2000;
  const pA = at("poweredDescent");
  const pB = at("touchdown");
  let worstDrop = 0;
  let prevUpright = null;
  for (let i = 0; i <= SAMPLES; i++) {
    const upright = landerUpright(pA + ((pB - pA) * i) / SAMPLES);
    if (prevUpright !== null) worstDrop = Math.min(worstDrop, upright - prevUpright);
    prevUpright = upright;
  }
  assert("landerUpright never falls back between powered descent and touchdown", worstDrop >= -1e-12,
    `worst step ${worstDrop.toExponential(3)}`);
}

/* Columbia. Its opacity has fully faded (fade ends 0.011 of the page after
   the separation burn, well before descent orbit insertion 0.0134 later)
   and separations.csm's own attached flag flips exactly at at("undock"):
   true at and before it, false the instant after. */
{
  check("csm opacity at descent orbit insertion", flightAt(at("descentOrbit")).parts.csm.opacity, 0, 1e-6);
  assert("csm is still attached just before undock", flightAt(at("undock") - 1e-6).parts.csm.attached);
  assert("csm is no longer attached just after undock", !flightAt(at("undock") + 1e-6).parts.csm.attached);
}

/* The clock stops at touchdown and holds. getSecondsAt is a makeRamp, which
   does not extrapolate past its last knot -- so scrolling into the last
   stretch of the interlude does not run the mission clock past
   102:45:39.9, and neither does scrolling past the end of the page. */
{
  check("mission clock at touchdown", getSecondsAt(at("touchdown")), 369939.9 - 1e-6, 369939.9 + 1e-6, "s");
  check("mission clock past touchdown", getSecondsAt(at("touchdown") + 0.05),
    369939.9 - 1e-6, 369939.9 + 1e-6, "s");
}

console.log(`\n${failures === 0 ? "All checks passed." : `${failures} CHECK(S) FAILED.`}\n`);
process.exit(failures === 0 ? 0 : 1);
