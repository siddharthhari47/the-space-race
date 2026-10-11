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

/* Opt-in guided tour. Native scrolling remains the only input to Apollo.
   A wheel/touch/key gesture gives control straight back to the visitor. */
const tourStart = document.querySelector('[data-tour-start]');
const tourControls = document.querySelector('[data-tour-controls]');
if (tourStart && tourControls) {
  const toggle = tourControls.querySelector('[data-tour-toggle]');
  const status = tourControls.querySelector('[data-tour-status]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let running = false, frame = 0, previous = 0, speed = 0;
  const destination = () => {
    const end = document.querySelector('[data-mission-end]');
    return Math.min(document.documentElement.scrollHeight - innerHeight,
      end ? end.getBoundingClientRect().top + scrollY - 90 : 0);
  };
  const pause = (message = 'Paused · scroll to explore, or resume') => {
    running = false;
    cancelAnimationFrame(frame);
    previous = 0;
    toggle.textContent = 'Resume tour';
    status.textContent = message;
  };
  const tick = now => {
    if (!running) return;
    const dt = previous ? Math.min((now - previous) / 1000, .05) : 0;
    previous = now;
    const end = destination();
    if (scrollY >= end - 2) {
      pause('The Moon. Worth the detour.');
      toggle.hidden = true;
      return;
    }
    scrollTo({ top: Math.min(end, scrollY + speed * dt), behavior: 'instant' });
    frame = requestAnimationFrame(tick);
  };
  const resume = () => {
    if (reduced.matches) {
      pause('Use the chapter links to explore without autoplay.');
      return;
    }
    running = true;
    previous = 0;
    speed = Math.max(20, destination() / 180);
    toggle.hidden = false;
    toggle.textContent = 'Pause tour';
    status.textContent = 'Apollo 11 · Autopilot on · Scroll to take over';
    frame = requestAnimationFrame(tick);
  };
  const updateMotion = () => {
    if (reduced.matches) {
      tourStart.textContent = 'Explore the Saturn V →';
      document.querySelector('[data-tour-hint]').textContent =
        'Motion reduced. Jump to the Saturn V, then explore the Moon at your own pace.';
      if (running) pause('Autopilot paused for reduced motion.');
    }
  };
  updateMotion();
  reduced.addEventListener('change', updateMotion);
  tourStart.addEventListener('click', event => {
    if (reduced.matches) return; // Keep the ordinary anchor fallback.
    event.preventDefault();
    pause();
    tourControls.hidden = false;
    resume();
    toggle.focus({ preventScroll: true });
  });
  toggle.addEventListener('click', () => running ? pause() : resume());
  tourControls.querySelector('[data-tour-end]').addEventListener('click', () => {
    pause();
    tourControls.hidden = true;
    // Keep the current view; do not throw the visitor back to the top.
    const main = document.querySelector('main');
    main.tabIndex = -1;
    main.focus({ preventScroll: true });
  });
  for (const name of ['wheel', 'touchstart']) {
    addEventListener(name, () => { if (running) pause(); }, { passive: true });
  }
  addEventListener('keydown', event => {
    if (running && ['ArrowDown','ArrowUp','PageDown','PageUp','Home','End','Escape',' '].includes(event.key)) pause();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && running) pause('Paused while you were away');
  });
  addEventListener('pagehide', () => pause());
}
