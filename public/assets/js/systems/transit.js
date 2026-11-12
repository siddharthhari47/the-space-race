// Transit — simulated light curves for the "Find a planet" exhibit.
//
// Pure arithmetic, no DOM, so tools/find-a-planet-check.mjs can run it in
// Node and the page can run the very same functions in a browser.
//
// The lesson rests on one equation. When a planet crosses its star, the
// fraction of the star's light that goes missing is the fraction of the
// star's disc the planet covers, which is the ratio of the two areas:
//
//     depth = (planet radius / star radius)^2
//
// Seager and Mallen-Ornelas (2003, ApJ 585, 1038) write it as their equation
// (1), for a flat-bottomed transit seen where limb darkening is negligible.
// Their section 5 says limb darkening changes the depth, which is one reason
// the real planets in the results table do not sit exactly on the formula.
// The simulated transits here follow the equation exactly: the star is
// evenly bright to its edge, the planet crosses its middle, and the dip is a
// flat bottom with straight-line ingress and egress. That is a teaching
// simplification and the page says so.
//
// The light curves are made up, and every one of them is labelled on the
// page as simulated. What is not made up is the size of the dips: they come
// from fact-sheet radii, so the Jupiter-size planet dims its star by the same
// fraction Jupiter would dim the Sun. Everything random comes from a seeded
// generator, so the page, the check script and a reload all see the same
// noise, point for point.
//
// Units: kilometres for radii, days for time, and brightness as a fraction of
// the star's normal light (1 = no transit, 0.99 = one percent dimmer).

/* ---------- Sourced constants ---------- */

// NASA NSSDCA Sun Fact Sheet (last updated 9 May 2024), Bulk parameters,
// "Volumetric mean radius (km)": 695,700.
export const R_SUN_KM = 695700;

// NASA NSSDCA Earth Fact Sheet (last updated 15 November 2024), Bulk
// parameters, "Equatorial radius (km)": 6378.137. "Sidereal orbit period
// (days)": 365.256.
export const R_EARTH_KM = 6378.137;
export const P_EARTH_D = 365.256;

// NASA NSSDCA Jupiter Fact Sheet (last updated 2 October 2024), Bulk
// parameters, "Equatorial radius (1 bar level) (km)": 71,492. Orbital
// parameters, "Sidereal orbit period (days)": 4,332.589.
export const R_JUPITER_KM = 71492;
export const P_JUPITER_D = 4332.589;

// Three real transiting planets, from the NASA Exoplanet Archive's Planetary
// Systems Composite Parameters table (pscomppars), queried through its TAP
// service on 12 November 2026. Columns: pl_rade (planet radius, Earth
// radii), pl_orbper (orbital period, days), pl_trandep (transit depth, in
// percent per the archive's column definitions), st_rad (star radius, solar
// radii). The composite table takes each column from one reference, noted
// per planet; the depths of Kepler-22 b come from the Q1-Q17 DR24 KOI table.
export const REAL_PLANETS = [
  {
    name: "HD 209458 b", radiusEarth: 15.58051, periodDays: 3.52474859,
    depthPct: 1.5, starRadiusSun: 1.19, ref: "Stassun et al. 2017",
  },
  {
    name: "Kepler-22 b", radiusEarth: 2.1, periodDays: 289.863876,
    depthPct: 0.05019, starRadiusSun: 0.869, ref: "Bonomo et al. 2023; depth from the Q1-Q17 DR24 KOI table",
  },
  {
    name: "TRAPPIST-1 e", radiusEarth: 0.92, periodDays: 6.101013,
    depthPct: 0.5012, starRadiusSun: 0.1192, ref: "Agol et al. 2021",
  },
];

/* ---------- The equation ---------- */

const finite = (x, fallback = 0) => (Number.isFinite(x) ? x : fallback);

// Fraction of the star's light blocked by a planet of radius rp.
export function depthFromRadii(rp, rs = R_SUN_KM) {
  if (!(rs > 0)) return 0;
  const k = Math.max(0, finite(rp)) / rs;
  return k * k;
}

// The same equation turned round: the planet radius a measured depth implies.
// A negative depth (a line drawn above the normal brightness) means no planet
// at all, not an imaginary one.
export function radiusFromDepth(depth, rs = R_SUN_KM) {
  return rs * Math.sqrt(Math.max(0, finite(depth)));
}

/* ---------- Seeded noise ---------- */

// mulberry32, the same small generator stage.js uses for star fields. It is
// copied rather than imported so this module never touches stage.js, which
// reads window.matchMedia at import time.
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Normal deviates by Box-Muller. Each call to the uniform generator is used
// once, and the second deviate of each pair is kept for the next call, so a
// given seed always produces the same sequence however the calls are split.
export function gaussian(seed) {
  const u = rng(seed);
  let spare = null;
  return function () {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let a = u();
    if (a < 1e-12) a = 1e-12;
    const b = u();
    const r = Math.sqrt(-2 * Math.log(a));
    spare = r * Math.sin(2 * Math.PI * b);
    return r * Math.cos(2 * Math.PI * b);
  };
}

/* ---------- One transit ---------- */

// Fractional dimming at time t for a planet whose transits are centred on
// t0 + n * period. The shape is a trapezoid: full depth for the middle of the
// transit, straight ramps for ingress and egress. ingress is the fraction of
// the whole duration spent on each ramp.
export function transitDip(t, { period, t0, depth, duration, ingress = 0.15 }) {
  if (!(period > 0) || !(duration > 0)) return 0;
  const n = Math.round((t - t0) / period);
  const dt = Math.abs(t - (t0 + n * period));
  const half = duration / 2;
  if (dt >= half) return 0;
  const ramp = Math.max(ingress * duration, 1e-9);
  if (dt <= half - ramp) return depth;
  return depth * (half - dt) / ramp;
}

// Times of every transit centre inside [start, end).
export function transitTimes({ period, t0 }, start, end) {
  const out = [];
  if (!(period > 0)) return out;
  let n = Math.ceil((start - t0) / period);
  for (let tc = t0 + n * period; tc < end; tc = t0 + ++n * period) out.push(tc);
  return out;
}

/* ---------- A whole light curve ---------- */

// Brightness readings at a fixed cadence, with white Gaussian noise of
// standard deviation `noise` on each one. Real stars also flicker and real
// telescopes drift; this star does neither, and the page says the only
// thing hiding the planet here is random noise.
export function lightCurve({
  seed = 1, days = 10, cadence = 1 / 48, noise = 0.001, planet = null, start = 0,
}) {
  const n = Math.max(1, Math.floor(days / cadence));
  const t = new Float64Array(n);
  const f = new Float64Array(n);
  const g = gaussian(seed);
  for (let i = 0; i < n; i++) {
    const ti = start + (i + 0.5) * cadence;
    t[i] = ti;
    f[i] = 1 - (planet ? transitDip(ti, planet) : 0) + noise * g();
  }
  const transits = planet ? transitTimes(planet, start, start + days) : [];
  return { t, f, n, start, days, cadence, noise, planet, transits };
}

/* ---------- Finding a dip by hand ---------- */

// Which transit, if any, a tap at time `tap` landed on. `slack` is how far
// outside the dip a tap may fall and still count, in days; the page sets it
// from the size of a finger on the plot so that a 5-pixel dip on a phone
// can still be hit. Returns the index into curve.transits, or -1.
export function dipAt(curve, tap, slack = 0) {
  if (!curve.planet) return -1;
  const reach = curve.planet.duration / 2 + Math.max(0, slack);
  let best = -1;
  let bestD = Infinity;
  curve.transits.forEach((tc, i) => {
    const d = Math.abs(tap - tc);
    if (d <= reach && d < bestD) { best = i; bestD = d; }
  });
  return best;
}

// Mean of the readings inside one transit's flat bottom, and of the readings
// well outside it nearby. The difference is the depth the page measures for
// itself, to compare with the visitor's line.
export function measureDip(curve, tc) {
  const p = curve.planet;
  const flat = p.duration * (0.5 - (p.ingress ?? 0.15));
  let inS = 0, inN = 0, outS = 0, outN = 0;
  for (let i = 0; i < curve.n; i++) {
    const d = Math.abs(curve.t[i] - tc);
    if (d <= flat) { inS += curve.f[i]; inN++; }
    else if (d > p.duration && d < p.duration * 4) { outS += curve.f[i]; outN++; }
  }
  if (!inN || !outN) return { depth: 0, inN, outN, err: Infinity };
  const depth = outS / outN - inS / inN;
  const err = curve.noise * Math.sqrt(1 / inN + 1 / outN);
  return { depth, inN, outN, err };
}

// Period from two marked transits. They have to be neighbours: if another
// transit sits between them, the gap is a multiple of the period, which is
// the mistake the page catches. Seager and Mallen-Ornelas list "the two
// observed eclipses are consecutive" among the conditions for reading the
// period off a light curve.
export function periodFromMarks(curve, i, j) {
  const a = Math.min(i, j);
  const b = Math.max(i, j);
  if (a < 0 || b >= curve.transits.length || a === b) return { ok: false, between: 0, period: NaN };
  const gap = curve.transits[b] - curve.transits[a];
  return { ok: b - a === 1, between: b - a - 1, period: gap / (b - a), gap };
}

/* ---------- Stacking ---------- */

// Fold the light curve at a trial period: every reading's time is replaced by
// its time from the nearest predicted transit centre, so all the transits
// land on top of each other at zero. `count` keeps only the readings from the
// first `count` orbits of the trial period. `until` cuts by time instead: only
// readings before it are kept. The page uses `until`, set from the planted
// period, so that "33 of 33 stacked" means the first 33 real crossings even
// when the visitor has slid the trial period away from the true one; counting
// orbits of a wrong period would drop or add a crossing at the far end.
// Readings further than `window` days from a centre are left out.
//
// Returns the kept points (phase, brightness) and the means in bins of
// `binDays`, with each bin's count. A bin's mean wanders by noise/sqrt(count),
// which is why the dip comes out of the scatter as more orbits are stacked.
export function fold(curve, { period, t0, count = Infinity, until = Infinity, window = 1, binDays = 1 / 24 }) {
  const P = finite(period, 1) > 0 ? period : 1;
  const nb = Math.max(1, Math.round((2 * window) / binDays));
  const sum = new Float64Array(nb);
  const num = new Uint32Array(nb);
  const px = [];
  const py = [];
  for (let i = 0; i < curve.n; i++) {
    const k = Math.round((curve.t[i] - t0) / P);
    if (k < 0 || k >= count || curve.t[i] > until) continue;
    const ph = curve.t[i] - (t0 + k * P);
    if (Math.abs(ph) >= window) continue;
    px.push(ph);
    py.push(curve.f[i]);
    const b = Math.min(nb - 1, Math.floor((ph + window) / binDays));
    sum[b] += curve.f[i];
    num[b]++;
  }
  const bins = [];
  for (let b = 0; b < nb; b++) {
    bins.push({ x: -window + (b + 0.5) * binDays, y: num[b] ? sum[b] / num[b] : NaN, n: num[b] });
  }
  return { px, py, bins, window, binDays };
}

// Depth measured from the folded data: mean outside the dip minus mean
// inside its flat bottom. `duration` is the transit length the page planted.
// err is the one-sigma uncertainty from the noise alone, noise/sqrt(N) for
// the readings inside plus the same for those outside.
export function stackedDepth(curve, { period, t0, count = Infinity, until = Infinity, duration, ingress = 0.15 }) {
  const flat = duration * (0.5 - ingress);
  let inS = 0, inN = 0, outS = 0, outN = 0;
  for (let i = 0; i < curve.n; i++) {
    const k = Math.round((curve.t[i] - t0) / period);
    if (k < 0 || k >= count || curve.t[i] > until) continue;
    const d = Math.abs(curve.t[i] - (t0 + k * period));
    if (d <= flat) { inS += curve.f[i]; inN++; }
    else if (d > duration && d < duration * 4) { outS += curve.f[i]; outN++; }
  }
  if (!inN || !outN) return { depth: 0, err: Infinity, inN, outN };
  return {
    depth: outS / outN - inS / inN,
    err: curve.noise * Math.sqrt(1 / inN + 1 / outN),
    inN,
    outN,
  };
}

/* ---------- The three levels ---------- */

// The planted planets and their stars. None of these are real systems, and
// nothing below is a NASA number except the radii they are built from. Each
// star is the Sun's size, so a dip's depth can be read straight back to a
// planet size with the Sun's radius. Durations, periods, cadence and noise
// are this page's own settings, picked so that level 1's dip is plain,
// level 2's dips are easy to tell apart, and level 3's planet is lost in a
// single transit (the planted dip is about one noise sigma) and clear after
// all 33 of them (about five sigma: the noise falls by the square root of 33,
// about 5.7).
export const LEVELS = {
  // One Jupiter-size dip in ten days.
  one: {
    seed: 9001, days: 10, cadence: 1 / 48, noise: 0.0012,
    planet: { period: 40, t0: 6.3, depth: depthFromRadii(R_JUPITER_KM), duration: 0.45, ingress: 0.15 },
  },
  // Five dips 4.2 days apart, from a planet 0.6 Jupiter radii across.
  two: {
    seed: 4242, days: 20, cadence: 1 / 48, noise: 0.0008,
    planet: { period: 4.2, t0: 2.3, depth: depthFromRadii(0.6 * R_JUPITER_KM), duration: 0.3, ingress: 0.15 },
  },
  // An Earth-size planet every 12.3 days, for 400 days.
  three: {
    seed: 31337, days: 400, cadence: 1 / 48, noise: 0.00025,
    planet: { period: 12.3, t0: 5.1, depth: depthFromRadii(R_EARTH_KM), duration: 0.3, ingress: 0.15 },
  },
};

export function makeLevel(key) {
  const L = LEVELS[key];
  return lightCurve({ seed: L.seed, days: L.days, cadence: L.cadence, noise: L.noise, planet: L.planet });
}

/* ---------- Predictions ---------- */

// The answer choices, as fractions. They are a factor of ten apart, so "how
// far off" is a count of factors of ten.
export const CHOICES = [0.0001, 0.001, 0.01, 0.1];

export const PREDICT = {
  jupiter: depthFromRadii(R_JUPITER_KM),
  earth: depthFromRadii(R_EARTH_KM),
};

// The choice nearest the true value on a log scale, and how many factors of
// ten a guess is from the truth.
export function nearestChoice(value) {
  let best = CHOICES[0];
  for (const c of CHOICES) {
    if (Math.abs(Math.log10(c / value)) < Math.abs(Math.log10(best / value))) best = c;
  }
  return best;
}

export function factorOff(guess, value) {
  return guess / value;
}

/* ---------- Formatting ---------- */

// A fraction as a percentage with enough figures to be read: 0.010560 ->
// "1.06%", 0.0000841 -> "0.0084%".
export function pct(x) {
  const p = x * 100;
  if (!Number.isFinite(p)) return "?";
  const a = Math.abs(p);
  if (a >= 0.1) return `${p.toFixed(2)}%`;
  if (a >= 0.01) return `${p.toFixed(3)}%`;
  return `${p.toFixed(4)}%`;
}

export const ppm = (x) => Math.round(x * 1e6);

// Thousands separators for kilometres.
export const km = (x) => Math.round(x).toLocaleString("en-GB");
