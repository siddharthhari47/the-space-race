// Aerodynamics — page controller.
//
// One state object drives the tunnel, the polar and every readout, so the
// picture, the plot and the numbers are always describing the same wing.

import { mountWindTunnel, mountPolar } from "../experiences/wind-tunnel.js";
import { coefficients, bestLD, reynolds } from "../systems/aerofoil.js";
import { atmosphere } from "../systems/atmosphere.js";

const state = {
  alpha: 4,
  speed: 60, // m/s
  wing: { camber: 0.02, camberPos: 0.4, thickness: 0.12, aspectRatio: 8, oswald: 0.8 },
};

const out = (k) => document.querySelector(`[data-out="${k}"]`);
const CHORD = 1.5; // m, a light-aircraft-ish wing section
const WING_AREA = 16; // m^2, for turning coefficients into forces

function refresh() {
  const c = coefficients(state.alpha, state.wing);
  const air = atmosphere(0);
  const q = 0.5 * air.rho * state.speed * state.speed;

  out("cl").value = c.cl;
  out("cd").value = c.cd;
  out("ld").value = c.ld;
  out("lift").value = (q * WING_AREA * c.cl) / 1000;
  out("drag").value = (q * WING_AREA * c.cd) / 1000;
  out("re").value = reynolds(state.speed, CHORD, air.rho) / 1e6;

  // The stall is the one state worth shouting about, so it drives the
  // colour of the coefficients rather than sitting in a corner as text.
  out("cl").setState(c.stalled ? "bad" : "good");
  out("ld").setState(c.stalled ? "bad" : c.ld > 15 ? "good" : null);

  const status = document.querySelector("[data-tunnel-status]");
  if (status) {
    if (c.stalled) status.textContent = "Stalled";
    else if (state.alpha > c.alphaStallDeg - 2) status.textContent = "Close to the stall";
    else status.textContent = "Attached flow";
  }

  const marginEl = document.querySelector("[data-margin]");
  if (marginEl) {
    marginEl.textContent = `Stall at ${c.alphaStallDeg.toFixed(1)}°, CL max ${c.clMax.toFixed(2)}.`;
  }

  const best = bestLD(state.wing);
  const bestEl = document.querySelector("[data-best-ld]");
  if (bestEl) {
    bestEl.textContent = `Best lift-to-drag for this wing is ${best.ld.toFixed(1)}, at ${best.alpha.toFixed(1)}° — that angle is the one a glider pilot flies to go furthest.`;
  }
}

document.addEventListener("lab-input", (e) => {
  const { name, value } = e.detail;
  if (name === "alpha") state.alpha = value;
  else if (name === "speed") state.speed = value;
  else if (name === "aspect") state.wing = { ...state.wing, aspectRatio: value };
  else if (name === "camber") state.wing = { ...state.wing, camber: value / 100 };
  else if (name === "thickness") state.wing = { ...state.wing, thickness: value / 100 };
  refresh();
});

const tunnelCanvas = document.getElementById("tunnel-canvas");
if (tunnelCanvas) mountWindTunnel(tunnelCanvas, { getState: () => state });

const polarCanvas = document.getElementById("polar-canvas");
if (polarCanvas) mountPolar(polarCanvas, { getState: () => state });

// Presets that each make one point, so the controls have somewhere
// interesting to be pointed at.
const PRESETS = {
  glider: { alpha: 5, wing: { camber: 0.03, camberPos: 0.4, thickness: 0.11, aspectRatio: 26, oswald: 0.85 } },
  airliner: { alpha: 3, wing: { camber: 0.02, camberPos: 0.4, thickness: 0.12, aspectRatio: 9, oswald: 0.8 } },
  fighter: { alpha: 6, wing: { camber: 0.0, camberPos: 0.4, thickness: 0.06, aspectRatio: 3, oswald: 0.7 } },
  stall: { alpha: 18, wing: { camber: 0.02, camberPos: 0.4, thickness: 0.12, aspectRatio: 8, oswald: 0.8 } },
};

document.querySelectorAll("[data-wing-preset]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const p = PRESETS[btn.dataset.wingPreset];
    if (!p) return;
    state.alpha = p.alpha;
    state.wing = { ...p.wing };
    sync();
    refresh();
  });
});

function sync() {
  const set = (name, v) => {
    const el = document.querySelector(`lab-control[name="${name}"]`);
    if (el) el.value = v;
  };
  set("alpha", state.alpha);
  set("speed", state.speed);
  set("aspect", state.wing.aspectRatio);
  set("camber", state.wing.camber * 100);
  set("thickness", state.wing.thickness * 100);
}

sync();
refresh();

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
