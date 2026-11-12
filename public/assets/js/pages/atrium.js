// The atrium — homepage behaviour.
//
// Two jobs: reveal sections as they come into view, and keep the directory's
// own counts honest. Nothing here is load-bearing for
// content — with JavaScript off the page is still a complete, readable
// directory, which is the standard a homepage should meet.
//
// The Apollo layer behind the page is not started from here. It is a
// separate bundled entry (assets/js/dist/apollo.js) with its own loading,
// capability and reduced-motion decisions to make, and it deliberately has
// no connection to anything in this file: if it never starts, nothing on
// this page notices.

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

   The directory quotes how many interactive pieces it lists. Hard-coding that
   number is how it ends up wrong three commits later, so count the rows that
   are actually on the page. The simulator registry is the wrong source: it
   also holds playground and mission pieces that this directory does not
   list, so its total never matched what a visitor could count. */

for (const [name, kind] of [['interactive', 'interactive'], ['written', 'written']]) {
  const el = document.querySelector(`[data-count-${name}]`);
  const rows = [...document.querySelectorAll('.directory .d-kind')]
    .filter((k) => k.textContent.trim().toLowerCase() === kind).length;
  if (el && rows > 0) el.textContent = String(rows);
}

/* Opt-in guided tour. Native scrolling remains the only input to Apollo.
   A wheel/touch/key gesture gives control straight back to the visitor. */
const tourStart = document.querySelector('[data-tour-start]');
const tourControls = document.querySelector('[data-tour-controls]');
if (tourStart && tourControls) {
  const toggle = tourControls.querySelector('[data-tour-toggle]');
  const status = tourControls.querySelector('[data-tour-status]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const exit = tourControls.querySelector('[data-tour-end]');
  let running = false, frame = 0, previous = 0, speed = 0;
  // Where the tour itself last put the page. A scroll event that lands
  // anywhere else was caused by the visitor (scrollbar drag, an anchor
  // link, Tab moving focus to something below the fold), and that is a
  // takeover even though no wheel, touch or key event announced it.
  let lastSet = 0;
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
      // The focused button was just hidden, which would drop focus to <body>
      // and send a keyboard visitor back to the top of the tab order.
      exit.focus({ preventScroll: true });
      return;
    }
    lastSet = Math.min(end, scrollY + speed * dt);
    scrollTo({ top: lastSet, behavior: 'instant' });
    frame = requestAnimationFrame(tick);
  };
  const resume = () => {
    if (reduced.matches) {
      pause('Autopilot is off for reduced motion. The route links under the title jump between chapters.');
      return;
    }
    running = true;
    previous = 0;
    speed = Math.max(20, destination() / 180);
    lastSet = scrollY;
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
  exit.addEventListener('click', () => {
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
  // Space on the focused Pause button is the button's own activation: the
  // browser clicks it on keyup. Pausing here on keydown as well made the
  // click see a stopped tour and resume it, so Space did nothing visible.
  addEventListener('keydown', event => {
    if (event.key === ' ' && tourControls.contains(event.target)) return;
    if (running && ['ArrowDown','ArrowUp','PageDown','PageUp','Home','End','Escape',' '].includes(event.key)) pause();
  });
  // Dragging the scrollbar fires pointerdown on the root element, outside
  // any content box. Links are caught here too, before the jump happens.
  addEventListener('pointerdown', event => {
    if (!running || tourControls.contains(event.target)) return;
    const root = document.documentElement;
    if (event.clientX >= root.clientWidth || event.clientY >= root.clientHeight
        || (event.target.closest?.('a[href]') && event.target.closest('a[href]') !== tourStart)) pause();
  }, { passive: true });
  // Enter on a focused link, or a click with no pointerdown before it.
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (running && link && link !== tourStart && !tourControls.contains(link)) pause();
  });
  addEventListener('scroll', () => {
    // The tour moves 1-5 px a frame, and a slow frame can deliver the scroll
    // event after the next step has been set, so the tolerance is generous.
    // Anything that is a takeover (scrollbar, anchor, focus jump) is far larger.
    if (running && Math.abs(scrollY - lastSet) > 40) pause();
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && running) pause('Paused while you were away');
  });
  addEventListener('pagehide', () => pause());
}
