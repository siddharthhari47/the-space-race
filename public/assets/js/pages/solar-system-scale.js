// The Solar System to scale — page controller.
//
// Three steps, in order:
//
//   predict (two guesses) -> walk (scroll, or race a photon) -> results
//
// The walk is hidden until both guesses are in, and the guesses lock once it
// opens. The strip's readout prints light times as you scroll, so a guess
// that could be changed after a look at Neptune would have nothing left to
// score. The skip link shows everything without scoring, for anyone who came
// for the table.
//
// Every number comes from systems/solar-scale.js. This file builds the strip
// out of ordinary DOM elements, keeps the readout in step with the scroll
// position, and runs the photon. It does no physics beyond formatting.
//
// Why DOM and not a canvas: the strip is about 130,000 pixels tall and almost
// all of it is empty, which is the point. A canvas would have to redraw a
// window onto that on every scroll event; positioned elements in a scrolling
// box get native scrolling, native keyboard handling (arrows, Page Down, End)
// and momentum on a phone for nothing, and the page only touches them once.

import * as S from "../systems/solar-scale.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const reducedMotion = (() => {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
})();

// Where the "you are here" line sits in the strip's window, as a fraction of
// its height from the top. The strip is padded so that at scrollTop 0 the
// Sun's centre is on this line, which makes the distance at the line exactly
// scrollTop times KM_PER_PX with no offset to carry around.
const PROBE = 0.35;

// Within this many pixels of a planet the readout says "At Earth" rather than
// "Earth in 0.1 million km".
const AT_PX = 14;

const s = {
  answers: { bead: null, neptune: null },
  locked: false,
  skipped: false,
  scored: false,
  km: 0,
  lastPassed: null,
  race: {
    running: false,
    speed: 1,
    km: 0,       // where the photon is
    started: false,
    wallSeconds: 0, // real seconds the visitor spent watching it
    // The current segment of the race: where and when it started. See
    // photonAt in systems/solar-scale.js for why the photon is worked out
    // from the clock rather than added up frame by frame.
    segKm: 0,
    segT: 0,
    segWall: 0,
    lastSetTop: -1,
    lastJumped: null, // reduced motion: the last planet the view jumped to
    best: null,  // furthest planet a photon has reached this visit
    bestSpeed: 1,
  },
  resultsShown: false,
};

const scroller = $("[data-scroller]");
const track = $("[data-track]");
const live = $("[data-live]");
const out = {
  kmLabel: $('[data-out="km-label"]'),
  km: $('[data-out="km"]'),
  au: $('[data-out="au"]'),
  light: $('[data-out="light"]'),
  lightLabel: $('[data-out="light-label"]'),
  next: $('[data-out="next"]'),
  gap: $('[data-out="gap"]'),
};
const raceBtn = $("[data-race]");
const stopBtn = $("[data-stop]");
const raceNote = $("[data-race-note]");
const speedBtns = $$("[data-speed]");

let photonEl = null;

/* ---------- Formatting ---------- */

const nf0 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf3 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 3 });

function kmText(km) {
  if (km < 1e6) return `${nf0.format(km)} km`;
  return `${nf1.format(km / 1e6)} million km`;
}

const auText = (km) => `${S.kmToAu(km).toFixed(km < S.AU_KM * 10 ? 3 : 2)} AU`;

function pxText(px) {
  if (px >= 10) return px.toFixed(0);
  if (px >= 1) return px.toFixed(1);
  return px.toFixed(2);
}

// A wait, for the race readout. Under ten seconds it gets a decimal, or at
// 1000x every inner planet would show "0 s" until the moment it arrived.
const wait = (t) => (t < 10 ? `${t.toFixed(1)} s` : S.formatDuration(t));

function say(text) {
  if (live) live.textContent = text;
}

/* ---------- Static numbers in the copy ---------- */

function fillNumbers() {
  const n = {
    kmpx: nf0.format(S.KM_PER_PX),
    kmpx2: nf0.format(S.KM_PER_PX),
    sunpx: String(S.SUN_PX),
    lightpx: S.LIGHT_PX_PER_S.toFixed(1),
  };
  for (const el of $$("[data-n]")) {
    if (n[el.dataset.n] !== undefined) el.textContent = n[el.dataset.n];
  }
}

/* ---------- Predictions ---------- */

function buildQuestions() {
  for (const [key, q] of Object.entries(S.QUESTIONS)) {
    const box = $(`[data-options="${key}"]`);
    if (!box) continue;
    box.innerHTML = "";
    for (const c of q.choices) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ctrl ss-opt";
      b.textContent = c.label;
      b.dataset.choice = c.id;
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", () => choose(key, c.id));
      box.appendChild(b);
    }
  }
}

function choose(key, id) {
  if (s.locked || s.skipped) return;
  s.answers[key] = id;
  for (const b of $$(`[data-options="${key}"] .ss-opt`)) {
    b.setAttribute("aria-pressed", b.dataset.choice === id ? "true" : "false");
  }
  const missing = Object.values(s.answers).filter((v) => !v).length;
  const status = $("[data-predict-status]");
  if (missing > 0) {
    if (status) status.textContent = "One more";
    // Move on to the question still open, so a keyboard user is not left to
    // hunt for it.
    if (key === "bead" && !s.answers.neptune) {
      $('[data-question="neptune"] .ss-qtitle')?.focus({ preventScroll: true });
    }
    return;
  }
  lockGuesses();
}

function lockGuesses() {
  s.locked = true;
  for (const b of $$(".ss-opt")) b.disabled = b.getAttribute("aria-pressed") !== "true";
  const status = $("[data-predict-status]");
  if (status) status.textContent = "Locked in";
  const note = $("[data-predict-note]");
  if (note) note.textContent = "Guesses locked in. Now walk it and see.";
  openWalk(true);
  say("Guesses locked in. The strip is open. Scroll down it, or race a photon.");
}

function openWalk(moveThere) {
  const sec = $("#walk");
  if (!sec) return;
  const wasHidden = sec.hidden;
  sec.hidden = false;
  if (wasHidden) layout();
  if (moveThere) toWalk();
}

// Bring the readout and the strip on screen together. Scrolling to the
// section's start would put the title and its paragraph at the top, and on a
// phone the strip would then begin below the fold, so the page scrolls to the
// readout instead. Focus still goes to the title, without scrolling, so a
// screen reader starts at the heading.
function toWalk() {
  const hud = $("[data-hud]");
  (hud || $("#walk"))?.scrollIntoView({ block: "start", behavior: reducedMotion ? "auto" : "smooth" });
  $("[data-walk-title]")?.focus({ preventScroll: true });
}

/* ---------- The strip ---------- */

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

// Built once. Every element sits at top: calc(var(--pad) + Npx), so a resize
// only has to change --pad and the track's height, not touch each element.
function buildTrack() {
  track.innerHTML = "";

  const line = el("div", "ss-line");
  line.style.height = `${S.WALK_PX}px`;
  track.appendChild(line);

  for (const m of S.railMarks()) {
    const t = el("div", `ss-mark ss-mark-${m.kind}`);
    t.style.top = `calc(var(--pad) + ${m.px.toFixed(2)}px)`;
    if (m.text) t.appendChild(el("span", "ss-mark-text", m.text));
    track.appendChild(t);
  }

  // The Sun, true size: 40 px across.
  const sun = el("div", "ss-body ss-body-sun");
  sun.style.top = "var(--pad)";
  const disc = el("div", "ss-sun");
  disc.style.width = disc.style.height = `${S.SUN_PX}px`;
  sun.appendChild(disc);
  const sunLabel = el("div", "ss-label");
  sunLabel.appendChild(el("span", "ss-name", "Sun"));
  sunLabel.appendChild(el("span", "ss-size", `${nf0.format(S.SUN_DIAMETER_KM)} km across, ${S.SUN_PX} px here`));
  sun.appendChild(sunLabel);
  track.appendChild(sun);

  for (const p of S.PLANETS) {
    const px = S.kmToPx(p.distanceKm);
    const size = S.sizePx(p);
    const body = el("div", `ss-body ss-body-${p.id}`);
    body.style.top = `calc(var(--pad) + ${px.toFixed(2)}px)`;
    body.dataset.planet = p.id;

    // The ring is only a finder. Its size is fixed so even Mercury, at a
    // seventh of a pixel, has something to look for.
    const ring = el("div", "ss-ring");
    body.appendChild(ring);
    const dot = el("div", "ss-dot");
    dot.style.width = dot.style.height = `${size}px`;
    body.appendChild(dot);

    const label = el("div", "ss-label");
    label.appendChild(el("span", "ss-name", p.name));
    label.appendChild(el("span", "ss-size", `${nf0.format(p.diameterKm)} km across, ${pxText(size)} px here`));
    label.appendChild(el("span", "ss-size", `${kmText(p.distanceKm)} · ${S.formatFixed(S.lightSeconds(p.distanceKm))} of light`));

    const inset = el("div", "ss-inset");
    const big = el("div", "ss-inset-dot");
    const bigPx = size * S.INSET_MAG;
    big.style.width = big.style.height = `${bigPx}px`;
    inset.appendChild(big);
    inset.appendChild(el("span", "ss-inset-cap", `${S.INSET_MAG}× larger`));
    label.appendChild(inset);
    body.appendChild(label);
    track.appendChild(body);
  }

  photonEl = el("div", "ss-photon");
  photonEl.hidden = true;
  photonEl.setAttribute("aria-hidden", "true");
  track.appendChild(photonEl);
}

function layout() {
  if (!scroller || !track) return;
  const h = scroller.clientHeight || 500;
  const pad = Math.round(h * PROBE);
  track.style.setProperty("--pad", `${pad}px`);
  // The line and the Sun's centre must agree to the pixel, so the line is
  // placed from the same rounded number rather than from a CSS percentage.
  const probe = $(".ss-probe");
  if (probe) probe.style.top = `${pad}px`;
  // Padding below Neptune is whatever lets Neptune reach the probe line and
  // no further, so the end of the scroll is the end of the walk.
  track.style.height = `${Math.ceil(pad + S.WALK_PX + (h - pad))}px`;
  setTop(S.kmToPx(s.race.running ? s.race.km : s.km));
}

function setTop(px) {
  const top = Math.round(px);
  s.race.lastSetTop = top;
  scroller.scrollTop = top;
}

/* ---------- Readout ---------- */

function render(km) {
  const d = S.clampKm(km);
  const racing = s.race.running;
  // While the race runs the readout follows the photon, and with reduced
  // motion on the strip only jumps from planet to planet, so the two can
  // differ for a while. The label says whose distance this is.
  if (out.kmLabel) out.kmLabel.textContent = racing ? "Photon at" : "From the Sun";
  out.km.textContent = kmText(d);
  out.au.textContent = auText(d);
  out.light.textContent = S.formatDuration(S.lightSeconds(d));
  out.lightLabel.textContent = racing ? "Photon clock" : "Light has been travelling";

  const at = S.planetNear(d, AT_PX * S.KM_PER_PX);
  const nxt = S.nextPlanet(d + AT_PX * S.KM_PER_PX);
  // Scrolling, the next planet is a distance. Racing, it is a wait at the
  // chosen speed, counting down, because a distance in millions of km does
  // not tell anyone whether to sit tight or press 1000x.
  const until = (p) => racing
    ? `${p.name} in ${wait(S.raceSeconds(p.distanceKm - d, s.race.speed))} at ${s.race.speed}×`
    : `${p.name} in ${kmText(p.distanceKm - d)}`;
  let nextText;
  if (at && at === S.NEPTUNE) nextText = "At Neptune. End of the line.";
  else if (at) nextText = `At ${at.name}. ${until(nxt)}`;
  else if (d < AT_PX * S.KM_PER_PX) nextText = `At the Sun. ${until(S.PLANETS[0])}`;
  else if (nxt) nextText = `Next: ${until(nxt)}`;
  else nextText = "At Neptune. End of the line.";
  out.next.textContent = nextText;

  // The empty stretches are the lesson, but a long run of black with
  // nothing changing is also where people give up. Counting the empty
  // windows since the last planet turns the emptiness into a number that
  // grows, using nothing but the scale and the window height.
  if (out.gap) {
    const win = scroller?.clientHeight || 500;
    const prev = at ? S.PLANETS[S.PLANETS.indexOf(at) - 1] : S.lastPlanet(d);
    const fromKm = prev ? prev.distanceKm : 0;
    const toKm = at ? at.distanceKm : d;
    const n = S.kmToPx(toKm - fromKm) / win;
    const nText = n >= 10 ? nf0.format(n) : n.toFixed(1);
    const since = prev ? prev.name : "the Sun";
    if (d < AT_PX * S.KM_PER_PX) out.gap.textContent = "";
    else if (at) out.gap.textContent = `${at.name} came after ${nText} windows of empty strip since ${since}.`;
    else out.gap.textContent = `${nText} windows of empty strip since ${since}.`;
  }

  if (photonEl) {
    photonEl.hidden = !s.race.started;
    photonEl.style.top = `calc(var(--pad) + ${S.kmToPx(s.race.km).toFixed(2)}px)`;
  }

  // Announce a planet once, as it is reached, rather than every scroll tick.
  const passed = S.lastPlanet(d + AT_PX * S.KM_PER_PX);
  if (passed && passed !== s.lastPassed && (!s.lastPassed || passed.distanceKm > s.lastPassed.distanceKm)) {
    say(`${passed.name}: ${kmText(passed.distanceKm)} from the Sun, ${S.formatFixed(S.lightSeconds(passed.distanceKm))} for light.`);
  }
  s.lastPassed = passed;

  if (d >= S.WALK_KM - AT_PX * S.KM_PER_PX) reachedEnd();
}

function onScroll() {
  if (s.race.running) {
    // A scroll the page did not make means the visitor has grabbed the strip.
    if (Math.abs(scroller.scrollTop - s.race.lastSetTop) > 2) stopRace("You took over.");
    else return;
  }
  s.km = S.clampKm(S.pxToKm(scroller.scrollTop));
  render(s.km);
}

/* ---------- Photon race ---------- */

let raf = 0;

// When a control that has focus is about to be disabled, hand focus to the
// one that replaces it. A disabled button drops focus to <body>, and from
// there the next key a keyboard user presses lands on the document and stops
// the race they just started.
function handFocus(from, to) {
  const a = document.activeElement;
  if (a === from || a === document.body || a === null) to.focus();
}

// Start a new segment of the race from where the photon is now.
function beginSegment() {
  const r = s.race;
  r.segKm = r.km;
  r.segWall = r.wallSeconds;
  r.segT = performance.now();
}

// Bring the photon up to the present, from the clock.
function advance() {
  const r = s.race;
  const t = Math.max(0, (performance.now() - r.segT) / 1000);
  r.km = S.photonAt(r.segKm, t, r.speed);
  r.wallSeconds = r.segWall + t;
}

function speedHint() {
  const r = s.race;
  const v = r.speed;
  const earth = S.PLANETS[2];
  const toNep = wait(S.raceSeconds(S.WALK_KM - r.km, v));
  const head = r.km < earth.distanceKm - 1
    ? `At ${v}× it reaches Earth in ${wait(S.raceSeconds(earth.distanceKm - r.km, v))} and Neptune in ${toNep}.`
    : `At ${v}× it reaches Neptune in ${toNep}.`;
  return v === 1 ? `${head} Try 100× or 1000× if you would rather not wait.` : head;
}

function writeRaceNote() {
  const lead = reducedMotion
    ? "The photon is on its way. Reduced motion is on, so the strip jumps to each planet as the photon reaches it instead of scrolling."
    : "The photon is on its way.";
  raceNote.textContent = `${lead} ${speedHint()} Press Stop, scroll or press a key to take over.`;
}

function setSpeed(v) {
  const r = s.race;
  if (r.running) advance();
  r.speed = v;
  for (const b of speedBtns) b.setAttribute("aria-pressed", Number(b.dataset.speed) === v ? "true" : "false");
  if (r.running) {
    r.bestSpeed = Math.max(r.bestSpeed, v);
    beginSegment();
    writeRaceNote();
  }
}

function startRace() {
  const r = s.race;
  const fresh = !r.started || r.km >= S.WALK_KM - 1;
  if (fresh) {
    r.km = 0;
    r.wallSeconds = 0;
    r.lastJumped = null;
    r.bestSpeed = r.speed;
  }
  r.started = true;
  r.running = true;
  r.bestSpeed = Math.max(r.bestSpeed, r.speed);
  beginSegment();
  stopBtn.disabled = false;
  handFocus(raceBtn, stopBtn);
  raceBtn.disabled = true;
  raceBtn.textContent = "Racing…";
  setTop(S.kmToPx(r.km));
  writeRaceNote();
  say(fresh ? "A photon has left the Sun." : "The photon is moving again.");
  render(r.km);
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(tick);
}

function tick() {
  const r = s.race;
  if (!r.running) return;
  advance();
  s.km = r.km;

  if (reducedMotion) {
    const passed = S.lastPlanet(r.km);
    if (passed && passed !== r.lastJumped) {
      r.lastJumped = passed;
      setTop(S.kmToPx(passed.distanceKm));
    }
  } else {
    setTop(S.kmToPx(r.km));
  }
  const reached = S.lastPlanet(r.km);
  if (reached && (!r.best || reached.distanceKm > r.best.distanceKm)) r.best = reached;

  render(r.km);
  if (r.km >= S.WALK_KM) {
    finishRace();
    return;
  }
  raf = requestAnimationFrame(tick);
}

function stopRace(why) {
  const r = s.race;
  if (!r.running) return;
  advance();
  r.running = false;
  cancelAnimationFrame(raf);
  raceBtn.disabled = false;
  raceBtn.textContent = "Resume photon";
  handFocus(stopBtn, raceBtn);
  stopBtn.disabled = true;
  const reached = S.lastPlanet(r.km);
  if (reached && (!r.best || reached.distanceKm > r.best.distanceKm)) r.best = reached;
  const where = r.best ? `It had passed ${r.best.name}.` : "It had not reached Mercury yet.";
  s.km = S.clampKm(S.pxToKm(scroller.scrollTop));
  // The big readout goes back to the strip's position, which is not where
  // the photon is after a take-over or with reduced motion on. Say so, or
  // the two clocks seem to disagree.
  const moved = Math.abs(s.km - r.km) > AT_PX * S.KM_PER_PX;
  raceNote.textContent = `${why ? why + " " : ""}The photon stopped after ${S.formatDuration(S.lightSeconds(r.km))} of light time. ${where}${moved ? " The readout now shows where you are on the strip." : ""}`;
  render(s.km);
  if (s.resultsShown) updateRaceLine();
  say(raceNote.textContent);
}

function finishRace() {
  const r = s.race;
  r.running = false;
  cancelAnimationFrame(raf);
  raceBtn.disabled = false;
  raceBtn.textContent = "Race again";
  handFocus(stopBtn, raceBtn);
  stopBtn.disabled = true;
  setTop(S.WALK_PX);
  r.km = S.WALK_KM;
  r.best = S.NEPTUNE;
  const speeds = r.bestSpeed > 1 ? `, at speeds up to ${r.bestSpeed}×` : " at 1×";
  raceNote.textContent = `The photon reached Neptune after ${S.formatFixed(S.lightSeconds(S.WALK_KM))} of light time. You watched it for ${S.formatDuration(r.wallSeconds)} in all${speeds}. The results are below the strip.`;
  render(S.WALK_KM);
  // render() may have opened the results a frame early, while the photon was
  // still a few pixels short and r.best was Uranus. Write the line again now
  // that the race is over.
  updateRaceLine();
  say(raceNote.textContent);
}

/* ---------- Results ---------- */

function reachedEnd() {
  if (s.resultsShown) return;
  showResults(false);
}

function showResults(move) {
  const sec = $("#results");
  if (!sec) return;
  const first = !s.resultsShown;
  s.resultsShown = true;
  sec.hidden = false;
  if (first) writeResults();
  else updateRaceLine();
  if (move) {
    sec.scrollIntoView({ block: "start", behavior: reducedMotion ? "auto" : "smooth" });
    $("[data-results-title]")?.focus({ preventScroll: true });
  }
}

function predictionText(key) {
  const q = S.QUESTIONS[key];
  const chose = q.choices.find((c) => c.id === s.answers[key]);
  const right = S.correctChoice(key);
  const ok = chose && chose.id === right.id;
  const earth = S.PLANETS[2];
  const nep = S.NEPTUNE;
  let fact;
  if (key === "bead") {
    const cm = S.sunWidthsOut(earth);
    fact = `Earth is ${cm.toFixed(1)} Sun-widths from the Sun, so with a 1 cm Sun it is ${(cm / 100).toFixed(2)} m away.`;
  } else {
    fact = `Neptune is ${kmText(nep.distanceKm)} out, and sunlight takes ${S.formatFixed(S.lightSeconds(nep.distanceKm))} to get there.`;
  }
  const said = chose ? chose.label.toLowerCase() : "nothing";
  // Right or wrong is less use than by how much. The choices are a factor of
  // ten apart, so the factor is what tells someone how far off their sense
  // of scale was.
  let by = "";
  if (chose && !ok) {
    const truth = key === "bead" ? q.answerCm() : q.answerS();
    const guess = key === "bead" ? chose.cm : chose.s;
    const f = truth / guess;
    const big = f >= 1 ? f : 1 / f;
    const n = big >= 2 ? nf0.format(big) : big.toFixed(1);
    by = key === "bead"
      ? ` That guess is about ${n} times ${f >= 1 ? "too close" : "too far"}.`
      : ` That guess is about ${n} times ${f >= 1 ? "too short" : "too long"}.`;
  }
  return { ok, text: `${ok ? "Right." : "Not quite."} You said ${said}. ${fact}${by}` };
}

function writeResults() {
  // Score, if there were guesses to score.
  const box = $("[data-score]");
  if (s.locked && box) {
    const b = predictionText("bead");
    const n = predictionText("neptune");
    const right = [b, n].filter((x) => x.ok).length;
    const verdict = $("[data-score-verdict]");
    verdict.textContent = `${right} of 2 guesses right.`;
    verdict.dataset.state = right === 2 ? "good" : right === 1 ? "warn" : "bad";
    const lines = { bead: b, neptune: n };
    const qs = { bead: "Question 1, the bead", neptune: "Question 2, sunlight to Neptune" };
    for (const key of ["bead", "neptune"]) {
      const host = $(`[data-pred="${key}"]`);
      host.innerHTML = "";
      host.dataset.state = lines[key].ok ? "good" : "bad";
      host.appendChild(el("span", "ss-pred-label", qs[key]));
      host.appendChild(el("p", "ss-pred-text", lines[key].text));
    }
    box.hidden = false;
    s.scored = true;
  }
  updateRaceLine();

  const earth = S.PLANETS[2];
  const mars = S.PLANETS[3];
  const nep = S.NEPTUNE;
  const pct = S.filledFraction() * 100;
  const h = scroller?.clientHeight || 500;
  const screens = Math.round(S.WALK_PX / h);
  const tE = S.formatFixed(S.lightSeconds(earth.distanceKm));
  const tN = S.formatFixed(S.lightSeconds(nep.distanceKm));
  const rMin = S.formatFixed(S.lightSeconds(S.MARS_EARTH_MIN_KM));
  const rMax = S.formatFixed(S.lightSeconds(S.MARS_EARTH_MAX_KM));
  const beadE = S.sunWidthsOut(earth) / 100;
  const beadN = S.sunWidthsOut(nep) / 100;
  const earthMm = (earth.diameterKm / S.SUN_DIAMETER_KM) * 10;

  const copy = {
    empty: `The strip is ${nf0.format(S.WALK_PX)} pixels from the Sun to Neptune, about ${screens} windows of it on this screen. Laid end to end along it, the Sun and all eight planets would cover ${pct.toFixed(2)}% of the length. Everything else is the space between them.`,
    light: `Light leaves the Sun at ${nf3.format(S.C_KM_S)} km a second and still takes ${tE} to reach Earth and ${tN} to reach Neptune. The photon in the strip moves at that speed at 1×, which at this scale is ${S.LIGHT_PX_PER_S.toFixed(1)} pixels a second.`,
    radio: `Radio waves sit in the same electromagnetic spectrum as visible light and travel at the same speed, so a radio message is no faster than sunlight. Mars comes as close to Earth as ${kmText(S.MARS_EARTH_MIN_KM)} and goes as far as ${kmText(S.MARS_EARTH_MAX_KM)}, so a message to Mars takes between ${rMin} and ${rMax} to arrive, and a reply takes as long again.`,
    mean: `Every distance here is a mean distance, the semi-major axis on NASA's fact sheet. The real distances change as each planet goes round its orbit; Earth's runs from ${nf1.format(S.EARTH_PERIHELION_KM / 1e6)} to ${nf1.format(S.EARTH_APHELION_KM / 1e6)} million km.`,
    finding: `If the Sun were a 1 cm bead, Earth would be ${beadE.toFixed(2)} m away and ${earthMm.toFixed(2)} mm across, and Neptune would be ${beadN.toFixed(1)} m away. Mars is ${S.formatFixed(S.lightSeconds(mars.distanceKm))} of light from the Sun.`,
  };
  for (const [k, text] of Object.entries(copy)) {
    const e = $(`[data-copy="${k}"]`);
    if (e) e.textContent = text;
  }

  const rows = [
    // Light time comes second: it is the number the exhibit is about, and on
    // a phone the table scrolls sideways, so the later columns are the ones
    // that start off screen.
    ["Sun", "0 s", "0", "0", nf0.format(S.SUN_DIAMETER_KM), String(S.SUN_PX)],
    ...S.PLANETS.map((p) => [
      p.name,
      S.formatFixed(S.lightSeconds(p.distanceKm)),
      nf1.format(p.distanceKm / 1e6),
      S.kmToAu(p.distanceKm).toFixed(3),
      nf0.format(p.diameterKm),
      pxText(S.sizePx(p)),
    ]),
  ];
  const body = $("[data-table]");
  if (body) {
    body.innerHTML = rows
      .map((r) => `<tr><th scope="row">${r[0]}</th>${r.slice(1).map((c) => `<td class="num">${c}</td>`).join("")}</tr>`)
      .join("");
  }
}

function updateRaceLine() {
  const line = $("[data-race-result]");
  if (!line) return;
  const r = s.race;
  if (!r.started) { line.hidden = true; return; }
  line.hidden = false;
  line.textContent = r.best === S.NEPTUNE
    ? `Your photon reached Neptune. You watched it for ${S.formatDuration(r.wallSeconds)} at up to ${r.bestSpeed}×; at 1× the whole trip would take ${S.formatFixed(S.lightSeconds(S.WALK_KM))}.`
    : `Your photon got ${r.best ? "past " + r.best.name : "partway to Mercury"} after ${S.formatDuration(S.lightSeconds(r.km))} of light time.`;
}

/* ---------- Wiring ---------- */

function buildJumps() {
  const row = $("[data-jumps]");
  if (!row) return;
  const stops = [{ name: "Sun", distanceKm: 0 }, ...S.PLANETS];
  for (const p of stops) {
    const b = el("button", "ctrl ss-jump", p.name);
    b.type = "button";
    b.addEventListener("click", () => jumpTo(p.distanceKm));
    row.appendChild(b);
  }
}

function jumpTo(km) {
  if (s.race.running) stopRace("");
  s.km = S.clampKm(km);
  setTop(S.kmToPx(s.km));
  render(s.km);
}

scroller?.addEventListener("scroll", onScroll, { passive: true });
for (const type of ["wheel", "touchstart", "pointerdown"]) {
  scroller?.addEventListener(type, () => { if (s.race.running) stopRace("You took over."); }, { passive: true });
}
// Any key takes the strip back, except the ones used to work the race
// controls themselves and plain focus movement.
document.addEventListener("keydown", (e) => {
  if (!s.race.running) return;
  if (e.key === "Tab" || e.key === "Shift") return;
  if (e.target instanceof Element && e.target.closest(".ss-race")) return;
  stopRace("You took over.");
});

raceBtn?.addEventListener("click", startRace);
stopBtn?.addEventListener("click", () => stopRace(""));
for (const b of speedBtns) b.addEventListener("click", () => setSpeed(Number(b.dataset.speed)));

$("[data-to-results]")?.addEventListener("click", () => showResults(true));
$("[data-skip-all]")?.addEventListener("click", (e) => {
  e.preventDefault();
  // Skipping means no score. Lock the options too, or someone could read the
  // table and then "guess", and answering after the results were written
  // would never show a score anyway.
  if (!s.locked) {
    s.skipped = true;
    for (const b of $$(".ss-opt")) b.disabled = true;
    const status = $("[data-predict-status]");
    if (status) status.textContent = "Skipped";
    const note = $("[data-predict-note]");
    if (note) note.textContent = "Skipped. The guesses are not scored this time.";
  }
  openWalk(false);
  showResults(true);
});
$("[data-again]")?.addEventListener("click", () => {
  if (s.race.running) stopRace("");
  jumpTo(0);
  toWalk();
});

if (typeof ResizeObserver !== "undefined" && scroller) {
  new ResizeObserver(() => { if (!$("#walk").hidden) layout(); }).observe(scroller);
}

fillNumbers();
buildQuestions();
buildTrack();
buildJumps();
render(0);

// Test hook: the render script reads and drives the live state rather than
// scraping pixels. Nothing on the page depends on it.
window.__solarScale = {
  state: s, S, jumpTo, choose, startRace, stopRace, setSpeed, showResults,
};
