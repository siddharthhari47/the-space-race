// Find a planet — canvas.
//
// Three pictures share one canvas. "intro" is the Sun with Jupiter and Earth
// in front of it, drawn to scale, for the prediction questions. "raw" is a
// light curve: brightness against time, with the visitor's marks, cursor and
// measuring line on top. "fold" is the stacking view: the whole light curve
// in a strip at the top, with the slices being stacked lit up, and the
// stacked result below it.
//
// As with the Mars window, the canvas draws whatever state the page hands it
// and owns no rules. Which dip counts as found, what the period is, what the
// stacked depth comes to: all of that is worked out by systems/transit.js and
// the page controller. What this module does own is the mapping between
// pixels and data, because the page needs it to turn a tap into a time or a
// drag into a brightness. mount() returns that mapping alongside the stage.
//
// Every light curve on this canvas is made up, so the words SIMULATED DATA are
// drawn on every one of them, inside the picture, where a screenshot of the
// plot cannot lose them.

import { Stage, mulberry32 } from "../systems/stage.js";
import { R_SUN_KM, R_JUPITER_KM, R_EARTH_KM } from "../systems/transit.js";

const TAU = Math.PI * 2;

const COLOR = {
  sun: "#ffd27a",
  sunEdge: "#f2a94a",
  point: "rgba(196, 214, 240, 0.78)",
  pointFaint: "rgba(196, 214, 240, 0.2)",
  band: "rgba(196, 214, 240, 0.42)",
  axis: "rgba(150, 168, 196, 0.35)",
  grid: "rgba(150, 168, 196, 0.12)",
  label: "rgba(205, 214, 230, 0.86)",
  dim: "rgba(150, 168, 196, 0.7)",
  cursor: "rgba(244, 247, 255, 0.7)",
  mark: "#7cf0be",
  markFill: "rgba(124, 240, 190, 0.14)",
  miss: "#ff8f8f",
  hint: "rgba(255, 210, 122, 0.16)",
  hintEdge: "rgba(255, 210, 122, 0.6)",
  level: "#ffd27a",
  bin: "#6ea8ff",
  stack: "rgba(110, 168, 255, 0.22)",
  sim: "rgba(255, 210, 122, 0.85)",
};

const MINUS = "−";

// Tick spacing of 1, 2 or 5 times a power of ten, the steps people read
// without effort.
export function niceStep(span, count) {
  const raw = Math.abs(span) / Math.max(1, count);
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

// A brightness change as a tick label. The unit is in the axis title, so the
// ticks carry numbers only. A proper minus sign, because a hyphen is shorter
// and reads as a dash.
function tickText(v, unit, step) {
  if (Math.abs(v) < step / 1e3) return "0";
  if (unit === "ppm") {
    const n = Math.round(v * 1e6);
    return n < 0 ? `${MINUS}${-n}` : `+${n}`;
  }
  const pct = v * 100;
  const d = Math.max(0, Math.min(3, -Math.floor(Math.log10(step * 100) + 1e-9)));
  const s = Math.abs(pct).toFixed(d);
  return pct < 0 ? `${MINUS}${s}` : `+${s}`;
}

export function mountFindPlanet(canvas, options = {}) {
  const getState = options.getState;
  const onFrame = options.onFrame || (() => {});

  let W = 0;
  let H = 0;
  let fontPx = 11;
  let narrow = false;

  // The plot box of the raw light curve, and the time and brightness it
  // spans, kept from the last frame so the page can map pointer positions.
  const view = { left: 0, right: 0, top: 0, bottom: 0, t0: 0, t1: 1, y0: -0.01, y1: 0.01, ok: false };

  const rand = mulberry32(909);
  const stars = Array.from({ length: 60 }, () => ({
    x: rand(), y: rand(), a: 0.1 + rand() * 0.25, r: rand() < 0.15 ? 1.1 : 0.6,
  }));

  function layout(stage) {
    W = stage.width;
    H = stage.height;
    narrow = W < 520;
    fontPx = narrow ? 10 : 11;
  }

  /* ---------- Labels ---------- */

  // Boxes of labels already placed this frame, so a new one can step aside.
  // Same scheme as the Mars window: the harness estimates every label's box
  // from its monospace width and fails on any overlap.
  let placed = [];
  const hits = (b, pad = 0) => placed.some((p) =>
    b.left - pad < p.right && p.left < b.right + pad && b.top - pad < p.bottom && p.top < b.bottom + pad);

  function labelBox(ctx, str, x, y, align, base, size) {
    const w = ctx.measureText(str).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    const top = base === "middle" ? y - size / 2 : base === "top" ? y : y - size;
    return { left, right: left + w, top, bottom: top + size, w };
  }

  // Draws a label kept inside the canvas. With avoid on, a label that would
  // land on one already placed moves a line up or down until it is clear;
  // with skip on, it is simply left out instead, which is right for tick
  // labels where a missing number is better than a moved one.
  function text(ctx, str, x, y, {
    color = COLOR.label, align = "left", base = "middle", size = fontPx, avoid = true, skip = false,
  } = {}) {
    ctx.font = `500 ${size}px "JetBrains Mono", monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = base;
    const w = ctx.measureText(str).width;
    const offset = align === "center" ? w / 2 : align === "right" ? w : 0;
    let left = x - offset;
    if (left + w > W - 4) left = W - 4 - w;
    if (left < 4) left = 4;
    x = left + offset;
    const top = base === "middle" ? y - size / 2 : base === "top" ? y : y - size;
    if (top < 2) y += 2 - top;
    if (top + size > H - 2) y -= top + size - (H - 2);
    if (skip && hits(labelBox(ctx, str, x, y, align, base, size), 2)) return false;
    if (avoid && !skip) {
      const step = size + 2;
      for (const n of [0, 1, -1, 2, -2, 3, -3]) {
        const yy = y + n * step;
        const b = labelBox(ctx, str, x, yy, align, base, size);
        if (b.top < 2 || b.bottom > H - 2) continue;
        if (!hits(b)) { y = yy; break; }
      }
    }
    placed.push(labelBox(ctx, str, x, y, align, base, size));
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(6, 9, 18, 0.88)";
    ctx.strokeText(str, x, y);
    ctx.restore();
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    return true;
  }

  function simulatedTag(ctx) {
    text(ctx, "SIMULATED DATA", W - 10, 14, { color: COLOR.sim, align: "right", avoid: false });
  }

  /* ---------- Intro: the Sun and two planets, to scale ---------- */

  function drawIntro(ctx) {
    for (const s of stars) {
      ctx.fillStyle = `rgba(220, 230, 255, ${s.a})`;
      ctx.fillRect(s.x * W, s.y * H, s.r, s.r);
    }
    const rs = Math.max(10, Math.min(W * 0.34, H * 0.36));
    const cx = W / 2;
    const cy = H * 0.48;
    const glow = ctx.createRadialGradient(cx, cy, rs * 0.2, cx, cy, rs * 1.25);
    glow.addColorStop(0, "rgba(255, 210, 122, 0.18)");
    glow.addColorStop(1, "rgba(255, 210, 122, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, rs * 1.25, 0, TAU);
    ctx.fill();
    // The disc is drawn evenly bright to the edge, the same simplification
    // the light curves make. A real Sun is darker towards its rim.
    ctx.fillStyle = COLOR.sun;
    ctx.beginPath();
    ctx.arc(cx, cy, rs, 0, TAU);
    ctx.fill();

    // Jupiter and Earth, both at their true size against this Sun.
    const rj = rs * (R_JUPITER_KM / R_SUN_KM);
    const re = Math.max(0.6, rs * (R_EARTH_KM / R_SUN_KM));
    const jx = cx - rs * 0.42;
    const ex = cx + rs * 0.42;
    ctx.fillStyle = "#121722";
    ctx.beginPath();
    ctx.arc(jx, cy, rj, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex, cy, re, 0, TAU);
    ctx.fill();
    // Earth is about a pixel across, so a ring shows where to look. The ring
    // is not Earth; the dot in its middle is.
    ctx.save();
    ctx.strokeStyle = "rgba(18, 23, 34, 0.75)";
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(ex, cy, 9, 0, TAU);
    ctx.stroke();
    ctx.restore();

    text(ctx, "The Sun, with Jupiter and Earth in front", 10, 14, { color: COLOR.label, size: fontPx + 1 });
    const below = cy + rs + fontPx + 8;
    text(ctx, "Jupiter", jx, below, { align: "center" });
    text(ctx, "Earth", ex, below, { align: "center" });
    text(ctx, "all three drawn to scale", cx, Math.min(H - 12, below + fontPx + 8), { color: COLOR.dim, align: "center" });
  }

  /* ---------- Shared plotting ---------- */

  // Draws brightness readings into a box. When there are more readings than
  // pixels across, each pixel column shows the lowest and highest reading in
  // it as one short vertical line; drawing 19,200 separate dots on a 300 px
  // strip costs a lot and shows the same band. Below three readings a
  // pixel, dots still read as separate measurements, which they are.
  function plotPoints(ctx, curve, box, t0, t1, y0, y1, color) {
    const n = curve.n;
    const w = box.right - box.left;
    const h = box.bottom - box.top;
    const X = (t) => box.left + ((t - t0) / (t1 - t0)) * w;
    const Y = (d) => box.bottom - ((d - y0) / (y1 - y0)) * h;
    const clampY = (y) => Math.min(box.bottom, Math.max(box.top, y));
    if (n > w * 3) {
      const cols = Math.max(1, Math.floor(w));
      const lo = new Float64Array(cols).fill(Infinity);
      const hi = new Float64Array(cols).fill(-Infinity);
      for (let i = 0; i < n; i++) {
        const c = Math.floor(((curve.t[i] - t0) / (t1 - t0)) * cols);
        if (c < 0 || c >= cols) continue;
        const d = curve.f[i] - 1;
        if (d < lo[c]) lo[c] = d;
        if (d > hi[c]) hi[c] = d;
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 0; c < cols; c++) {
        if (lo[c] === Infinity) continue;
        const x = box.left + c + 0.5;
        ctx.moveTo(x, clampY(Y(hi[c])));
        ctx.lineTo(x, clampY(Y(lo[c])) + 0.5);
      }
      ctx.stroke();
    } else {
      ctx.fillStyle = color;
      const r = narrow ? 1.6 : 2;
      for (let i = 0; i < n; i++) {
        const t = curve.t[i];
        if (t < t0 || t > t1) continue;
        ctx.fillRect(X(t) - r / 2, clampY(Y(curve.f[i] - 1)) - r / 2, r, r);
      }
    }
  }

  // Horizontal gridlines with tick labels on the left. Returns nothing; the
  // labels go through text() with skip on so a crowded axis drops numbers
  // rather than printing them on top of each other.
  function yAxis(ctx, box, y0, y1, unit, count) {
    const step = niceStep(y1 - y0, count);
    const h = box.bottom - box.top;
    ctx.strokeStyle = COLOR.grid;
    ctx.lineWidth = 1;
    for (let v = Math.ceil(y0 / step) * step; v <= y1 + step * 1e-6; v += step) {
      const y = Math.round(box.bottom - ((v - y0) / (y1 - y0)) * h) + 0.5;
      ctx.strokeStyle = Math.abs(v) < step / 1e3 ? COLOR.axis : COLOR.grid;
      ctx.beginPath();
      ctx.moveTo(box.left, y);
      ctx.lineTo(box.right, y);
      ctx.stroke();
      text(ctx, tickText(v, unit, step), box.left - 6, y, { color: COLOR.dim, align: "right", skip: true });
    }
  }

  function xAxis(ctx, box, t0, t1, count, fmt) {
    const step = niceStep(t1 - t0, count);
    const w = box.right - box.left;
    for (let v = Math.ceil(t0 / step) * step; v <= t1 + step * 1e-6; v += step) {
      const x = Math.round(box.left + ((v - t0) / (t1 - t0)) * w) + 0.5;
      ctx.strokeStyle = COLOR.axis;
      ctx.beginPath();
      ctx.moveTo(x, box.bottom);
      ctx.lineTo(x, box.bottom + 4);
      ctx.stroke();
      text(ctx, fmt(v), x, box.bottom + 6, { color: COLOR.dim, align: "center", base: "top", skip: true });
    }
  }

  function frame(ctx, box) {
    ctx.strokeStyle = COLOR.axis;
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(box.left) + 0.5, Math.round(box.top) + 0.5,
      Math.round(box.right - box.left), Math.round(box.bottom - box.top));
  }

  /* ---------- Raw light curve ---------- */

  function drawRaw(ctx, s) {
    const c = s.curve;
    const unit = s.unit || "pct";
    const [y0, y1] = s.yRange;
    const left = narrow ? 44 : 56;
    const box = { left, right: W - 12, top: 44, bottom: H - (narrow ? 40 : 42) };
    const t0 = c.start;
    const t1 = c.start + c.days;
    Object.assign(view, box, { t0, t1, y0, y1, ok: true });
    const X = (t) => box.left + ((t - t0) / (t1 - t0)) * (box.right - box.left);
    const Y = (d) => box.bottom - ((d - y0) / (y1 - y0)) * (box.bottom - box.top);

    // Titles first, so they claim their places before any tick label.
    text(ctx, s.title || "Light curve", 10, 14, { size: fontPx + 1, avoid: false });
    simulatedTag(ctx);
    text(ctx, unit === "ppm" ? "change in brightness, parts per million" : "change in brightness, %",
      10, 31, { color: COLOR.dim, avoid: false });

    yAxis(ctx, box, y0, y1, unit, narrow ? 4 : 5);

    // The hint: a soft band over each dip the visitor is being shown.
    if (s.hint && c.planet) {
      for (const tc of c.transits) {
        const a = X(tc - c.planet.duration * 1.5);
        const b = X(tc + c.planet.duration * 1.5);
        ctx.fillStyle = COLOR.hint;
        ctx.fillRect(a, box.top, Math.max(6, b - a), box.bottom - box.top);
      }
    }

    // Confirmed dips get a green wash behind the points.
    for (const m of s.marks || []) {
      if (!m.ok || !c.planet) continue;
      const a = X(m.t - c.planet.duration * 0.9);
      const b = X(m.t + c.planet.duration * 0.9);
      ctx.fillStyle = COLOR.markFill;
      ctx.fillRect(a, box.top, Math.max(4, b - a), box.bottom - box.top);
    }

    // Where the planet should cross, for level 3, where the dips cannot be
    // seen. Small ticks along the bottom edge.
    if (s.ticks && c.planet) {
      ctx.fillStyle = COLOR.bin;
      for (const tc of c.transits) {
        const x = X(tc);
        ctx.beginPath();
        ctx.moveTo(x, box.bottom - 1);
        ctx.lineTo(x - 3.5, box.bottom - 8);
        ctx.lineTo(x + 3.5, box.bottom - 8);
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(box.left, box.top, box.right - box.left, box.bottom - box.top);
    ctx.clip();
    plotPoints(ctx, c, box, t0, t1, y0, y1, COLOR.point);
    ctx.restore();
    frame(ctx, box);

    xAxis(ctx, box, t0, t1, narrow ? 4 : 8, (v) => `${Math.round(v)}`);
    text(ctx, "days", box.right, H - 9, { color: COLOR.dim, align: "right", avoid: false });

    // Mark labels and the cursor.
    let k = 0;
    for (const m of s.marks || []) {
      const x = X(m.t);
      ctx.strokeStyle = m.ok ? COLOR.mark : COLOR.miss;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, box.top);
      ctx.lineTo(x, box.top + 10);
      ctx.moveTo(x, box.bottom - 10);
      ctx.lineTo(x, box.bottom);
      ctx.stroke();
      if (m.ok) {
        k++;
        text(ctx, m.label || `dip ${k}`, x, box.top + 18, { color: COLOR.mark, align: "center" });
      } else {
        text(ctx, "no dip here", x, box.top + 18, { color: COLOR.miss, align: "center" });
      }
    }

    if (Number.isFinite(s.cursor)) {
      const x = Math.round(X(s.cursor)) + 0.5;
      ctx.save();
      ctx.strokeStyle = COLOR.cursor;
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, box.top);
      ctx.lineTo(x, box.bottom);
      ctx.stroke();
      ctx.restore();
    }

    if (s.span) {
      // The gap between two marked dips, drawn as a bracket under the points.
      const a = X(s.span.a);
      const b = X(s.span.b);
      const y = box.bottom - 16;
      ctx.strokeStyle = s.span.ok ? COLOR.mark : COLOR.miss;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(a, y - 5);
      ctx.lineTo(a, y);
      ctx.lineTo(b, y);
      ctx.lineTo(b, y - 5);
      ctx.stroke();
      text(ctx, s.span.label, (a + b) / 2, y - 10, { color: s.span.ok ? COLOR.mark : COLOR.miss, align: "center" });
    }

    if (Number.isFinite(s.level)) {
      const y = Math.round(Y(s.level)) + 0.5;
      ctx.strokeStyle = COLOR.level;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(box.left, y);
      ctx.lineTo(box.right, y);
      ctx.stroke();
      // Grip at the right end: the line can be dragged anywhere on the plot,
      // the grip only says that it moves.
      ctx.fillStyle = COLOR.level;
      ctx.beginPath();
      ctx.arc(box.right - 10, y, 5, 0, TAU);
      ctx.fill();
      const lab = s.levelLabel || "your line";
      text(ctx, lab, box.left + 8, y + (s.level < (y0 + y1) / 2 ? -12 : 12), { color: COLOR.level });
    }

    if (s.note) text(ctx, s.note, (box.left + box.right) / 2, box.bottom - 30, { color: COLOR.dim, align: "center" });
  }

  /* ---------- Stacking view ---------- */

  function drawFold(ctx, s) {
    const c = s.curve;
    const F = s.fold;
    const left = narrow ? 44 : 56;
    text(ctx, s.title || "Stacking", 10, 14, { size: fontPx + 1, avoid: false });
    simulatedTag(ctx);

    // Strip: the whole light curve, with the stacked slices lit.
    const strip = { left, right: W - 12, top: 40, bottom: 40 + Math.max(46, Math.round(H * 0.18)) };
    const sy0 = s.stripRange[0];
    const sy1 = s.stripRange[1];
    const t0 = c.start;
    const t1 = c.start + c.days;
    const SX = (t) => strip.left + ((t - t0) / (t1 - t0)) * (strip.right - strip.left);
    view.ok = false;

    ctx.fillStyle = COLOR.stack;
    for (let k = 0; k < F.count; k++) {
      const tc = F.t0 + k * F.period;
      if (tc > t1) break;
      const a = SX(tc - F.window);
      const b = SX(tc + F.window);
      ctx.fillRect(a, strip.top, Math.max(2, b - a), strip.bottom - strip.top);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(strip.left, strip.top, strip.right - strip.left, strip.bottom - strip.top);
    ctx.clip();
    plotPoints(ctx, c, strip, t0, t1, sy0, sy1, COLOR.band);
    ctx.restore();
    frame(ctx, strip);
    text(ctx, "0", strip.left - 6, strip.top + (strip.bottom - strip.top) * (sy1 / (sy1 - sy0)), { color: COLOR.dim, align: "right", skip: true });
    xAxis(ctx, strip, t0, t1, narrow ? 4 : 8, (v) => `${Math.round(v)}`);
    text(ctx, "days", strip.right, strip.bottom + 6 + fontPx + 4, { color: COLOR.dim, align: "right", base: "top", avoid: false });

    // Folded plot.
    const top = strip.bottom + (narrow ? 58 : 60);
    const box = { left, right: W - 12, top, bottom: H - (narrow ? 40 : 42) };
    const [y0, y1] = s.yRange;
    const win = F.window;
    const X = (h) => box.left + ((h + win) / (2 * win)) * (box.right - box.left);
    const Y = (d) => box.bottom - ((d - y0) / (y1 - y0)) * (box.bottom - box.top);
    const clampY = (y) => Math.min(box.bottom, Math.max(box.top, y));

    text(ctx, s.foldTitle || "Stacked", 10, top - 32, { avoid: false });
    text(ctx, "change in brightness, ppm", 10, top - 15, { color: COLOR.dim, avoid: false });
    yAxis(ctx, box, y0, y1, "ppm", narrow ? 4 : 5);

    ctx.save();
    ctx.beginPath();
    ctx.rect(box.left, box.top, box.right - box.left, box.bottom - box.top);
    ctx.clip();
    // Each reading as a faint dot. Thousands of them, so they are tiny and
    // nearly transparent; where many pile up the colour builds.
    ctx.fillStyle = COLOR.pointFaint;
    const r = 1.6;
    for (let i = 0; i < F.px.length; i++) {
      ctx.fillRect(X(F.px[i]) - r / 2, clampY(Y(F.py[i] - 1)) - r / 2, r, r);
    }
    // Bin means, joined.
    ctx.strokeStyle = COLOR.bin;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let pen = false;
    for (const b of F.bins) {
      if (!b.n) { pen = false; continue; }
      const x = X(b.x);
      const y = clampY(Y(b.y - 1));
      if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      pen = true;
    }
    ctx.stroke();
    ctx.fillStyle = COLOR.bin;
    for (const b of F.bins) {
      if (!b.n) continue;
      ctx.beginPath();
      ctx.arc(X(b.x), clampY(Y(b.y - 1)), narrow ? 2.2 : 2.8, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    frame(ctx, box);

    // Once the dip stands clear of the noise, the part of the plot it covers
    // is filled: from zero down to the measured depth, across the planted
    // transit length. Before that nothing is drawn, so a stack that has not
    // found anything does not look as if it had.
    if (s.clear && Number.isFinite(s.measured) && s.halfDuration) {
      const a = X(-s.halfDuration);
      const b = X(s.halfDuration);
      const yz = Y(0);
      const yd = Y(-s.measured);
      ctx.fillStyle = COLOR.markFill;
      ctx.fillRect(a, yz, b - a, yd - yz);
    }

    // The measured depth is drawn only once it stands clear of the noise;
    // a line at a depth that is mostly scatter would look like a result.
    if (Number.isFinite(s.measured) && s.measuredLabel) {
      const y = Math.round(Y(-s.measured)) + 0.5;
      ctx.save();
      ctx.strokeStyle = COLOR.level;
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(X(-0.2), y);
      ctx.lineTo(X(0.2), y);
      ctx.stroke();
      ctx.restore();
      text(ctx, s.measuredLabel || "", X(0.24), y, { color: COLOR.level });
    }

    xAxis(ctx, box, -win * 24, win * 24, narrow ? 4 : 8, (v) => (v < 0 ? `${MINUS}${-Math.round(v)}` : `${Math.round(v)}`));
    // xAxis maps value v over [-24, 24]; the box is the same width, so the
    // positions match X() at hours / 24.
    text(ctx, "hours from the middle of the transit", box.right, H - 9, { color: COLOR.dim, align: "right", avoid: false });
  }

  /* ---------- Frame ---------- */

  function draw(ctx) {
    placed = [];
    const s = getState ? getState() : null;
    if (!s) return;
    if (s.mode === "intro") drawIntro(ctx, s);
    else if (s.mode === "fold" && s.fold) drawFold(ctx, s);
    else if (s.curve) drawRaw(ctx, s);
  }

  const stage = new Stage(canvas, {
    draw,
    update: (dt) => onFrame(dt),
    onResize: layout,
  });
  layout(stage);
  stage.start();

  return {
    stage,
    redraw: () => stage.renderOnce(),
    // Pixel to data, for the page's pointer handling. Both return null when
    // the raw plot is not on the canvas.
    timeAt(x) {
      if (!view.ok) return null;
      const u = (x - view.left) / (view.right - view.left);
      return view.t0 + Math.min(1, Math.max(0, u)) * (view.t1 - view.t0);
    },
    levelAt(y) {
      if (!view.ok) return null;
      const u = (view.bottom - y) / (view.bottom - view.top);
      return view.y0 + Math.min(1, Math.max(0, u)) * (view.y1 - view.y0);
    },
    // Days per CSS pixel on the time axis, so the page can turn "a
    // fingertip" into a tolerance in days.
    daysPerPixel() {
      if (!view.ok) return 0;
      return (view.t1 - view.t0) / Math.max(1, view.right - view.left);
    },
    inPlot(x, y) {
      return view.ok && x >= view.left - 8 && x <= view.right + 8 && y >= view.top - 8 && y <= view.bottom + 8;
    },
  };
}
