// SPACE world page behaviour.
//
// The hero is a working orbital calculator wearing a diagram. Move the
// altitude control and every number on the panel is recomputed from the
// vis-viva and Kepler relations — nothing is looked up in a table, so you
// can push the slider anywhere between 160 km and 42,000 km and the answers
// stay right.

import {
  mountOrbitField,
  orbitalVelocity,
  orbitalPeriod,
  R_EARTH,
  REFERENCE_ORBITS,
} from "../experiences/orbit-field.js";

const canvas = document.getElementById("orbit-canvas");
const control = document.querySelector('lab-control[name="altitude"]');
const out = {
  alt: document.querySelector('[data-out="alt"]'),
  speed: document.querySelector('[data-out="speed"]'),
  period: document.querySelector('[data-out="period"]'),
  perDay: document.querySelector('[data-out="per-day"]'),
};
const regimeEl = document.querySelector("[data-regime]");
const detailEl = document.querySelector("[data-orbit-detail]");

let altitude = control ? control.value : 408;

// Named bands, by the definitions actually in use. Geostationary is one
// specific altitude, not a band — it is the single radius whose period
// matches a sidereal day (1436.07 min) — so the window that earns the name
// is deliberately narrow. Sit just outside it and the satellite drifts
// east or west a little every day, which is why the neighbouring band is
// called geosynchronous rather than geostationary.
function regimeFor(alt) {
  if (alt < 2000) return ["Low Earth orbit", "Drag still matters here. Uncorrected, orbits below roughly 400 km decay within years."];
  if (alt < 35500) return ["Medium Earth orbit", "Above the inner Van Allen belt, below geostationary. Navigation constellations live here."];
  if (alt <= 36100) return ["Geostationary", "One sidereal day, over the equator. From the ground the satellite never moves, which is why dishes can be bolted in place."];
  return ["Above geostationary", "Slower than Earth turns. From the ground, a satellite out here drifts backwards across the sky."];
}

function refresh() {
  const r = R_EARTH + altitude;
  const v = orbitalVelocity(r);
  const T = orbitalPeriod(r); // seconds

  if (out.alt) out.alt.value = altitude;
  if (out.speed) out.speed.value = v;
  if (out.period) out.period.value = T / 60;
  if (out.perDay) out.perDay.value = 86400 / T;

  const [name, note] = regimeFor(altitude);
  if (regimeEl) regimeEl.textContent = name;
  if (detailEl) detailEl.textContent = note;
}

if (control) {
  control.addEventListener("lab-input", (e) => {
    altitude = e.detail.value;
    refresh();
  });
}

if (canvas) {
  mountOrbitField(canvas, {
    getAltitude: () => altitude,
    // Clicking a reference ring snaps the control to it. Cheaper than
    // hunting for 35,786 by hand, and it makes the rings feel like presets
    // rather than scenery.
    onSelect(orbit) {
      altitude = orbit.alt;
      if (control) control.value = orbit.alt;
      refresh();
      if (detailEl) detailEl.textContent = orbit.detail;
      if (regimeEl) regimeEl.textContent = orbit.label;
    },
  });
}

// Preset buttons do the same job for keyboard and touch users, who can't
// reasonably be asked to hit a 1px ring.
document.querySelectorAll("[data-preset]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const orbit = REFERENCE_ORBITS.find((o) => o.id === btn.dataset.preset);
    if (!orbit) return;
    altitude = orbit.alt;
    if (control) control.value = orbit.alt;
    refresh();
    if (detailEl) detailEl.textContent = orbit.detail;
    if (regimeEl) regimeEl.textContent = orbit.label;
  });
});

refresh();

/* ---------- Reveals ---------- */

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
