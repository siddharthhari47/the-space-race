// The atrium — homepage behaviour.
//
// Three jobs: run the hero environment, let the two gateways bias it, and
// reveal sections as they come into view. Nothing here is load-bearing for
// content — with JavaScript off the page is still a complete, readable
// directory, which is the standard a homepage should meet.

import { mountHeroVertical } from "../experiences/hero-vertical.js";
import { SIMULATOR_REGISTRY } from "../simulators/registry.js";

/* ---------- Hero environment ---------- */

let focus = "none";

const canvas = document.getElementById("hero-canvas");
if (canvas) {
  mountHeroVertical(canvas, { getFocus: () => focus });
}

// Gateways bias the scene rather than switching it. Pointer and keyboard
// focus both count, so tabbing through the page drives the same behaviour
// a mouse does.
const gateways = Array.from(document.querySelectorAll("[data-gateway]"));
for (const gw of gateways) {
  const world = gw.dataset.gateway;
  const enter = () => {
    focus = world;
    document.body.dataset.heroFocus = world;
  };
  const leave = () => {
    if (focus === world) {
      focus = "none";
      delete document.body.dataset.heroFocus;
    }
  };
  gw.addEventListener("mouseenter", enter);
  gw.addEventListener("mouseleave", leave);
  gw.addEventListener("focusin", enter);
  gw.addEventListener("focusout", leave);
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
