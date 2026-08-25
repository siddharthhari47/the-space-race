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
import { createStarfield } from "./starfield.js";
import { shotAt, shotToCamera } from "./shots.js";
import {
  LAUNCH_EPOCH_MS,
  LC39A,
  clamp,
  latLonToUnitVector,
  phaseAt,
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
  const camera = new THREE.PerspectiveCamera(40, 1, 100, 4_000_000);

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

  let earth = null;
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

  const cameraPos = new THREE.Vector3();
  const cameraTarget = new THREE.Vector3();
  const cameraUp = new THREE.Vector3();


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
  };

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

  /* ---------- Scroll ---------- */

  // clientHeight, not innerHeight. They differ by the horizontal scrollbar
  // on desktop and by the collapsing address bar on mobile, and innerHeight
  // is the larger of the two, so it makes the scrollable range come out
  // short and the last stretch of the page arrives with progress already
  // clamped at 1 — the visualization freezes before the reader reaches the
  // bottom. clientHeight is the height of the box that actually scrolls,
  // which is the number this ratio is asking about.
  function documentProgress() {
    const doc = document.documentElement;
    const scrollable = doc.scrollHeight - doc.clientHeight;
    if (scrollable <= 0) return 0;
    return clamp(window.scrollY / scrollable, 0, 1);
  }

  function syncScroll() {
    scrollRaf = 0;
    state.target = documentProgress();
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
  }

  function renderFrame(dt) {
    if (disposed || !earth) return;
    measure();

    state.elapsed += dt;
    state.spinRad += dt * EARTH_SPIN_DEG_PER_SEC * (Math.PI / 180);
    state.cloudDrift = (state.cloudDrift + dt * CLOUD_DRIFT_PER_SEC) % 1;
    state.phase = phaseAt(state.progress);

    // The one thing in the scene that turns of its own accord. The Sun and
    // the stars are fixed in world space, so this rotation has nothing to
    // cancel against and the surface visibly moves.
    earthGroup.rotation.y = state.spinRad;

    applyCamera();

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

    launchSite.update({
      cameraPosition: camera.position,
      progress: state.progress,
    });

    starfield.update({
      cameraPosition: camera.position,
      pixelRatio: state.pixelRatio,
      // The sky brightens nothing, but a camera exposed for a sunlit planet
      // would not record many stars either. They come up as the planet
      // retreats and stops dominating the frame.
      intensity: 0.55 + 0.45 * state.progress,
      scale: state.pixelRatio > 1 ? 1 : 1.2,
    });

    renderer.render(scene, camera);
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(Math.max(now - lastFrameTime, 0) / 1000, MAX_DT);
    lastFrameTime = now;

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

    measure();
    state.target = documentProgress();
    state.progress = state.target;

    // One frame, drawn synchronously, before any animation loop starts.
    // This is what `prefers-reduced-motion` gets permanently, and it means
    // the layer is never a blank rectangle waiting on a frame callback.
    renderFrame(0);

    if (!prefersReducedMotion) start();

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

    // Set mission progress directly, bypassing the scroll position. Used by
    // the debug hook to step through the timeline in an environment that
    // cannot reliably drive an animation loop, and by nothing else.
    setProgress(p, { immediate = true } = {}) {
      state.target = clamp(p, 0, 1);
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
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      if (sizeObserver) sizeObserver.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", invalidateSize);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      launchSite.dispose();
      starfield.dispose();
      if (earth) earth.dispose();
      renderer.dispose();
    },
  };
}

export { EARTH_RADIUS_KM };
