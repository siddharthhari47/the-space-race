// The Saturn V interlude: a camera on the vehicle that is actually flying.
//
// Everything else on this layer is the mission: a vehicle four thousand
// times life size, drawn against a planet, because that is the only way a
// launch reads at all when the launch is a background to a page of text.
// Between the writing section and About Me the page opens up and there is
// nothing to read for three screens, and that gap is this file's chance to
// look at the vehicle up close instead of as a speck against Earth.
//
// This used to be a second Saturn V: its own scene, its own camera, a full
// static stack faded in over the mission render. It looked wrong for a
// reason that had nothing to do with how it was lit -- by the time the
// reader scrolls this far the real vehicle has already shed its first two
// stages into the Atlantic, and a full stack standing untouched three
// screens later was a rocket that had not happened yet, next to the one
// that already had. Worse, staging1 and staging2 (see the EVENTS table in
// flight.js) both fire *during* this section's own span, so the mismatch
// was not a one-time wrongness at the boundary -- it was two events the
// vehicle in this file flatly contradicted while they were happening in
// the other one.
//
// What follows instead is a camera move authored the same way it always
// was -- a position and an aim in metres along the vehicle's own axis --
// but placed against the real vehicle's real pose for the current instant,
// read off vehicle.js's stack after flight.js has posed it for the frame.
// When the interstage comes apart on screen here, it is the interstage
// coming apart, not a second one nearby pretending it has not yet.
// tourCameraWorld, further down, does the placing; tourCameraAt and
// tourDistanceM below it are the authored half and are unchanged from when
// this was a separate scene -- only where the result gets pointed changed.
//
/* =========================================================================
   THE FACTS IT IS ALLOWED TO STATE
   =========================================================================

   The captions in this section come out of one document, read rather than
   remembered:

     Roger E. Bilstein, "Stages to Saturn: A Technological History of the
     Apollo/Saturn Launch Vehicles", NASA SP-4206, The NASA History Series,
     Scientific and Technical Information Branch, NASA, Washington DC, 1980.
     https://www.nasa.gov/wp-content/uploads/2023/06/stages-to-saturn-sp-4206.pdf

   Page 5 carries the whole vehicle in one paragraph -- five F-1s at
   6 672 000 newtons each for 33 360 000 total, RP-1 and liquid oxygen, two
   and a half minutes; five J-2s at 1 112 000 newtons on liquid hydrogen,
   six minutes to a hundred and eighty-four kilometres; one J-2 on the third
   stage, two and three quarter minutes to orbit and then a restart two
   hours forty-four after liftoff. Those numbers are on /references/ with
   this citation beside them.

   Worth recording because it is exactly the sort of thing that goes wrong
   quietly: the J-2 thrust figure is widely given as 200 000 pounds, and the
   first search result for it said so. SP-4206 says 1 112 000 newtons, which
   is 250 000. The 200 000 figure is the earlier rating of an engine that
   was uprated twice. The page states the number the document it cites
   actually contains.

   ========================================================================= */

import { makeSpline, makeRamp } from "./spline.js";
import { clamp, smootherstep } from "./mission.js";

/* =========================================================================
   THE MOVE
   =========================================================================

   Authored as a camera position in metres along the vehicle, and a width
   of vehicle to fit across the frame. The second is the useful half: at a
   fixed distance the vehicle overflows a four-by-three window and swims in
   a twenty-one-by-nine one, whereas "ninety-eight metres of rocket, edge to
   edge" is the same picture on both, and the distance falls out of the
   aspect ratio at the moment of drawing.

   x runs along the vehicle: 0 is the engine plane, 110.6 is the tip of the
   escape tower. The camera sits at (camX, riseM, distance) and looks at
   (camX + leadM, 0, 0), so a lead of zero is square-on and a lead of
   twenty-odd puts the vanishing point up the stack -- which is what makes
   a cylinder read as a long cylinder rather than as a stripe.

   riseM is the camera's height above the axis, and since the aim is always
   at y = 0 it buys elevation rather than composition -- the subject stays
   centred and we look down on it. Roughly a sixth of the distance, which
   is about ten degrees: enough to see along the top of the cylinder and
   read it as round, shallow enough that it is still a side elevation. It
   falls through the move, so the tail is seen from above and the escape
   tower head on.

   shiftX and shiftY are the composition, and they are the reason the first
   version of this table had to be thrown away. They shift the frustum
   sideways and upward without turning the camera, in units where 1 is half
   the frame: shiftY of 0.5 lifts the subject a quarter of the way up the
   window and leaves the bottom half empty.

   That matters because of what else is on the screen. A hundred and ten
   metres of rocket seen from sixty crosses the frame from edge to edge --
   there is no camX that puts an empty margin beside the middle of a
   cylinder, because the cylinder does not end anywhere near the middle. So
   the room for the captions cannot be made on the left; it has to be made
   underneath. The vehicle rides high, the notes sit in the left half at
   about the height of the reader's eye, and the mission's Earth is where it
   always is, low and to the right. Three things, three corners, none of
   them on top of another.

   The first version had none of this and the captions came out as grey text
   on a white propellant tank. The check now asserts the clearance rather
   than trusting the table.

   The sequence, and why it is in this order: the vehicle sweeps in from the
   right at full length, seen from its own tail looking up the stack --
   because the brief for this section was that it "come across the screen
   full size" and that the biggest goal is scale, and nothing sells a
   hundred and ten metres like standing at the foot of it. camX does not
   retreat from there. It is a single dolly: flat through the wide shot and
   the push-in, then climbing the vehicle beat by beat, F-1s to interstage
   to S-II to S-IVB to tower, and on into the pull-out. One direction, no
   backing up to get a better look at something already passed -- a guided
   tour of each segment done as one continuous move rather than a series of
   separate ones.

   The tightest framing is sixty metres across and not thirty. The model is
   NASA's printable Saturn V decimated to about twelve thousand triangles --
   a budget set for a vehicle a couple of hundred pixels tall in the mission
   overhead -- and closer than about twenty-five pixels to the metre its
   engine bells stop being bells. Sixty metres across a 1920 window is
   thirty-two pixels to the metre, which is the most this geometry can hold.
   Framing it tighter does not show more of the rocket, it shows more of the
   decimator. */

// camX never comes back down. That is the whole point of this revision:
// what used to bring the camera in from the middle of the vehicle and then
// drop it to the tail -- a reversal, however smooth -- now starts the wide
// shot already at the tail (leadM does the work of showing the far end,
// not camX) and holds it there through the push-in, so the climb from
// F-1s to tower is the same single, one-directional move as the wide shot
// that opens it and the pull-out that closes it. Between each caption a
// "breath" knot lets spanM swell before the next push-in -- the undulation
// the brief asked for -- without camX ever needing to explain it by moving
// backward. camX holds flat again for the whole pull-out (0.9 through 1.0):
// the point of a pull-out is spanM opening up and leadM easing the aim back
// toward the vehicle's own middle, not the camera continuing to climb past
// the nose while the frame tries to catch up. It could not catch up --
// climbing another fifteen-odd metres while also widening is what used to
// carry the engines off the left edge of frame before spanM got there.
//
// The knot at 0.91 exists because the tower beat at 0.9 is, by design, the
// tightest frame in the whole table (sixty metres, the same floor as every
// other beat) and the pull-out has to have both ends of a hundred and ten
// metres of vehicle inside the frame with room to spare only three hundred
// and fifty thousandths of u later. A log-splined curve does not cover that
// kind of ground in that little u without a knot to aim it at: asking the
// spline to go from sixty to two hundred and ten across 0.9 to 0.95 unaided
// left it only two-thirds of the way there at 0.93, which is exactly the
// frame apollo-mission-check.mjs caught the engines missing from. 0.91 gives
// the curve somewhere to be already wide by, and the tower beat itself is
// unchanged -- Hermite still lands on 0.9's sixty metres exactly.
const SHOTS = [
  //     u        camX   riseM  spanM  leadM  rollDeg  shiftX  shiftY
  { u: 0.0,   camX: 55,    riseM: 20, spanM: 220, leadM: 0, rollDeg: -0.5, shiftX: 0.0,  shiftY: 0.1 }, // wide: the whole stack, small
  { u: 0.2,   camX: 45,    riseM: 14, spanM: 140, leadM: 0, rollDeg: -0.4, shiftX: 0.0,  shiftY: 0.3 },
  { u: 0.38,  camX: 21,    riseM: 10, spanM: 74,  leadM: 0, rollDeg: -0.3, shiftX: 0.0,  shiftY: 0.5 },  // the S-IC, five F-1 engines
  { u: 0.44,  camX: 30,    riseM: 10, spanM: 74,  leadM: 0, rollDeg: -0.2, shiftX: 0.0,  shiftY: 0.5 },
  { u: 0.49,  camX: 43.5,  riseM: 9,  spanM: 66,  leadM: 0, rollDeg: -0.1, shiftX: 0.0,  shiftY: 0.5 },  // the interstage ring
  { u: 0.56,  camX: 66,    riseM: 11, spanM: 96,  leadM: 0, rollDeg: 0.0,  shiftX: 0.0,  shiftY: 0.5 },
  { u: 0.6,   camX: 88,    riseM: 12, spanM: 100, leadM: 0, rollDeg: 0.05, shiftX: 0.0,  shiftY: 0.5 },
  { u: 0.64,  camX: 103.3, riseM: 9,  spanM: 76,  leadM: 0, rollDeg: 0.1,  shiftX: 0.0,  shiftY: 0.5 },  // the escape tower over the CM
  { u: 0.695, camX: 80.15, riseM: 11, spanM: 105, leadM: 0, rollDeg: 0.2,  shiftX: 0.0,  shiftY: 0.5 },
  { u: 0.75,  camX: 57,    riseM: 9,  spanM: 76,  leadM: 0, rollDeg: 0.3,  shiftX: 0.0,  shiftY: 0.5 },  // the S-II
  { u: 0.8,   camX: 68,    riseM: 9,  spanM: 80,  leadM: 0, rollDeg: 0.35, shiftX: 0.0,  shiftY: 0.5 },
  { u: 0.85,  camX: 80.5,  riseM: 9,  spanM: 76,  leadM: 0, rollDeg: 0.4,  shiftX: 0.0,  shiftY: 0.5 },  // the S-IVB
  { u: 0.93,  camX: 55.3,  riseM: 12, spanM: 140, leadM: 0, rollDeg: 0.3,  shiftX: 0.0,  shiftY: 0.3 },
  { u: 1.0,   camX: 55.3,  riseM: 18, spanM: 200, leadM: 0, rollDeg: 0.2,  shiftX: 0.0,  shiftY: 0.1 }, // pulled out, the stack whole again
];

// The field of view is constant. It is the one parameter here that has no
// business moving: changing it mid-move is a zoom, and a zoom on top of a
// dolly is the shot that makes people motion sick.
export const TOUR_FOV_DEG = 34;

export { SHOTS as TOUR_SHOTS };

// spanM is splined in logs for the same reason shots.js splines altitude:
// the move runs close to a hundred metres across at the wide shot, down to
// sixty at the tightest beat, and back out past two hundred for the
// hand-off, and equal scroll should buy equal *ratio* of framing, not
// equal metres. Linearly, the last third of the push-in would arrive all
// at once -- and the pull-out would sit still and then leap.
const sample = makeSpline(
  SHOTS.map((s) => s.u),
  {
    riseM: SHOTS.map((s) => s.riseM),
    logSpan: SHOTS.map((s) => Math.log(s.spanM)),
    leadM: SHOTS.map((s) => s.leadM),
    rollDeg: SHOTS.map((s) => s.rollDeg),
    shiftX: SHOTS.map((s) => s.shiftX),
    shiftY: SHOTS.map((s) => s.shiftY),
  }
);

// camX is the one field here that must never give ground back -- a dolly
// that drifts past where it is going and settles back is not smooth, it is
// backing up. Hermite's finite-difference tangents can do exactly that
// near a plateau: the flat run from the tail through the wide shot and
// into the first push-in is followed by the climb into the beats, and the
// tangent at the knot where flat meets climbing gets pulled toward the
// climb, which makes the flat side overshoot below its own value to match.
// makeRamp is the tool this file already has for a curve that must not
// overshoot under any circumstances -- monotone piecewise-linear -- and
// camX needs exactly that guarantee, for the same reason the mission
// clock does: an overshoot runs it backward.
const camXAt = makeRamp(SHOTS.map((s) => [s.u, s.camX]));

/**
 * The camera for one instant of the tour, in the vehicle's own body frame.
 * Pure: no DOM, no renderer, no scene. tools/apollo-mission-check.mjs
 * asserts against it directly, and so does tourCameraWorld below, which is
 * the only thing that turns this into a place in the actual world.
 *
 * @param {number} u  0 at the top of the section, 1 at the bottom
 * @returns {{camX:number, riseM:number, spanM:number, leadM:number,
 *            rollDeg:number, shiftX:number, shiftY:number, fovDeg:number}}
 */
export function tourCameraAt(u) {
  const c = clamp(u, 0, 1);
  const s = sample(c);
  return {
    camX: camXAt(c),
    riseM: s.riseM,
    // A Hermite curve overshoots between knots. On a span that is harmless
    // at the top and not at the bottom -- undershooting the close framing
    // walks the camera into the vehicle -- so it is clamped a little under
    // the tightest authored shot and a little over the widest.
    spanM: clamp(Math.exp(s.logSpan), 50, 250),
    leadM: s.leadM,
    rollDeg: s.rollDeg,
    // Clamped for the same reason and with the same shape: an overshoot in
    // the lift is the vehicle leaving the top of the window.
    shiftX: clamp(s.shiftX, -0.32, 0.32),
    shiftY: clamp(s.shiftY, -0.05, 0.62),
    fovDeg: TOUR_FOV_DEG,
  };
}

/**
 * How far back the camera has to be for `spanM` metres to cross the frame.
 *
 * The horizontal half-angle first, because the fit is across the width: at
 * aspect a the horizontal half-field is atan(tan(fov/2) * a), and the
 * distance is half the span over its tangent.
 */
export function tourDistanceM(spanM, aspect, fovDeg = TOUR_FOV_DEG) {
  const halfV = Math.tan((fovDeg * Math.PI) / 360);
  const halfH = halfV * Math.max(aspect, 0.2);
  return spanM / 2 / halfH;
}

/**
 * How much of the tour camera to blend into the render camera. Zero at
 * both ends of the section, one through the middle -- scene.js reads this
 * as a weight between the mission camera and tourCameraWorld's placement
 * of this file's shot on the real, flying vehicle, not as a draw gate for
 * a second copy of it. See the note above tourCameraWorld, below.
 *
 * The tail matters more than the head. At u = 1 the About Me section is
 * arriving, and a camera still locked onto the vehicle would carry a
 * hundred metres of rocket across somebody's biography instead of letting
 * the mission framing take back over.
 *
 * How long the approach takes is the whole question, and it used to be
 * answered wrongly. The ramp ran from u = 0.02 to 0.08. The section travels
 * 2160 px at a 1080-tall window, so that is about 130 px of scroll -- one
 * notch of a mouse wheel -- to carry the camera from a mission shot
 * thousands of kilometres out to a tour shot a few hundred kilometres from
 * the vehicle. Measured, the distance to the vehicle was collapsing at a
 * peak of 71 in d(ln distance)/du. Scrolling at any speed it did not read as
 * a move at all; it read as a cut, which is exactly what it was reported as.
 *
 * It now runs from the top of the section to u = 0.30 -- about 650 px --
 * which brings that peak rate down to about 12. The approach is the shot,
 * not the transition into it.
 *
 * Beginning at zero costs something the old ramp was buying. The 0.02 was
 * measured, not arbitrary: the tour's opening shot had the vehicle entirely
 * off the right of frame, and the engine plane did not cross that edge until
 * u = 0.016, so a ramp starting at zero would have spent its first frames
 * easing toward a shot with nothing in it. The answer is not a later start
 * but a different opening shot -- SHOTS[0] now holds the whole vehicle,
 * wide and small, so there is something to approach from the first pixel.
 * The mission check asserts that directly, at both ends and both aspects.
 *
 * The tail still matters more than the head. At u = 1 the About Me section
 * is arriving, and a camera still locked onto the vehicle would carry a
 * hundred metres of rocket across somebody's biography instead of letting
 * the mission framing take back over.
 */
export function tourWeightAt(u) {
  const c = clamp(u, 0, 1);
  return smootherstep(0.0, 0.30, c) * (1 - smootherstep(0.88, 1.0, c));
}

/* =========================================================================
   THE VEHICLE THIS IS DRAWN ON
   =========================================================================

   tourCameraAt places a camera in a frame carried by the vehicle: x along
   its axis, zero at the engine plane, y and z answering "how far above the
   axis" and "how far from it, the other way." tourCameraWorld turns that
   into a camera in the actual scene, against the vehicle that is actually
   flying -- the same job shots.js's shotToCamera does for a mission shot
   authored in latitude and longitude, so that scene.js can blend between
   the two outputs without caring which file produced either one.

   The one thing it cannot do is reuse the vehicle's own rotation.
   vehicle.js points the model with
   THREE.Quaternion().setFromUnitVectors(UP, axis), which finds the
   shortest rotation from the model's own +Y onto the flight axis --
   and "shortest" leaves the roll about that axis wherever the arc happens
   to put it, which is not a choice anyone made, just whatever falls out of
   the two vectors on a given frame. A camera up vector taken from that
   rotation would roll unpredictably as the vehicle pitches over: a
   different defect from the one this file used to have, and just as
   visible -- the horizon tips for no reason the reader can see.

   So the basis below is rebuilt from scratch, choosing the one property
   the old camera actually wanted: B, the "up" axis, points away from the
   planet. That is what puts Earth's limb low and level in the frame rather
   than tumbling through it as the vehicle rolls, and it is deliberate in
   exactly the way shiftY above is deliberate -- not the "natural" choice,
   the composition's choice, and not something a future pass should
   "improve" by picking a different up. Given the vehicle's nose direction
   A and the direction away from Earth's centre, B is what is left of "away
   from Earth" once its component along A is removed, and C completes a
   right-handed frame from the two. */

function norm3(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

// A perpendicular to `a` that does not depend on any other direction, for
// the one case the construction above cannot handle: the nose pointing
// straight at or away from Earth's centre, where "away from Earth, minus
// its component along the nose" is zero divided by nothing. On paper that
// is liftoff, a vertical vehicle dead over the sub-vehicle point -- but not
// here. vehicleFrame's axis is up*cos(pitch) + forward*sin(pitch) with up
// and forward orthonormal, so its angle off the radial direction *is* the
// pitch angle, and flight.js does not pitch this vehicle over until well
// after the interlude opens: 51 degrees off vertical at u = 0 and climbing
// to 90 by u = 1 (checked in tools/apollo-mission-check.mjs, in the same
// place that checks the interlude's captions land on their events). This
// branch exists for robustness against a future change to that timing, not
// for anything the section currently shows.
function stablePerp(a) {
  const ref = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  return norm3([
    ref[1] * a[2] - ref[2] * a[1],
    ref[2] * a[0] - ref[0] * a[2],
    ref[0] * a[1] - ref[1] * a[0],
  ]);
}

/**
 * Places tourCameraAt's shot against a real vehicle pose in world space,
 * the way shots.js's shotToCamera places a mission shot against a lat/lon.
 * Pure: plain arrays in, plain object out, no THREE and no scene graph, so
 * tools/apollo-mission-check.mjs can call it directly.
 *
 * @param {number} u        0 at the top of the section, 1 at the bottom
 * @param {number} aspect   canvas width / height
 * @param {object} vehicle
 * @param {number[]} vehicle.origin         engine plane, world space, scene km
 * @param {number[]} vehicle.axis           nose direction, world space, unit
 * @param {number[]} vehicle.earthCenter    Earth's centre, world space, km
 * @param {number} vehicle.kmPerVehicleMetre  scene km per model metre
 * @returns {{position:number[], target:number[], up:number[], fovDeg:number,
 *            rollDeg:number, shiftX:number, shiftY:number}}
 */
export function tourCameraWorld(u, aspect, { origin, axis, earthCenter, kmPerVehicleMetre }) {
  return placeShot(tourCameraAt(u), aspect, {
    origin,
    axis,
    upCenter: earthCenter,
    kmPerVehicleMetre,
  });
}

/**
 * The half of the job above that has nothing to do with the Saturn V.
 *
 * Given a shot in the vehicle's body frame and a vehicle pose in the world,
 * this is where the camera goes. It was inside tourCameraWorld until the
 * lunar act needed exactly the same construction against a different shot
 * table and a different body -- out there the thing whose horizon has to
 * stay level is the Moon, not the Earth -- so the one parameter that used
 * to be called earthCenter is now called upCenter and means what it always
 * meant: the centre of whatever this shot is composed against.
 *
 * @param {object} shot  as returned by tourCameraAt or lunarCameraAt
 * @param {number} aspect  canvas width / height
 * @param {object} rig
 * @param {number[]} rig.origin    engine plane, world space, scene km
 * @param {number[]} rig.axis      nose direction, world space, unit
 * @param {number[]} rig.upCenter  centre of the body to keep level, world km
 * @param {number} rig.kmPerVehicleMetre  scene km per model metre
 */
export function placeShot(shot, aspect, { origin, axis, upCenter, kmPerVehicleMetre }) {
  const distance = tourDistanceM(shot.spanM, aspect, shot.fovDeg);

  const A = norm3(axis);
  const toVehicle = [origin[0] - upCenter[0], origin[1] - upCenter[1], origin[2] - upCenter[2]];
  const radial = norm3(toVehicle);
  const along = radial[0] * A[0] + radial[1] * A[1] + radial[2] * A[2];
  const rawB = [radial[0] - A[0] * along, radial[1] - A[1] * along, radial[2] - A[2] * along];
  const rawLen = Math.hypot(rawB[0], rawB[1], rawB[2]);
  const B = rawLen > 1e-6 ? [rawB[0] / rawLen, rawB[1] / rawLen, rawB[2] / rawLen] : stablePerp(A);
  const C = norm3([
    A[1] * B[2] - A[2] * B[1],
    A[2] * B[0] - A[0] * B[2],
    A[0] * B[1] - A[1] * B[0],
  ]);

  const s = kmPerVehicleMetre;
  const position = [
    origin[0] + s * (A[0] * shot.camX + B[0] * shot.riseM + C[0] * distance),
    origin[1] + s * (A[1] * shot.camX + B[1] * shot.riseM + C[1] * distance),
    origin[2] + s * (A[2] * shot.camX + B[2] * shot.riseM + C[2] * distance),
  ];
  /* Where the camera looks: a point on the vehicle's own axis, `lead`
     metres from the engine plane, plus an optional lift off that axis.

     The lift exists because a vehicle standing on its legs is a different
     framing problem from one flying past. Broadside, the axis runs across
     the frame and aiming along it is aiming at the middle of the subject.
     Upright, the axis runs *up* the frame, A becomes the direction of
     travel instead, and aiming along it lands the shot on the ground at
     the vehicle's feet with the whole vehicle above the top edge -- which
     is what the first landing render did. aimUpM moves the aim up the
     vehicle instead. It defaults to zero, so every shot in the Saturn V
     tour is placed by exactly the arithmetic it was tuned under. */
  const lead = shot.camX + shot.leadM;
  const up = shot.aimUpM || 0;
  const target = [
    origin[0] + s * (A[0] * lead + B[0] * up),
    origin[1] + s * (A[1] * lead + B[1] * up),
    origin[2] + s * (A[2] * lead + B[2] * up),
  ];

  return {
    position,
    target,
    up: B,
    fovDeg: shot.fovDeg,
    rollDeg: shot.rollDeg,
    shiftX: shot.shiftX,
    shiftY: shot.shiftY,
  };
}
