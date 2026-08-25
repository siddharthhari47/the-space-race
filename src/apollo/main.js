// Entry point for the Apollo layer.
//
// Everything here is a reason not to run. The scene is decoration — the
// homepage is a complete, readable directory without it — so any doubt
// about whether this device wants a WebGL globe behind its text is settled
// in favour of not giving it one. The container keeps a CSS-only backdrop
// underneath, so bailing out leaves a deliberate-looking page rather than a
// hole where a canvas should be.

import { createApolloScene, prefersReducedMotion } from "./scene.js";

function webglAvailable() {
  try {
    const probe = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (probe.getContext("webgl2") || probe.getContext("webgl"))
    );
  } catch {
    return false;
  }
}

function chooseQuality() {
  const memory = navigator.deviceMemory;
  const cores = navigator.hardwareConcurrency;
  const narrow = window.matchMedia("(max-width: 900px)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches;

  // deviceMemory and hardwareConcurrency are absent on some browsers, which
  // is why both tests are written to pass when the value is undefined:
  // "unknown" should not be treated as "weak".
  if ((memory !== undefined && memory <= 4) || (cores !== undefined && cores <= 4)) return "low";
  if (narrow || coarse) return "low";
  return "high";
}

function boot() {
  const container = document.querySelector("[data-apollo-stage]");
  if (!container) return;

  const canvas = container.querySelector("canvas");
  if (!canvas) return;

  // Respect an explicit request for less data. A megabyte and a half of
  // planet is exactly the kind of thing this setting exists to decline.
  if (navigator.connection && navigator.connection.saveData) {
    container.dataset.apolloState = "declined";
    return;
  }

  if (!webglAvailable()) {
    container.dataset.apolloState = "unsupported";
    return;
  }

  let scene;
  try {
    scene = createApolloScene(canvas, {
      container,
      quality: chooseQuality(),
    });
  } catch (error) {
    console.warn("Apollo layer failed to start:", error);
    container.dataset.apolloState = "unsupported";
    return;
  }

  container.dataset.apolloState = "loading";

  scene.ready
    .then(() => {
      container.dataset.apolloState = prefersReducedMotion ? "still" : "ready";
    })
    .catch((error) => {
      console.warn("Apollo layer could not load its textures:", error);
      container.dataset.apolloState = "unsupported";
      scene.destroy();
    });

  // A handle on the running scene. It exists because this scene is driven
  // by an animation loop and a scroll position, and neither is available
  // when checking a frame from a script — being able to ask for mission
  // progress 0.42 and get one synchronously drawn frame back is the only
  // way to inspect the middle of the sequence without scrolling to it.
  window.__apollo = scene;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
