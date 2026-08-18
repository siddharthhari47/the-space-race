// Atmosphere & Altitude — page controller.
//
// The consequences panel is the point of the page. Anyone can read that
// density falls with altitude; what makes it land is watching indicated
// airspeed and true airspeed pull apart while you hold one of them fixed,
// because that gap is a real thing pilots have to think in.

import { mountAtmosphereColumn } from "../experiences/atmosphere-column.js";
import { atmosphere, msToKnots } from "../systems/atmosphere.js";

const state = { alt: 10700, ias: 280 }; // metres, knots indicated

const out = (k) => document.querySelector(`[data-out="${k}"]`);

function refresh() {
  const air = atmosphere(state.alt);
  const sea = atmosphere(0);

  out("alt").value = state.alt / 1000;
  out("temp").value = air.T - 273.15;
  out("press").value = air.p / 1000;
  out("rho").value = air.rho;
  out("sound").value = air.a;

  // Indicated airspeed is what the pitot system reports, and it is really a
  // measure of dynamic pressure, not of speed. Hold it constant and climb,
  // and the true speed through the air rises as the square root of the
  // density ratio — the wing feels the same, the ground does not.
  const sigma = air.rho / sea.rho;
  const tasKts = state.ias / Math.sqrt(sigma);
  out("tas").value = tasKts;
  out("mach").value = (tasKts / msToKnots(air.a));
  out("sigma").value = sigma;

  const gapEl = document.querySelector("[data-gap]");
  if (gapEl) {
    gapEl.textContent =
      `Holding ${state.ias.toFixed(0)} knots indicated at ${(state.alt / 1000).toFixed(1)} km, ` +
      `the aircraft is actually moving at ${tasKts.toFixed(0)} knots through the air — ` +
      `${(tasKts - state.ias).toFixed(0)} knots faster than the instrument says, because the air is ` +
      `${(sigma * 100).toFixed(0)}% as dense as it is at sea level.`;
  }

  // The Armstrong limit is where ambient pressure falls to the vapour
  // pressure of water at body temperature, 6.3 kPa. Solving the ISA for
  // that pressure puts it at 19.11 km, which is why the preset is set there
  // rather than at a round 19 — at 19.00 km the pressure is still 6.41 kPa
  // and the limit has not actually been crossed. Above it, exposed body
  // fluids boil, and it has nothing to do with running out of oxygen.
  const armstrongEl = document.querySelector("[data-armstrong]");
  if (armstrongEl) {
    armstrongEl.textContent =
      air.p / 1000 <= 6.3
        ? `At ${(state.alt / 1000).toFixed(1)} km the pressure is ${(air.p / 1000).toFixed(2)} kPa — below the 6.3 kPa Armstrong limit. Water boils at body temperature here. A pressure suit is not optional; a pressurised cabin is the only thing between you and that.`
        : `At ${(state.alt / 1000).toFixed(1)} km the pressure is ${(air.p / 1000).toFixed(1)} kPa, still above the 6.3 kPa Armstrong limit, which the standard atmosphere puts at 19.11 km.`;
  }

  const status = document.querySelector("[data-atmo-status]");
  if (status) {
    if (state.alt <= 11000) status.textContent = "Troposphere";
    else if (state.alt <= 20000) status.textContent = "Lower stratosphere";
    else status.textContent = "Stratosphere";
  }
}

document.addEventListener("lab-input", (e) => {
  const { name, value } = e.detail;
  if (name === "alt") state.alt = value * 1000;
  else if (name === "ias") state.ias = value;
  refresh();
});

const canvas = document.getElementById("atmo-canvas");
if (canvas) {
  mountAtmosphereColumn(canvas, {
    getAltitude: () => state.alt,
    onScrub(alt) {
      state.alt = alt;
      const el = document.querySelector('lab-control[name="alt"]');
      if (el) el.value = alt / 1000;
      refresh();
    },
  });
}

document.querySelectorAll("[data-alt-preset]").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.alt = Number(btn.dataset.altPreset);
    const el = document.querySelector('lab-control[name="alt"]');
    if (el) el.value = state.alt / 1000;
    refresh();
  });
});

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
