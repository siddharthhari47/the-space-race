// Apollo 11's ascent, as a pure function of scroll progress.
//
// No three.js and no DOM, for the same reason mission.js has none: a
// rendered frame is hard to check and a number is easy, so everything that
// can be arithmetic is kept where arithmetic can reach it.
// tools/apollo-mission-check.mjs imports this directly under Node.
//
// THE ONE RULE THIS FILE ENFORCES
//
// Everything here is a function of p alone. Nothing integrates, nothing
// accumulates, nothing remembers which way the page was last moving. Scroll
// down and the S-IC falls away; scroll back up and it comes back and
// re-attaches, exactly. That is not a nice-to-have — the layer is driven by
// a scroll position that goes both ways and can jump anywhere, so any state
// that had to be stepped forwards would desynchronise the first time
// somebody dragged the scrollbar, and it would stay desynchronised.
//
// WHAT IS TRUE HERE AND WHAT IS NOT
//
// The event *order* is real. Most of the event *times* are published and
// cited below; the three that are not are marked in the table itself, and
// they are interpolations between published ones rather than figures.
// The altitudes and downrange distances are shaped to pass through the one
// figure that is published and load-bearing — a 103.0 by 103.0 nautical
// mile parking orbit — and are otherwise an interpolation, not a citation;
// they are marked as such where they appear.
//
// The drawn scale is not real at all, and the references page says so. A
// Saturn V is 110.6 m against an Earth 6,371 km in radius. At the framing
// this page opens on, one pixel covers about three kilometres of ground, so
// a life-size Saturn V is four hundredths of a pixel and its 190 km parking
// orbit is a hairline laid on the limb. Both are drawn up: see
// STACK_HEIGHT_KM and ALTITUDE_GAIN.

import { clamp, smootherstep } from "./mission.js";
import { makeCurve, makeRamp } from "./spline.js";

/* =========================================================================
   THE TIMELINE
   =========================================================================

   Ground elapsed times as published in the Apollo 11 Flight Journal, part
   of the Apollo Flight Journal at apollojournals.org — "Day 1, part 1:
   Launch" for everything up to parking orbit insertion, and "Day 1, part 2:
   Earth Orbit and Translunar Injection" for the orbit and the burn out of
   it.

     https://www.apollojournals.org/afj/ap11fj/01launch.html
     https://www.apollojournals.org/afj/ap11fj/02earth-orbit-tli.html

   Corrected transcript and commentary copyright 2008-2026 W. David Woods,
   Kenneth D. MacTaggart and Frank O'Brien. What is taken from it here is a
   list of times, which is fact and not expression; none of its text is
   reproduced anywhere on this site.

   Two of these are worth reading twice, because the obvious guess is wrong.
   The S-II's aft interstage comes off at 000:03:13 and the launch escape
   tower goes at 000:03:17 — the interstage first, four seconds ahead of the
   tower. And the S-IC's centre engine shuts down a full twenty-seven
   seconds before the other four, at 000:02:17 against staging at 000:02:44,
   which is why the plume narrows well before it goes out.

   The page-progress column is authored, not derived. Scroll distance is not
   proportional to mission time and pretending otherwise would put the whole
   launch inside one pixel: the first stage burns for two minutes forty and
   the coast to the Moon takes three days. The p values line up with the
   phase boundaries in mission.js, which is what keeps the camera keyframes
   and the vehicle events on the same instants. */

// The five separations below (staging1, interstageOff, towerOff, staging2)
// plus tliIgnition are pinned to the interlude: #saturn-v now sits between
// #playground and #writing, and its five captions walk the vehicle in
// chronological order (S-IC, separation, tower, S-II, S-IVB) as the reader
// scrolls through it. Each of those events is timed to fire just after its
// caption reaches full brightness, so the hardware the caption is describing
// actually comes apart while the caption is on screen. tools/apollo-mission-
// check.mjs asserts the "just after" part directly.
//
// The two engine-cutoff rows ahead of staging1 (sicInboardOut,
// sicOutboardOut) move with it rather than staying at their old page
// position, even though nothing above maxQ has to. That is not a reading
// choice, it is the tail-off constraint below: the check requires the S-IC
// to still be burning 0.02 of the page before it separates and to have
// throttled to zero only a few hundredths before that, and a plume that
// died three-tenths of the page before the stage it belongs to actually
// left would either fail that check or read as a very long, unpowered
// coast. Keeping the gap between cutoff and separation the same width it
// always was, just moved, satisfies both. siiIgnition and the S-II's own
// two cutoffs follow the same logic ahead of staging2.
export const EVENTS = [
  { key: "enginesStart",   get: -6.9,   p: 0.075, label: "Engine start" },
  { key: "liftoff",        get: 0,      p: 0.115, label: "Liftoff" },
  { key: "towerClear",     get: 12,     p: 0.135, label: "Tower clear, roll program" },
  { key: "maxQ",           get: 83,     p: 0.225, label: "Max Q" },
  { key: "sicInboardOut",  get: 137,    p: 0.560, label: "S-IC centre engine cutoff" },
  // Four of the times in this table could not be confirmed against the
  // journal's own text: outboard cutoff, S-II ignition, and the S-II's two
  // cutoffs below. They are placed between times that are published — the
  // stagings either side — so they sit within a few seconds, but they are
  // interpolations, not figures, and nothing on /references/ quotes them.
  { key: "sicOutboardOut", get: 161,    p: 0.578, label: "S-IC outboard cutoff" },
  { key: "staging1",       get: 164,    p: 0.593, label: "S-IC/S-II staging" },
  { key: "siiIgnition",    get: 165,    p: 0.596, label: "S-II ignition" },
  { key: "interstageOff",  get: 193,    p: 0.624, label: "Interstage separation" },
  { key: "towerOff",       get: 197,    p: 0.652, label: "Launch escape tower jettison" },
  { key: "siiInboardOut",  get: 462,    p: 0.665, label: "S-II centre engine cutoff" },
  { key: "siiOutboardOut", get: 553,    p: 0.678, label: "S-II outboard cutoff" },
  { key: "staging2",       get: 555,    p: 0.682, label: "S-II/S-IVB staging" },
  { key: "sivbIgnition",   get: 556,    p: 0.685, label: "S-IVB ignition" },
  { key: "orbitInsertion", get: 705,    p: 0.696, label: "Parking orbit insertion" },
  // These two were 9952 and 10299 until they were checked against the
  // source, and both were 96 seconds late -- consistently, which is what a
  // wrong epoch looks like rather than a wrong reading. SP-4029's own
  // timeline gives the S-IVB's second ignition at 002:44:16.20 and its
  // cutoff at 002:50:03.03, and its GET and GMT columns agree with a range
  // zero of 13:32:00 UTC on both rows, checked by hand. The burn is 346.8
  // seconds long either way; only where it sits moved.
  { key: "tliIgnition",    get: 9856.2,   p: 0.706, label: "Translunar injection" },
  { key: "tliCutoff",      get: 10203.03, p: 0.730, label: "TLI cutoff" },

  /* THE HOUR THAT REARRANGES THE SPACECRAFT

     Both times are read off Table 3-I, Sequence of Events, in the Apollo 11
     Mission Report (MSC-00171) -- the rows "Command and service module/
     S-IVB separation" at 03:17:04.6 and "Spacecraft ejection" at 04:16:59.1.
     They are when the vehicle stops being a rocket and becomes two
     spacecraft: Columbia backs off, turns end for end, docks with Eagle's
     roof and pulls it out of the adapter, and the S-IVB is left behind with
     the adapter panels open around nothing.

     What the page shows of that is the beginning and the end. The Saturn V
     model was cut for 3D printing and has no articulated docking, and
     nothing here turns the command module around, so the lander comes on at
     the nose across this window while the spent stage and its adapter fall
     away, and the turn itself happens off-camera. It is a fair place for an
     ellipsis: the vehicle is a few pixels across for this whole stretch,
     between the end of the Saturn V tour and the Moon coming up. */
  { key: "transposition",  get: 11824.6,  p: 0.752, label: "Transposition and docking" },
  { key: "lmExtraction",   get: 15419.1,  p: 0.782, label: "Eagle clear of the S-IVB" },

  /* THE LUNAR ACT, past the end of the page the rest of this table was
     tuned on.

     u = 1 is where the homepage used to stop. Everything below it happens
     in the lunar interlude, which measurePage() in scene.js keeps out of
     the denominator precisely so that these can be written past 1 without
     moving anything above them. Inside that interlude the page does not
     read these p values straight off the scroll position: lunar.js re-times
     them, so that a day in orbit does not get the same scroll as the twelve
     minutes that matter. These are the mission's own spacing, and
     lunarMissionP is the reader's.

     Times are the Apollo 11 timeline in Orloff, Apollo by the Numbers (NASA
     SP-4029), checked row by row against Table 3-I of the Apollo 11 Mission
     Report (MSC-00171). That check corrected two rows. Undocking is
     100:12:00; the 100:39:52.9 that was here is Columbia's separation burn
     twenty-eight minutes later, which now has its own row. Touchdown is
     102:45:39.9; the 102:45:41.4 that was here is engine cutoff, a second
     and a half after it. */
  { key: "loiIgnition",    get: 272990.37, p: 1.120, label: "Lunar orbit insertion" },
  { key: "loiCutoff",      get: 273347.90, p: 1.134, label: "LOI cutoff" },
  { key: "undock",         get: 360720.00, p: 1.176, label: "Eagle undocks" },
  // Columbia's nine-second thruster firing to open the gap. Its p is its
  // time interpolated between the rows either side, so adding it re-times
  // nothing.
  { key: "separation",     get: 362392.90, p: 1.1826, label: "Columbia's separation burn" },
  { key: "descentOrbit",   get: 365774.00, p: 1.196, label: "Descent orbit insertion" },
  { key: "poweredDescent", get: 369185.01, p: 1.232, label: "Powered descent" },
  { key: "touchdown",      get: 369939.90, p: 1.278, label: "Tranquility Base" },
];

/** The largest u the timeline defines anything at -- touchdown.
 *
 *  The page measures its own end from layout at runtime, because that is
 *  the only place the answer really lives. This is the authoring side of
 *  the same number, for the checks, which have no DOM to measure. The two
 *  are asserted to agree by the browser probe rather than assumed. */
export const LAST_U = EVENTS[EVENTS.length - 1].p;

const EVENT = Object.fromEntries(EVENTS.map((e) => [e.key, e]));

/** Page progress of a named event. Throws on a typo rather than returning
 *  undefined and quietly placing something at p = NaN. */
export function at(key) {
  const e = EVENT[key];
  if (!e) throw new Error(`no such mission event: ${key}`);
  return e.p;
}

/** Ground elapsed time, in seconds, at page progress p. Monotone by
 *  construction — makeRamp is piecewise-linear and cannot overshoot, which
 *  a Hermite through this table would, and an overshoot here would run the
 *  mission clock backwards. */
export const getSecondsAt = makeRamp([
  // The count opens at T-60 rather than at some larger round number
  // because the top of the page is a hook and T-60 is the moment the
  // commentary everyone knows begins. It is a composition decision in
  // exactly the way ALTITUDE_GAIN is, and it is disclosed alongside it:
  // the real terminal count ran for hours. countdown.js renders this.
  [0, -60],
  ...EVENTS.map((e) => [e.p, e.get]),
  // Nothing after touchdown. makeRamp holds its last value rather than
  // extrapolating, so the clock stops at 102:45:39.9 and stays there for
  // the last stretch of the interlude -- which is correct, and is the only
  // moment on this page where a frozen number is the honest one.
]);

/** The inverse: page progress at a ground elapsed time, in seconds. The
 *  same knots with the axes swapped, so it is exact at every event and
 *  linear between them. It is what lets a moment the table has no row for
 *  -- the start of the face-up yaw, say -- be placed by its published
 *  second rather than by eye. */
export const pAtSeconds = makeRamp([[-60, 0], ...EVENTS.map((e) => [e.get, e.p])]);

/* THE LANDER'S OWN CLOCK

   Moments inside the lunar act that the event table has no row for, in
   ground elapsed seconds, because the lander's attitude history is
   published against the clock. lander() and landerUpright() below say what
   is done with them.

   inspection: no source gives the start or end of the gear-inspection yaw.
   It is drawn from 100:19:05, when Armstrong tells Columbia he is "ready to
   start my yaw maneuver" (Apollo Flight Journal, day 5, part 2), to
   Columbia's separation burn at 100:39:52.9, which it cannot have outlasted.

   faceUp: Armstrong's "Rolling over" at 102:36:46 (Apollo Lunar Surface
   Journal) to "Face-up maneuver complete" at 102:37:59 (Mission Report,
   Table 5-I).

   p64 and p66: the Mission Report's Table 5-I, "Enter program P64" at
   102:41:32 and P66 at 102:43:22. */
export const LANDER_TIMES = Object.freeze({
  inspection: [361145, 362392.9],
  faceUp: [369406, 369479],
  p64: 369692,
  p66: 369802,
});

/* =========================================================================
   THE DRAWN SCALE
   =========================================================================

   Two separate exaggerations, because they answer two separate problems and
   tying them together makes both worse.

   STACK_HEIGHT_KM is how tall the vehicle is drawn. It is a symbol, in the
   sense that a city on a map is a dot far larger than the city: sized to be
   legible rather than to be right. The number is set so the stack is around
   a hundred and seventy pixels at the liftoff framing, which is what it
   takes for an S-IC to be distinguishable from an S-II when they come
   apart. tools/apollo-framing.mjs measures it.

   ALTITUDE_GAIN lifts the trajectory. Left alone, a 190 km parking orbit is
   three per cent of the Earth's radius — at the orbit framing, a hairline
   sitting on the limb, indistinguishable from the ground. Lifted twelvefold
   it reads as "just above the atmosphere", which is the thing the real
   number means and the drawn one otherwise would not convey.

   Downrange is NOT gained. It is drawn at life size, so the ground track is
   the true 2,600-odd kilometres, about twenty-three degrees of arc. Gaining
   it as well would fling the vehicle a third of the way round the planet
   and out of the frame; leaving it alone makes the climb steeper than it
   was, which is the smaller of the two lies and the better-looking one. */

export const STACK_HEIGHT_M = 110.6;

/* WHAT IS LEFT BY THE TIME ANYONE GETS TO THE MOON

   Everything here is in the same metres above the full stack's engine plane
   that the shot tables are written in. The one number not derived is the
   command module's forward hatch, 100.20, measured off the built model: it
   is the highest point of the Saturn V still flying once the escape tower
   has gone.

   Getting this wrong is not subtle. A camera aimed at the middle of a
   Saturn V, once two thirds of the Saturn V has gone, is aimed at empty
   space; a vehicle set on the ground by the engine plane of a stage it
   dropped in the Atlantic hovers kilometres above the Moon. Both were true
   of the first lunar renders, and both look like a framing mistake rather
   than the arithmetic mistake they are.

   The lander is the last thing on the stack and the only thing that lands,
   so its footpads are what SPACECRAFT_BASE_M means. It rides docked to that
   forward hatch, which puts its own middle half a lander above it. The
   height is the published one, 22 ft 11 in with the legs extended (Grumman's
   Lunar Module Quick Reference Data; NASA SP-4029), and the model is scaled
   to it; tools/build-lm.py has the citations, and the reason the model's
   origin is at its own mid-height. */
export const LM_HEIGHT_M = 22.917 * 0.3048; // 6.985
export const LM_CENTRE_M = 100.2 + LM_HEIGHT_M / 2;
export const SPACECRAFT_BASE_M = LM_CENTRE_M - LM_HEIGHT_M / 2; // 100.20
export const SPACECRAFT_TOP_M = LM_CENTRE_M + LM_HEIGHT_M / 2; // 107.19

export const STACK_HEIGHT_KM = 480;
export const KM_PER_VEHICLE_METRE = STACK_HEIGHT_KM / STACK_HEIGHT_M;

/* The drawn height is not constant, and this is the least comfortable
   decision in the file, so here is the whole argument.

   The camera retreats hard through the second stage -- it has to, because
   the Earth has to leave the frame by the end of the page. Measured against
   real renders, a vehicle drawn at a fixed 480 km falls from 149 px at the
   first-stage burn to 43 px at S-II/S-IVB separation. Forty-three pixels
   for the whole stack is about seventeen for the S-II, and two objects
   seventeen pixels long coming apart is not a separation anybody can see.
   The brief asks for every separation to be visible, so a fixed height
   fails the brief.

   Holding the apparent size *constant* fails differently: the rocket would
   stop shrinking while the planet behind it kept shrinking, and the eye
   reads that as the rocket coming towards the camera.

   So it shrinks, but more slowly than the framing alone would shrink it:
   149 px down to about 50, instead of down to 20. The vehicle is already a
   symbol -- 4,340 times life size, the way a city on a map is a dot far
   bigger than the city -- and this makes the symbol's exaggeration vary
   with distance the way a map's would. The multiplier is monotone, it never
   exceeds 2.4, and /references/ discloses it with the rest.

   Everything scales together: the separated stages, their drift, and the
   plumes are all in the same model metres, so nothing inside the vehicle
   moves relative to anything else when this changes. */
// Monotone and C-two by construction, which a knot table is not: fitted
// through makeCurve, the flat run before staging followed by a rise made
// the cubic dip to 0.99 first, so the vehicle shrank a little before it
// grew. smootherstep has only two ends, so it cannot do that.
const growth = (p) => 1 + 1.4 * smootherstep(0.375, 0.70, p);

/* And in front of that, the emergence.

   The vehicle used to arrive by fading up on opacity between p = 0.086 and
   0.125 -- full symbolic size the whole way, just progressively less
   transparent. That is a dissolve, and a dissolve is what it looked like: a
   rocket materialising in mid-air over the ocean with no sense of having
   come from anywhere.

   Growing it instead is both the better shot and the more honest one. At
   the opening framing one pixel covers 2.89 km of ground, so a real Saturn
   V -- 110.6 m tip to tail -- is under four hundredths of a pixel. It is
   not merely hard to see from three thousand kilometres up; it is four
   hundred times smaller than the smallest thing the frame is able to
   represent. Starting it below the resolution of the picture and letting it
   grow into the picture is the truthful version of "it was there all along".

   The floor is 0.004 and not zero. Zero would draw the stack at exactly no
   height, and `clearance` -- altitude measured in drawn vehicle lengths,
   which plume.js divides by -- would go to infinity at the one moment the
   plume is being lit. 0.004 draws it 1.9 km tall, which is 0.66 px at the
   opening framing and a third of a CSS pixel on a retina panel: still
   comfortably invisible, and a number that can be divided by.

   It finishes at p = 0.27, well before first staging at 0.593, so the whole
   S-IC burn and every separation after it happen at full symbolic size. The
   growth is front-loaded into the stretch where the ignition flash is
   fading and nothing else in the frame is competing for the eye.

   Multiplying the two ramps rather than blending them keeps the product
   monotone -- both factors are positive and non-decreasing, so it cannot
   dip -- which is what tools/apollo-mission-check asserts of the drawn
   height. */
const EMERGE_FLOOR = 0.004;
const emerge = (p) =>
  EMERGE_FLOOR + (1 - EMERGE_FLOOR) * smootherstep(at("enginesStart"), 0.27, p);

const stackScale = (p) => emerge(p) * growth(p);

/* And then, past the end of the page the two ramps above were drawn for,
   the mission gets smaller.

   The 4,340x exaggeration those ramps build to is a decision about the
   Earth: a real Saturn V against a 6,371 km planet is a hundredth of a
   pixel, and the first act is about a rocket. The lunar act is about a
   different body and a different distance, and carrying the same number
   into it would draw a spacecraft two-thirds the radius of the Moon it is
   arriving at -- which is not a bold composition, it is a scale error big
   enough to be the only thing anyone sees.

   So the exaggeration falls, from 4,340x to about 90x, and the fall is
   itself the point: the mission is drawn smaller exactly as the distances
   get bigger, which is the one thing about going to the Moon that a
   picture can say and a number cannot.

   It happens between p = 1.0 and 1.045 -- after the last of the mission's
   own page and before the lunar interlude's first caption at 1.063 -- for
   a plain reason: the spacecraft is off frame for the whole of that
   stretch. The Earth-anchored cameras of the coast are looking at a
   planet, and by then the spacecraft is a third of the way to the Moon on
   a bearing they were never pointed at. Nothing is on screen to shrink, so
   nothing is seen shrinking.

   In logs, because a change of scale should be even in ratio, and starting
   at exactly 1.0 so that every sample the check suite takes across the
   ascent's own domain is untouched -- the drawn stack still only grows
   there, and that assertion still holds unmodified. */
export const LUNAR_STACK_KM = 10;
const LUNAR_SHRINK_FROM = 1.0;
const LUNAR_SHRINK_TO = 1.045;

const lunarShrink = (p) => {
  const s = smootherstep(LUNAR_SHRINK_FROM, LUNAR_SHRINK_TO, p);
  if (s <= 0) return 1;
  const full = STACK_HEIGHT_KM * growth(1);
  return Math.exp(Math.log(LUNAR_STACK_KM / full) * s);
};

export let ALTITUDE_GAIN = 16;
export let DOWNRANGE_GAIN = 1;

/* Both are `let` so they can be swept from the console against real
   renders, which is how their values were arrived at in the first place --
   an exaggeration is a composition decision and composition decisions are
   settled by looking, not by reasoning about them. The shipped numbers are
   the ones above; setGains exists to find them again if the shot list or
   the launch site's screen target ever move, and tools/apollo-mission-check
   asserts the shipped pair still keeps the vehicle in frame. */
export function setGains({ altitude, downrange } = {}) {
  if (typeof altitude === "number") ALTITUDE_GAIN = altitude;
  if (typeof downrange === "number") DOWNRANGE_GAIN = downrange;
  return { ALTITUDE_GAIN, DOWNRANGE_GAIN };
}

/* =========================================================================
   THE PROFILE
   =========================================================================

   Altitude and downrange against ground elapsed time. The last row is the
   published one: parking orbit insertion at 000:11:45 into a 103.0 by 103.0
   nautical mile orbit, which is 190.8 km, circular. Everything before it is
   a shape drawn to arrive there plausibly — a vertical rise, a gravity turn
   beginning around twelve seconds, and a long flattening. Those intermediate
   numbers are an interpolation and are not offered as figures; nothing on
   the references page quotes them. */

const altitudeRealKm = makeCurve([
  [-600, 0],
  [0, 0],
  [12, 0.5],
  [83, 13],
  [137, 45],
  [164, 67],
  [197, 98],
  [300, 145],
  [462, 175],
  [555, 185],
  [705, 190.8],
  [9952, 190.8],
  [10299, 700],
  [40000, 40000],
  [250299, 260000],
]);

const downrangeRealKm = makeCurve([
  [-600, 0],
  [0, 0],
  [12, 0],
  [83, 4],
  [137, 40],
  [164, 93],
  [197, 180],
  [300, 500],
  [462, 1050],
  [555, 1470],
  [705, 2600],
  [9952, 6000],
  [10299, 6900],
  [40000, 9000],
  [250299, 10500],
]);

// Angle of the vehicle's long axis away from local vertical. Zero is
// standing on the pad; ninety degrees is lying along the horizon, which is
// where a launch vehicle ends up because orbit is a sideways problem.
const pitchDeg = makeCurve([
  [-600, 0],
  [0, 0],
  [12, 1],
  [83, 35],
  [137, 55],
  [164, 62],
  [300, 75],
  [462, 83],
  [555, 88],
  [705, 90],
  [9952, 90],
  [10299, 90],
  [250299, 90],
]);

/* =========================================================================
   THROTTLES
   =========================================================================

   Section 9 of the brief is about one bug and one bug only: the exhaust
   getting abruptly cut off. So there is no boolean anywhere in this file
   that an engine could be on or off side of. There is a number per stage,
   it moves continuously, and everything the plume does is read off it.

   Piecewise-linear rather than Hermite. A smooth curve through these points
   would overshoot on the way into a hold, and an overshoot here is either
   negative thrust or more than full thrust — both of which the plume would
   faithfully draw.

   The two visible steps down inside a burn are the reason the plume
   narrows before it goes out. The first is published: the S-IC drops its
   centre F-1 at 000:02:17 and runs on four for the last twenty-seven
   seconds, against staging at 000:02:44. The S-II does the same thing —
   both stages shut their centre engine early to hold the acceleration down
   — but the time for it is not one this file could confirm, so it is
   placed rather than cited. Four fifths of five engines is 0.8, which is
   where both holds sit. */

// Every keyframe from here on is written as an offset from the EVENTS row it
// tracks (the offset is what is quoted above the table, in the note ahead of
// EVENTS), so retiming an event and retiming its throttle stay the same
// edit. The offsets themselves are unchanged from before the interlude moved
// -- only where they are anchored has moved.
export const throttle = {
  sic: makeRamp([
    [0, 0],
    [0.075, 0],      // engine start command, T-6.9 s
    [0.088, 0.4],    // thrust building against the hold-downs
    [0.108, 0.96],
    [0.115, 1],      // release
    [0.558, 1],
    [0.560, 0.8],    // centre engine out
    [0.576, 0.8],
    [0.578, 0.22],   // outboard cutoff, tail-off
    [0.5922, 0],
    [1, 0],
  ]),
  sii: makeRamp([
    [0, 0],
    [0.5945, 0],
    [0.596, 0.45],   // start transient
    [0.603, 1],
    [0.663, 1],
    [0.665, 0.8],    // centre engine out
    [0.676, 0.8],
    [0.678, 0.18],
    [0.6808, 0],
    [1, 0],
  ]),
  sivb: makeRamp([
    [0, 0],
    [0.6835, 0],
    [0.685, 0.5],
    [0.691, 1],
    [0.692, 1],
    [0.694, 0.2],
    [0.6962, 0],     // parking orbit
    [0.7035, 0],
    [0.706, 0.5],    // restart for translunar injection
    [0.712, 1],
    [0.727, 1],
    [0.730, 0.2],
    [0.7322, 0],
    [1, 0],
  ]),
};

// The small motors that make a separation read as a separation rather than
// as a cut. Retros push the spent stage back; ullage motors settle the
// propellant in the stage about to light. They fire for a second or two,
// which is a couple of thousandths of the page.
// Anchored the same way throttle is above: each pair of knots is the same
// offset from its separation event that it always was, just carried to
// where that event now sits.
export const auxiliary = {
  sicRetro: makeRamp([[0, 0], [0.5925, 0], [0.5935, 1], [0.5965, 1], [0.5985, 0], [1, 0]]),
  siiUllage: makeRamp([[0, 0], [0.5932, 0], [0.5942, 1], [0.5968, 1], [0.5980, 0], [1, 0]]),
  siiRetro: makeRamp([[0, 0], [0.6815, 0], [0.6825, 1], [0.6855, 1], [0.6875, 0], [1, 0]]),
  sivbUllage: makeRamp([
    [0, 0],
    [0.6822, 0], [0.6832, 1], [0.6858, 1], [0.6870, 0],
    [0.7025, 0], [0.7035, 1], [0.7055, 1], [0.7070, 0],
    [1, 0],
  ]),
};

/* =========================================================================
   WHAT IS STILL ATTACHED
   =========================================================================

   Each discarded body gets three numbers: whether it is still on the stack,
   how far it has fallen behind if it is not, and how visible it still is.
   All three are functions of p, so scrolling back re-attaches it.

   `drift` is in vehicle lengths behind the stack, along the flight path,
   and it is deliberately not a physical integration. A spent S-IC really
   does fall away under drag and a retro impulse, and the honest way to draw
   that would be to integrate an acceleration — which is exactly the thing
   that cannot be done here, because the parameter is a scroll position and
   it runs backwards. A curve in (p - p_sep) gives the same picture and
   reverses exactly. */

function departure({ sepP, span, reach, spin, fade }) {
  return (p) => {
    const q = p - sepP;
    if (q <= 0) return { attached: true, drift: 0, spinRad: 0, opacity: 1 };
    const t = clamp(q / span, 0, 1);
    return {
      attached: false,
      // Accelerating away rather than linear: separation begins gently,
      // because for the first moment the two bodies are still nearly
      // touching and that is what makes it read as coming apart rather
      // than as one thing being swapped for another.
      drift: reach * t * t,
      spinRad: spin * t * t * (3 - 2 * t),
      opacity: 1 - smootherstep(fade[0], fade[1], q),
    };
  };
}

// `reach` is in vehicle lengths, and the numbers are deliberately small.
// A real spent S-IC ends up tens of kilometres behind, which is hundreds
// of its own lengths. Drawn at the scale below it would be flung a
// noticeable fraction of the way to the Moon and off the side of the
// frame before anyone had seen it come apart, and the coming apart is
// the whole point. Two or three lengths of clear daylight reads as a
// separation, and the fade has taken it by then anyway.
export const separations = {
  // The S-IC falls back a long way and tumbles slowly — it is 42 m of empty
  // tank and it has just been pushed backwards by eight retro-rockets.
  sic: departure({ sepP: at("staging1"), span: 0.10, reach: 3.2, spin: 1.9, fade: [0.035, 0.105] }),

  // The aft interstage is a bare ring and it drops straight back through
  // the S-II's plume, which is one of the best-known pieces of film NASA
  // ever shot.
  interstage: departure({ sepP: at("interstageOff"), span: 0.06, reach: 2.2, spin: 0.8, fade: [0.02, 0.06] }),

  // The tower does not fall back. Its jettison motor fires and pulls it up
  // and off to one side, ahead of the stack, which is why `reach` is
  // negative here.
  tower: departure({ sepP: at("towerOff"), span: 0.05, reach: -1.8, spin: 3.1, fade: [0.012, 0.045] }),

  sii: departure({ sepP: at("staging2"), span: 0.10, reach: 2.8, spin: 1.4, fade: [0.035, 0.105] }),

  // The S-IVB does not tumble. It stayed under control to the end -- it
  // made an evasive burn twenty-three minutes after letting the spacecraft
  // go, and went on past the Moon into solar orbit -- so it backs off
  // squarely, and the small spin is drift rather than tumble.
  sivb: departure({ sepP: at("lmExtraction"), span: 0.08, reach: 2.2, spin: 0.4, fade: [0.02, 0.07] }),

  // Columbia stays in orbit and Eagle goes down, but the camera stays with
  // Eagle, so on screen it is Columbia that leaves. Undocking only opens a
  // gap: the two flew in formation for the gear inspection, and what took
  // Columbia away was its separation burn at 100:39:52.9. It has to be out
  // of shot before descent orbit insertion, because the stack it hangs off
  // follows Eagle down. It leaves gently: this is a crewed spacecraft
  // station-keeping, not a spent stage being pushed off, and its reach is a
  // fraction of what the stages get.
  csm: (() => {
    const burn = departure({ sepP: at("separation"), span: 0.012, reach: 0.55, spin: 0.12, fade: [0.004, 0.011] });
    const UNDOCK_GAP = 0.04;
    return (p) => {
      const s = burn(p);
      const gap = UNDOCK_GAP * smootherstep(at("undock"), pAtSeconds(LANDER_TIMES.inspection[0]), p);
      return { ...s, attached: p <= at("undock"), drift: s.drift + gap };
    };
  })(),
};

/* HOW FAR UPRIGHT

   0 is the lander's thrust axis lying along the direction of travel, the
   way it flew the braking phase; 1 is standing on its legs.

   The shape is read off the pitch trace in Figure 5-5 of the Mission
   Report: a smooth fall through the braking phase to about 55 degrees just
   before P64, a quick drop to about 45 as that program pitched the vehicle
   over, near 20 at P66 and near vertical at touchdown. Those are readings
   off a plotted curve rather than tabulated numbers, so they are used as
   the shape of the move and nothing more. The trace is a gimbal angle and
   starts past ninety at ignition; the drawing starts at horizontal. The
   ten seconds given to the pitch-over are this file's, not the report's. */
const uprightAt = makeRamp([
  [EVENT.poweredDescent.get, 0],
  [LANDER_TIMES.p64, 35 / 90],
  [LANDER_TIMES.p64 + 10, 45 / 90],
  [LANDER_TIMES.p66, 70 / 90],
  [EVENT.touchdown.get, 1],
]);
export const landerUpright = (p) => uprightAt(getSecondsAt(p));

/* THE LANDER, WHICH SEPARATES FROM NOTHING -- IT IS WHAT IS LEFT

   opacity brings it on across the transposition window; before that it is
   folded inside the adapter and should not be drawn. The rest is attitude,
   four numbers from 0 to 1 that vehicle.js composes into one rotation.

   inspect is the full turn Eagle made so Collins could look the landing
   gear over from Columbia: "YAW 360, LM INSPECTION" in the Flight Plan
   (final edition, p. 3-67), and the 360-degree yaw during which the Command
   Module Pilot's inspection "confirmed proper landing gear extension" in
   the Mission Report (section 4.9). The yaw left and pitch up the Flight
   Plan lists before it are not drawn. Timing: LANDER_TIMES.

   roll hands the lander from riding docked -- inverted, hatch back towards
   Columbia -- to the attitude it made its burns in: descent engine pointing
   along the direction of travel and windows facing the Moon. That is how
   the Mission Report describes powered descent beginning ("face-down",
   section 5.3) and how the Lunar Surface Journal glosses it ("engine forward
   and windows down"). When between separation and descent orbit insertion
   it got there is not from any source; it is simply done by the burn.

   faceUp is the yaw to windows-up four minutes into the descent, so the
   landing radar could see the ground. It was a yaw to the right, about the
   thrust axis.

   upright is landerUpright, above.

   The model's origin is at its own mid-height so that none of this moves
   the lander, only turns it. */
export const lander = (p) => {
  const t = getSecondsAt(p);
  return {
    attached: true,
    drift: 0,
    spinRad: 0,
    opacity: smootherstep(at("transposition"), at("lmExtraction"), p),
    inspect: smootherstep(LANDER_TIMES.inspection[0], LANDER_TIMES.inspection[1], t),
    roll: smootherstep(at("separation"), at("descentOrbit"), p),
    faceUp: smootherstep(LANDER_TIMES.faceUp[0], LANDER_TIMES.faceUp[1], t),
    upright: landerUpright(p),
  };
};

/* =========================================================================
   THE ANSWER
   ========================================================================= */

const DEG = Math.PI / 180;

/**
 * Everything the renderer needs to place the vehicle, for one value of p.
 *
 * Distances are kilometres in world units. `altitudeKm` and `downrangeKm`
 * are already gained; `realAltitudeKm` is the un-gained figure, kept so the
 * checks can assert the profile still passes through the published parking
 * orbit and so nothing has to reconstruct it by dividing.
 */
export function flightAt(p) {
  /* Two domains, deliberately.

     x is the ascent's, and it stops at 1 because every curve keyed on it --
     throttle, the separations, the pitch programme, the emergence -- was
     authored against a page that ended there, and holding their last value
     past it is exactly right: nothing about the S-IC is still happening on
     the way to the Moon.

     q is the mission's, and it runs to touchdown. Four things read it: the
     clock, which must keep running or the lunar captions would sit under a
     frozen number; the drawn size, which has to come down before the Moon
     is in shot; and the command module and the lander, whose separation and
     turn both happen in lunar orbit, past the end of x. Everything else
     stays on x. */
  const x = clamp(p, 0, 1);
  const q = clamp(p, 0, LAST_U);
  const t = getSecondsAt(q);

  const stackHeightKm = STACK_HEIGHT_KM * stackScale(x) * lunarShrink(q);
  const realAltitudeKm = Math.max(0, altitudeRealKm(t));
  const realDownrangeKm = Math.max(0, downrangeRealKm(t));

  const sic = separations.sic(x);
  const sii = separations.sii(x);
  const interstage = separations.interstage(x);
  const tower = separations.tower(x);
  const sivb = separations.sivb(x);
  const csm = separations.csm(q);
  const lm = lander(q);

  return {
    p: x,
    getSeconds: t,

    realAltitudeKm,
    realDownrangeKm,
    altitudeKm: realAltitudeKm * ALTITUDE_GAIN,
    downrangeKm: realDownrangeKm * DOWNRANGE_GAIN,
    pitchRad: pitchDeg(t) * DEG,

    throttle: {
      sic: throttle.sic(x),
      sii: throttle.sii(x),
      sivb: throttle.sivb(x),
    },
    auxiliary: {
      sicRetro: auxiliary.sicRetro(x),
      siiUllage: auxiliary.siiUllage(x),
      siiRetro: auxiliary.siiRetro(x),
      sivbUllage: auxiliary.sivbUllage(x),
    },

    // The drawn size of the vehicle at this point on the page, and the
    // scale factor that turns model metres into kilometres of scene.
    stackHeightKm,
    kmPerVehicleMetre: stackHeightKm / STACK_HEIGHT_M,

    // How far the base of the vehicle is above the ground, measured in its
    // own drawn lengths. The plume needs this: at the pad the exhaust has
    // nowhere to go but sideways, and a cone pointing straight down would
    // be buried in the planet.
    clearance: (realAltitudeKm * ALTITUDE_GAIN) / stackHeightKm,

    parts: { sic, sii, interstage, tower, sivb, csm, lm },

    // How much of the vehicle is still on the stack, measured from the
    // bottom of whatever is currently lowest. Used to keep the stack's
    // reference point on its own base rather than on the base of a first
    // stage that left two phases ago.
    stackBaseIndex: sii.attached ? 0 : sic.attached ? 0 : interstage.attached ? 1 : 2,

    // Opacity, which is a far smaller job than it used to be. The arrival
    // is done by stackScale's emerge ramp -- the argument is up there --
    // so all this has to do is take the material from nothing to solid
    // across a stretch where the vehicle is still much too small for
    // anyone to catch it happening. It is finished by engine start, so
    // from the first frame the flash is lit the vehicle is fully opaque
    // and every change after that is geometry.
    //
    // It then stays at 1 for the rest of the page rather than tailing off.
    // Past translunar injection the stack is well under a pixel and a
    // point of light is the only honest way to say where the mission is.
    presence: smootherstep(0.03, at("enginesStart"), x),
  };
}

/* =========================================================================
   THE LAUNCH FRAME
   =========================================================================

   Where a vehicle at (altitude, downrange, pitch) actually is, given a pad
   and a launch azimuth. Plain arrays in, plain arrays out, so this is
   testable without three.js in the room — same rule shotToCamera follows.

   Downrange is an angle, not a tangent. Two thousand six hundred kilometres
   is twenty-three degrees of arc, and drawing it along the local horizontal
   would put the vehicle five hundred kilometres above where it should be by
   the time it reached orbit. Rotating the pad's own up-vector about the
   cross-track axis costs one Rodrigues and is exact. */

function rotateAbout(v, axis, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const d = axis[0] * v[0] + axis[1] * v[1] + axis[2] * v[2];
  return [
    v[0] * c + (axis[1] * v[2] - axis[2] * v[1]) * s + axis[0] * d * (1 - c),
    v[1] * c + (axis[2] * v[0] - axis[0] * v[2]) * s + axis[1] * d * (1 - c),
    v[2] * c + (axis[0] * v[1] - axis[1] * v[0]) * s + axis[2] * d * (1 - c),
  ];
}

const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/**
 * @param {number[]} padUp     outward surface normal at the pad, unit
 * @param {number[]} padHeading  horizontal launch azimuth at the pad, unit
 * @param {object} f           the result of flightAt
 * @param {number} radiusKm
 * @returns {{position:number[], up:number[], forward:number[], axis:number[]}}
 *   position: world position of the vehicle's reference point
 *   up:       local vertical there
 *   forward:  local downrange direction there
 *   axis:     the vehicle's own long axis, after pitch
 */
/* The local horizontal frame at a point on the surface, in the same
   Earth-fixed coordinates latLonToUnitVector uses: +X at longitude zero,
   +Z at ninety west, +Y through the north pole. These are the partial
   derivatives of that mapping, normalised, which is the whole derivation.

   Degenerate at the poles, where "north" has no direction. The caller
   picks the site and is required not to pick one there; PAD_LAT_LIMIT in
   scene.js is what keeps that promise. */
export function surfaceBasis(latDeg, lonDeg) {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const sla = Math.sin(lat);
  const cla = Math.cos(lat);
  const slo = Math.sin(lon);
  const clo = Math.cos(lon);
  return {
    up: [cla * clo, sla, -cla * slo],
    north: [-sla * clo, cla, sla * slo],
    east: [-slo, 0, -clo],
  };
}

/* A launch heading, as an azimuth clockwise from north.

   Apollo 11 flew out over the Atlantic on an easterly heading, which is
   what every launch from Florida does and what every launch from anywhere
   does that wants the planet's rotation for free. The exact number below
   is not cited and is not presented as Apollo 11's: this vehicle leaves
   from a site chosen for the framing rather than from Merritt Island, so
   an azimuth quoted to three decimals against it would be precision about
   nothing. East-north-east is the right family of answer and it arcs the
   ascent across the frame instead of into it. */
export const LAUNCH_AZIMUTH_DEG = 330;

export function headingAt(latDeg, lonDeg, azimuthDeg = LAUNCH_AZIMUTH_DEG) {
  const { north, east } = surfaceBasis(latDeg, lonDeg);
  const a = azimuthDeg * DEG;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return norm([
    north[0] * c + east[0] * s,
    north[1] * c + east[1] * s,
    north[2] * c + east[2] * s,
  ]);
}

export function vehicleFrame(padUp, padHeading, f, radiusKm) {
  const crossTrack = norm([
    padUp[1] * padHeading[2] - padUp[2] * padHeading[1],
    padUp[2] * padHeading[0] - padUp[0] * padHeading[2],
    padUp[0] * padHeading[1] - padUp[1] * padHeading[0],
  ]);

  const arc = f.downrangeKm / radiusKm;
  const up = norm(rotateAbout(padUp, crossTrack, arc));
  const forward = norm(rotateAbout(padHeading, crossTrack, arc));

  const r = radiusKm + f.altitudeKm;
  const position = [up[0] * r, up[1] * r, up[2] * r];

  const cp = Math.cos(f.pitchRad);
  const sp = Math.sin(f.pitchRad);
  const axis = norm([
    up[0] * cp + forward[0] * sp,
    up[1] * cp + forward[1] * sp,
    up[2] * cp + forward[2] * sp,
  ]);

  return { position, up, forward, crossTrack, axis };
}
