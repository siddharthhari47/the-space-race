// Bring it home — canvas.
//
// Three pictures share one canvas.
//
//   "intro"   the side view with one finished model entry on it, for the
//             prediction step: a skip, so no safe angle is given away
//   "flight"  the side view while the visitor fires, with the g-meter and
//             heating readout across the top and the angle strip underneath
//             (one row of marks in level 1, two in level 2)
//   "compare" the safe angles as bars on one axis: Moon without lift, Moon
//             with the best roll, and optionally low Earth orbit
//
// As in the Mars window and Find a planet, the canvas draws whatever state the
// page hands it and owns no rules. What counts as a skip-out, what the corridor
// edges are, what the peak load came to: all of that is worked out by
// systems/reentry.js. What this module does own is the picture and the
// mapping between a pixel on the angle strip and an angle, which the page
// needs to turn a tap into a value.
//
// THE SIDE VIEW IS NOT TO SCALE, AND SAYS SO. The atmosphere that matters
// here is about 120 km deep and the Earth is 6,400 km in radius, so drawn to
// scale the whole entry would be a hair-thin line on a thin curve. Distance
// along the ground is drawn to scale. Height is stretched by a factor the
// canvas computes from the size of the box and prints on the picture, and
// the slope of every path looks steeper than it is for the same reason. The
// Earth's curve is real: it is a circle of the right proportions for the
// distance shown.

import { Stage } from "../systems/stage.js";
import { R_EARTH, H_INTERFACE, G_LIMIT } from "../systems/reentry.js";

const TAU = Math.PI * 2;
const KM = 1000;

export const STRIP_MIN = 4; // degrees below the horizon, level 1 and 2 strip
export const STRIP_MAX = 9;
const COMPARE_MAX = 9;

const COLOR = {
  earth: "#0f2b47",
  earthEdge: "#4f93d6",
  air: "rgba(110, 168, 255, 0.08)",
  interface: "rgba(255, 210, 122, 0.55)",
  label: "rgba(205, 214, 230, 0.88)",
  dim: "rgba(150, 168, 196, 0.72)",
  axis: "rgba(150, 168, 196, 0.38)",
  grid: "rgba(150, 168, 196, 0.12)",
  cursor: "rgba(244, 247, 255, 0.75)",
  safe: "#7cf0be",
  over: "#ff8f8f",
  skip: "#ffd27a",
  ghost: "rgba(196, 214, 240, 0.22)",
  noLift: "#6ea8ff",
  lift: "#7cf0be",
  tag: "rgba(255, 210, 122, 0.85)",
  capsule: "#f4f7ff",
};

const OUTCOME_COLOR = { safe: COLOR.safe, over: COLOR.over, skip: COLOR.skip };
const OUTCOME_WORD = { safe: "splashdown", over: "over the limit", skip: "skipped out" };

// Path colour from the load at that moment: cool while it is light, warm as
// it nears the 12 g limit, red over it.
function loadColor(g) {
  if (g < 3) return "#6ea8ff";
  if (g < 7) return "#ffd27a";
  if (g <= G_LIMIT) return "#ff9f5a";
  return "#ff6b6b";
}

const MINUS = "−";

export function mountReentry(canvas, options = {}) {
  const getState = options.getState;
  const onFrame = options.onFrame || (() => {});

  let W = 0;
  let H = 0;
  let fontPx = 11;
  let narrow = false;

  // The angle strip's box, kept from the last frame so the page can map a
  // pointer position to an angle.
  const strip = { left: 0, right: 0, top: 0, bottom: 0, a0: STRIP_MIN, a1: STRIP_MAX, ok: false };

  function layout(stage) {
    W = stage.width;
    H = stage.height;
    narrow = W < 520;
    fontPx = narrow ? 10 : 11;
  }

  /* ---------- Labels ---------- */

  // The same label scheme as Find a planet: boxes already placed this frame,
  // and a new label that would land on one steps a line up or down, or with
  // skip is left out. tools/canvas-harness.mjs estimates every label's box
  // from its monospace width and fails on any overlap or clipping.
  let placed = [];
  const hits = (b, pad = 0) => placed.some((p) =>
    b.left - pad < p.right && p.left < b.right + pad && b.top - pad < p.bottom && p.top < b.bottom + pad);

  function labelBox(ctx, str, x, y, align, base, size) {
    const w = ctx.measureText(str).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    const top = base === "middle" ? y - size / 2 : base === "top" ? y : y - size;
    return { left, right: left + w, top, bottom: top + size, w };
  }

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

  const modelTag = (ctx, y) => text(ctx, "MODEL OUTPUT", W - 10, y, { color: COLOR.tag, align: "right", avoid: false });

  /* ---------- The side view ---------- */

  // Angle covered by the picture, in radians. 0.40 rad is about 2,500 km of
  // ground: the longest model entry (lift up, shallow, skipping out) covers
  // about 2,100 km before it leaves.
  const THETA = 0.4;

  function geometry(top, bottom) {
    const Rd = (W - 24) / (2 * Math.sin(THETA / 2));
    const surfY = bottom - 22;
    const topY = top + 20;
    const kpx = (surfY - topY) / (H_INTERFACE / KM); // pixels per km of height
    const kh = Rd / (R_EARTH / KM); // pixels per km along the ground
    const Cx = W / 2;
    const Cy = surfY + Rd;
    const rho = (hMetres) => Rd + (hMetres / KM) * kpx;
    // theta in radians travelled, height in metres -> pixel
    const P = (theta, h) => {
      const a = theta - THETA / 2;
      const r = rho(h);
      return [Cx + r * Math.sin(a), Cy - r * Math.cos(a)];
    };
    return { Rd, surfY, topY, kpx, kh, Cx, Cy, rho, P, stretch: kpx / kh };
  }

  function drawEarth(ctx, g) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, g.surfY + 40);
    ctx.clip();
    // The air: a ring from the ground up to the entry interface.
    ctx.fillStyle = COLOR.air;
    ctx.beginPath();
    ctx.arc(g.Cx, g.Cy, g.rho(H_INTERFACE), 0, TAU);
    ctx.arc(g.Cx, g.Cy, g.Rd, 0, TAU, true);
    ctx.fill("evenodd");
    ctx.restore();

    ctx.fillStyle = COLOR.earth;
    ctx.beginPath();
    ctx.arc(g.Cx, g.Cy, g.Rd, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = COLOR.earthEdge;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // The entry interface, dashed.
    ctx.save();
    ctx.strokeStyle = COLOR.interface;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.arc(g.Cx, g.Cy, g.rho(H_INTERFACE), -Math.PI / 2 - THETA / 2 - 0.05, -Math.PI / 2 + THETA / 2 + 0.05);
    ctx.stroke();
    ctx.restore();
  }

  function drawPath(ctx, g, path, upTo, { faint = false } = {}) {
    if (!path || path.length < 2) return null;
    const n = Math.min(path.length - 1, Math.floor(upTo));
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = faint ? 1.4 : 2.6;
    let last = null;
    for (let i = 0; i < n; i++) {
      const a = path[i];
      const b = path[i + 1];
      const [x0, y0] = g.P(a.theta, a.h);
      const [x1, y1] = g.P(b.theta, b.h);
      ctx.strokeStyle = faint ? COLOR.ghost : loadColor(b.g);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      last = [x1, y1];
    }
    // The fractional last piece, so the animation does not move in steps of
    // one sample.
    if (!faint && upTo < path.length - 1 && n < path.length - 1) {
      const a = path[n];
      const b = path[n + 1];
      const f = upTo - n;
      const [x0, y0] = g.P(a.theta, a.h);
      const [x1, y1] = g.P(a.theta + (b.theta - a.theta) * f, a.h + (b.h - a.h) * f);
      ctx.strokeStyle = loadColor(b.g);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      last = [x1, y1];
    }
    ctx.restore();
    return last;
  }

  function arrow(ctx, x, y, dx, dy, len, color) {
    const m = Math.hypot(dx, dy) || 1;
    const ux = dx / m;
    const uy = dy / m;
    const x1 = x + ux * len;
    const y1 = y + uy * len;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - ux * 8 - uy * 4, y1 - uy * 8 + ux * 4);
    ctx.lineTo(x1 - ux * 8 + uy * 4, y1 - uy * 8 - ux * 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Header across the top: the g-meter, the peak, and the heating readout.
  function drawHeader(ctx, s) {
    const barW = Math.min(120, W * 0.32);
    const barX = W - 10 - barW;
    const scaleMax = 20;
    text(ctx, `load ${s.g.toFixed(1)} g  (limit ${G_LIMIT})`, 10, 12, { avoid: false });
    ctx.fillStyle = "rgba(150, 168, 196, 0.16)";
    ctx.fillRect(barX, 8, barW, 8);
    ctx.fillStyle = loadColor(s.g);
    ctx.fillRect(barX, 8, barW * Math.min(1, s.g / scaleMax), 8);
    // The limit and the peak so far, as ticks on the bar.
    ctx.fillStyle = COLOR.cursor;
    ctx.fillRect(barX + (barW * G_LIMIT) / scaleMax - 1, 5, 2, 14);
    if (s.peak > 0) {
      ctx.fillStyle = COLOR.skip;
      ctx.fillRect(barX + (barW * Math.min(s.peak, scaleMax)) / scaleMax - 1, 7, 2, 10);
    }
    text(ctx, `peak ${s.peak.toFixed(1)} g  heating ${Math.round(s.q)} W/cm²`, 10, 28, { avoid: false });
    modelTag(ctx, 28);
  }

  function drawFlight(ctx, s) {
    const rows = s.level === 2 ? 2 : 1;
    const stripH = 66 + (rows - 1) * 26;
    const headH = 38;
    const sideTop = headH;
    const sideBottom = H - stripH - 4;
    const g = geometry(sideTop, sideBottom);

    drawHeader(ctx, s);
    // Paths that skip out or run long leave the picture; keep them from
    // drawing over the header or the strip.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, sideTop, W, sideBottom - sideTop + 2);
    ctx.clip();
    drawEarth(ctx, g);

    // Earlier shots of this level, faint, so the edge between "skipped" and
    // "safe" can be seen as a change in the path.
    for (const sh of s.ghosts || []) drawPath(ctx, g, sh.path, sh.path.length, { faint: true });

    const [sx, sy] = g.P(0, H_INTERFACE);
    let head = null;
    if (s.run) head = drawPath(ctx, g, s.run.path, s.run.at);
    if (!s.run) {
      // Not fired yet: a short dashed arrow for the incoming angle. It is
      // drawn in the stretched picture, so its slope is stretched too.
      const a = -s.angle * (Math.PI / 180);
      const east = [Math.cos(-THETA / 2), Math.sin(-THETA / 2)];
      const up = [Math.sin(-THETA / 2), -Math.cos(-THETA / 2)];
      const dx = Math.cos(a) * g.kh * east[0] + Math.sin(a) * g.kpx * up[0];
      const dy = Math.cos(a) * g.kh * east[1] + Math.sin(a) * g.kpx * up[1];
      arrow(ctx, sx, sy, dx, dy, narrow ? 44 : 64, COLOR.cursor);
    }
    ctx.fillStyle = COLOR.capsule;
    ctx.beginPath();
    ctx.arc(sx, sy, 3.2, 0, TAU);
    ctx.fill();
    if (head) {
      ctx.beginPath();
      ctx.arc(head[0], head[1], 4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    text(ctx, `interface ${Math.round(H_INTERFACE / KM)} km`, W - 10, g.P(THETA * 0.98, H_INTERFACE)[1] - 9, { align: "right", color: COLOR.dim });
    text(ctx, `sea level. Heights drawn ${g.stretch.toFixed(0)}x too tall`, W / 2, g.surfY + 13, { align: "center", color: COLOR.dim });
    text(ctx, s.startLabel || "entry", sx + 8, sy + 16, { color: COLOR.dim });

    if (s.run && s.run.done) {
      const end = s.run.path[s.run.path.length - 1];
      let [ex, ey] = g.P(end.theta, Math.max(0, end.h));
      // A skip ends off the top or the side of the picture: pin the marker
      // to the edge of the side view so the word can still be read.
      ex = Math.min(W - 40, Math.max(40, ex));
      ey = Math.min(sideBottom - 8, Math.max(sideTop + 22, ey));
      ctx.fillStyle = OUTCOME_COLOR[s.run.outcome];
      ctx.beginPath();
      ctx.arc(ex, ey, 4.5, 0, TAU);
      ctx.fill();
      text(ctx, OUTCOME_WORD[s.run.outcome], ex, ey - 12, { align: "center", color: OUTCOME_COLOR[s.run.outcome] });
    }

    drawStrip(ctx, s, rows, H - stripH + 4);
  }

  /* ---------- The angle strip ---------- */

  function mark(ctx, kind, x, y, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (kind === "safe") {
      ctx.arc(x, y, 5, 0, TAU);
      ctx.fill();
    } else if (kind === "over") {
      ctx.moveTo(x - 4.5, y - 4.5); ctx.lineTo(x + 4.5, y + 4.5);
      ctx.moveTo(x + 4.5, y - 4.5); ctx.lineTo(x - 4.5, y + 4.5);
      ctx.stroke();
    } else {
      ctx.moveTo(x, y - 5.5); ctx.lineTo(x + 5, y + 4); ctx.lineTo(x - 5, y + 4);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function tickLabel(a) { return `${a}`; }

  function drawStrip(ctx, s, rows, top) {
    const left = 14;
    const right = W - 14;
    const axisY = H - 32;
    const X = (a) => left + ((a - STRIP_MIN) / (STRIP_MAX - STRIP_MIN)) * (right - left);
    strip.left = left; strip.right = right; strip.top = top; strip.bottom = axisY + 8;
    strip.a0 = STRIP_MIN; strip.a1 = STRIP_MAX; strip.ok = true;

    ctx.strokeStyle = COLOR.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, axisY + 0.5);
    ctx.lineTo(right, axisY + 0.5);
    ctx.stroke();
    for (let a = STRIP_MIN; a <= STRIP_MAX; a++) {
      ctx.beginPath();
      ctx.moveTo(X(a) + 0.5, axisY);
      ctx.lineTo(X(a) + 0.5, axisY + 4);
      ctx.stroke();
      text(ctx, tickLabel(a), X(a), axisY + 13, { align: "center", color: COLOR.dim, skip: true });
    }
    text(ctx, "entry angle below the horizon, degrees", W / 2, H - 6, { align: "center", color: COLOR.dim, avoid: false });

    const rowY = (r) => axisY - 26 - r * 26;
    for (let r = 0; r < rows; r++) {
      const y = rowY(r);
      ctx.strokeStyle = COLOR.grid;
      ctx.beginPath();
      ctx.moveTo(left, y + 0.5);
      ctx.lineTo(right, y + 0.5);
      ctx.stroke();
    }
    if (rows === 2) {
      text(ctx, "with lift", left, rowY(1) + 12, { color: COLOR.dim, avoid: false });
      text(ctx, "no lift", left, rowY(0) + 12, { color: COLOR.dim, avoid: false });
    } else {
      text(ctx, "shallower: skips out", left, axisY - 9, { color: COLOR.dim, avoid: false });
      text(ctx, "steeper: more g", right, axisY - 9, { color: COLOR.dim, align: "right", avoid: false });
    }

    // Marks. Level 2 draws its own shots on the upper row and the level 1
    // shots on the lower one, so the two edges can be compared by eye.
    for (const sh of s.marks || []) {
      if (sh.angle < STRIP_MIN || sh.angle > STRIP_MAX) continue;
      const r = rows === 2 && sh.level === 2 ? 1 : 0;
      mark(ctx, sh.outcome, X(sh.angle), rowY(r), OUTCOME_COLOR[sh.outcome]);
    }

    // The aim: a line down through the rows at the slider's angle.
    const ax = X(Math.min(STRIP_MAX, Math.max(STRIP_MIN, s.angle)));
    ctx.strokeStyle = COLOR.cursor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ax + 0.5, rowY(rows - 1) - 18);
    ctx.lineTo(ax + 0.5, axisY + 4);
    ctx.stroke();
    ctx.fillStyle = COLOR.cursor;
    ctx.beginPath();
    ctx.moveTo(ax - 5, rowY(rows - 1) - 19);
    ctx.lineTo(ax + 5, rowY(rows - 1) - 19);
    ctx.lineTo(ax, rowY(rows - 1) - 11);
    ctx.closePath();
    ctx.fill();
  }

  /* ---------- Intro ---------- */

  function drawIntro(ctx, s) {
    const g = geometry(38, H - 8);
    text(ctx, "One entry from the Moon, 4.0° below the horizon", 10, 12, { avoid: false });
    modelTag(ctx, 28);
    drawEarth(ctx, g);
    for (const p of s.paths || []) {
      drawPath(ctx, g, p.path, p.path.length);
    }
    for (const p of s.paths || []) {
      const end = p.path[p.path.length - 1];
      const [ex, ey] = g.P(end.theta, Math.max(0, end.h));
      ctx.fillStyle = OUTCOME_COLOR[p.outcome];
      ctx.beginPath();
      ctx.arc(ex, ey, 4, 0, TAU);
      ctx.fill();
      text(ctx, p.label, ex, ey - 12, { align: "center", color: OUTCOME_COLOR[p.outcome] });
    }
    const [sx, sy] = g.P(0, H_INTERFACE);
    ctx.fillStyle = COLOR.capsule;
    ctx.beginPath();
    ctx.arc(sx, sy, 3.2, 0, TAU);
    ctx.fill();
    text(ctx, `interface ${Math.round(H_INTERFACE / KM)} km`, W - 10, g.P(THETA * 0.98, H_INTERFACE)[1] - 9, { align: "right", color: COLOR.dim });
    text(ctx, `sea level. Heights drawn ${g.stretch.toFixed(0)}x too tall`, W / 2, g.surfY + 13, { align: "center", color: COLOR.dim });
  }

  /* ---------- Compare ---------- */

  function drawCompare(ctx, s) {
    const left = 14;
    const right = W - 14;
    const axisY = H - 32;
    const top = 40;
    const X = (a) => left + (a / COMPARE_MAX) * (right - left);
    strip.ok = false;

    text(ctx, "Entry angles that end in a safe splashdown", 10, 12, { avoid: false });
    modelTag(ctx, 28);

    ctx.strokeStyle = COLOR.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, axisY + 0.5);
    ctx.lineTo(right, axisY + 0.5);
    ctx.stroke();
    for (let a = 0; a <= COMPARE_MAX; a++) {
      ctx.strokeStyle = COLOR.grid;
      ctx.beginPath();
      ctx.moveTo(X(a) + 0.5, top);
      ctx.lineTo(X(a) + 0.5, axisY);
      ctx.stroke();
      text(ctx, tickLabel(a), X(a), axisY + 13, { align: "center", color: COLOR.dim, skip: true });
    }
    text(ctx, "entry angle below the horizon, degrees", W / 2, H - 6, { align: "center", color: COLOR.dim, avoid: false });

    const rows = s.rows || [];
    const slot = (axisY - top - 6) / Math.max(1, rows.length);
    rows.forEach((r, i) => {
      const y0 = top + i * slot;
      // Close under its two lines of text, so a tall row does not leave the bar
      // floating far from its name.
      const barY = y0 + Math.min(slot - 16, 48);
      text(ctx, r.label, 10, y0 + 8, { color: COLOR.label, avoid: false });
      const xa = r.open ? X(0) : X(-r.shallow);
      const xb = X(-r.steep);
      if (r.open) {
        const grad = ctx.createLinearGradient(xa, 0, xa + (xb - xa) * 0.35, 0);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(1, r.color);
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = r.color;
      }
      ctx.fillRect(xa, barY - 6, Math.max(2, xb - xa), 12);
      // Edge ticks, so a thin bar still shows where it starts and stops.
      ctx.fillStyle = COLOR.cursor;
      if (!r.open) ctx.fillRect(xa - 1, barY - 9, 2, 18);
      ctx.fillRect(xb - 1, barY - 9, 2, 18);
      text(ctx, r.note, 10, y0 + 8 + fontPx + 3, { color: COLOR.dim, avoid: false });
    });
  }

  /* ---------- Frame ---------- */

  function draw(ctx) {
    placed = [];
    strip.ok = false;
    const s = getState ? getState() : null;
    if (!s) return;
    if (s.mode === "intro") drawIntro(ctx, s);
    else if (s.mode === "compare") drawCompare(ctx, s);
    else if (s.mode === "flight") drawFlight(ctx, s);
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
    // Pixel to angle on the strip, null when the strip is not on screen.
    angleAt(x) {
      if (!strip.ok) return null;
      const u = (x - strip.left) / (strip.right - strip.left);
      return strip.a0 + Math.min(1, Math.max(0, u)) * (strip.a1 - strip.a0);
    },
    inStrip(x, y) {
      return strip.ok && x >= strip.left - 8 && x <= strip.right + 8 && y >= strip.top && y <= strip.bottom + 8;
    },
  };
}
