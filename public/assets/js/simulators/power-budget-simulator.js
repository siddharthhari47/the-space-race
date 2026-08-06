const WATTS_PER_PANEL = 0.8;
const BUS_OVERHEAD = 1.2;

export function mount(container) {
  container.innerHTML = `
    <style>
      .sim-power-budget { font-size: 0.9rem; }
      .pb-field { display: block; margin-bottom: 1.1rem; }
      .pb-label { display: block; color: var(--text, #e8ecf5); font-size: 0.85rem; margin-bottom: 0.4rem; }
      .pb-label strong { color: var(--accent, #5eead4); }
      .pb-field input[type="range"] { width: 100%; accent-color: var(--accent, #5eead4); }
      .pb-result { margin-top: 1.2rem; padding-top: 1rem; border-top: 1px solid var(--border, #202a4a); }
      .pb-row { display: flex; justify-content: space-between; color: var(--text-dim, #9aa4c0); font-size: 0.85rem; margin-bottom: 0.4rem; }
      .pb-row strong { color: var(--text, #e8ecf5); }
      .pb-net { margin-top: 0.6rem; font-weight: 600; color: var(--accent, #5eead4); font-size: 0.9rem; }
      .pb-net.over { color: #f87171; }
      .pb-caption { color: var(--text-dim, #9aa4c0); font-size: 0.78rem; margin: 0.9rem 0 0; }
    </style>
    <div class="sim-power-budget">
      <label class="pb-field">
        <span class="pb-label">Solar Panels Lit: <strong data-out="panels">4</strong></span>
        <input type="range" min="1" max="6" value="4" step="1" data-field="panels" />
      </label>
      <label class="pb-field">
        <span class="pb-label">Payload Draw: <strong data-out="payload">2.0</strong> W</span>
        <input type="range" min="0" max="5" value="2" step="0.1" data-field="payload" />
      </label>
      <label class="pb-field">
        <span class="pb-label">Eclipse Fraction: <strong data-out="eclipse">35</strong>%</span>
        <input type="range" min="0" max="60" value="35" step="1" data-field="eclipse" />
      </label>

      <div class="pb-result">
        <div class="pb-row"><span>Average Generated</span><strong data-out="generated"></strong></div>
        <div class="pb-row"><span>Average Consumed</span><strong data-out="consumed"></strong></div>
        <div class="pb-net" data-net></div>
      </div>

      <p class="pb-caption">A simplified average-power model — real missions also track battery depth-of-discharge and peak loads.</p>
    </div>
  `;

  const panelsInput = container.querySelector('[data-field="panels"]');
  const payloadInput = container.querySelector('[data-field="payload"]');
  const eclipseInput = container.querySelector('[data-field="eclipse"]');
  const netEl = container.querySelector("[data-net]");

  function recompute() {
    const panels = Number(panelsInput.value);
    const payload = Number(payloadInput.value);
    const eclipse = Number(eclipseInput.value) / 100;

    container.querySelector('[data-out="panels"]').textContent = panels;
    container.querySelector('[data-out="payload"]').textContent = payload.toFixed(1);
    container.querySelector('[data-out="eclipse"]').textContent = Math.round(eclipse * 100);

    const generated = panels * WATTS_PER_PANEL * (1 - eclipse);
    const consumed = BUS_OVERHEAD + payload;
    const net = generated - consumed;

    container.querySelector('[data-out="generated"]').textContent = `${generated.toFixed(2)} W`;
    container.querySelector('[data-out="consumed"]').textContent = `${consumed.toFixed(2)} W`;

    netEl.textContent =
      net >= 0
        ? `Surplus: +${net.toFixed(2)} W — the battery can recharge fully each orbit.`
        : `Deficit: ${net.toFixed(2)} W — the battery will drain over time at this rate.`;
    netEl.classList.toggle("over", net < 0);
  }

  [panelsInput, payloadInput, eclipseInput].forEach((input) => input.addEventListener("input", recompute));
  recompute();
}

export function unmount() {}
