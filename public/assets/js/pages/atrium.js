// The atrium — homepage behaviour.
//
// Two jobs: reveal sections as they come into view, and keep the directory's
// own count of interactive exhibits honest. Nothing here is load-bearing for
// content — with JavaScript off the page is still a complete, readable
// directory, which is the standard a homepage should meet.
//
// The Apollo layer behind the page is not started from here. It is a
// separate bundled entry (assets/js/dist/apollo.js) with its own loading,
// capability and reduced-motion decisions to make, and it deliberately has
// no connection to anything in this file: if it never starts, nothing on
// this page notices.

import { SIMULATOR_REGISTRY } from "../simulators/registry.js";

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
