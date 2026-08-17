// Orbit Field — the SPACE world's environment, and its first interaction.
//
// Almost every diagram of Earth orbit lies about scale. The satellites are
// drawn as big as continents and the orbits as generous halos, so people
// come away thinking the ISS is somewhere near the Moon and that
// geostationary is just a bit further out. The real picture is stranger and
// much more interesting: at 408 km the station is skimming the surface —
// a band thinner than the line used to draw the coastline — while
// geostationary sits six and a half Earth radii away.
//
// So this draws it to scale, with nothing exaggerated except the satellite
// dots themselves, which have to be visible.
//
// The part that makes it click is motion. Every reference orbit carries a
// satellite moving at its true angular rate, computed from the same
// gravitational parameter, so LEO tears around the planet while
// geostationary barely creeps. You are watching Kepler's third law happen:
// T is proportional to r^(3/2), and the further out you go the slower it
// gets, in both senses — longer path and lower speed.
//
// Everything numeric here is computed, not typed in:
//     v = sqrt(mu / r)
//     T = 2*pi*sqrt(r^3 / mu)
// with mu = 398600.4418 km^3/s^2 and Earth's mean radius 6371 km. Check any
// readout against a reference and it will agree, because it is the same
// arithmetic a textbook would do.

import { Stage, clamp, lerp, approach, mulberry32, attachPointer } from "../systems/stage.js";

export const MU = 398600.4418; // km^3/s^2, Earth's standard gravitational parameter
export const R_EARTH = 6371; // km, mean radius

export const orbitalVelocity = (r) => Math.sqrt(MU / r); // km/s
export const orbitalPeriod = (r) => 2 * Math.PI * Math.sqrt((r * r * r) / MU); // seconds

// Reference orbits, by altitude above mean sea level in km. Periods and
// speeds are not stored — they're derived, which is the whole point.
export const REFERENCE_ORBITS = [
  {
    id: "leo",
    alt: 408,
    label: "ISS",
    detail: "Low Earth orbit. Crewed, and low enough that residual atmosphere drags on it — the station has to be reboosted or it comes down.",
  },
  {
    id: "sso",
    alt: 700,
    label: "Sun-synchronous",
    detail: "Earth observation. The orbit plane precesses at the same rate Earth goes round the Sun, so the satellite crosses each latitude at a fixed local time.",
  },
  {
    id: "meo",
    alt: 20180,
    label: "GPS",
    detail: "Medium Earth orbit, half a sidereal day. Each satellite traces the same ground track twice a day.",
  },
  {
    id: "geo",
    alt: 35786,
    label: "Geostationary",
    detail: "One sidereal day, over the equator. From the ground the satellite never moves, which is why dishes can be bolted in place.",
  },
];

const MAX_ALT = 42000; // km, frames GEO with a little room

export function mountOrbitField(canvas, options = {}) {
  const onSelect = options.onSelect || (() => {});
  const getAltitude = options.getAltitude || (() => 408);

  let cx = 0;
  let cy = 0;
  let pxPerKm = 1;
  let starCanvas = null;

  // Independent phase per orbit, advanced by true angular rate.
  const phases = REFERENCE_ORBITS.map((_, i) => i * 1.9);
  let userPhase = 0;
  let hovered = null;
  let hoverGlow = REFERENCE_ORBITS.map(() => 0);

  function layout(stage) {
    cx = stage.width * 0.5;
    cy = stage.height * 0.52;
    // Fit the outermost orbit inside the smaller half-dimension, with margin.
    const half = Math.min(stage.width, stage.height) * 0.5;
    pxPerKm = (half - 26) / (R_EARTH + MAX_ALT);
    buildStars(stage);
  }

  function buildStars(stage) {
    starCanvas = document.createElement("canvas");
    starCanvas.width = Math.round(stage.width * stage.dpr);
    starCanvas.height = Math.round(stage.height * stage.dpr);
    const c = starCanvas.getContext("2d");
    c.setTransform(stage.dpr, 0, 0, stage.dpr, 0, 0);
    const rand = mulberry32(77123);
    const count = Math.round(clamp((stage.width * stage.height) / 7000, 60, 260));
    for (let i = 0; i < count; i++) {
      const x = rand() * stage.width;
      const y = rand() * stage.height;
      const s = rand();
      c.globalAlpha = 0.2 + rand() * 0.5;
      c.fillStyle = "#ffffff";
      c.beginPath();
      c.arc(x, y, s < 0.92 ? 0.7 : 1.3, 0, Math.PI * 2);
      c.fill();
    }
  }

  const rToPx = (rKm) => rKm * pxPerKm;

  /* ---------- Hit testing ---------- */

  // Which reference ring is the pointer near? Radial distance only — the
  // ring is a circle, so the angle doesn't matter, and that makes the whole
  // ring a target rather than just the satellite dot on it.
  function ringAt(px, py) {
    const dx = px - cx;
    const dy = py - cy;
    const dist = Math.hypot(dx, dy);
    let best = null;
    let bestDelta = 16; // px tolerance
    REFERENCE_ORBITS.forEach((o, i) => {
      const ringPx = rToPx(R_EARTH + o.alt);
      const delta = Math.abs(dist - ringPx);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = i;
      }
    });
    return best;
  }

  /* ---------- Drawing ---------- */

  function drawEarth(ctx) {
    const rPx = rToPx(R_EARTH);

    // Body
    const g = ctx.createRadialGradient(
      cx - rPx * 0.35, cy - rPx * 0.4, rPx * 0.05,
      cx, cy, rPx
    );
    g.addColorStop(0, "#2f6ea8");
    g.addColorStop(0.55, "#1b4570");
    g.addColorStop(1, "#0a1b31");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
    ctx.fill();

    // Terminator: the unlit half, soft-edged.
    const t = ctx.createLinearGradient(cx - rPx, cy, cx + rPx, cy);
    t.addColorStop(0, "rgba(2, 5, 12, 0)");
    t.addColorStop(0.55, "rgba(2, 5, 12, 0.45)");
    t.addColorStop(1, "rgba(2, 5, 12, 0.88)");
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = t;
    ctx.fillRect(cx - rPx, cy - rPx, rPx * 2, rPx * 2);
    ctx.restore();

    // Atmosphere. Drawn at true thickness — the Karman line is 100 km on a
    // 6371 km radius, so this is a 1.6% halo, and it should look like one.
    const atmoPx = rToPx(R_EARTH + 100);
    ctx.strokeStyle = "rgba(120, 180, 255, 0.35)";
    ctx.lineWidth = Math.max(1, atmoPx - rPx);
    ctx.beginPath();
    ctx.arc(cx, cy, (rPx + atmoPx) / 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawRing(ctx, altKm, alpha, colour, dashed) {
    const rPx = rToPx(R_EARTH + altKm);
    ctx.save();
    ctx.strokeStyle = colour;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1;
    if (dashed) ctx.setLineDash([2, 6]);
    ctx.beginPath();
    ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawSat(ctx, altKm, phase, size, colour, glow) {
    const rPx = rToPx(R_EARTH + altKm);
    const x = cx + Math.cos(phase) * rPx;
    const y = cy + Math.sin(phase) * rPx;
    if (glow > 0.01) {
      ctx.fillStyle = colour;
      ctx.globalAlpha = glow * 0.22;
      ctx.beginPath();
      ctx.arc(x, y, size * 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    return { x, y };
  }

  const stage = new Stage(canvas, {
    staticFrameTime: 6,
    onResize: layout,
    update(dt) {
      // Time compression: one real second is TIME_SCALE orbital seconds.
      // Chosen so LEO takes a few seconds to go round — fast enough to read
      // as motion, slow enough that GEO's crawl is still perceptible rather
      // than frozen. The *ratio* between orbits is untouched, which is the
      // only thing that has to be true.
      const TIME_SCALE = 1400;
      REFERENCE_ORBITS.forEach((o, i) => {
        const T = orbitalPeriod(R_EARTH + o.alt);
        phases[i] += ((2 * Math.PI) / T) * dt * TIME_SCALE;
        const target = hovered === i ? 1 : 0;
        hoverGlow[i] = approach(hoverGlow[i], target, 0.002, dt);
      });
      const userR = R_EARTH + getAltitude();
      userPhase += ((2 * Math.PI) / orbitalPeriod(userR)) * dt * TIME_SCALE;
    },
    draw(ctx, st) {
      if (!starCanvas) layout(st);
      if (starCanvas) ctx.drawImage(starCanvas, 0, 0, st.width, st.height);

      drawEarth(ctx);

      // Reference orbits
      REFERENCE_ORBITS.forEach((o, i) => {
        const glow = hoverGlow[i];
        drawRing(ctx, o.alt, lerp(0.28, 0.85, glow), "#6ea8ff", true);
        drawSat(ctx, o.alt, phases[i], lerp(2.2, 3.4, glow), "#bcd8ff", glow);
      });

      // The user's orbit, drawn on top in the warm accent so it never gets
      // confused with a reference.
      const alt = getAltitude();
      drawRing(ctx, alt, 0.95, "#ffab5e", false);
      drawSat(ctx, alt, userPhase, 4, "#ffc98a", 1);

      // Labels for reference rings, placed at the top of each circle so
      // they never sit on the planet.
      ctx.font = '500 10px "JetBrains Mono", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      REFERENCE_ORBITS.forEach((o, i) => {
        const rPx = rToPx(R_EARTH + o.alt);
        if (rPx < 14) return;
        ctx.fillStyle = `rgba(188, 216, 255, ${lerp(0.4, 1, hoverGlow[i])})`;
        ctx.fillText(o.label, cx, cy - rPx - 4);
      });
    },
  });

  layout(stage);

  const detach = attachPointer(canvas, {
    preventDefault: false,
    onMove(p) {
      const hit = ringAt(p.x, p.y);
      if (hit !== hovered) {
        hovered = hit;
        canvas.style.cursor = hit === null ? "default" : "pointer";
      }
    },
    onDown(p) {
      const hit = ringAt(p.x, p.y);
      if (hit !== null) onSelect(REFERENCE_ORBITS[hit]);
    },
    onLeave() {
      hovered = null;
      canvas.style.cursor = "default";
    },
  });

  stage.start();

  return {
    stage,
    destroy() {
      detach();
      stage.destroy();
    },
  };
}
