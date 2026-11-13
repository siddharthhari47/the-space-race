// Re-entry from the Moon, as a model small enough to run in a click.
//
// This file has no DOM in it and no state of its own. The page turns an angle
// into a call here; tools/reentry-check.mjs calls the same functions, so the
// numbers the visitor sees are the numbers that were tested.
//
// WHAT THIS IS, PLAINLY. A simplified model, not a flight simulation.
//   * a point mass: no attitude, no angle of attack, no roll dynamics
//   * planar: the path stays in one plane through the centre of the Earth
//   * a non-rotating Earth, so inertial speed and speed through the air
//     are the same number
//   * a sourced standard atmosphere (see density()), no weather, no winds
//   * a constant ballistic coefficient and a constant lift-to-drag ratio
//     (the real capsule's coefficients change with Mach number)
//   * Sutton-Graves stagnation-point heating: the CONVECTIVE part only (at
//     lunar-return speed there is radiative heating as well, which is left
//     out), and with the wall enthalpy left out too
//   * the load factor for a partial roll is the drag times sqrt(1 + (L/D x
//     the up-or-down share)^2). A real capsule's total aerodynamic force is the
//     same size at every roll angle, so a partial roll here reads up to 4.4
//     percent low. That moves the corridor edges by a few hundredths of a
//     degree, and the model keeps the simpler form
// Every number this file computes is a model output. The numbers about real
// flights are in the constants below, each with the document it came from.
// Do not read a model output as a statement about a real flight.
//
// The one place the model is deliberately blunt: "skipped out". The moment
// the capsule climbs back above the entry interface the run stops and is
// called a skip-out. A real capsule that skips can come down again further
// on; the exhibit treats it as a failed entry because Apollo's corridor did.

import { atmosphere } from "./atmosphere.js";

/* ---------- Sourced constants ---------- */

// Earth radius and surface gravity. The radius is the effective one the 1976
// U.S. Standard Atmosphere uses to turn geometric height into geopotential
// height: r0 = 6356.766 km, "the value of r0 used in this Standard"
// (NASA TM X-74335, the 1976 standard, NTRS 19770009539, page 4). g0 =
// 9.80665 m/s^2 is the standard gravity from the same page, and the one
// atmosphere.js already uses. The model's own gravity falls as 1/r^2 from
// there, so mu = g0 * r0^2. It is the atmosphere's Earth, a sphere the size
// the atmosphere tables assume, not the mean radius of the real one.
//
// PROVENANCE, PLAINLY. The 1976 standard itself was opened this session
// (scanned pages, read as images). Read from it: r0, g0, the sea-level values
// T0 = 288.15 K, M0 = 28.9644 kg/kmol and R* = 8.31432e3 N m / (kmol K), and
// Table 4's layer bases (32, 47, 51, 71 and 84.852 km') with gradients +2.8,
// 0, -2.8 and -2.0 K/km'. The constant AF below is g0 M0 / R*, worked out
// from those. The layer base temperatures follow from T0 and the gradients.
// NOT re-read from the table: the base densities at 32, 47, 51 and 71 km.
// They are the standard's published values typed in from knowledge of it, and
// tools/reentry-check.mjs checks that each follows from the one below through
// the layer formula to five figures and that the 32 km value agrees with the
// ISA table atmosphere.js is tested against. NASA CR-150778 (King), which
// describes the same method, is cited for the method only.
export const R_EARTH = 6356766; // m
export const G0 = 9.80665; // m/s^2
export const MU = G0 * R_EARTH * R_EARTH; // m^3/s^2

// The entry interface: 400 000 ft above the surface. NASA TN D-6725, Graves
// and Harpold, "Apollo Experience Report - Entry Mission Planning for
// Apollo", and NASA TN D-5399 (Apollo 4 / AS-501 entry report), both use
// this height as the point where entry begins. 400 000 ft = 121.92 km.
export const H_INTERFACE = 121920; // m

// Lunar-return entry speed. Apollo 10's best-estimated entry state at the
// interface was 36 309.257 ft/s at a flight-path angle of -6.616 degrees
// (TN D-6725, Table II). 36 309.257 ft/s = 11 067 m/s. Inertial speed.
export const V_MOON = 11067; // m/s
export const FPA_APOLLO10 = -6.616; // degrees, TN D-6725 Table II

// Apollo 11 aimed for a -6.48 degree entry; the figures and text of TN D-6725
// give 6.48 degrees. Kept for the plausibility check in tools/.
export const FPA_APOLLO11 = -6.48; // degrees, TN D-6725

// Command module mass at entry, 12 150 lb (TN D-6725, description of the
// Apollo 11 command module). 12 150 lb = 5511 kg.
export const MASS = 5511; // kg
// Reference area, 129.35 ft^2 (NASA TN D-5399 nomenclature) = 12.017 m^2.
export const AREA = 12.017; // m^2
// Hypersonic drag coefficient, 1.2891 for Mach above 29.5 (TN D-6725,
// Table I). Note that the sources are mixed here: the mass is Apollo 11's, the
// area Apollo 4's, the drag coefficient the report's high-Mach value, and the
// L/D below its trim value. They describe one command-module shape, not one
// flight. Held constant all the way down here, which the real capsule did
// not: Table I shows it falling to 0.85 at Mach 0.4.
export const CD = 1.2891;
// Trim lift-to-drag ratio, 0.30 (TN D-6725, Table I at Mach 10 reads
// 0.30076, and the text calls the trim value 0.30).
export const LD_APOLLO = 0.3;
// Ballistic coefficient that follows from the three numbers above.
export const BETA = MASS / (CD * AREA); // kg/m^2, about 356

// Radius of the heat shield's spherical face, 183.5 in (TN D-5399, Figure 9
// cross-section of the aft heat shield) = 4.661 m. Used as the body radius in
// the heating formula.
export const NOSE_RADIUS = 4.661; // m

// Sutton-Graves heat-transfer coefficient for air, K = 0.1262
// kg / (s m^1.5 atm^0.5) (NASA TR R-376, Sutton and Graves, Table II). The
// formula there is q = K * sqrt(p_s / R) * (h_s - h_w). Here p_s is the
// stagnation pressure in atmospheres, R the body radius in metres, h_s the
// stagnation enthalpy in J/kg.
export const K_SG = 0.1262;
const ATM = 101325; // Pa; "1 atmosphere equals 101.325 kN/m^2" (TN R-376)

// The exhibit's g limit: 12 g. TN D-6725 draws the steep side of the Apollo
// entry corridor at a maximum aerodynamic load factor of 12 g. That is a
// design boundary for the corridor, not a measured limit for a person.
export const G_LIMIT = 12;

/* ---------- Atmosphere ---------- */

// Geopotential height from geometric height, H = r0 h / (r0 + h)
// (USSA-1976).
const toGeopotential = (h) => (R_EARTH * h) / (R_EARTH + h);

// Layers above 32 km, the 1976 standard's values (see the provenance note near
// R_EARTH). Each has a base geopotential height in
// km, a base temperature in K, a temperature gradient in K/km and a base
// density in kg/m^3. The density follows the standard form
// rho = rho_b * (T_b / T)^(1 + AF / L), or an exponential when L = 0, where
// AF = g0 * M0 / R* = 34.16319474 K/km (the 1976 standard's constant).
const AF = 34.16319474;
const LAYERS = [
  { H: 32, T: 228.65, L: 2.8, rho: 1.3225e-2 },
  { H: 47, T: 270.65, L: 0, rho: 1.4275e-3 },
  { H: 51, T: 270.65, L: -2.8, rho: 8.616e-4 },
  { H: 71, T: 214.65, L: -2.0, rho: 6.4211e-5 },
];
// The standard atmosphere's last layer ends at 86 km geometric, which is
// 84.852 km geopotential.
const H_TOP = 84.852;

function layerDensity(layer, Hkm) {
  const dh = Hkm - layer.H;
  if (layer.L === 0) return layer.rho * Math.exp((-AF * dh) / layer.T);
  const T = layer.T + layer.L * dh;
  return layer.rho * Math.pow(layer.T / T, 1 + AF / layer.L);
}

// Above 86 km the model has no sourced table. THE EXHIBIT'S OWN EXTENSION:
// density keeps falling exponentially from its 86 km value at the scale
// height the last layer ends with (T / (L + AF), about 5.8 km). The entry
// interface is 36 km above that, where the air is about a quarter of a
// percent of what it is at 86 km (an extension, not a table value), and tools/reentry-check.mjs shows that
// cutting this extension off altogether moves the peak load by less than
// 1 percent.
const topLayer = LAYERS[3];
const T_TOP = topLayer.T + topLayer.L * (H_TOP - topLayer.H);
const RHO_TOP = layerDensity(topLayer, H_TOP);
const SCALE_TOP = (T_TOP / (topLayer.L + AF)) * 1000; // m

/**
 * Air density at a geometric height, kg/m^3. Below 32 km this is the same
 * atmosphere.js the other exhibits use, so the site agrees with itself.
 * @param {number} h geometric height in metres
 */
export function density(h, { extension = true } = {}) {
  const H = toGeopotential(Math.max(0, h)) / 1000; // km
  if (H <= 32) return atmosphere(H * 1000).rho;
  if (H <= H_TOP) {
    let layer = LAYERS[0];
    for (const l of LAYERS) if (H >= l.H) layer = l;
    return layerDensity(layer, H);
  }
  if (!extension) return 0;
  return RHO_TOP * Math.exp(-(H - H_TOP) * 1000 / SCALE_TOP);
}

/* ---------- Dynamics ---------- */

const D2R = Math.PI / 180;
export const gravity = (r) => MU / (r * r);

/** Circular-orbit speed at the entry interface, m/s. Computed, not sourced. */
export const V_LEO = Math.sqrt(MU / (R_EARTH + H_INTERFACE));

/**
 * The roll setting, as the share of the lift that points up. 1 is lift fully
 * up, 0 is lift sideways (no net up or down, so in this planar model the
 * same as having no lift at all), -1 is lift fully down. Apollo's crew and
 * guidance steered by rolling the capsule about its velocity this way
 * (TN D-6725). A real roll sends the rest of the lift sideways, out of the
 * plane; the planar model throws that part away, which is the exhibit's own
 * simplification, and it is why the cross-range Apollo could fly is missing.
 */
export const rollMode = (f) => ({ ld: LD_APOLLO * Math.abs(f), sign: Math.sign(f) });
export const MODES = {
  ballistic: rollMode(0),
  up: rollMode(1),
  down: rollMode(-1),
};
export const ROLL_STOPS = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];

// State: [r, theta, v, gamma]. r metres from the Earth's centre, theta the
// angle travelled round the Earth, v speed, gamma flight-path angle above
// the local horizontal (negative going down).
function deriv(s, mode, beta, out) {
  const r = s[0];
  const v = s[2];
  const gam = s[3];
  const h = r - R_EARTH;
  const rho = density(h);
  const q = 0.5 * rho * v * v; // Pa
  const drag = q / beta; // m/s^2, = D / m
  const lift = drag * mode.ld * mode.sign; // m/s^2, signed by the roll
  const g = gravity(r);
  out[0] = v * Math.sin(gam);
  out[1] = (v * Math.cos(gam)) / r;
  out[2] = -drag - g * Math.sin(gam);
  out[3] = lift / v + (v / r - g / v) * Math.cos(gam);
}

function rk4(s, dt, mode, beta, k1, k2, k3, k4, tmp) {
  deriv(s, mode, beta, k1);
  for (let i = 0; i < 4; i++) tmp[i] = s[i] + 0.5 * dt * k1[i];
  deriv(tmp, mode, beta, k2);
  for (let i = 0; i < 4; i++) tmp[i] = s[i] + 0.5 * dt * k2[i];
  deriv(tmp, mode, beta, k3);
  for (let i = 0; i < 4; i++) tmp[i] = s[i] + dt * k3[i];
  deriv(tmp, mode, beta, k4);
  for (let i = 0; i < 4; i++) s[i] += (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
}

/**
 * Fly one entry.
 *
 * Fixed-step fourth-order Runge-Kutta. A fixed step is used instead of an
 * adaptive one so that "halve the step" in the checks means exactly that.
 * The default 0.25 s keeps the error far below the 1 percent the checks ask
 * for, and costs about 3000 steps for a whole entry.
 *
 * @param {object} o
 * @param {number} o.fpa flight-path angle at the interface, degrees (negative)
 * @param {number} [o.speed] m/s
 * @param {number|string|object} [o.mode] roll share f in -1..1, or "ballistic" | "up" | "down"
 * @param {number} [o.dt] seconds
 * @param {number} [o.sampleEvery] seconds between stored path points; 0 = none
 * @param {number} [o.gLimit]
 * @returns {{outcome:"skip"|"over"|"safe", peakG:number, peakHeat:number,
 *   heatLoad:number, tEnd:number, range:number, vEnd:number, path:Array}}
 */
export function fly({
  fpa,
  speed = V_MOON,
  mode = "ballistic",
  dt = 0.25,
  sampleEvery = 0,
  gLimit = G_LIMIT,
  beta = BETA,
  tMax = 4000,
} = {}) {
  const m = typeof mode === "number" ? rollMode(mode) : typeof mode === "string" ? MODES[mode] : mode;
  const s = [R_EARTH + H_INTERFACE, 0, speed, fpa * D2R];
  const k1 = [0, 0, 0, 0];
  const k2 = [0, 0, 0, 0];
  const k3 = [0, 0, 0, 0];
  const k4 = [0, 0, 0, 0];
  const tmp = [0, 0, 0, 0];

  let t = 0;
  let peakG = 0;
  let peakHeat = 0; // W/cm^2
  let heatLoad = 0; // J/cm^2
  let outcome = null;
  let nextSample = 0;
  const path = [];

  // Load factor and heating from the state, called at every step. The load
  // factor is the whole aerodynamic force over weight at sea-level gravity,
  // which is how the Apollo corridor counted it (resultant of drag and
  // lift), so lift adds a little: sqrt(1 + (L/D)^2) times the drag.
  const instruments = (st) => {
    const h = st[0] - R_EARTH;
    const rho = density(h);
    const v = st[2];
    const drag = (0.5 * rho * v * v) / beta;
    const g = (drag * Math.sqrt(1 + m.ld * m.ld)) / G0;
    // Stagnation pressure taken as rho v^2, the hypersonic limit; the heat
    // formula wants it in atmospheres. Stagnation enthalpy v^2 / 2, wall
    // enthalpy left out (small next to it at these speeds).
    const ps = (rho * v * v) / ATM;
    const q = K_SG * Math.sqrt(ps / NOSE_RADIUS) * 0.5 * v * v; // W/m^2
    return { g, q: q / 1e4, h };
  };

  while (t < tMax) {
    const inst = instruments(s);
    if (inst.g > peakG) peakG = inst.g;
    if (inst.q > peakHeat) peakHeat = inst.q;
    if (sampleEvery > 0 && t >= nextSample - 1e-9) {
      path.push({ t, h: inst.h, theta: s[1], v: s[2], gam: s[3], g: inst.g, q: inst.q });
      nextSample += sampleEvery;
    }
    // Skip-out: above the interface and still climbing, after the capsule
    // has gone below it. The start is at the interface, so a run is allowed
    // to begin there without counting as having left.
    if (t > 0 && inst.h > H_INTERFACE && s[3] > 0) {
      outcome = "skip";
      break;
    }
    if (inst.h <= 0) break;
    heatLoad += inst.q * dt;
    rk4(s, dt, m, beta, k1, k2, k3, k4, tmp);
    t += dt;
  }

  if (!outcome) outcome = peakG > gLimit ? "over" : "safe";

  const last = instruments(s);
  if (sampleEvery > 0) path.push({ t, h: Math.max(0, last.h), theta: s[1], v: s[2], gam: s[3], g: last.g, q: last.q });
  return { outcome, peakG, peakHeat, heatLoad, tEnd: t, range: s[1] * R_EARTH, vEnd: s[2], path };
}

/* ---------- Corridor ---------- */

// Convention for the edges, in degrees of flight-path angle (negative =
// downward): `shallow` is the shallowest angle that still stays in, and
// `steep` the steepest that stays under the g limit. Shallow is the number
// closer to zero. Width = shallow - steep, in degrees.
//
// Bisection assumes the outcome changes once, from skip to safe to over, as
// the angle gets steeper. tools/reentry-check.mjs checks that against a brute
// force sweep, and that the monotonic assumption holds in this model.

const FLOOR_FPA = -20; // steeper than this the model is no longer interesting
export const CEIL_FPA = -0.5; // shallower: a skip for any of these capsules

/**
 * @param {object} o  same options as fly() minus fpa
 * @returns {{shallow:number, steep:number, width:number, open:boolean}}
 */
export function corridor(o = {}, tol = 0.001) {
  const run = (fpa) => fly({ ...o, fpa, sampleEvery: 0 }).outcome;
  // At low-orbit speed nothing skips out in this model, even at the
  // shallowest angle tried, so there is no shallow edge. `open` says so, and
  // `shallow` is then just the shallowest angle the search looks at.
  const open = run(CEIL_FPA) !== "skip";
  let shallow = CEIL_FPA;
  if (!open) {
    // shallow edge: the boundary between "skip" (shallower) and not skip.
    let lo = FLOOR_FPA; // not a skip
    let hi = CEIL_FPA; // skip
    while (hi - lo > tol) {
      const mid = 0.5 * (lo + hi);
      if (run(mid) === "skip") hi = mid;
      else lo = mid;
    }
    shallow = lo;
  }
  // steep edge: the boundary between "safe" and "over".
  let a = shallow; // not over (it is at least in the atmosphere)
  let b = FLOOR_FPA; // over
  while (a - b > tol) {
    const mid = 0.5 * (a + b);
    if (run(mid) === "over") b = mid;
    else a = mid;
  }
  return { shallow, steep: a, width: shallow - a, open };
}

/** Same edges by trying every angle on a grid; slow, used to check corridor(). */
export function corridorBrute(o = {}, step = 0.01) {
  let shallow = null;
  let steep = null;
  for (let fpa = CEIL_FPA; fpa >= FLOOR_FPA - 1e-9; fpa -= step) {
    const out = fly({ ...o, fpa, sampleEvery: 0 }).outcome;
    if (out === "safe") {
      if (shallow === null) shallow = fpa;
      steep = fpa;
    }
  }
  return { shallow, steep, width: shallow - steep };
}

/**
 * The corridor for a pilot who may pick any roll setting, one for the whole
 * entry. The safe sets of neighbouring roll settings overlap, so the union
 * runs from the shallowest of the shallow edges to the steepest of the steep
 * edges. `best` names the roll that gives each edge.
 */
export function corridorAnyRoll(o = {}, stops = ROLL_STOPS, tol = 0.01) {
  let shallow = -Infinity;
  let steep = Infinity;
  let shallowRoll = 0;
  let steepRoll = 0;
  const each = [];
  for (const f of stops) {
    const c = corridor({ ...o, mode: f }, tol);
    each.push({ roll: f, ...c });
    // A roll with no safe pocket at all (width 0) does not extend the window.
    if (c.width <= 2 * tol) continue;
    if (c.shallow > shallow) { shallow = c.shallow; shallowRoll = f; }
    if (c.steep < steep) { steep = c.steep; steepRoll = f; }
  }
  const open = each.some((e) => e.open && e.width > 2 * tol);
  return { shallow, steep, width: shallow - steep, shallowRoll, steepRoll, open, each };
}
