// Flight Dynamics — page controller.

import { mountVnDiagram } from "../experiences/vn-diagram.js";
import { CATEGORIES, HF24_MARUT, cornerSpeed, representativeN } from "../systems/vn-diagram.js";

const state = {
  wingLoading: 3500,
  clMax: 1.3,
  clMaxNeg: 0.7,
  nPos: representativeN(CATEGORIES.transport.nPosRange),
  nNeg: representativeN(CATEGORIES.transport.nNegRange),
  vC: 250,
  vD: 325,
};

const out = (k) => document.querySelector(`[data-out="${k}"]`);

function refresh() {
  const vA = cornerSpeed(state.nPos, state.wingLoading, state.clMax);
  out("npos").value = state.nPos;
  out("nneg").value = state.nNeg;
  out("va").value = vA;
  out("wingload").value = state.wingLoading;

  const status = document.querySelector("[data-vn-status]");
  if (status) status.textContent = `n = ${state.nPos.toFixed(1)} to ${state.nNeg.toFixed(1)}`;
}

document.addEventListener("lab-input", (e) => {
  const { name, value } = e.detail;
  if (name === "wingload") state.wingLoading = value;
  else if (name === "clmax") state.clMax = value;
  refresh();
});

document.querySelectorAll("[data-vn-category]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const cat = CATEGORIES[btn.dataset.vnCategory];
    if (!cat) return;
    state.nPos = representativeN(cat.nPosRange);
    state.nNeg = representativeN(cat.nNegRange);
    document.querySelectorAll("[data-vn-category]").forEach((b) => b.classList.remove("ctrl-active"));
    btn.classList.add("ctrl-active");
    refresh();
  });
});

document.querySelector("[data-vn-marut]")?.addEventListener("click", () => {
  state.nPos = HF24_MARUT.nPos;
  state.nNeg = HF24_MARUT.nNeg;
  refresh();
});

const canvas = document.getElementById("vn-canvas");
if (canvas) {
  mountVnDiagram(canvas, {
    getState: () => state,
  });
}

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
