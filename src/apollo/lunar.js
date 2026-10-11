/* The lunar camera follows the spacecraft during coast, arcs from Earth
   toward the Moon, then settles into a side view for descent and contact.
   The ship stays in the foreground while real separation makes the Moon
   grow from a distant globe into the ground beneath it.

   u is the lunar section's own scroll progress, shared with its captions.
   lunarMissionP maps that progress to the trajectory's historical events.
   All camera motion is a pure function of those two progress values. */

import { clamp, smootherstep, moonAt, LAUNCH_EPOCH_MS } from "./mission.js";
import { LANDER_TIMES, LM_CENTRE_M, SPACECRAFT_TOP_M, at, pAtSeconds, getSecondsAt } from "./flight.js";
import { makeRamp, makeSpline } from "./spline.js";
import { placeShot } from "./tour.js";
import { coastAt, LOI_P, TLI_P, slerp } from "./translunar.js";

/* =========================================================================
   THE RE-TIMING
   =========================================================================

   Read straight off the scroll, the mission's own clock gives the reader
   the wrong things. The day of lunar orbit between insertion and undocking
   is a long stretch of the interlude with nothing happening in it, and the
   twelve and a half minutes from ignition to touchdown, in which the lander
   turns over twice, get less. So inside this interlude u is mapped to
   mission progress through the beats below, each a published moment and a
   place in the interlude to show it, and the mission clock, the Moon's
   position, the orbit and the lander's attitude all run off the result.

   Both columns only rise, so the clock never runs backwards and scrolling
   back up undoes it exactly. The approach uses logarithmic separation;
   later beats interpolate mission time. The opening matches the incoming
   mission progress exactly. The captions sit on beats: 0.32 insertion,
   0.54 undocking, 0.76 powered descent, 0.94 contact. */
const BEATS = [
  [0.3, at("loiIgnition")],
  [0.34, at("loiCutoff")],
  [0.54, at("undock")],
  [0.555, pAtSeconds(LANDER_TIMES.inspection[0])],
  [0.62, at("separation")],
  [0.66, at("descentOrbit")],
  [0.76, at("poweredDescent")],
  [0.785, pAtSeconds(LANDER_TIMES.faceUp[0])],
  [0.815, pAtSeconds(LANDER_TIMES.faceUp[1])],
  [0.865, pAtSeconds(LANDER_TIMES.p64)],
  [0.9, pAtSeconds(LANDER_TIMES.p66)],
  [0.94, at("touchdown")],
];
const beatsRamp = makeRamp(BEATS);

// Equal scroll should buy a similar change in the Moon's apparent size.
// A linear mission clock spends most of the approach with a tiny Moon,
// then crosses the last tens of thousands of kilometres in a few pixels.
// Invert a sampled distance table once; the trajectory itself stays intact.
const approach = Array.from({ length: 2049 }, (_, i) => {
  const p = TLI_P + (LOI_P - TLI_P) * i / 2048;
  return { p, distance: moonAt(LAUNCH_EPOCH_MS + getSecondsAt(p) * 1000).distanceKm - coastAt(p).radiusKm };
});
function approachDistance(p) {
  return moonAt(LAUNCH_EPOCH_MS + getSecondsAt(p) * 1000).distanceKm - coastAt(p).radiusKm;
}
function progressAtDistance(distance) {
  let lo = 0, hi = approach.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (approach[mid].distance > distance) lo = mid;
    else hi = mid;
  }
  const a = approach[lo], b = approach[hi];
  const t = clamp((distance - a.distance) / (b.distance - a.distance), 0, 1);
  return a.p + (b.p - a.p) * t;
}

/**
 * Mission progress at lunar interlude position u.
 *
 * @param {number} u      0 at the top of the lunar interlude, 1 at the bottom
 * @param {number} fromP  the page progress the interlude starts at, which is
 *                        where the mission was when the reader got here
 */
export function lunarMissionP(u, fromP) {
  const c = clamp(u, 0, 1);
  const [firstU, firstP] = BEATS[0];
  const start = Math.min(fromP, firstP - 1e-4);
  if (c <= firstU) {
    if (c === 0) return start;
    if (c === firstU) return firstP;
    const distance = Math.exp(Math.log(approachDistance(start))
      + Math.log(approachDistance(firstP) / approachDistance(start)) * (c / firstU));
    return progressAtDistance(distance);
  }
  return beatsRamp(c);
}

/* The shots, at the same u as the beats above. The rows between beats are
   not moments, they are the shape of the move between two moments.

   Every length is in model metres, but a shot here is written relative to
   its subject rather than to the Saturn V's engine plane. dX is how far
   along the track the camera stands from the middle of what is being
   framed, and riseM and aimUpM are heights above that middle. The subject
   is the docked pair -- the command and service module and the lander,
   from about 91 model metres to the lander's top -- until Columbia backs
   away, and then the lander alone. The stack's axis stays along the track
   the whole way down (translunar.js), so that middle is always level with
   the stack's origin, and a height of zero is always level with the
   subject.

   spanM is how much of the frame's width the shot is asked to cover. At
   this act's scale a metre is about ninety metres of real distance, so nine
   hundred is eighty kilometres across the frame with the spacecraft a speck
   in it, and forty is a lander filling a quarter of the width.

   One long push in brings a distant spacecraft close enough to follow its
   descent. The orbiting camera settles into a low, held contact shot as
   the Moon becomes the ground. The camera is kept above the ground
   whatever this table says; see lunarCameraAt. */
const SHOTS = [
  //      u         dX   riseM  aimUpM  spanM  leadM  rollDeg  shiftX  shiftY
  { u: 0.0,   dX: 0,  riseM: 30, aimUpM: 0, spanM: 900, leadM: 0, rollDeg: 0.0,  shiftX: 0.0, shiftY: 0.08 },
  { u: 0.1,   dX: 0,  riseM: 22, aimUpM: 0, spanM: 420, leadM: 0, rollDeg: 0.2,  shiftX: 0.1, shiftY: 0.36 }, // three days out
  { u: 0.22,  dX: 0,  riseM: 16, aimUpM: 0, spanM: 200, leadM: 0, rollDeg: 0.3,  shiftX: 0.1, shiftY: 0.44 },
  { u: 0.32,  dX: 0,  riseM: 12, aimUpM: 0, spanM: 112, leadM: 0, rollDeg: 0.3,  shiftX: 0.1, shiftY: 0.46 }, // lunar orbit insertion
  { u: 0.44,  dX: 0,  riseM: 10, aimUpM: 0, spanM: 78,  leadM: 0, rollDeg: 0.25, shiftX: 0.1, shiftY: 0.46 },
  { u: 0.54,  dX: 0,  riseM: 8,  aimUpM: 0, spanM: 56,  leadM: 0, rollDeg: 0.2,  shiftX: 0.1, shiftY: 0.46 }, // undocking
  { u: 0.6,   dX: 0,  riseM: 6,  aimUpM: 0, spanM: 42,  leadM: 0, rollDeg: 0.15, shiftX: 0.14, shiftY: 0.4 },
  { u: 0.66,  dX: 0,  riseM: 5,  aimUpM: 0, spanM: 36,  leadM: 0, rollDeg: 0.1,  shiftX: 0.2, shiftY: 0.36 },
  { u: 0.76,  dX: 0,  riseM: 4,  aimUpM: 0, spanM: 32,  leadM: 0, rollDeg: 0.1,  shiftX: 0.26, shiftY: 0.3 }, // powered descent
  { u: 0.815, dX: -1, riseM: 3,  aimUpM: 0, spanM: 30,  leadM: 0, rollDeg: 0.05, shiftX: 0.28, shiftY: 0.26 },
  { u: 0.865, dX: -2, riseM: 2.2,aimUpM: 0, spanM: 28,  leadM: 0, rollDeg: 0.0,  shiftX: 0.28, shiftY: 0.22 },
  { u: 0.94,  dX: -2, riseM: 1.3,aimUpM: 0, spanM: 29,  leadM: 0, rollDeg: 0.0,  shiftX: 0.28, shiftY: 0.2 }, // contact
  { u: 0.975, dX: -2, riseM: 1.3,aimUpM: 0, spanM: 29,  leadM: 0, rollDeg: 0.0,  shiftX: 0.28, shiftY: 0.2 }, // hold
  { u: 1.0,   dX: -2, riseM: 1.3,aimUpM: 0, spanM: 29,  leadM: 0, rollDeg: 0.0,  shiftX: 0.28, shiftY: 0.2 },
];

// Orbit the camera around the subject to reveal its depth. This is camera
// direction, never an extra rotation applied to the spacecraft itself.
const orbitAt = makeSpline([0, 0.32, 0.54, 0.66, 0.815, 0.94, 1], {
  angle: [-12, -12, 8, 24, 30, 24, 24],
});

// Match the incoming speed at P64, then ease the camera to rest at contact.
// Only the camera uses this curve; mission time and spacecraft motion keep
// their authored beats. The hold also prevents Hermite drift after landing.
function cameraU(u) {
  const c = clamp(u, 0, 1);
  if (c <= 0.865) return c;
  const t = clamp((c - 0.865) / (0.94 - 0.865), 0, 1);
  return 0.865 + (0.94 - 0.865) * (t + t * t - t * t * t);
}

// The middle of the docked pair, and the handover to the lander's own
// middle as Columbia backs off: from the inspection yaw's last stretch to
// descent orbit insertion, by which time Columbia is out of shot.
const DOCKED_CENTRE_M = (91 + SPACECRAFT_TOP_M) / 2;
const subjectAt = (u) => DOCKED_CENTRE_M + (LM_CENTRE_M - DOCKED_CENTRE_M) * smootherstep(0.6, 0.66, u);

// How far above the ground the camera is allowed, in model metres: about a
// hundred and forty metres of real height at this scale.
const GROUND_CLEARANCE_M = 1.5;

export { SHOTS as LUNAR_SHOTS };

// The same constant field of view, for the same reason it is constant in
// tour.js: a zoom laid on top of a dolly is the shot that makes people
// motion sick, and this move is four times longer than that one.
export const LUNAR_FOV_DEG = 34;

const sample = makeSpline(
  SHOTS.map((s) => s.u),
  {
    dX: SHOTS.map((s) => s.dX),
    riseM: SHOTS.map((s) => s.riseM),
    aimUpM: SHOTS.map((s) => s.aimUpM),
    logSpan: SHOTS.map((s) => Math.log(s.spanM)),
    leadM: SHOTS.map((s) => s.leadM),
    rollDeg: SHOTS.map((s) => s.rollDeg),
    shiftX: SHOTS.map((s) => s.shiftX),
    shiftY: SHOTS.map((s) => s.shiftY),
  }
);

/**
 * One instant of the lunar act, in the vehicle's own body frame. Pure: no
 * DOM, no renderer, no scene, so the check suite drives it directly.
 *
 * @param {number} u  0 at the top of the lunar interlude, 1 at the bottom
 * @param {object} [where]
 * @param {number} [where.altitudeKm]         the stack origin's height above
 *                                            the Moon's mean surface
 * @param {number} [where.kmPerVehicleMetre]  the drawn scale
 */
export function lunarCameraAt(u, { altitudeKm = Infinity, kmPerVehicleMetre = 0 } = {}) {
  const c = clamp(u, 0, 1);
  const s = sample(cameraU(c));
  // The ground, in model metres below the origin. The camera stands off to
  // the side of the track, where the ground has curved away a little
  // further, so this is the conservative place to measure it.
  const groundM =
    kmPerVehicleMetre > 0 && Number.isFinite(altitudeKm) ? -altitudeKm / kmPerVehicleMetre : -Infinity;
  return {
    camX: subjectAt(c) + s.dX,
    riseM: Math.max(s.riseM, groundM + GROUND_CLEARANCE_M),
    aimUpM: s.aimUpM,
    // Hermite overshoots between knots. Undershooting the tightest framing
    // walks the camera into the spacecraft; overshooting the widest throws
    // it far enough back that nothing is legible. The window is wider than
    // the tour's because this move is: the wide end is a spacecraft three
    // days from the Moon and the tight end is a lander.
    spanM: clamp(Math.exp(s.logSpan), 24, 1100),
    leadM: s.leadM,
    rollDeg: s.rollDeg,
    shiftX: clamp(s.shiftX, -0.32, 0.32),
    shiftY: clamp(s.shiftY, -0.05, 0.55),
    fovDeg: LUNAR_FOV_DEG,
  };
}

/** Lunar vignette and star attenuation. Camera handover starts earlier,
 * during coast, and uses followWeightAt instead. */
export function lunarWeightAt(u) {
  if (u < 0) return 0;
  return smootherstep(0.02, 0.28, u);
}

/**
 * Places the descent shot against the spacecraft pose with the Moon as
 * its up centre. placeShot is shared with the Saturn V tour.
 *
 * The axis handed in is the direction of travel, not the vehicle's nose.
 * They are the same thing for all but the last minute of the act, and for
 * that last minute the difference is the whole shot: the vehicle pitches
 * upright to land, its nose swings round to point straight away from the
 * Moon, and placeShot builds the frame's "up" from whatever is left of the
 * radial after the axis is taken out of it. Nose-up, nothing is left, and
 * the camera rolls to an arbitrary angle -- a horizon standing vertically
 * in frame, which is what the first landing render showed. The track
 * direction stays honestly horizontal all the way to the ground, so the
 * radial survives it and up stays up.
 */
function landingCameraWorld(u, aspect, { origin, axis, moonCenter, kmPerVehicleMetre, altitudeKm }) {
  const shot = placeShot(lunarCameraAt(u, { altitudeKm, kmPerVehicleMetre }), aspect, {
    origin,
    axis,
    upCenter: moonCenter,
    kmPerVehicleMetre,
  });
  const a = orbitAt(cameraU(u)).angle * Math.PI / 180;
  const c = Math.cos(a), s = Math.sin(a);
  const offset = shot.position.map((v, i) => v - shot.target[i]);
  const up = shot.up;
  const along = offset.reduce((sum, v, i) => sum + v * up[i], 0);
  const cross = [up[1] * offset[2] - up[2] * offset[1],
    up[2] * offset[0] - up[0] * offset[2], up[0] * offset[1] - up[1] * offset[0]];
  shot.position = shot.target.map((v, i) => v + offset[i] * c + cross[i] * s + up[i] * along * (1 - c));
  return shot;
}

const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const scale = (v, k) => v.map(x => x * k);
const length = v => Math.hypot(...v);
const unit = v => scale(v, 1 / (length(v) || 1));
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const mix = (a, b, t) => a + (b - a) * t;

/** Travel between camera seats around their subject, in logarithmic range.
 * Linear world-distance interpolation collapses the last 99% of apparent
 * magnification into the end of a move across Earth-Moon distances. */
export function followPosition(from, to, subject, weight) {
  if (weight <= 0) return from.slice();
  if (weight >= 1) return to.slice();
  const a = sub(from, subject), b = sub(to, subject);
  const range = Math.exp(mix(Math.log(Math.max(length(a), 0.001)),
    Math.log(Math.max(length(b), 0.001)), weight));
  return add(subject, scale(slerp(unit(a), unit(b), weight), range));
}

// As the camera closes on the ship, its aim offset must shrink with the
// range. A world-space target lerp can leave the aim thousands of kilometres
// off the ship even when the camera has already reached its close-up seat.
export function followTarget(from, subject, fromCamera, camera, weight) {
  if (weight <= 0) return from.slice();
  if (weight >= 1) return subject.slice();
  const rangeRatio = length(sub(camera, subject)) / Math.max(length(sub(fromCamera, subject)), 0.001);
  return add(subject, scale(sub(from, subject), rangeRatio * (1 - weight) ** 4));
}

// The camera starts riding with the spacecraft during the coast, well
// before the lunar title. There is no second journey from Earth at u=0.
export const followWeightAt = p => smootherstep(0.72, 0.93, p);

export function lunarCameraWorld(u, aspect, rig) {
  const { origin, axis, moonCenter, kmPerVehicleMetre } = rig;
  const p = rig.missionP ?? lunarMissionP(Math.max(0, u), 1.057);
  const subject = add(origin, scale(unit(axis), subjectAt(Math.max(0, u)) * kmPerVehicleMetre));
  const towardMoon = unit(sub(moonCenter, subject));
  const north = [0, 1, 0];
  const side = unit(cross(towardMoon, north));
  // Earth is behind the ship first; a slow arc around the ship brings the
  // destination into view. The Moon then grows with the real separation.
  const yaw = mix(Math.PI + 0.2, -0.14, smootherstep(0.94, 1.085, p));
  const offset = unit(add(add(scale(towardMoon, -Math.cos(yaw)),
    scale(side, Math.sin(yaw))), scale(north, 0.085)));
  const span = mix(76, 64, smootherstep(0, 0.3, Math.max(0, u)));
  const range = span * kmPerVehicleMetre / (2 * Math.tan(LUNAR_FOV_DEG * Math.PI / 360) * Math.max(aspect, 0.2));
  const follow = {
    position: add(subject, scale(offset, range)), target: subject, up: north,
    fovDeg: LUNAR_FOV_DEG, rollDeg: 0, shiftX: 0.38, shiftY: 0.22,
  };
  const blend = smootherstep(0.30, 0.70, u);
  if (blend === 0) return follow;
  const landing = landingCameraWorld(u, aspect, rig);
  if (blend === 1) return landing;
  return {
    position: followPosition(follow.position, landing.position, subject, blend),
    target: follow.target.map((v, i) => mix(v, landing.target[i], blend)),
    up: slerp(follow.up, landing.up, blend),
    fovDeg: LUNAR_FOV_DEG,
    rollDeg: landing.rollDeg * blend,
    shiftX: mix(follow.shiftX, landing.shiftX, blend),
    shiftY: mix(follow.shiftY, landing.shiftY, blend),
  };
}
