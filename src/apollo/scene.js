// The Apollo layer: one persistent scene living behind the whole homepage.
//
// The rule this file exists to enforce is that the page is in charge. It
// reads window.scrollY and never writes it, installs no wheel or touch
// handlers, pins nothing, and sits under a container with pointer-events
// off. A visitor who never notices the planet is behind the text can read,
// click and leave without the scene having affected them once.
//
// Mission progress is therefore a *reading* of the document, not a
// timeline the page is dragged along. Scroll down and it advances; scroll
// back and it reverses; jump with a scrollbar and it eases to wherever you
// landed; stop and it settles and stays there.

import * as THREE from "three";

import { EARTH_RADIUS_KM, createEarth } from "./earth.js";
import { createLaunchSite } from "./launchsite.js";
import { createMoon } from "./moon.js";
import { createPlume } from "./plume.js";
import { createStarfield } from "./starfield.js";
import { createVehicle, disposeSaturnV, loadSaturnV } from "./vehicle.js";
import { tourWeightAt } from "./tour.js";
import { journeyCameraWorld, journeyWeightAt } from "./journey.js";
import { lunarMissionP, lunarWeightAt } from "./lunar.js";
import { shotAt, shotToCamera } from "./shots.js";
import { LOI_P, TLI_P, TRANSFER, coastFrame, lunarFrame } from "./translunar.js";
import {
  LAUNCH_AZIMUTH_DEG,
  at,
  flightAt,
  getSecondsAt,
  headingAt,
  pAtSeconds,
  setGains,
  surfaceBasis,
  vehicleFrame,
} from "./flight.js";
import {
  LAUNCH_EPOCH_MS,
  LC39A,
  LUNAR_NORTH,
  MOON_RADIUS_KM,
  clamp,
  latLonToUnitVector,
  moonAt,
  phaseAt,
  smootherstep,
  subSolarPoint,
} from "./mission.js";

const TEXTURE_BASE = "/assets/textures/";

// A full turn in eight hundred seconds, a hundred and eight times the real
// sidereal rate. The real rate is not an option: at 0.0042
// degrees a second nothing on this page moves within any visit anyone will
// ever make, and the planet reads as a photograph. This is fast enough that
// a coastline visibly travels across the frame over a minute or two of
// reading, and slow enough that no single glance catches it moving, which
// is the same trick a clock's minute hand plays.
const EARTH_SPIN_DEG_PER_SEC = 0.45;

// Clouds move with the atmosphere, which does not quite keep up with the
// ground beneath it. The difference is what makes the cloud layer read as
// weather rather than as paint, and it is scaled by the same factor as the
// spin above so the ratio between the two stays honest: a 30 m/s jet is
// about 7.5e-7 of a lap per second relative to the ground, and a hundred
// and ten times that is the number here. Over a couple of minutes of
// reading it comes to a few degrees of slip, which is present without ever
// being the thing you notice first.
const CLOUD_DRIFT_PER_SEC = 0.00008;

const MAX_DT = 1 / 20;

// The launch clock's own delta cap, well above MAX_DT. MAX_DT exists to keep
// the progress easing from lurching on a dropped frame, and it is far too
// tight for a clock that has to read real seconds: capping its own delta at
// a twentieth of a second would make it fall behind on any machine that
// cannot hold 20 fps. 0.25 s is loose enough that an ordinary hitch never
// touches it and tight enough that nothing short of the tab being
// backgrounded -- which stop()/start() already handles by halting the loop
// outright, see onVisibility() -- could smuggle a multi-second jump through it.
const CLOCK_MAX_DT = 0.25;

const MODEL_URL = "/assets/models/saturnv.bin";

/* The same vehicle, built from the same NASA source, decimated much less.
   The flight model's triangle budget was set for a rocket that is never
   more than about a hundred and eighty pixels tall, and the Saturn V
   interlude now puts that same low-poly model across the whole window at
   roughly thirty pixels per metre -- at that size the S-IC's forward skirt
   is not a smooth cylinder with a black roll pattern on it, it is a bundle
   of pale needles lying along the skin, decimated triangles metres long
   and centimetres wide, shaded by interpolated normals that mean nothing.
   144,851 triangles instead of 29,505, for 2.4 MB, is the fix for that, and
   it used to be wired up: the interlude drew a second copy of the vehicle
   at this resolution, in its own scene, behind its own camera. That scene
   is gone -- the interlude is now a camera move on the one rocket that is
   actually flying. High-quality devices now upgrade matching bodies on
   that same vehicle after the base model loads. The old detail asset has
   one combined upper stage, so its unmatched "upper" is skipped: the
   current S-IVB and CSM keep their independent staging. */
const DETAIL_URL = "/assets/models/saturnv-detail.bin";

// NASA's Lunar Module, packed by tools/build-lm.py. Loaded with the rocket
// rather than on arrival at the Moon: it is a quarter of a megabyte, and a
// lander that pops in mid-scroll is worse than one that was always there.
const LANDER_URL = "/assets/models/lm.bin";

/* ---------- Choosing a launch site ----------

   The brief no longer asks for Florida, and taking it up on that fixes a
   real problem rather than saving work. The planet turns at 0.45 deg/s,
   which is fast enough that a fixed pad is on the far side within a few
   minutes of reading; a reader who arrived at the top of the page after
   that would scroll and watch a rocket launch from somewhere behind the
   Earth. So the pad is placed wherever the opening framing is actually
   looking, re-picked on every prelaunch frame, and then frozen at engine
   start and left to rotate with the ground for the rest of the mission.

   The freeze is the important half. From engine start onwards the site is
   a fixed point on a rotating planet, exactly as it was when it was
   Kennedy, and the ascent is drawn in the rotating frame throughout. What
   is not fixed is which point, and /references/ says so plainly: this is
   not Merritt Island and the page does not claim it is. */

// Where on screen the pad is aimed for, in normalised device coordinates
// with the lens shift already applied. Right of centre and below it, on the
// part of the limb the opening shot frames, with sky above it for the
// vehicle to climb into.
const PAD_TARGET_NDC = [0.34, -0.34];

// Nowhere near a pole. surfaceBasis has no "north" to give at one, and a
// launch azimuth measured from an undefined north is an undefined heading.
const PAD_LAT_LIMIT = 58;

// How far into daylight the site has to be. A rocket launching out of the
// unlit half would be a silhouette against black with no way to read it.
const PAD_MIN_SUN = 0.22;

const IGNITION_P = at("enginesStart");

// Ground elapsed time the launch clock counts itself up to before it lets
// go of the page -- tower clear, not liftoff, because the commentary keeps
// talking for a few seconds past zero ("All engines running. Liftoff!") and
// a clock that stopped counting the instant it crossed T-0 would cut that
// off under a visitor who never touched the scrollbar.
const CLOCK_STOP_P = at("towerClear");
const CLOCK_STOP_GET = getSecondsAt(CLOCK_STOP_P);

export const prefersReducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Texture loading ---------- */

function loadTexture(loader, file, { colorSpace, anisotropy }) {
  return new Promise((resolve, reject) => {
    loader.load(
      TEXTURE_BASE + file,
      (texture) => {
        texture.colorSpace = colorSpace;
        texture.anisotropy = anisotropy;
        // The maps are equirectangular, so they wrap in longitude and must
        // not in latitude. Left on the default the cloud layer's drift
        // would tear a seam down the middle of the Pacific.
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        resolve(texture);
      },
      undefined,
      reject
    );
  });
}

/* ---------- The scene ---------- */

export function createApolloScene(canvas, options = {}) {
  const quality = options.quality || "high";
  const container = options.container || canvas.parentElement;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: quality === "high",
    // Opaque. An alpha canvas would let the CSS fallback sky underneath
    // show through everywhere the scene is empty space, so the painted-on
    // limb glow would sit behind the real one and the two would add. The
    // canvas fades in over that gradient instead, which turns the fallback
    // into the first frame of the transition rather than a competitor.
    alpha: false,
    powerPreference: "high-performance",
    // The scene spans from a rocket on a launch pad to the Moon. Even before
    // the vehicle arrives, the Earth's surface and its atmosphere shell are
    // close enough together, and far enough from the camera, to z-fight
    // without this.
    logarithmicDepthBuffer: true,
  });
  renderer.setClearColor(0x000000, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Tone mapping is done in the shaders, which is where the exposure
  // decisions already are; leaving three's own on would apply a second one.
  renderer.toneMapping = THREE.NoToneMapping;

  const maxPixelRatio = quality === "high" ? 2 : 1.5;

  const scene = new THREE.Scene();
  /* A hundred kilometres of near plane and four million of far, which is
     the range the first act needs: a rocket a few hundred kilometres off
     and a Moon most of the way to four hundred thousand. It is a wild
     ratio and it works because logarithmicDepthBuffer is on above.

     NEAR_KM is only the ceiling. The lunar act puts the camera thirteen
     kilometres from the spacecraft, well inside a hundred, and a hundred
     would clip the whole thing out of existence -- which it did, silently,
     until a probe read the vehicle's clip-space depth back as -15 and made
     it obvious. updateNearPlane() below brings the plane in when the
     subject is close and leaves it exactly here when it is not, so nothing
     about the first act's depth changes. */
  const NEAR_KM = 100;
  const camera = new THREE.PerspectiveCamera(40, 1, NEAR_KM, 4_000_000);

  const starfield = createStarfield({ count: quality === "high" ? 2400 : 1100 });
  scene.add(starfield.points);

  // The Earth sits at the origin and spins about +Y. Its axial tilt is
  // already accounted for: the Sun's declination comes out of the solar
  // model rather than out of a rotation applied to the planet, so tilting
  // the mesh as well would count it twice.
  const earthGroup = new THREE.Group();
  scene.add(earthGroup);

  // A child of earthGroup, not of the scene. The pad is a place on the
  // ground, so it turns with the ground — and since the ground now visibly
  // turns, that distinction is the difference between a light that sits on
  // Florida and a light that hovers over the Atlantic while Florida leaves.
  // Everything else that belongs to the surface, the vehicle included, will
  // be attached the same way.
  const launchSite = createLaunchSite(LC39A);
  earthGroup.add(launchSite.object3D);

  // The vehicle is a child of earthGroup for the whole mission, from the pad
  // to translunar injection, and that is a rule rather than a convenience.
  // Handing it over to an inertial frame partway would mean multiplying
  // state.spinRad -- which grows without bound for as long as the tab is
  // open -- by a factor that changes with scroll, and an unbounded angle
  // times a varying factor is an unbounded swing. That is precisely the
  // failure that took out the ground lock; the long note is in shots.js.
  const vehicleGroup = new THREE.Group();
  earthGroup.add(vehicleGroup);

  let vehicle = null;
  let plume = null;
  const landerWorld = new THREE.Vector3();

  /* An interlude is a tall section the scene is choreographed against
     rather than merely scrolled past: the Saturn V tour, and the lunar
     descent. There were two of these before there was a word for them, and
     the second one was very nearly a copy of the first -- measured the same
     way, captions lit the same way, camera blended the same way. It is one
     object used twice instead.

     from/to are where the section sits in the same progress units as
     everything else, and stay at -1 on a page that has no such section,
     which is every page of this site except the homepage. notes is each
     caption and the moment it belongs to, filled in by measureSections()
     from where the stylesheet actually put it. */
  const makeInterlude = (id) => ({ el: document.getElementById(id), from: -1, to: -1, notes: [], knots: null });
  const tour = makeInterlude("saturn-v");
  const lunar = makeInterlude("the-moon");
  const INTERLUDES = [tour, lunar];
  const main = document.querySelector("main");

  // The mission's own scroll span in pixels, and the largest u the page can
  // reach. Both measured, both cached per frame by measurePage().
  let missionSpanPx = 1;
  let missionEndU = 1;

  // How far down the window a caption sits at its own moment, as a fraction,
  // and the fade either side of it. Declared up here rather than beside the
  // code that reads them because measureSections() is reachable from a scroll
  // event before the rest of this function body has run.
  const LIT_AT = 0.62;
  const NOTE_FULL = 0.045;
  const NOTE_GONE = 0.1;

  /* Portrait framing. Every shot in the mission was composed for a wide
     window: the lens shift pushes the subject right and down to leave the
     top left clear for the words, and the Saturn V's and lander's own shifts
     do the same. In a 390 by 844 window that shift is more than the frame is
     tall, and the vehicle sat between 1.1 and 2.5 half-heights below the
     bottom edge for the whole of the mission, with the Earth and Moon a
     corner glow. Below an aspect of 1 the shift is traded for a lift
     instead: centred across, and PORTRAIT_LIFT of a half-height above the
     middle so the vehicle sits in the upper part of the screen. The weight
     ramps from 0 at aspect 1 to 1 at 0.7, so no desktop or 4:3 window
     changes at all. Before the tour the camera is the Earth's and not the
     vehicle's, so there the lens is moved each frame to put the vehicle
     itself at that spot; see liftVehicleInPortrait. */
  const PORTRAIT_LIFT = 0.42;
  const PHONE_LIGHT = 0.75;
  const portraitWeight = aspect => clamp((1 - aspect) / 0.3, 0, 1);

  // Phone captions flow down the page as a list, and are not placed at the
  // moment they belong to the way the desktop ones are. These are those
  // moments, copied from the comments beside .interlude-note--* in
  // museum.css, and measureInterlude() uses them to stretch the phone's
  // scroll position onto them so each caption still lands with its event.
  const NOTE_MOMENTS = {
    "saturn-v": [0.38, 0.49, 0.64, 0.75, 0.85],
    "the-moon": [0.10, 0.32, 0.54, 0.76, 0.94],
  };

  let earth = null;
  let moon = null;
  let disposed = false;
  let running = false;
  let raf = 0;
  let lastFrameTime = 0;
  let scrollRaf = 0;

  // Where the Sun was at the launch instant, and then it stays there.
  //
  // subSolarPoint returns a latitude and longitude, which is a position on
  // the rotating ground, and at load time the ground and the world frame
  // coincide. So this vector starts out as the true 13:32 GMT lighting
  // geometry for 16 July 1969 and remains a fixed direction in world space
  // afterwards. That is also the physically right answer: over the minutes
  // this page is open the Sun does not go anywhere, the planet turns. The
  // terminator therefore holds still in the frame while the surface rotates
  // through it, which is what every DSCOVR timelapse looks like.
  //
  // The previous version rotated this vector by the spin as well, and since
  // the mesh and the camera were being rotated by the same angle too, all
  // three cancelled and the image was completely static.
  const sunWorld = (() => {
    const s = subSolarPoint(LAUNCH_EPOCH_MS);
    const v = latLonToUnitVector(s.latDeg, s.lonDeg);
    return new THREE.Vector3(v.x, v.y, v.z);
  })();

  // Lunar north, read into the same frozen frame sunWorld is. Constant:
  // the Moon's axis does not move over three days and this page does not
  // model the 18.6-year precession that eventually does move it.
  const moonNorthWorld = (() => {
    const v = latLonToUnitVector(LUNAR_NORTH.latDeg, LUNAR_NORTH.lonDeg);
    return new THREE.Vector3(v.x, v.y, v.z);
  })();

  // Where the Moon is this frame. Recomputed rather than fixed, because
  // unlike the Sun the Moon genuinely does move over a mission: thirteen
  // degrees a day along its orbit, and fifteen thousand kilometres closer
  // between launch and landing.
  const moonWorld = new THREE.Vector3();
  const moonDirWorld = new THREE.Vector3();

  const cameraPos = new THREE.Vector3();
  const cameraTarget = new THREE.Vector3();
  const cameraUp = new THREE.Vector3();
  const nearProbe = new THREE.Vector3();

  // Scratch for the Saturn V interlude's camera blend, declared once for
  // the same reason cameraPos above is: blending sixty times a second must
  // not allocate sixty times a second. See applyVehicleCamera, further down.
  const tourOrigin = new THREE.Vector3();
  const tourAxis = new THREE.Vector3();
  const earthCentre = new THREE.Vector3();
  const tourPos = new THREE.Vector3();
  const tourTarget = new THREE.Vector3();
  const tourUp = new THREE.Vector3();
  // Where each camera is looking, as a point rather than a rotation. See
  // the long note in applyVehicleCamera for why the blend needs the point.
  const missionFwd = new THREE.Vector3();
  const missionUpV = new THREE.Vector3();
  const missionTarget = new THREE.Vector3();
  const blendedTarget = new THREE.Vector3();
  const blendedUp = new THREE.Vector3();
  // Orientation-only scratch: lookAt + roll, then read its quaternion back
  // out. This has to be a camera and not a plain Object3D -- three.js's
  // lookAt() special-cases isCamera/isLight and points local -Z at the
  // target only for those; a generic Object3D ends up facing 180 degrees
  // the other way (confirmed directly: THREE.Object3D().lookAt(t) and
  // THREE.PerspectiveCamera().lookAt(t) from the same position produce
  // opposite forward vectors). rollDeg is authored against the camera
  // convention -- shotToCamera's own rig.up already encodes the mission
  // camera's roll the same way -- so this has to match it.
  const tourOrient = new THREE.PerspectiveCamera();
  const missionPos = new THREE.Vector3();
  const missionQuat = new THREE.Quaternion();
  const missionDir = new THREE.Vector3();
  const tourDir = new THREE.Vector3();
  const blendedDir = new THREE.Vector3();

  const state = {
    target: 0,
    progress: 0,
    spinRad: 0,
    cloudDrift: 0,
    elapsed: 0,
    phase: phaseAt(0),
    width: 0,
    height: 0,
    pixelRatio: 1,
    padLatDeg: LC39A.latDeg,
    padLonDeg: LC39A.lonDeg,
    padFrozen: false,
    spinAtFreeze: 0,
    azimuthDeg: LAUNCH_AZIMUTH_DEG,
    // Where the ignition flare is on screen this frame, in CSS pixels, or
    // null for the great majority of the page where there is no flare. The
    // light itself is drawn in DOM above the page's readability scrim --
    // see flare.js for why it cannot be drawn in here -- so all the scene
    // does is project it and hand the numbers to whoever is listening.
    flare: null,
  };

  /* ---------- The launch clock ----------

     Progress used to come from exactly one place: the scroll position, read
     in documentProgress() and eased toward in tick() below. That is right
     for the great majority of the page, which is a museum a visitor walks
     through at their own pace, and wrong for the ninety seconds at the top
     of it -- a terminal count is a countdown precisely because it does not
     wait for anyone to scroll. Landing on the page and finding T-00:01:00
     sitting motionless until the first wheel notch is a clock that isn't
     counting, which is a contradiction the element cannot survive.

     So from the moment the animation loop starts, the scene keeps a second
     idea of where the mission is: launchClockGet, a ground elapsed time
     that advances on its own, one second per real second. It is folded
     into state.target as a floor -- the target each frame is the larger of
     the scroll's own progress and pAtSeconds(launchClockGet) -- so a
     visitor who never touches the scrollbar still watches guidance go
     internal, ignition, and liftoff happen in real time, and a visitor who
     scrolls ahead of it simply overtakes it, exactly as they always could.

     It is a ratchet, and it has to be one, because it is standing in for
     real time and real time does not run backwards. Scrolling ahead pulls
     launchClockGet forward to match -- the reader has told the page they
     already know what happens next -- but scrolling back down, while the
     clock is still running, leaves it exactly where it stopped; the
     comparison is a max(), never an assignment, so nothing here is able to
     move it the other way while there is still a countdown to protect.

     Reaching tower clear on its own retires the clock, not the floor by
     itself -- launchClockGet latches at CLOCK_STOP_GET and stays there, so
     a visitor who never touches the scrollbar goes on watching the count
     hold at T+00:00:12 rather than sliding back to the pad the instant it
     gets there. What hands the floor away is the next thing that looks
     like the reader's own hand on the page: the next scroll or resize
     event syncScroll() sees after the clock is already done sets
     launchClockReleased, and from that frame on tick() stops taking the
     max() at all -- state.target is once again just the scroll's own
     progress, which is the whole of the rest of the page, and it already
     worked. Without that distinction the floor would either never let go
     (scroll back to the top after the count finishes and it is still
     stuck at tower clear, which is the bug this replaced) or let go the
     moment the clock finished even though nobody had touched anything
     (the count reaching T+00:00:12 on its own and immediately sliding
     back to T-00:01:00 in front of a visitor who never scrolled at all,
     which is not a countdown finishing, it is a countdown that never
     happened). Held until asked to move is the one behaviour a clock that
     runs by itself can offer without contradicting either the reader who
     never touches the scrollbar or the one who scrolls straight through.

     Two things retire the mechanism outright instead of merely ratcheting
     it. document.hidden already halts the whole animation loop -- see
     onVisibility() -- so a backgrounded tab is not counting at all, and
     start() resets lastFrameTime on the way back in so the first frame
     home is not billed for the time away. And setProgress(), the debug
     hook, sets launchClockOverridden for good: a script asking for p = 0.5
     needs p = 0.5 on every frame after, not p = 0.5 or wherever a live
     clock has independently gotten to since, so the first call to it takes
     this whole file out of the loop permanently and progress goes back to
     being exactly what the scroll position and setProgress say it is. */

  // The reader's own scroll position, as page progress. documentProgress()
  // is read once per scroll/resize event in syncScroll(), for the same
  // reason measure() above is gated on sizeDirty -- not once per frame,
  // which tick() below runs sixty times as often and cannot afford to
  // spend on a forced layout. tick() is what folds this together with the
  // launch clock; syncScroll()'s job is only to keep it current.
  let scrollProgress = 0;

  let launchClockGet = -60;
  let launchClockDone = false;
  let launchClockOverridden = false;
  let launchClockReleased = false;

  function launchClockP() {
    return pAtSeconds(launchClockGet);
  }

  // Advances launchClockGet by dt real seconds, ratchets it forward to
  // match whatever the scroll position already implies, and latches
  // launchClockDone once it reaches tower clear. dt is the wall clock's
  // own delta, not the eased one tick() runs the rest of the frame on.
  function tickLaunchClock(dt) {
    if (launchClockOverridden || launchClockDone) return;

    launchClockGet += dt;

    const scrollGet = getSecondsAt(scrollProgress);
    if (scrollGet > launchClockGet) launchClockGet = scrollGet;

    if (launchClockGet >= CLOCK_STOP_GET) {
      launchClockGet = CLOCK_STOP_GET;
      launchClockDone = true;
    }
  }

  /* ---------- Sizing ---------- */

  // Measured when something changes, not on every frame.
  //
  // getBoundingClientRect forces a synchronous layout flush. Calling it from
  // inside the render loop means every single animation frame stops and
  // waits for layout, during scrolling, which is both when layout is most
  // expensive and when a dropped frame is most obvious. A ResizeObserver
  // already knows when the box changed, so there is nothing here for the
  // render loop to go and discover for itself.
  let sizeDirty = true;

  function measure() {
    if (!sizeDirty) return;
    sizeDirty = false;

    const rect = (container || canvas).getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || window.innerWidth));
    const height = Math.max(1, Math.round(rect.height || window.innerHeight));
    const pixelRatio = Math.min(window.devicePixelRatio || 1, maxPixelRatio);

    if (width === state.width && height === state.height && pixelRatio === state.pixelRatio) return;

    state.width = width;
    state.height = height;
    state.pixelRatio = pixelRatio;

    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
  }

  function invalidateSize() {
    sizeDirty = true;
  }

  /* ---------- Frame subscribers ----------

     The countdown is DOM, not WebGL, and it has to agree with the scene to
     the frame -- a clock reading T-3 while the pad is already lit would be
     worse than no clock at all. Rather than have it read window.scrollY a
     second time and re-derive progress with its own copy of the smoothing,
     it is handed the value this scene actually drew with. One source of
     truth, and it stays correct under setProgress() from the console as
     well as under a real scroll. */

  const frameListeners = new Set();

  function notifyFrame() {
    for (const fn of frameListeners) {
      try {
        fn(state.progress, state);
      } catch (error) {
        // A throwing listener must not take the render loop down with it.
        console.warn("Apollo frame listener failed:", error);
        frameListeners.delete(fn);
      }
    }
  }

  /* ---------- Scroll ---------- */

  // clientHeight, not innerHeight. They differ by the horizontal scrollbar
  // on desktop and by the collapsing address bar on mobile, and innerHeight
  // is the larger of the two, so it makes the scrollable range come out
  // short and the last stretch of the page arrives with progress already
  // clamped at 1 — the visualization freezes before the reader reaches the
  // bottom. clientHeight is the height of the box that actually scrolls,
  // which is the number this ratio is asking about.
  // The interlude's range, in progress units, measured rather than authored.
  //
  // The alternative is a pair of constants, and they would be wrong the
  // moment anything above the section changed height -- which is every time
  // a paragraph is edited, and also every time the viewport changes, since
  // the section is sized in vh. Reading it costs one layout on a scroll
  // frame that was already reading layout for documentProgress().
  /* How much scrolling the mission gets, and how much of it the reader can
     actually reach.

     Progress is a scroll position over a height, which means every tuned
     number in flight.js and shots.js -- every event, every camera knot,
     every throttle ramp -- is a pixel position wearing a disguise. Append
     anything to the page and the denominator grows, and all of them move at
     once: the launch, the staging, the whole Saturn V tour, silently, by the
     same few per cent. That is the kind of regression that surfaces as "the
     animation feels different now" and costs a day to trace back to an
     unrelated commit that added a paragraph.

     So anything added to the page after the mission was tuned carries
     [data-after-mission], and its height comes back out of the denominator
     here. u = 1 therefore still means the exact moment the page used to end,
     and every number written before those sections existed still means what
     it meant when it was measured.

     The lunar act is then authored past u = 1. Nothing has to be rescaled to
     allow that, because both interpolators in spline.js clamp outside their
     knot range rather than extrapolating -- so a curve that knows nothing
     about the Moon simply holds its final value instead of flying off. */
  function measurePage() {
    const doc = document.documentElement;

    let after = 0;
    for (const el of document.querySelectorAll("[data-after-mission]")) {
      after += el.offsetHeight;
    }
    missionSpanPx = Math.max(1, doc.scrollHeight - after - doc.clientHeight);

    // Where the mission stops and the page carries on without it. The scene
    // holds from here, which is what lets the closing video have the screen
    // to itself without the Moon still drifting behind it.
    const end = document.querySelector("[data-mission-end]");
    const stop = end
      ? end.getBoundingClientRect().top + window.scrollY - doc.clientHeight
      : doc.scrollHeight - doc.clientHeight;
    missionEndU = Math.max(0, stop) / missionSpanPx;
  }

  function measureSections() {
    measurePage();
    for (const section of INTERLUDES) measureInterlude(section);
  }

  function measureInterlude(section) {
    section.from = -1;
    section.to = -1;
    section.notes.length = 0;
    section.knots = null;
    if (!section.el) return;

    const doc = document.documentElement;
    for (const note of section.el.querySelectorAll(".interlude-note")) {
      section.notes.push({ el: note, u: 0 });
    }
    const phone = doc.clientWidth <= 720;
    const scrollable = missionSpanPx;
    if (scrollable <= 0) return;

    // travel is the scroll distance between "the section's top reaches the
    // top of the viewport" and "its bottom reaches the bottom" -- the
    // interval over which the reader is looking at this section and
    // nothing else.
    const travel = section.el.offsetHeight - doc.clientHeight;
    if (travel <= 0) return;

    const top = section.el.getBoundingClientRect().top + window.scrollY;
    section.from = top / scrollable;
    section.to = (top + travel) / scrollable;

    /* And the moment each caption belongs to, which is not a table here
       because it is already a table in museum.css. A note is placed so that
       at its own moment it sits a fixed distance down the window; run that
       backwards -- where is it in the section, minus where it wants to be in
       the window, over the travel -- and the stylesheet hands back the u it
       was written for. Move a `top` value and this follows it. Add a sixth
       caption and this finds it.

       Read from getBoundingClientRect rather than offsetTop because the
       notes are positioned in vh against a section that is itself sized in
       vh, and offsetTop would be a stale layout after a resize. */
    for (const note of section.notes) {
      const box = note.el.getBoundingClientRect();
      const within = box.top + window.scrollY - top;
      note.u = (within - LIT_AT * doc.clientHeight) / travel;
    }

    /* On a phone the captions are a list, so those u values are wherever the
       list happened to put them, not the moments the captions are about.
       Pair each one with its moment and interpolate between the pairs; if
       the list ever came out in an order that cannot be a monotone map
       (a caption removed, a section reordered) fall back to plain scrolling
       rather than make the mission run backwards. */
    const moments = NOTE_MOMENTS[section.el.id];
    if (phone && moments && moments.length === section.notes.length) {
      const knots = [[0, 0], ...section.notes.map((note, i) => [note.u, moments[i]]), [1, 1]];
      const ordered = knots.every((k, i) => i === 0 || (k[0] > knots[i - 1][0] && k[1] > knots[i - 1][1]));
      if (ordered) section.knots = knots;
    }
  }

  /* How far down the window a caption sits at its own moment, as a fraction.
     museum.css puts them at 200u + 62 viewport heights down a section two
     viewports tall, so this is that 62 and the two files have to agree on
     it. They are checked against each other: tools/apollo-mission-check.mjs
     asserts that nothing of the vehicle is drawn behind the box this implies.

     The fade either side is what keeps that assertion satisfiable. Without
     it every caption is on screen for two-thirds of a viewport of travel in
     each direction and passes straight through the rocket on its way out;
     there is no framing the camera could be holding that a caption does not
     eventually reach. Full brightness within 0.045 of its own moment, gone
     by 0.10, which at twenty-eight hundredths between captions means one
     caption at a time and a clear moment between them. */
  function litNotes(section, u) {
    if (!section.notes.length) return;
    // A phone list is read in place, so nothing on it ever fades.
    const flowed = section.el && document.documentElement.clientWidth <= 720;
    for (const note of section.notes) {
      const lit = u < 0 || flowed ? 1 : 1 - smootherstep(NOTE_FULL, NOTE_GONE, Math.abs(u - note.u));
      note.el.style.setProperty("--note-lit", lit.toFixed(3));
    }
  }

  // -1 when there is no interlude section on this page. Derived from
  // state.progress rather than from the scroll position directly, so it
  // inherits the same easing as the mission and the two cannot slide apart
  // by a frame.
  function interludeProgress(section) {
    if (section.to <= section.from) return -1;
    const u = clamp((state.progress - section.from) / (section.to - section.from), 0, 1);
    if (!section.knots) return u;
    let i = 1;
    while (i < section.knots.length - 1 && u > section.knots[i][0]) i++;
    const [u0, m0] = section.knots[i - 1];
    const [u1, m1] = section.knots[i];
    return m0 + ((u - u0) / (u1 - u0)) * (m1 - m0);
  }

  function documentProgress() {
    // measurePage() unconditionally rather than relying on a caller having
    // run it: this is reachable from a scroll event, from boot, and from the
    // debug hook, and an ordering bug here would present as the mission
    // being subtly mistimed rather than as anything that looks like a fault.
    // It costs no extra reflow, because the frame that calls this is already
    // reading layout in measureSections().
    measurePage();
    return clamp(window.scrollY / missionSpanPx, 0, missionEndU);
  }

  function syncScroll() {
    scrollRaf = 0;
    measureSections();
    scrollProgress = documentProgress();
    // A scroll or resize event that reaches here after the clock has
    // already finished on its own is the reader's own hand on the page --
    // there is no more countdown left to protect below tower clear, so
    // this is the moment the floor gets let go of for good. One that
    // arrives before the clock is done changes nothing here: it is just
    // the ratchet's usual fuel, and tick() below is still the one deciding
    // state.target every frame in that case.
    if (launchClockDone && !launchClockOverridden) launchClockReleased = true;
    // While the loop is running and the launch clock still owns a say in
    // things, tick() recomputes state.target from scrollProgress and the
    // clock on every frame and will pick this up on the very next one.
    // Once the clock has been overridden or released, or there is no loop
    // to wait for, nothing else is going to set it -- so this sets it
    // directly, exactly as it always did before the clock existed.
    if (launchClockOverridden || launchClockReleased || !running) {
      state.target = scrollProgress;
    }
    if (!running) {
      // Reduced motion, or a paused tab that is still being scrolled: follow
      // exactly and draw one frame rather than starting a loop.
      state.progress = state.target;
      renderFrame(0);
    }
  }

  function onScroll() {
    if (!scrollRaf) scrollRaf = requestAnimationFrame(syncScroll);
  }

  /* ---------- Per-frame ---------- */

  function applyCamera() {
    const shot = shotAt(state.progress);
    const rig = shotToCamera(shot);

    // The shot list is authored against latitude and longitude, and what
    // comes out of shotToCamera is a position in world space — fixed, while
    // the planet turns underneath it. The camera used to be rotated by a
    // followed copy of the spin so that Launch Complex 39A stayed pinned
    // under the lens; see the note in shots.js for what that cost and why
    // it went. Nothing rotates the rig now.
    cameraPos.set(rig.position[0], rig.position[1], rig.position[2]);
    cameraTarget.set(rig.target[0], rig.target[1], rig.target[2]);
    cameraUp.set(rig.up[0], rig.up[1], rig.up[2]);

    camera.position.copy(cameraPos);
    camera.up.copy(cameraUp);
    camera.lookAt(cameraTarget);

    camera.fov = shot.fovDeg;

    // Lens shift. Positive offsets move the subject right and down, leaving
    // the top left of the frame clear for the page's own content.
    const w = state.width;
    const h = state.height;
    camera.setViewOffset(w, h, -rig.offsetX * w, -rig.offsetY * h, w, h);
    camera.updateProjectionMatrix();

    // Handed back so the Saturn V interlude can blend toward it below,
    // without shotAt/shotToCamera being computed a second time.
    return rig;
  }

  /* ---------- The launch site ---------- */

  const padRay = new THREE.Vector3();
  const padHit = new THREE.Vector3();
  const padNormal = new THREE.Vector3();

  // Cast the target screen point at the planet and report where it lands, in
  // Earth-fixed coordinates -- the frame the surface is in before spinRad is
  // applied, which is the frame a place on the ground has to be stored in.
  function pickPad() {
    camera.updateMatrixWorld();
    padRay.set(PAD_TARGET_NDC[0], PAD_TARGET_NDC[1], 0.5).unproject(camera);
    padRay.sub(camera.position).normalize();

    const o = camera.position;
    const b = o.dot(padRay);
    const c = o.dot(o) - EARTH_RADIUS_KM * EARTH_RADIUS_KM;
    const disc = b * b - c;

    if (disc >= 0) {
      padHit.copy(padRay).multiplyScalar(-b - Math.sqrt(disc)).add(o);
    } else {
      // The ray missed. Rather than give up, take the point on the ray
      // closest to the centre of the planet and drop it onto the surface.
      // That is the same answer the hit gives in the limit as the ray
      // approaches the limb, so the site does not jump as the framing
      // crosses over -- which matters, because the framing moves.
      padHit.copy(padRay).multiplyScalar(-b).add(o);
      if (padHit.lengthSq() < 1e-6) padHit.set(EARTH_RADIUS_KM, 0, 0);
      padHit.setLength(EARTH_RADIUS_KM);
    }

    padNormal.copy(padHit).normalize();

    // Pull the site into daylight if the framing put it in the dark. Moving
    // it toward the sub-solar direction raises the cosine monotonically and
    // continuously, so the correction never snaps on.
    const lit = padNormal.dot(sunWorld);
    if (lit < PAD_MIN_SUN) {
      padNormal.lerp(sunWorld, Math.min(0.85, (PAD_MIN_SUN - lit) * 0.9)).normalize();
    }

    // Undo the planet's rotation to get back to the ground's own frame.
    const cs = Math.cos(-state.spinRad);
    const sn = Math.sin(-state.spinRad);
    const fx = padNormal.x * cs + padNormal.z * sn;
    const fz = -padNormal.x * sn + padNormal.z * cs;
    const fy = padNormal.y;

    let latDeg = Math.asin(Math.max(-1, Math.min(1, fy))) * (180 / Math.PI);
    latDeg = Math.max(-PAD_LAT_LIMIT, Math.min(PAD_LAT_LIMIT, latDeg));
    const lonDeg = Math.atan2(-fz, fx) * (180 / Math.PI);

    state.padLatDeg = latDeg;
    state.padLonDeg = lonDeg;
    state.spinAtFreeze = state.spinRad;
  }

  /* The launch site's longitude, as the vehicle should use it *now*.
   *
   * The vehicle hangs off earthGroup, so everything drawn on it inherits the
   * planet's rotation. For a pad that is right, and for a rocket it is
   * wrong, and the difference is not academic: measured, at the shipped
   * 0.45 deg/s, ten degrees of spin -- twenty-two seconds of somebody
   * reading the page -- carried the vehicle from the middle of the frame out
   * to NDC 0.67, -0.70, and twenty degrees put it off the screen entirely.
   * A visitor who takes half a minute to reach the launch would find nothing
   * there. That is not a tuning problem, it is the composition depending on
   * how fast you read.
   *
   * So from the moment the pad freezes, its longitude walks backwards by
   * exactly the angle earthGroup has turned since. The two cancel and the
   * vehicle stands still in world space while the ground streams past
   * underneath it -- which is also the more honest picture, because a launch
   * vehicle on its way to orbit is leaving the rotating frame, and the
   * terrain sliding under it is what that looks like.
   *
   * The factor on spinRad is exactly one and never varies. That matters:
   * spinRad accumulates without bound, so anything that multiplies it by a
   * changing number swings by an unbounded amount. This does not multiply
   * it by a changing number. It subtracts it. */
  function padLonNow() {
    return state.padLonDeg - (state.spinRad - state.spinAtFreeze) * (180 / Math.PI);
  }

  /* ---------- The Saturn V interlude ---------- */

  // Slerp between two unit directions. three.js has this for quaternions
  // but not for a bare Vector3, and this file needs it for exactly one
  // thing: interpolating "which way is the camera from Earth's centre"
  // without ever changing "how far", which is what keeps applyVehicleCamera
  // below from cutting a chord through the planet.
  function slerpDirection(out, a, b, t) {
    const dot = THREE.MathUtils.clamp(a.dot(b), -1, 1);
    const theta = Math.acos(dot);
    if (theta < 1e-6) {
      // Already pointing the same way, to a fraction of a degree. An
      // ordinary lerp is indistinguishable from a true slerp at this angle
      // and does not divide by a sine that is about to be zero.
      return out.copy(a).lerp(b, t).normalize();
    }
    const s = Math.sin(theta);
    const wa = Math.sin((1 - t) * theta) / s;
    const wb = Math.sin(t * theta) / s;
    return out.set(a.x * wa + b.x * wb, a.y * wa + b.y * wb, a.z * wa + b.z * wb);
  }

  /* Blends the mission camera toward tourCameraWorld's placement of the
     tour shot on the vehicle that is actually flying -- see the header of
     tour.js for what this replaced and why. weight is journeyWeightAt's
     output: 0 is exactly the mission camera applyCamera() just set, 1 is
     exactly the tour camera, and every quantity below is interpolated
     rather than switched, so nothing about crossing from one to the other
     is a cut.

     Position is not a straight lerp between the two cameras' positions.
     The mission camera sits thousands of kilometres up; the tour camera
     sits a couple of hundred kilometres from the vehicle. Both are safely
     outside the planet, but the chord between two points outside a sphere
     does not have to stay outside it -- with this shot list the two
     cameras are always watching the same nearby vehicle from much the same
     side of Earth, so in practice a straight lerp between them never
     actually dips under the surface (checked densely, both aspect ratios,
     in tools/apollo-mission-check.mjs). That is a property of today's
     shots, not a guarantee, so it is not what this code leans on -- a shot
     added later, or one nudged toward the vehicle's tail, could put the two
     cameras on opposite sides of the planet without warning.

     The fix is to lerp distance from Earth's centre and slerp direction
     from Earth's centre separately. The blended distance then sits exactly
     between the two endpoints' distances by construction -- a lerp of two
     numbers that are each above a floor is always above that floor --
     regardless of how far apart the two directions are. The mission check
     confirms this rather than assumes it, including a run against a
     deliberately broken shot (a knot moved far enough to put the vehicle's
     own camera close to the planet) to confirm the check actually fails
     when it should; see the comment above that section for what was done
     and reverted. Once acquired, the journey camera keeps weight 1 through
     coast and landing; it never hands the view back to the Earth camera. */
  const liftProbe = new THREE.Vector3();

  /* The mission camera is aimed at the planet, not at the spacecraft, and
     the lens shifts authored for it assume a wide window: the vehicle ends
     up wherever the ascent and the coast happen to put it, which on a phone
     is below the bottom of the frame through the back half of the page. So
     in portrait the lens is nudged, every frame, by exactly the amount that
     puts the vehicle at the middle of the screen across and PORTRAIT_LIFT
     above it. The camera does not turn, so the Earth, the horizon and the
     sunlight are the same ones the mission shots composed.

     It fades in over the first screen after the hero, so the opening shot
     of the pad is the one that was composed, and fades out as the vehicle
     camera takes over, which is subject-locked already and gets the same
     spot from its own shift. */
  function liftVehicleInPortrait(journeyWeight) {
    const k = portraitWeight(state.width / Math.max(state.height, 1))
      * smootherstep(0.05, 0.11, state.progress) * (1 - journeyWeight);
    if (k <= 0 || !vehicle || !vehicle.stack) return;

    camera.updateMatrixWorld();
    vehicle.stack.getWorldPosition(liftProbe);
    // Behind the camera there is no screen position to ask about.
    if (liftProbe.clone().applyMatrix4(camera.matrixWorldInverse).z >= 0) return;
    liftProbe.project(camera);

    const dx = clamp(-liftProbe.x, -4, 4);
    const dy = clamp(PORTRAIT_LIFT - liftProbe.y, -4, 4);
    const view = camera.view;
    camera.setViewOffset(
      state.width, state.height,
      view.offsetX - (dx * k * state.width) / 2,
      view.offsetY + (dy * k * state.height) / 2,
      state.width, state.height);
    camera.updateProjectionMatrix();
  }

  function applyVehicleCamera(weight, flight, frame, rig, place) {
    missionPos.copy(camera.position);
    missionQuat.copy(camera.quaternion);
    const missionFov = camera.fov;

    // The vehicle's own axis in world space, read off the pose vehicle.js
    // just set for this frame -- after earthGroup's spin, unlike
    // vehicleFrame()'s own Earth-fixed frame argument, because this camera
    // has to sit in the same true-world space the renderer draws in.
    vehicle.stack.updateWorldMatrix(true, false);
    vehicle.stack.getWorldPosition(tourOrigin);
    tourAxis.setFromMatrixColumn(vehicle.stack.matrixWorld, 1).normalize();
    earthGroup.getWorldPosition(earthCentre);

    // One vehicle rig connects the tour, coast and landing shots.
    const shot = place(state.width / Math.max(state.height, 1), {
      origin: [tourOrigin.x, tourOrigin.y, tourOrigin.z],
      axis: [tourAxis.x, tourAxis.y, tourAxis.z],
      kmPerVehicleMetre: flight.kmPerVehicleMetre,
    });
    tourPos.set(shot.position[0], shot.position[1], shot.position[2]);
    tourTarget.set(shot.target[0], shot.target[1], shot.target[2]);
    tourUp.set(shot.up[0], shot.up[1], shot.up[2]);

    tourOrient.position.copy(tourPos);
    tourOrient.up.copy(tourUp);
    tourOrient.lookAt(tourTarget);
    // Roll last, about the axis the camera is already looking down, so it
    // is a roll and not a change of subject -- the same order the old
    // exhibit camera rolled in.
    tourOrient.rotateZ((shot.rollDeg * Math.PI) / 180);

    const missionR = missionPos.distanceTo(earthCentre);
    const tourR = tourPos.distanceTo(earthCentre);
    const blendedR = missionR + (tourR - missionR) * weight;

    missionDir.copy(missionPos).sub(earthCentre).normalize();
    tourDir.copy(tourPos).sub(earthCentre).normalize();
    slerpDirection(blendedDir, missionDir, tourDir, weight);

    camera.position.copy(blendedDir).multiplyScalar(blendedR).add(earthCentre);

    /* The aim is blended as a point in the world, not as a rotation.

       Slerping the two quaternions looks like the obvious thing and is
       wrong, because an orientation is only a good one at the position it
       was computed for. tourOrient points at the vehicle *from the tour
       camera's seat*. Halfway through the blend the camera is nowhere near
       that seat, so wearing half of that rotation aims it at neither the
       vehicle nor what the mission camera was looking at -- it aims at the
       gap between them. Measured on the page before this was changed: at
       tourU 0.13 and again at 0.92-0.95, every corner of every mesh in the
       vehicle was outside the frame. Two stretches of empty sky, one on the
       way in and one on the way out, exactly where the weight was between
       zero and one and nowhere else.

       Aiming at a blended *point* cannot do that. tourTarget is a point on
       the vehicle's own axis; missionTarget is the mission camera's own
       view ray sampled at the same range, so it is wherever the mission
       shot was already framing. The segment between two points near the
       vehicle stays near the vehicle. Both ends are still exact: at weight
       0 this reproduces the mission camera's rotation, and at weight 1 it
       repeats tourOrient's construction line for line. */
    missionFwd.set(0, 0, -1).applyQuaternion(missionQuat);
    missionUpV.set(0, 1, 0).applyQuaternion(missionQuat);
    const aimRange = Math.max(missionPos.distanceTo(tourTarget), 1e-3);
    missionTarget.copy(missionPos).addScaledVector(missionFwd, aimRange);
    blendedTarget.lerpVectors(missionTarget, tourTarget, weight);
    slerpDirection(blendedUp, missionUpV, tourUp.clone().normalize(), weight);

    camera.up.copy(blendedUp);
    camera.lookAt(blendedTarget);
    camera.rotateZ(((shot.rollDeg * Math.PI) / 180) * weight);
    camera.fov = missionFov + (shot.fovDeg - missionFov) * weight;

    // rig.offsetX/offsetY are setViewOffset's own units; shot.shiftX/shiftY
    // are tour.js's, defined as "1 is half the frame" in the comment above
    // THE MOVE in tour.js. setViewOffset(w, h, -ox*w, -oy*h, w, h) is a
    // clip-space translation of (2*ox, -2*oy) -- documented in
    // apollo-framing.mjs's header comment -- so 2*rig.offsetX and
    // -2*rig.offsetY are the mission's own shift in tour.js's units, and
    // lerping between them and the tour's own reproduces each camera's own
    // setViewOffset call exactly at its own end of the blend.
    const missionShiftX = 2 * rig.offsetX;
    const missionShiftY = -2 * rig.offsetY;
    const portrait = portraitWeight(state.width / Math.max(state.height, 1));
    const tourShiftX = shot.shiftX * (1 - portrait);
    const tourShiftY = shot.shiftY * (1 - portrait) + PORTRAIT_LIFT * portrait;
    const shiftX = missionShiftX + (tourShiftX - missionShiftX) * weight;
    const shiftY = missionShiftY + (tourShiftY - missionShiftY) * weight;

    const w = state.width;
    const h = state.height;
    camera.setViewOffset(w, h, (-shiftX / 2) * w, (shiftY / 2) * h, w, h);
    camera.updateProjectionMatrix();

    // The blend just moved the camera, possibly a long way. Refresh the
    // view-dependent shading terms so they match the camera that is about
    // to render rather than the mission-only one applyCamera() set at the
    // top of this frame. Both calls are cheap -- a handful of uniform
    // copies, and for the vehicle five meshes -- and both already tolerate
    // being called a second time with the same flight and frame.
    earth.update({ sunDirection: sunWorld, cameraPosition: camera.position, cloudDrift: state.cloudDrift });
    vehicle.update({ flight, frame, sunDirection: sunWorld, cameraPosition: camera.position });
    /* And the Moon, which needs it more than either. Its shading is
       view-dependent twice over: the scattering law wants the real view
       angle, and the exposure is chosen from how far the camera is above
       the surface. Placed from the mission camera three hundred thousand
       kilometres away, a Moon filling the frame is told it is being
       watched from a third of a million kilometres off and exposes for
       that -- which is why the first lunar renders came out black with a
       lit spacecraft in them, and why nothing in moon.js was at fault. */
    if (moon) {
      moon.place({
        position: moonWorld,
        northAxis: moonNorthWorld,
        sunDirection: sunWorld,
        cameraPosition: camera.position,
      });
    }
  }

  // The drawn length of the vehicle on the frame just built, kept for the
  // near-plane update at the bottom -- flight is block-scoped to the branch
  // that draws the vehicle, and the plane has to be set after the camera
  // has stopped moving, which is outside it.
  let vehicleLengthKm = 0;

  function renderFrame(dt) {
    if (disposed || !earth) return;
    measure();

    // The mission holds at contact, but the document keeps moving. Give the
    // film a clear screen once it enters, with the same fade in reverse.
    if (container) {
      const endPx = missionEndU * missionSpanPx;
      const vh = Math.max(document.documentElement.clientHeight, 1);
      const filmFade = smootherstep(endPx + vh * 0.1, endPx + vh * 0.85, window.scrollY);
      container.style.opacity = String(1 - filmFade);
    }

    state.elapsed += dt;
    state.spinRad += dt * EARTH_SPIN_DEG_PER_SEC * (Math.PI / 180);
    state.cloudDrift = (state.cloudDrift + dt * CLOUD_DRIFT_PER_SEC) % 1;

    /* Where the two interludes are, read before anything asks what time it
       is. The lunar one re-times the mission -- see lunarMissionP -- so from
       its top edge down, the clock, the Moon, the orbit and the lander all
       read missionP. What is about the page rather than the mission still
       reads progress: the Earth camera, the pad, the stars, and the
       interludes' own positions, which is what makes this not circular.
       Above the lunar interlude the two are the same number. */
    state.tourU = interludeProgress(tour);
    state.lunarU = interludeProgress(lunar);
    if (container) container.style.setProperty("--cinema", state.width > 720
      ? Math.max(tourWeightAt(state.tourU), lunarWeightAt(state.lunarU)).toFixed(3) : "0");
    // The directory needs a heavy readability wash; the close-up exhibit
    // has empty sky reserved around its captions and can let the model show.
    // On a phone the wash opens by PHONE_LIGHT of what it does on a desktop:
    // the words run the full width of the screen there, not down one side.
    const light = state.width > 720 ? 1 : PHONE_LIGHT;
    if (main) main.style.setProperty("--tour-light", (light
      * Math.max(tourWeightAt(state.tourU), 0.55 * journeyWeightAt(state.tourU))).toFixed(3));
    if (main) main.style.setProperty("--lunar-light", (lunar.to > lunar.from
      ? light * smootherstep(lunar.from - 0.08, lunar.from + 0.01, state.progress) : 0).toFixed(3));
    state.missionP = state.lunarU > 0 ? lunarMissionP(state.lunarU, lunar.from) : state.progress;
    state.phase = phaseAt(state.missionP);

    // The one thing in the scene that turns of its own accord. The Sun and
    // the stars are fixed in world space, so this rotation has nothing to
    // cancel against and the surface visibly moves.
    earthGroup.rotation.y = state.spinRad;

    const missionRig = applyCamera();

    // Deliberately not passing nightIntensity or atmosphereIntensity.
    //
    // Both used to be sent as 1 from here, every frame. For the night lights
    // that was a no-op, since 1 is the default. For the atmosphere it was
    // not: the scattering gain is a fitted constant of 0.22, chosen against
    // measured luminance percentiles, and setting it back to 1 on the first
    // frame threw that away permanently. The result was the exact frame the
    // fit was made to avoid — median luminance 0.75 instead of 0.39, and
    // nearly two percent of the planet burned to flat white.
    //
    // update() still takes both, because the ascent phases will want to pull
    // the night side up and the atmosphere down as the camera retreats. Until
    // something actually wants a value other than the default, the right
    // number of opinions for this call to have about them is none.
    earth.update({
      sunDirection: sunWorld,
      cameraPosition: camera.position,
      cloudDrift: state.cloudDrift,
    });

    /* The Moon rides the mission clock, not the wall clock and not the
       Earth's spin.

       It is a child of the scene rather than of earthGroup, which is the
       whole point: earthGroup turns 108 times faster than the real planet
       so that the surface visibly moves, and a Moon parented to it would be
       dragged round with the ground at a hundred revolutions a day. In the
       frame moonAt returns, the Earth turns underneath a Moon that is
       almost still -- which is what actually happens.

       getSecondsAt is the same authored page-distance-to-mission-time ramp
       flight.js flies the vehicle on, so the Moon and the spacecraft agree
       about what time it is even though neither of them agrees with the
       clock on the wall. */
    // Read every frame, mesh or no mesh: the spacecraft's course past
    // translunar injection is aimed at the Moon, and it cannot wait for a
    // texture to finish downloading to know which way that is.
    const moonNow = moonAt(LAUNCH_EPOCH_MS + getSecondsAt(state.missionP) * 1000);
    moonDirWorld.copy(latLonToUnitVector(moonNow.latDeg, moonNow.lonDeg));
    moonWorld.copy(moonDirWorld).multiplyScalar(moonNow.distanceKm);

    if (moon) {
      moon.place({
        position: moonWorld,
        northAxis: moonNorthWorld,
        sunDirection: sunWorld,
        cameraPosition: camera.position,
      });
    }

    // Re-pick until engine start, then leave it alone. Scrolling back up
    // into prelaunch unfreezes it, which is the same reversibility rule
    // everything else on this layer follows.
    state.padFrozen = state.progress >= IGNITION_P;
    if (!state.padFrozen) pickPad();

    // Before the freeze this is exactly what pickPad just computed, because
    // spinAtFreeze is spinRad. After it, it is the counter-rotated value,
    // and the pad glow has to travel with the vehicle or the two come apart.
    const padLonDeg = padLonNow();
    launchSite.setLocation(state.padLatDeg, padLonDeg);

    launchSite.update({
      cameraPosition: camera.position,
      progress: state.progress,
    });

    // After update(), which is what computes the limb-and-distance visibility
    // the flare inherits.
    state.flare = launchSite.screenFlare({
      camera,
      width: state.width,
      height: state.height,
      progress: state.progress,
    });

    // The captions, against the interlude positions read at the top of the
    // frame.
    litNotes(tour, state.tourU);
    litNotes(lunar, state.lunarU);

    if (vehicle) {
      const flight = flightAt(state.missionP);
      vehicleLengthKm = flight.stackHeightKm;
      const basis = surfaceBasis(state.padLatDeg, padLonDeg);
      const heading = headingAt(state.padLatDeg, padLonDeg, state.azimuthDeg);

      /* Two ways of saying where the spacecraft is, and the seam between
         them is translunar injection.

         Before it, the ascent: an altitude and a downrange over a pad,
         exaggerated sixteen times so that a 190 km orbit is visible against
         a 6,371 km planet. That is the whole first act and it is not
         touched here.

         After it, an ellipse -- see translunar.js. The ascent's own curves
         kept climbing past TLI and, multiplied by that same sixteen, put
         the spacecraft 3.19 million kilometres out at the bottom of the
         page: eight times past the Moon and outside the camera's far
         plane. It was never noticed because no camera on the page was
         pointed anywhere near it, and it would have been noticed the
         instant one in the lunar act went looking.

         The frame handed to coastFrame is earthGroup's, not the world's.
         Everything drawn on the vehicle is a child of a group spinning a
         hundred times a day, and the departure direction is already
         expressed in that frame -- padLonNow() counter-rotates the pad so
         the vehicle holds still in the world while its local coordinates
         wind backwards. The Moon does not: it is a child of the scene. So
         its direction is wound backwards by the same angle before the two
         are put in one equation. Skipping that would leave the trajectory
         turning through a hundred degrees a day, and a reader who scrolled
         slowly would watch the mission spiral. */
      let frame = vehicleFrame(basis.up, heading, flight, EARTH_RADIUS_KM);
      if (state.missionP > TLI_P) {
        const depart = vehicleFrame(basis.up, heading, flightAt(TLI_P), EARTH_RADIUS_KM);
        const cs = Math.cos(state.spinRad);
        const sn = Math.sin(state.spinRad);
        // The Moon, wound back into earthGroup's frame -- the rotation the
        // long note above is about, done once and used by both branches.
        const moonLocal = [
          moonDirWorld.x * cs - moonDirWorld.z * sn,
          moonDirWorld.y,
          moonDirWorld.x * sn + moonDirWorld.z * cs,
        ];
        if (state.missionP > LOI_P) {
          /* The coast gradually aligns its endpoint and heading with this
             orbit before arrival. Both branches meet at the same pose.

             The centre is the Moon's own position in the same wound-back
             frame, which is moonLocal scaled by the distance rather than
             the world-space moonWorld the renderer uses -- the vehicle is
             a child of earthGroup and everything handed to vehicleFrame,
             coastFrame and lunarFrame alike has to be in that child frame.

             North is the scene's own +Y. mission.js gives the Moon's
             position in a frame whose Y axis is the Earth's rotation axis,
             and the Moon's own pole is within about seven degrees of it --
             a tilt that no camera in this act is placed to reveal, and one
             that would cost the landing site a few degrees of latitude for
             nothing anybody would see. */
          frame = lunarFrame(state.missionP, {
            moonCentre: [
              moonLocal[0] * moonNow.distanceKm,
              moonLocal[1] * moonNow.distanceKm,
              moonLocal[2] * moonNow.distanceKm,
            ],
            moonDir: moonLocal,
            north: [0, 1, 0],
          });
        } else {
          frame = coastFrame(state.missionP, {
            departUp: depart.up,
            departFwd: depart.forward,
            moonDir: moonLocal,
            handoverKm: Math.hypot(...depart.position) - TRANSFER.perigeeKm,
          });
        }
      }

      vehicle.update({
        flight,
        frame,
        sunDirection: sunWorld,
        cameraPosition: camera.position,
      });
      if (plume) plume.update({ flight, elapsed: state.elapsed });

      // Acquire the flying vehicle during the tour, then keep following it
      // continuously through coast and landing. Returning to the Earth
      // camera between sections loses the spacecraft in empty sky.
      const journeyWeight = journeyWeightAt(state.tourU);
      if (journeyWeight > 0) {
        /* The track direction, wound the other way -- out of earthGroup's
           spinning frame and into the world the camera is placed in. This
           is the inverse of the rotation applied to the Moon a few lines
           up, which is why one uses (c, -s) and this uses (c, +s); a
           rotation about Y and its transpose.

           It goes to the camera in place of the vehicle's nose. See
           lunarCameraWorld for what that is worth: everywhere but the last
           minute they are the same vector, and in that last minute the
           nose points straight up and taking the frame's "up" from it
           leaves the horizon standing on end. */
        const cw = Math.cos(state.spinRad);
        const sw = Math.sin(state.spinRad);
        const trackWorld = [
          frame.forward[0] * cw + frame.forward[2] * sw,
          frame.forward[1],
          -frame.forward[0] * sw + frame.forward[2] * cw,
        ];
        applyVehicleCamera(journeyWeight, flight, frame, missionRig, (aspect, rig) =>
          journeyCameraWorld({ progress: state.progress, tourU: state.tourU,
            lunarU: state.lunarU, tourFrom: tour.from, tourTo: tour.to }, aspect, {
            ...rig,
            trackAxis: trackWorld,
            earthCenter: [earthCentre.x, earthCentre.y, earthCentre.z],
            missionP: state.missionP,
            moonCenter: [moonWorld.x, moonWorld.y, moonWorld.z],
            // How far the stack's origin is above the ground, which is
            // what keeps the camera out of it.
            altitudeKm: frame.lunar ? frame.lunar.altitudeKm : Infinity,
          })
        );
      }
      liftVehicleInPortrait(journeyWeight);
    }

    /* Now that the camera has finished moving -- the mission shot, then
       whichever interlude blend was above zero -- bring the near plane in
       far enough to clear whatever it is looking at.

       Half the clear distance to the nearest point of the vehicle, which is
       its centre less its own drawn length, so the margin scales with the
       exaggeration rather than being a constant that stops working the
       moment the vehicle is drawn at a different size. Capped at NEAR_KM so
       this can only ever open the frustum up, never close it: no frame that
       drew correctly before can start clipping because of this. */
    let nearKm = NEAR_KM;
    if (vehicle && vehicle.stack) {
      nearProbe.setFromMatrixPosition(vehicle.stack.matrixWorld);
      const clearKm = nearProbe.distanceTo(camera.position) - vehicleLengthKm;
      nearKm = Math.min(NEAR_KM, Math.max(0.02, clearKm * 0.5));
    }
    if (camera.near !== nearKm) {
      camera.near = nearKm;
      camera.updateProjectionMatrix();
    }

    if (moon) {
      const lm = vehicle && vehicle.meshes.get("lm");
      const flight = flightAt(state.missionP);
      if (lm) lm.getWorldPosition(landerWorld);
      moon.setLander({
        position: landerWorld, moonCentre: moonWorld,
        scale: flight.kmPerVehicleMetre, seconds: flight.getSeconds,
        active: lm && lm.visible ? flight.parts.lm.roll : 0,
      });
    }

    starfield.update({
      cameraPosition: camera.position,
      pixelRatio: state.pixelRatio,
      // The sky brightens nothing, but a camera exposed for a sunlit planet
      // would not record many stars either. They come up as the planet
      // retreats and stops dominating the frame.
      intensity: (0.55 + 0.45 * Math.min(state.progress, 1))
        * (1 - 0.7 * lunarWeightAt(state.lunarU)),
      scale: state.pixelRatio > 1 ? 1 : 1.2,
    });

    renderer.render(scene, camera);

    notifyFrame();
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const rawDt = Math.max(now - lastFrameTime, 0) / 1000;
    const dt = Math.min(rawDt, MAX_DT);
    lastFrameTime = now;

    // The launch clock runs on the wall clock's own delta, uncapped by
    // MAX_DT and only lightly capped by its own -- see CLOCK_MAX_DT -- and
    // it is what sets state.target while it is still active. Once
    // setProgress() has taken over, this gets out of the way entirely and
    // leaves state.target exactly where setProgress or a scroll event put
    // it, which is what makes a scripted frame land where it is asked.
    // And once syncScroll() has released the floor -- the clock finished
    // and the reader has since scrolled or resized -- this gets out of the
    // way too: launchClockP() would otherwise sit at a fixed 0.135 forever
    // and stop scrollProgress from ever being allowed back below it, which
    // is exactly the museum the rest of the page is supposed to still be.
    // Reaching tower clear without being released yet still takes the
    // max(), which is what lets an untouched page hold at tower clear
    // instead of reaching it and immediately sliding back to the pad.
    if (!launchClockOverridden) {
      tickLaunchClock(Math.min(rawDt, CLOCK_MAX_DT));
      state.target = launchClockReleased ? scrollProgress : Math.max(scrollProgress, launchClockP());
    }

    // Frame-rate independent approach. Fast enough that a scrollbar drag
    // feels attached to the scene, slow enough that a mouse wheel's steps
    // arrive as a camera move rather than as a series of jolts.
    const diff = state.target - state.progress;
    if (Math.abs(diff) < 0.00002) {
      state.progress = state.target;
    } else {
      state.progress = state.target - diff * Math.pow(0.0022, dt);
    }

    renderFrame(dt);
  }

  /* ---------- Lifecycle ---------- */

  function start() {
    if (running || disposed || prefersReducedMotion) return;
    running = true;
    lastFrameTime = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function onVisibility() {
    if (document.hidden) stop();
    else if (!prefersReducedMotion) start();
  }

  /* ---------- Boot ---------- */

  const loader = new THREE.TextureLoader();
  const anisotropy = renderer.capabilities.getMaxAnisotropy();

  const ready = (async () => {
    // The small day map first, always. It is a quarter of the size of the
    // large one, so the planet appears about four times sooner; the
    // detailed version is swapped in underneath once it lands, and on a
    // phone it is never requested at all.
    const [day, night, clouds] = await Promise.all([
      loadTexture(loader, "earth-day-2k.webp", { colorSpace: THREE.SRGBColorSpace, anisotropy }),
      loadTexture(loader, "earth-night-2k.webp", { colorSpace: THREE.SRGBColorSpace, anisotropy }),
      // The cloud map is a mask, not a picture. Decoding it as sRGB would
      // apply a transfer curve to data that is not a colour.
      loadTexture(loader, "earth-clouds-2k.webp", { colorSpace: THREE.NoColorSpace, anisotropy }),
    ]);

    if (disposed) return;

    earth = createEarth({ textures: { day, night, clouds }, exposure: 1.0 });
    earthGroup.add(earth.group);

    // The Moon arrives on its own, after the planet. Nothing before the
    // translunar coast draws it at more than a couple of pixels, so it has
    // no business holding up the first frame -- and if it never arrives at
    // all, every frame this page has drawn until now still draws.
    loadTexture(loader, "moon-2k.webp", {
      colorSpace: THREE.SRGBColorSpace,
      anisotropy,
    })
      .then((map) => {
        if (disposed) {
          map.dispose();
          return;
        }
        moon = createMoon({ map, radiusKm: MOON_RADIUS_KM, exposure: 1.0, surfaceDetail: quality === "high" });
        scene.add(moon.mesh);
        if (!running) renderFrame(0);
        if (quality === "high") {
          Promise.allSettled([
            loadTexture(loader, "moon-color-4k.webp", { colorSpace: THREE.SRGBColorSpace, anisotropy }),
            loadTexture(loader, "moon-normal-3k.webp", { colorSpace: THREE.NoColorSpace, anisotropy }),
          ]).then((maps) => {
            const failed = maps.find(result => result.status === "rejected");
            if (disposed || failed) {
              for (const result of maps) if (result.status === "fulfilled") result.value.dispose();
              if (!disposed) console.warn("Apollo layer kept the lightweight Moon maps:", failed.reason);
              return;
            }
            const [colour, normalMap] = maps.map(result => result.value);
            moon.upgradeMaps({ map: colour, normalMap });
            if (!running) renderFrame(0);
          }).catch(error => console.warn("Apollo layer kept the lightweight Moon maps:", error));
        }
      })
      .catch((error) => {
        console.warn("Apollo layer could not load the Moon:", error);
      });

    measure();
    scrollProgress = documentProgress();
    state.target = scrollProgress;
    state.progress = state.target;

    // One frame, drawn synchronously, before any animation loop starts.
    // This is what `prefers-reduced-motion` gets permanently, and it means
    // the layer is never a blank rectangle waiting on a frame callback.
    renderFrame(0);

    if (!prefersReducedMotion) start();

    // The Saturn V arrives on its own schedule. It is three hundred
    // kilobytes gzipped against four megabytes of Earth texture, so it is
    // never the thing holding the first frame up, and nothing before p =
    // 0.086 draws it anyway -- there is no state in which waiting for it
    // would have been better than showing the planet without it.
    createVehicle({ url: MODEL_URL, landerUrl: LANDER_URL })
      .then((built) => {
        if (disposed) {
          built.dispose();
          return;
        }
        vehicle = built;
        vehicleGroup.add(vehicle.object3D);
        plume = createPlume({ meshes: vehicle.meshes });

        // Progressive detail on the existing rocket. Phones retain the
        // smaller geometry; failed upgrades leave the working model intact.
        if (quality === "high") {
          loadSaturnV(DETAIL_URL).then(({ parts }) => {
            if (disposed) return;
            built.upgradeGeometry(parts);
            if (!running) renderFrame(0);
          }).catch(() => {});
        }

        // Independent of the vehicle in every way except timing: this is
        // just the earliest convenient moment to make sure each interlude's
        // span and caption list exist, for a visitor who loaded the page
        // already scrolled into one and has not scrolled again since --
        // syncScroll() would eventually call this too, but nothing
        // guarantees a scroll event before the vehicle's own fetch resolves.
        measureSections();

        if (!running) renderFrame(0);
      })
      .catch((error) => {
        // A missing rocket is a missing rocket. The planet, the pad light
        // and the whole page are unaffected, so this is reported and not
        // thrown.
        console.warn("Apollo: the launch vehicle failed to load.", error);
      });

    if (quality === "high") {
      loadTexture(loader, "earth-day-4k.webp", { colorSpace: THREE.SRGBColorSpace, anisotropy })
        .then((hi) => {
          if (disposed || !earth) return;
          earth.setDayMap(hi);
          if (!running) renderFrame(0);
        })
        .catch(() => {
          /* The 2k map is already on screen. A failed upgrade is not worth
             taking the layer down over. */
        });
    }

    return true;
  })();

  // The observer catches the element changing shape. The window listener is
  // still needed on top of it, because devicePixelRatio can change without
  // the element's CSS size changing at all: dragging the window onto a
  // second monitor does exactly that.
  const sizeObserver =
    typeof ResizeObserver === "function" ? new ResizeObserver(invalidateSize) : null;
  if (sizeObserver) sizeObserver.observe(container || canvas);

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", invalidateSize);
  window.addEventListener("resize", onScroll);
  document.addEventListener("visibilitychange", onVisibility);

  return {
    ready,
    state,
    renderer,
    camera,
    launchSite,
    get vehicle() {
      return vehicle;
    },
    flightAt,

    // Where the Saturn V interlude has got to, 0..1, or -1 off a page that
    // has no interlude. Read-only, and read from the same progress
    // the camera itself uses, so a probe cannot measure a different u than
    // the one that drew the frame it is looking at.
    tourU: () => interludeProgress(tour),

    // And the lunar interlude's, on the same terms.
    lunarU: () => interludeProgress(lunar),
    // The mission progress the last frame was drawn at, after the lunar
    // interlude's re-timing. flightAt(missionP()) is what is on screen.
    missionP: () => state.missionP,

    // Read-only, for tools/apollo-moon-probe.mjs. The Moon is placed from
    // the mission clock rather than from anything the camera does, so the
    // only way to check it ended up where the arithmetic says it should is
    // to ask the frame that drew it.
    moonMesh: () => (moon ? moon.mesh : null),

    // The two numbers the whole progress domain rests on, so a probe can
    // assert them rather than infer them from a difference it can see.
    missionSpanPx: () => (measurePage(), missionSpanPx),
    missionEndU: () => (measurePage(), missionEndU),

    // Tuning hooks. The launch azimuth and the two exaggeration gains are
    // composition decisions, and the only way to settle a composition
    // decision is to look at it, so they are reachable from the console.
    tune({ azimuthDeg, altitudeGain, downrangeGain } = {}) {
      if (typeof azimuthDeg === "number") state.azimuthDeg = azimuthDeg;
      setGains({ altitude: altitudeGain, downrange: downrangeGain });
      renderFrame(0);
      return { azimuthDeg: state.azimuthDeg, ...setGains() };
    },

    /** Subscribe to progress, once per drawn frame. Returns an
     *  unsubscribe. Used by the countdown, which needs the same number
     *  the scene drew with rather than its own reading of the scroll. */
    onFrame(fn) {
      frameListeners.add(fn);
      fn(state.progress, state);
      return () => frameListeners.delete(fn);
    },

    // Set mission progress directly, bypassing the scroll position. Used by
    // the debug hook to step through the timeline in an environment that
    // cannot reliably drive an animation loop, and by nothing else.
    setProgress(p, { immediate = true } = {}) {
      measurePage();
      // A scripted frame has to land exactly where it is asked, every time
      // after this one too -- see the launch clock's own comment for why
      // this switch, once thrown, stays thrown.
      launchClockOverridden = true;
      state.target = clamp(p, 0, missionEndU);
      if (immediate) {
        state.progress = state.target;
        renderFrame(0);
      }
    },

    // Draw one frame, optionally advancing the clock by dt seconds first.
    // The default of 0 redraws the current instant, which is what stepping
    // through progress values wants. Passing a dt is how anything time-based
    // — the spin, the cloud drift — can be inspected at all in an
    // environment where the animation loop does not run.
    renderFrame: (dt = 0) => renderFrame(dt),
    start,
    stop,

    destroy() {
      disposed = true;
      stop();
      frameListeners.clear();
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      if (sizeObserver) sizeObserver.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", invalidateSize);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      launchSite.dispose();
      if (plume) plume.dispose();
      // The captions were dimmed because there was a rocket behind them.
      // With the layer gone there is not, and leaving four of the five at
      // three per cent opacity would delete the content.
      for (const section of INTERLUDES) {
        for (const note of section.notes) note.el.style.removeProperty("--note-lit");
      }
      if (vehicle) vehicle.dispose();
      disposeSaturnV(MODEL_URL);
      disposeSaturnV(DETAIL_URL);
      disposeSaturnV(LANDER_URL);
      starfield.dispose();
      if (earth) earth.dispose();
      if (moon) moon.dispose();
      if (main) main.style.removeProperty("--tour-light");
      if (main) main.style.removeProperty("--lunar-light");
      if (container) container.style.removeProperty("opacity");
      if (container) container.style.removeProperty("--cinema");
      renderer.dispose();
    },
  };
}

export { EARTH_RADIUS_KM };
