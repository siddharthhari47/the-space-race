// AIRCRAFT world page behaviour.
//
// The chart does the teaching; this file just keeps the readouts honest.
// Moving the pointer over the envelope probes the standard atmosphere at
// that exact altitude and reports what the air is actually like there —
// temperature, density, and what the Mach number under the cursor works
// out to in knots.

import { mountFlightEnvelope, AIRCRAFT } from "../experiences/flight-envelope.js";

const canvas = document.getElementById("envelope-canvas");

const out = {
  alt: document.querySelector('[data-out="alt"]'),
  mach: document.querySelector('[data-out="mach"]'),
  tas: document.querySelector('[data-out="tas"]'),
  temp: document.querySelector('[data-out="temp"]'),
  rho: document.querySelector('[data-out="rho"]'),
};
const statusEl = document.querySelector("[data-status]");
const detailEl = document.querySelector("[data-ac-detail]");
const nameEl = document.querySelector("[data-ac-name]");

// What the panel shows when the pointer isn't over the chart. Without this
// the readouts freeze on the last sampled point, which reads as live data
// that has quietly stopped being true.
const IDLE = {
  alt: "—",
  mach: "—",
  tas: "—",
  temp: "—",
  rho: "—",
};

function setIdle() {
  for (const [k, el] of Object.entries(out)) if (el) el.value = IDLE[k];
  if (statusEl) {
    statusEl.textContent = "Hover the chart";
    statusEl.removeAttribute("data-state");
  }
}

if (canvas) {
  mountFlightEnvelope(canvas, {
    onProbe(p) {
      if (!p) {
        setIdle();
        return;
      }
      if (out.alt) out.alt.value = p.alt / 1000;
      if (out.mach) out.mach.value = p.mach;
      if (out.tas) out.tas.value = p.tasKts;
      if (out.temp) out.temp.value = p.tempC;
      if (out.rho) out.rho.value = p.rho;
      if (statusEl) {
        statusEl.textContent = p.inside ? "Inside the envelope" : "Outside the envelope";
        statusEl.setAttribute("data-state", p.inside ? "good" : "warn");
      }
    },
    onSelect(ac) {
      if (nameEl) nameEl.textContent = ac.name;
      if (detailEl) detailEl.textContent = ac.note;
    },
  });
  setIdle();
}

// Keyboard and touch route to the same content the chart dots carry, so
// selecting an aircraft never requires hitting a 4px target.
document.querySelectorAll("[data-ac]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const ac = AIRCRAFT.find((a) => a.id === btn.dataset.ac);
    if (!ac) return;
    if (nameEl) nameEl.textContent = ac.name;
    if (detailEl) detailEl.textContent = ac.note;
  });
});

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
