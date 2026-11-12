// Does the Mars window exhibit compute what an astrodynamics textbook would?
//
// The module under test derives its transfer time from the Sun's
// gravitational parameter (t = pi * sqrt(a^3 / mu)). This file gets the same
// quantity a different way, from Kepler's third law applied to Earth's own
// period, which uses no GM at all:
//
//     t = (P_earth / 2) * ((r_earth + r_mars) / (2 * r_earth))^(3/2)
//
// and gets the phase angle and synodic period from the two sidereal periods
// with plain arithmetic. If the two routes agree, the constants and the
// formulas are consistent with each other. The synodic period is also
// compared with the 779.94 days NASA's Mars fact sheet prints, and the
// Perseverance and Curiosity flight times with the dates on the mission
// pages, counted here with a separate day-counting routine.
//
// Then the behavioural claims the page depends on: a launch hits only when
// Mars is about 44 degrees ahead and misses badly elsewhere, the geometry
// repeats once per synodic period, angles wrap, nothing goes non-finite,
// reduced motion skips the animation, and the canvas draws every state.
//
// Run: node tools/mars-window-check.mjs

import * as T from "../public/assets/js/systems/transfer.js";

let failures = 0;
function ok(label, cond, detail = "") {
  if (!cond) failures++;
  console.log(`${cond ? "ok  " : "FAIL"}  ${label}${detail ? "  " + detail : ""}`);
}
function near(label, got, want, tol, unit = "") {
  const pass = Number.isFinite(got) && Math.abs(got - want) <= tol;
  ok(label, pass, `got ${got.toFixed(4)} ${unit} want ${want.toFixed(4)} +/- ${tol}`);
}

/* ---------- Independent derivations ---------- */

const rE = 149.598e6;
const rM = 227.956e6;
const PE = 365.256;
const PM = 686.98;

console.log("=== Transfer time, phase angle, synodic period ===\n");

const w = T.makeWorld({ startLeadDeg: 100 });

const tKepler3 = (PE / 2) * Math.pow((rE + rM) / (2 * rE), 1.5);
near("transfer days (GM route vs Kepler-3 route)", w.transfer.days, tKepler3, 0.5, "d");
near("transfer days, about 259", w.transfer.days, 259, 0.5, "d");

const phaseDeg = 180 - (360 / PM) * tKepler3;
near("required lead (deg)", T.toDeg(w.needLead), phaseDeg, 0.1, "deg");
near("required lead, about 44", T.toDeg(w.needLead), 44.3, 0.2, "deg");

const synodic = 1 / (1 / PE - 1 / PM);
near("synodic period (days)", w.synodic, synodic, 1e-6, "d");
near("synodic vs NASA fact sheet 779.94", w.synodic, T.SYNODIC_PUBLISHED_D, 0.05, "d");
near("synodic in months, about 25.6", w.synodic / T.DAYS_PER_MONTH, 25.6, 0.1, "mo");

near("eccentricity (r2-r1)/(r2+r1)", w.transfer.e, (rM - rE) / (rM + rE), 1e-12);
near("half-ellipse length, million km", T.pathLengthKm(w.transfer) / 1e6, 587, 2, "Mkm");

// The spacecraft leaves at Earth's distance and arrives at Mars's.
const c0 = T.craftAt(w.transfer, 0.7, 0);
const c1 = T.craftAt(w.transfer, 0.7, w.transfer.days);
near("craft radius at launch", c0.r, rE, 1, "km");
near("craft radius at arrival", c1.r, rM, 1, "km");
near("craft angle at arrival = launch + pi", T.wrap2pi(c1.angle), T.wrap2pi(0.7 + Math.PI), 1e-9);
// Vis-viva at launch: v^2 = mu (2/r - 1/a), checked against a finite
// difference of the position over a short time.
{
  const dt = 1e-3; // days
  const p0 = T.craftAt(w.transfer, 0, 0.0005);
  const p1 = T.craftAt(w.transfer, 0, 0.0005 + dt);
  const v = Math.hypot(p1.x - p0.x, p1.y - p0.y) / (dt * 86400);
  const r = p0.r;
  const visViva = Math.sqrt(w.transfer.mu * (2 / r - 1 / w.transfer.a));
  near("speed near launch vs vis-viva (km/s)", v, visViva, 0.01, "km/s");
}

console.log("\n=== Real flights, counted separately ===\n");

// Day counts done with plain integer calendar arithmetic, not Date.
const dayNumber = (y, m, d) => {
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
};
const curiosity = T.REAL_MISSIONS.find((m) => m.name === "Curiosity");
const perseverance = T.REAL_MISSIONS.find((m) => m.name === "Perseverance");
ok("Curiosity 26 Nov 2011 -> 6 Aug 2012 = 254 d",
  T.missionDays(curiosity) === dayNumber(2012, 8, 6) - dayNumber(2011, 11, 26) && T.missionDays(curiosity) === 254);
ok("Perseverance 30 Jul 2020 -> 18 Feb 2021 = 203 d (press kit: 203)",
  T.missionDays(perseverance) === dayNumber(2021, 2, 18) - dayNumber(2020, 7, 30) && T.missionDays(perseverance) === 203);
ok("Perseverance path (471 Mkm) is shorter than the Hohmann half-ellipse",
  perseverance.pathKm < T.pathLengthKm(w.transfer));

/* ---------- Hits and misses ---------- */

console.log("\n=== A hit exists at the right phase and nowhere else ===\n");

for (const startLead of [100, 20, 250]) {
  const world = T.makeWorld({ startLeadDeg: startLead });
  let best = { miss: Infinity, day: -1 };
  const hitDays = [];
  for (let d = 0; d <= 900; d += 0.05) {
    const f = T.flyby(world, d);
    if (f.missKm < best.miss) best = { miss: f.missKm, day: d };
    if (f.hit) hitDays.push(d);
  }
  const win = T.windowDays(world, 0, 900);
  ok(`start ${startLead} deg: best launch day matches windowDays()`,
    win.length > 0 && Math.abs(best.day - win[0]) < 0.06,
    `scan ${best.day.toFixed(2)} vs formula ${win[0]?.toFixed(2)}`);
  ok(`start ${startLead} deg: best miss is essentially zero`, best.miss < 0.2e6, `${(best.miss / 1e6).toFixed(3)} Mkm`);
  near(`start ${startLead} deg: lead at best day (deg)`, T.toDeg(T.leadAt(world, best.day)), T.toDeg(world.needLead), 0.1, "deg");
  // Only the first window; a 900-day scan can catch the next one too.
  const first = hitDays.filter((d) => Math.abs(d - win[0]) < 10);
  const width = first.length ? first[first.length - 1] - first[0] : 0;
  ok(`start ${startLead} deg: the hit window is narrow (about 2.7 days)`, width > 2 && width < 3.5, `${width.toFixed(2)} d`);
  // Whole-day launches, which is all the slider offers, always include a hit.
  const wholeHits = [];
  for (let d = 0; d <= 900; d++) if (T.flyby(world, d).hit) wholeHits.push(d);
  ok(`start ${startLead} deg: whole-day launches include a hit`, wholeHits.length >= 1, `days ${wholeHits.join(", ")}`);
  const off7 = Math.min(T.flyby(world, win[0] + 7).missKm, T.flyby(world, Math.max(0, win[0] - 7)).missKm);
  ok(`start ${startLead} deg: 7 days off misses by over 10 Mkm`, off7 > 10e6, `${(off7 / 1e6).toFixed(1)} Mkm`);
  if (win.length > 0) {
    const next = win[0] + world.synodic;
    const a = T.flyby(world, win[0]).missKm;
    const b = T.flyby(world, next).missKm;
    near(`start ${startLead} deg: window repeats after one synodic period (miss)`, b, a, 1000, "km");
  }
}

{
  // Day 0 in the two page starts misses, in the two different directions.
  const late = T.flyby(T.makeWorld({ startLeadDeg: 100 }), 0);
  const early = T.flyby(T.makeWorld({ startLeadDeg: 20 }), 0);
  ok("start 100: day 0 misses and the ship is late (Mars already gone past)", !late.hit && late.signedDeg > 0 && late.daysOff > 0,
    `${late.signedDeg.toFixed(1)} deg, ${late.daysOff.toFixed(0)} d`);
  ok("start 20: day 0 misses and the ship is early (Mars not there yet)", !early.hit && early.signedDeg < 0 && early.daysOff < 0,
    `${early.signedDeg.toFixed(1)} deg, ${early.daysOff.toFixed(0)} d`);
  near("daysOff = signed angle / Mars rate", late.daysOff, (late.signedDeg * Math.PI / 180) / w.nMars, 1e-9);
  near("miss distance is the chord", late.missKm, 2 * rM * Math.sin(Math.abs(late.signedDeg * Math.PI / 180) / 2), 1, "km");
}

/* ---------- Wrap-around ---------- */

console.log("\n=== Wrap-around ===\n");

ok("wrap2pi stays in [0, 2pi)", [-1e6, -7, -0.1, 0, 6.3, 1e6].every((a) => T.wrap2pi(a) >= 0 && T.wrap2pi(a) < 2 * Math.PI));
near("wrapPi(359 deg) is -1 deg", T.toDeg(T.wrapPi(T.toRad(359))), -1, 1e-9, "deg");
near("wrapPi(-181 deg) is 179 deg", T.toDeg(T.wrapPi(T.toRad(-181))), 179, 1e-9, "deg");
near("Earth angle repeats after one year", T.earthAngle(w, 400 + PE), T.earthAngle(w, 400), 1e-9);
near("Mars angle repeats after one Mars year", T.marsAngle(w, 10 + PM), T.marsAngle(w, 10), 1e-9);
ok("lead is in [0, 2pi) across ten years",
  Array.from({ length: 3650 }, (_, i) => T.leadAt(w, i)).every((a) => a >= 0 && a < 2 * Math.PI));
near("lead repeats after one synodic period", T.leadAt(w, 50 + w.synodic), T.leadAt(w, 50), 1e-9);
ok("a launch near the end of a Mars year still gives a finite miss",
  Number.isFinite(T.flyby(w, PM - 0.2).missKm) && Number.isFinite(T.flyby(w, 5 * PM).missKm));
ok("negative launch days clamp to day 0", T.flyby(w, -50).launchDay === 0);

/* ---------- Non-finite guards ---------- */

console.log("\n=== Non-finite guards ===\n");

const junk = [NaN, Infinity, -Infinity, undefined, null, "x"];
const allFinite = (o) => Object.values(o).every((v) => (typeof v === "number" ? Number.isFinite(v) : typeof v === "object" && v ? allFinite(v) : true));
ok("flyby() with junk days gives all-finite fields", junk.every((j) => allFinite(T.flyby(w, j))));
ok("craftAt() with junk times gives all-finite fields", junk.every((j) => allFinite(T.craftAt(w.transfer, j, j))));
ok("angles and lead with junk days are finite", junk.every((j) => Number.isFinite(T.earthAngle(w, j)) && Number.isFinite(T.marsAngle(w, j)) && Number.isFinite(T.leadAt(w, j))));
ok("makeWorld with junk start lead is finite", junk.every((j) => allFinite(T.makeWorld({ startLeadDeg: j }).transfer) && Number.isFinite(T.makeWorld({ startLeadDeg: j }).lead0)));
let threw = 0;
for (const args of [[0, 1], [5, 5], [5, 4], [1, NaN], [-1, 3]]) {
  try { T.hohmann(...args); } catch (e) { if (e instanceof RangeError) threw++; }
}
ok("hohmann() rejects impossible orbits", threw === 5, `${threw} of 5 rejected`);
ok("craftAt() is clamped to the flight", T.craftAt(w.transfer, 0, 1e9).t === w.transfer.days && T.craftAt(w.transfer, 0, -5).t === 0);
ok("windowDays() never returns a non-finite day", T.windowDays(w, 0, 5000).every(Number.isFinite));

/* ---------- Reduced motion and the clock ---------- */

console.log("\n=== Clock and reduced motion ===\n");

near("stepClock advances at the stated rate", T.stepClock(10, 300, 0.5, 40, false), 30, 1e-9, "d");
near("stepClock never overshoots", T.stepClock(299, 300, 1, 40, false), 300, 0, "d");
near("stepClock with reduced motion jumps to the target", T.stepClock(10, 300, 0.016, 40, true), 300, 0, "d");
ok("stepClock ignores negative or junk dt", T.stepClock(10, 300, -1, 40) === 10 && T.stepClock(10, 300, NaN, 40) === 10);

/* ---------- The canvas ---------- */

console.log("\n=== Canvas states ===\n");

function installDom({ width = 1000, height = 1000, dpr = 1, reduced = false } = {}) {
  const raf = [];
  const stats = { draws: 0, bad: [], frames: 0 };
  const noop = () => {};
  const gradient = { addColorStop: (o, c) => { if (!Number.isFinite(o) || /NaN|undefined/.test(String(c))) stats.bad.push("stop"); } };
  const store = {};
  const ctx = new Proxy(store, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (prop === "createRadialGradient" || prop === "createLinearGradient") {
        return (...a) => { if (a.some((v) => typeof v === "number" && !Number.isFinite(v))) stats.bad.push(String(prop)); return gradient; };
      }
      if (prop === "measureText") return () => ({ width: 10 });
      return (...a) => {
        if (a.some((v) => typeof v === "number" && !Number.isFinite(v))) stats.bad.push(`${String(prop)}(${a.join(",")})`);
        if (/^(fill|stroke|fillText|fillRect)$/.test(String(prop))) stats.draws++;
      };
    },
    set(t, prop, value) {
      if (typeof value === "string" && /NaN|undefined/.test(value)) stats.bad.push(`${String(prop)}=${value}`);
      t[prop] = value;
      return true;
    },
  });
  const canvas = {
    width: 300, height: 150, style: {},
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width, height, left: 0, top: 0 }),
    addEventListener: noop, removeEventListener: noop,
  };
  globalThis.window = { devicePixelRatio: dpr, innerWidth: width, innerHeight: height, matchMedia: () => ({ matches: reduced }), addEventListener: noop, removeEventListener: noop };
  globalThis.document = { hidden: false, addEventListener: noop, removeEventListener: noop };
  let now = 0;
  globalThis.performance = { now: () => now };
  globalThis.requestAnimationFrame = (cb) => { raf.push(cb); return raf.length; };
  globalThis.cancelAnimationFrame = noop;
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.IntersectionObserver = class { observe() {} disconnect() {} };
  return {
    canvas, stats, raf,
    step(ms = 16.7) { now += ms; const b = raf.splice(0); for (const cb of b) { stats.frames++; cb(now); } },
  };
}

const world = T.makeWorld({ startLeadDeg: 100 });
const hitDay = T.windowDays(world, 0, 900)[0];
const states = {
  "aim, no hint": { world, day: 0, mode: "aim", flight: null, showHint: false },
  "aim, hint": { world, day: 55, mode: "aim", flight: null, showHint: true },
  "mid-flight": (() => { const f = T.flyby(world, 0); return { world, day: 120, mode: "fly", flight: f, showHint: false }; })(),
  "result, miss": (() => { const f = T.flyby(world, 0); return { world, day: f.arriveDay, mode: "result", flight: f, showHint: true }; })(),
  "result, hit": (() => { const f = T.flyby(world, Math.round(hitDay)); return { world, day: f.arriveDay, mode: "result", flight: f, showHint: true }; })(),
  "fast-forward": { world, day: 500, mode: "ff", flight: null, showHint: true },
  "late in a long run": { world, day: 9000, mode: "ff", flight: null, showHint: true },
};
const sizes = [{ width: 1000, height: 1000 }, { width: 358, height: 358 }, { width: 120, height: 120 }];

// The first DOM must exist before the modules are imported: stage.js reads
// matchMedia at import time.
installDom();
const { mountMarsWindow } = await import("../public/assets/js/experiences/mars-window.js");
for (const [name, state] of Object.entries(states)) {
  for (const size of sizes) {
    const dom = installDom(size);
    const m = mountMarsWindow(dom.canvas, { getState: () => state });
    for (let i = 0; i < 30; i++) dom.step();
    ok(`${name} @ ${size.width}px draws finite coordinates`, dom.stats.draws > 0 && dom.stats.bad.length === 0,
      dom.stats.bad.length ? dom.stats.bad.slice(0, 2).join("; ") : `${dom.stats.draws} draws`);
    m.stage.destroy();
  }
}

{
  // Reduced motion: stage.js reads matchMedia once, at import, so a second
  // copy of it is loaded (via a query string) under a window that asks for
  // reduced motion. It must draw one frame and never request another.
  const dom = installDom({ reduced: true });
  const stageMod = await import("../public/assets/js/systems/stage.js?reduced=1");
  ok("Stage reports reduced motion when the window asks for it", stageMod.prefersReducedMotion === true);
  const stage = new stageMod.Stage(dom.canvas, { draw: (ctx) => ctx.fillRect(0, 0, 1, 1), update: () => {} });
  stage.start();
  for (let i = 0; i < 20; i++) dom.step();
  // The constructor's resize and start() each paint the static frame once;
  // what matters is that nothing is ever queued with requestAnimationFrame.
  ok("reduced motion: static frame drawn, no animation loop", dom.stats.draws >= 1 && dom.stats.draws <= 2 && dom.stats.frames === 0 && dom.raf.length === 0, `${dom.stats.draws} draw(s), ${dom.stats.frames} rAF frame(s), ${dom.raf.length} queued`);
  stage.destroy();
}

console.log(failures === 0 ? "\nAll Mars window checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
