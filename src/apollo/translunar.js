/* =========================================================================
   THE TRANSLUNAR COAST
   =========================================================================

   Where the spacecraft is between translunar injection and lunar orbit
   insertion -- seventy-three hours, which is most of the mission and, until
   this file existed, was drawn by pointing the ascent's altitude curve at
   the sky and multiplying by sixteen. That put the vehicle 3.19 million
   kilometres out at the bottom of the page: eight times further away than
   the Moon it was supposed to be arriving at, and comfortably past the
   camera's far plane.

   WHAT IS REAL HERE AND WHAT IS DRAWN

   Real, and checkable: the distance from the Earth against time. The burn
   ends in a 190.8 km parking orbit, so the injection point is the perigee
   of the ellipse the spacecraft is now on -- that is what an impulsive burn
   from a circular orbit does, and it is why one number fixes the shape.
   Given that perigee, the published TLI cutoff and LOI ignition times, and
   the Moon's real distance at arrival, the transfer ellipse is determined:
   solveTransfer() below finds the only semi-major axis for which a body
   leaving that perigee arrives at that distance in exactly that time.

   Nothing about that is fitted to look right. It is a two-body solution
   with one unknown and one equation, and it can be checked from outside:
   it predicts a speed at injection of about 10.96 km/s against a published
   10.83, which is 1.2% high. It should be high, and by about that much,
   because a two-body solution ignores the Moon -- and the Moon is pulling
   the spacecraft forward for the whole trip, so the real one needs slightly
   less speed to arrive on time. A free check, not a tuned one.

   Drawn: which way it goes. The real translunar injection was made at a
   point in the parking orbit chosen so that the ellipse's far end and the
   Moon arrive in the same place at the same moment. This page launches on
   an azimuth chosen so that the ascent is legible against the Earth's limb
   -- a composition decision, made by looking, and documented as one in
   flight.js. Those two cannot both be honoured, so the departure direction
   is inherited from the ascent and the path is turned from there onto the
   Moon over the coast. The angle it sweeps is therefore whatever the two
   geometries give, and is not offered as a figure. The *pacing* of that
   sweep is real: it is the true anomaly of the solved ellipse, so the
   spacecraft swings round fast while it is close and then barely moves for
   three days, which is what the coast actually looks like and is the only
   part of the turn a reader can perceive.

   Everything here is plain numbers and plain arrays -- no three.js of its
   own, and nothing that needs a document -- so the check suite imports it
   under Node and drives it directly rather than reasoning about it. */

import { EARTH_RADIUS_KM } from "./earth.js";
import { LAUNCH_EPOCH_MS, MOON_RADIUS_KM, moonAt, smootherstep } from "./mission.js";
import {
  LANDER_TIMES,
  LM_CENTRE_M, LM_HEIGHT_M,
  LUNAR_STACK_KM,
  STACK_HEIGHT_M,
  at,
  getSecondsAt,
  landerUpright,
  pAtSeconds,
} from "./flight.js";
import { makeRamp } from "./spline.js";

/** Earth's gravitational parameter, km^3/s^2. IAU/IERS conventional value;
 *  the digits past the first four make no difference at this scale and are
 *  kept only so the number is recognisable as the standard one. */
export const MU_EARTH = 398600.4418;

/** The parking orbit, and therefore the perigee of the transfer ellipse.
 *  103.0 by 103.0 nautical miles is the published insertion, which is
 *  190.8 km -- the same number the ascent profile in flight.js ends on. */
export const PARKING_ALTITUDE_KM = 190.8;

const TWO_PI = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/* ---------- Kepler ---------- */

/** Eccentric anomaly from mean anomaly.
 *
 *  Bracketed, not trusted. At e = 0.976 this ellipse is very nearly a
 *  parabola, and plain Newton from E = M is slow near perigee -- which is
 *  exactly where the coast begins and therefore where the page spends the
 *  frames a reader is most likely to be looking at. Worse, a bad step there
 *  can throw E right out of the arc, and a NaN position is a spacecraft
 *  that silently does not exist.
 *
 *  So: bisect the interval Kepler's equation is monotone on, which costs
 *  sixty halvings of at most 2*pi and lands inside a picometre of arc, then
 *  polish with four Newton steps for the last few digits. Fast enough to
 *  run every frame and incapable of leaving the bracket. */
export function eccentricAnomaly(meanAnomaly, e) {
  // Kepler's equation is monotone over one revolution, so reduce to it.
  const M = ((meanAnomaly % TWO_PI) + TWO_PI) % TWO_PI;
  let lo = 0;
  let hi = TWO_PI;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (mid - e * Math.sin(mid) < M) lo = mid;
    else hi = mid;
  }
  let E = (lo + hi) / 2;
  for (let i = 0; i < 4; i++) {
    const df = 1 - e * Math.cos(E);
    if (df < 1e-12) break;
    E -= (E - e * Math.sin(E) - M) / df;
  }
  return E;
}

/** True anomaly from eccentric anomaly. The half-angle form rather than
 *  acos, because acos loses its sign and the coast crosses 90 degrees in
 *  the first few minutes. */
export function trueFromEccentric(E, e) {
  return (
    2 *
    Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2))
  );
}

/** Time from perigee to a given radius on an ellipse, in seconds.
 *  Returns Infinity if the ellipse never reaches that radius. */
function timeToRadius(aKm, e, rKm) {
  const apogee = aKm * (1 + e);
  if (rKm > apogee) return Infinity;
  const cosE = clamp((1 - rKm / aKm) / e, -1, 1);
  const E = Math.acos(cosE);
  const M = E - e * Math.sin(E);
  return M / Math.sqrt(MU_EARTH / (aKm * aKm * aKm));
}

/** The transfer ellipse, solved rather than stated.
 *
 *  One unknown -- the semi-major axis -- and one equation: leave the given
 *  perigee, arrive at the given radius, take the given time. Bisection
 *  rather than Newton because the bracket is known and the function is
 *  monotone: a bigger ellipse is a faster one over a fixed radius, so time
 *  falls as a rises, and 200 halvings of a bracket that starts 10^7 km wide
 *  is exact long before it finishes. Called once, at module load. */
export function solveTransfer({ perigeeKm, arrivalKm, timeOfFlightS }) {
  // Below this the ellipse cannot reach the Moon at all: apogee = 2a - r_p.
  const aMin = (arrivalKm + perigeeKm) / 2 + 1;
  let lo = aMin;
  let hi = 1e8;

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const t = timeToRadius(mid, 1 - perigeeKm / mid, arrivalKm);
    if (t > timeOfFlightS) lo = mid;
    else hi = mid;
  }

  const aKm = (lo + hi) / 2;
  const e = 1 - perigeeKm / aKm;
  const nuArrivalRad = Math.acos(
    clamp((((aKm * (1 - e * e)) / arrivalKm) - 1) / e, -1, 1)
  );

  return {
    aKm,
    e,
    perigeeKm,
    apogeeKm: aKm * (1 + e),
    arrivalKm,
    timeOfFlightS,
    nuArrivalRad,
    // vis-viva at perigee. Not used to draw anything -- it exists so the
    // solution can be checked against a published number it was not given.
    departSpeedKmS: Math.sqrt(MU_EARTH * (2 / perigeeKm - 1 / aKm)),
    // And what the solution actually achieves, which should be the time it
    // was asked for. The check suite asserts this closes.
    achievedTimeS: timeToRadius(aKm, e, arrivalKm),
  };
}

/* ---------- This mission's ellipse ---------- */

export const TLI_P = at("tliCutoff");
export const LOI_P = at("loiIgnition");

// Read back through the clock rather than out of the event table, because
// the ramp is piecewise-linear through exactly those knots -- so this is
// the published second, and it is also whatever the page would show if the
// two ever drifted apart.
const TLI_SECONDS = getSecondsAt(TLI_P);
const LOI_SECONDS = getSecondsAt(LOI_P);

/** The lunar parking orbit, drawn as a circle 60 nautical miles up.
 *
 *  It was never quite that. Circularisation left Apollo 11 in a 66.1 by
 *  54.5 nautical mile orbit (SP-4029; Mission Report, Table 7-V), aimed
 *  off-round on purpose: the press kit's plan was for the Moon's uneven
 *  gravity to bring it to 60 circular by the time the lander came back up
 *  to meet it. The page draws the orbit that plan was aiming for, because
 *  an ellipse that nearly round is a circle at any size it can be drawn. */
export const LUNAR_ORBIT_ALTITUDE_KM = 111.12;
export const LUNAR_ORBIT_RADIUS_KM = MOON_RADIUS_KM + LUNAR_ORBIT_ALTITUDE_KM;

/* How far the point the trajectory tracks is above the lander's feet.

   Everything from here to the surface is placed by the stack's own origin,
   the engine plane of a Saturn V whose lower stages separated days ago, and
   the stack's axis stays along the direction of travel all the way down.
   The lander does its own turning, about its own middle (vehicle.js). So
   its middle is always level with the origin, a hundred model metres ahead
   of it along the track, and all that separates the origin's altitude from
   the footpads' is half the lander's height: about three hundred metres at
   this scale. Adding it to every radius below makes the altitude those rows
   name the altitude of the feet.

   An earlier version tilted the whole stack upright to land, which swung
   the lander nine kilometres up off the origin and had to be subtracted
   instead; the lander then did its pitch-over as a swing through the sky
   rather than a turn in place.

   The constant is exact rather than approximate because the lunar act's
   scale is fixed: lunarShrink in flight.js has finished by u = 1.045, long
   before the burn at 1.12, so the vehicle is ten kilometres for every frame
   this file places. */
export const LANDER_HALF_KM = (LUNAR_STACK_KM / STACK_HEIGHT_M) * (LM_HEIGHT_M / 2); // 0.316

/** How far the Moon is when the spacecraft gets there, read from the same
 *  ephemeris the Moon is drawn from -- so the spacecraft arrives at the
 *  Moon rather than at a round number the Moon happens to be near.
 *
 *  Less the orbit radius, and that subtraction is the whole handover to the
 *  lunar act. The coast is aimed at the Moon's centre and would arrive
 *  inside it; stopping it one orbit radius short, on the Earth-facing side,
 *  puts it exactly where a circular orbit of that radius begins. The two
 *  pieces share their nominal radius. coastFrame gradually corrects the
 *  small latitude offset and aligns the heading with the orbit's plane. */
export const ARRIVAL_KM =
  moonAt(LAUNCH_EPOCH_MS + LOI_SECONDS * 1000).distanceKm -
  (LUNAR_ORBIT_RADIUS_KM + LANDER_HALF_KM);

export const TRANSFER = solveTransfer({
  perigeeKm: EARTH_RADIUS_KM + PARKING_ALTITUDE_KM,
  arrivalKm: ARRIVAL_KM,
  timeOfFlightS: LOI_SECONDS - TLI_SECONDS,
});

const MEAN_MOTION = Math.sqrt(MU_EARTH / (TRANSFER.aKm ** 3));

/* ---------- The drawn path ---------- */

/* How much of the injection's exaggeration is still visible at handover.
 *
 *  The ascent is drawn with its altitude multiplied by sixteen, because a
 *  190 km orbit around a 6371 km planet is a hairline and the launch is the
 *  whole first act. At TLI cutoff that puts the vehicle at about 15,000 km
 *  from the centre where the ellipse says 6,562. Snapping to the ellipse
 *  would move it 8,400 km in one frame, in shot, at a camera distance of
 *  25,000 km.
 *
 *  So the offset is carried across the handover and allowed to decay. It is
 *  2 percent of the trip; by the time anything in the lunar act is on
 *  screen it has been gone for days of mission time.
 *
 *  The decay is a smootherstep and not a power curve, and the difference is
 *  not cosmetic. A body leaving perigee has no radial velocity at all -- it
 *  is at the bottom of the ellipse -- so for the first minutes the real
 *  distance barely changes. Any decay that starts at a finite rate
 *  therefore subtracts faster than Kepler adds, and the spacecraft is drawn
 *  falling back toward the Earth immediately after the burn that sent it to
 *  the Moon. Measured, a quadratic decay did exactly that, by three and a
 *  half kilometres. A smootherstep leaves flat, which is the same thing the
 *  orbit does, so the two agree at the seam. The check suite asserts the
 *  drawn radius never decreases rather than trusting this argument. */
const HANDOVER_FRACTION = 0.22;

/** The coast's own progress: 0 at TLI cutoff, 1 at LOI ignition.
 *  Past 1 the spacecraft is at the Moon and this file stops having an
 *  opinion; lunar orbit and the descent are handled separately. */
export function coastFraction(p) {
  return (p - TLI_P) / (LOI_P - TLI_P);
}

/** The state of the coast at a page position.
 *
 *  Returns scalars only. The direction it is travelling in depends on where
 *  the pad ended up and where the Moon is, neither of which belongs in a
 *  file about an ellipse -- coastFrame() puts them together. */
export function coastAt(p, handoverOffsetKm = 0) {
  const f = coastFraction(p);
  if (f < 0) return { active: false, fraction: f };

  const t = clamp(getSecondsAt(p) - TLI_SECONDS, 0, TRANSFER.timeOfFlightS);
  const E = eccentricAnomaly(t * MEAN_MOTION, TRANSFER.e);
  const keplerKm = TRANSFER.aKm * (1 - TRANSFER.e * Math.cos(E));
  const nu = trueFromEccentric(E, TRANSFER.e);

  const decay = 1 - smootherstep(0, HANDOVER_FRACTION, f);

  return {
    active: true,
    fraction: f,
    secondsSinceTli: t,
    keplerKm,
    radiusKm: keplerKm + handoverOffsetKm * decay,
    nuRad: nu,
    // How far round the turn onto the Moon, paced by the ellipse. Clamped
    // at 1 so that a page which runs past LOI holds the arrival direction
    // instead of swinging past it.
    sweep: clamp(nu / TRANSFER.nuArrivalRad, 0, 1),
    speedKmS: Math.sqrt(MU_EARTH * (2 / keplerKm - 1 / TRANSFER.aKm)),
  };
}

/* ---------- Vectors ---------- */

const norm = (v) => {
  const m = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / m, v[1] / m, v[2] / m];
};

const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Great-circle interpolation between two unit directions.
 *
 *  The same job scene.js does for the tour camera, in plain arrays because
 *  this has to run under Node. Falls back to the endpoint when the two are
 *  already parallel, and picks an arbitrary perpendicular when they are
 *  exactly opposed -- which cannot happen for this mission's geometry, but
 *  a NaN trajectory is a black screen and not worth the risk. */
export function slerp(a, b, t) {
  const d = clamp(dot(a, b), -1, 1);
  if (d > 1 - 1e-9) return a.slice();
  if (d < -1 + 1e-9) {
    const axis = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const perp = norm(cross(a, axis));
    const th = Math.PI * t;
    return norm([
      a[0] * Math.cos(th) + perp[0] * Math.sin(th),
      a[1] * Math.cos(th) + perp[1] * Math.sin(th),
      a[2] * Math.cos(th) + perp[2] * Math.sin(th),
    ]);
  }
  const th = Math.acos(d);
  const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s;
  const wb = Math.sin(t * th) / s;
  return norm([a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb]);
}

/** The spacecraft's frame during the coast, in the same shape vehicleFrame
 *  returns so scene.js can swap one for the other.
 *
 *  departUp    unit vector from the Earth's centre to the spacecraft at TLI
 *              cutoff, as drawn -- the ascent's own last direction.
 *  departFwd   unit vector along its track there, for the roll reference.
 *  moonDir     unit vector from the Earth's centre to the Moon, in the SAME
 *              frame as departUp. The vehicle is drawn inside the spinning
 *              Earth group and the Moon is not, so whoever calls this is
 *              responsible for bringing them into one frame first; getting
 *              that wrong would whirl the trajectory round the planet once
 *              a day and is the one mistake here a picture would not
 *              obviously show.
 *  handoverKm  drawn radius at TLI minus the ellipse's perigee. */
export function coastFrame(p, { departUp, departFwd, moonDir, handoverKm = 0 }) {
  const c = coastAt(p, handoverKm);
  const up = slerp(departUp, moonDir, c.sweep);

  // Keep the track in the plane the turn happens in, so the spacecraft
  // stays pointed along the way it is going rather than inheriting a
  // heading from a pad it left three days ago.
  let side = cross(departUp, moonDir);
  if (Math.hypot(side[0], side[1], side[2]) < 1e-6) side = cross(departUp, departFwd);
  const crossTrack = norm(side);
  let forward = norm(cross(crossTrack, up));
  // Carry the injection heading into coast before aligning with the
  // transfer plane. Switching planes instantly made the follow shot snap.
  forward = slerp(departFwd, forward, smootherstep(TLI_P, TLI_P + 0.06, p));
  let position = [up[0] * c.radiusKm, up[1] * c.radiusKm, up[2] * c.radiusKm];

  // Match the lunar entry frame before switching branches. The old coast
  // ended on the Earth-Moon line while the orbit started on the lunar
  // equator: about 70 km and 34 degrees apart on this mission. A close
  // follow camera exposed that discontinuity as a jump. Apply only the
  // small endpoint correction, never a lerp of the entire remaining trip.
  const entryWeight = smootherstep(LOI_P - 0.025, LOI_P, p);
  if (entryWeight > 0) {
    const moonDistance = moonAt(LAUNCH_EPOCH_MS + getSecondsAt(p) * 1000).distanceKm;
    const entry = lunarFrame(LOI_P, {
      moonCentre: moonDir.map(v => v * moonDistance), moonDir, north: [0, 1, 0],
    });
    position = position.map((v, i) => v + entryWeight * (entry.position[i] - moonDir[i] * ARRIVAL_KM));
    forward = slerp(forward, entry.forward, entryWeight);
  }

  return {
    position,
    up,
    forward,
    crossTrack,
    // Coasting, engine cold, and travelling along the track: the long axis
    // lies down the direction of flight. On the pad it stood up; out here
    // standing up would mean flying sideways to the Moon.
    axis: forward,
    coast: c,
  };
}

/* =========================================================================
   THE MOON'S NEIGHBOURHOOD
   =========================================================================

   From lunar orbit insertion to the surface. Kept here rather than in
   mission.js because it is about the spacecraft and not about the Moon:
   mission.js says where the Moon is, and this says where something
   arriving at it goes.

   WHAT IS REAL AND WHAT IS COMPRESSED

   The altitudes are published: 60 nautical miles circular after
   circularisation, down to a 50,000 ft perilune after descent orbit
   insertion, then the surface. Those are the three radii below and they
   are the only numbers here.

   The plane is the lunar equator, and that is nearly free rather than
   merely convenient: Tranquility Base is at 0.67 degrees north, so the
   ground track of an equatorial orbit passes over the landing site to
   within a couple of kilometres of where the landing site actually is. An
   orbit chosen to pass over the place you intend to land is also what a
   mission plan does, which is why the two agree.

   What is compressed is the count. Apollo 11 spent thirteen revolutions in
   lunar orbit between the burn and the descent, and landed on the
   fourteenth. This draws one. There is no framing at which thirteen orbits
   of a page is anything but a strobe, and the alternative -- holding the
   spacecraft still while the clock advances a day -- would be a worse lie
   than a plain compression. The clock still reads the real times; only the
   number of laps between them is not thirteen.

   The one piece of the real sequence kept exactly is where the burn
   happens. Lunar orbit insertion was made on the far side, out of contact,
   and the page says so in its own caption -- so the spacecraft goes behind
   the Moon here too, and is genuinely occluded by it, because drawing it
   in plain sight beside a caption about nobody being able to see it would
   be the page contradicting itself in one screenful. */

/* Turn 0 is the Earth-facing point of the orbit, where the coast leaves
   the spacecraft. A quarter turn from there is the limb; between a quarter
   and three quarters it is behind the Moon and cannot be seen at all.
   Everything below is placed against that one fact.

   The burn goes behind on purpose: 0.25 at LOI cutoff means the spacecraft
   crosses the limb during the burn itself, which is where the burn was,
   and it is out of sight for the whole stretch of page the caption about
   nobody being able to see it is lit.

   It is back in the open at 0.75, well before undocking at 0.90, so the
   separation happens in plain view. And touchdown is at 1.065 -- one full
   lap plus 23 degrees -- because 23 degrees is where Tranquility Base is:
   0.67 N, 23.47 E, which on a tidally locked Moon means 23.47 degrees
   round from the point that faces the Earth. The landing site is not
   placed here, it is arrived at. */
const LOI_TO_TOUCHDOWN = [
  ["loiIgnition", 0],
  ["loiCutoff", 0.25],
  ["undock", 0.9],
  ["descentOrbit", 0.95],
  ["poweredDescent", 1.0],
  ["touchdown", 1.065],
];

/** How far round the Moon, in turns, at page position p. */
export const lunarSweepTurns = makeRamp(LOI_TO_TOUCHDOWN.map(([k, t]) => [at(k), t]));

const FOOT_KM = 0.0003048;

/** Distance from the Moon's centre, kilometres, at page position p: of the
 *  stack's origin, placed so the lander's feet are at the altitude named.
 *
 *  The orbit holds until descent orbit insertion, and the drop to the low
 *  point that burn set up runs from there to powered descent, half a lap
 *  later, which is how it was flown. 50,000 ft at ignition is the Mission
 *  Report's operational altitude for powered descent initiation (Table
 *  5-III; its best estimate afterwards is 49,376 ft). 7,129 ft is where the
 *  Mission Report puts the switch to P64. Between those rows the line is
 *  straight, and the last row is the ground. */
export const lunarRadiusAt = makeRamp([
  [at("loiIgnition"), LUNAR_ORBIT_RADIUS_KM + LANDER_HALF_KM],
  [at("descentOrbit"), LUNAR_ORBIT_RADIUS_KM + LANDER_HALF_KM],
  [at("poweredDescent"), MOON_RADIUS_KM + 50000 * FOOT_KM + LANDER_HALF_KM],
  [pAtSeconds(LANDER_TIMES.p64), MOON_RADIUS_KM + 7129 * FOOT_KM + LANDER_HALF_KM],
  [at("touchdown"), MOON_RADIUS_KM + LANDER_HALF_KM],
]);

/** Rodrigues, for one rotation about a unit axis. */
function rotateAbout(v, axis, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const d = dot(axis, v);
  const k = cross(axis, v);
  return [
    v[0] * c + k[0] * s + axis[0] * d * (1 - c),
    v[1] * c + k[1] * s + axis[1] * d * (1 - c),
    v[2] * c + k[2] * s + axis[2] * d * (1 - c),
  ];
}

/**
 * The spacecraft's frame once it is at the Moon, expressed in whatever
 * frame its three inputs are given in -- and in the same shape coastFrame
 * and vehicleFrame return, so scene.js can hand any of the three to the
 * same camera without knowing which one it got.
 *
 * @param {number} p
 * @param {object} rig
 * @param {number[]} rig.moonCentre  the Moon's centre
 * @param {number[]} rig.moonDir     unit vector, Earth's centre to the Moon
 * @param {number[]} rig.north       the Moon's north pole, unit
 */
export function lunarFrame(p, { moonCentre, moonDir, north }) {
  /* Where the coast handed over: the Earth-facing point of the orbit,
     which is exactly where ARRIVAL_KM was arranged to leave it.

     The component along north is removed first, so that the orbit is the
     lunar equator rather than a great circle tilted by however far the
     Moon happens to be off the ecliptic this week. Without that the
     landing site would drift a few degrees of latitude with the date, for
     no reason anyone chose. */
  const inward = [-moonDir[0], -moonDir[1], -moonDir[2]];
  const along = dot(inward, north);
  const start = norm([
    inward[0] - north[0] * along,
    inward[1] - north[1] * along,
    inward[2] - north[2] * along,
  ]);

  const turns = lunarSweepTurns(p);
  const radiusKm = lunarRadiusAt(p);
  const up = rotateAbout(start, north, turns * TWO_PI);

  /* radiusKm is where the lander's middle is meant to be, and the stack's
     origin is not under it. The middle sits LM_CENTRE_M ahead of the origin
     along the stack's axis, which is the direction of travel: level, not
     down. Nine kilometres level over a curved Moon rises by the sagitta,
     about 25 m, and 23 m of it was measured under Eagle's footpads at
     touchdown once the drawn ground was made round. So the origin is
     lowered by that much. It is eased in from descent orbit insertion to
     powered descent, so that the hand-over from the coast, which was placed
     without it, does not step; at 111 km, 25 m is nothing anyone sees. */
  const aheadKm =
    LM_CENTRE_M * (LUNAR_STACK_KM / STACK_HEIGHT_M) *
    smootherstep(at("descentOrbit"), at("poweredDescent"), p);
  const originKm = Math.sqrt(radiusKm * radiusKm - aheadKm * aheadKm);
  // Retrograde about the lunar north pole, which is the sense Apollo's
  // lunar parking orbit actually ran in.
  const forward = norm(cross(up, north));

  /* The stack's axis is the direction of travel all the way to the ground.
     What pitches upright to land is the lander, about its own middle, and
     vehicle.js turns it; the axis staying put is what keeps that middle
     level with this point, which LANDER_HALF_KM counts on. stand is the
     same pitch, handed on for anything that frames the lander. */
  const stand = landerUpright(p);
  const axis = forward.slice();

  return {
    position: [
      moonCentre[0] + up[0] * originKm,
      moonCentre[1] + up[1] * originKm,
      moonCentre[2] + up[2] * originKm,
    ],
    up,
    forward,
    crossTrack: north.slice(),
    axis,
    lunar: { turns, radiusKm, altitudeKm: radiusKm - MOON_RADIUS_KM, stand },
  };
}
