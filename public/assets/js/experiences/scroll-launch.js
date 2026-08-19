// Scroll-driven launch sequence for the homepage.
//
// The scroll position is the timeline. The canvas is deliberately procedural
// rather than a downloaded 3D asset: it keeps the opening fast, deterministic,
// and legible on a phone, while leaving the full rocket lab to do the heavy
// physics later in the site.

import {
  Stage,
  clamp,
  lerp,
  mulberry32,
  prefersReducedMotion,
} from "../systems/stage.js";

const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const PHASES = [
  { key: "pad", label: "LAUNCH PAD", max: 0.14 },
  { key: "ignition", label: "IGNITION", max: 0.28 },
  { key: "liftoff", label: "LIFTOFF", max: 0.48 },
  { key: "ascent", label: "ASCENT", max: 0.78 },
  { key: "orbit", label: "ORBITAL INSERTION", max: 1.01 },
];

const phaseFor = (progress) => PHASES.find((phase) => progress < phase.max) || PHASES.at(-1);

const geometry = (stage) => {
  const h = stage.height;
  return {
    padY: h * 0.76,
    rocketX: stage.width * (stage.width < 700 ? 0.56 : 0.58),
    rocketSize: clamp(Math.min(stage.width, h) * 0.31, 118, 214),
  };
};

export function mountScrollLaunch(canvas, section, options = {}) {
  const onProgress = options.onProgress || (() => {});
  const state = { target: 0, progress: 0 };
  const rand = mulberry32(19840504);

  const dust = Array.from({ length: 84 }, () => ({
    x: rand(),
    y: rand(),
    radius: rand() < 0.88 ? rand() * 1.1 + 0.2 : rand() * 1.7 + 0.7,
    alpha: rand() * 0.55 + 0.15,
    drift: rand() * 0.8 + 0.2,
    phase: rand() * Math.PI * 2,
  }));

  const stars = Array.from({ length: 96 }, () => ({
    x: rand(),
    y: rand() * 0.88,
    radius: rand() < 0.92 ? rand() * 0.8 + 0.25 : rand() * 1.5 + 0.6,
    alpha: rand() * 0.7 + 0.2,
    phase: rand() * Math.PI * 2,
  }));

  let currentGeometry = null;
  let scrollRaf = 0;

  const stage = new Stage(canvas, {
    alpha: false,
    staticFrameTime: 1.4,
    onResize(st) {
      currentGeometry = geometry(st);
    },
    update(dt, st) {
      // The tiny amount of easing makes a trackpad feel like a camera move,
      // without ever taking ownership of the timeline from the scroll.
      state.progress = prefersReducedMotion
        ? state.target
        : state.target + (state.progress - state.target) * Math.pow(0.018, dt);
      if (!currentGeometry) currentGeometry = geometry(st);
    },
    draw(ctx, st) {
      drawScene(ctx, st, state.progress, currentGeometry, dust, stars);
    },
  });

  const syncProgress = () => {
    scrollRaf = 0;
    const rect = section.getBoundingClientRect();
    const scrollLength = Math.max(1, rect.height - window.innerHeight);
    state.target = clamp(-rect.top / scrollLength, 0, 1);
    onProgress(state.target, phaseFor(state.target));
    if (prefersReducedMotion) stage.renderOnce();
  };

  const onScroll = () => {
    if (!scrollRaf) scrollRaf = requestAnimationFrame(syncProgress);
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", syncProgress);

  currentGeometry = geometry(stage);
  stage.start();
  syncProgress();

  return {
    stage,
    getProgress: () => state.target,
    destroy() {
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", syncProgress);
      stage.destroy();
    },
  };
}

function drawScene(ctx, stage, progress, g, dust, stars) {
  const { width: w, height: h, time } = stage;
  const ignition = smoothstep(0.12, 0.25, progress);
  const lift = smoothstep(0.25, 0.68, progress);
  const ascent = smoothstep(0.38, 0.82, progress);
  const highAtmosphere = smoothstep(0.56, 0.88, progress);
  const space = smoothstep(0.72, 0.98, progress);
  const orbit = smoothstep(0.9, 1, progress);

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, `rgb(${lerp(4, 1, space)}, ${lerp(9, 3, space)}, ${lerp(20, 12, space)})`);
  sky.addColorStop(0.55, `rgb(${lerp(11, 3, space)}, ${lerp(34, 11, space)}, ${lerp(64, 28, space)})`);
  sky.addColorStop(1, `rgb(${lerp(27, 7, space)}, ${lerp(58, 14, space)}, ${lerp(89, 34, space)})`);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  drawAtmosphericGrid(ctx, w, h, progress, highAtmosphere);
  drawStars(ctx, w, h, time, space, stars);
  drawDust(ctx, w, h, time, 1 - space, dust);
  drawEarth(ctx, w, h, progress, space);

  const physicalLift = lift * h * 0.82;
  const cameraFollow = smoothstep(0.31, 0.76, progress) * h * 0.57;
  const padY = g.padY + cameraFollow;
  const orbitalDrift = orbit * w * (w < 700 ? 0.12 : 0.16);
  const rocketX = g.rocketX + orbitalDrift;
  const mobileClearance = w < 700 ? smoothstep(0.3, 0.62, progress) * h * 0.09 : 0;
  const rocketY =
    g.padY - physicalLift + cameraFollow - mobileClearance - Math.sin(orbit * Math.PI) * h * 0.055;
  const rocketSize = g.rocketSize * lerp(1, 0.83, space * 0.8);
  const engine = ignition * (1 - smoothstep(0.94, 1, progress) * 0.35);

  drawLaunchPad(ctx, w, h, padY, 1 - smoothstep(0.34, 0.68, progress));
  drawExhaust(ctx, rocketX, rocketY, rocketSize, engine, ascent, space, time, h);
  drawRocket(ctx, rocketX, rocketY, rocketSize, engine, time);
  drawOrbitalArc(ctx, rocketX, rocketY, rocketSize, orbit, w, h);

  // A quiet registration line makes the canvas feel like an instrument panel
  // rather than a decorative video backdrop.
  ctx.save();
  ctx.strokeStyle = `rgba(178, 205, 236, ${0.12 + space * 0.08})`;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 8]);
  ctx.beginPath();
  ctx.moveTo(28, h * 0.14);
  ctx.lineTo(w - 28, h * 0.14);
  ctx.stroke();
  ctx.restore();
}

function drawAtmosphericGrid(ctx, w, h, progress, highAtmosphere) {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = `rgba(154, 188, 226, ${0.045 * (1 - highAtmosphere * 0.75)})`;
  const spacing = Math.max(42, Math.min(82, w * 0.08));
  for (let x = spacing; x < w; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = h * 0.2; y < h; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawStars(ctx, w, h, time, alpha, stars) {
  if (alpha < 0.01) return;
  ctx.save();
  for (const star of stars) {
    const twinkle = 0.72 + Math.sin(time * 0.7 + star.phase) * 0.18;
    ctx.globalAlpha = star.alpha * alpha * twinkle;
    ctx.fillStyle = "#edf5ff";
    ctx.beginPath();
    ctx.arc(star.x * w, star.y * h, star.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawDust(ctx, w, h, time, alpha, dust) {
  if (alpha < 0.01) return;
  ctx.save();
  for (const particle of dust) {
    const x = ((particle.x * w + time * particle.drift * 3) % (w + 20)) - 10;
    const y = particle.y * h + Math.sin(time * 0.35 + particle.phase) * 4;
    ctx.globalAlpha = particle.alpha * alpha * 0.22;
    ctx.fillStyle = "#a6c9e8";
    ctx.beginPath();
    ctx.arc(x, y, particle.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawEarth(ctx, w, h, progress, space) {
  const horizon = h * 0.86;
  const visibility = 1 - smoothstep(0.54, 0.94, progress);
  if (visibility < 0.01) return;

  ctx.save();
  ctx.globalAlpha = visibility;
  const earth = ctx.createLinearGradient(0, horizon, 0, h);
  earth.addColorStop(0, "rgba(54, 118, 172, 0.58)");
  earth.addColorStop(0.2, "rgba(13, 53, 96, 0.84)");
  earth.addColorStop(1, "rgba(4, 15, 30, 0.98)");
  ctx.fillStyle = earth;
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, horizon + 20);
  ctx.quadraticCurveTo(w * 0.5, horizon - w * 0.11, w, horizon + 20);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = `rgba(142, 205, 255, ${0.42 * (1 - space * 0.25)})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, horizon + 18);
  ctx.quadraticCurveTo(w * 0.5, horizon - w * 0.11, w, horizon + 18);
  ctx.stroke();

  ctx.restore();
}

function drawLaunchPad(ctx, w, h, padY, visibility) {
  if (visibility < 0.01) return;
  ctx.save();
  ctx.globalAlpha = visibility;
  const towerX = w * (w < 700 ? 0.49 : 0.53);
  const padWidth = clamp(w * 0.24, 148, 360);
  const deckY = padY + 22;

  ctx.fillStyle = "rgba(6, 13, 22, 0.84)";
  ctx.fillRect(towerX - padWidth * 0.5, deckY, padWidth, 8);
  ctx.strokeStyle = "rgba(132, 174, 211, 0.42)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(towerX - padWidth * 0.5, deckY);
  ctx.lineTo(towerX + padWidth * 0.5, deckY);
  ctx.stroke();

  const towerH = clamp(h * 0.42, 180, 330);
  const towerXLeft = towerX - 38;
  const towerXRight = towerX + 30;
  ctx.strokeStyle = "rgba(150, 181, 210, 0.46)";
  ctx.beginPath();
  ctx.moveTo(towerXLeft, deckY);
  ctx.lineTo(towerXLeft + 12, deckY - towerH);
  ctx.moveTo(towerXRight, deckY);
  ctx.lineTo(towerXRight - 10, deckY - towerH);
  ctx.stroke();
  for (let y = deckY - 28; y > deckY - towerH + 12; y -= 30) {
    ctx.beginPath();
    ctx.moveTo(towerXLeft + ((deckY - y) / towerH) * 12, y);
    ctx.lineTo(towerXRight - ((deckY - y) / towerH) * 10, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255, 170, 90, 0.55)";
  ctx.beginPath();
  ctx.moveTo(towerXLeft + 7, deckY - towerH * 0.58);
  ctx.lineTo(towerX - 5, deckY - towerH * 0.58);
  ctx.stroke();

  ctx.fillStyle = "rgba(133, 167, 193, 0.3)";
  ctx.fillRect(towerX - padWidth * 0.5, deckY + 8, padWidth, Math.max(2, h * 0.02));
  ctx.restore();
}

function drawExhaust(ctx, x, y, size, engine, ascent, space, time, h) {
  if (engine < 0.01) return;
  const nozzleY = y + size * 0.45;
  const trail = size * (0.16 + ascent * 1.45) * (1 - space * 0.45);
  const flame = size * (0.2 + engine * 0.5);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const glow = ctx.createRadialGradient(x, nozzleY + flame * 0.3, 0, x, nozzleY + flame * 0.3, flame * 2.4);
  glow.addColorStop(0, `rgba(255, 231, 176, ${0.44 * engine})`);
  glow.addColorStop(0.35, `rgba(255, 143, 52, ${0.23 * engine})`);
  glow.addColorStop(1, "rgba(255, 80, 20, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(x - flame * 2.4, nozzleY - flame, flame * 4.8, flame * 4.8);

  const flameGradient = ctx.createLinearGradient(x, nozzleY, x, nozzleY + flame);
  flameGradient.addColorStop(0, "rgba(255, 244, 196, 0.95)");
  flameGradient.addColorStop(0.28, "rgba(255, 170, 65, 0.9)");
  flameGradient.addColorStop(1, "rgba(255, 62, 19, 0)");
  ctx.fillStyle = flameGradient;
  ctx.beginPath();
  ctx.moveTo(x - size * 0.095, nozzleY);
  ctx.quadraticCurveTo(x - size * 0.06, nozzleY + flame * 0.65, x, nozzleY + flame * (1.12 + Math.sin(time * 38) * 0.08));
  ctx.quadraticCurveTo(x + size * 0.06, nozzleY + flame * 0.65, x + size * 0.095, nozzleY);
  ctx.closePath();
  ctx.fill();

  const smokeAlpha = engine * (1 - space * 0.7);
  if (smokeAlpha > 0.01) {
    const count = h < 620 ? 18 : 32;
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const wobble = Math.sin(time * (0.8 + t) + i * 1.7) * size * (0.05 + t * 0.1);
      const px = x + wobble + Math.sin(i * 8.1) * size * 0.06;
      const py = nozzleY + flame * 0.5 + t * trail;
      const radius = size * (0.018 + t * 0.09) * (0.75 + Math.sin(i * 3.7) * 0.15);
      ctx.globalAlpha = smokeAlpha * (1 - t) * 0.2;
      ctx.fillStyle = i % 3 === 0 ? "#e4edf3" : "#9faebb";
      ctx.beginPath();
      ctx.ellipse(px, py, radius * 1.35, radius, wobble * 0.01, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawRocket(ctx, x, y, size, engine, time) {
  const s = size / 220;
  const flicker = 0.9 + Math.sin(time * 34) * 0.05;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);

  ctx.shadowColor = engine > 0.1 ? "rgba(255, 177, 76, 0.35)" : "transparent";
  ctx.shadowBlur = engine > 0.1 ? 18 * flicker : 0;

  // Service umbilical: a small piece of hardware that makes the pad state
  // feel like a vehicle waiting for a sequence, not a floating icon.
  ctx.strokeStyle = "rgba(255, 179, 98, 0.55)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-13, 16);
  ctx.lineTo(-30, 16);
  ctx.lineTo(-37, 24);
  ctx.stroke();

  // Fins behind the body.
  ctx.fillStyle = "#a8b6c8";
  ctx.beginPath();
  ctx.moveTo(-10, 46);
  ctx.lineTo(-31, 70);
  ctx.lineTo(-13, 64);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(10, 46);
  ctx.lineTo(31, 70);
  ctx.lineTo(13, 64);
  ctx.closePath();
  ctx.fill();

  // Main body and nose.
  const body = ctx.createLinearGradient(-12, 0, 12, 0);
  body.addColorStop(0, "#8998aa");
  body.addColorStop(0.34, "#f4f7fa");
  body.addColorStop(0.7, "#dce5ee");
  body.addColorStop(1, "#6d7d92");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-11, 61);
  ctx.lineTo(-11, -63);
  ctx.quadraticCurveTo(-11, -86, 0, -103);
  ctx.quadraticCurveTo(11, -86, 11, -63);
  ctx.lineTo(11, 61);
  ctx.closePath();
  ctx.fill();

  // Stage break and a small window establish scale without pretending this
  // is a specific real vehicle.
  ctx.fillStyle = "rgba(41, 53, 70, 0.7)";
  ctx.fillRect(-11, 20, 22, 3);
  ctx.fillStyle = "#18334e";
  ctx.beginPath();
  ctx.arc(0, -46, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(110, 185, 235, 0.72)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = "#596b7f";
  ctx.fillRect(-8, 61, 6, 4);
  ctx.fillRect(2, 61, 6, 4);
  ctx.restore();
}

function drawOrbitalArc(ctx, x, y, size, orbit, w, h) {
  if (orbit < 0.01) return;
  const alpha = smoothstep(0, 0.65, orbit) * 0.8;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = "rgba(132, 198, 255, 0.88)";
  ctx.lineWidth = 1.3;
  ctx.setLineDash([4, 7]);
  ctx.beginPath();
  ctx.moveTo(x - w * 0.28, y + h * 0.05);
  ctx.quadraticCurveTo(x + w * 0.02, y - h * 0.16, x + w * 0.38, y - h * 0.03);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

export { PHASES, phaseFor, smoothstep };
