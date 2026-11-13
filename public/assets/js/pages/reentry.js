// Bring it home — page controller.
//
// The exercise is a short chain of steps, one visible in the panel at a time:
//
//   predict -> l1-aim -> l2-lift -> compare -> done
//
// and then the results section below the exhibit, which scores the two
// predictions and puts the model's numbers next to the ones in the Apollo
// reports.
//
// The predictions come first and are not shown again until the end. The
// first is the width of the safe window with no steering, which is level 1's
// answer: a visitor who fires carefully has found it by the end of the level,
// and the results then say how close the guess was. That is the point of
// asking first.
//
// Every number comes from systems/reentry.js: the flights, the outcomes, the
// corridor edges. This file decides what to show and when, turns pointer
// positions into angles with the canvas module's mapping, and formats. Where
// the page prints a number from the model it says so, and where it prints a
// real mission number it names the report, because the two are easy to mix
// up and the exhibit is a simplified model, not a record of any flight.

import { mountReentry, STRIP_MIN, STRIP_MAX } from "../experiences/reentry.js";
import { prefersReducedMotion } from "../systems/stage.js";
import * as R from "../systems/reentry.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// How long a fired entry takes to draw, in seconds. A real entry takes six to
// thirteen minutes; a visitor who is homing in on an edge fires a dozen times,
// and two seconds each is as long as is worth watching.
const RUN_SECONDS = 2.2;
// Tries needed before the next step opens: enough to have seen the edges
// start to show, few enough that nobody is held up.
const MIN_SHOTS = 4;
// Level 2 opens on an angle that level 1 showed was too steep, so the first
// thing to try with the lift is the obvious thing, and it works.
const L2_START = 7.0;
const GHOSTS = 3;

const DEG = "°";
const MINUS = "−";

const s = {
  step: "predict",
  pred: { width: null, worse: null },
  angle: 6.5,
  angle2: L2_START,
  roll: 0,
  shots: [], // { level, angle, roll, outcome, peakG, peakHeat, vEnd, path }
  run: null, // the flight being drawn: { shot, path, at, peaks, done }
  corr: null, // { none, any, leoNone, leoAny } computed on the compare step
  leo: false,
  finished: false,
};

const live = $("[data-live]");
const status = $("[data-status]");
const canvas = $("#reentry-canvas");
const stageEl = $(".re-stage");

const STATUS = { predict: "Predict", "l1-aim": "Level 1", "l2-lift": "Level 2", compare: "Compare", done: "Done" };
const say = (text) => { if (live) live.textContent = text; };
const fmtDeg = (x, d = 2) => `${Math.abs(x).toFixed(d)}${DEG}`;
const fmtG = (x) => `${x.toFixed(1)} g`;
const num = (x) => Math.round(x).toLocaleString("en-GB");

/* ---------- The intro picture ----------

   One finished entry, so the prediction step has something to look at. Just
   one, and a skip at the edge of the level 1 range: showing a splashdown would
   name a safe angle before the visitor has fired once. */
const introRun = R.fly({ fpa: -4.0, mode: 0, sampleEvery: 2 });

/* ---------- What the canvas draws ---------- */

function levelShots(level) { return s.shots.filter((x) => x.level === level); }

function canvasState() {
  switch (s.step) {
    case "predict":
      return {
        mode: "intro",
        paths: [{ path: introRun.path, outcome: introRun.outcome, label: `4.0${DEG}: skipped out` }],
      };
    case "l1-aim":
    case "l2-lift": {
      const level = s.step === "l1-aim" ? 1 : 2;
      const r = s.run;
      let g = 0;
      let q = 0;
      let peak = 0;
      if (r) {
        const i = Math.min(r.path.length - 1, Math.floor(r.at));
        g = r.path[i].g;
        q = r.path[i].q;
        peak = r.peaks[i];
        if (r.done) { g = r.path[r.path.length - 1].g; }
      }
      return {
        mode: "flight",
        level,
        angle: level === 1 ? s.angle : s.angle2,
        run: r ? { path: r.path, at: r.at, done: r.done, outcome: r.shot.outcome } : null,
        g, q, peak,
        ghosts: levelShots(level).filter((x) => !(r && x === r.shot)).slice(-GHOSTS),
        marks: (level === 1 ? levelShots(1) : s.shots).filter((x) => !(r && x === r.shot && !r.done)),
        startLabel: "entry",
      };
    }
    case "compare":
    case "done":
      return { mode: "compare", rows: compareRows() };
    default:
      return null;
  }
}

const mount = mountReentry(canvas, { getState: canvasState, onFrame: tick });

function describeCanvas() {
  if (!canvas) return;
  let label = "";
  if (s.step === "predict") {
    label = "Side view of the Earth's curve, with the atmosphere as a thin shell. One model entry from the Moon, at 4 degrees below the horizon, skips back out of the atmosphere.";
  } else if (s.step === "l1-aim" || s.step === "l2-lift") {
    const level = s.step === "l1-aim" ? 1 : 2;
    const list = levelShots(level);
    label = `Side view of an entry, with a strip of your tries underneath. Aim: ${(level === 1 ? s.angle : s.angle2).toFixed(2)} degrees. ` +
      `${list.length} ${list.length === 1 ? "try" : "tries"} at this level.`;
    const last = list[list.length - 1];
    if (last) label += ` The last one ${wordFor(last.outcome)}.`;
  } else {
    label = "Bars showing which entry angles end in a safe splashdown.";
    const rows = compareRows();
    for (const r of rows) label += ` ${r.label}: ${r.open ? "no skip edge, " : `${fmtDeg(r.shallow)} to `}${fmtDeg(r.steep)}.`;
  }
  canvas.setAttribute("aria-label", label);
}

function redraw() {
  describeCanvas();
  mount.redraw();
}

function wordFor(outcome) {
  return outcome === "safe" ? "ended in a splashdown" : outcome === "over" ? "went over the 12 g limit" : "skipped back out";
}

/* ---------- Steps ---------- */

function reveal(el) {
  el.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion ? "auto" : "smooth" });
}

function show(step, focusSel) {
  s.step = step;
  for (const el of $$(".re-step")) el.hidden = el.dataset.step !== step;
  if (status) status.textContent = STATUS[step] || "";
  const flying = step === "l1-aim" || step === "l2-lift";
  // On the strip a sideways drag moves the aim, so a finger on the canvas
  // must not scroll the page while a flying step is up.
  stageEl?.toggleAttribute("data-drag", flying);
  stageEl?.toggleAttribute("data-sticky", flying);
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
    s.pred[q] = q === "width" ? Number(btn.dataset.v) : btn.dataset.v;
    for (const b of $$(`[data-q="${q}"]`)) b.setAttribute("aria-pressed", String(b === btn));
    const start = $("[data-start]");
    if (start) start.disabled = s.pred.width === null || s.pred.worse === null;
    say(`Your guess: ${btn.textContent.trim()}.`);
  });
}

$("[data-start]")?.addEventListener("click", () => {
  for (const b of $$("[data-q]")) b.disabled = true;
  show("l1-aim", ".re-q");
  say("Level 1. Set the angle and press Fire. Each try is marked on the strip under the picture.");
});

/* ---------- Firing ---------- */

// Finish the flight being drawn, if any, so it is recorded and its mark goes
// on the strip. Called when the animation ends, when the visitor fires again
// before it has, and when a step is left.
function finishRun() {
  const r = s.run;
  if (!r || r.done) return;
  r.at = r.path.length - 1;
  r.done = true;
  announce(r.shot);
  updateHints();
  redraw();
}

function fire(level) {
  finishRun();
  const angle = level === 1 ? s.angle : s.angle2;
  const roll = level === 1 ? 0 : s.roll;
  const res = R.fly({ fpa: -angle, mode: roll, sampleEvery: 1 });
  const shot = { level, angle, roll, outcome: res.outcome, peakG: res.peakG, peakHeat: res.peakHeat, vEnd: res.vEnd, path: res.path };
  s.shots.push(shot);
  // The running peak at each sample, so the g-meter can show "peak so far"
  // while the path is drawn.
  let m = 0;
  const peaks = res.path.map((p) => (m = Math.max(m, p.g)));
  s.run = { shot, path: res.path, at: 0, peaks, done: false };
  if (prefersReducedMotion) {
    // No animation: jump to the result.
    finishRun();
  } else {
    redraw();
  }
}

function tick(dt) {
  const r = s.run;
  if (!r || r.done) return;
  r.at += (dt * (r.path.length - 1)) / RUN_SECONDS;
  if (r.at >= r.path.length - 1) finishRun();
}

function announce(shot) {
  const level = shot.level;
  const el = $(level === 1 ? "[data-shot]" : "[data-shot2]");
  const rollText = level === 2 ? `, roll ${rollWord(shot.roll)}` : "";
  let msg;
  if (shot.outcome === "skip") {
    const why = level === 2 && shot.roll > 0
      ? "The lift pushed it back out: too much lift up for this angle."
      : "Too shallow.";
    msg = `${shot.angle.toFixed(2)}${DEG}${rollText}: skipped back out, still going ${(shot.vEnd / 1000).toFixed(1)} km/s. ${why}`;
  } else if (shot.outcome === "over") {
    const why = level === 2 && shot.roll < 0
      ? "The lift pulled it into thick air: too much lift down for this angle."
      : "Too steep.";
    msg = `${shot.angle.toFixed(2)}${DEG}${rollText}: peak load ${fmtG(shot.peakG)}, over the 12 g limit. ${why}`;
  } else {
    msg = `${shot.angle.toFixed(2)}${DEG}${rollText}: splashdown. Peak load ${fmtG(shot.peakG)}, peak heating ${num(shot.peakHeat)} W/cm² (model values).`;
  }
  if (el) {
    el.textContent = msg;
    el.dataset.state = shot.outcome;
  }
  say(msg);
}

function rollWord(f) {
  if (f === 0) return "none";
  const pct = Math.round(Math.abs(f) * 100);
  return `${f > 0 ? "up" : "down"} ${pct}%`;
}

/* ---------- Hints and gates ---------- */

// Name what has not been seen yet, then, once all three outcomes are on the
// strip, the gap each edge is still hiding in. The aim is that a visitor
// always knows what to try next without being told the answer.
function bracket(list) {
  const skips = list.filter((x) => x.outcome === "skip").map((x) => x.angle);
  const safes = list.filter((x) => x.outcome === "safe").map((x) => x.angle);
  const overs = list.filter((x) => x.outcome === "over").map((x) => x.angle);
  return { skips, safes, overs };
}

function updateHints() {
  const l1 = levelShots(1);
  const h1 = $("[data-hint]");
  if (h1) {
    const b = bracket(l1);
    let t = "";
    if (l1.length) {
      if (!b.skips.length) t = "No skip yet. Try a shallower angle, a smaller number.";
      else if (!b.overs.length) t = "Nothing over the limit yet. Try a steeper angle, a bigger number.";
      else if (!b.safes.length) t = "No splashdown yet. The safe angles are somewhere between your skips and your overs.";
      else {
        const sk = Math.max(...b.skips);
        const sf = Math.min(...b.safes);
        const sfMax = Math.max(...b.safes);
        const ov = Math.min(...b.overs);
        t = `The shallow edge is between ${sk.toFixed(2)}${DEG} and ${sf.toFixed(2)}${DEG}. The steep edge is between ${sfMax.toFixed(2)}${DEG} and ${ov.toFixed(2)}${DEG}. ` +
          `So the whole safe window is somewhere between ${(sfMax - sf).toFixed(2)}${DEG} and ${(ov - sk).toFixed(2)}${DEG} wide.`;
      }
    }
    h1.hidden = !t;
    h1.textContent = t;
  }
  const next1 = $("[data-to-l2]");
  if (next1) {
    const n = l1.filter((x) => x === s.run?.shot ? s.run.done : true).length;
    next1.disabled = n < MIN_SHOTS;
    next1.textContent = n < MIN_SHOTS ? `Next: add lift (${MIN_SHOTS - n} more ${MIN_SHOTS - n === 1 ? "try" : "tries"} to unlock)` : "Next: add lift";
  }

  const l2 = levelShots(2);
  const h2 = $("[data-hint2]");
  if (h2) {
    const last = l2[l2.length - 1];
    let t = "";
    if (last && (!s.run || s.run.done)) {
      if (last.outcome === "over") t = last.roll < 0 ? "Over the limit, and the lift down made it worse. Try the lift up, or aim shallower." : "Over the limit. Roll the lift up, or aim shallower.";
      else if (last.outcome === "skip") t = last.roll > 0 ? "Skipped, and the lift up did it. Use less lift, or aim steeper." : "Skipped. Aim steeper, or try a little lift down (a full roll down piles on too much load).";
      else t = "Safe. Try a steeper angle with the lift up, or a shallower one with a little lift down.";
    }
    h2.hidden = !t;
    h2.textContent = t;
  }
  const next2 = $("[data-to-compare]");
  if (next2) {
    const n = l2.filter((x) => x === s.run?.shot ? s.run.done : true).length;
    next2.disabled = n < MIN_SHOTS;
    next2.textContent = n < MIN_SHOTS ? `Next: the two windows (${MIN_SHOTS - n} more ${MIN_SHOTS - n === 1 ? "try" : "tries"} to unlock)` : "Next: the two windows";
  }
}

$("[data-fire]")?.addEventListener("click", () => fire(1));
$("[data-fire2]")?.addEventListener("click", () => fire(2));

/* ---------- Level moves ---------- */

$("[data-to-l2]")?.addEventListener("click", () => {
  finishRun();
  s.run = null;
  setAngle(2, L2_START);
  setRoll(0);
  const ch = $("[data-challenge]");
  if (ch) {
    const base = R.fly({ fpa: -L2_START, mode: 0 });
    ch.textContent = `Try this first: at ${L2_START.toFixed(1)}${DEG} with no lift, the model's peak load is ${fmtG(base.peakG)}, over the 12 g limit. ` +
      "Roll the lift up and fire.";
  }
  show("l2-lift", ".re-q");
  updateHints();
  say("Level 2. Roll the lift up or down and fire. The upper row on the strip is this level; the lower row is level 1.");
});

$("[data-to-compare]")?.addEventListener("click", () => {
  finishRun();
  s.run = null;
  ensureCorridors();
  fillCompareText();
  show("compare", ".re-q");
  say("The two safe windows, side by side.");
});

/* ---------- Controls ---------- */

function setAngle(level, a) {
  const v = Math.round(Math.min(STRIP_MAX, Math.max(STRIP_MIN, a)) * 20) / 20;
  if (level === 1) s.angle = v; else s.angle2 = v;
  const ctl = $(`lab-control[name="${level === 1 ? "angle" : "angle2"}"]`);
  if (ctl && Number(ctl.value) !== v) ctl.value = v;
  redraw();
}

function setRoll(f) {
  s.roll = f;
  const ctl = $('lab-control[name="roll"]');
  if (ctl && Number(ctl.value) !== f) ctl.value = f;
  for (const b of $$("[data-roll]")) b.setAttribute("aria-pressed", String(Number(b.dataset.roll) === f));
}

for (const b of $$("[data-roll]")) b.addEventListener("click", () => setRoll(Number(b.dataset.roll)));

document.addEventListener("lab-input", (e) => {
  const { name, value } = e.detail;
  if (name === "angle") { s.angle = value; redraw(); }
  else if (name === "angle2") { s.angle2 = value; redraw(); }
  else if (name === "roll") { setRoll(value); }
});

/* ---------- Pointer ----------

   A press on the angle strip sets the aim and a drag moves it. Taps anywhere
   else on the picture do nothing, so a thumb that lands on the Earth while
   scrolling past does no harm. */

let drag = false;
const levelNow = () => (s.step === "l1-aim" ? 1 : 2);
const rectXY = (e) => {
  const r = canvas.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
};

canvas?.addEventListener("pointerdown", (e) => {
  if (s.step !== "l1-aim" && s.step !== "l2-lift") return;
  const [x, y] = rectXY(e);
  if (!mount.inStrip(x, y)) return;
  canvas.setPointerCapture?.(e.pointerId);
  drag = true;
  setAngle(levelNow(), mount.angleAt(x));
  e.preventDefault();
});
canvas?.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const [x] = rectXY(e);
  const a = mount.angleAt(x);
  if (a !== null) setAngle(levelNow(), a);
});
const endDrag = () => { drag = false; };
canvas?.addEventListener("pointerup", endDrag);
canvas?.addEventListener("pointercancel", endDrag);
// A touch drag can end without a pointerup if the browser takes the capture
// back, and a stuck drag would swallow the taps that follow it.
canvas?.addEventListener("lostpointercapture", endDrag);

/* ---------- Corridors ----------

   The searches take a moment, so they run on the first visit to the compare
   step and are kept. LEO is only worked out if asked for. */

let corrCache = null;
function ensureCorridors(withLeo = false) {
  if (!corrCache) corrCache = { none: R.corridor({ mode: 0 }), any: R.corridorAnyRoll({}) };
  if (withLeo && !corrCache.leoNone) {
    corrCache.leoNone = R.corridor({ mode: 0, speed: R.V_LEO });
    corrCache.leoAny = R.corridorAnyRoll({ speed: R.V_LEO });
  }
  s.corr = corrCache;
  return corrCache;
}

function compareRows() {
  const c = s.corr;
  if (!c) return [];
  const rows = [
    { label: "Moon, no lift", note: `${fmtDeg(c.none.shallow)} to ${fmtDeg(c.none.steep)}: ${c.none.width.toFixed(2)}${DEG} wide`, shallow: c.none.shallow, steep: c.none.steep, open: false, color: "#6ea8ff" },
    { label: "Moon, roll chosen", note: `${fmtDeg(c.any.shallow)} to ${fmtDeg(c.any.steep)}: ${c.any.width.toFixed(2)}${DEG} wide`, shallow: c.any.shallow, steep: c.any.steep, open: false, color: "#7cf0be" },
  ];
  if (s.leo && c.leoNone) {
    rows.push(
      { label: "Low orbit, no lift", note: `no skip edge; steepest ${fmtDeg(c.leoNone.steep)}`, shallow: c.leoNone.shallow, steep: c.leoNone.steep, open: c.leoNone.open, color: "#6ea8ff" },
      { label: "Low orbit, roll chosen", note: `no skip edge; steepest ${fmtDeg(c.leoAny.steep)}`, shallow: c.leoAny.shallow, steep: c.leoAny.steep, open: c.leoAny.open, color: "#7cf0be" },
    );
  }
  return rows;
}

function fillCompareText() {
  const c = s.corr;
  const el = $("[data-compare-text]");
  if (!c || !el) return;
  const gainShallow = c.any.shallow - c.none.shallow;
  const gainSteep = c.none.steep - c.any.steep;
  el.textContent =
    `With no lift the window is ${c.none.width.toFixed(2)}${DEG} wide. With the roll picked to suit the angle it is ` +
    `${c.any.width.toFixed(2)}${DEG}, about ${(c.any.width / c.none.width).toFixed(1)} times as wide. Most of that is on the steep side: ` +
    `${gainSteep.toFixed(2)}${DEG} gained there, against ${gainShallow.toFixed(2)}${DEG} on the shallow side. All of these are model values.`;
  if (s.pred.width !== null) {
    el.textContent += ` You guessed ${choiceText(s.pred.width)} for the window with no steering; the model says ${c.none.width.toFixed(2)}${DEG}.`;
  }
}

$("[data-leo]")?.addEventListener("click", (e) => {
  s.leo = !s.leo;
  const b = e.currentTarget;
  b.setAttribute("aria-pressed", String(s.leo));
  b.textContent = s.leo ? "Hide the low Earth orbit bars" : "Also show a return from low Earth orbit";
  const t = $("[data-leo-text]");
  if (s.leo) {
    const c = ensureCorridors(true);
    t.hidden = false;
    t.textContent =
      `A capsule coming back from low Earth orbit, at ${(R.V_LEO / 1000).toFixed(1)} km/s (circular speed at the interface, worked out here), has far less energy. ` +
      `In the model it has no skip edge at all: even a nearly flat entry stays in. Its steep edge is ${fmtDeg(c.leoNone.steep)} with no lift, against ${fmtDeg(c.none.steep)} from the Moon. ` +
      "Model values.";
  } else {
    t.hidden = true;
  }
  say(s.leo ? "Low Earth orbit bars shown." : "Low Earth orbit bars hidden.");
  redraw();
});

/* ---------- Finishing ---------- */

$("[data-finish]")?.addEventListener("click", () => {
  s.finished = true;
  showResults();
  const n1 = levelShots(1).length;
  const n2 = levelShots(2).length;
  $("[data-done-text]").textContent =
    `You fired ${n1} ${n1 === 1 ? "time" : "times"} at level 1 and ${n2} at level 2. The results are below the exhibit.`;
  show("done", ".re-q");
  say("Done. The results are below the exhibit.");
});

$("[data-restart]")?.addEventListener("click", () => {
  s.pred = { width: null, worse: null };
  for (const b of $$("[data-q]")) { b.disabled = false; b.setAttribute("aria-pressed", "false"); }
  $("[data-start]").disabled = true;
  s.shots = [];
  s.run = null;
  s.angle2 = L2_START;
  s.roll = 0;
  s.leo = false;
  s.finished = false;
  const leo = $("[data-leo]");
  if (leo) { leo.setAttribute("aria-pressed", "false"); leo.textContent = "Also show a return from low Earth orbit"; }
  const lt = $("[data-leo-text]");
  if (lt) lt.hidden = true;
  for (const el of $$("[data-shot], [data-shot2]")) { el.textContent = ""; el.dataset.state = ""; }
  $("#results").hidden = true;
  updateHints();
  show("predict", ".re-q");
});

/* ---------- Results ---------- */

// The choices as the buttons print them.
const choiceText = (x) => `about ${x}${DEG}`;

function nearestWidth(truth) {
  let best = null;
  let bestErr = Infinity;
  for (const c of [0.2, 2, 20, 45]) {
    const err = Math.abs(Math.log(c / truth));
    if (err < bestErr) { best = c; bestErr = err; }
  }
  return best;
}

function sizeWord(ratio) {
  const n = ratio >= 10 ? Number(ratio.toPrecision(2)) : Math.round(ratio * 10) / 10;
  return n.toLocaleString("en-GB");
}

function scoreWidth(c) {
  const el = $('[data-score="width"]');
  if (!el) return 0;
  const textEl = el.querySelector("[data-score-text]");
  const truth = c.none.width;
  const guess = s.pred.width;
  const best = nearestWidth(truth);
  const line = `In the model the safe window with no steering is ${truth.toFixed(2)}${DEG} wide, from ${fmtDeg(c.none.shallow)} to ${fmtDeg(c.none.steep)}. ` +
    `NASA's own chart for a lunar return, with the crew steering and range limits counted, reads about 1.4${DEG} by eye.`;
  if (guess === null) {
    el.dataset.state = "";
    textEl.textContent = `You skipped this one. ${line}`;
    return 0;
  }
  const right = guess === best;
  el.dataset.state = right ? "good" : "bad";
  const f = guess / truth;
  const how = right
    ? "That was the closest choice."
    : `Your guess was about ${sizeWord(f > 1 ? f : 1 / f)} times too ${f > 1 ? "wide" : "narrow"}; ${choiceText(best)} was the closest choice.`;
  textEl.textContent = `You said ${choiceText(guess)}. ${line} ${how}`;
  return right ? 1 : 0;
}

// The second question is about what the exhibit itself shows: which end of
// the window the lift widens. The model answers it directly, by comparing how
// far the steep edge and the shallow edge move when the roll is chosen to
// suit the angle. "Both about equally" is right when the two gains are within
// a factor of two of each other. It is a model result, and the page says so.
function scoreWorse(c) {
  const el = $('[data-score="worse"]');
  if (!el) return 0;
  const textEl = el.querySelector("[data-score-text]");
  const gainSteep = c.none.steep - c.any.steep;
  const gainShallow = c.any.shallow - c.none.shallow;
  const ratio = gainSteep / Math.max(gainShallow, 1e-6);
  const truth = ratio > 2 ? "steep" : ratio < 0.5 ? "shallow" : "same";
  const detail =
    `In the model, choosing the roll moves the steep edge by ${gainSteep.toFixed(2)}${DEG} and the shallow edge by ${gainShallow.toFixed(2)}${DEG}, ` +
    `so the lift helps ${truth === "steep" ? "mostly at the steep end" : truth === "shallow" ? "mostly at the shallow end" : "about equally at both ends"}. These are model values. ` +
    "A little lift down saves a slightly shallower entry, but a full roll down piles on the load instead, so the shallow side gains little.";
  const guess = s.pred.worse;
  if (guess === null) {
    el.dataset.state = "";
    textEl.textContent = `You skipped this one. ${detail}`;
    return 0;
  }
  const right = guess === truth;
  el.dataset.state = right ? "good" : "bad";
  const said = guess === "steep" ? "the steep end" : guess === "shallow" ? "the shallow end" : "both ends about equally";
  textEl.textContent = `You said ${said}. ${detail}`;
  return right ? 1 : 0;
}

// The column names go on each cell as data-label, so on a phone the CSS can
// stack a row into a small card instead of scrolling a four-column table.
const COLS = ["Quantity", "Model value", "Real mission number", "Source"];
function row(cells) {
  return `<tr>${cells.map((c, i) => `<${i === 0 ? "th scope=\"row\"" : "td"} data-label="${COLS[i]}"${i === 1 || i === 2 ? " class=\"num\"" : ""}>${c}</${i === 0 ? "th" : "td"}>`).join("")}</tr>`;
}

function showResults() {
  const sec = $("#results");
  if (!sec) return;
  const c = ensureCorridors();
  sec.hidden = false;
  const score = scoreWidth(c) + scoreWorse(c);
  const sl = $("[data-score-line]");
  if (sl) {
    const answered = (s.pred.width !== null) + (s.pred.worse !== null);
    sl.textContent = answered ? `${score} of 2 predictions right.` : "You skipped the predictions.";
  }

  const why = $('[data-copy="why"]');
  if (why) {
    why.textContent =
      "Both sides of the window are set by the same thing: how fast the air takes the capsule's speed away. " +
      "Take too little and the capsule leaves; take it too fast and the load goes over the limit. " +
      `In this model the two are only ${c.none.width.toFixed(2)}${DEG} apart with no lift, and ${c.any.width.toFixed(2)}${DEG} apart with the roll chosen.`;
  }

  const a10up = R.fly({ fpa: R.FPA_APOLLO10, mode: 1 });
  const a10none = R.fly({ fpa: R.FPA_APOLLO10, mode: 0 });
  const dash = "&mdash;";
  const rows = [
    row([`First peak load at Apollo 10's angle (${MINUS}6.616${DEG}), lift up`, `${fmtG(a10up.peakG)} (this model run then skips out; the real crew rolled down and stayed in)`, "6.8 g, the first peak", "TN D-6725"]),
    row([`Peak load at the same angle, no lift`, fmtG(a10none.peakG), dash, "not flown"]),
    row([`Share of the no-lift peak left with lift up (not a like-for-like pair: the model uses a lift-to-drag ratio of 0.3)`, (a10up.peakG / a10none.peakG).toFixed(2), "about 0.5, a general figure for a ratio of 0.2, not an Apollo result", "SP-2011-593"]),
    row([`Safe window, no lift`, `${c.none.width.toFixed(2)}${DEG}`, dash, dash]),
    row([`Safe window, roll chosen`, `${c.any.width.toFixed(2)}${DEG}`, `about 1.4${DEG}, read by eye from a chart`, "TN D-6725, fig. 2"]),
    row([`Peak convective heating at Apollo 10's angle, lift up`, `${num(a10up.peakHeat)} W/cm²`, dash, dash]),
    row([`The load limit`, "12 g (the exhibit's rule)", "12 g, the steep boundary of the entry corridor", "TN D-6725"]),
  ];
  $("[data-table]").innerHTML = rows.join("");
}

// Both the "See the results" link and the skip link land on the results
// heading, so a keyboard or screen-reader visitor is not left on the page body.
for (const link of $$('[data-show-results], .re-step a[href="#results"]')) {
  link.addEventListener("click", () => {
    showResults();
    $("#results h2")?.focus({ preventScroll: true });
  });
}

window.__reentry = {
  state: s, R, mount,
  show, fire, finishRun, setAngle, setRoll, showResults, ensureCorridors,
  // Test hook: put the picture in a given state without playing the game.
  set(partial) { Object.assign(s, partial); redraw(); },
  compareRows,
};

show("predict");
