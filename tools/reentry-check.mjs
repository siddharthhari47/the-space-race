// Does the Bring it home exhibit compute what its model says it computes?
//
// The module under test integrates a planar point-mass entry in polar
// coordinates. This file does five things to it.
//
//   1. Recomputes some of it a different way: a drag-free flight against the
//      conserved energy and angular momentum worked out by hand, a drag
//      number from the sourced constants typed in again here, and a whole
//      entry in Cartesian coordinates with a separate integrator.
//   2. Halves the step and asks whether the answers move. They have to move by
//      less than 1 percent, and no outcome may change.
//   3. Checks the shape the game relies on: steeper means more g, shallower
//      eventually skips, and nothing flips back.
//   4. Checks the bisection corridor against brute force, and that lift down
//      widens the shallow edge and lift up widens the steep edge.
//   5. Puts the Apollo 10 entry through the model and asks that the peak load
//      land near the 6.8 g NASA reports, and that the page says it is a model
//      value, not a measurement.
//
// Run: node tools/reentry-check.mjs

import { readFileSync } from "node:fs";
import * as R from "../public/assets/js/systems/reentry.js";

let failures = 0;
function ok(label, cond, detail = "") {
  if (!cond) failures++;
  console.log(`${cond ? "ok  " : "FAIL"}  ${label}${detail ? "  " + detail : ""}`);
}
function near(label, got, want, tol, unit = "") {
  const pass = Number.isFinite(got) && Math.abs(got - want) <= tol;
  ok(label, pass, `got ${got.toPrecision(6)} ${unit} want ${want.toPrecision(6)} +/- ${tol}`);
}
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

/* ---------- Constants typed in again from the sources ---------- */

// TN D-6725: 12,150 lb, 129.35 ft^2 (TN D-5399), Cd 1.2891, 400,000 ft.
const LB = 0.45359237;
const FT = 0.3048;
near("mass is 12,150 lb", R.MASS, 12150 * LB, 1, "kg");
near("reference area is 129.35 ft^2", R.AREA, 129.35 * FT * FT, 0.001, "m^2");
near("entry interface is 400,000 ft", R.H_INTERFACE, 400000 * FT, 1, "m");
near("Apollo 10 entry speed is 36,309.257 ft/s", R.V_MOON, 36309.257 * FT, 1, "m/s");
near("ballistic coefficient is m / (Cd A)", R.BETA, (12150 * LB) / (1.2891 * 129.35 * FT * FT), 0.5, "kg/m^2");
near("low-orbit speed is circular speed at the interface", R.V_LEO, Math.sqrt(3.986e14 / (6356766 + 121920)), 40, "m/s");

/* ---------- Atmosphere ---------- */

// Values from the standard atmosphere table (CR-150778 / USSA-1976), typed
// in here. The page's own join at 32 km has to match atmosphere.js.
near("density at 40 km, standard table", R.density(40000), 3.996e-3, 0.00008, "kg/m^3");
near("density at 60 km, standard table", R.density(60000), 3.097e-4, 0.00001, "kg/m^3");
near("density at 80 km, standard table", R.density(80000), 1.846e-5, 0.0000007, "kg/m^3");
{
  const lo = R.density(31999);
  const hi = R.density(32001);
  ok("density is continuous across the 32 km join", rel(lo, hi) < 0.002, `${lo} ${hi}`);
}
{
  let falling = true;
  for (let h = 0; h < 130000; h += 250) if (R.density(h + 250) > R.density(h)) falling = false;
  ok("density falls with height everywhere", falling);
}

/* ---------- 1. Independent recomputes ---------- */

// A drag-free flight keeps its energy and its angular momentum. A beta so
// large that drag is negligible should therefore leave speed and radius tied
// by the energy equation, and the lowest point of the path should be the
// perigee a by-hand orbit calculation gives.
{
  const mu = R.MU;
  const r0 = R.R_EARTH + R.H_INTERFACE;
  const v0 = R.V_MOON;
  const fpa = -5.0 * Math.PI / 180;
  const energy = v0 * v0 / 2 - mu / r0;
  const hAng = r0 * v0 * Math.cos(fpa);
  // perigee radius from r^2 v^2 = h^2 and the energy equation at v = h / r:
  //   energy = h^2 / (2 r^2) - mu / r  ->  r^2 energy + mu r - h^2 / 2 = 0
  const rp = (-mu + Math.sqrt(mu * mu + 2 * energy * hAng * hAng)) / (2 * energy);
  const run = R.fly({ fpa: -5.0, beta: 1e15, sampleEvery: 5, tMax: 900 });
  const lowest = Math.min(...run.path.map((p) => p.h + R.R_EARTH));
  near("drag-free perigee against by-hand orbit", lowest, rp, 600, "m");
  const drift = Math.max(...run.path.map((p) => {
    const r = p.h + R.R_EARTH;
    return Math.abs(p.v * p.v / 2 - mu / r - energy) / Math.abs(energy);
  }));
  ok("drag-free flight keeps its energy", drift < 1e-4, `drift ${drift.toExponential(2)}`);
  ok("drag-free flight at 5 degrees skips out (perigee above the air)", run.outcome === "skip" && rp - R.R_EARTH > 50000, `perigee ${(rp - R.R_EARTH) / 1000} km`);
}

// Drag by hand at one point: 60 km, 7 km/s. The exhibit's load factor for a
// no-lift capsule is rho v^2 / (2 beta g0).
{
  const rho = 3.097e-4; // standard table, 60 km
  const v = 7000;
  const beta = (12150 * LB) / (1.2891 * 129.35 * FT * FT);
  const g = (rho * v * v) / (2 * beta) / 9.80665;
  ok("drag by hand at 60 km and 7 km/s is about 2.2 g", g > 2.1 && g < 2.3, `${g.toFixed(2)} g`);
  // Cross-check against the module through a steep entry's sampled path:
  // find the sample nearest 60 km and compare g with rho v^2 / (2 beta g0)
  // worked out from that sample's own speed.
  const run = R.fly({ fpa: -6.0, mode: 0, sampleEvery: 0.5 });
  const p = run.path.reduce((a, b) => (Math.abs(b.h - 60000) < Math.abs(a.h - 60000) ? b : a));
  const byHand = (R.density(p.h) * p.v * p.v) / (2 * beta) / 9.80665;
  near("module's load at a sample equals rho v^2 / (2 beta g0)", p.g, byHand, byHand * 0.003, "g");
}

// A separate integrator: Cartesian coordinates, a different RK4 written here,
// the same density table and constants. It shares the physics but none of the
// polar bookkeeping, so a slip in the polar equations shows as a disagreement.
function cartesian(fpaDeg, { lift = 0, dt = 0.1 } = {}) {
  const beta = R.BETA;
  const mu = R.MU;
  const r0 = R.R_EARTH + R.H_INTERFACE;
  const fpa = fpaDeg * Math.PI / 180;
  // x along the starting horizontal, y radially up from Earth's centre.
  let s = [0, r0, R.V_MOON * Math.cos(fpa), R.V_MOON * Math.sin(fpa)];
  const f = (u) => {
    const r = Math.hypot(u[0], u[1]);
    const v = Math.hypot(u[2], u[3]);
    const rho = R.density(r - R.R_EARTH);
    const drag = (0.5 * rho * v * v) / beta;
    const gx = (-mu * u[0]) / (r * r * r);
    const gy = (-mu * u[1]) / (r * r * r);
    // lift acts perpendicular to the velocity, positive turns it away from
    // the Earth (the "up" side)
    const nx = -u[3] / v;
    const ny = u[2] / v;
    return [u[2], u[3], gx - (drag * u[2]) / v + lift * drag * nx, gy - (drag * u[3]) / v + lift * drag * ny];
  };
  let peak = 0;
  let t = 0;
  while (t < 3000) {
    const r = Math.hypot(s[0], s[1]);
    const v = Math.hypot(s[2], s[3]);
    const h = r - R.R_EARTH;
    const rho = R.density(h);
    const g = (0.5 * rho * v * v) / beta * Math.sqrt(1 + lift * lift) / 9.80665;
    if (g > peak) peak = g;
    if (h <= 0) return { outcome: peak > R.G_LIMIT ? "over" : "safe", peak };
    const vr = (s[0] * s[2] + s[1] * s[3]) / r;
    if (t > 0 && h > R.H_INTERFACE && vr > 0) return { outcome: "skip", peak };
    const k1 = f(s);
    const k2 = f(s.map((x, i) => x + 0.5 * dt * k1[i]));
    const k3 = f(s.map((x, i) => x + 0.5 * dt * k2[i]));
    const k4 = f(s.map((x, i) => x + dt * k3[i]));
    s = s.map((x, i) => x + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
    t += dt;
  }
  return { outcome: "skip", peak };
}
for (const [fpa, lift] of [[-6.0, 0], [-6.616, 0], [-7.0, 0], [-6.616, R.LD_APOLLO]]) {
  const mine = R.fly({ fpa, mode: lift ? 1 : 0 });
  const theirs = cartesian(fpa, { lift });
  ok(`Cartesian recompute at ${fpa} deg${lift ? " lift up" : ""}: same outcome`, mine.outcome === theirs.outcome, `${mine.outcome} ${theirs.outcome}`);
  ok(`Cartesian recompute at ${fpa} deg${lift ? " lift up" : ""}: peak load within 1%`, rel(mine.peakG, theirs.peak) < 0.01, `${mine.peakG.toFixed(2)} vs ${theirs.peak.toFixed(2)}`);
}

/* ---------- Sutton-Graves by hand ---------- */

{
  // q = K sqrt(p_s / R_n) * v^2 / 2 with p_s in atm, R_n in m, q in W/m^2.
  const rho = 2e-4;
  const v = 9000;
  const ps = (rho * v * v) / 101325;
  const byHand = 0.1262 * Math.sqrt(ps / 4.661) * 0.5 * v * v / 1e4;
  // find a path point with that rho and v is not possible; instead check the
  // formula's scaling in the module: heating goes as sqrt(rho) v^3.
  const run = R.fly({ fpa: -6.5, sampleEvery: 0.5 });
  const p = run.path.reduce((a, b) => (b.q > a.q ? b : a));
  const mine = 0.1262 * Math.sqrt((R.density(p.h) * p.v * p.v) / 101325 / 4.661) * 0.5 * p.v * p.v / 1e4;
  near("module's peak heating matches Sutton-Graves worked by hand", p.q, mine, mine * 0.001, "W/cm^2");
  ok("heating is of the order a lunar return gives (hundreds of W/cm^2)", run.peakHeat > 100 && run.peakHeat < 2000, `${run.peakHeat.toFixed(0)} W/cm^2`);
  ok("hand number for 9 km/s at 2e-4 kg/m^3 is finite", Number.isFinite(byHand));
}

/* ---------- 2. Halving the step ---------- */

{
  // Away from the edges, where a tiny change in the answer could not flip the
  // outcome in the first place: angles whose outcome is not marginal.
  const angles = [-4.5, -5.0, -5.8, -6.0, -6.4, -6.616, -7.0, -7.5, -8.5];
  for (const mode of [0, 1, -0.5]) {
    let worst = 0;
    let flips = 0;
    for (const fpa of angles) {
      const a = R.fly({ fpa, mode, dt: 0.25 });
      const b = R.fly({ fpa, mode, dt: 0.125 });
      if (a.outcome !== b.outcome) flips++;
      if (a.outcome !== "skip") worst = Math.max(worst, rel(a.peakG, b.peakG));
    }
    ok(`halving the step never changes an outcome (roll ${mode})`, flips === 0, `${flips} flips`);
    ok(`halving the step moves peak load by less than 1% (roll ${mode})`, worst < 0.01, `worst ${(worst * 100).toFixed(4)}%`);
  }
  const c1 = R.corridor({ mode: 0, dt: 0.25 });
  const c2 = R.corridor({ mode: 0, dt: 0.125 });
  ok("halving the step moves the corridor edges by less than 0.01 degree",
    Math.abs(c1.shallow - c2.shallow) < 0.01 && Math.abs(c1.steep - c2.steep) < 0.01,
    `${c1.shallow.toFixed(4)} ${c2.shallow.toFixed(4)} | ${c1.steep.toFixed(4)} ${c2.steep.toFixed(4)}`);
}

/* ---------- The density above the sourced table ---------- */

{
  // Above 86 km the table ends and the exhibit's own exponential takes over.
  // Cut it off entirely and the peak load, which happens far lower, should
  // barely move.
  const cut = (fpa) => {
    // fly() reads density() with the extension on; rebuild the run with a
    // local integrator that uses the cut-off density instead.
    const beta = R.BETA;
    const mu = R.MU;
    let s = [R.R_EARTH + R.H_INTERFACE, 0, R.V_MOON, fpa * Math.PI / 180];
    const f = (u) => {
      const rho = R.density(u[0] - R.R_EARTH, { extension: false });
      const drag = (0.5 * rho * u[2] * u[2]) / beta;
      const g = mu / (u[0] * u[0]);
      return [u[2] * Math.sin(u[3]), (u[2] * Math.cos(u[3])) / u[0], -drag - g * Math.sin(u[3]), (u[2] / u[0] - g / u[2]) * Math.cos(u[3])];
    };
    let peak = 0;
    for (let t = 0; t < 3000; t += 0.25) {
      const rho = R.density(s[0] - R.R_EARTH, { extension: false });
      peak = Math.max(peak, (0.5 * rho * s[2] * s[2]) / beta / 9.80665);
      if (s[0] <= R.R_EARTH) break;
      const k1 = f(s);
      const k2 = f(s.map((x, i) => x + 0.125 * k1[i]));
      const k3 = f(s.map((x, i) => x + 0.125 * k2[i]));
      const k4 = f(s.map((x, i) => x + 0.25 * k3[i]));
      s = s.map((x, i) => x + (0.25 / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
    }
    return peak;
  };
  for (const fpa of [-6.0, -6.616]) {
    const withExt = R.fly({ fpa, mode: 0 }).peakG;
    const without = cut(fpa);
    ok(`cutting the density extension moves peak load by under 1% at ${fpa} deg`, rel(withExt, without) < 0.01, `${withExt.toFixed(2)} vs ${without.toFixed(2)}`);
  }
}

/* ---------- 3. Monotonic behaviour ---------- */

{
  for (const mode of [0, 1]) {
    // Peak load against angle. Just steeper than the skip edge a no-lift
    // capsule dips, climbs out, and comes down again for a second and harder
    // dip a long time later, so the peak load FALLS over the first few tenths
    // of a degree after the edge. That is real behaviour of the model (the
    // flight takes 700 s instead of 350) and the page says so. From the
    // angle where the peak is lowest, steeper must never give less.
    const rows = [];
    for (let a = 4.0; a <= 9.0001; a += 0.1) rows.push({ a, ...R.fly({ fpa: -a, mode }) });
    const safeRows = rows.filter((r) => r.outcome !== "skip");
    const iMin = safeRows.reduce((m, r, i) => (r.peakG < safeRows[m].peakG ? i : m), 0);
    let monotone = true;
    for (let i = iMin + 1; i < safeRows.length; i++) if (safeRows[i].peakG < safeRows[i - 1].peakG - 1e-9) monotone = false;
    const before = safeRows.slice(0, iMin);
    const grazing = before.every((r) => r.tEnd > 1.1 * safeRows[iMin].tEnd);
    const rank = { skip: 0, safe: 1, over: 2 };
    let lastRank = 0;
    let outcomeOrderOk = true;
    let seq = "";
    for (const r of rows) {
      if (rank[r.outcome] < lastRank) outcomeOrderOk = false;
      lastRank = rank[r.outcome];
      seq += r.outcome[0];
    }
    ok(`from the lowest peak on, steeper entries never give a lower peak load (roll ${mode})`, monotone, `lowest at ${safeRows[iMin].a.toFixed(1)} deg`);
    ok(`any fall in peak load beyond the skip edge is a long skip-and-return flight (roll ${mode})`, grazing, `${before.length} grazing angles`);
    ok(`outcomes run skip, safe, over in that order as the angle steepens (roll ${mode})`, outcomeOrderOk, seq);
    ok(`a shallow enough entry skips and a steep enough one is over (roll ${mode})`, seq[0] === "s" && seq.endsWith("o"), seq);
  }
}

/* ---------- 4. Bisection against brute force ---------- */

{
  const bis = R.corridor({ mode: 0 }, 0.001);
  // Brute force over the interesting range only, at 0.01 degree steps.
  let shallow = null;
  let steep = null;
  for (let a = 4.5; a <= 8.0001; a += 0.01) {
    const out = R.fly({ fpa: -a, mode: 0 }).outcome;
    if (out === "safe") {
      if (shallow === null) shallow = -a;
      steep = -a;
    }
  }
  ok("brute force found a safe window", shallow !== null);
  near("shallow edge: bisection against brute force", bis.shallow, shallow, 0.012, "deg");
  near("steep edge: bisection against brute force", bis.steep, steep, 0.012, "deg");
  const small = R.corridorBrute({ mode: 0 }, 0.05);
  near("corridorBrute() agrees at a coarse step (shallow)", small.shallow, bis.shallow, 0.06, "deg");
  near("corridorBrute() agrees at a coarse step (steep)", small.steep, bis.steep, 0.06, "deg");
  ok("no-lift corridor is open on neither side at the Moon's speed", !bis.open && bis.width > 0.3 && bis.width < 1.5, `width ${bis.width.toFixed(3)} deg`);
}

/* ---------- Lift ---------- */

{
  const none = R.corridor({ mode: 0 });
  const up = R.corridor({ mode: 1 });
  const down = R.corridor({ mode: -0.5 });
  ok("lift down moves the shallow edge shallower than no lift", down.shallow > none.shallow, `${down.shallow.toFixed(3)} vs ${none.shallow.toFixed(3)}`);
  ok("lift up moves the steep edge steeper than no lift", up.steep < none.steep, `${up.steep.toFixed(3)} vs ${none.steep.toFixed(3)}`);
  ok("lift up does not move the shallow edge shallower (it skips sooner)", up.shallow <= none.shallow + 0.01, `${up.shallow.toFixed(3)} vs ${none.shallow.toFixed(3)}`);
  const any = R.corridorAnyRoll({});
  ok("choosing the roll widens the corridor more than any one setting", any.width > none.width * 2 && any.width > up.width && any.width > down.width, `${any.width.toFixed(2)} vs ${none.width.toFixed(2)}`);
  ok("the union's steep edge comes from lift up", any.steepRoll > 0, `roll ${any.steepRoll}`);
  ok("the union's shallow edge comes from lift down", any.shallowRoll < 0, `roll ${any.shallowRoll}`);
}

/* ---------- Low Earth orbit ---------- */

{
  const leo = R.corridor({ mode: 0, speed: R.V_LEO });
  const moon = R.corridor({ mode: 0 });
  ok("low-orbit entry has no skip edge in this model", leo.open, `shallow ${leo.shallow}`);
  ok("low-orbit steep edge is shallower than the Moon's", leo.steep > moon.steep, `${leo.steep.toFixed(2)} vs ${moon.steep.toFixed(2)}`);
}

/* ---------- 5. Apollo 10 and the page ---------- */

{
  const a10 = R.fly({ fpa: R.FPA_APOLLO10, mode: 1, sampleEvery: 1 });
  // A roll held up for the whole entry skips out at this angle: Apollo's
  // guidance rolled the lift as it went, which this exhibit does not model.
  // So only the first peak is compared with the flown one.
  ok("a roll held fully up for the whole entry skips out at Apollo 10's angle", a10.outcome === "skip", a10.outcome);
  // Real: 6.8 g (TN D-6725 reports 6.8 g for Apollo 10's first peak; Coming
  // Home gives 6.78). The model is a point mass with a constant ballistic
  // coefficient, so a few tenths to a couple of g either way is what it
  // earns; 5 to 9 g is the plausible range this check holds it to.
  ok("Apollo 10's modelled peak load is in the plausible range around 6.8 g", a10.peakG > 5 && a10.peakG < 9, `${a10.peakG.toFixed(2)} g`);
  const none = R.fly({ fpa: R.FPA_APOLLO10, mode: 0 });
  ok("without lift the same entry is over the 12 g limit", none.outcome === "over", `${none.peakG.toFixed(1)} g`);
  ok("rolling the lift up roughly halves the peak load at the same angle", a10.peakG < none.peakG * 0.6, `${a10.peakG.toFixed(1)} vs ${none.peakG.toFixed(1)}`);
}

{
  const html = readFileSync(new URL("../public/space-lab/reentry.html", import.meta.url), "utf8");
  ok("page says this is a simplified model", /simplified model/i.test(html));
  ok("page says its figures are model values", /model value/i.test(html) || /model output/i.test(html));
  ok("page lists the model's simplifications (point mass, planar, non-rotating)", /point mass/i.test(html) && /planar|flat plane|one plane/i.test(html) && /non-rotating|does not rotate|not rotating/i.test(html));
  const js = readFileSync(new URL("../public/assets/js/pages/reentry.js", import.meta.url), "utf8");
  ok("results table labels model values apart from mission numbers", /model value/i.test(js));
}

{
  // The layer table above 32 km is typed in from the 1976 standard, not read
  // from the opened scan, so hold it to its own physics: each base density
  // must follow from the layer below by the hydrostatic formula.
  const AF = 34.16319474;
  const L = [[32, 228.65, 2.8, 1.3225e-2], [47, 270.65, 0, 1.4275e-3], [51, 270.65, -2.8, 8.616e-4], [71, 214.65, -2.0, 6.4211e-5]];
  const up = (l, H) => {
    const dh = H - l[0];
    if (l[2] === 0) return l[3] * Math.exp((-AF * dh) / l[1]);
    return l[3] * Math.pow(l[1] / (l[1] + l[2] * dh), 1 + AF / l[2]);
  };
  let worst = 0;
  for (let i = 0; i < 3; i++) worst = Math.max(worst, Math.abs(up(L[i], L[i + 1][0]) / L[i + 1][3] - 1));
  ok("layer base densities follow from each other by the hydrostatic formula", worst < 2e-4, `worst ${worst.toExponential(2)}`);
  const hGeo = 47000;
  const hGeom = (6356766 * hGeo) / (6356766 - hGeo);
  const rho47 = R.density(hGeom);
  ok("density at 47 km geopotential matches the table value", Math.abs(rho47 / 1.4275e-3 - 1) < 2e-3, `${rho47}`);
}

console.log(failures === 0 ? "\nAll re-entry checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
