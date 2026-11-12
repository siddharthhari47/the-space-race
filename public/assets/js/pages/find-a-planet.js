// Find a planet — page controller.
//
// The exercise is a chain of steps, one visible in the panel at a time:
//
//   predict -> l1-find -> l1-measure -> l2-find -> l3-raw -> l3-fold -> done
//
// and then the results section below the exhibit, which scores the two
// predictions and lists the visitor's three planets next to real ones.
//
// The predictions come first and are not shown again until the end. They are
// questions about Jupiter and Earth crossing the Sun, and level 1 is a
// Jupiter-size planet crossing a Sun-size star, so a visitor who measures
// level 1 carefully has already found the first answer by the time it is
// scored. That is the point of asking first.
//
// Every number comes from systems/transit.js: the light curves, the depths,
// what counts as a dip, the period, the stacked result. This file decides what
// to show and when, turns pointer positions into times and brightnesses with
// the canvas module's mapping, and formats.

import { mountFindPlanet } from "../experiences/find-a-planet.js";
import { prefersReducedMotion } from "../systems/stage.js";
import * as T from "../systems/transit.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// A fingertip is about 44 CSS pixels across, so a tap that lands within 22 px
// of a dip's edge counts as on it. On a phone level 1's half-day dip is only
// a few pixels wide and would otherwise be a hard target for no good reason.
const FINGER_PX = 22;
// Stacking speed for the Play button, in transits per second: all 33 in about
// four seconds, slow enough to watch the dip come up.
const STACK_RATE = 8;

const curves = {
  one: T.makeLevel("one"),
  two: T.makeLevel("two"),
  three: T.makeLevel("three"),
};
const P3 = T.LEVELS.three.planet;
const N3 = curves.three.transits.length;

const s = {
  step: "predict",
  pred: { jupiter: null, earth: null },
  cursor: NaN,
  marks: [],
  misses: 0,
  hint: false,
  found1: -1,
  line: 0.003,
  measured1: null,
  sel2: [],
  result2: null,
  count: 1,
  countF: 1,
  period: P3.period,
  playing: false,
  planets: { A: null, B: null, C: null },
  finished: false,
};

const live = $("[data-live]");
const status = $("[data-status]");
const canvas = $("#planet-canvas");
const stageEl = $(".fp-stage");

const STATUS = {
  predict: "Predict", "l1-find": "Level 1", "l1-measure": "Level 1", "l2-find": "Level 2",
  "l3-raw": "Level 3", "l3-fold": "Level 3", done: "Done",
};

const say = (text) => { if (live) live.textContent = text; };
const fmtKm = (km) => `${T.km(km)} km`;
const earthR = (km) => km / T.R_EARTH_KM;
const jupR = (km) => km / T.R_JUPITER_KM;

/* ---------- Fold cache ----------

   Folding 19,200 readings is cheap once but not sixty times a second, and the
   stacking view is redrawn every frame while it animates. The result only
   changes with the period or the count, so it is kept until one of those
   moves. */
// Three-hour bins: at 33 stacked each holds about 200 readings, so a bin wanders
// by about 18 ppm against a dip of 84. Two-hour bins wandered by 22 and the
// dip did not read as a dip.
const BIN_DAYS = 1 / 8;
// Zoomed to the size of the dip: the stack is hard to read on a range that
// also has to hold single readings 400 ppm out.
const FOLD_Y = [-0.00018, 0.0001];
let foldKey = "";
let foldCache = null;
function folded() {
  const key = `${s.period.toFixed(3)}|${s.count}`;
  if (key !== foldKey) {
    foldKey = key;
    // Cut by time from the planted period, not by orbit count of the trial
    // period, so "N stacked" is the first N real crossings at any period.
    const until = P3.t0 + (s.count - 0.5) * P3.period;
    const f = T.fold(curves.three, { period: s.period, t0: P3.t0, until, window: 1, binDays: BIN_DAYS });
    const d = T.stackedDepth(curves.three, { period: s.period, t0: P3.t0, until, duration: P3.duration, ingress: P3.ingress });
    foldCache = { ...f, period: s.period, t0: P3.t0, count: s.count, depth: d };
  }
  return foldCache;
}

/* ---------- What the canvas draws ---------- */

function canvasState() {
  switch (s.step) {
    case "predict":
      return { mode: "intro" };
    case "l1-find":
    case "l1-measure":
      return {
        mode: "raw", curve: curves.one, yRange: [-0.02, 0.006], unit: "pct",
        title: "Level 1: 10 days",
        marks: s.marks, cursor: s.step === "l1-find" ? s.cursor : NaN, hint: s.hint,
        level: s.step === "l1-measure" ? -s.line : NaN,
        levelLabel: `your line: ${T.pct(s.line)} dimmer`,
      };
    case "l2-find": {
      let span = null;
      if (s.result2) {
        const [a, b] = s.sel2.map((i) => curves.two.transits[i]).sort((x, y) => x - y);
        span = {
          a, b, ok: s.result2.ok,
          label: s.result2.ok ? `${s.result2.gap.toFixed(1)} days` : `${s.result2.gap.toFixed(1)} days, not one orbit`,
        };
      }
      return {
        mode: "raw", curve: curves.two, yRange: [-0.008, 0.004], unit: "pct",
        title: "Level 2: 20 days",
        marks: s.marks, cursor: s.cursor, hint: s.hint, span,
      };
    }
    case "l3-raw":
      return {
        mode: "raw", curve: curves.three, yRange: [-0.0012, 0.0009], unit: "ppm",
        title: "Level 3: 400 days", ticks: true,
      };
    case "l3-fold":
    case "done": {
      const F = folded();
      const d = F.depth;
      const clear = d.depth > 3 * d.err;
      return {
        mode: "fold", curve: curves.three, fold: F,
        title: "Level 3: stacking",
        foldTitle: `${s.count} of ${N3} stacked, folded at ${s.period.toFixed(2)} days`,
        stripRange: [-0.0012, 0.0009], yRange: FOLD_Y,
        clear, halfDuration: P3.duration / 2,
        measured: d.depth,
        measuredLabel: clear ? `dip ${T.ppm(d.depth)} ppm` : "",
      };
    }
    default:
      return null;
  }
}

const mount = mountFindPlanet(canvas, { getState: canvasState, onFrame: tick });

function describeCanvas() {
  if (!canvas) return;
  const st = canvasState();
  let label = "";
  if (st.mode === "intro") {
    label = "The Sun drawn as a yellow disc, with Jupiter and Earth in front of it at their true sizes. Jupiter is a small black disc; Earth is a dot about a pixel across.";
  } else if (st.mode === "raw") {
    const c = st.curve;
    label = `Simulated light curve: ${c.n.toLocaleString("en-GB")} brightness readings over ${c.days} days.`;
    if (s.step === "l3-raw") label += " The readings look like a flat band of noise.";
    const ok = s.marks.filter((m) => m.ok).length;
    if (ok) label += ` ${ok} dip${ok === 1 ? "" : "s"} marked.`;
    if (Number.isFinite(st.level)) label += ` Your line is at ${T.pct(s.line)} dimmer.`;
  } else {
    const d = st.fold.depth;
    label = `Simulated light curve folded at ${s.period.toFixed(2)} days with ${s.count} of ${N3} transits stacked. ` +
      (d.depth > 3 * d.err ? `The stacked dip is ${T.ppm(d.depth)} parts per million deep.` : "No clear dip stands out of the noise.");
  }
  canvas.setAttribute("aria-label", label);
}

function redraw() {
  describeCanvas();
  mount.redraw();
}

// Focus alone does not scroll here (preventScroll, so a tap does not jump the
// page), which left keyboard focus on a heading above or below the screen.
// Bring the focused element into view, and clear of the plot when it is
// pinned to the top of a phone screen.
function reveal(el) {
  el.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion ? "auto" : "smooth" });
}

function show(step, focusSel) {
  s.step = step;
  for (const el of $$(".fp-step")) el.hidden = el.dataset.step !== step;
  if (status) status.textContent = STATUS[step] || "";
  // The plot takes a drag only while the measuring line is up. Everywhere
  // else a finger on the canvas should still scroll the page.
  stageEl?.toggleAttribute("data-drag", step === "l1-measure");
  // On a phone the plot stays at the top of the screen while the sliders
  // under it are moved, on the steps that have sliders.
  stageEl?.toggleAttribute("data-sticky", step === "l1-find" || step === "l2-find" || step === "l3-fold" || step === "l1-measure");
  const play = $("[data-play]");
  if (play && !s.playing) play.textContent = prefersReducedMotion ? "Add 8 more" : "Play";
  if (focusSel) {
    const target = $(`[data-step="${step}"] ${focusSel}`);
    if (target) {
      target.focus({ preventScroll: true });
      reveal(target);
    }
  }
  redraw();
}

/* ---------- Predictions ---------- */

for (const btn of $$("[data-q]")) {
  btn.addEventListener("click", () => {
    const q = btn.dataset.q;
    s.pred[q] = Number(btn.dataset.v);
    for (const b of $$(`[data-q="${q}"]`)) b.setAttribute("aria-pressed", String(b === btn));
    const ready = s.pred.jupiter !== null && s.pred.earth !== null;
    const start = $("[data-start]");
    if (start) start.disabled = !ready;
    say(`Your guess for ${q === "jupiter" ? "Jupiter" : "Earth"}: ${choiceText(s.pred[q])}.`);
  });
}

$("[data-start]")?.addEventListener("click", () => {
  for (const b of $$("[data-q]")) b.disabled = true;
  startLevel1();
});

/* ---------- Finding dips ---------- */

function resetFind() {
  s.marks = [];
  s.misses = 0;
  s.hint = false;
  s.cursor = NaN;
  for (const el of $$("[data-hint], [data-showme]")) el.hidden = true;
}

function startLevel1() {
  resetFind();
  s.found1 = -1;
  $("[data-found]").hidden = true;
  $('[data-step="l1-find"] [data-mark]').disabled = false;
  show("l1-find", ".fp-q");
  say("Level 1. Ten days of readings. Tap the dip, or move the time slider to it and press Mark a dip here.");
}

function curveFor(step) {
  return step === "l2-find" ? curves.two : curves.one;
}

// A tap or a keyboard mark at time t. slackDays is how far outside a dip it
// may land and still count.
function markAt(t, slackDays) {
  if (s.step !== "l1-find" && s.step !== "l2-find") return;
  if (s.step === "l1-find" && s.found1 >= 0) return;
  const c = curveFor(s.step);
  const i = T.dipAt(c, t, slackDays);
  if (i < 0) {
    s.misses++;
    s.marks = s.marks.filter((m) => m.ok).concat([{ t, ok: false }]);
    if (s.misses >= 1) for (const el of $$(`[data-step="${s.step}"] [data-showme]`)) el.hidden = false;
    say(`No dip at day ${t.toFixed(1)}. The readings there are just scatter.`);
    redraw();
    return;
  }
  if (s.step === "l1-find") foundLevel1(i);
  else toggleLevel2(i);
}

function foundLevel1(i) {
  const c = curves.one;
  s.found1 = i;
  s.marks = [{ t: c.transits[i], ok: true, label: "dip" }];
  s.hint = false;
  $('[data-step="l1-find"] [data-hint]').hidden = true;
  $('[data-step="l1-find"] [data-showme]').hidden = true;
  $('[data-step="l1-find"] [data-mark]').disabled = true;
  const box = $("[data-found]");
  box.hidden = false;
  $("[data-found-text]").textContent =
    `That's it, centred on day ${c.transits[i].toFixed(1)}. For about ${Math.round(c.planet.duration * 24)} hours ` +
    "the star got dimmer and then came back. Nothing else in these ten days does that.";
  say(`Found. The dip is centred on day ${c.transits[i].toFixed(1)}.`);
  const nb = box.querySelector("button");
  if (nb) { nb.focus({ preventScroll: true }); reveal(nb); }
  redraw();
}

function toggleLevel2(i) {
  const c = curves.two;
  if (s.sel2.includes(i)) s.sel2 = s.sel2.filter((x) => x !== i);
  else s.sel2 = s.sel2.concat([i]).slice(-2);
  s.marks = s.sel2.map((k) => ({ t: c.transits[k], ok: true }))
    .sort((a, b) => a.t - b.t)
    .map((m, n) => ({ ...m, label: `dip ${String.fromCharCode(65 + n)}` }));
  s.hint = false;
  $('[data-step="l2-find"] [data-hint]').hidden = true;
  const box = $("[data-period]");
  const text = $("[data-period-text]");
  const next = $("[data-to-l3]");
  if (s.sel2.length < 2) {
    s.result2 = null;
    box.hidden = true;
    say(`Dip marked at day ${c.transits[i].toFixed(1)}. Mark one next to it.`);
    redraw();
    return;
  }
  const r = T.periodFromMarks(c, s.sel2[0], s.sel2[1]);
  s.result2 = r;
  box.hidden = false;
  if (r.ok) {
    const d = T.stackedDepth(c, { ...c.planet, period: r.period });
    const rk = T.radiusFromDepth(d.depth);
    s.planets.B = { radiusKm: rk, depth: d.depth, periodDays: r.period };
    box.dataset.state = "good";
    text.textContent =
      `The dips you picked are centred on day ${Math.min(...s.sel2.map((k) => c.transits[k])).toFixed(1)} and day ` +
      `${Math.max(...s.sel2.map((k) => c.transits[k])).toFixed(1)}: ${r.period.toFixed(1)} days from one dip to the next, so this planet goes round its star once every ` +
      `${r.period.toFixed(1)} days. Its year is ${r.period.toFixed(1)} days long. The dips are all the same depth, ` +
      `${T.pct(d.depth)} on average, which gives the planet a radius of about ${fmtKm(rk)}, ` +
      `${earthR(rk).toFixed(1)} times Earth's.`;
    next.hidden = false;
    say(`Period ${r.period.toFixed(1)} days.`);
  } else {
    box.dataset.state = "bad";
    text.textContent =
      `These two are ${r.gap.toFixed(1)} days apart, but there ${r.between === 1 ? "is a dip" : `are ${r.between} dips`} ` +
      `between them, so that gap is ${r.between + 1} orbits, not one. A period has to be read from two dips ` +
      "that follow each other. Mark a dip next to one of these.";
    next.hidden = true;
    say(`Not neighbours. There ${r.between === 1 ? "is a dip" : `are ${r.between} dips`} in between.`);
  }
  redraw();
}

for (const btn of $$("[data-mark]")) {
  btn.addEventListener("click", () => {
    const c = curveFor(s.step);
    // From the keyboard there is no finger, so the slack is one slider step
    // either side rather than 22 pixels.
    const t = Number.isFinite(s.cursor) ? s.cursor : c.start;
    markAt(t, 0.1);
  });
}

for (const btn of $$("[data-showme]")) {
  btn.addEventListener("click", () => {
    s.hint = true;
    const h = $(`[data-step="${s.step}"] [data-hint]`);
    if (h) {
      h.hidden = false;
      h.textContent = s.step === "l1-find"
        ? "Look inside the yellow band: a short run of readings all sitting lower than the rest."
        : "The yellow bands show where the dips are. Mark two next to each other.";
    }
    const days = curveFor(s.step).transits.map((t) => t.toFixed(1)).join(", ");
    say(`The dips are now shaded on the plot. They are centred on day ${days}.`);
    if (h) h.textContent += ` (Centred on day ${days}.)`;
    redraw();
  });
}

/* ---------- Measuring the depth ---------- */

$("[data-to-measure]")?.addEventListener("click", () => {
  $("[data-measured]").hidden = true;
  show("l1-measure", ".fp-q");
  lineReadouts();
  say("Drag the line to the bottom of the dip, or use the Line slider, then press Measure.");
});

// The planet's size is shown as the line moves, so dragging it past the dip
// and watching the planet swell beyond Jupiter is part of the exercise. The
// button only locks in the answer and shows the check.
function lineReadouts() {
  const rk = T.radiusFromDepth(s.line);
  $('[data-out="rkm"]').value = T.km(rk);
  $('[data-out="rj"]').value = jupR(rk);
  $('[data-out="re"]').value = earthR(rk);
}

function setLine(depth) {
  s.line = Math.min(0.02, Math.max(0, depth));
  const ctl = $('lab-control[name="line"]');
  if (ctl) ctl.value = Math.round(s.line * 1e4) / 100;
  lineReadouts();
  redraw();
}

$("[data-measure]")?.addEventListener("click", () => {
  const c = curves.one;
  const tc = c.transits[Math.max(0, s.found1)];
  const m = T.measureDip(c, tc);
  const rk = T.radiusFromDepth(s.line);
  s.measured1 = m;
  s.planets.A = { radiusKm: rk, depth: s.line, periodDays: null };
  lineReadouts();
  $("[data-formula]").textContent =
    `radius = star radius × √depth = ${T.km(T.R_SUN_KM)} km × √${s.line.toFixed(4)} = ${fmtKm(rk)}`;
  const off = Math.abs(s.line - m.depth) / m.depth;
  const v = $("[data-measure-verdict]");
  if (off <= 0.15) {
    v.dataset.state = "good";
    v.textContent = `Close. The readings in the flat bottom of the dip average ${T.pct(m.depth)} dimmer, and your line is at ${T.pct(s.line)}.`;
  } else {
    v.dataset.state = "warn";
    v.textContent = `The readings in the flat bottom of the dip average ${T.pct(m.depth)} dimmer; your line is at ${T.pct(s.line)}. ` +
      (s.line > m.depth ? "Aim for the middle of the low readings, not the lowest one." : "The bottom of the dip is lower than that.") +
      " Move it and measure again, or carry on.";
  }
  $("[data-measured]").hidden = false;
  say(`Planet radius ${fmtKm(rk)}, ${jupR(rk).toFixed(2)} times Jupiter's.`);
  redraw();
});

$("[data-to-l2]")?.addEventListener("click", () => {
  resetFind();
  s.sel2 = [];
  s.result2 = null;
  $("[data-period]").hidden = true;
  show("l2-find", ".fp-q");
  say("Level 2. Twenty days and several dips. Mark two dips that are next to each other.");
});

$("[data-to-l3]")?.addEventListener("click", () => {
  show("l3-raw", ".fp-q");
  say("Level 3. Four hundred days. The planet's crossings are marked with ticks, but the dips cannot be seen.");
});

/* ---------- Stacking ---------- */

function setCount(n) {
  s.count = Math.max(1, Math.min(N3, Math.round(n)));
  const ctl = $('lab-control[name="count"]');
  if (ctl && ctl.value !== s.count) ctl.value = s.count;
  updateFoldReadouts();
}

function updateFoldReadouts() {
  const d = folded().depth;
  $('[data-out="depth"]').value = T.ppm(d.depth);
  $('[data-out="err"]').value = T.ppm(d.err);
  // No radius until there is a dip to take one from.
  $('[data-out="rc"]').value = d.depth > 3 * d.err ? earthR(T.radiusFromDepth(d.depth)) : "–";
  const note = $("[data-fold-note]");
  const sig = d.depth / d.err;
  const wrong = Math.abs(s.period - P3.period) > 0.005;
  if (note) {
    if (wrong && sig < 3) {
      note.textContent = `Folded at ${s.period.toFixed(2)} days the crossings drift apart from one orbit to the next and land in different places, so they no longer add up. The dip is gone.`;
    } else if (sig < 3) {
      note.textContent = `With ${s.count} stacked, the noise in the average is still about ${T.ppm(d.err)} ppm, as big as the dip. Keep stacking.`;
    } else {
      note.textContent = `With ${s.count} stacked the noise in the average is down to about ${T.ppm(d.err)} ppm, and a dip of ${T.ppm(d.depth)} ppm stands clear of it.`;
    }
  }
  redraw();
}

$("[data-stack]")?.addEventListener("click", () => {
  s.period = P3.period;
  const pc = $('lab-control[name="period"]');
  if (pc) pc.value = s.period;
  setCount(1);
  show("l3-fold", ".fp-q");
  say("One transit stacked. Press Play, or move the Transits stacked slider, to add the rest.");
});

function setPlaying(on) {
  s.playing = on;
  const b = $("[data-play]");
  if (b) b.textContent = on ? "Pause" : (prefersReducedMotion ? "Add 8 more" : "Play");
}

$("[data-play]")?.addEventListener("click", () => {
  if (s.playing) { setPlaying(false); return; }
  if (prefersReducedMotion && s.count >= N3) setCount(1);
  // Under reduced motion there is no animation: all the transits go in at
  // once and the result is shown straight away.
  if (prefersReducedMotion) {
    // Eight at a time, so the dip still builds up in steps.
    setCount(Math.min(N3, s.count + 8));
    say(s.count >= N3 ? `All ${N3} transits stacked.` : `${s.count} of ${N3} transits stacked.`);
    return;
  }
  if (s.count >= N3) setCount(1);
  s.countF = s.count;
  setPlaying(true);
});

function tick(dt) {
  if (!s.playing) return;
  s.countF += dt * STACK_RATE;
  const n = Math.min(N3, Math.floor(s.countF));
  if (n !== s.count) setCount(n);
  if (n >= N3) {
    setPlaying(false);
    say(`All ${N3} transits stacked.`);
  }
}

document.addEventListener("lab-input", (e) => {
  const { name, value } = e.detail;
  if (name === "t1" || name === "t2") { s.cursor = value; redraw(); }
  else if (name === "line") { s.line = value / 100; lineReadouts(); redraw(); }
  else if (name === "count") { setPlaying(false); s.count = value; updateFoldReadouts(); }
  else if (name === "period") { s.period = value; updateFoldReadouts(); }
});

$("[data-finish]")?.addEventListener("click", () => {
  setPlaying(false);
  // Planet C is the stack at the planted period with every transit, whatever
  // the sliders were left on, so a visitor who ends on a wrong period still
  // gets the planet they found on the way.
  const d = T.stackedDepth(curves.three, { ...P3 });
  s.planets.C = { radiusKm: T.radiusFromDepth(d.depth), depth: d.depth, periodDays: P3.period, err: d.err };
  s.period = P3.period;
  const pc = $('lab-control[name="period"]');
  if (pc) pc.value = s.period;
  setCount(N3);
  s.finished = true;
  showResults();
  show("done", ".fp-q");
  say("Three planets found. The results are below the exhibit.");
});

$("[data-restart]")?.addEventListener("click", () => {
  s.pred = { jupiter: null, earth: null };
  for (const b of $$("[data-q]")) { b.disabled = false; b.setAttribute("aria-pressed", "false"); }
  $("[data-start]").disabled = true;
  s.planets = { A: null, B: null, C: null };
  s.finished = false;
  $("#results").hidden = true;
  show("predict", ".fp-q");
});

/* ---------- Pointer ----------

   A tap on the plot marks a dip; in the measuring step a press or drag moves
   the line. Taps are read from pointerup with almost no movement, so a finger
   that starts on the canvas and scrolls the page does not also drop a mark. */

let press = null;
canvas?.addEventListener("pointerdown", (e) => {
  const r = canvas.getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;
  if (s.step === "l1-measure" && mount.inPlot(x, y)) {
    canvas.setPointerCapture?.(e.pointerId);
    press = { drag: true };
    setLine(-mount.levelAt(y));
    e.preventDefault();
    return;
  }
  press = { x, y, at: performance.now(), drag: false };
});

canvas?.addEventListener("pointermove", (e) => {
  if (!press?.drag) return;
  const r = canvas.getBoundingClientRect();
  setLine(-mount.levelAt(e.clientY - r.top));
});

canvas?.addEventListener("pointerup", (e) => {
  const p = press;
  press = null;
  if (!p || p.drag) return;
  const r = canvas.getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;
  if (Math.hypot(x - p.x, y - p.y) > 10 || performance.now() - p.at > 800) return;
  if (!mount.inPlot(x, y)) return;
  const t = mount.timeAt(x);
  if (t === null) return;
  s.cursor = t;
  const ctl = $(`[data-step="${s.step}"] lab-control[name^="t"]`);
  if (ctl) ctl.value = Math.round(t * 20) / 20;
  markAt(t, FINGER_PX * mount.daysPerPixel());
});

canvas?.addEventListener("pointercancel", () => { press = null; });

/* ---------- Results ---------- */

function sizeWord(ratio) {
  const n = ratio >= 10 ? Number(ratio.toPrecision(2)) : Math.round(ratio);
  return n.toLocaleString("en-GB");
}

// The choices as the buttons print them: 0.01%, 0.1%, 1%, 10%.
const choiceText = (x) => `${Number((x * 100).toPrecision(3))}%`;

function scorePrediction(key, name) {
  const truth = T.PREDICT[key];
  const guess = s.pred[key];
  const best = T.nearestChoice(truth);
  const el = $(`[data-score="${key}"]`);
  if (!el) return 0;
  const textEl = el.querySelector("[data-score-text]");
  if (guess === null) {
    el.dataset.state = "";
    textEl.textContent = `${name} crossing the Sun dims it by ${T.pct(truth)}. You skipped this one.`;
    return 0;
  }
  const f = T.factorOff(guess, truth);
  const right = guess === best;
  el.dataset.state = right ? "good" : "bad";
  const how = right
    ? "That was the closest choice."
    : `Your guess was about ${sizeWord(f > 1 ? f : 1 / f)} times too ${f > 1 ? "big" : "small"}; ${choiceText(best)} was the closest choice.`;
  textEl.textContent = `You said ${choiceText(guess)}. ${name} crossing the Sun dims it by ${T.pct(truth)}. ${how}`;
  return right ? 1 : 0;
}

function sizesSvg() {
  // Circles to scale: the visitor's three planets, Earth and Jupiter. The
  // biggest sets the scale; anything under a pixel is still drawn at one so
  // it can be seen, which is said in the caption.
  const items = [
    { name: "Earth", km: T.R_EARTH_KM, real: true },
    { name: "Jupiter", km: T.R_JUPITER_KM, real: true },
  ];
  for (const k of ["A", "B", "C"]) {
    if (s.planets[k]) items.push({ name: `Your ${k}`, km: s.planets[k].radiusKm });
  }
  items.sort((a, b) => a.km - b.km);
  const max = Math.max(...items.map((i) => i.km));
  const R = 56;
  const gap = 16;
  let x = 8;
  const parts = [];
  for (const it of items) {
    const r = Math.max(1.5, (it.km / max) * R);
    const w = Math.max(2 * r, 62);
    const cx = x + w / 2;
    parts.push(
      `<circle cx="${cx.toFixed(1)}" cy="${(8 + R).toFixed(1)}" r="${r.toFixed(1)}" class="${it.real ? "fp-c-real" : "fp-c-you"}"/>`,
      `<text x="${cx.toFixed(1)}" y="${(8 + 2 * R + 20).toFixed(1)}" text-anchor="middle">${it.name}</text>`,
    );
    x += w + gap;
  }
  const width = x - gap + 8;
  return `<svg viewBox="0 0 ${width.toFixed(0)} ${2 * R + 40}" role="img" aria-label="Circles to scale: ${items.map((i) => i.name).join(", ")}, from smallest to largest.">${parts.join("")}</svg>`;
}

function row(cells) {
  return `<tr>${cells.map((c, i) => `<${i === 0 ? "th scope=\"row\"" : "td"}${i > 0 ? ' class="num"' : ""}>${c}</${i === 0 ? "th" : "td"}>`).join("")}</tr>`;
}

function showResults() {
  const sec = $("#results");
  if (!sec) return;
  sec.hidden = false;
  const score = scorePrediction("jupiter", "Jupiter") + scorePrediction("earth", "Earth");
  const sl = $("[data-score-line]");
  if (sl) {
    const answered = (s.pred.jupiter !== null) + (s.pred.earth !== null);
    sl.textContent = answered ? `${score} of 2 predictions on the closest choice.` : "You skipped the predictions.";
  }

  const sizes = $("[data-sizes]");
  if (sizes) sizes.innerHTML = sizesSvg();

  const yours = [];
  const A = s.planets.A;
  const B = s.planets.B;
  const C = s.planets.C;
  const dash = "&mdash;";
  yours.push(row(["Your planet A (level 1)",
    A ? T.km(A.radiusKm) : "not measured", A ? earthR(A.radiusKm).toFixed(1) : dash,
    "unknown", A ? T.pct(A.depth) : dash, dash]));
  yours.push(row(["Your planet B (level 2)",
    B ? T.km(B.radiusKm) : "not found", B ? earthR(B.radiusKm).toFixed(1) : dash,
    B ? B.periodDays.toFixed(1) : dash, B ? T.pct(B.depth) : dash, dash]));
  yours.push(row(["Your planet C (level 3)",
    C ? T.km(C.radiusKm) : "not found", C ? earthR(C.radiusKm).toFixed(2) : dash,
    C ? C.periodDays.toFixed(1) : dash, C ? T.pct(C.depth) : dash, dash]));

  const solar = [
    ["Earth crossing the Sun", T.R_EARTH_KM, T.P_EARTH_D, T.PREDICT.earth],
    ["Jupiter crossing the Sun", T.R_JUPITER_KM, T.P_JUPITER_D, T.PREDICT.jupiter],
  ].map(([n, r, p, d]) => row([n, T.km(r), earthR(r).toFixed(2), p.toLocaleString("en-GB", { maximumFractionDigits: 1 }), dash, T.pct(d)]));

  const real = T.REAL_PLANETS.map((p) => {
    const rk = p.radiusEarth * T.R_EARTH_KM;
    const calc = T.depthFromRadii(rk, p.starRadiusSun * T.R_SUN_KM);
    const pd = p.periodDays < 10 ? p.periodDays.toFixed(2) : p.periodDays.toFixed(1);
    return row([p.name, T.km(rk), p.radiusEarth.toFixed(2), pd, `${p.depthPct}%`, T.pct(calc)]);
  });

  $("[data-table]").innerHTML =
    `<tr class="fp-sep"><th colspan="6" scope="rowgroup">Your planets (from simulated light curves)</th></tr>` + yours.join("") +
    `<tr class="fp-sep"><th colspan="6" scope="rowgroup">The Solar System</th></tr>` + solar.join("") +
    `<tr class="fp-sep"><th colspan="6" scope="rowgroup">Real exoplanets (NASA Exoplanet Archive)</th></tr>` + real.join("");

  const depthCopy = $('[data-copy="depth"]');
  if (depthCopy) {
    depthCopy.textContent =
      `A planet blocks the share of its star's disc that it covers, which is the square of its radius over the star's. ` +
      `Jupiter is ${T.km(T.R_JUPITER_KM)} km in radius and the Sun ${T.km(T.R_SUN_KM)} km, so Jupiter covers ` +
      `(${T.km(T.R_JUPITER_KM)} ÷ ${T.km(T.R_SUN_KM)})² = ${T.pct(T.PREDICT.jupiter)} of it. Earth, at ${T.km(T.R_EARTH_KM)} km, ` +
      `covers ${T.pct(T.PREDICT.earth)}, or ${T.ppm(T.PREDICT.earth)} parts per million: about ${Math.round(T.PREDICT.jupiter / T.PREDICT.earth)} times less, ` +
      `because Jupiter is ${(T.R_JUPITER_KM / T.R_EARTH_KM).toFixed(1)} times wider and the area goes as the square.`;
  }
}

$("[data-show-results]")?.addEventListener("click", () => {
  showResults();
});

window.__findPlanet = {
  state: s, T, curves, mount,
  show, markAt, setLine, setCount, showResults,
  measure: () => $("[data-measure]")?.click(),
};

show("predict");
