// Hit the window to Mars — page controller.
//
// The exercise is a short chain of steps, one visible at a time:
//
//   predict -> aim (first launch locked to day 0) -> fly -> result
//           -> aim (free) -> fly -> result ... -> guess -> ff -> done
//
// The first launch is locked to day 0 on purpose. The prediction the visitor
// makes is about "today", and a prediction that can be quietly dodged by
// moving the slider before launching would have nothing to be scored
// against. After that first flight the slider is theirs.
//
// Every rule and number comes from systems/transfer.js. This file decides
// what to show and when; it does no orbital arithmetic of its own beyond
// formatting.

import { mountMarsWindow, millions } from "../experiences/mars-window.js";
import { prefersReducedMotion } from "../systems/stage.js";
import * as T from "../systems/transfer.js";

// Two starting arrangements, chosen so the first launch always misses and
// so that the two ways of missing both turn up. At 100 degrees Mars is too
// far ahead and the ship arrives late; at 20 degrees it is too far behind
// and the ship arrives early. ?lead=100 or ?lead=20 pins one for testing.
const STARTS = [100, 20];
const SLIDER_MAX = 800;
const FLY_DAYS_PER_SECOND = 42;
const FF_DAYS_PER_SECOND = 140;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function pickStart() {
  try {
    const q = Number(new URLSearchParams(location.search).get("lead"));
    if (STARTS.includes(q)) return q;
  } catch {}
  return STARTS[Math.floor(Math.random() * STARTS.length)];
}

const s = {
  world: T.makeWorld({ startLeadDeg: pickStart() }),
  day: 0,
  mode: "aim", // what the canvas draws: aim | fly | result | ff
  step: "predict", // which panel step is showing
  flight: null,
  target: 0,
  showHint: false,
  prediction: null,
  flights: 0,
  hitDay: null,
  ffStart: 0,
  ffTarget: 0,
  guess: 12,
  misses: 0,
};

const live = $("[data-live]");
const status = $("[data-status]");
const canvas = $("#mars-canvas");
const dayControl = $('lab-control[name="day"]');
const monthControl = $('lab-control[name="months"]');
const leadOut = $('[data-out="lead"]');
const needOut = $('[data-out="need"]');
const launchBtn = $("[data-launch]");
const nudges = $$("[data-nudge]");

const STATUS = {
  predict: "Predict", aim: "Aim", fly: "In flight", result: "Arrived",
  guess: "Next window", ff: "Running clock", done: "Next window",
};

const PREDICTION_TEXT = {
  hit: "that you would reach Mars",
  early: "that you would arrive early, with Mars not there yet",
  late: "that you would arrive late, with Mars already gone by",
};

const deg = (rad) => T.toDeg(rad);
const fmt1 = (n) => n.toFixed(1);

function say(text) {
  if (live) live.textContent = text;
}

function describeCanvas() {
  if (!canvas) return;
  const lead = fmt1(deg(T.leadAt(s.world, s.day)));
  canvas.setAttribute(
    "aria-label",
    `Top-down view of the Sun, Earth and Mars on circular orbits on day ${Math.floor(s.day)}. Mars is ${lead} degrees ahead of Earth.`
  );
}

function show(step, focusSel) {
  s.step = step;
  for (const el of $$(".mw-step")) el.hidden = el.dataset.step !== step;
  if (status) status.textContent = STATUS[step] || "";
  refreshHint();
  if (focusSel) {
    const target = $(`[data-step="${step}"] ${focusSel}`);
    // preventScroll: moving focus is for keyboard and screen-reader users, and
    // should not yank a phone's viewport around.
    if (target) target.focus({ preventScroll: true });
  }
  describeCanvas();
  mount.redraw();
}

const hintEl = $("[data-aim-hint]");

// After a second miss in a row the visitor has seen the wedge and still not
// found the day, which at some starts means a scrub of several hundred days.
// Say what to look for and roughly where it is, but only then: the first
// attempt should still be a search.
function refreshHint() {
  if (!hintEl) return;
  const w = s.world;
  if (s.misses < 2 || s.step !== "aim") { hintEl.hidden = true; return; }
  const rate = w.nEarth - w.nMars;
  const wait = T.wrap2pi(T.leadAt(w, s.day) - w.needLead) / rate;
  const lead = deg(T.leadAt(w, s.day));
  const need = deg(w.needLead);
  const gain = deg(rate);
  const target = Math.round(s.day + wait);
  hintEl.textContent =
    `Mars is ${lead.toFixed(0)}° ahead and needs to be ${need.toFixed(0)}°. Earth gains ${gain.toFixed(2)}° on Mars each day, so that lead shrinks by ${gain.toFixed(2)}° a day. From the day you picked, it next reads ${need.toFixed(0)}° around day ${target}.`;
  hintEl.hidden = false;
}

function refreshReadouts() {
  refreshHint();
  if (leadOut) leadOut.value = deg(T.leadAt(s.world, s.day));
  if (needOut) needOut.value = s.showHint ? deg(s.world.needLead) : "?";
}

function setDay(day) {
  s.day = Math.min(Math.max(Math.round(day), 0), SLIDER_MAX);
  if (dayControl) dayControl.value = s.day;
  refreshReadouts();
  describeCanvas();
  mount.redraw();
}

function lockAim(locked) {
  dayControl?.setDisabled(locked);
  for (const b of nudges) b.disabled = locked;
  if (launchBtn) launchBtn.textContent = locked ? "Launch today" : "Launch";
}

/* ---------- Predict ---------- */

for (const btn of $$("[data-predict]")) {
  btn.addEventListener("click", () => {
    s.prediction = btn.dataset.predict;
    s.mode = "aim";
    s.day = 0;
    lockAim(true);
    refreshReadouts();
    $("[data-aim-title]").textContent = `You predicted ${PREDICTION_TEXT[s.prediction]}.`;
    $("[data-aim-note]").textContent =
      "The first launch is today, day 0. Fly it and see.";
    show("aim", "[data-launch]");
    say("Prediction locked in. Press launch to fly the first transfer.");
  });
}

/* ---------- Aim ---------- */

document.addEventListener("lab-input", (e) => {
  const { name, value } = e.detail;
  if (name === "day" && s.step === "aim") setDay(value);
  else if (name === "months") s.guess = value;
});

for (const b of nudges) {
  b.addEventListener("click", () => setDay(s.day + Number(b.dataset.nudge)));
}

launchBtn?.addEventListener("click", () => {
  s.flight = T.flyby(s.world, s.day);
  s.target = s.flight.arriveDay;
  s.mode = "fly";
  s.flights++;
  $("[data-fly-note]").textContent =
    `Launched on day ${s.flight.launchDay}. The ship coasts for ${Math.round(s.world.transfer.days)} days while both planets keep moving.`;
  show("fly");
  say(`Launched on day ${s.flight.launchDay}.`);
  if (prefersReducedMotion) finishFlight();
});

/* ---------- Flight ---------- */

function onFrame(dt) {
  if (s.step === "fly") {
    s.day = T.stepClock(s.day, s.target, dt, FLY_DAYS_PER_SECOND, prefersReducedMotion);
    if (s.day >= s.target) finishFlight();
  } else if (s.step === "ff") {
    s.day = T.stepClock(s.day, s.ffTarget, dt, FF_DAYS_PER_SECOND, prefersReducedMotion);
    if (s.day >= s.ffTarget) finishFastForward();
  }
}

for (const b of $$("[data-skip]")) {
  b.addEventListener("click", () => {
    if (s.step === "fly") { s.day = s.target; finishFlight(); }
    else if (s.step === "ff") { s.day = s.ffTarget; finishFastForward(); }
  });
}

function classify(f) {
  if (f.hit) return "hit";
  return f.signedDeg > 0 ? "late" : "early";
}

function finishFlight() {
  const f = s.flight;
  s.day = f.arriveDay;
  s.mode = "result";
  const w = s.world;
  const outcome = classify(f);
  const launchLead = deg(T.leadAt(w, f.launchDay));
  const needed = deg(w.needLead);
  const arc = deg(w.nMars * w.transfer.days);

  const verdict = $("[data-verdict]");
  const detail = $("[data-result-detail]");
  const why = $("[data-result-why]");

  if (outcome === "hit") {
    verdict.textContent = "You hit Mars.";
    verdict.dataset.state = "good";
    detail.textContent =
      `Launched on day ${f.launchDay}, arrived on day ${Math.round(f.arriveDay)}, and finished ${millions(f.missKm)} million km from Mars. The ship arrived and Mars was there to meet it.`;
  } else {
    verdict.textContent = `Missed by ${millions(f.missKm)} million km.`;
    verdict.dataset.state = "bad";
    const absDeg = Math.abs(f.signedDeg);
    const absDays = Math.abs(f.daysOff);
    detail.textContent = outcome === "late"
      ? `The ship reached the far side of its orbit on day ${Math.round(f.arriveDay)}. Mars had already gone through that spot ${absDeg.toFixed(0)}° earlier, ${absDays.toFixed(0)} days before the ship got there.`
      : `The ship reached the far side of its orbit on day ${Math.round(f.arriveDay)}. Mars was still ${absDeg.toFixed(0)}° short of that spot and would not reach it for another ${absDays.toFixed(0)} days.`;
  }
  why.textContent =
    `The coast takes ${Math.round(w.transfer.days)} days, and Mars moves ${arc.toFixed(0)}° of its own orbit in that time. To meet it, Mars has to start ${needed.toFixed(0)}° ahead of Earth. On day ${f.launchDay} it started ${launchLead.toFixed(0)}° ahead.`;

  // The prediction is scored against the first flight, which is the one
  // it was made about. Later flights have no prediction to score.
  const predBox = $("[data-prediction]");
  if (s.flights === 1 && s.prediction) {
    const right = s.prediction === outcome;
    const said = PREDICTION_TEXT[s.prediction];
    const actual = {
      hit: "you reached Mars",
      early: "the ship arrived early",
      late: "the ship arrived late",
    }[outcome];
    $("[data-prediction-text]").textContent = right
      ? `You predicted ${said}. You were right: ${actual}.`
      : `You predicted ${said}. You were wrong: ${actual}.`;
    predBox.hidden = false;
  } else {
    predBox.hidden = true;
  }

  s.showHint = outcome !== "hit";
  s.misses = outcome === "hit" ? 0 : s.misses + 1;
  const again = $("[data-again]");
  const next = $("[data-next]");
  again.hidden = outcome === "hit";
  next.hidden = outcome !== "hit";
  if (outcome === "hit") s.hitDay = f.launchDay;

  say(`${verdict.textContent} ${detail.textContent} ${why.textContent}`);
  show("result", "[data-verdict]");
}

$("[data-again]")?.addEventListener("click", () => {
  s.mode = "aim";
  s.flight = null;
  lockAim(false);
  setDay(s.target - s.world.transfer.days);
  refreshReadouts();
  $("[data-aim-title]").textContent = "Pick a better day.";
  $("[data-aim-note]").textContent =
    "The green wedge is the lead Mars needs. Move the day until Mars sits on its edge, then launch.";
  show("aim", "lab-control input");
});

/* ---------- Round two ---------- */

$("[data-next]")?.addEventListener("click", () => {
  // Rewind to the launch day. The question is about the geometry the visitor
  // just got right, so it is shown as it was when they launched.
  s.mode = "ff";
  s.flight = null;
  s.showHint = true;
  s.day = s.hitDay;
  refreshReadouts();
  show("guess", "lab-control input");
});

$("[data-fast]")?.addEventListener("click", () => {
  s.ffStart = s.hitDay;
  s.ffTarget = s.hitDay + s.world.synodic;
  s.day = s.ffStart;
  $("[data-ff-note]").textContent =
    `Your guess: ${s.guess} months. Watch the angle between the planets.`;
  show("ff");
  say(`Running the clock forward from day ${s.ffStart}.`);
  if (prefersReducedMotion) finishFastForward();
});

function finishFastForward() {
  const w = s.world;
  s.day = s.ffTarget;
  const months = w.synodic / T.DAYS_PER_MONTH;
  const diff = s.guess - months;
  const verdict = $("[data-done-verdict]");
  const detail = $("[data-done-detail]");
  const close = Math.abs(diff) <= 1.5;
  verdict.dataset.state = close ? "good" : "warn";
  verdict.textContent = `${fmt1(months)} months, ${Math.round(w.synodic)} days.`;
  const off = Math.abs(diff).toFixed(1);
  const how = close && Math.abs(diff) < 0.5
    ? "You had it."
    : diff < 0 ? `You guessed ${s.guess}, which was ${off} months short.` : `You guessed ${s.guess}, which was ${off} months too long.`;
  detail.textContent =
    `${how} At the end of the run Mars is ${fmt1(deg(T.leadAt(w, s.day)))}° ahead of Earth again, the same as on day ${s.hitDay}. Earth gains ${deg(w.nEarth - w.nMars).toFixed(2)}° on Mars every day, so it takes ${Math.round(w.synodic)} days to gain a full lap.`;
  revealNumbers();
  say(`${verdict.textContent} ${detail.textContent}`);
  show("done", "[data-done-verdict]");
}

/* ---------- Restart ---------- */

$("[data-restart]")?.addEventListener("click", () => {
  const other = STARTS.find((v) => Math.abs(T.toDeg(s.world.lead0) - v) > 1) ?? STARTS[0];
  s.world = T.makeWorld({ startLeadDeg: other });
  Object.assign(s, {
    day: 0, mode: "aim", flight: null, target: 0, showHint: false,
    prediction: null, flights: 0, hitDay: null, misses: 0,
  });
  if (dayControl) dayControl.value = 0;
  lockAim(true);
  refreshReadouts();
  show("predict", ".mw-opt");
});

/* ---------- The numbers ---------- */

function renderNumbers() {
  const w = s.world;
  const tr = w.transfer;
  const arc = T.pathLengthKm(tr) / 1e6;
  const nums = {
    days: Math.round(tr.days),
    lead: deg(w.needLead).toFixed(0),
    arc: deg(w.nMars * tr.days).toFixed(0),
    syn: String(Math.round(w.synodic)),
    months: (w.synodic / T.DAYS_PER_MONTH).toFixed(1),
    gain: deg(w.nEarth - w.nMars).toFixed(2),
    ellipse: arc.toFixed(0),
  };
  for (const el of $$("[data-n]")) {
    if (nums[el.dataset.n] !== undefined) el.textContent = nums[el.dataset.n];
  }

  const [curiosity, perseverance] = T.REAL_MISSIONS;
  const cDays = T.missionDays(curiosity);
  const pDays = T.missionDays(perseverance);

  const copy = {
    transfer:
      `The cheapest way to reach Mars is a Hohmann transfer. The ship leaves Earth along its direction of travel, which stretches its orbit into an ellipse that touches Earth's orbit at one end and Mars's orbit at the other. Flying that half ellipse takes ${nums.days} days, about ${(tr.days / T.DAYS_PER_MONTH).toFixed(1)} months. It comes out of Kepler's third law and the Sun's gravitational parameter, nothing else.`,
    synodic:
      `In ${nums.days} days Mars moves ${nums.arc}° around the Sun, so it has to start ${nums.lead}° ahead of Earth. That is the window. Earth is on the inside track and gains ${nums.gain}° on Mars every day, so the ${nums.lead}° wedge comes round again after ${nums.syn} days, or ${nums.months} months. That is the synodic period. NASA's fact sheet lists 779.94 days for Mars, and JPL's Basics of Space Flight says the minimum-energy opportunity comes about every 25 months.`,
    real:
      `Real flights are in the same range. Curiosity left on 26 November 2011 and landed on 6 August 2012, ${cDays} days. Perseverance left on 30 July 2020 and landed on 18 February 2021, ${pDays} days, covering about 471 million km. The half ellipse here is about ${nums.ellipse} million km long, so Perseverance flew a shorter, faster path.`,
    why:
      `The model uses circles. Mars's real orbit is squashed enough that its distance from the Sun runs from 206.7 to 249.3 million km, and it is tilted 1.85° to Earth's, so a real window is not exactly this window. Missions also pay for speed. The Hohmann transfer is the minimum-energy path, and a faster trajectory that sweeps less than 180° around the Sun (JPL calls that Type I) shortens the trip by spending more propellant.`,
  };
  for (const [key, text] of Object.entries(copy)) {
    const el = $(`[data-copy="${key}"]`);
    if (el) el.textContent = text;
  }

  const rows = [
    ["Hohmann transfer, this page", tr.days.toFixed(0), arc.toFixed(0)],
    [`Curiosity (launched 26 Nov 2011)`, String(cDays), "n/a"],
    [`Perseverance (launched 30 Jul 2020)`, String(pDays), (perseverance.pathKm / 1e6).toFixed(0)],
  ];
  const body = $("[data-compare]");
  if (body) {
    body.innerHTML = rows
      .map(([a, b, c]) => `<tr><td>${a}</td><td class="num">${b}</td><td class="num">${c}</td></tr>`)
      .join("");
  }
}

function revealNumbers() {
  const sec = $("#numbers");
  if (sec) sec.hidden = false;
}

$("[data-show-numbers]")?.addEventListener("click", () => {
  revealNumbers();
});
$("[data-to-numbers]")?.addEventListener("click", () => {
  revealNumbers();
});

/* ---------- Start ---------- */

const mount = mountMarsWindow(canvas, { getState: () => s, onFrame });
renderNumbers();
lockAim(true);
refreshReadouts();
show("predict");

// Test hook: the probe script reads the live state rather than scraping
// pixels. Nothing on the page depends on it.
window.__marsWindow = { state: s, T };
