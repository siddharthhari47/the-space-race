// A day on the ISS — page controller.
//
// The exhibit is a short chain of steps, one visible in the panel at a time:
//
//   predict -> l1 (why they float) -> l2 (sixteen sunrises)
//           -> l3 (spot it from home) -> done
//
// and then the results section under the exhibit, which scores the three
// predictions and sets the model's numbers beside the ones NASA gives.
//
// The three predictions come first and are not shown again until the end.
// Each one is the surprise one of the levels is built to take apart, so a
// visitor who plays through has met the answer by the time the results
// arrive, and the results say how close the guess was.
//
// Every number comes from systems/iss-day.js. This file decides what to show
// and when, turns pointer positions into values with the canvas module's
// mappings, and formats. Where the page prints a number from the model it
// says so, and where it prints a real number it names the source, because
// the two are easy to mix up and this is a simplified model, not a record of
// any day's orbit.

import { mountIssDay, CREW_COLORS } from "../experiences/iss-day.js";
import { prefersReducedMotion } from "../systems/stage.js";
import * as M from "../systems/iss-day.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const DEG = "°";
const MINUS = "−";

// How long a thrown object takes to draw, in seconds of watching. A real
// throw takes tens of minutes; a visitor trying a dozen speeds does not want
// to wait for that.
const RUN_SECONDS = 2.6;
// Throws before the circular speed and the next step unlock: enough to have
// seen the three outcomes appear, few enough that nobody is held up.
const MIN_THROWS = 4;
// Level 2 plays a day in a minute: 1,440 model seconds per second watched.
const L2_RATE = M.DAY_S / 60;
// Level 3 plays slower, so a pass of a few minutes takes several seconds
// to cross the sky and can actually be watched.
const L3_RATE = 60;
// The first sunrise should not be at 00:00 on the dot, so the day opens
// with the station a little way round its orbit.
const L2_PHI0 = 2;
// A tap counts as catching a sunrise if it comes within a quarter of an
// orbit (about 23 model minutes, a second or so of watching) after it.
const CATCH_FRACTION = 0.25;
const REAL_SPEED_KMS = M.REAL.speedKmh / 3600; // NASA's 28,000 km/h

const s = {
  step: "predict",
  pred: { grav: null, sun: null, vis: null },
  l1: { v: 5, throws: [], run: null, circ: false },
  l2: { t: 0, maxT: 0, beta: 0, playing: false, sunrises: [], caught: new Set(), practice: new Set(), misses: 0 },
  l3: { lat: 40, lon: -75, day: 0, t: 0, playing: false, passes: [], sel: null, track: [], vis: [], sky: [], why: null, sc: null, touched: false },
  finished: false,
};

const live = $("[data-live]");
const status = $("[data-status]");
const canvas = $("#iss-canvas");
const stageEl = $(".id-stage");
const STATUS = { predict: "Predict", l1: "Level 1", l2: "Level 2", l3: "Level 3", done: "Done" };
const say = (text) => { if (live) live.textContent = text; };
const fmtMin = (sec) => {
  // A throw just under escape speed takes days to come round; minutes stop
  // meaning anything long before that.
  const m = sec / 60;
  if (m < 300) return `${Math.round(m)} min`;
  if (m < 2880) return `${(m / 60).toFixed(1)} hours`;
  return `${Math.round(m / 1440).toLocaleString("en-GB")} days`;
};
const hhmm = (sec) => {
  const m = Math.floor((((sec % M.DAY_S) + M.DAY_S) % M.DAY_S) / 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const num = (x) => Math.round(x).toLocaleString("en-GB");
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const compass = (az) => COMPASS[Math.round(az / 45) % 8];

/* ---------- What the canvas draws ---------- */

const vc = M.circularSpeed();

function canvasState() {
  if (s.step === "l2") return l2State();
  if (s.step === "l3" || s.step === "done" && s.finished && s.l3.sc) return l3State();
  // The predict step and level 1 share the throw picture; on the predict
  // step it has no throws on it yet.
  const r = s.l1.run;
  const marks = s.l1.throws.filter((x) => !(r && x === r.throw && !r.done));
  return {
    mode: "l1",
    R: M.R_EARTH, altKm: M.ALT_KM, stopKm: M.STOP_ALT_KM,
    gFrac: M.gravityFraction(), vMax: M.SPEED_MAX_KMS,
    v: s.l1.v,
    run: r ? { path: r.path, at: r.at, done: r.done, outcome: r.throw.outcome } : null,
    ghosts: s.l1.throws.filter((x) => !(r && x === r.throw)).slice(-3),
    marks,
    circ: s.l1.circ, vc, vReal: REAL_SPEED_KMS,
    circLabel: `model ${vc.toFixed(2)}, NASA ${REAL_SPEED_KMS.toFixed(2)} km/s`,
  };
}

function l2State() {
  const L = s.l2;
  const n = M.meanMotion();
  const phi = L2_PHI0 + n * L.t;
  const f = M.eclipseFraction(L.beta);
  let last = -Infinity;
  let count = 0;
  for (const r of L.sunrises) if (r <= L.t) { last = r; count++; }
  const since = L.t - last;
  return {
    mode: "l2",
    R: M.R_EARTH, rOrbit: M.R_EARTH + M.ALT_KM,
    t: L.t, phi, betaDeg: L.beta,
    blocks: M.CREW_BLOCKS,
    sunrises: L.sunrises, riseCount: count,
    nightHalf: f * Math.PI,
    inShadow: M.inShadowPlane(phi, L.beta),
    glow: since < CATCH_FRACTION * M.orbitPeriod() ? 1 - since / (CATCH_FRACTION * M.orbitPeriod()) : 0,
  };
}

function l3State() {
  const L = s.l3;
  const sc = L.sc;
  const look = M.look(L.t, L.lat, L.lon, sc);
  const spot = { lat: L.lat, lon: L.lon };
  return {
    mode: "l3",
    spot, prompt: !L.touched, noVisible: !L.passes.some((p) => p.visible),
    t: L.t, day: L.day,
    sub: M.subPoint(L.t, sc),
    footRad: M.horizonAngle(M.ALT_KM) * Math.PI / 180,
    sunElev: (la, lo) => M.sunElevation(la, lo, L.t, sc),
    spotSunElev: (sec) => M.sunElevation(L.lat, L.lon, sec, sc),
    track: L.track, visRanges: L.vis,
    passes: L.passes, sel: L.sel, sky: L.sky,
    look, compass: compass(look.azDeg),
    minElev: M.MIN_ELEV_DEG, twilight: M.TWILIGHT_DEG,
  };
}

const mount = mountIssDay(canvas, { getState: canvasState, onFrame: tick });

function describeCanvas() {
  if (!canvas) return;
  let label;
  if (s.step === "l2") {
    label = `View from above the orbit's pole. The Sun is on the left, the Earth's shadow on the right, inside a 24 hour clock ring on GMT. ` +
      `${hhmm(s.l2.t)} GMT, the station is ${M.inShadowPlane(M.meanMotion() * s.l2.t + L2_PHI0, s.l2.beta) ? "in shadow" : "in sunlight"}. Sun ${Math.round(s.l2.beta)} degrees off the orbit plane.`;
  } else if (s.step === "l3" || (s.step === "done" && s.l3.sc)) {
    const L = s.l3;
    const v = L.passes.filter((p) => p.visible).length;
    label = `World map with the station's ground track for the day, a sky view from latitude ${L.lat.toFixed(0)}, longitude ${L.lon.toFixed(0)}, and a 24 hour strip of passes. ` +
      `${L.passes.length} passes above the horizon, ${v} that meet the visibility rules.`;
  } else {
    const n = s.l1.throws.length;
    label = `True-scale view of the Earth with the station 400 kilometres up. Thrown speed ${s.l1.v.toFixed(2)} kilometres a second. ${n} ${n === 1 ? "throw" : "throws"} so far. ` +
      "In a box, an astronaut and an apple float together.";
    const last = s.l1.throws[n - 1];
    if (last) label += ` The last one ${last.outcome === "falls" ? "fell into the air" : last.outcome === "orbits" ? "made an orbit" : "escaped"}.`;
  }
  canvas.setAttribute("aria-label", label);
}

function redraw() {
  describeCanvas();
  mount.redraw();
}

/* ---------- Steps ---------- */

function reveal(el) {
  el.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion ? "auto" : "smooth" });
}

function show(step, focusSel) {
  s.step = step;
  for (const el of $$(".id-step")) el.hidden = el.dataset.step !== step;
  if (status) status.textContent = STATUS[step] || "";
  const active = step === "l1" || step === "l2" || step === "l3";
  stageEl?.toggleAttribute("data-drag", active);
  stageEl?.toggleAttribute("data-sticky", active);
  if (stageEl) stageEl.dataset.level = step;
  if (step !== "l2") s.l2.playing = false;
  if (step !== "l3") s.l3.playing = false;
  syncPlayButtons();
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
    s.pred[q] = btn.dataset.v;
    for (const b of $$(`[data-q="${q}"]`)) b.setAttribute("aria-pressed", String(b === btn));
    const start = $("[data-start]");
    if (start) start.disabled = Object.values(s.pred).some((v) => v === null);
    say(`Your guess: ${btn.textContent.trim()}.`);
  });
}

$("[data-start]")?.addEventListener("click", () => {
  for (const b of $$("[data-q]")) b.disabled = true;
  show("l1", ".id-q");
  say("Level 1. Set a speed and press Throw. Each throw is marked on the strip under the picture.");
});

/* ---------- Level 1: throw sideways ---------- */

function setSpeed(v) {
  const x = Math.round(Math.min(M.SPEED_MAX_KMS, Math.max(0, v)) * 20) / 20;
  s.l1.v = x;
  const ctl = $('lab-control[name="speed"]');
  if (ctl && Number(ctl.value) !== x) ctl.value = x;
  redraw();
}

function finishRun() {
  const r = s.l1.run;
  if (!r || r.done) return;
  r.at = r.path.length - 1;
  r.done = true;
  announceThrow(r.throw);
  updateL1Gate();
  redraw();
}

function throwNow(v = s.l1.v) {
  finishRun();
  const sim = M.simulateThrow(v);
  const t = { v, outcome: sim.outcome, path: sim.path, sim };
  s.l1.throws.push(t);
  s.l1.run = { throw: t, path: sim.path, at: 0, done: false };
  if (prefersReducedMotion) finishRun(); else redraw();
}

function announceThrow(t) {
  const el = $("[data-shot]");
  const kmh = num(t.v * 3600);
  const sim = t.sim;
  let msg;
  if (t.outcome === "falls") {
    msg = `${t.v.toFixed(2)} km/s (${kmh} km/h): falls. Its path goes into the ground before it can come round, so it reaches this exhibit's ${M.STOP_ALT_KM} km stop line, where the air gets thick, after ${fmtMin(sim.tEnd)}. ` +
      "It was falling the whole time, just as the station is; this throw is too slow to keep missing the ground.";
  } else if (t.outcome === "orbits") {
    msg = sim.e < 0.01
      ? `${t.v.toFixed(2)} km/s (${kmh} km/h): a circle round the Earth, ${M.ALT_KM} km up all the way, once round in ${fmtMin(sim.periodS)}. Still falling, and still missing.`
      : `${t.v.toFixed(2)} km/s (${kmh} km/h): an orbit, from ${num(sim.rpAltKm)} km up at its lowest to ${num(sim.raAltKm)} km at its highest, once round in ${fmtMin(sim.periodS)}. It keeps falling and keeps missing.`;
  } else {
    msg = `${t.v.toFixed(2)} km/s (${kmh} km/h): gone. Above ${M.escapeSpeed().toFixed(2)} km/s at this height the path never turns back (model).`;
  }
  if (el) { el.textContent = msg; el.dataset.state = t.outcome; }
  say(msg);
}

function updateL1Gate() {
  const done = s.l1.throws.filter((x) => !(s.l1.run && x === s.l1.run.throw && !s.l1.run.done));
  const n = done.length;
  const need = Math.max(0, MIN_THROWS - n);
  const circ = $("[data-circ]");
  const next = $("[data-to-l2]");
  if (circ) {
    circ.disabled = need > 0;
    circ.textContent = need > 0
      ? `Show the circular speed (${need} more ${need === 1 ? "throw" : "throws"} to unlock)`
      : s.l1.circ ? "Hide the circular speed" : "Show the circular speed";
  }
  if (next) {
    next.disabled = need > 0 || !s.l1.circ;
    next.textContent = need > 0 ? "Next: sixteen sunrises (locked)" : !s.l1.circ ? "Next: show the circular speed first" : "Next: sixteen sunrises";
  }
  const seen = new Set(done.map((x) => x.outcome));
  const hint = $("[data-hint]");
  if (hint) {
    let t = "";
    if (n) {
      const missing = [];
      if (!seen.has("falls")) missing.push("one that falls (try slower)");
      if (!seen.has("orbits")) missing.push("one that goes round");
      if (!seen.has("escapes")) missing.push("one that gets away (try much faster)");
      t = missing.length ? `Not seen yet: ${missing.join(", ")}.` : "All three seen. Now find the speed where a throw first stops falling in.";
    }
    hint.hidden = !t;
    hint.textContent = t;
  }
}

$("[data-throw]")?.addEventListener("click", () => throwNow());

$("[data-circ]")?.addEventListener("click", () => {
  s.l1.circ = !s.l1.circ;
  const box = $("[data-circ-text]");
  if (box) {
    box.hidden = !s.l1.circ;
    box.innerHTML =
      `In the model a circle ${M.ALT_KM} km up needs <strong>${vc.toFixed(2)} km/s</strong> (${num(vc * 3600)} km/h), worked out as the square root of GM over r, with GM = ${M.MU.toLocaleString("en-GB")} km³/s² and r = ${num(M.R_EARTH)} + ${M.ALT_KM} km, ` +
      `using the Earth's equatorial radius, ${num(M.R_EARTH)} km. NASA gives the station's speed as 17,500 mph, 28,000 km/h, which is <strong>${REAL_SPEED_KMS.toFixed(2)} km/s</strong>. ` +
      `The two differ by ${((1 - vc / REAL_SPEED_KMS) * 100).toFixed(1)}%, which is NASA's rounding: a circle anywhere in NASA's 370 to 460 km range goes slightly slower than 28,000 km/h. ` +
      `At this height gravity is still <strong>${(M.gravityFraction() * 100).toFixed(1)}%</strong> of its pull at the ground (model; NASA Glenn gives 88.8% at about 250 miles). ` +
      `Twice the energy of a circle, ${M.escapeSpeed().toFixed(2)} km/s, is the escape speed.`;
  }
  updateL1Gate();
  say(s.l1.circ ? "The circular speed is marked on the strip, model and NASA." : "Circular speed hidden.");
  redraw();
});

$("[data-to-l2]")?.addEventListener("click", () => {
  finishRun();
  s.l1.run = null;
  l2Reset();
  show("l2", ".id-q");
  say(prefersReducedMotion
    ? "Level 2. Drag the Time slider through the 24 hours and tap Sunrise! each time the station comes out of the Earth's shadow."
    : "Level 2. Press Play to run a 24 hour day. Tap Sunrise! each time the station comes out of the Earth's shadow.");
});

/* ---------- Level 2: sixteen sunrises ---------- */

function l2Reset() {
  const L = s.l2;
  L.t = 0;
  L.maxT = 0;
  L.playing = false;
  L.caught = new Set();
  L.practice = new Set();
  L.misses = 0;
  L.sunrises = M.sunEvents(M.DAY_S, { betaDeg: L.beta, phi0: L2_PHI0 }).sunrises;
  const ctl = $('lab-control[name="clock"]');
  if (ctl) ctl.value = 0;
  l2Text();
  syncPlayButtons();
}

function l2Text() {
  const L = s.l2;
  const T = M.orbitPeriod();
  const nightS = M.nightSeconds(L.beta);
  const crit = M.criticalBetaDeg();
  const el = $("[data-l2-text]");
  if (el) {
    el.textContent = L.beta >= crit
      ? `Sun ${Math.round(L.beta)}° off the orbit plane: above ${crit.toFixed(1)}° the station never enters the Earth's shadow (model), so there are no sunrises at all.`
      : `Night per orbit: ${fmtMin(nightS)} of ${(T / 60).toFixed(1)} min (model, Sun ${Math.round(L.beta)}° off the orbit plane, Earth radius ${num(M.R_EARTH)} km). ` +
        `${L.sunrises.length} sunrises in this 24 hours; 86,400 s over the period is ${(M.DAY_S / T).toFixed(2)} orbits.`;
  }
  scoreText();
  updateL2Gate();
}

function scoreText() {
  const L = s.l2;
  const el = $("[data-l2-score]");
  if (!el) return;
  const seen = L.sunrises.filter((r, i) => r <= L.t && !L.practice.has(i)).length;
  el.textContent = L.sunrises.length
    ? `Caught ${L.caught.size} of ${seen} sunrises so far.${L.misses ? ` Taps with nothing to catch: ${L.misses}.` : ""}`
    : "Nothing to catch at this angle.";
}

function updateL2Gate() {
  const next = $("[data-to-l3]");
  if (!next) return;
  const ok = s.l2.maxT >= 6 * 3600 || s.l2.sunrises.length === 0 && s.l2.maxT > 0;
  next.disabled = !ok;
  next.textContent = ok ? "Next: spot it from home" : "Next: spot it from home (watch at least six hours of the day)";
}

function setClock(sec, fromSlider = false) {
  const L = s.l2;
  L.t = Math.min(M.DAY_S, Math.max(0, sec));
  L.maxT = Math.max(L.maxT, L.t);
  const ctl = $('lab-control[name="clock"]');
  if (ctl && !fromSlider) ctl.value = Math.round(L.t / 60);
  scoreText();
  updateL2Gate();
  redraw();
}

function tapSunrise() {
  const L = s.l2;
  const T = M.orbitPeriod();
  let idx = -1;
  L.sunrises.forEach((r, i) => { if (r <= L.t) idx = i; });
  const inWindow = idx >= 0 && !L.caught.has(idx) && L.t - L.sunrises[idx] <= CATCH_FRACTION * T;
  // A sunrise the visitor was carried to by "Next sunrise" is practice: the
  // button lands just after it, so tapping then needs no timing at all.
  const practice = inWindow && L.practice.has(idx);
  const ok = inWindow && !practice;
  if (ok) L.caught.add(idx); else if (!practice) L.misses++;
  scoreText();
  say(ok ? `Caught. ${L.caught.size} sunrises so far.` : practice ? "That one was a jump, so it is practice and does not count. Play the day or drag the Time slider to catch them for real." : "Nothing to catch just then.");
  redraw();
}

$("[data-sunrise]")?.addEventListener("click", tapSunrise);

$("[data-next-rise]")?.addEventListener("click", () => {
  const L = s.l2;
  const nextIdx = L.sunrises.findIndex((r) => r > L.t + 1);
  const next = L.sunrises[nextIdx];
  if (next !== undefined) { L.practice.add(nextIdx); setClock(next + 20); }
  else setClock(M.DAY_S);
  say(`${hhmm(L.t)} GMT, just after a sunrise.`);
});

for (const b of $$("[data-play]")) {
  b.addEventListener("click", () => {
    if (s.step === "l2") {
      if (!s.l2.playing && s.l2.t >= M.DAY_S - 1) setClock(0);
      s.l2.playing = !s.l2.playing;
    } else if (s.step === "l3") {
      if (!s.l3.playing && s.l3.t >= M.DAY_S - 1) setL3Time(0);
      s.l3.playing = !s.l3.playing;
    }
    syncPlayButtons();
  });
}

function syncPlayButtons() {
  const on = s.step === "l2" ? s.l2.playing : s.step === "l3" ? s.l3.playing : false;
  for (const b of $$("[data-play]")) {
    b.textContent = on ? "Pause" : "Play";
    b.setAttribute("aria-pressed", String(on));
    // Reduced motion: nothing animates by itself; the slider and the
    // jump button move the day instead.
    b.hidden = prefersReducedMotion;
  }
}

$("[data-to-l3]")?.addEventListener("click", () => {
  s.l2.playing = false;
  l3Recompute(true);
  show("l3", ".id-q");
  say("Level 3. Tap the map to stand somewhere, or use the latitude and longitude sliders. Then find a pass that is marked visible.");
});

/* ---------- Level 3: spot it from home ---------- */

function l3Recompute(initial = false) {
  const L = s.l3;
  L.sc = M.makeScenario(L.day);
  L.passes = M.scanDay(L.lat, L.lon, L.sc, { stepS: 20 });
  L.track = M.dayTrack(L.sc, 60);
  L.vis = L.passes.flatMap((p) => p.visibleRanges);
  const good = L.passes.filter((p) => p.visible);
  L.sel = good[0] || L.passes.filter((p) => p.maxElevDeg >= M.MIN_ELEV_DEG).sort((a, b) => b.maxElevDeg - a.maxElevDeg)[0] || L.passes[0] || null;
  L.why = M.whyNone(L.passes, L.lat);
  l3Sky();
  l3Chips();
  l3Text(initial);
  const ln = $("[data-day-label]");
  if (ln) ln.textContent = `(day +${L.day + 1})`;
}

function l3Sky() {
  const L = s.l3;
  L.sky = [];
  if (!L.sel) return;
  for (let t = L.sel.start; t <= L.sel.end; t += 10) {
    const l = M.look(t, L.lat, L.lon, L.sc);
    if (l.above) L.sky.push({ az: l.azDeg, el: l.elevDeg, vis: l.visible });
  }
}

function l3Chips() {
  const box = $("[data-chips]");
  if (!box) return;
  const L = s.l3;
  const list = L.passes.filter((p) => p.maxElevDeg >= M.MIN_ELEV_DEG);
  box.innerHTML = "";
  if (!list.length) { box.hidden = true; return; }
  box.hidden = false;
  list.forEach((p) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ctrl id-chip";
    b.dataset.visible = String(p.visible);
    b.setAttribute("aria-pressed", String(p === L.sel));
    b.textContent = `${hhmm(p.visible ? p.visibleRanges[0][0] : p.tMax)} · ${Math.round(p.maxElevDeg)}${DEG} · ${p.visible ? "visible" : "not visible"}`;
    b.addEventListener("click", () => {
      L.sel = p;
      l3Sky();
      setL3Time(p.visible ? p.visibleRanges[0][0] : p.start);
      for (const c of $$(".id-chip")) c.setAttribute("aria-pressed", String(c === b));
      say(`Pass at ${hhmm(p.tMax)} GMT, peaking at ${Math.round(p.maxElevDeg)} degrees, ${p.visible ? "visible" : "not visible"}.`);
    });
    box.appendChild(b);
  });
}

function whySentence(why, lat) {
  const reach = M.maxLatitudeFor(0);
  switch (why) {
    case "never-up":
      return `At ${Math.abs(lat).toFixed(0)}° ${lat >= 0 ? "north" : "south"} the station never comes above the horizon: its path only reaches ${M.INC_DEG}° and can be seen to about ${reach.toFixed(0)}° (model).`;
    case "too-low":
      return `Every pass today stays under ${M.MIN_ELEV_DEG}° above the horizon, the exhibit's own minimum, so none counts.`;
    case "daylight":
      return `The station is high enough, but only while the sky at your spot is too bright: the Sun has to be at least ${M.TWILIGHT_DEG}° below the horizon (the end of civil twilight, USNO), and on these passes it is not.`;
    case "shadow":
      return "The sky is dark enough when it passes, but the station is in the Earth's shadow then, so there is no sunlight on it to see.";
    case "mismatch":
      return "The sky is dark and the station is sunlit at different moments, but never at the same time while it is high enough.";
    default:
      return "";
  }
}

// The page runs on GMT, which means nothing at a kitchen window. Local mean
// solar time is GMT plus one hour per 15 degrees of longitude; it is the
// time by the Sun, not the clock time of any time zone, and it says whether
// a pass is in the evening or the morning.
function localNote(pass) {
  if (!pass) return "";
  const L = s.l3;
  const t0 = pass.visibleRanges[0][0];
  const local = t0 + (L.lon / 15) * 3600;
  const h = (((local % M.DAY_S) + M.DAY_S) % M.DAY_S) / 3600;
  return `The first is at ${hhmm(t0)} GMT, about ${hhmm(local)} by the Sun where you are (${h >= 12 ? "after sunset" : "before sunrise"}; clock time depends on your time zone). `;
}

function l3Text(initial = false) {
  const L = s.l3;
  const el = $("[data-l3-text]");
  const nextBtn = $("[data-next-day]");
  if (!el) return;
  const good = L.passes.filter((p) => p.visible);
  const drift = M.relativeDriftDegPerDay();
  const where = `${Math.abs(L.lat).toFixed(0)}°${L.lat >= 0 ? "N" : "S"} ${Math.abs(L.lon).toFixed(0)}°${L.lon >= 0 ? "E" : "W"}`;
  if (good.length) {
    el.dataset.state = "good";
    el.textContent = `${where}, ${L.day === 0 ? "day 0" : `day +${L.day}`}: ${good.length} visible ${good.length === 1 ? "pass" : "passes"} in this 24 hours (model). ` +
      `${localNote(good[0])}Press a pass below, or drag the time, and watch it cross the sky. Green on the sky circle is where all three rules hold.`;
  } else {
    el.dataset.state = "none";
    el.textContent = `${where}, ${L.day === 0 ? "day 0" : `day +${L.day}`}: no visible pass in this 24 hours. ${whySentence(L.why, L.lat)} ` +
      (L.why === "never-up" ? "Move the pin nearer the equator, or pick another spot." :
        `Try the next day: each day the orbit's plane turns about ${Math.abs(drift).toFixed(1)}° against the Sun (the model's J2 drift plus the Sun's own motion), so the pattern of passes shifts. NASA says opportunities can range from one a month to several a week.`);
  }
  if (nextBtn) nextBtn.hidden = false;
  if (!initial) say(el.textContent);
}

function setL3Time(sec, fromSlider = false) {
  const L = s.l3;
  L.t = Math.min(M.DAY_S, Math.max(0, sec));
  const ctl = $('lab-control[name="clock3"]');
  if (ctl && !fromSlider) ctl.value = Math.round(L.t / 60);
  redraw();
}

function setSpot(lat, lon, fromSlider = false) {
  const L = s.l3;
  L.lat = Math.round(Math.min(80, Math.max(-80, lat)));
  L.lon = Math.round(Math.min(180, Math.max(-180, lon)));
  L.touched = true;
  if (!fromSlider) {
    const a = $('lab-control[name="lat"]');
    const b = $('lab-control[name="lon"]');
    if (a && Number(a.value) !== L.lat) a.value = L.lat;
    if (b && Number(b.value) !== L.lon) b.value = L.lon;
  }
  l3Recompute();
  redraw();
}

$("[data-next-day]")?.addEventListener("click", () => {
  s.l3.day += 1;
  l3Recompute();
  setL3Time(0);
  redraw();
});

$("[data-finish]")?.addEventListener("click", () => {
  s.finished = true;
  s.l3.playing = false;
  showResults();
  $("[data-done-text]").textContent = "The results are below the exhibit.";
  show("done", ".id-q");
  say("Done. The results are below the exhibit.");
});

/* ---------- Controls ---------- */

document.addEventListener("lab-input", (e) => {
  const { name, value } = e.detail;
  if (name === "speed") { s.l1.v = value; redraw(); }
  else if (name === "clock") { s.l2.playing = false; syncPlayButtons(); setClock(value * 60, true); }
  else if (name === "beta") { s.l2.beta = value; l2Reset(); redraw(); }
  else if (name === "lat") setSpot(value, s.l3.lon, true);
  else if (name === "lon") setSpot(s.l3.lat, value, true);
  else if (name === "clock3") { s.l3.playing = false; syncPlayButtons(); setL3Time(value * 60, true); }
});

/* ---------- Frame clock ---------- */

function tick(dt) {
  if (s.step === "l1") {
    const r = s.l1.run;
    if (!r || r.done) return;
    r.at += (dt * (r.path.length - 1)) / RUN_SECONDS;
    if (r.at >= r.path.length - 1) finishRun();
  } else if (s.step === "l2" && s.l2.playing) {
    setClock(s.l2.t + dt * L2_RATE);
    if (s.l2.t >= M.DAY_S) { s.l2.playing = false; syncPlayButtons(); say("End of the 24 hours."); }
  } else if (s.step === "l3" && s.l3.playing) {
    setL3Time(s.l3.t + dt * L3_RATE);
    if (s.l3.t >= M.DAY_S) { s.l3.playing = false; syncPlayButtons(); }
  }
}

/* ---------- Pointer ----------

   Level 1: a press on the speed strip sets the speed and a drag moves it.
   Level 3: a press on the map puts the pin there and a drag moves it; a
   press on the day strip moves the time. Taps anywhere else do nothing, so a
   thumb that lands on the picture while scrolling does no harm. */

let drag = null;
const rectXY = (e) => {
  const r = canvas.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
};

function applyPointer(kind, x, y) {
  if (kind === "speed") { const v = mount.speedAt(x); if (v !== null) setSpeed(v); }
  else if (kind === "map") {
    const p = mount.mapAt(x, y);
    if (p) setSpot(p.lat, p.lon);
  } else if (kind === "day") {
    const t = mount.dayAt(x);
    if (t !== null) { s.l3.playing = false; syncPlayButtons(); setL3Time(t); }
  }
}

canvas?.addEventListener("pointerdown", (e) => {
  const [x, y] = rectXY(e);
  let kind = null;
  if (s.step === "l1" && mount.inStrip(x, y)) kind = "speed";
  else if (s.step === "l3" && mount.inMap(x, y)) kind = "map";
  else if (s.step === "l3" && mount.inDay(x, y)) kind = "day";
  if (!kind) return;
  canvas.setPointerCapture?.(e.pointerId);
  drag = kind;
  applyPointer(kind, x, y);
  e.preventDefault();
});
canvas?.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const [x, y] = rectXY(e);
  applyPointer(drag, x, y);
});
const endDrag = () => { drag = null; };
canvas?.addEventListener("pointerup", endDrag);
canvas?.addEventListener("pointercancel", endDrag);
canvas?.addEventListener("lostpointercapture", endDrag);

/* ---------- Results ---------- */

const COLS = ["Quantity", "Model value", "Real number", "Source"];
function row(cells) {
  return `<tr>${cells.map((c, i) => `<${i === 0 ? "th scope=\"row\"" : "td"} data-label="${COLS[i]}"${i === 1 || i === 2 ? " class=\"num\"" : ""}>${c}</${i === 0 ? "th" : "td"}>`).join("")}</tr>`;
}

function scoreOne(key, truth, said, detail, label) {
  const el = $(`[data-score="${key}"]`);
  if (!el) return 0;
  const textEl = el.querySelector("[data-score-text]");
  const guess = s.pred[key];
  if (guess === null) {
    el.dataset.state = "";
    textEl.textContent = `You skipped this one. ${detail}`;
    return 0;
  }
  const right = guess === truth;
  el.dataset.state = right ? "good" : "bad";
  textEl.textContent = `You said ${said(guess)}. ${right ? "Right. " : "Not this time. "}${detail}`;
  void label;
  return right ? 1 : 0;
}

function showResults() {
  const sec = $("#results");
  if (!sec) return;
  sec.hidden = false;
  const T = M.orbitPeriod();
  const g = M.gravityFraction() * 100;
  const perDay = M.DAY_S / T;
  let score = 0;
  score += scoreOne("grav", "90", (v) => `about ${v}%`,
    `Gravity at the station's height is about ${g.toFixed(1)}% of the ground value (model, ${M.ALT_KM} km up, Earth radius ${num(M.R_EARTH)} km); NASA Glenn gives 88.8% at about 250 miles. ` +
    "Crews float because they, the station and everything loose are falling together round the Earth, not because gravity has gone.");
  score += scoreOne("sun", "16", (v) => `${v}`,
    `The model's period is ${(T / 60).toFixed(1)} minutes, so ${perDay.toFixed(2)} orbits and ${perDay.toFixed(2)} sunrises in 24 hours (with the Sun in the orbit plane, there are slightly fewer or more by where the day starts); NASA says 16 sunrises and sunsets in 24 hours, and the Earth Observations tutorial puts the count between 15.5 and 15.9. ` +
    "The crew's day is kept on GMT, so those sunrises fall at all hours of it.");
  score += scoreOne("vis", "dusk", (v) => ({ midday: "midday", dusk: "in the dark a while after sunset or before sunrise", midnight: "only around midnight", never: "never" })[v],
    `NASA's Spot the Station says the station reflects sunlight, is not bright enough to see by day, and is best seen at twilight or at night, within a few hours of sunrise or sunset. ` +
    `The model's three rules: at least ${M.MIN_ELEV_DEG}° up (the exhibit's own rule), in sunlight, and the Sun at least ${M.TWILIGHT_DEG}° below your horizon (USNO's civil twilight).`);
  const sl = $("[data-score-line]");
  if (sl) {
    const answered = Object.values(s.pred).filter((v) => v !== null).length;
    sl.textContent = answered ? `${score} of 3 predictions right.` : "You skipped the predictions.";
  }

  const night = M.nightSeconds(0);
  $("[data-table]").innerHTML = [
    row(["Height above the ground", `${M.ALT_KM} km (the exhibit's choice)`, `${M.REAL.altLowKm} to ${M.REAL.altHighKm} km`, "NASA, International Space Station"]),
    row(["Speed", `${vc.toFixed(2)} km/s (${num(vc * 3600)} km/h)`, `17,500 mph, 28,000 km/h, ${REAL_SPEED_KMS.toFixed(2)} km/s`, "NASA, Spot the Station"]),
    row(["Time for one orbit", `${(T / 60).toFixed(1)} min`, `${M.REAL.periodMinLow} to ${M.REAL.periodMinHigh} min`, "NASA JSC, Earth Observations orbit tutorial"]),
    row(["Orbits in 24 hours", perDay.toFixed(2), `16 (15.5 to 15.9)`, "NASA facts and figures; JSC tutorial"]),
    row(["Gravity at that height", `${g.toFixed(1)}% of the ground value`, `88.8% at about 250 miles`, "NASA Glenn, What is microgravity?"]),
    row(["Night per orbit, Sun in the orbit plane", `${fmtMin(night)} of ${(T / 60).toFixed(1)} (${(night / T).toFixed(2)} of an orbit)`, "nearly two-fifths of an orbit, the longest", "NTRS 20150001912"]),
    row(["Beta angle above which there is no night", `${M.criticalBetaDeg().toFixed(1)}° at ${M.ALT_KM} km`, `${M.REAL.criticalBetaDeg}° at ${M.REAL.criticalBetaAltKm} km`, "NTRS 20150001912"]),
    row(["Inclination", `${M.INC_DEG}°`, `${M.REAL.inclinationDeg}°`, "NASA, International Space Station"]),
  ].join("");
}

for (const link of $$('[data-show-results], .id-step a[href="#results"]')) {
  link.addEventListener("click", () => {
    showResults();
    $("#results h2")?.focus({ preventScroll: true });
  });
}

/* ---------- Crew-day key ---------- */

const keyEl = $("[data-crew-key]");
if (keyEl) {
  const rows = [
    ["sleep", "Sleep, 21:30 to 06:00"],
    ["wake", "Wake-up, inspection, breakfast, 06:00 to 07:30"],
    ["work", "Planning conference and work, 07:30 to 18:40"],
    ["meal", "Midday meal, 12:10 to 13:40"],
    ["evening", "Evening planning, dinner, pre-sleep, 18:40 to 21:30"],
  ];
  keyEl.innerHTML = rows.map(([id, t]) => `<li><span class="id-swatch" style="background:${CREW_COLORS[id]}"></span>${t}</li>`).join("");
}

/* ---------- Restart ---------- */

$("[data-restart]")?.addEventListener("click", () => {
  s.pred = { grav: null, sun: null, vis: null };
  for (const b of $$("[data-q]")) { b.disabled = false; b.setAttribute("aria-pressed", "false"); }
  $("[data-start]").disabled = true;
  s.l1 = { v: 5, throws: [], run: null, circ: false };
  s.l2.beta = 0;
  s.l3.day = 0;
  s.finished = false;
  const sh = $("[data-shot]");
  if (sh) { sh.textContent = ""; sh.dataset.state = ""; }
  const ct = $("[data-circ-text]");
  if (ct) ct.hidden = true;
  for (const [n, v] of [["speed", 5], ["beta", 0]]) { const c = $(`lab-control[name="${n}"]`); if (c) c.value = v; }
  updateL1Gate();
  $("#results").hidden = true;
  show("predict", ".id-q");
});

/* ---------- Start ---------- */

l2Reset();
l3Recompute(true);
updateL1Gate();
if (prefersReducedMotion) {
  const hint = $("[data-play-hint]");
  if (hint) hint.textContent = "Drag the Time slider through the day, and tap";
}
syncPlayButtons();

window.__issday = {
  state: s, M, mount,
  show, throwNow, finishRun, setSpeed, setClock, setSpot, setL3Time, tapSunrise, showResults,
  l2Reset, l3Recompute,
  // Test hook: put the page in a given state without playing the game.
  set(partial) { Object.assign(s, partial); redraw(); },
};

show("predict");
