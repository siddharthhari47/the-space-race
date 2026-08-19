// The atrium — homepage behaviour.
//
// Three jobs: run the hero environment, let the two gateways bias it, and
// reveal sections as they come into view. Nothing here is load-bearing for
// content — with JavaScript off the page is still a complete, readable
// directory, which is the standard a homepage should meet.

import { mountScrollLaunch } from "../experiences/scroll-launch.js";
import { SIMULATOR_REGISTRY } from "../simulators/registry.js";

/* ---------- Scroll-driven flagship ---------- */

const launchSequence = document.querySelector("[data-launch-sequence]");
const launchCanvas = document.getElementById("launch-canvas");
const launchReadout = document.querySelector("[data-launch-readout]");
const launchProgress = document.querySelector("[data-launch-progress]");

if (launchSequence && launchCanvas) {
  mountScrollLaunch(launchCanvas, launchSequence, {
    onProgress(progress, phase) {
      launchSequence.dataset.launchPhase = phase.key;
      launchSequence.style.setProperty("--launch-progress", progress.toFixed(4));
      if (launchReadout) {
        launchReadout.textContent = `${String(Math.round(progress * 100)).padStart(2, "0")}% / ${phase.label}`;
      }
      if (launchProgress) launchProgress.style.transform = `scaleX(${progress})`;
    },
  });
}

/* ---------- Scroll reveals ---------- */

const revealables = document.querySelectorAll(".reveal");
if (revealables.length) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target); // reveal once, never re-hide on scroll up
      }
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.05 }
  );
  revealables.forEach((el) => io.observe(el));
}

/* ---------- Live counts ----------

   The directory quotes how many interactive pieces exist. Hard-coding that
   number is how it ends up wrong three commits later, so read it from the
   registry that already knows. */

const built = Object.values(SIMULATOR_REGISTRY).filter((s) => s.status === "live").length;
const countEl = document.querySelector("[data-count-interactive]");
if (countEl && built > 0) countEl.textContent = String(built);
