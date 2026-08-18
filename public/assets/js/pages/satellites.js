// Satellites — page controller.

import { mountGroundTrack } from "../experiences/ground-track.js";
import {
  period, speed, westShift, footprintRadius, sunSyncInclination,
  LAUNCH_SITES, minInclinationFrom,
} from "../systems/groundtrack.js";

const state = { altKm: 408, incDeg: 51.6 };
const out = (k) => document.querySelector(`[data-out="${k}"]`);

function refresh() {
  const T = period(state.altKm);
  out("inc").value = state.incDeg;
  out("period").value = T / 60;
  out("speed").value = speed(state.altKm);
  out("shift").value = westShift(state.altKm);
  out("maxlat").value = state.incDeg <= 90 ? state.incDeg : 180 - state.incDeg;
  out("footprint").value = footprintRadius(state.altKm);

  // The sun-synchronous inclination for this exact altitude, which is the
  // thing most people assume is a fixed 98 degrees and is not.
  const sso = sunSyncInclination(state.altKm);
  const ssoEl = document.querySelector("[data-sso]");
  if (ssoEl) {
    ssoEl.textContent = sso
      ? `At ${state.altKm.toFixed(0)} km, a sun-synchronous orbit needs ${sso.toFixed(2)}° — and it changes with altitude, so it is not the fixed 98° everyone quotes.`
      : `No sun-synchronous orbit exists at ${state.altKm.toFixed(0)} km. Above roughly 5,970 km the bulge cannot precess the plane fast enough, whatever the inclination.`;
  }

  // Which launch sites can reach this inclination without a plane change.
  const reach = document.querySelector("[data-reach]");
  if (reach) {
    const incEff = state.incDeg <= 90 ? state.incDeg : 180 - state.incDeg;
    const able = LAUNCH_SITES.filter((s) => minInclinationFrom(s.lat) <= incEff + 0.05);
    reach.textContent = able.length
      ? `Reachable directly from: ${able.map((s) => s.name).join(", ")}.`
      : "No listed launch site can reach this inclination directly — every one of them sits at a higher latitude, and getting down here needs a plane change.";
  }

  const status = document.querySelector("[data-track-status]");
  if (status) {
    if (Math.abs(state.incDeg) < 0.5 && Math.abs(state.altKm - 35786) < 400) status.textContent = "Geostationary";
    else if (state.incDeg > 90) status.textContent = "Retrograde";
    else if (state.incDeg > 80) status.textContent = "Near-polar";
    else status.textContent = "Prograde";
  }
}

document.addEventListener("lab-input", (e) => {
  const { name, value } = e.detail;
  if (name === "alt") state.altKm = value;
  else if (name === "inc") state.incDeg = value;
  refresh();
});

const PRESETS = {
  iss: { altKm: 408, incDeg: 51.6 },
  sso: { altKm: 700, incDeg: 98.19 },
  geo: { altKm: 35786, incDeg: 0 },
  polar: { altKm: 800, incDeg: 90 },
};

document.querySelectorAll("[data-orbit-preset]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const p = PRESETS[btn.dataset.orbitPreset];
    if (!p) return;
    Object.assign(state, p);
    sync();
    refresh();
  });
});

function sync() {
  for (const [name, v] of [["alt", state.altKm], ["inc", state.incDeg]]) {
    const el = document.querySelector(`lab-control[name="${name}"]`);
    if (el) el.value = v;
  }
}

const canvas = document.getElementById("track-canvas");
if (canvas) mountGroundTrack(canvas, { getState: () => state });

// Launch-site notes, rendered from the same data the chart plots.
const siteList = document.querySelector("[data-sites]");
if (siteList) {
  siteList.innerHTML = LAUNCH_SITES.map(
    (s) => `<tr>
      <td>${s.name}</td>
      <td class="num">${s.lat.toFixed(1)}°</td>
      <td>${s.note}</td>
    </tr>`
  ).join("");
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
