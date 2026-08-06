const EARTH_RADIUS_KM = 6371;
const MU_EARTH = 398600; // km^3/s^2
const TIME_SCALE = 675; // visual speed-up factor so a real ~90 min LEO orbit takes ~8s on screen
const EARTH_PX = 50;
const MIN_ORBIT_PX = 75;
const MAX_ORBIT_PX = 170;
const CENTER = 200;

function computePeriodSeconds(altitudeKm) {
  const semiMajorAxis = EARTH_RADIUS_KM + altitudeKm;
  return 2 * Math.PI * Math.sqrt(semiMajorAxis ** 3 / MU_EARTH);
}

export function mount(container) {
  container.innerHTML = `
    <style>
      .sim-orbit { font-size: 0.9rem; }
      .orbit-svg { width: 100%; max-width: 320px; display: block; margin: 0 auto 1rem; }
      .orbit-earth { fill: #1e3a5f; stroke: var(--accent, #5eead4); stroke-width: 1.5; }
      .orbit-ellipse { fill: none; stroke: var(--border, #202a4a); stroke-width: 1.5; stroke-dasharray: 4 4; }
      .orbit-sat { fill: var(--accent-2, #fb923c); }
      .orbit-field { display: block; margin-bottom: 1rem; }
      .orbit-field span { display: block; color: var(--text, #e8ecf5); font-size: 0.85rem; margin-bottom: 0.4rem; }
      .orbit-field span strong { color: var(--accent, #5eead4); }
      .orbit-field input[type="range"] { width: 100%; accent-color: var(--accent, #5eead4); }
      .orbit-readout { margin-top: 1rem; padding-top: 0.8rem; border-top: 1px solid var(--border, #202a4a); }
      .orbit-row { display: flex; justify-content: space-between; color: var(--text-dim, #9aa4c0); font-size: 0.85rem; margin-bottom: 0.3rem; }
      .orbit-row strong { color: var(--text, #e8ecf5); }
      .orbit-caption { color: var(--text-dim, #9aa4c0); font-size: 0.78rem; margin: 0.8rem 0 0; }
    </style>
    <div class="sim-orbit">
      <svg viewBox="0 0 400 400" class="orbit-svg" aria-hidden="true">
        <circle cx="200" cy="200" r="${EARTH_PX}" class="orbit-earth"></circle>
        <ellipse cx="200" cy="200" class="orbit-ellipse" data-orbit-path></ellipse>
        <circle r="5" class="orbit-sat" data-orbit-sat></circle>
      </svg>
      <label class="orbit-field">
        <span>Altitude: <strong data-out="altitude">408</strong> km</span>
        <input type="range" min="200" max="2000" step="10" value="408" data-field="altitude" />
      </label>
      <label class="orbit-field">
        <span>Inclination: <strong data-out="inclination">51.6</strong>°</span>
        <input type="range" min="0" max="180" step="0.1" value="51.6" data-field="inclination" />
      </label>
      <div class="orbit-readout">
        <div class="orbit-row"><span>Orbital Period</span><strong data-out="period"></strong></div>
        <div class="orbit-row"><span>Coverage</span><strong data-out="coverage"></strong></div>
      </div>
      <p class="orbit-caption">Defaults match the International Space Station's real orbit. A simplified 2D projection, not to scale.</p>
    </div>
  `;

  const altitudeInput = container.querySelector('[data-field="altitude"]');
  const inclinationInput = container.querySelector('[data-field="inclination"]');
  const orbitPath = container.querySelector("[data-orbit-path]");
  const satDot = container.querySelector("[data-orbit-sat]");

  let rx = 0;
  let ry = 0;
  let periodSeconds = computePeriodSeconds(408);
  let theta = 0;
  let lastFrameTime = null;
  let rafId = null;

  function recomputeOrbit() {
    const altitude = Number(altitudeInput.value);
    const inclination = Number(inclinationInput.value);

    container.querySelector('[data-out="altitude"]').textContent = altitude;
    container.querySelector('[data-out="inclination"]').textContent = inclination.toFixed(1);

    rx = MIN_ORBIT_PX + ((altitude - 200) / (2000 - 200)) * (MAX_ORBIT_PX - MIN_ORBIT_PX);
    ry = rx * Math.abs(Math.cos((inclination * Math.PI) / 180));
    orbitPath.setAttribute("rx", rx.toFixed(1));
    orbitPath.setAttribute("ry", ry.toFixed(1));

    periodSeconds = computePeriodSeconds(altitude);
    container.querySelector('[data-out="period"]').textContent = `${(periodSeconds / 60).toFixed(1)} min`;

    const maxLat = inclination <= 90 ? inclination : 180 - inclination;
    container.querySelector('[data-out="coverage"]').textContent = `up to ±${maxLat.toFixed(1)}° latitude`;
  }

  function frame(timestamp) {
    if (lastFrameTime === null) lastFrameTime = timestamp;
    const deltaSeconds = (timestamp - lastFrameTime) / 1000;
    lastFrameTime = timestamp;

    const angularVelocity = (2 * Math.PI * TIME_SCALE) / periodSeconds;
    theta += angularVelocity * deltaSeconds;

    const x = CENTER + rx * Math.cos(theta);
    const y = CENTER + ry * Math.sin(theta);
    satDot.setAttribute("cx", x.toFixed(1));
    satDot.setAttribute("cy", y.toFixed(1));

    rafId = requestAnimationFrame(frame);
  }

  altitudeInput.addEventListener("input", recomputeOrbit);
  inclinationInput.addEventListener("input", recomputeOrbit);

  recomputeOrbit();
  rafId = requestAnimationFrame(frame);

  container._cancelOrbitFrame = () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
  };
}

export function unmount(container) {
  if (container && container._cancelOrbitFrame) {
    container._cancelOrbitFrame();
  }
}
