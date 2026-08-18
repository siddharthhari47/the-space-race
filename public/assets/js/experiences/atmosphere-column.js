// The standard atmosphere, plotted.
//
// Three curves against altitude — temperature, pressure and density — each
// normalised to its own sea-level value so they share one axis without one
// of them flattening the other two. Pressure and density fall by orders of
// magnitude; temperature does something much stranger, and putting them
// side by side is the whole point of the exhibit.
//
// The layer boundaries are drawn because they are where the model changes
// behaviour, and because the tropopause at 11 km is the single most
// consequential line in aviation: it is where temperature stops falling,
// and it is why airliners cruise where they do.

import { Stage, clamp, lerp, approach, attachPointer } from "../systems/stage.js";
import { atmosphere } from "../systems/atmosphere.js";

const ALT_MAX = 32000; // m — the top of the modelled range

const LAYERS = [
  { top: 11000, name: "Troposphere", note: "T falls 6.5 K/km" },
  { top: 20000, name: "Tropopause / lower stratosphere", note: "T constant, 216.65 K" },
  { top: 32000, name: "Stratosphere", note: "T rises 1.0 K/km" },
];

const MARKS = [
  { alt: 2400, label: "Cessna cruise" },
  { alt: 10700, label: "FL350 — airliner" },
  { alt: 19000, label: "Armstrong limit" },
  { alt: 25900, label: "SR-71 record" },
];

export function mountAtmosphereColumn(canvas, options = {}) {
  const getAltitude = options.getAltitude || (() => 10700);
  const onScrub = options.onScrub || null;

  let plot = { x: 0, y: 0, w: 0, h: 0 };
  let smoothAlt = 10700;

  function layout(stage) {
    plot = {
      x: 46,
      y: 14,
      w: Math.max(10, stage.width - 60),
      h: Math.max(10, stage.height - 44),
    };
  }

  const py = (alt) => plot.y + plot.h - (alt / ALT_MAX) * plot.h;
  const yToAlt = (y) => clamp(((plot.y + plot.h - y) / plot.h) * ALT_MAX, 0, ALT_MAX);
  const px = (frac) => plot.x + frac * plot.w;

  // Each curve is normalised to its own sea-level value, so all three run
  // 0..1 across the same width and can be compared by shape rather than by
  // magnitude.
  const SEA = atmosphere(0);

  function drawCurve(ctx, pick, colour, label, labelFrac) {
    ctx.save();
    ctx.beginPath();
    const steps = 120;
    for (let i = 0; i <= steps; i++) {
      const alt = (i / steps) * ALT_MAX;
      const v = pick(atmosphere(alt));
      const x = px(clamp(v, 0, 1));
      const y = py(alt);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.font = '500 9px "JetBrains Mono", monospace';
    ctx.fillStyle = colour;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(label, px(labelFrac), plot.y + 10);
    ctx.restore();
  }

  function drawLayers(ctx) {
    ctx.save();
    ctx.font = '500 8px "JetBrains Mono", monospace';
    let prevTop = 0;
    for (const [i, layer] of LAYERS.entries()) {
      const yTop = py(layer.top);
      const yBot = py(prevTop);
      ctx.fillStyle = i % 2 === 0 ? "rgba(120, 160, 220, 0.045)" : "rgba(120, 160, 220, 0.02)";
      ctx.fillRect(plot.x, yTop, plot.w, yBot - yTop);

      ctx.strokeStyle = "rgba(150, 180, 225, 0.28)";
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plot.x, yTop + 0.5);
      ctx.lineTo(plot.x + plot.w, yTop + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "rgba(170, 192, 224, 0.7)";
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText(layer.note, plot.x + plot.w - 4, yTop + 3);
      prevTop = layer.top;
    }
    ctx.restore();
  }

  function drawAxis(ctx) {
    ctx.save();
    ctx.font = '500 9px "JetBrains Mono", monospace';
    ctx.strokeStyle = "rgba(150, 175, 210, 0.15)";
    for (let km = 0; km <= 32; km += 8) {
      const y = py(km * 1000);
      ctx.beginPath();
      ctx.moveTo(plot.x, y + 0.5);
      ctx.lineTo(plot.x + plot.w, y + 0.5);
      ctx.stroke();
      ctx.fillStyle = "rgba(160, 180, 210, 0.7)";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(`${km}`, plot.x - 6, y);
    }
    ctx.fillStyle = "rgba(140, 160, 190, 0.8)";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("km", 6, plot.y);
    ctx.fillText("fraction of sea-level value", plot.x, plot.y + plot.h + 8);
    ctx.restore();
  }

  function drawMarks(ctx) {
    ctx.save();
    ctx.font = '500 8px "JetBrains Mono", monospace';
    ctx.textBaseline = "middle";
    for (const m of MARKS) {
      const y = py(m.alt);
      ctx.strokeStyle = "rgba(255, 171, 94, 0.3)";
      ctx.beginPath();
      ctx.moveTo(plot.x, y + 0.5);
      ctx.lineTo(plot.x + 16, y + 0.5);
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 190, 140, 0.65)";
      ctx.textAlign = "left";
      ctx.fillText(m.label, plot.x + 20, y);
    }
    ctx.restore();
  }

  function drawCursor(ctx) {
    const y = py(smoothAlt);
    ctx.save();
    ctx.strokeStyle = "rgba(126, 235, 180, 0.85)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(plot.x, y + 0.5);
    ctx.lineTo(plot.x + plot.w, y + 0.5);
    ctx.stroke();

    const air = atmosphere(smoothAlt);
    for (const [v, colour] of [
      [air.T / SEA.T, "#ff9e6b"],
      [air.p / SEA.p, "#7cc4ff"],
      [air.rho / SEA.rho, "#c8a4ff"],
    ]) {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(px(clamp(v, 0, 1)), y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  const stage = new Stage(canvas, {
    staticFrameTime: 0.4,
    onResize: layout,
    update(dt) {
      smoothAlt = approach(smoothAlt, getAltitude(), 0.001, dt);
    },
    draw(ctx, st) {
      if (plot.w <= 10) layout(st);
      ctx.fillStyle = "#070910";
      ctx.fillRect(0, 0, st.width, st.height);

      drawLayers(ctx);
      drawAxis(ctx);
      drawCurve(ctx, (a) => a.T / SEA.T, "#ff9e6b", "T", 0.62);
      drawCurve(ctx, (a) => a.p / SEA.p, "#7cc4ff", "p", 0.24);
      drawCurve(ctx, (a) => a.rho / SEA.rho, "#c8a4ff", "ρ", 0.4);
      drawMarks(ctx);
      drawCursor(ctx);
    },
  });

  layout(stage);

  // Dragging the chart scrubs altitude, which is the natural gesture for a
  // vertical axis and saves reaching for the slider.
  const detach = attachPointer(canvas, {
    onDown(p) {
      if (onScrub) onScrub(yToAlt(p.y));
    },
    onDrag(p) {
      if (onScrub) onScrub(yToAlt(p.y));
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

export { lerp };
