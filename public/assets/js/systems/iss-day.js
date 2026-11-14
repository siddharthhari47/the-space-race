// A day on the ISS — the model behind the exhibit.
//
// DOM-free so it can be checked in Node (tools/iss-day-check.mjs).
//
// Three questions, one model. Every part of it is a point mass under one
// central pull (two-body), and the numbers for the Earth come from the
// ground-track module, which this file imports and does not change:
//
//   MU       398600.4418 km^3/s^2
//   R_EARTH  6378.137 km, the EQUATORIAL radius
//
// THE RADIUS. Every height, every speed and every shadow on this page is
// worked out from the equatorial radius, the same one groundtrack.js uses,
// and the Earth is treated as a sphere of that radius. The mean radius
// (6371 km) is 7 km smaller; the difference moves the gravity fraction at
// the station's height by about 0.2 percentage points and the shadow
// geometry by a few hundredths of a degree. The page says which radius it
// uses wherever it prints a number that depends on one.
//
// WHAT IS SIMPLIFIED, in one place so the page can say it plainly:
//
//   * Level 1 is a two-body conic from the launch state: a point mass, no
//     air, no spin of the Earth under it, no Moon or Sun. The throw is
//     horizontal at the station's height. The exhibit stops a throw at an
//     altitude of its own choosing (STOP_ALT_KM) to stand in for "the air
//     gets thick"; real drag begins gradually and it is not a line.
//   * Level 2 is a circular orbit and a cylindrical Earth shadow: sunlight
//     is treated as parallel rays, so the shadow is a cylinder as wide as
//     the Earth, with no soft edge (no penumbra, no atmosphere bending the
//     light). The Sun stays put for the day.
//   * Level 3 is the same circular orbit at the real inclination, with the
//     Sun held on the celestial equator (an equinox) and the orbit plane
//     held still within a day. Only "next day" moves the plane, by the J2
//     drift this file works out from the constants in groundtrack.js. The
//     Earth is a sphere, so the horizon is where a tangent line from the
//     observer touches that sphere; there is no terrain, no refraction.
//
// Units: kilometres and seconds inside the model, degrees at the edges.

import {
  MU, R_EARTH, SIDEREAL_DAY, J2, period, speed, horizonAngle, groundTrack,
} from "./groundtrack.js";

export { MU, R_EARTH, SIDEREAL_DAY, J2, period, speed, horizonAngle, groundTrack };

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

/* ---------- The exhibit's own settings ----------

   ALT_KM is the station's height in the model. NASA's ISS page gives the
   orbit as between 370 and 460 km. 400 km is inside that and is within a few
   kilometres of the 250 miles (402 km) that NASA Glenn's microgravity page
   quotes its 88.8 percent gravity figure for, so the one number can be set
   beside the other. It is a choice, not a measurement of any day's orbit. */
export const ALT_KM = 400;
export const INC_DEG = 51.6; // NASA's ISS page
// Where a throw is stopped, by this exhibit's own rule. 120 km is a round
// number near the top of the thickening air; it is a rule, not a boundary.
export const STOP_ALT_KM = 120;
// The exhibit's own rule for "high enough to count": 10 degrees above the
// horizon. NASA's Spot the Station FAQ gives no minimum, and a low station is
// lost in buildings, trees and haze.
export const MIN_ELEV_DEG = 10;
// Civil twilight ends, by the US Naval Observatory definition, when the
// centre of the Sun is 6 degrees below the horizon. The exhibit asks for the
// Sun to be at least that far down before a station can be "seen".
export const TWILIGHT_DEG = 6;
export const DAY_S = 86400;
export const SPEED_MAX_KMS = 12; // slider range for level 1
export const VIEW_RADII = 6; // a throw is dropped once it is this many Earth radii out

const OMEGA_SID = TAU / SIDEREAL_DAY; // rad/s, Earth's turn against the stars
const OMEGA_SUN = TAU / (365.2422 * DAY_S); // rad/s, the Sun's drift against the stars

/* ---------- Real numbers the page prints beside the model's ---------- */

export const REAL = {
  altLowKm: 370, altHighKm: 460, // NASA ISS page
  speedMph: 17500, speedKmh: 28000, // NASA Spot the Station page
  periodMinLow: 90, periodMinHigh: 93, // JSC Earth Observations orbit tutorial
  orbitsPerDay: 16, // NASA ISS facts and figures
  orbitsPerDayLow: 15.5, orbitsPerDayHigh: 15.9, // JSC tutorial
  inclinationDeg: 51.6,
  gravityPct: 88.8, gravityAtMiles: 250, // NASA Glenn, "What is microgravity?"
  criticalBetaDeg: 69.9, criticalBetaAltKm: 415, // NTRS 20150001912
  exerciseHours: 2,
};

/* ---------- Level 1: throw something sideways ---------- */

export const circularSpeed = (altKm = ALT_KM) => speed(altKm); // km/s
export const escapeSpeed = (altKm = ALT_KM) => Math.SQRT2 * speed(altKm);

/** Gravity at a height as a fraction of gravity at the surface: (R / (R + h))^2. */
export const gravityFraction = (altKm = ALT_KM) => (R_EARTH / (R_EARTH + altKm)) ** 2;

/**
 * The elements of the conic a horizontal throw from the station's height
 * makes. All worked out from the launch state with no stepping, so the path
 * the integrator draws can be checked against them.
 */
export function conic(vKmS, altKm = ALT_KM) {
  const r0 = R_EARTH + altKm;
  const energy = (vKmS * vKmS) / 2 - MU / r0; // km^2/s^2
  const h = r0 * vKmS; // km^2/s, angular momentum per unit mass
  const p = (h * h) / MU;
  const e = Math.sqrt(Math.max(0, 1 + (2 * energy * h * h) / (MU * MU)));
  const rp = p / (1 + e);
  const ra = e < 1 ? p / (1 - e) : Infinity;
  const a = energy < 0 ? -MU / (2 * energy) : Infinity;
  return { r0, energy, h, p, e, rp, ra, a };
}

/** The slowest horizontal throw whose lowest point stays above the stop line. */
export function fallSpeed(altKm = ALT_KM, stopAltKm = STOP_ALT_KM) {
  const r0 = R_EARTH + altKm;
  const rs = R_EARTH + stopAltKm;
  // The throw is launched at the top of its path (apoapsis) when it is slower
  // than circular, so conservation of energy and angular momentum between
  // r0 and the stop radius gives the speed that just grazes the stop line.
  return Math.sqrt((2 * MU * rs) / (r0 * (r0 + rs)));
}

/**
 * What a throw does, from the elements alone. "falls": its lowest point is
 * below the stop line. "escapes": its energy is not negative. Otherwise it
 * "orbits", which here means it goes round without touching the stop line.
 */
export function throwOutcome(vKmS, altKm = ALT_KM, stopAltKm = STOP_ALT_KM) {
  const c = conic(vKmS, altKm);
  if (c.rp <= R_EARTH + stopAltKm && c.energy < 0) return "falls";
  if (c.energy >= 0) return "escapes";
  return "orbits";
}

/**
 * Fly a throw. RK4 in Cartesian coordinates with a fixed step, because
 * the path has to be a list of points for the picture anyway and the
 * conserved energy makes the error easy to see (the checks ask for it to
 * stay under a millionth). Position is in km with the launch point straight
 * "up" on the page: x to the right, y up. The throw goes to the right, so
 * a prograde orbit is clockwise on the page.
 *
 * It ends when the path reaches the stop line (falls), has gone once round
 * (orbits), or has gone VIEW_RADII Earth radii out (escapes, or an ellipse
 * too long to follow).
 */
export function simulateThrow(vKmS, { altKm = ALT_KM, stopAltKm = STOP_ALT_KM, dt = 2, keep = 700 } = {}) {
  const r0 = R_EARTH + altKm;
  const rStop = R_EARTH + stopAltKm;
  const rMax = R_EARTH * VIEW_RADII;
  const accel = (x, y) => {
    const r = Math.hypot(x, y);
    const k = -MU / (r * r * r);
    return [k * x, k * y];
  };
  let x = 0;
  let y = r0;
  let vx = vKmS;
  let vy = 0;
  let t = 0;
  let swept = 0; // clockwise angle from the launch point, radians
  let lastAng = 0;
  const E0 = (vx * vx + vy * vy) / 2 - MU / r0;
  const all = [{ t, x, y, r: r0 }];
  let fell = false;
  let leaves = false;
  let laps = false;
  let E1 = E0;
  let minR = r0;
  let maxR = r0;
  for (let i = 0; i < 40000; i++) {
    // RK4
    const [a1x, a1y] = accel(x, y);
    const x2 = x + (vx * dt) / 2; const y2 = y + (vy * dt) / 2;
    const vx2 = vx + (a1x * dt) / 2; const vy2 = vy + (a1y * dt) / 2;
    const [a2x, a2y] = accel(x2, y2);
    const x3 = x + (vx2 * dt) / 2; const y3 = y + (vy2 * dt) / 2;
    const vx3 = vx + (a2x * dt) / 2; const vy3 = vy + (a2y * dt) / 2;
    const [a3x, a3y] = accel(x3, y3);
    const x4 = x + vx3 * dt; const y4 = y + vy3 * dt;
    const vx4 = vx + a3x * dt; const vy4 = vy + a3y * dt;
    const [a4x, a4y] = accel(x4, y4);
    const nx = x + (dt / 6) * (vx + 2 * vx2 + 2 * vx3 + vx4);
    const ny = y + (dt / 6) * (vy + 2 * vy2 + 2 * vy3 + vy4);
    const nvx = vx + (dt / 6) * (a1x + 2 * a2x + 2 * a3x + a4x);
    const nvy = vy + (dt / 6) * (a1y + 2 * a2y + 2 * a3y + a4y);
    const nr = Math.hypot(nx, ny);
    if (nr <= rStop) {
      // Cut the last step at the stop line by linear interpolation.
      const r = Math.hypot(x, y);
      const f = (r - rStop) / (r - nr);
      x += (nx - x) * f; y += (ny - y) * f;
      t += dt * f;
      all.push({ t, x, y, r: rStop });
      // The energy is read off the last full step, before the cut.
      E1 = (nvx * nvx + nvy * nvy) / 2 - MU / nr;
      minR = rStop;
      fell = true;
      break;
    }
    x = nx; y = ny; vx = nvx; vy = nvy; t += dt;
    // Unwrapped clockwise angle from "up".
    let ang = Math.atan2(x, y);
    let d = ang - lastAng;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    swept += d;
    lastAng = ang;
    minR = Math.min(minR, nr);
    maxR = Math.max(maxR, nr);
    all.push({ t, x, y, r: nr });
    if (nr >= rMax) { leaves = true; break; }
    if (swept >= TAU) { laps = true; break; }
  }
  if (!fell) E1 = (vx * vx + vy * vy) / 2 - MU / Math.hypot(x, y);
  const outcome = fell ? "falls" : E0 >= 0 ? "escapes" : "orbits";
  const step = Math.max(1, Math.ceil(all.length / keep));
  const path = [];
  for (let i = 0; i < all.length; i += step) path.push(all[i]);
  if (path[path.length - 1] !== all[all.length - 1]) path.push(all[all.length - 1]);
  for (const p of path) p.h = p.r - R_EARTH;
  const c = conic(vKmS, altKm);
  return {
    v: vKmS, outcome, path, fell, leaves, laps,
    tEnd: t, swept,
    minAltKm: minR - R_EARTH, maxAltKm: maxR - R_EARTH,
    energyDrift: Math.abs(E1 - E0) / Math.abs(E0),
    e: c.e, rpAltKm: c.rp - R_EARTH, raAltKm: c.ra - R_EARTH,
    periodS: c.energy < 0 ? TAU * Math.sqrt((c.a ** 3) / MU) : Infinity,
  };
}

/* ---------- Level 2: sixteen sunrises ---------- */

export const orbitPeriod = (altKm = ALT_KM) => period(altKm);
export const meanMotion = (altKm = ALT_KM) => TAU / period(altKm); // rad/s

/**
 * The beta angle (the Sun's angle to the orbit plane) above which the
 * station never enters the Earth's shadow: sin(beta*) = R / (R + h). NASA's
 * thermal-analysis paper gives 69.9 degrees at 415 km with its own Earth
 * radius; this is the same formula with this exhibit's radius and height.
 */
export const criticalBetaDeg = (altKm = ALT_KM) => Math.asin(R_EARTH / (R_EARTH + altKm)) / DEG;

/**
 * Fraction of each orbit spent in shadow, circular orbit, cylindrical
 * shadow: (1/pi) acos( sqrt(1 - (R/r)^2) / cos(beta) ). At beta = 0 this is
 * asin(R/r) / pi.
 */
export function eclipseFraction(betaDeg, altKm = ALT_KM) {
  if (Math.abs(betaDeg) >= criticalBetaDeg(altKm)) return 0;
  const r = R_EARTH + altKm;
  const c = Math.sqrt(1 - (R_EARTH / r) ** 2) / Math.cos(betaDeg * DEG);
  return Math.acos(Math.min(1, c)) / Math.PI;
}

export const nightSeconds = (betaDeg, altKm = ALT_KM) => eclipseFraction(betaDeg, altKm) * period(altKm);

/**
 * Is the station in the Earth's shadow? `phi` is its angle round the orbit
 * from the point nearest the Sun (in the plane); the Sun is `betaDeg` above
 * the plane. Behind the Earth, and nearer the Earth-Sun line than one Earth
 * radius, is shadow.
 */
export function inShadowPlane(phi, betaDeg, altKm = ALT_KM) {
  const r = R_EARTH + altKm;
  const cp = Math.cos(phi);
  const cb = Math.cos(betaDeg * DEG);
  const along = r * cp * cb; // station's distance along the Sun line (positive = sunward)
  if (along >= 0) return false;
  const perp2 = r * r - along * along;
  return perp2 < R_EARTH * R_EARTH;
}

/**
 * Every sunrise and sunset (the station leaving and entering the shadow) in
 * the first `durationS` seconds, from the station starting at `phi0`. In
 * closed form: the shadow is centred on phi = pi with half-width
 * w = acos(c), so the station leaves it at phi = pi + w and enters at
 * pi - w, each plus whole turns.
 */
export function sunEvents(durationS, { betaDeg = 0, phi0 = 0, altKm = ALT_KM } = {}) {
  const out = { sunrises: [], sunsets: [] };
  const f = eclipseFraction(betaDeg, altKm);
  if (f <= 0) return out;
  const n = meanMotion(altKm);
  const w = f * Math.PI;
  const turns = Math.ceil((durationS * n) / TAU) + 2;
  for (let k = -2; k <= turns; k++) {
    const tRise = (Math.PI + w + k * TAU - phi0) / n;
    const tSet = (Math.PI - w + k * TAU - phi0) / n;
    if (tRise >= 0 && tRise < durationS) out.sunrises.push(tRise);
    if (tSet >= 0 && tSet < durationS) out.sunsets.push(tSet);
  }
  out.sunrises.sort((a, b) => a - b);
  out.sunsets.sort((a, b) => a - b);
  return out;
}

/**
 * The crew's day, on GMT, in minutes after 00:00. Every block is read off
 * one NASA-hosted crew timeline (the Form 24 for 25 October 2013), and the
 * sleep window matches the 2130 to 0600 GMT a 2024 NASA sleep study gives.
 * Only what that timeline shows is here. Exercise is not a block: the same
 * timeline has each crew member's exercise sessions at different times
 * inside the working day, so there is no single exercise time to draw.
 * `end` can run past 1440, which means the next morning.
 */
export const CREW_BLOCKS = [
  { id: "sleep", label: "Sleep", start: 21 * 60 + 30, end: 24 * 60 + 6 * 60 },
  { id: "wake", label: "Wake-up, inspection, breakfast", start: 6 * 60, end: 7 * 60 + 30 },
  { id: "work", label: "Planning conference and work", start: 7 * 60 + 30, end: 12 * 60 + 10 },
  { id: "meal", label: "Midday meal", start: 12 * 60 + 10, end: 13 * 60 + 40 },
  { id: "work2", label: "Planning conference and work", start: 13 * 60 + 40, end: 18 * 60 + 40 },
  { id: "evening", label: "Evening planning, dinner, pre-sleep", start: 18 * 60 + 40, end: 21 * 60 + 30 },
];

/* ---------- Level 3: spot it from home ---------- */

/**
 * The scenario for one day. Everything is held in inertial coordinates, the
 * way groundtrack.js does it: the orbit plane (`raan`) and the station's
 * starting phase (`u0`) are fixed for the day; the Earth turns under them
 * at the sidereal rate from angle `theta0`; and the Sun sits on the
 * celestial equator at ecliptic... at longitude `lam0`, drifting 0.9856
 * degrees a day as the real Sun does. `lam0` and `theta0` are tied so that
 * the Sun is over longitude 180 at 00:00 GMT, which makes 12:00 GMT local
 * noon at longitude 0: the clock on the page is GMT.
 *
 * Day 0 is the base. Each later day moves the plane by the J2 drift
 * (`nodalRateDegPerDay`), the station along its orbit by the whole orbits'
 * remainder, and the Earth and Sun by one more day's turn.
 */
export const BASE = { raanDeg: 150, u0Deg: 0 };

export function nodalRateDegPerDay(altKm = ALT_KM, incDeg = INC_DEG) {
  // Regression of the node from the Earth's bulge: -3/2 J2 (R/a)^2 n cos i.
  const a = R_EARTH + altKm;
  const n = Math.sqrt(MU / a ** 3);
  return (-1.5 * J2 * (R_EARTH / a) ** 2 * n * Math.cos(incDeg * DEG) * DAY_S) / DEG;
}
export const SUN_RATE_DEG_PER_DAY = (OMEGA_SUN * DAY_S) / DEG;
/** How far the orbit plane turns against the Sun in a day. */
export const relativeDriftDegPerDay = (altKm = ALT_KM, incDeg = INC_DEG) =>
  nodalRateDegPerDay(altKm, incDeg) - SUN_RATE_DEG_PER_DAY;

export function makeScenario(day = 0, { raanDeg = BASE.raanDeg, u0Deg = BASE.u0Deg, altKm = ALT_KM, incDeg = INC_DEG } = {}) {
  const T = period(altKm);
  const theta0 = (OMEGA_SID * DAY_S * day) % TAU;
  return {
    day, altKm, incDeg,
    raan: (raanDeg + nodalRateDegPerDay(altKm, incDeg) * day) * DEG,
    u0: (u0Deg * DEG + ((TAU * DAY_S * day) / T)) % TAU,
    theta0,
    lam0: Math.PI + OMEGA_SUN * DAY_S * day,
  };
}

/** Inertial position of the station, km, at t seconds into the day. */
export function stationECI(t, sc) {
  const r = R_EARTH + sc.altKm;
  const u = sc.u0 + meanMotion(sc.altKm) * t;
  const i = sc.incDeg * DEG;
  const cu = Math.cos(u); const su = Math.sin(u);
  const cO = Math.cos(sc.raan); const sO = Math.sin(sc.raan);
  return [
    r * (cu * cO - su * Math.cos(i) * sO),
    r * (cu * sO + su * Math.cos(i) * cO),
    r * su * Math.sin(i),
  ];
}

export const sunVector = (t, sc) => {
  const l = sc.lam0 + OMEGA_SUN * t;
  return [Math.cos(l), Math.sin(l), 0];
};

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Cylindrical shadow test, written as a ray against the Earth's sphere. */
export function stationInSun(p, s) {
  const along = dot(p, s);
  if (along >= 0) return true;
  const r2 = dot(p, p);
  return r2 - along * along >= R_EARTH * R_EARTH;
}

/** The sub-station point, degrees. */
export function subPoint(t, sc) {
  const p = stationECI(t, sc);
  const r = Math.hypot(p[0], p[1], p[2]);
  const theta = sc.theta0 + OMEGA_SID * t;
  let lon = Math.atan2(p[1], p[0]) - theta;
  lon = ((((lon + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  return { lat: Math.asin(p[2] / r) / DEG, lon: lon / DEG };
}

/** The Sun's elevation, degrees, at a place on the ground. */
export function sunElevation(latDeg, lonDeg, t, sc) {
  const la = latDeg * DEG;
  const th = lonDeg * DEG + sc.theta0 + OMEGA_SID * t;
  const o = [Math.cos(la) * Math.cos(th), Math.cos(la) * Math.sin(th), Math.sin(la)];
  return Math.asin(Math.max(-1, Math.min(1, dot(o, sunVector(t, sc))))) / DEG;
}

/** Where the Sun is straight overhead at t seconds into the day. */
export function subSolarPoint(t, sc) {
  const s = sunVector(t, sc);
  const theta = sc.theta0 + OMEGA_SID * t;
  let lon = Math.atan2(s[1], s[0]) - theta;
  lon = ((((lon + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  return { lat: 0, lon: lon / DEG };
}

/**
 * Everything about the station as seen from one place at one time.
 * `visible` needs all three of the exhibit's rules at once: the station is
 * at least MIN_ELEV_DEG above the horizon, it is in sunlight, and the Sun
 * is at least TWILIGHT_DEG below the observer's horizon.
 */
export function look(t, latDeg, lonDeg, sc, { minElev = MIN_ELEV_DEG, twilight = TWILIGHT_DEG } = {}) {
  const p = stationECI(t, sc);
  const s = sunVector(t, sc);
  const la = latDeg * DEG;
  const th = lonDeg * DEG + sc.theta0 + OMEGA_SID * t;
  const up = [Math.cos(la) * Math.cos(th), Math.cos(la) * Math.sin(th), Math.sin(la)];
  const east = [-Math.sin(th), Math.cos(th), 0];
  const north = [-Math.sin(la) * Math.cos(th), -Math.sin(la) * Math.sin(th), Math.cos(la)];
  const o = [R_EARTH * up[0], R_EARTH * up[1], R_EARTH * up[2]];
  const rho = [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
  const range = Math.hypot(rho[0], rho[1], rho[2]);
  const elevDeg = Math.asin(Math.max(-1, Math.min(1, dot(rho, up) / range))) / DEG;
  let azDeg = Math.atan2(dot(rho, east), dot(rho, north)) / DEG;
  if (azDeg < 0) azDeg += 360;
  const inSun = stationInSun(p, s);
  const sunElevDeg = Math.asin(Math.max(-1, Math.min(1, dot(up, s)))) / DEG;
  const above = elevDeg > 0;
  return {
    t, elevDeg, azDeg, rangeKm: range, inSun, sunElevDeg, above,
    visible: elevDeg >= minElev && inSun && sunElevDeg <= -twilight,
  };
}

/**
 * Scan one day for passes. A pass is a run of samples with the station above
 * the horizon; its visible part is where `look(...).visible` holds. Samples
 * are `stepS` apart, so edges are good to that many seconds.
 */
export function scanDay(latDeg, lonDeg, sc, { stepS = 10, ...opts } = {}) {
  const passes = [];
  let cur = null;
  const n = Math.floor(DAY_S / stepS);
  for (let k = 0; k <= n; k++) {
    const t = k * stepS;
    const l = look(t, latDeg, lonDeg, sc, opts);
    if (l.above) {
      if (!cur) cur = { start: t, end: t, maxElevDeg: l.elevDeg, tMax: t, visibleRanges: [], anySun: false, anyDark: false };
      cur.end = t;
      if (l.elevDeg > cur.maxElevDeg) { cur.maxElevDeg = l.elevDeg; cur.tMax = t; }
      if (l.inSun) cur.anySun = true;
      if (l.sunElevDeg <= -(opts.twilight ?? TWILIGHT_DEG)) cur.anyDark = true;
      if (l.visible) {
        const last = cur.visibleRanges[cur.visibleRanges.length - 1];
        if (last && last[1] >= t - stepS - 1e-6) last[1] = t; else cur.visibleRanges.push([t, t]);
      }
    } else if (cur) {
      passes.push(cur);
      cur = null;
    }
  }
  if (cur) passes.push(cur);
  for (const p of passes) p.visible = p.visibleRanges.length > 0;
  return passes;
}

/**
 * Why there is nothing to see, in a form the page can turn into a sentence.
 * Reasons are checked in the order a visitor could do something about them.
 */
export function whyNone(passes, latDeg) {
  if (passes.some((p) => p.visible)) return null;
  const high = passes.filter((p) => p.maxElevDeg >= MIN_ELEV_DEG);
  if (passes.length === 0) return "never-up";
  if (high.length === 0) return "too-low";
  if (!high.some((p) => p.anyDark)) return "daylight";
  if (!high.some((p) => p.anySun)) return "shadow";
  return "mismatch"; // dark enough and sunlit, but never both while it is high
}

/** The farthest latitude from which a pass can reach `elevDeg` above the horizon. */
export function maxLatitudeFor(elevDeg = MIN_ELEV_DEG, altKm = ALT_KM, incDeg = INC_DEG) {
  const r = R_EARTH + altKm;
  const e = elevDeg * DEG;
  // Earth-centre angle between observer and sub-station point at elevation e.
  const lam = Math.acos((R_EARTH * Math.cos(e)) / r) - e;
  return Math.min(90, incDeg + lam / DEG);
}

/** The ground track for the day, for drawing: t, lat, lon every `stepS`. */
export function dayTrack(sc, stepS = 60) {
  const out = [];
  for (let t = 0; t <= DAY_S; t += stepS) out.push({ t, ...subPoint(t, sc) });
  return out;
}
