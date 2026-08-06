const SIZES = {
  "1U": { mass: 1.33, volume: 1, baselineMass: 0.5, baselineVolume: 0.4 },
  "3U": { mass: 4, volume: 3, baselineMass: 1.0, baselineVolume: 1.0 },
  "6U": { mass: 8, volume: 6, baselineMass: 1.8, baselineVolume: 1.8 },
  "12U": { mass: 16, volume: 12, baselineMass: 3.2, baselineVolume: 3.2 },
};

const COMPONENTS = [
  { id: "camera", label: "Camera Payload", mass: 0.3, volume: 0.4 },
  { id: "science", label: "Science Instrument", mass: 0.5, volume: 0.6 },
  { id: "propulsion", label: "Propulsion Module", mass: 0.6, volume: 1.0 },
  { id: "battery-extra", label: "Extra Battery Pack", mass: 0.4, volume: 0.3 },
  { id: "star-tracker", label: "Star Tracker", mass: 0.3, volume: 0.3 },
  { id: "high-gain", label: "High-Gain Antenna", mass: 0.25, volume: 0.3 },
];

export function mount(container) {
  let currentSize = "1U";
  const selected = new Set();

  container.innerHTML = `
    <style>
      .sim-cubesat-builder { font-size: 0.9rem; }
      .cb-label { display: block; font-family: "Space Grotesk", sans-serif; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--accent, #5eead4); margin-bottom: 0.5rem; }
      .cb-size-buttons { display: flex; gap: 0.5rem; margin-bottom: 1.2rem; flex-wrap: wrap; }
      .cb-size-buttons button { background: var(--surface, #10162b); border: 1px solid var(--border, #202a4a); color: var(--text-dim, #9aa4c0); padding: 0.4rem 0.9rem; border-radius: var(--radius-pill, 999px); cursor: pointer; font-family: "Space Grotesk", sans-serif; font-weight: 600; font-size: 0.85rem; }
      .cb-size-buttons button[aria-pressed="true"] { background: var(--accent, #5eead4); border-color: var(--accent, #5eead4); color: var(--bg, #05070f); }
      .cb-components { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1.2rem; }
      .cb-components label { display: flex; align-items: center; gap: 0.5rem; color: var(--text, #e8ecf5); cursor: pointer; }
      .cb-cost { color: var(--text-dim, #9aa4c0); font-size: 0.78rem; margin-left: auto; }
      .cb-meter { margin-bottom: 0.9rem; }
      .cb-meter-label { display: block; font-size: 0.8rem; color: var(--text-dim, #9aa4c0); margin-bottom: 0.3rem; }
      .cb-meter-track { background: var(--bg-alt, #0a0e1c); border: 1px solid var(--border, #202a4a); border-radius: var(--radius-pill, 999px); height: 10px; overflow: hidden; }
      .cb-meter-fill { height: 100%; background: var(--accent, #5eead4); transition: width 0.2s ease, background 0.2s ease; }
      .cb-meter-fill.over { background: #f87171; }
      .cb-meter-value { display: block; font-size: 0.78rem; color: var(--text-dim, #9aa4c0); margin-top: 0.3rem; }
      .cb-caption { color: var(--text-dim, #9aa4c0); font-size: 0.78rem; margin: 0.8rem 0 0; }
    </style>
    <div class="sim-cubesat-builder">
      <span class="cb-label">CubeSat Size</span>
      <div class="cb-size-buttons">
        ${Object.keys(SIZES)
          .map((size) => `<button type="button" data-size="${size}" aria-pressed="${size === currentSize}">${size}</button>`)
          .join("")}
      </div>
      <span class="cb-label">Optional Components</span>
      <div class="cb-components">
        ${COMPONENTS.map(
          (c) => `
          <label>
            <input type="checkbox" data-id="${c.id}" />
            ${c.label}
            <span class="cb-cost">${c.mass}kg · ${c.volume}U</span>
          </label>`
        ).join("")}
      </div>
      <div class="cb-budget">
        <div class="cb-meter">
          <span class="cb-meter-label">Mass</span>
          <div class="cb-meter-track"><div class="cb-meter-fill" data-metric="mass"></div></div>
          <span class="cb-meter-value" data-value="mass"></span>
        </div>
        <div class="cb-meter">
          <span class="cb-meter-label">Volume</span>
          <div class="cb-meter-track"><div class="cb-meter-fill" data-metric="volume"></div></div>
          <span class="cb-meter-value" data-value="volume"></span>
        </div>
      </div>
      <p class="cb-caption">Simplified, illustrative figures for teaching — not real spacecraft mass budgets.</p>
    </div>
  `;

  const sizeButtons = Array.from(container.querySelectorAll("[data-size]"));
  const checkboxes = Array.from(container.querySelectorAll("input[type=checkbox]"));
  const massFill = container.querySelector('[data-metric="mass"]');
  const volumeFill = container.querySelector('[data-metric="volume"]');
  const massValue = container.querySelector('[data-value="mass"]');
  const volumeValue = container.querySelector('[data-value="volume"]');

  function recompute() {
    const size = SIZES[currentSize];
    let mass = size.baselineMass;
    let volume = size.baselineVolume;

    selected.forEach((id) => {
      const component = COMPONENTS.find((c) => c.id === id);
      if (component) {
        mass += component.mass;
        volume += component.volume;
      }
    });

    const massPct = Math.min(100, (mass / size.mass) * 100);
    const volumePct = Math.min(100, (volume / size.volume) * 100);

    massFill.style.width = `${massPct}%`;
    volumeFill.style.width = `${volumePct}%`;
    massFill.classList.toggle("over", mass > size.mass);
    volumeFill.classList.toggle("over", volume > size.volume);
    massValue.textContent = `${mass.toFixed(2)} / ${size.mass} kg`;
    volumeValue.textContent = `${volume.toFixed(1)} / ${size.volume} U`;
  }

  sizeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      currentSize = btn.dataset.size;
      sizeButtons.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      recompute();
    });
  });

  checkboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selected.add(checkbox.dataset.id);
      else selected.delete(checkbox.dataset.id);
      recompute();
    });
  });

  recompute();
}

export function unmount() {}
