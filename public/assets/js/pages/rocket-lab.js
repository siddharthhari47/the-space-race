// Rockets — page controller.
//
// Design on the left, consequences on the right, and a Launch button that
// settles the argument. Every readout in the design panel updates as you
// move a slider, so the vehicle is being evaluated continuously and the
// launch is a confirmation rather than a reveal.

import { mountRocketLab } from "../experiences/rocket-lab.js";
import {
  ENGINES,
  STRUCTURE,
  buildVehicle,
  deltaV,
  simulate,
  circularVelocity,
} from "../systems/rocketry.js";
import { prefersReducedMotion } from "../systems/stage.js";

const cfg = {
  engine1: "merlin1d",
  engines1: 9,
  prop1: 411000,
  engine2: "mvac",
  engines2: 1,
  prop2: 107500,
  payload: 12000,
  turnStart: 1200,
  turnEnd: 110000,
  targetAlt: 250000,
};

const state = { result: null, index: 0, phase: "idle" };

const $ = (s) => document.querySelector(s);
const out = (k) => document.querySelector(`[data-out="${k}"]`);

/* ---------- Design readouts ---------- */

function refreshDesign() {
  const v = buildVehicle(cfg);
  const dv = deltaV(cfg);

  out("liftoff").value = v.liftoffMass / 1000;
  out("twr").value = v.twr;
  out("dv1").value = dv.dv1 / 1000;
  out("dv2").value = dv.dv2 / 1000;
  out("dvtotal").value = dv.total / 1000;
  out("burn1").value = v.burn1;

  // TWR below 1 means it does not leave the pad at all, which is worth
  // saying before someone spends a launch finding out.
  const twrEl = out("twr");
  twrEl.setState(v.twr < 1 ? "bad" : v.twr < 1.15 ? "warn" : "good");

  // The delta-v needed for low orbit is roughly orbital velocity plus the
  // losses this very simulation reports — about 9.4 km/s all in. Colouring
  // against that turns an abstract number into a verdict.
  const dvEl = out("dvtotal");
  dvEl.setState(dv.total < 9000 ? "bad" : dv.total < 9800 ? "warn" : "good");

  const stat = $("[data-design-status]");
  if (stat) {
    if (v.twr < 1) stat.textContent = "Will not lift off";
    else if (dv.total < 9000) stat.textContent = "Short on delta-v";
    else stat.textContent = "Looks flyable";
  }
}

/* ---------- Controls ---------- */

document.addEventListener("lab-input", (e) => {
  const { name, value } = e.detail;
  if (name === "prop1") cfg.prop1 = value * 1000;
  else if (name === "prop2") cfg.prop2 = value * 1000;
  else if (name === "payload") cfg.payload = value * 1000;
  else if (name === "engines1") cfg.engines1 = Math.round(value);
  else if (name === "target") cfg.targetAlt = value * 1000;
  refreshDesign();
});

document.querySelectorAll("[data-engine-slot]").forEach((sel) => {
  sel.addEventListener("change", () => {
    const slot = sel.dataset.engineSlot;
    if (slot === "1") cfg.engine1 = sel.value;
    else cfg.engine2 = sel.value;
    refreshDesign();
    describeEngines();
  });
});

function describeEngines() {
  const e1 = ENGINES[cfg.engine1];
  const e2 = ENGINES[cfg.engine2];
  const d1 = $("[data-engine-note='1']");
  const d2 = $("[data-engine-note='2']");
  if (d1) {
    d1.textContent = `${e1.vehicle}. ${e1.propellant}. ${(e1.thrustSl / 1000).toFixed(0)} kN at sea level, Isp ${e1.ispSl}s rising to ${e1.ispVac}s in vacuum.`;
  }
  if (d2) {
    d2.textContent = `${e2.vehicle}. ${e2.propellant}. ${(e2.thrustVac / 1000).toFixed(0)} kN in vacuum, Isp ${e2.ispVac}s. Never lit at sea level.`;
  }
}

/* ---------- Flight ---------- */

const flightOut = {
  t: out("ft"),
  alt: out("falt"),
  speed: out("fspeed"),
  mass: out("fmass"),
  q: out("fq"),
};

function setFlight(p) {
  if (!p) return;
  flightOut.t.value = p.t;
  flightOut.alt.value = p.alt / 1000;
  flightOut.speed.value = p.speed / 1000;
  flightOut.mass.value = p.mass / 1000;
  flightOut.q.value = p.q / 1000;
}

let playTimer = null;

function stopPlayback() {
  if (playTimer) cancelAnimationFrame(playTimer);
  playTimer = null;
}

function launch() {
  stopPlayback();
  state.result = simulate(cfg);
  state.index = 0;
  state.phase = "flying";
  $("[data-launch]").disabled = true;
  $("[data-abort]").disabled = false;
  const resultPanel = $("[data-result]");
  if (resultPanel) resultPanel.hidden = true;

  const total = state.result.path.length;

  // Compress the flight to about twelve seconds regardless of how long it
  // actually took, so a 500-second ascent is watchable without the viewer
  // sitting through eight real minutes of it.
  const targetSeconds = 12;
  const perFrame = Math.max(1, Math.round(total / (targetSeconds * 60)));

  if (prefersReducedMotion) {
    state.index = total - 1;
    state.phase = "done";
    finish();
    return;
  }

  const step = () => {
    state.index = Math.min(state.index + perFrame, total - 1);
    setFlight(state.result.path[state.index]);
    if (state.index >= total - 1) {
      state.phase = "done";
      finish();
      return;
    }
    playTimer = requestAnimationFrame(step);
  };
  playTimer = requestAnimationFrame(step);
}

function finish() {
  stopPlayback();
  const r = state.result;
  $("[data-launch]").disabled = false;
  $("[data-abort]").disabled = true;
  setFlight(r.path[r.path.length - 1]);

  const panel = $("[data-result]");
  if (!panel) return;
  panel.hidden = false;

  const verdict = $("[data-verdict]");
  const detail = $("[data-verdict-detail]");
  const rows = $("[data-result-rows]");

  if (r.reachedOrbit) {
    verdict.textContent = "Orbit achieved";
    verdict.dataset.state = "good";
    detail.textContent =
      `Cutoff came ${r.secoTime ? `at T+${r.secoTime.toFixed(0)} s with ${(r.propRemaining / 1000).toFixed(1)} t of propellant still in the tanks` : "at propellant depletion, with nothing to spare"}. ` +
      `The orbit is ${(r.periapsis / 1000).toFixed(0)} by ${(r.apoapsis / 1000).toFixed(0)} km — the low point is what matters, because that is where the atmosphere gets a say.`;
  } else if (r.escape) {
    verdict.textContent = "Escape trajectory";
    verdict.dataset.state = "warn";
    detail.textContent =
      "That is more energy than Earth orbit needs. Impressive, and almost certainly not what the payload wanted.";
  } else {
    verdict.textContent = "Suborbital";
    verdict.dataset.state = "bad";
    const shortfall = circularVelocity(Math.max(r.peakAltitude, 150000)) - r.finalSpeed;
    detail.textContent =
      `It reached ${(r.peakAltitude / 1000).toFixed(0)} km, which is space, and then fell back — because height was never the problem. ` +
      `It needed about ${(shortfall / 1000).toFixed(2)} km/s more sideways speed to keep missing the ground.`;
  }

  rows.innerHTML = `
    <tr><td>Peak altitude</td><td class="num">${(r.peakAltitude / 1000).toFixed(0)} km</td></tr>
    <tr><td>Speed at cutoff</td><td class="num">${(r.finalSpeed / 1000).toFixed(2)} km/s</td></tr>
    <tr><td>Periapsis</td><td class="num">${(r.periapsis / 1000).toFixed(0)} km</td></tr>
    <tr><td>Apoapsis</td><td class="num">${r.apoapsis === Infinity ? "escape" : (r.apoapsis / 1000).toFixed(0) + " km"}</td></tr>
    <tr><td>Max-Q</td><td class="num">${(r.maxQ / 1000).toFixed(0)} kPa at ${(r.maxQAlt / 1000).toFixed(0)} km</td></tr>
    <tr><td>Staging</td><td class="num">T+${r.sepTime ? r.sepTime.toFixed(0) : "—"} s</td></tr>
    <tr><td>Gravity loss</td><td class="num">${(r.gravityLoss / 1000).toFixed(2)} km/s</td></tr>
    <tr><td>Drag loss</td><td class="num">${(r.dragLoss / 1000).toFixed(3)} km/s</td></tr>
    <tr><td>Ideal &Delta;v</td><td class="num">${(r.deltaV.total / 1000).toFixed(2)} km/s</td></tr>
  `;
}

$("[data-launch]")?.addEventListener("click", launch);
$("[data-abort]")?.addEventListener("click", () => {
  stopPlayback();
  state.result = null;
  state.index = 0;
  state.phase = "idle";
  $("[data-launch]").disabled = false;
  $("[data-abort]").disabled = true;
  const panel = $("[data-result]");
  if (panel) panel.hidden = true;
});

/* ---------- Presets ----------

   Real vehicles, so the sandbox has somewhere to start that is known to
   work — and so the numbers can be checked against something. */

const PRESETS = {
  falcon9: { engine1: "merlin1d", engines1: 9, prop1: 411000, engine2: "mvac", engines2: 1, prop2: 107500, payload: 12000 },
  saturnv: { engine1: "f1", engines1: 5, prop1: 2077000, engine2: "j2", engines2: 5, prop2: 444000, payload: 45000 },
  atlas: { engine1: "rd180", engines1: 1, prop1: 284000, engine2: "rl10", engines2: 1, prop2: 20800, payload: 8000 },
};

document.querySelectorAll("[data-preset]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const p = PRESETS[btn.dataset.preset];
    if (!p) return;
    Object.assign(cfg, p);
    syncControls();
    refreshDesign();
    describeEngines();
  });
});

function syncControls() {
  const set = (name, value) => {
    const el = document.querySelector(`lab-control[name="${name}"]`);
    if (el) el.value = value;
  };
  set("prop1", cfg.prop1 / 1000);
  set("prop2", cfg.prop2 / 1000);
  set("payload", cfg.payload / 1000);
  set("engines1", cfg.engines1);
  set("target", cfg.targetAlt / 1000);
  document.querySelectorAll("[data-engine-slot]").forEach((sel) => {
    sel.value = sel.dataset.engineSlot === "1" ? cfg.engine1 : cfg.engine2;
  });
}

/* ---------- Boot ---------- */

const canvas = document.getElementById("launch-canvas");
if (canvas) mountRocketLab(canvas, { getState: () => state });

// The structural coefficients are stated on the page, and stating them from
// the constants means the page cannot drift from the model.
const s1 = $("[data-struct-1]");
const s2 = $("[data-struct-2]");
if (s1) s1.textContent = `${(STRUCTURE.stage1 * 100).toFixed(1)}%`;
if (s2) s2.textContent = `${(STRUCTURE.stage2 * 100).toFixed(1)}%`;

syncControls();
describeEngines();
refreshDesign();

const revealables = document.querySelectorAll(".reveal");
if (revealables.length) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.05 }
  );
  revealables.forEach((el) => io.observe(el));
}
