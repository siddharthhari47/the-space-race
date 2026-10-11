// The terminal count, as DOM.
//
// This is the one piece of the Apollo layer that is not drawn in WebGL, and
// deliberately so. It is small type on a dark sky, it has to stay crisp at
// any pixel ratio, and it must not cost a texture upload or a draw call --
// all three of which point at the browser's own text rasteriser rather than
// at the canvas.
//
// It is also the only part of the layer the visitor is *meant* to notice
// immediately. Everything else in this folder is built to be discovered
// ("wait, is there a rocket launching in the corner?"). The count is the
// promise that the discovery is coming, which is why it sits in the empty
// sky above the limb where nothing else is, and why it leaves completely
// once the promise has been kept.
//
// Pure display model first, DOM second, so tools/apollo-mission-check.mjs
// can assert against the model under Node without a document in the room.

import { getSecondsAt } from "./flight.js";
import { clamp, smootherstep } from "./mission.js";

/* =========================================================================
   THE COMMENTARY
   =========================================================================

   Jack King's launch commentary, as Public Affairs Officer, transcribed in
   NASA's own "Apollo 11 Highlights, Day 1" -- the PAO/CAPCOM/spacecraft
   transcript published at
   nasa.gov/wp-content/uploads/2015/03/Apollo-11_Day-01-Highlights.pdf.
   Every line below is quoted from the single unbroken PAO paragraph that
   runs from thirty seconds to tower clear, split at the seconds the calls
   were made rather than run as a block, so each one appears when it was
   said.

   Not all of it is used. King's commentary is mostly him reading the clock
   aloud -- "T minus 25 seconds", "20 seconds and counting" -- and next to a
   clock that is already showing the number, those lines are at best
   redundant and at worst wrong: the caption is written at the second the
   call was made and then stays up while the count keeps running, so a
   first pass at this had "T minus 25 seconds." sitting under digits
   reading 21. The lines kept are the ones that say something the clock
   cannot. Each is a complete sentence lifted whole out of the paragraph;
   none is edited, joined or reworded.

   Two details are reproduced rather than tidied, because tidying them
   would be editing a primary source to read better:

   - "All engines running", plural, and "Ignition sequence starts". The
     line is very widely quoted as "all engine running" and "ignition
     sequence start", and that popular rendering is what this file was
     first written with. NASA's transcript has neither. The transcript
     wins.

   - Eight and seven are missing from the spoken count: it reads
     "12, 11, 10, 9. Ignition sequence starts. 6, 5, 4, 3, 2, 1, 0."
     King filled those two seconds with the call instead of the numbers.
     The clock here still passes through 8 and 7 -- it is a clock -- but
     no call is attached to them, which is exactly the gap on the tape.

   The opening line is not a quotation. Nothing in the transcript covers
   T-60 to T-30, so rather than invent commentary to fill it, the caption
   states the launch epoch, which is cited on /references/ already.

   Source is recorded on /references/. */

const LAUNCH_EPOCH_CAPTION = "16 July 1969, 13:32:00 GMT";

const CALLS = [
  { from: -Infinity, to: -30.0, text: LAUNCH_EPOCH_CAPTION },
  { from: -30.0, to: -15.0, text: "Astronauts report it feels good." },
  { from: -15.0, to: -9.0, text: "Guidance is internal." },
  { from: -9.0, to: -6.0, text: "Ignition sequence starts." },
  // -6 to 0 is the spoken count itself. The digits carry it; a caption
  // under a number that already reads "3" would only be saying it twice.
  { from: -6.0, to: 0.0, text: "" },
  { from: 0.0, to: 9.0, text: "All engines running. Liftoff!" },
  { from: 9.0, to: 40.0, text: "We have a liftoff, 32 minutes past the hour, liftoff on Apollo 11." },
  { from: 40.0, to: Infinity, text: "Tower cleared." },
];

export function callAt(seconds) {
  for (const c of CALLS) {
    if (seconds >= c.from && seconds < c.to) return c.text;
  }
  return "";
}

/* =========================================================================
   THE CLOCK
   ========================================================================= */

const pad2 = (n) => (n < 10 ? "0" + n : String(n));

/**
 * Ground elapsed time as Apollo wrote it: sign, then HH:MM:SS.
 *
 * The sign is a true minus (U+2212), not a hyphen. At the size this is set,
 * a hyphen next to a run of tabular digits reads as a word break.
 *
 * The two sides round in opposite directions, which is what a countdown
 * clock actually does. Going down it ceilings: "T-00:00:01" stays up for
 * the whole of the last second, right until the count reaches zero, which
 * is the second this entire element exists for. Flooring would show
 * "T-00:00:00" from t = -0.9 onwards, a full second of a stopped clock
 * while the vehicle is still held down. Coming up it floors, because
 * "T+00:00:01" should not appear before one second has elapsed.
 */
export function formatGET(seconds) {
  const negative = seconds < 0;
  const whole = negative ? Math.ceil(Math.abs(seconds)) : Math.floor(seconds);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  return (negative ? "T−" : "T+") + pad2(h) + ":" + pad2(m) + ":" + pad2(s);
}

/* =========================================================================
   THE DISPLAY MODEL
   =========================================================================

   One pure function of page progress. Everything the element shows -- the
   string, the caption, whether it is on screen at all, and how hard the
   digits are lit -- comes out of here, so the whole behaviour can be
   checked by arithmetic. */

// It goes away. A count that stayed would be a telemetry readout, and the
// brief is explicit that this layer is eye candy and not a dashboard. The
// fade starts after the liftoff call has had time to be read and finishes
// before the first-stage burn proper, so by the time there is a rocket to
// look at there is nothing sitting on top of it.
const FADE_FROM = 0.15;
const FADE_TO = 0.2;

// The last fifteen seconds are the reason anyone stays. The digits brighten
// into them and the tracking opens up, and that is the only "animation"
// here: no pulsing, no ticking sound, nothing that would turn it into a
// widget.
const TENSE_FROM = -15;
const TENSE_TO = 0;

export function countdownAt(p) {
  const x = clamp(p, 0, 1);
  const seconds = getSecondsAt(x);

  return {
    seconds,
    clock: formatGET(seconds),
    call: callAt(seconds),
    // Held at 1 until FADE_FROM so nothing dims while the count still means
    // something, then smootherstep out -- zero first and second derivative
    // at both ends, so it neither snaps on nor lands hard.
    opacity: 1 - smootherstep(FADE_FROM, FADE_TO, x),
    // 0 through most of the count, 1 at zero. Drives nothing but colour and
    // letter-spacing.
    tension: smootherstep(TENSE_FROM, TENSE_TO, clamp(seconds, TENSE_FROM, TENSE_TO)),
    lifted: seconds >= 0,
  };
}

/* =========================================================================
   THE ELEMENT
   =========================================================================

   Built here rather than written into index.html, on purpose. The markup is
   only truthful while the scene behind it is actually running: static
   markup would leave a count frozen at T-60 on any browser that declined
   the WebGL layer, promising a launch that is never going to happen.
   Nothing is added to the document until the scene says it is ready.

   The whole element is aria-hidden. A clock that changes on every scroll
   event is not something a screen reader should be made to read out, and
   the layer it belongs to is already aria-hidden for the same reason. */

export function createCountdown({ mount = document.body } = {}) {
  const root = document.createElement("div");
  root.className = "launch-count";
  root.dataset.launchCount = "";
  root.setAttribute("aria-hidden", "true");

  root.innerHTML =
    '<p class="launch-count-eyebrow">Apollo 11 &middot; Terminal count</p>' +
    '<p class="launch-count-clock" data-count-clock>T−00:01:00</p>' +
    '<p class="launch-count-call" data-count-call></p>';

  const clockEl = root.querySelector("[data-count-clock]");
  const callEl = root.querySelector("[data-count-call]");

  // Last written values. The scene renders at the display's rate and the
  // clock changes about once a second, so without this the element would
  // take sixty style recalculations to make one visible change.
  let lastClock = null;
  let lastCall = null;
  let lastOpacity = -1;
  let lastTension = -1;
  let lastLifted = null;

  mount.appendChild(root);

  function set(p) {
    const d = countdownAt(p);

    if (d.clock !== lastClock) {
      clockEl.textContent = d.clock;
      lastClock = d.clock;
    }
    if (d.call !== lastCall) {
      callEl.textContent = d.call;
      lastCall = d.call;
    }
    // Quantised before comparison: an opacity that differs in the fourth
    // decimal is not a change anyone can see, but it is still a write.
    const o = Math.round(d.opacity * 100) / 100;
    if (o !== lastOpacity) {
      root.style.opacity = String(o);
      // Once it is gone it is really gone. An invisible fixed element over
      // the page is still a compositing layer.
      root.style.visibility = o <= 0 ? "hidden" : "visible";
      lastOpacity = o;
    }
    const t = Math.round(d.tension * 20) / 20;
    if (t !== lastTension) {
      root.style.setProperty("--count-tension", String(t));
      lastTension = t;
    }
    if (d.lifted !== lastLifted) {
      root.dataset.lifted = String(d.lifted);
      lastLifted = d.lifted;
    }
    return d;
  }

  set(0);

  return {
    element: root,
    set,
    destroy() {
      root.remove();
    },
  };
}
