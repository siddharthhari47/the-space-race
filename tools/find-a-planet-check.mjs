// Does the Find a planet exhibit compute what the transit equation says?
//
// The module under test holds the fact-sheet radii and works depths out from
// them. This file types the same fact-sheet numbers in again by hand and does
// the arithmetic here, so a slip in either place shows up as a disagreement:
// Jupiter crossing the Sun should dim it by about 1.06%, Earth by about
// 84 parts per million. The real exoplanets are checked the same way: the
// archive's own measured depths should sit near (Rp/R*)^2 worked out from the
// archive's radii, within the slack limb darkening and the archive's mixing
// of references allow.
//
// Then the claims the game rests on. A depth turns back into the radius it
// came from. Folding a light curve at the right period recovers the planted
// depth to within a few times noise/sqrt(N), while a wrong period loses it.
// Level 3's planet is lost in one transit and clear after all of them. Two
// neighbouring dips give the period and two with a dip between them are
// rejected. The noise generator gives the same numbers for the same seed
// and different ones for a different seed.
//
// Run: node tools/find-a-planet-check.mjs

import * as T from "../public/assets/js/systems/transit.js";

let failures = 0;
function ok(label, cond, detail = "") {
  if (!cond) failures++;
  console.log(`${cond ? "ok  " : "FAIL"}  ${label}${detail ? "  " + detail : ""}`);
}
function near(label, got, want, tol, unit = "") {
  const pass = Number.isFinite(got) && Math.abs(got - want) <= tol;
  ok(label, pass, `got ${got.toPrecision(6)} ${unit} want ${want.toPrecision(6)} +/- ${tol}`);
}

/* ---------- Independent recompute from the fact sheets ---------- */

// Typed from the NSSDCA fact sheets, not imported.
const sunKm = 695700;      // Sun, volumetric mean radius
const earthKm = 6378.137;  // Earth, equatorial radius
const jupKm = 71492;       // Jupiter, equatorial radius at 1 bar

ok("Sun radius matches the fact sheet", T.R_SUN_KM === sunKm);
ok("Earth radius matches the fact sheet", T.R_EARTH_KM === earthKm);
ok("Jupiter radius matches the fact sheet", T.R_JUPITER_KM === jupKm);
ok("Earth period matches the fact sheet", T.P_EARTH_D === 365.256);
ok("Jupiter period matches the fact sheet", T.P_JUPITER_D === 4332.589);

const jDepth = (jupKm * jupKm) / (sunKm * sunKm);
const eDepth = (earthKm * earthKm) / (sunKm * sunKm);
near("Jupiter across the Sun, by hand", jDepth * 100, 1.056, 0.001, "%");
near("Earth across the Sun, by hand", eDepth * 1e6, 84.05, 0.05, "ppm");
near("Jupiter across the Sun, module", T.depthFromRadii(T.R_JUPITER_KM), jDepth, 1e-12);
near("Earth across the Sun, module", T.depthFromRadii(T.R_EARTH_KM), eDepth, 1e-14);
ok("Jupiter's nearest answer choice is 1%", T.nearestChoice(T.PREDICT.jupiter) === 0.01);
ok("Earth's nearest answer choice is 0.01%", T.nearestChoice(T.PREDICT.earth) === 0.0001);
ok("pct() prints Jupiter as 1.06%", T.pct(T.PREDICT.jupiter) === "1.06%", T.pct(T.PREDICT.jupiter));
ok("pct() prints Earth as 0.0084%", T.pct(T.PREDICT.earth) === "0.0084%", T.pct(T.PREDICT.earth));
ok("ppm() prints Earth as 84", T.ppm(T.PREDICT.earth) === 84);

/* ---------- Depth back to radius ---------- */

for (const [name, r] of [["Earth", earthKm], ["Jupiter", jupKm], ["0.6 Jupiter", 0.6 * jupKm]]) {
  near(`radius from depth gives back ${name}`, T.radiusFromDepth(T.depthFromRadii(r)), r, 1e-6, "km");
}
near("radius from depth around a smaller star", T.radiusFromDepth(T.depthFromRadii(5000, 80000), 80000), 5000, 1e-6, "km");
ok("a negative depth means no planet, not NaN", T.radiusFromDepth(-0.001) === 0);
ok("a NaN depth means no planet", T.radiusFromDepth(NaN) === 0);

/* ---------- Real planets: archive depth near (Rp/R*)^2 ---------- */

for (const p of T.REAL_PLANETS) {
  const calc = T.depthFromRadii(p.radiusEarth * earthKm, p.starRadiusSun * sunKm) * 100;
  const ratio = calc / p.depthPct;
  // Within 15%: limb darkening deepens the middle of a real transit, and the
  // composite table takes radius and depth from different papers.
  ok(`${p.name}: archive depth ${p.depthPct}% vs (Rp/R*)^2 ${calc.toFixed(4)}%`, ratio > 0.85 && ratio < 1.15, `ratio ${ratio.toFixed(3)}`);
}
{
  const t1e = T.REAL_PLANETS.find((p) => p.name === "TRAPPIST-1 e");
  const times = t1e.depthPct / 100 / eDepth;
  ok("TRAPPIST-1 e's dip is about sixty times Earth's across the Sun", times > 55 && times < 65, times.toFixed(1));
  ok("TRAPPIST-1 star is about an eighth of the Sun's radius", Math.abs(t1e.starRadiusSun - 0.125) < 0.01);
}

/* ---------- Seeded noise ---------- */

{
  const a = T.gaussian(7);
  const b = T.gaussian(7);
  const c = T.gaussian(8);
  const xa = Array.from({ length: 1000 }, a);
  const xb = Array.from({ length: 1000 }, b);
  const xc = Array.from({ length: 1000 }, c);
  ok("same seed, same noise", xa.every((v, i) => v === xb[i]));
  ok("different seed, different noise", xa.some((v, i) => v !== xc[i]));
  const big = Array.from({ length: 200000 }, T.gaussian(99));
  const mean = big.reduce((s, v) => s + v, 0) / big.length;
  const sd = Math.sqrt(big.reduce((s, v) => s + (v - mean) ** 2, 0) / big.length);
  near("gaussian mean is 0", mean, 0, 0.01);
  near("gaussian standard deviation is 1", sd, 1, 0.01);
  const c1 = T.makeLevel("three");
  const c2 = T.makeLevel("three");
  ok("level 3 light curve is the same on every build", c1.f.every((v, i) => v === c2.f[i]) && c1.n === 19200, `${c1.n} readings`);
}

/* ---------- Light curve shape ---------- */

{
  const L = T.LEVELS.one.planet;
  const quiet = T.lightCurve({ seed: 1, days: 10, noise: 0, planet: L });
  const i = quiet.t.findIndex((t) => Math.abs(t - L.t0) < 1 / 96);
  near("noise-free curve reaches the full depth mid-transit", 1 - quiet.f[i], L.depth, 1e-12);
  ok("noise-free curve is flat outside the transit", quiet.f.every((f, k) => Math.abs(quiet.t[k] - L.t0) < L.duration / 2 || f === 1));
  ok("level 1 has exactly one transit", T.makeLevel("one").transits.length === 1);
  ok("level 2 has five transits", T.makeLevel("two").transits.length === 5);
  ok("level 3 has 33 transits", T.makeLevel("three").transits.length === 33);
  ok("level 3 count slider max (33 in the HTML) matches", T.makeLevel("three").transits.length === 33);
}

/* ---------- Level 1: find and measure ---------- */

{
  const c = T.makeLevel("one");
  const tc = c.transits[0];
  ok("a tap on the dip finds it", T.dipAt(c, tc + 0.1, 0) === 0);
  ok("a tap a day away does not", T.dipAt(c, tc + 1, 0) === -1);
  ok("a near miss counts with a fingertip of slack", T.dipAt(c, tc + c.planet.duration / 2 + 0.05, 0.1) === 0);
  const m = T.measureDip(c, tc);
  near("measured depth of level 1 within 3 sigma of planted", m.depth, c.planet.depth, 3 * m.err);
  const r = T.radiusFromDepth(m.depth);
  ok("level 1 radius within 5% of Jupiter's", Math.abs(r / jupKm - 1) < 0.05, `${Math.round(r)} km`);
}

/* ---------- Level 2: period from neighbours only ---------- */

{
  const c = T.makeLevel("two");
  const good = T.periodFromMarks(c, 1, 2);
  near("two neighbouring dips give the period", good.period, 4.2, 1e-9, "d");
  ok("neighbouring dips are accepted", good.ok && good.between === 0);
  const bad = T.periodFromMarks(c, 0, 2);
  ok("two dips with one between are rejected", !bad.ok && bad.between === 1);
  near("their gap is two periods", bad.gap, 8.4, 1e-9, "d");
  ok("the same dip twice is no period", !T.periodFromMarks(c, 2, 2).ok);
}

/* ---------- Level 3: folding ---------- */

{
  const c = T.makeLevel("three");
  const P = c.planet;
  const one = T.stackedDepth(c, { ...P, count: 1 });
  const all = T.stackedDepth(c, { ...P });
  ok("one transit: the dip is under 2 sigma (lost in noise)", one.depth < 2 * one.err, `${(one.depth * 1e6).toFixed(0)} +/- ${(one.err * 1e6).toFixed(0)} ppm`);
  ok("all transits: the dip is over 4 sigma", all.depth > 4 * all.err, `${(all.depth * 1e6).toFixed(0)} +/- ${(all.err * 1e6).toFixed(0)} ppm`);
  near("stacked depth within 3 x noise/sqrt(N) of the planted depth", all.depth, P.depth, 3 * all.err);
  const expectedErr = c.noise * Math.sqrt(1 / all.inN + 1 / all.outN);
  near("stacked error is the noise over root N", all.err, expectedErr, 1e-15);
  ok("error falls by about root 33 from one transit to all", Math.abs(one.err / all.err - Math.sqrt(33)) < 1, (one.err / all.err).toFixed(2));

  for (const wrong of [11.9, 12.0, 12.6, 12.7]) {
    const w = T.stackedDepth(c, { ...P, period: wrong });
    ok(`folding at a wrong period (${wrong} d) loses the dip`, w.depth < 2.5 * w.err && w.depth < P.depth / 2,
      `${(w.depth * 1e6).toFixed(0)} +/- ${(w.err * 1e6).toFixed(0)} ppm`);
  }

  // fold() bins: the bins inside the flat bottom should average near the
  // planted depth, the bins far outside near zero.
  const F = T.fold(c, { period: P.period, t0: P.t0, window: 1, binDays: 1 / 24 });
  const inside = F.bins.filter((b) => Math.abs(b.x) < 0.08 && b.n);
  const outside = F.bins.filter((b) => Math.abs(b.x) > 0.4 && b.n);
  const avg = (bs) => bs.reduce((s, b) => s + (1 - b.y) * b.n, 0) / bs.reduce((s, b) => s + b.n, 0);
  const nIn = inside.reduce((s, b) => s + b.n, 0);
  near("folded bins in the dip average to the planted depth", avg(inside) - avg(outside), P.depth, 3 * c.noise / Math.sqrt(nIn));
  ok("fold keeps only readings inside the window", F.px.every((x) => Math.abs(x) < 1));
  ok("fold with count 1 keeps one window's worth", T.fold(c, { period: P.period, t0: P.t0, count: 1 }).px.length === 96,
    `${T.fold(c, { period: P.period, t0: P.t0, count: 1 }).px.length}`);
  const Fbad = T.fold(c, { period: NaN, t0: P.t0 });
  ok("fold with a NaN period does not throw or fill NaN", Fbad.bins.every((b) => !b.n || Number.isFinite(b.y)));
}

console.log(failures === 0 ? "\nAll find-a-planet checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
