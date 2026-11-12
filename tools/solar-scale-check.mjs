// Does the Solar System to scale exhibit print the numbers it should?
//
// The module under test stores c in km/s and the AU in km and divides. This
// file recomputes the light times the long way, in metres and seconds from
// the defining values (c = 299 792 458 m/s exact, NIST CODATA; 1 au =
// 149 597 870 700 m exact, IAU 2012 B2), and from the fact-sheet distances
// typed in again here rather than imported, so a slip in either copy shows up
// as a disagreement. It also checks two figures everyone knows to the second:
// light from the Sun reaches 1 au in 499.0 s, about 8 min 19 s, and Neptune
// in a little over four hours.
//
// Then the behaviour the page leans on: the px <-> km mapping round-trips,
// positions are monotonic from the Sun outwards, the walk ends exactly on
// Neptune, the photon clock agrees with the distance clock, the predictions
// score the answer the numbers say is right, durations format the way the
// page prints them, and the rail labels on the strip never print on top of
// each other.
//
// Run: node tools/solar-scale-check.mjs

import * as S from "../public/assets/js/systems/solar-scale.js";

let failures = 0;
function ok(label, cond, detail = "") {
  if (!cond) failures++;
  console.log(`${cond ? "ok  " : "FAIL"}  ${label}${detail ? "  " + detail : ""}`);
}
function near(label, got, want, tol, unit = "") {
  const pass = Number.isFinite(got) && Math.abs(got - want) <= tol;
  ok(label, pass, `got ${Number(got).toFixed(4)} ${unit} want ${want.toFixed(4)} +/- ${tol}`);
}

/* ---------- Constants against their definitions ---------- */

console.log("=== Defining constants ===\n");

const C_M_S = 299792458;
const AU_M = 149597870700;
ok("c is the CODATA exact value", S.C_KM_S * 1000 === C_M_S, `${S.C_KM_S} km/s`);
ok("au is the IAU 2012 B2 exact value", Math.round(S.AU_KM * 1000) === AU_M, `${S.AU_KM} km`);
ok("Sun diameter is twice the 695,700 km fact-sheet radius", S.SUN_DIAMETER_KM === 1391400);

// Fact sheet "Distance from Sun (10^6 km)" and "Diameter (km)", typed in again.
const SHEET = {
  Mercury: [57.9, 4879], Venus: [108.2, 12104], Earth: [149.6, 12756], Mars: [228.0, 6792],
  Jupiter: [778.5, 142984], Saturn: [1432.0, 120536], Uranus: [2867.0, 51118], Neptune: [4515.0, 49528],
};
ok("eight planets, in order out from the Sun", S.PLANETS.map((p) => p.name).join() === Object.keys(SHEET).join());
for (const p of S.PLANETS) {
  const [dist, diam] = SHEET[p.name];
  ok(`${p.name} matches the fact sheet`, Math.abs(p.distanceKm - dist * 1e6) < 1 && p.diameterKm === diam,
    `${p.distanceKm / 1e6} x 10^6 km, ${p.diameterKm} km`);
}

/* ---------- Light times, recomputed in SI ---------- */

console.log("\n=== Light times ===\n");

near("1 au takes 499.0 s", AU_M / C_M_S, 499.005, 0.001, "s");
near("module: light time over 1 au", S.lightSeconds(S.AU_KM), AU_M / C_M_S, 1e-9, "s");
for (const p of S.PLANETS) {
  const t = (SHEET[p.name][0] * 1e9) / C_M_S;
  near(`${p.name} light time`, S.lightSeconds(p.distanceKm), t, 1e-6, "s");
}
const earthT = S.lightSeconds(S.PLANETS[2].distanceKm);
ok("Earth's light time prints as 8 min 19 s", S.formatDuration(earthT) === "8 min 19 s", S.formatDuration(earthT));
const nepH = S.lightSeconds(S.NEPTUNE.distanceKm) / 3600;
// The fact sheet's 4,515.0 million km gives 4.183 h. The tolerance is tight
// on purpose, so a changed Neptune distance has to be noticed here.
near("Neptune light time in hours, 4.183", nepH, 4.1834, 0.002, "h");
ok("Neptune's light time prints as 4 h 11 min 0 s", S.formatFixed(S.lightSeconds(S.NEPTUNE.distanceKm)) === "4 h 11 min 0 s",
  S.formatFixed(S.lightSeconds(S.NEPTUNE.distanceKm)));
near("Mars at its closest: radio time", S.lightSeconds(S.MARS_EARTH_MIN_KM), 54.6e9 / C_M_S, 1e-6, "s");
ok("Mars closest prints as 3 min 2 s", S.formatFixed(S.lightSeconds(S.MARS_EARTH_MIN_KM)) === "3 min 2 s");
ok("Mars farthest prints as 22 min 19 s", S.formatFixed(S.lightSeconds(S.MARS_EARTH_MAX_KM)) === "22 min 19 s",
  S.formatFixed(S.lightSeconds(S.MARS_EARTH_MAX_KM)));

/* ---------- The scale ---------- */

console.log("\n=== Scale mapping ===\n");

near("Sun is 40 px across", S.kmToPx(S.SUN_DIAMETER_KM), 40, 1e-9, "px");
near("km per px", S.KM_PER_PX, 1391400 / 40, 1e-9, "km");
near("Earth is about a third of a pixel", S.sizePx(S.PLANETS[2]), 12756 / 34785, 1e-9, "px");
ok("Earth is under half a pixel (the point of the exhibit)", S.sizePx(S.PLANETS[2]) < 0.5);
near("walk ends on Neptune", S.WALK_PX, 4515e6 / 34785, 1e-6, "px");

let roundTrip = 0;
for (const km of [0, 1, 1e3, 57.9e6, 149.6e6, 1e9, 4515e6, 123456789.123]) {
  roundTrip = Math.max(roundTrip, Math.abs(S.pxToKm(S.kmToPx(km)) - km));
}
ok("px <-> km round trip", roundTrip < 1e-6, `worst ${roundTrip.toExponential(2)} km`);
let pxRound = 0;
for (const px of [0, 0.37, 40, 4300.65, 22380, 129798.8]) pxRound = Math.max(pxRound, Math.abs(S.kmToPx(S.pxToKm(px)) - px));
ok("km <-> px round trip", pxRound < 1e-9, `worst ${pxRound.toExponential(2)} px`);

const pos = S.PLANETS.map((p) => S.kmToPx(p.distanceKm));
ok("positions increase strictly outwards", pos.every((v, i) => i === 0 || v > pos[i - 1]), pos.map((v) => v.toFixed(0)).join(" < "));
ok("Mercury is outside the Sun's disc", pos[0] > S.SUN_PX / 2);
let mono = true;
for (let km = 0, last = -1; km <= S.WALK_KM; km += S.WALK_KM / 997) {
  const px = S.kmToPx(km);
  if (!(px > last)) mono = false;
  last = px;
}
ok("kmToPx is monotonic over the walk", mono);
ok("clampKm holds the walk", S.clampKm(-5) === 0 && S.clampKm(1e12) === S.WALK_KM && S.clampKm(NaN) === 0);
ok("non-finite input gives 0, not NaN", S.kmToPx(NaN) === 0 && S.pxToKm(Infinity) === 0 && S.lightSeconds(undefined) === 0);
near("light at this scale, px/s", S.LIGHT_PX_PER_S, 299792.458 / 34785, 1e-9, "px/s");

/* ---------- Photon ---------- */

console.log("\n=== Photon race ===\n");

near("photon at 1x after 499.005 s is at 1 au", S.photonKm(AU_M / C_M_S, 1), S.AU_KM, 1e-3, "km");
near("photon at 1000x reaches 1 au in 0.499 s", S.photonKm(AU_M / C_M_S / 1000, 1000), S.AU_KM, 1e-3, "km");
ok("photon stops at Neptune", S.photonKm(1e9, 1000) === S.WALK_KM);
near("the photon clock and the distance clock agree",
  S.lightSeconds(S.photonKm(3000, 1)), 3000, 1e-9, "s");
// The page's own update rule, photonAt, run the way the page runs it: a
// segment at 1x, then a speed change, with the photon worked out from the
// clock. A frame at 0.1 s and one after a 300 s gap (a background tab) must
// land in the same place as one long frame would, so nothing is lost to
// skipped frames.
{
  const seg1 = S.photonAt(0, 120, 1);
  near("photonAt: 120 s at 1x", seg1, 120 * 299792.458, 1e-6, "km");
  const after = S.photonAt(seg1, 0.5, 100);
  near("photonAt: then 0.5 s at 100x", after, 170 * 299792.458, 1e-6, "km");
  const hidden = S.photonAt(0, 300, 1);
  const stepped = [0.1, 0.2, 300].map((t) => S.photonAt(0, t, 1));
  near("photonAt: a 300 s gap still lands on 300 light-seconds", stepped[2], hidden, 1e-9, "km");
  ok("photonAt stops at Neptune when a segment starts partway out", S.photonAt(4000e6, 1e6, 1000) === S.WALK_KM);
  ok("photonAt ignores negative time", S.photonAt(1e6, -5, 1) === 1e6);
  near("raceSeconds: Earth at 1x is 499 s", S.raceSeconds(S.PLANETS[2].distanceKm, 1), 149.6e9 / C_M_S, 1e-6, "s");
  near("raceSeconds: Earth at 100x", S.raceSeconds(S.PLANETS[2].distanceKm, 100), 149.6e9 / C_M_S / 100, 1e-9, "s");
}
// At 1000x, the time to Neptune the page promises is about 15 s.
near("1000x Sun to Neptune, wall seconds", S.lightSeconds(S.WALK_KM) / 1000, 15.06, 0.01, "s");

/* ---------- Where you are ---------- */

console.log("\n=== Position words ===\n");

ok("next planet from the Sun is Mercury", S.nextPlanet(0)?.name === "Mercury");
ok("next planet just past Earth is Mars", S.nextPlanet(150e6)?.name === "Mars");
ok("no next planet at Neptune", S.nextPlanet(S.WALK_KM) === null);
ok("last planet passed at 800 million km is Jupiter", S.lastPlanet(800e6)?.name === "Jupiter");
ok("nothing passed before Mercury", S.lastPlanet(10e6) === null);
ok("planetNear finds Saturn within a window", S.planetNear(1432.3e6, 0.5e6)?.name === "Saturn");

/* ---------- Predictions ---------- */

console.log("\n=== Predictions ===\n");

near("Earth is about 107.5 Sun-widths out", S.sunWidthsOut(S.PLANETS[2]), 149.6e6 / 1391400, 1e-9);
ok("bead question: right answer is about 1 m", S.correctChoice("bead")?.id === "1m", S.correctChoice("bead")?.label);
ok("Neptune question: right answer is about 4 hours", S.correctChoice("neptune")?.id === "4h", S.correctChoice("neptune")?.label);
ok("unknown question gives null", S.correctChoice("pluto") === null);
const filled = S.filledFraction() * 100;
near("bodies cover about 0.04% of the line", filled, ((1391400 + 4879 + 12104 + 12756 + 6792 + 142984 + 120536 + 51118 + 49528) / 4515e6) * 100, 1e-12, "%");

/* ---------- Formatting ---------- */

console.log("\n=== Formatting ===\n");

const fmt = [[0, "0 s"], [59.9, "59 s"], [60, "1 min 0 s"], [3599, "59 min 59 s"], [3600, "1 h 0 min 0 s"], [-4, "0 s"], [NaN, "0 s"]];
ok("formatFixed rounds 360.9 s to 6 min 1 s", S.formatFixed(360.9) === "6 min 1 s", S.formatFixed(360.9));
for (const [x, want] of fmt) ok(`formatDuration(${x})`, S.formatDuration(x) === want, `"${S.formatDuration(x)}"`);
ok("lightMinuteLabel", S.lightMinuteLabel(8) === "8 min" && S.lightMinuteLabel(60) === "1 h" && S.lightMinuteLabel(251) === "4 h 11 min");

/* ---------- Rail labels ---------- */

console.log("\n=== Rail labels ===\n");

// The label is 16 px tall, centred on its mark (see .ss-mark in
// solar-scale.css). Two labelled marks closer than that would overprint.
const marks = S.railMarks();
const labelled = marks.filter((m) => m.text);
let clash = 0;
for (let i = 1; i < labelled.length; i++) {
  if (labelled[i].px - labelled[i - 1].px < 16) {
    clash++;
    console.log(`      "${labelled[i - 1].text}" and "${labelled[i].text}" are ${(labelled[i].px - labelled[i - 1].px).toFixed(1)} px apart`);
  }
}
ok("no two rail labels overprint", clash === 0, `${labelled.length} labels, ${marks.length - labelled.length} ticks without text`);
ok("one AU mark per whole AU to Neptune", marks.filter((m) => m.kind === "au").length === Math.floor(S.WALK_KM / S.AU_KM));
ok("no rail mark beyond Neptune", marks.every((m) => m.px <= S.WALK_PX + 1e-9));

console.log(failures === 0 ? "\nAll solar scale checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
