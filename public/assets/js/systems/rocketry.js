// Rocketry — vehicle sizing and a real ascent integration.
//
// Deliberately free of any DOM reference so it can be run and checked in
// Node (see tools/rocketry-check.mjs). A launch simulation you cannot test
// is a launch animation.
//
// What is modelled honestly:
//
//   * Tsiolkovsky per stage, on the actual stacked masses, so dropping a
//     spent stage changes the mass ratio of the next one — which is the
//     entire reason staging exists and the thing the exhibit is built to
//     demonstrate.
//   * Thrust and Isp varying with ambient pressure. Mass flow is held
//     constant, because it is set by the turbopump, and thrust is then
//     m_dot * Isp(h) * g0. That is the right way round: a vacuum engine
//     isn't burning faster up high, it is getting more out of the same
//     propellant because there is no atmosphere pushing back on the plume.
//   * Drag with a Mach-dependent Cd, so the transonic rise is there and
//     max-Q lands where it should.
//   * Gravity as an inverse-square field, not a constant g. Over a 200 km
//     climb the difference is about 6%, which matters at this precision.
//   * RK4 integration at a fixed 0.1 s step.
//   * The final orbit from the state vector at burnout, via specific
//     energy and angular momentum. Nothing is assumed circular.
//
// What is simplified, and where that shows:
//
//   * Planar and non-rotating. A real launch eastward from Cape Canaveral
//     gets about 400 m/s free from Earth's rotation; here it gets nothing,
//     so vehicles need very slightly more than reality to reach the same
//     orbit.
//   * Stage one's pitch program is prescribed as a function of altitude
//     rather than being a true gravity turn driven by the velocity vector.
//     It is a shape, not a solution. Stage two is closed-loop and does
//     steer (see guidancePitch), which is what lets the vehicle actually
//     circularise instead of arriving with its periapsis underground.
//   * Above 32 km the standard atmosphere stops, and density is extended
//     as a simple exponential. Drag up there is negligible, so this is a
//     tidiness measure rather than a physics claim.

import { atmosphere } from "./atmosphere.js";

export const G0 = 9.80665; // m/s^2, the definition used for Isp
export const MU = 3.986004418e14; // m^3/s^2
export const R_EARTH = 6371000; // m

/* ---------- Engines ----------

   Published figures. Sea-level and vacuum values are given separately
   because the difference between them is a third of the story: the F-1
   loses 41 seconds of Isp at sea level, and the RL10 has no sea-level
   rating at all because it would never be lit there. */

export const ENGINES = {
  merlin1d: {
    id: "merlin1d",
    name: "Merlin 1D",
    vehicle: "Falcon 9 first stage",
    propellant: "RP-1 / LOX",
    thrustSl: 845e3,
    thrustVac: 981e3,
    ispSl: 282,
    ispVac: 311,
    stage: 1,
  },
  f1: {
    id: "f1",
    name: "F-1",
    vehicle: "Saturn V first stage",
    propellant: "RP-1 / LOX",
    thrustSl: 6770e3,
    thrustVac: 7770e3,
    ispSl: 263,
    ispVac: 304,
    stage: 1,
  },
  rd180: {
    id: "rd180",
    name: "RD-180",
    vehicle: "Atlas V first stage",
    propellant: "RP-1 / LOX",
    thrustSl: 3830e3,
    thrustVac: 4152e3,
    ispSl: 311,
    ispVac: 338,
    stage: 1,
  },
  mvac: {
    id: "mvac",
    name: "Merlin Vacuum",
    vehicle: "Falcon 9 second stage",
    propellant: "RP-1 / LOX",
    thrustSl: 0,
    thrustVac: 981e3,
    ispSl: 0,
    ispVac: 348,
    stage: 2,
  },
  j2: {
    id: "j2",
    name: "J-2",
    vehicle: "Saturn V upper stages",
    propellant: "LH2 / LOX",
    thrustSl: 0,
    thrustVac: 1033e3,
    ispSl: 0,
    ispVac: 421,
    stage: 2,
  },
  rl10: {
    id: "rl10",
    name: "RL10B-2",
    vehicle: "Delta IV upper stage",
    propellant: "LH2 / LOX",
    thrustSl: 0,
    thrustVac: 110e3,
    ispSl: 0,
    ispVac: 465.5,
    stage: 2,
  },
};

// Structural coefficient: dry mass as a fraction of propellant mass.
// Falcon 9's first stage is about 22 t dry on 411 t of propellant, so 5.4%,
// and its second stage about 4 t on 107.5 t, so a little under 4%. Upper
// stages get away with less structure per unit of propellant because they
// never carry the whole stack's weight or fly through the thick air.
// Holding these fixed means the propellant slider moves a real mass ratio
// rather than a free parameter.
export const STRUCTURE = { stage1: 0.055, stage2: 0.045 };

export const ROCKET_DIAMETER = 3.7; // m, Falcon-9-like
const REF_AREA = Math.PI * (ROCKET_DIAMETER / 2) ** 2;

/* ---------- Vehicle ---------- */

export function buildVehicle(cfg) {
  const e1 = ENGINES[cfg.engine1];
  const e2 = ENGINES[cfg.engine2];

  const dry1 = cfg.prop1 * STRUCTURE.stage1;
  const dry2 = cfg.prop2 * STRUCTURE.stage2;

  const stage2Wet = cfg.prop2 + dry2;
  const liftoffMass = cfg.prop1 + dry1 + stage2Wet + cfg.payload;

  // Mass flow is a property of the engine, not of where it is.
  const mdot1 = (e1.thrustVac / (e1.ispVac * G0)) * cfg.engines1;
  const mdot2 = (e2.thrustVac / (e2.ispVac * G0)) * cfg.engines2;

  return {
    e1, e2, dry1, dry2, stage2Wet, liftoffMass,
    mdot1, mdot2,
    burn1: cfg.prop1 / mdot1,
    burn2: cfg.prop2 / mdot2,
    thrust1Sl: e1.thrustSl * cfg.engines1,
    thrust1Vac: e1.thrustVac * cfg.engines1,
    thrust2Vac: e2.thrustVac * cfg.engines2,
    twr: (e1.thrustSl * cfg.engines1) / (liftoffMass * G0),
  };
}

/**
 * Ideal delta-v, per stage and total, from the rocket equation.
 * Uses vacuum Isp for stage 2 and a pressure-weighted effective Isp for
 * stage 1 — a first stage spends most of its burn well above sea level,
 * so quoting its sea-level Isp would understate it badly.
 */
export function deltaV(cfg) {
  const v = buildVehicle(cfg);

  // Effective stage-1 Isp: the flight-averaged value lands close to
  // three-quarters of the way from sea level to vacuum, because ambient
  // pressure falls off exponentially and most of the burn happens high.
  const isp1 = v.e1.ispSl + (v.e1.ispVac - v.e1.ispSl) * 0.75;

  const m0 = v.liftoffMass;
  const m1 = v.dry1 + v.stage2Wet + cfg.payload;
  const dv1 = isp1 * G0 * Math.log(m0 / m1);

  const m2 = v.stage2Wet + cfg.payload;
  const m3 = v.dry2 + cfg.payload;
  const dv2 = v.e2.ispVac * G0 * Math.log(m2 / m3);

  return { dv1, dv2, total: dv1 + dv2, isp1 };
}

/* ---------- Atmosphere beyond the ISA ---------- */

function densityAt(h) {
  if (h <= 32000) return atmosphere(h).rho;
  // Above the modelled range, extend exponentially from the 32 km value.
  // Drag here is already four orders of magnitude below max-Q, so the
  // shape matters more than the exact scale height.
  const rho32 = atmosphere(32000).rho;
  return rho32 * Math.exp(-(h - 32000) / 7500);
}

function pressureAt(h) {
  if (h <= 32000) return atmosphere(h).p;
  return atmosphere(32000).p * Math.exp(-(h - 32000) / 7500);
}

function soundSpeedAt(h) {
  return atmosphere(Math.min(h, 32000)).a;
}

// Drag coefficient against Mach for a slender launch vehicle. The hump is
// the transonic drag rise; it is why max-Q happens where it does and why
// vehicles throttle down through it.
function dragCoefficient(mach) {
  if (mach < 0.8) return 0.3;
  if (mach < 1.2) return 0.3 + (mach - 0.8) * 0.625; // rises to 0.55
  if (mach < 5) return 0.55 - (mach - 1.2) * 0.0658; // falls back toward 0.3
  return 0.25;
}

/* ---------- Pitch program ---------- */

// Vertical off the pad, then over. Expressed against altitude rather than
// time so it behaves sensibly no matter how the vehicle is configured — a
// heavy, sluggish rocket and a light one follow the same shape of path,
// they just take different times to walk along it.
// Stage one flies an open-loop pitch program: straight up until it is clear
// of the pad, then over on a fixed curve. Larger exponents pitch harder and
// earlier. 1.8 puts the vehicle near 45 degrees at around 30 km, which is
// where a real ascent is.
export const PITCH_EXPONENT = 1.8;

function pitchAngle(h, turnStart, turnEnd, exp = PITCH_EXPONENT) {
  if (h < turnStart) return Math.PI / 2;
  if (h >= turnEnd) return 0;
  const t = (h - turnStart) / (turnEnd - turnStart);
  return (Math.PI / 2) * Math.pow(1 - t, exp);
}

/**
 * Stage two closes the loop, because an open-loop curve fundamentally
 * cannot do this job. A prescribed pitch angle has no way to stop climbing:
 * point it horizontally and it still coasts upward on whatever vertical
 * speed it already had, so it arrives at a huge apoapsis with its periapsis
 * underground. Every launch vehicle solves this the same way — it steers.
 *
 * The command is built from what the vehicle actually needs vertically:
 *
 *     a_vert = (mu/r^2  -  v_horizontal^2 / r)  +  Kp * (v_up_wanted - v_up)
 *              \______ gravity ______/  \__ centrifugal __/
 *
 * The first bracket is the interesting one. It is gravity minus the upward
 * relief you get from already going sideways fast, so it falls to zero
 * exactly when horizontal speed reaches orbital velocity. At that moment
 * the vehicle stops needing to hold itself up at all, the commanded pitch
 * goes flat, and everything left over goes into going faster. The orbit
 * circularises itself, which is the correct behaviour arrived at honestly
 * rather than by special-casing.
 *
 * The second term is a proportional controller that walks vertical speed
 * toward whatever gets it to the target altitude.
 */
function guidancePitch({ alt, r, vUp, vEast, aThrust, targetAlt }) {
  const vUpWanted = Math.max(-80, Math.min(250, (targetAlt - alt) * 0.025));
  const centrifugal = (vEast * vEast) / r;
  const aVert = MU / (r * r) - centrifugal + 0.35 * (vUpWanted - vUp);
  if (aThrust <= 0) return 0;

  const commanded = Math.asin(Math.max(-1, Math.min(1, aVert / aThrust)));

  // Cap how far up the stage is ever allowed to point, and this is the
  // whole trick rather than a safety clamp. Early in a second-stage burn
  // the vertical demand above is often larger than the thrust available:
  // the vehicle simply cannot hold itself up yet. Obeying that literally
  // pitches it straight at the sky, which is the worst possible answer —
  // it burns the stage fighting gravity and arrives nowhere.
  //
  // The way out is counter-intuitive and is the real lesson of orbital
  // flight. If you cannot hold yourself up, go sideways faster. Horizontal
  // speed feeds the centrifugal term, the centrifugal term cancels gravity,
  // and the need to point up disappears on its own. So the cap forces the
  // stage to spend its thrust where it actually buys something.
  return Math.max(MIN_PITCH, Math.min(MAX_PITCH, commanded));
}

const MAX_PITCH = (28 * Math.PI) / 180;
const MIN_PITCH = (-12 * Math.PI) / 180;

/* ---------- Orbit from a state vector ---------- */

export function orbitFromState(pos, vel) {
  const r = Math.hypot(pos.x, pos.y);
  const v = Math.hypot(vel.x, vel.y);
  const energy = (v * v) / 2 - MU / r;
  const h = pos.x * vel.y - pos.y * vel.x; // specific angular momentum

  if (energy >= 0) {
    return { escape: true, apoapsis: Infinity, periapsis: r - R_EARTH, e: 1, a: Infinity };
  }

  const a = -MU / (2 * energy);
  const eSq = 1 + (2 * energy * h * h) / (MU * MU);
  const e = Math.sqrt(Math.max(0, eSq));
  return {
    escape: false,
    a,
    e,
    apoapsis: a * (1 + e) - R_EARTH,
    periapsis: a * (1 - e) - R_EARTH,
  };
}

/* ---------- Ascent integration ---------- */

/**
 * Fly the vehicle. Returns the full trajectory plus an outcome, computed
 * up front so playback is just replaying an array — the physics never
 * depends on frame rate.
 */
export function simulate(cfg) {
  const v = buildVehicle(cfg);
  const dt = 0.1;
  const maxTime = 900;

  let pos = { x: 0, y: R_EARTH };
  let vel = { x: 0, y: 0 };
  let mass = v.liftoffMass;
  let t = 0;
  let stage = 1;
  let prop1 = cfg.prop1;
  let prop2 = cfg.prop2;
  let separated = false;

  const path = [];
  let maxQ = 0;
  let maxQAlt = 0;
  let maxQTime = 0;
  let sepTime = null;
  let secoTime = null;
  let propRemaining = 0;
  let dragLoss = 0;
  let gravityLoss = 0;

  // One derivative evaluation. Returns accelerations and the propellant
  // burn rate at this state, which is what RK4 needs to step.
  function derivative(p, vv, m, currentStage, hasProp) {
    const r = Math.hypot(p.x, p.y);
    const alt = r - R_EARTH;
    const up = { x: p.x / r, y: p.y / r };
    const east = { x: up.y, y: -up.x };

    // Gravity
    const gMag = MU / (r * r);
    let ax = -up.x * gMag;
    let ay = -up.y * gMag;

    // Thrust
    let mdot = 0;
    if (hasProp) {
      const eng = currentStage === 1 ? v.e1 : v.e2;
      const n = currentStage === 1 ? cfg.engines1 : cfg.engines2;
      const flow = currentStage === 1 ? v.mdot1 : v.mdot2;
      const pRatio = pressureAt(Math.max(0, alt)) / 101325;
      const isp = eng.ispVac - (eng.ispVac - eng.ispSl) * pRatio;
      const thrust = flow * isp * G0;

      const theta =
        currentStage === 1
          ? pitchAngle(alt, cfg.turnStart, cfg.turnEnd, cfg.pitchExp ?? PITCH_EXPONENT)
          : guidancePitch({
              alt,
              r,
              vUp: vv.x * up.x + vv.y * up.y,
              vEast: vv.x * east.x + vv.y * east.y,
              aThrust: thrust / m,
              targetAlt: cfg.targetAlt ?? 250000,
            });

      const dir = {
        x: up.x * Math.sin(theta) + east.x * Math.cos(theta),
        y: up.y * Math.sin(theta) + east.y * Math.cos(theta),
      };
      ax += (dir.x * thrust) / m;
      ay += (dir.y * thrust) / m;
      mdot = flow;
      void n;
    }

    // Drag, opposing the velocity vector
    const speed = Math.hypot(vv.x, vv.y);
    let q = 0;
    if (speed > 1 && alt < 120000) {
      const rho = densityAt(Math.max(0, alt));
      q = 0.5 * rho * speed * speed;
      const cd = dragCoefficient(speed / soundSpeedAt(Math.max(0, alt)));
      const dragForce = q * cd * REF_AREA;
      ax -= (dragForce * vv.x) / speed / m;
      ay -= (dragForce * vv.y) / speed / m;
    }

    return { ax, ay, mdot, q, alt, gMag };
  }

  while (t < maxTime) {
    const hasProp = (stage === 1 && prop1 > 0) || (stage === 2 && prop2 > 0);
    const k1 = derivative(pos, vel, mass, stage, hasProp);

    const r = Math.hypot(pos.x, pos.y);
    const alt = r - R_EARTH;

    path.push({
      t,
      x: pos.x,
      y: pos.y,
      // Velocity is carried too, not just speed, so the renderer can draw
      // the orbit from any point on the path without re-deriving it.
      vx: vel.x,
      vy: vel.y,
      alt,
      speed: Math.hypot(vel.x, vel.y),
      mass,
      stage,
      q: k1.q,
      thrusting: hasProp,
    });

    if (k1.q > maxQ) {
      maxQ = k1.q;
      maxQAlt = alt;
      maxQTime = t;
    }

    // Losses, accumulated for the debrief. Gravity loss is the component
    // of g along the flight path; drag loss is the deceleration from drag.
    // Together they are the gap between ideal delta-v and what actually
    // ended up as orbital velocity.
    const speed = Math.hypot(vel.x, vel.y);
    if (speed > 1) {
      const up = { x: pos.x / r, y: pos.y / r };
      const vHat = { x: vel.x / speed, y: vel.y / speed };
      gravityLoss += k1.gMag * (up.x * vHat.x + up.y * vHat.y) * dt;
      const rho = densityAt(Math.max(0, alt));
      const cd = dragCoefficient(speed / soundSpeedAt(Math.max(0, alt)));
      dragLoss += ((0.5 * rho * speed * speed * cd * REF_AREA) / mass) * dt;
    }

    // Stop if it hits the ground on the way back down.
    if (alt < 0 && t > 5) break;
    // Or if it is clearly done and coasting far from anything interesting.
    if (!hasProp && stage === 2 && prop2 <= 0 && alt > 0) {
      const orb = orbitFromState(pos, vel);
      if (orb.escape || orb.periapsis > 100000 || t > 600) break;
      if (alt > 400000 && vel.y < 0) break;
    }

    // RK4
    const half = dt / 2;
    const p2 = { x: pos.x + vel.x * half, y: pos.y + vel.y * half };
    const v2 = { x: vel.x + k1.ax * half, y: vel.y + k1.ay * half };
    const k2 = derivative(p2, v2, mass - k1.mdot * half, stage, hasProp);

    const p3 = { x: pos.x + v2.x * half, y: pos.y + v2.y * half };
    const v3 = { x: vel.x + k2.ax * half, y: vel.y + k2.ay * half };
    const k3 = derivative(p3, v3, mass - k2.mdot * half, stage, hasProp);

    const p4 = { x: pos.x + v3.x * dt, y: pos.y + v3.y * dt };
    const v4 = { x: vel.x + k3.ax * dt, y: vel.y + k3.ay * dt };
    const k4 = derivative(p4, v4, mass - k3.mdot * dt, stage, hasProp);

    pos = {
      x: pos.x + (dt / 6) * (vel.x + 2 * v2.x + 2 * v3.x + v4.x),
      y: pos.y + (dt / 6) * (vel.y + 2 * v2.y + 2 * v3.y + v4.y),
    };
    vel = {
      x: vel.x + (dt / 6) * (k1.ax + 2 * k2.ax + 2 * k3.ax + k4.ax),
      y: vel.y + (dt / 6) * (k1.ay + 2 * k2.ay + 2 * k3.ay + k4.ay),
    };

    if (hasProp) {
      const burn = k1.mdot * dt;
      mass -= burn;
      if (stage === 1) prop1 -= burn;
      else prop2 -= burn;
    }

    // Second-stage engine cutoff. A real upper stage stops the moment it
    // has the orbit it was aiming for and keeps whatever is left in the
    // tanks — it does not burn to depletion and fling itself into a wildly
    // elliptical orbit just because it still had propellant. Cutting off
    // here is also what makes leftover propellant a meaningful readout:
    // it is the margin the design actually had.
    if (stage === 2 && prop2 > 0 && !secoTime) {
      const orb = orbitFromState(pos, vel);
      // The test is "is this a stable orbit yet", not "have we arrived at
      // the target". A continuous ascent burn raises apoapsis fast while
      // periapsis creeps up from below, so periapsis is the number that
      // says whether the vehicle stays up — and once it is clear of the
      // atmosphere, the job is done and anything further is just making the
      // orbit needlessly elliptical.
      const target = cfg.targetAlt ?? 250000;
      const insertion = Math.max(150000, target - 80000);
      if (!orb.escape && orb.periapsis >= insertion) {
        secoTime = t;
        propRemaining = prop2;
        prop2 = 0;
      }
    }

    // Staging. Dropping the empty first stage is the moment worth watching:
    // the vehicle sheds dry1 kilograms it no longer has any use for.
    if (stage === 1 && prop1 <= 0 && !separated) {
      separated = true;
      sepTime = t;
      mass -= v.dry1;
      stage = 2;
    }

    t += dt;
  }

  const finalOrbit = orbitFromState(pos, vel);
  const reachedOrbit = !finalOrbit.escape && finalOrbit.periapsis > 100000;

  return {
    path,
    vehicle: v,
    deltaV: deltaV(cfg),
    orbit: finalOrbit,
    reachedOrbit,
    escape: finalOrbit.escape,
    maxQ,
    maxQAlt,
    maxQTime,
    sepTime,
    secoTime,
    propRemaining,
    burnoutTime: t,
    apoapsis: finalOrbit.apoapsis,
    periapsis: finalOrbit.periapsis,
    peakAltitude: path.reduce((m, p) => Math.max(m, p.alt), 0),
    finalSpeed: Math.hypot(vel.x, vel.y),
    gravityLoss,
    dragLoss,
  };
}

/** Circular orbital velocity at an altitude, for comparison readouts. */
export const circularVelocity = (alt) => Math.sqrt(MU / (R_EARTH + alt));

/**
 * Propagate a state vector forward under gravity alone, for drawing the
 * orbit the vehicle ended up in.
 *
 * Deliberately the same two-body integration the ascent uses rather than a
 * Kepler solution plotted from the elements. If the drawn ellipse and the
 * simulated flight ever disagreed, the picture would be lying about the
 * thing it is illustrating; sharing the integrator makes that impossible.
 */
export function predictOrbit(pos, vel, samples = 240) {
  const orb = orbitFromState(pos, vel);
  if (orb.escape || !isFinite(orb.a) || orb.a <= 0) return [];

  const period = 2 * Math.PI * Math.sqrt(Math.pow(orb.a, 3) / MU);
  const dt = period / samples;
  let p = { ...pos };
  let v = { ...vel };
  const points = [];

  const accel = (q) => {
    const r = Math.hypot(q.x, q.y);
    const k = -MU / (r * r * r);
    return { x: q.x * k, y: q.y * k };
  };

  for (let i = 0; i <= samples; i++) {
    points.push({ x: p.x, y: p.y });
    const a1 = accel(p);
    const p2 = { x: p.x + v.x * dt * 0.5, y: p.y + v.y * dt * 0.5 };
    const v2 = { x: v.x + a1.x * dt * 0.5, y: v.y + a1.y * dt * 0.5 };
    const a2 = accel(p2);
    const p3 = { x: p.x + v2.x * dt * 0.5, y: p.y + v2.y * dt * 0.5 };
    const v3 = { x: v.x + a2.x * dt * 0.5, y: v.y + a2.y * dt * 0.5 };
    const a3 = accel(p3);
    const p4 = { x: p.x + v3.x * dt, y: p.y + v3.y * dt };
    const v4 = { x: v.x + a3.x * dt, y: v.y + a3.y * dt };
    const a4 = accel(p4);
    p = {
      x: p.x + (dt / 6) * (v.x + 2 * v2.x + 2 * v3.x + v4.x),
      y: p.y + (dt / 6) * (v.y + 2 * v2.y + 2 * v3.y + v4.y),
    };
    v = {
      x: v.x + (dt / 6) * (a1.x + 2 * a2.x + 2 * a3.x + a4.x),
      y: v.y + (dt / 6) * (a1.y + 2 * a2.y + 2 * a3.y + a4.y),
    };
  }
  return points;
}
