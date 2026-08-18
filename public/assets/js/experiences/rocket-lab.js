// Launch view — draws the flight the physics already worked out.
//
// This file does no physics. simulate() in systems/rocketry.js produces the
// whole trajectory before anything is drawn, and playback is just walking
// along that array. The separation is the point: what you watch cannot
// drift from what was computed, and the computation can be checked in Node
// without a browser anywhere near it.
//
// The camera frames Earth plus everything flown so far, so it starts tight
// on the pad and pulls back as the vehicle climbs. That zoom is doing real
// work — it is the only way to show both a 60 m rocket leaving a tower and
// a 1,800 km apoapsis in the same shot, and watching the scale change is
// most of what makes the altitude feel like an achievement.

import { Stage, clamp, lerp, approach } from "../systems/stage.js";
import { R_EARTH, predictOrbit } from "../systems/rocketry.js";

const KARMAN = 100000;

export function mountRocketLab(canvas, options = {}) {
  const getState = options.getState || (() => ({ result: null, index: 0, phase: "idle" }));

  // Deliberately starts at zero rather than one. The real scale is on the
  // order of 1e-5 px per metre — Earth is 6,371 km across and has to fit in
  // a few hundred pixels — so seeding this at 1 and easing toward the true
  // value spends the first couple of seconds drawing an Earth the size of a
  // continent and a trajectory somewhere off in the next county. Zero is a
  // sentinel meaning "not yet measured", and layout() sets it properly.
  let viewScale = 0;
  let targetScale = 0;
  let cx = 0;
  let cy = 0;
  let flameFlicker = 0;

  function layout(stage) {
    cx = stage.width * 0.5;
    cy = stage.height * 0.62;
    if (viewScale === 0) {
      viewScale = targetScale = computeScale(stage, null, 0);
    }
  }

  // Fit Earth's limb plus the flown path. Padding is generous because a
  // trajectory pinned to the frame edge reads as clipped rather than framed.
  function computeScale(stage, result, index) {
    const minSpan = R_EARTH + 40000; // pad view: a sliver of limb
    if (!result || index <= 1) {
      return Math.min(stage.width, stage.height) / (2 * minSpan) * 0.92;
    }
    let maxR = R_EARTH;
    const step = Math.max(1, Math.floor(index / 400));
    for (let i = 0; i <= index; i += step) {
      const p = result.path[i];
      maxR = Math.max(maxR, Math.hypot(p.x, p.y));
    }
    const span = Math.max(maxR * 1.15, minSpan);
    return (Math.min(stage.width, stage.height) / (2 * span)) * 0.92;
  }

  const toScreen = (x, y) => ({ x: cx + x * viewScale, y: cy - y * viewScale });

  function drawEarth(ctx) {
    const rPx = R_EARTH * viewScale;
    const g = ctx.createRadialGradient(cx - rPx * 0.3, cy - rPx * 0.35, rPx * 0.04, cx, cy, rPx);
    g.addColorStop(0, "#2c6ba4");
    g.addColorStop(0.6, "#17406c");
    g.addColorStop(1, "#08182c");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
    ctx.fill();

    // Atmosphere, at true thickness. When the view is zoomed out to show an
    // orbit this is a hairline, which is exactly the right impression.
    const aPx = (R_EARTH + KARMAN) * viewScale;
    if (aPx - rPx > 0.6) {
      const ag = ctx.createRadialGradient(cx, cy, rPx, cx, cy, aPx);
      ag.addColorStop(0, "rgba(110, 170, 255, 0.35)");
      ag.addColorStop(1, "rgba(110, 170, 255, 0)");
      ctx.fillStyle = ag;
      ctx.beginPath();
      ctx.arc(cx, cy, aPx, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(140, 190, 255, 0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawTrail(ctx, result, index) {
    if (index < 2) return;
    const step = Math.max(1, Math.floor(index / 600));

    // Stage one and stage two in different colours, so separation is
    // visible in the shape of the path rather than only as an event.
    for (const stageNo of [1, 2]) {
      ctx.beginPath();
      let started = false;
      for (let i = 0; i <= index; i += step) {
        const p = result.path[i];
        if (p.stage !== stageNo) continue;
        const s = toScreen(p.x, p.y);
        started ? ctx.lineTo(s.x, s.y) : (ctx.moveTo(s.x, s.y), (started = true));
      }
      if (!started) continue;
      ctx.strokeStyle = stageNo === 1 ? "rgba(255, 171, 94, 0.85)" : "rgba(126, 200, 255, 0.9)";
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
  }

  function drawSeparation(ctx, result, index) {
    if (result.sepTime == null) return;
    const sepIdx = Math.round(result.sepTime / 0.1);
    if (sepIdx > index) return;
    const p = result.path[Math.min(sepIdx, result.path.length - 1)];
    const s = toScreen(p.x, p.y);
    ctx.strokeStyle = "rgba(255, 230, 180, 0.9)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = '500 9px "JetBrains Mono", monospace';
    ctx.fillStyle = "rgba(255, 230, 180, 0.9)";
    ctx.textAlign = "left";
    ctx.fillText("staging", s.x + 8, s.y - 6);
  }

  // The vehicle: a small triangle pointing along its velocity, with a plume
  // while the engines are lit. At these scales anything more detailed would
  // be sub-pixel.
  function drawVehicle(ctx, result, index, time) {
    const p = result.path[Math.min(index, result.path.length - 1)];
    const s = toScreen(p.x, p.y);
    const ang = Math.atan2(-p.vy, p.vx);

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(ang);

    if (p.thrusting) {
      const flicker = 0.75 + 0.25 * Math.sin(time * 45 + flameFlicker);
      const len = 16 * flicker;
      const fg = ctx.createLinearGradient(-4, 0, -4 - len, 0);
      fg.addColorStop(0, "rgba(255, 226, 168, 0.95)");
      fg.addColorStop(0.4, "rgba(255, 150, 60, 0.7)");
      fg.addColorStop(1, "rgba(255, 90, 30, 0)");
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(-4, -2.6);
      ctx.lineTo(-4 - len, 0);
      ctx.lineTo(-4, 2.6);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = "#f2f6fc";
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-4, -3.2);
    ctx.lineTo(-4, 3.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawOrbit(ctx, result) {
    const last = result.path[result.path.length - 1];
    const pts = predictOrbit({ x: last.x, y: last.y }, { x: last.vx, y: last.vy }, 200);
    if (!pts.length) return;

    ctx.save();
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = result.reachedOrbit
      ? "rgba(126, 235, 180, 0.85)"
      : "rgba(255, 120, 100, 0.75)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    pts.forEach((pt, i) => {
      const s = toScreen(pt.x, pt.y);
      i === 0 ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y);
    });
    ctx.stroke();
    ctx.restore();
  }

  // Altitude reference rings, so the zoom is legible instead of arbitrary.
  function drawRings(ctx) {
    const rings = [
      { alt: KARMAN, label: "100 km" },
      { alt: 408000, label: "ISS 408 km" },
      { alt: 2000000, label: "2,000 km" },
    ];
    ctx.save();
    ctx.font = '500 9px "JetBrains Mono", monospace';
    ctx.textAlign = "center";
    for (const ring of rings) {
      const rPx = (R_EARTH + ring.alt) * viewScale;
      const earthPx = R_EARTH * viewScale;
      // Only draw a ring that is far enough off the surface to read, and
      // still inside the frame.
      if (rPx - earthPx < 8 || rPx > Math.max(cx, cy) * 2.4) continue;
      ctx.strokeStyle = "rgba(150, 175, 210, 0.18)";
      ctx.setLineDash([2, 6]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(160, 182, 214, 0.6)";
      ctx.fillText(ring.label, cx, cy - rPx - 5);
    }
    ctx.restore();
  }

  const stage = new Stage(canvas, {
    staticFrameTime: 0.2,
    onResize: layout,
    update(dt) {
      const { result, index } = getState();
      targetScale = computeScale(stage, result, index);
      // Ease the zoom rather than snapping it. The camera pulling back is
      // part of how the climb reads, and a jump-cut every frame would
      // destroy that entirely. The one exception is the very first frame,
      // where there is nothing to ease from.
      viewScale = viewScale === 0 ? targetScale : approach(viewScale, targetScale, 0.02, dt);
      flameFlicker += dt * 3;
    },
    draw(ctx, st) {
      if (cx === 0) layout(st);
      const { result, index, phase } = getState();

      ctx.fillStyle = "#04060c";
      ctx.fillRect(0, 0, st.width, st.height);

      drawRings(ctx);
      drawEarth(ctx);

      if (!result) {
        ctx.font = '500 11px "JetBrains Mono", monospace';
        ctx.fillStyle = "rgba(160, 180, 210, 0.75)";
        ctx.textAlign = "center";
        ctx.fillText("VEHICLE ON PAD — PRESS LAUNCH", st.width / 2, st.height * 0.14);
        return;
      }

      if (phase === "done") drawOrbit(ctx, result);
      drawTrail(ctx, result, index);
      drawSeparation(ctx, result, index);
      drawVehicle(ctx, result, index, st.time);
    },
  });

  layout(stage);
  stage.start();

  return {
    stage,
    resetView() {
      viewScale = targetScale = computeScale(stage, null, 0);
    },
    destroy() {
      stage.destroy();
    },
  };
}

export { clamp, lerp };
