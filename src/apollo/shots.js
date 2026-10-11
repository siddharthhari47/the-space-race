// Where the camera is, and what it is looking at, for any scroll position.
//
// A shot is described the way you would describe standing somewhere and
// looking at something, not as a position and a quaternion: a point on the
// globe you are above, how high you are, and where you are pointed. Two
// details make that worth doing.
//
// The first is `aim`. Absolute pitch angles do not survive a camera that
// travels from two thousand kilometres up to a third of a million, because
// the angle from straight-down to the horizon collapses as you retreat —
// forty degrees in low orbit, under one degree near the Moon. A shot
// authored as "36 degrees" frames the planet at one altitude and points at
// empty space at another. So pitch is stored as a multiple of whatever the
// horizon angle happens to be: aim = 0 is straight down at the middle of
// the disc, aim = 1 is exactly at the limb, aim = 1.2 is past it. The
// framing then holds at every altitude by construction.
//
// The second is that composition is done with a lens shift rather than by
// aiming off-target. The homepage needs the planet in the lower right and
// the top left kept clear for text, and swinging the camera to achieve that
// would swing the horizon and the sunlight with it. setViewOffset moves the
// image instead, which is what a view camera's rising front does and what a
// tilt-shift lens does, and it leaves the geometry alone.

import { clamp, latLonToUnitVector } from "./mission.js";
import { EARTH_RADIUS_KM } from "./earth.js";

const DEG = Math.PI / 180;

/* =========================================================================
   THE SHOT LIST
   =========================================================================

   Authored, not derived. These are camera directions for a sequence, and
   the honest description of them is that they were chosen to read well —
   the physics in this project lives in mission.js and in the shaders, not
   here. What each one has to do:

   - Pre-launch through liftoff hold still and hold the planet in the lower
     right, because this is the part a visitor sees while reading the top of
     the page and it must not move under the text.
   - The ascent shots retreat, so the vehicle shrinks against a planet that
     does not, which is the only way scale reads.
   - From orbit onward the retreat becomes the whole story: the altitude
     column below spans two orders of magnitude, and it is splined in log
     space so that equal scroll buys an equal *ratio* of height, which is
     the thing the eye reads as a steady retreat. The note further down
     explains how that was arrived at, and what it is not. */

// Roll is positive here, and that is the whole trick to the opening frame.
// A negative roll tips the horizon down to the right, which puts the apex
// of the arc in the middle of the page and hands you a symmetric bowl —
// Earth along the bottom edge, not Earth in a corner. Rolling the other way
// drops the limb into the lower left and lifts it out through the right
// edge, so the planet occupies the bottom-right and the top-left is empty
// sky. The roll then decays as the camera retreats, because a horizon that
// has become a disc edge has no tilt left to read.
export const SHOTS = [
  // p       lat     lon     altKm    aim    azDeg   roll   fov   offX   offY
  { p: 0.0, latDeg: 18.5, lonDeg: -62.0, altitudeKm: 3150, aim: 0.885, azimuthDeg: 315, rollDeg: 10, fovDeg: 40, offsetX: 0.16, offsetY: 0.06 },
  { p: 0.115, latDeg: 20.0, lonDeg: -64.0, altitudeKm: 3050, aim: 0.9, azimuthDeg: 317.3, rollDeg: 9.6, fovDeg: 39.5, offsetX: 0.16, offsetY: 0.06 },
  { p: 0.185, latDeg: 21.1, lonDeg: -65.3, altitudeKm: 2980, aim: 0.92, azimuthDeg: 318.6, rollDeg: 9.3, fovDeg: 39.2, offsetX: 0.16, offsetY: 0.06 },
  { p: 0.409, latDeg: 23.5, lonDeg: -68.5, altitudeKm: 3400, aim: 0.95, azimuthDeg: 322, rollDeg: 8.5, fovDeg: 38, offsetX: 0.1601, offsetY: 0.06 },
  { p: 0.597, latDeg: 25.0, lonDeg: -70.0, altitudeKm: 7100, aim: 0.97, azimuthDeg: 324, rollDeg: 7, fovDeg: 37, offsetX: 0.1911, offsetY: 0.0653 },
  { p: 0.709, latDeg: 26.0, lonDeg: -71.0, altitudeKm: 16900, aim: 0.98, azimuthDeg: 326, rollDeg: 6, fovDeg: 36, offsetX: 0.2409, offsetY: 0.1705 },
  // The altitude column past the hold is scheduled, not chosen by eye, and
  // getting the rule right took two wrong answers first.
  //
  // Both wrong ones came from measuring the frame: render either side of a
  // scroll position, take the mean absolute difference in luminance, call
  // that how much the picture changed. It is a real number and it is the
  // wrong number. While the planet overflows the viewport, shrinking it
  // repaints most of the frame, so the metric reads enormous while nothing
  // appears to happen; once the planet is a disc in the middle of black sky,
  // halving it repaints almost nothing, so the metric reads zero while the
  // eye watches the Earth fall away. Two schedules built to flatten that
  // curve both made the motion worse. What settled it was a contact sheet --
  // twelve frames at even scroll spacing, looked at -- showing a third of
  // the page where nothing moved and then three frames that threw the planet
  // into the distance.
  //
  // What the eye reads for something receding is the rate of change of
  // apparent size relative to size: d(log theta)/dp. For a distant sphere
  // theta goes as 1/d, so the quantity to hold steady -- or at least never
  // let fall -- is d(log d)/dp. The knots below are placed by choosing a
  // target rate for each of the eight segments from the end of the hold
  // onward, none lower than the one before it (0.52, 4.68, 7.80, 9.36,
  // 10.19, 10.61, 10.81, 10.92 per unit p), and solving each segment's
  // width from it: the log of the altitude ratio over the target rate.
  //
  // Three of these knots used to sit on flight.js's staging1, staging2 and
  // orbitInsertion, from before the interlude took three screens out of the
  // middle of the page. Moving those events pulled two of the three to
  // within 0.014 of each other, which put the sampled rate between them
  // past 50 per unit p -- nothing here is keyed to a mission event any
  // more, and the eight altitudes are simply re-spaced across the room the
  // page now has. A Catmull-Rom spline through unevenly spaced knots does
  // not reproduce a piecewise target rate exactly -- it overshoots between
  // them -- so the widths solved above are a starting point, iterated
  // against tools/apollo-mission-check.mjs until the sampled curve clears
  // every bound it checks: peak rate 11.48 per unit p, against a ceiling of
  // 12, and no point anywhere past the hold where the sampled rate is lower
  // than a point before it.
  //
  // p=0.988 is a control point, not a knot with anything behind it any more
  // than the rest of them. It keeps the spline's tangents honest through the
  // last stretch, where the numbers climb fastest and two knots would kink
  // where three bend.

  // ---- the lens shift, and why the planet leaves ------------------------
  //
  // offsetX and offsetY are a lens shift, the same move a view camera makes
  // when the photographer raises the front standard: the frustum slides
  // sideways without the camera turning, so the composition changes and the
  // horizon and the sunlight do not. Positive X puts the image further
  // right, positive Y further down.
  //
  // They used to drift slowly downwards through the page -- 0.16 to 0.085,
  // 0.06 to 0 -- which sounds like it would lower the planet and does the
  // opposite. Measured with tools/apollo-framing.mjs, the top of the Earth
  // sat at y = -0.06 at p=0.555, -0.03 at 0.765 and +0.04 at 1.0: dead level
  // across the entire back half of the page. The disc was shrinking around a
  // fixed edge. That does not read as a planet falling behind you, it reads
  // as a planet deflating in place, and no amount of tuning the altitudes
  // was ever going to fix it, because the altitudes were not the problem.
  //
  // So the shift now holds still until the ascent is over and then ramps:
  //
  //     offsetX = 0.16 + 0.14 * smootherstep(0.35, 0.95, p)
  //     offsetY = 0.06 + 0.47 * smootherstep(0.5,  1.0,  p)
  //
  // The horizontal one starts earlier than the vertical one, and that is
  // doing a second job. Retreating from a camera that is aimed near the limb
  // does not only make the planet smaller, it swings the visible surface
  // sideways, and measured per column that swing turns the whole picture's
  // drift negative from about p=0.42: the surface slides back the way it
  // came for a fifth of the page while everything else is still moving
  // forward. Sliding the frame right through exactly that stretch cancels
  // it, and it is the direction the composition wanted to go anyway.
  //
  // 0.47 is not a taste decision. The planet's highest point sits within
  // 0.02 to 0.08 of the frame's centre line once it is a disc, and a shift
  // of k moves it down by 2k, so it clears the bottom of the frame when
  // offsetY passes about 0.52 -- which this reaches at p = 0.93. The window
  // starts at 0.5 rather than earlier for the same reason: the planet has
  // to still be there to leave. Four ramp windows were measured and they
  // differ by less than they look, because what empties the frame is the
  // retreat, not the shift; forty-two degrees of angular radius down to one
  // does that on its own. The shift only decides whether the last of it is
  // a marble in the middle or a lit edge in the corner.
  //
  // Both curves are monotone for the whole page, which the old ones were
  // not. A lens shift that creeps one way and then the other is a slow
  // sideways slide that changes direction, and a reader notices that even
  // when the numbers involved are two hundredths of a frame.
  { p: 0.794, latDeg: 26.5, lonDeg: -71.5, altitudeKm: 37400, aim: 0.95, azimuthDeg: 328, rollDeg: 5, fovDeg: 35, offsetX: 0.2756, offsetY: 0.3214 },
  { p: 0.866, latDeg: 27.0, lonDeg: -72.0, altitudeKm: 78400, aim: 0.85, azimuthDeg: 330, rollDeg: 4, fovDeg: 34, offsetX: 0.2943, offsetY: 0.447 },
  { p: 0.963, latDeg: 27.0, lonDeg: -72.0, altitudeKm: 217400, aim: 0.53, azimuthDeg: 332.8, rollDeg: 2.6, fovDeg: 32.6, offsetX: 0.3, offsetY: 0.527 },
  { p: 0.988, latDeg: 27.0, lonDeg: -72.0, altitudeKm: 287100, aim: 0.444, azimuthDeg: 333.6, rollDeg: 2.2, fovDeg: 32.2, offsetX: 0.3, offsetY: 0.5299 },
  { p: 1.0, latDeg: 27.0, lonDeg: -72.0, altitudeKm: 330000, aim: 0.4, azimuthDeg: 334, rollDeg: 2, fovDeg: 32, offsetX: 0.3, offsetY: 0.53 },
];

/* =========================================================================
   THE GROUND LOCK, AND WHY IT IS GONE
   =========================================================================

   There used to be a groundLockAt(p) here. It returned how much the camera
   was carried around by the planet's rotation, ramping from 0 at the top of
   the page to 1 by the ignition keyframe, and scene.js rotated the whole
   camera rig by that much so Launch Complex 39A stayed under the lens for
   the whole mission. It was built to solve a real problem: with the camera
   fixed and the globe turning at 0.45 deg/s, Florida crosses out of frame
   about thirty-three seconds after the page loads, so a visitor who read
   for a minute before scrolling would have watched the countdown happen
   somewhere off the right-hand edge.

   It worked, and it cost more than it was worth. A camera that rides the
   rotation exactly cancels the rotation, so past p=0.075 the globe did not
   appear to turn at all. Measured: surface drift from the clock ran +66
   thousandths of the frame width per three seconds at the top of the page,
   +7 by p=0.06, and exactly 0 from p=0.10 down. The planet came alive for
   the length of the hero section and then froze for the rest of the site.

   Worse, it could not be undone halfway. The lock multiplies the
   accumulated spin, and the accumulated spin grows without bound while a
   tab sits open, so a lock that ramped back down to 0 would swing the
   camera by however far the ground had turned since load -- ten degrees for
   a quick visit, a hundred and eighty for a tab left open over lunch --
   and it would do it in response to scrolling. The only stable shapes are
   "always locked" and "never locked".

   So: never locked. The planet turns, continuously, at one rate, in one
   direction, for the whole page. The pad light is still in the right place
   and still fades out by the angle between its surface normal and the
   camera, so when Florida rotates away the light goes with it rather than
   sitting wrongly on the limb. What is lost is the guarantee that a visitor
   who leaves the page open for two minutes still sees the launch site when
   they come back; what is bought is a planet that is visibly a planet. */

/* =========================================================================
   INTERPOLATION
   =========================================================================

   Cubic Hermite through the whole keyframe list, not an ease inside each
   segment. The difference is the entire reason the camera move reads as a
   move rather than as a series of lurches.

   The obvious thing — and what this did first — is smootherstep between
   each neighbouring pair. It looks right written down and is wrong in
   motion: smootherstep has zero derivative at both ends, so the camera
   comes to a complete stop at every keyframe and starts again. Ten
   keyframes, ten stops. Scrolling at a steady rate produced a steady
   lurch, and no amount of tuning the easing helped, because the stalls
   were built into the shape of the curve rather than into its speed.

   Hermite with finite-difference tangents — Catmull-Rom, generalised to
   unevenly spaced knots — passes through every keyframe exactly, so the
   authored framing is preserved to the last decimal, but arrives at each
   one already moving and leaves it at the same speed. The curve is C1:
   position and velocity are both continuous across the joins, which is
   the property the eye is actually reading.

   Altitude is splined in log space, for the same reason it used to be
   interpolated geometrically: two and a half orders of magnitude of pull-
   back look even only when equal scroll buys equal *ratio* of height. */

const FIELDS = ["latDeg", "lonDeg", "logAlt", "aim", "azimuthDeg", "rollDeg", "fovDeg", "offsetX", "offsetY"];

// Keyframes flattened into parallel arrays, once, with altitude in logs.
const KNOTS = SHOTS.map((s) => s.p);
const VALUES = (() => {
  const out = {};
  for (const f of FIELDS) {
    out[f] = SHOTS.map((s) => (f === "logAlt" ? Math.log(s.altitudeKm) : s[f]));
  }
  return out;
})();

// One tangent per knot per field, in value-per-unit-p. Interior knots use a
// central difference over the two neighbouring spans; the ends use the one
// span they have, so the camera is already moving the instant the page
// starts to scroll instead of easing out of a dead spot at the top.
const TANGENTS = (() => {
  const n = KNOTS.length;
  const out = {};
  for (const f of FIELDS) {
    const v = VALUES[f];
    const m = new Array(n);
    for (let i = 0; i < n; i++) {
      if (i === 0) m[i] = (v[1] - v[0]) / (KNOTS[1] - KNOTS[0]);
      else if (i === n - 1) m[i] = (v[n - 1] - v[n - 2]) / (KNOTS[n - 1] - KNOTS[n - 2]);
      else m[i] = (v[i + 1] - v[i - 1]) / (KNOTS[i + 1] - KNOTS[i - 1]);
    }
    out[f] = m;
  }
  return out;
})();

// Standard Hermite basis. h is the width of the span, which is what puts
// the tangents — expressed per unit p — back into the local parameter.
function hermite(v0, v1, m0, m1, h, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * v0 +
    (t3 - 2 * t2 + t) * h * m0 +
    (-2 * t3 + 3 * t2) * v1 +
    (t3 - t2) * h * m1
  );
}

export function shotAt(p) {
  const clamped = clamp(p, 0, 1);

  let i = 0;
  while (i < SHOTS.length - 2 && clamped >= KNOTS[i + 1]) i++;

  const h = KNOTS[i + 1] - KNOTS[i];
  const t = h > 0 ? (clamped - KNOTS[i]) / h : 0;

  const at = (f) => hermite(VALUES[f][i], VALUES[f][i + 1], TANGENTS[f][i], TANGENTS[f][i + 1], h, t);

  // A Hermite curve can overshoot its control values between knots, which
  // is harmless for a roll angle and not harmless for an altitude or an
  // aim. The clamps are wide enough that they never bite on the authored
  // list and narrow enough that a future edit cannot fly the camera into
  // the ground or point it at nothing.
  return {
    latDeg: at("latDeg"),
    lonDeg: at("lonDeg"),
    altitudeKm: clamp(Math.exp(at("logAlt")), 250, 500000),
    aim: clamp(at("aim"), 0, 1.25),
    azimuthDeg: at("azimuthDeg"),
    rollDeg: at("rollDeg"),
    fovDeg: clamp(at("fovDeg"), 12, 80),
    offsetX: at("offsetX"),
    offsetY: at("offsetY"),
  };
}

/* =========================================================================
   FROM A SHOT TO A CAMERA
   ========================================================================= */

// The angle between straight down and the horizon, seen from altitude h.
// Everything about framing hangs off this number.
export function limbAngleRad(altitudeKm, radiusKm = EARTH_RADIUS_KM) {
  return Math.PI / 2 - Math.acos(clamp(radiusKm / (radiusKm + altitudeKm), -1, 1));
}

// Local up, north and east at a point on the globe, in the same frame
// mission.js uses. East is cross(north, up) and not the other way round;
// getting that backwards mirrors every camera move.
export function surfaceFrame(latDeg, lonDeg) {
  const u = latLonToUnitVector(latDeg, lonDeg);
  const up = [u.x, u.y, u.z];

  // North is whatever is left of the polar axis after removing the part
  // along up. Undefined exactly at the poles, which no shot goes near.
  const nx = -up[0] * up[1];
  const ny = 1 - up[1] * up[1];
  const nz = -up[2] * up[1];
  const nl = Math.hypot(nx, ny, nz) || 1;
  const north = [nx / nl, ny / nl, nz / nl];

  const east = [
    north[1] * up[2] - north[2] * up[1],
    north[2] * up[0] - north[0] * up[2],
    north[0] * up[1] - north[1] * up[0],
  ];

  return { up, north, east };
}

// Position, view direction and up vector for a shot. Returned as plain
// arrays so this stays testable without three.js in the room.
export function shotToCamera(shot, radiusKm = EARTH_RADIUS_KM) {
  const { up, north, east } = surfaceFrame(shot.latDeg, shot.lonDeg);
  const r = radiusKm + shot.altitudeKm;
  const position = [up[0] * r, up[1] * r, up[2] * r];

  const pitch = shot.aim * limbAngleRad(shot.altitudeKm, radiusKm);
  const az = shot.azimuthDeg * DEG;

  // Horizontal heading at the sub-camera point.
  const heading = [
    north[0] * Math.cos(az) + east[0] * Math.sin(az),
    north[1] * Math.cos(az) + east[1] * Math.sin(az),
    north[2] * Math.cos(az) + east[2] * Math.sin(az),
  ];

  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);

  // pitch 0 looks straight down; pitch = 90 degrees looks along the horizon.
  const forward = [
    -up[0] * cp + heading[0] * sp,
    -up[1] * cp + heading[1] * sp,
    -up[2] * cp + heading[2] * sp,
  ];

  // The up vector that keeps the horizon level, before roll.
  let camUp = [
    up[0] * sp + heading[0] * cp,
    up[1] * sp + heading[1] * cp,
    up[2] * sp + heading[2] * cp,
  ];

  // Roll about the view axis, by Rodrigues. A few degrees of tilt is what
  // stops the horizon from lying dead flat across the page like a rule.
  const roll = shot.rollDeg * DEG;
  if (roll !== 0) {
    const c = Math.cos(roll);
    const s = Math.sin(roll);
    const cross = [
      forward[1] * camUp[2] - forward[2] * camUp[1],
      forward[2] * camUp[0] - forward[0] * camUp[2],
      forward[0] * camUp[1] - forward[1] * camUp[0],
    ];
    const dot = forward[0] * camUp[0] + forward[1] * camUp[1] + forward[2] * camUp[2];
    camUp = [
      camUp[0] * c + cross[0] * s + forward[0] * dot * (1 - c),
      camUp[1] * c + cross[1] * s + forward[1] * dot * (1 - c),
      camUp[2] * c + cross[2] * s + forward[2] * dot * (1 - c),
    ];
  }

  return {
    position,
    forward,
    up: camUp,
    target: [
      position[0] + forward[0] * r,
      position[1] + forward[1] * r,
      position[2] + forward[2] * r,
    ],
    fovDeg: shot.fovDeg,
    offsetX: shot.offsetX,
    offsetY: shot.offsetY,
  };
}
