// Mars window canvas.
//
// A top-down picture of the Sun, Earth's orbit and Mars's orbit, with two
// planets sitting on a day clock and, when there is one, a spacecraft on its
// half-ellipse. It draws whatever state the page hands it and owns no rules:
// when a flight ends, whether a launch hit, what the prediction was, all of
// that lives in pages/mars-window.js and systems/transfer.js. Keeping the
// split this way is what lets tools/canvas-harness.mjs run every state of the
// scene without a browser.
//
// The scale is honest in the one way that matters here. Both orbits are drawn
// at their true ratio (Mars is 1.524 times as far from the Sun as Earth), the
// planets sit at their true angles for the day shown, and the spacecraft is
// on the exact ellipse the physics module flew. The Sun and the planets are
// dots far bigger than life, because at this scale a true Earth is a fraction
// of a pixel.

import { Stage, mulberry32 } from "../systems/stage.js";
import {
  earthAngle, marsAngle, craftAt, transferPath, planetXY, leadAt,
  CAPTURE_KM, toDeg, wrap2pi,
} from "../systems/transfer.js";

const TAU = Math.PI * 2;

const COLOR = {
  sun: "#ffd27a",
  earth: "#6ea8ff",
  mars: "#ff9a62",
  craft: "#f4f7ff",
  path: "rgba(244, 247, 255, 0.78)",
  pathFaint: "rgba(244, 247, 255, 0.34)",
  hint: "rgba(126, 235, 180, 0.9)",
  hintFill: "rgba(126, 235, 180, 0.13)",
  lead: "rgba(110, 168, 255, 0.16)",
  miss: "#ff8f8f",
  hit: "#7cf0be",
  label: "rgba(205, 214, 230, 0.86)",
  dim: "rgba(150, 168, 196, 0.62)",
};

// Million km, one decimal under ten and none above. 212,854,761 km reads as
// "213 million km"; 1,300,000 reads as "1.3 million km".
export function millions(km) {
  const m = km / 1e6;
  return m < 10 ? m.toFixed(1) : m.toFixed(0);
}

export function mountMarsWindow(canvas, options = {}) {
  const getState = options.getState;
  const onFrame = options.onFrame || (() => {});

  let cx = 0;
  let cy = 0;
  let k = 1; // pixels per km
  let fontPx = 11;
  let viewW = 0;
  let viewH = 0;

  // Fixed stars. Seeded, so a resize or a reload does not reshuffle them,
  // which would read as flicker.
  const rand = mulberry32(2026);
  const stars = Array.from({ length: 70 }, () => ({
    x: rand(), y: rand(), a: 0.12 + rand() * 0.3, r: rand() < 0.15 ? 1.2 : 0.7,
  }));

  const sx = (x) => cx + x * k;
  const sy = (y) => cy - y * k;

  function layout(stage) {
    const half = Math.min(stage.width, stage.height) / 2;
    cx = stage.width / 2;
    cy = stage.height / 2;
    viewW = stage.width;
    viewH = stage.height;
    const margin = stage.width < 480 ? 24 : 34;
    fontPx = stage.width < 480 ? 10 : 11;
    // Mars's orbit is the largest thing drawn, so it sets the scale.
    k = Math.max(1e-9, (half - margin) / 227.956e6);
  }

  // Boxes of the labels already placed this frame. A new label that would
  // land on one of them is moved up or down a line at a time until it is
  // clear, which is what keeps "Earth", "Mars at launch" and the legend from
  // overprinting on a phone, where the picture is only about 350 px across.
  let placed = [];

  const hits = (b, pad = 0) => placed.some((p) =>
    b.left - pad < p.right && p.left < b.right + pad && b.top - pad < p.bottom && p.top < b.bottom + pad);

  // A small box standing for a body, so labels keep clear of the dots too.
  const reserve = (x, y, r) => placed.push({ left: x - r, right: x + r, top: y - r, bottom: y + r });

  function labelBox(ctx, str, x, y, align, base, size) {
    const w = ctx.measureText(str).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    const top = base === "middle" ? y - size / 2 : base === "top" ? y : y - size;
    return { left, right: left + w, top, bottom: top + size, w };
  }

  function text(ctx, str, x, y, { color = COLOR.label, align = "left", base = "middle", size = fontPx, avoid = true } = {}) {
    ctx.font = `500 ${size}px "JetBrains Mono", monospace`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = base;
    // Labels sit beside bodies near the edge of the picture, and on a phone
    // that put the words half off the canvas. Slide the text back inside.
    if (viewW > 0) {
      const w = ctx.measureText(str).width;
      const offset = align === "center" ? w / 2 : align === "right" ? w : 0;
      let left = x - offset;
      if (left + w > viewW - 6) left = viewW - 6 - w;
      if (left < 6) left = 6;
      x = left + offset;
    }
    if (avoid) {
      const step = size + 2;
      for (const n of [0, 1, -1, 2, -2, 3, -3]) {
        const yy = y + n * step;
        if (yy < size / 2 + 4 || yy > viewH - size / 2 - 4) continue;
        if (!hits(labelBox(ctx, str, x, yy, align, base, size))) { y = yy; break; }
      }
    }
    placed.push(labelBox(ctx, str, x, y, align, base, size));
    // A thin dark outline keeps the words readable where an orbit line or the
    // edge of the wedge runs behind them.
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(6, 9, 18, 0.85)";
    ctx.strokeText(str, x, y);
    ctx.restore();
    ctx.fillText(str, x, y);
  }

  function ring(ctx, r, stroke, dash) {
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function arcOnOrbit(ctx, r, from, to, stroke, width) {
    // Counter-clockwise on the sky is clockwise on a canvas whose y points
    // down, which is why both angles are negated.
    let span = wrap2pi(to - from);
    if (span === 0) return;
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -from, -(from + span), true);
    ctx.stroke();
    ctx.restore();
  }

  function dot(ctx, x, y, r, fill, glow) {
    ctx.save();
    if (glow) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
      g.addColorStop(0, glow);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 3.2, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function stroked(ctx, pts, stroke, width, dash) {
    if (pts.length < 2) return;
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(sx(pts[0].x), sy(pts[0].y));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(sx(pts[i].x), sy(pts[i].y));
    ctx.stroke();
    ctx.restore();
  }

  // The wedge between Earth's direction and the direction Mars has to be in.
  function wedge(ctx, fromAngle, spanRad, r, fill, stroke, dash) {
    if (!(spanRad > 0)) return;
    ctx.save();
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, -fromAngle, -(fromAngle + spanRad), true);
    ctx.closePath();
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + r * Math.cos(fromAngle), cy - r * Math.sin(fromAngle));
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + r * Math.cos(fromAngle + spanRad), cy - r * Math.sin(fromAngle + spanRad));
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw(ctx, stage) {
    const s = getState();
    const w = s.world;
    const W = stage.width;
    const H = stage.height;
    placed = [];

    for (const st of stars) {
      ctx.fillStyle = `rgba(210, 224, 255, ${st.a})`;
      ctx.fillRect(st.x * W, st.y * H, st.r, st.r);
    }

    const rE = w.rEarth * k;
    const rM = w.rMars * k;
    ring(ctx, rE, "rgba(110, 168, 255, 0.34)");
    ring(ctx, rM, "rgba(255, 154, 98, 0.34)");

    const eA = earthAngle(w, s.day);
    const mA = marsAngle(w, s.day);
    const flight = s.flight;
    const flying = s.mode === "fly" || s.mode === "result";

    // Wedge of the lead Mars needs at launch. Hidden until the first miss,
    // because showing it on the first screen would answer the question the
    // visitor is about to be asked.
    if (s.showHint) {
      const launchA = s.mode === "aim" || !flight ? eA : flight.launchAngle;
      wedge(ctx, launchA, w.needLead, rM, COLOR.hintFill, COLOR.hint, [4, 4]);
      const mid = launchA + w.needLead / 2;
      text(ctx, `${toDeg(w.needLead).toFixed(0)}° lead`,
        cx + rM * 0.5 * Math.cos(mid), cy - rM * 0.5 * Math.sin(mid),
        { color: COLOR.hint, align: "center" });
    }

    // The live gap between the planets, shown while the clock is running
    // forward in round two. It is the same wedge, drawn from what is
    // actually there rather than what is needed.
    if (s.mode === "ff" || s.mode === "done") {
      wedge(ctx, eA, wrap2pi(mA - eA), rM, COLOR.lead, "rgba(110, 168, 255, 0.5)");
    }

    // Transfer path. In the aiming view it is a preview from Earth's
    // position today; in flight the part already flown is solid; after
    // arrival the whole ellipse is solid.
    if (s.mode === "aim") {
      const pts = transferPath(w.transfer, eA, 80);
      stroked(ctx, pts, COLOR.pathFaint, 1.2, [5, 5]);
      const end = pts[pts.length - 1];
      const ex = sx(end.x);
      const ey = sy(end.y);
      ctx.save();
      ctx.strokeStyle = COLOR.path;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(ex - 4, ey - 4); ctx.lineTo(ex + 4, ey + 4);
      ctx.moveTo(ex - 4, ey + 4); ctx.lineTo(ex + 4, ey - 4);
      ctx.stroke();
      ctx.restore();
      const lx = ex + (end.x < 0 ? 9 : -9);
      text(ctx, "arrives here", lx, ey + (end.y < 0 ? -12 : 12),
        { color: COLOR.dim, align: end.x < 0 ? "left" : "right" });
    } else if (flying && flight) {
      const all = transferPath(w.transfer, flight.launchAngle, 80);
      stroked(ctx, all, COLOR.pathFaint, 1.2, [5, 5]);
      const t = Math.min(Math.max(s.day - flight.launchDay, 0), w.transfer.days);
      const flown = [];
      const n = 80;
      for (let i = 0; i <= n; i++) {
        const ti = (t * i) / n;
        flown.push(craftAt(w.transfer, flight.launchAngle, ti));
      }
      stroked(ctx, flown, COLOR.path, 2);
      // Where Mars went while the ship was in flight.
      arcOnOrbit(ctx, rM, marsAngle(w, flight.launchDay), mA, "rgba(255, 154, 98, 0.8)", 2);
    }

    // Sun
    reserve(cx, cy, 7);
    dot(ctx, cx, cy, 6.5, COLOR.sun, "rgba(255, 210, 122, 0.5)");
    text(ctx, "Sun", cx + 11, cy + 12, { color: COLOR.dim });

    // Mars where it was at launch, hollow, once a flight exists.
    if (flying && flight) {
      const m0 = planetXY(w.rMars, marsAngle(w, flight.launchDay));
      ctx.save();
      ctx.strokeStyle = "rgba(255, 154, 98, 0.75)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(sx(m0.x), sy(m0.y), 4.2, 0, TAU);
      ctx.stroke();
      ctx.restore();
      const out = Math.atan2(m0.y, m0.x);
      // The day clock owns the top-left corner, so keep this label below it.
      text(ctx, "Mars at launch",
        sx(m0.x) + 12 * Math.cos(out), Math.max(sy(m0.y) - 12 * Math.sin(out), fontPx * 4 + 14),
        { color: "rgba(255, 170, 120, 0.8)", align: Math.cos(out) < 0 ? "right" : "left" });
    }

    // Earth and Mars on the clock.
    const e = planetXY(w.rEarth, eA);
    const m = planetXY(w.rMars, mA);
    reserve(sx(e.x), sy(e.y), 6);
    reserve(sx(m.x), sy(m.y), 6);
    dot(ctx, sx(e.x), sy(e.y), 5.2, COLOR.earth, "rgba(110, 168, 255, 0.45)");
    dot(ctx, sx(m.x), sy(m.y), 4.4, COLOR.mars, "rgba(255, 154, 98, 0.4)");
    // Labels sit outward of each planet so they stay clear of the orbit
    // rings and of each other.
    const eOut = eA;
    text(ctx, "Earth", sx(e.x) + 13 * Math.cos(eOut), sy(e.y) - 13 * Math.sin(eOut),
      { color: COLOR.earth, align: Math.cos(eOut) < -0.2 ? "right" : Math.cos(eOut) > 0.2 ? "left" : "center" });
    // In the result view Mars gets one two-line label together with the miss
    // figure (drawn below), so the name is not drawn twice in the same place.
    if (s.mode !== "result") {
      text(ctx, "Mars", sx(m.x) + 13 * Math.cos(mA), sy(m.y) - 13 * Math.sin(mA),
        { color: COLOR.mars, align: Math.cos(mA) < -0.2 ? "right" : Math.cos(mA) > 0.2 ? "left" : "center" });
    }

    // Spacecraft
    if (s.mode === "fly" && flight) {
      const c = craftAt(w.transfer, flight.launchAngle, s.day - flight.launchDay);
      dot(ctx, sx(c.x), sy(c.y), 3.4, COLOR.craft, "rgba(244, 247, 255, 0.5)");
    }

    // Arrival: where the ship ended up, where Mars was, and the gap.
    if (s.mode === "result" && flight) {
      const c = flight.craft;
      const cxp = sx(c.x);
      const cyp = sy(c.y);
      const mxp = sx(flight.mars.x);
      const myp = sy(flight.mars.y);
      const tone = flight.hit ? COLOR.hit : COLOR.miss;
      ctx.save();
      ctx.strokeStyle = tone;
      ctx.lineWidth = 1.3;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(cxp, cyp);
      ctx.lineTo(mxp, myp);
      ctx.stroke();
      ctx.setLineDash([]);
      const captureR = Math.max(CAPTURE_KM * k, 7);
      ctx.beginPath();
      ctx.arc(mxp, myp, captureR, 0, TAU);
      ctx.stroke();
      ctx.restore();
      dot(ctx, cxp, cyp, 3.6, COLOR.craft, "rgba(244, 247, 255, 0.5)");
      const figure = flight.hit
        ? `hit: ${millions(flight.missKm)} million km`
        : `missed by ${millions(flight.missKm)} million km`;
      // One two-line label on the Sun-facing side of Mars. The last stretch
      // of the transfer path hugs Mars's orbit and the dashed gap line sits
      // on it, so the inside of the orbit is the one side with room. Earlier
      // versions drew the name and the figure separately and on a phone,
      // with Mars near the left edge, they landed on top of each other.
      const lines = [
        { str: "Mars on arrival", color: COLOR.mars },
        { str: figure, color: tone },
      ];
      ctx.font = `500 ${fontPx}px "JetBrains Mono", monospace`;
      const bw = Math.max(...lines.map((l) => ctx.measureText(l.str).width));
      const lineH = fontPx + 4;
      const bh = lineH * lines.length;
      const vx = cx - mxp;
      const vy = cy - myp;
      const base = Math.atan2(vy, vx);
      let bx = 0;
      let by = 0;
      // Sun-facing side first; if something is already there, swing round
      // the marker until a spot is free.
      for (const turn of [0, 0.8, -0.8, 1.6, -1.6, 2.4, -2.4, Math.PI]) {
        const ux = Math.cos(base + turn);
        const uy = Math.sin(base + turn);
        const reach = captureR + 8 + Math.abs(ux) * bw / 2 + Math.abs(uy) * bh / 2;
        bx = Math.min(Math.max(mxp + ux * reach, 6 + bw / 2), W - 6 - bw / 2);
        by = Math.min(Math.max(myp + uy * reach, 6 + bh / 2), H - 6 - bh / 2);
        if (!hits({ left: bx - bw / 2, right: bx + bw / 2, top: by - bh / 2, bottom: by + bh / 2 }, 8)) break;
      }
      placed.push({ left: bx - bw / 2, right: bx + bw / 2, top: by - bh / 2, bottom: by + bh / 2 });
      lines.forEach((l, i) => {
        text(ctx, l.str, bx, by - bh / 2 + lineH * (i + 0.5), { color: l.color, align: "center", avoid: false });
      });
    }

    // Clock, top left.
    const dayText = s.mode === "fly" || s.mode === "result" || s.mode === "ff" || s.mode === "done"
      ? `Day ${Math.round(s.day)}` : `Launch day ${Math.round(s.day)}`;
    text(ctx, dayText, 14, 18, { color: COLOR.label, size: fontPx + 1 });
    if (s.mode === "fly" && flight) {
      text(ctx, `${Math.floor(s.day - flight.launchDay)} of ${Math.round(w.transfer.days)} days in flight`,
        14, 18 + fontPx + 6, { color: COLOR.dim });
    }
    if (s.mode === "ff" || s.mode === "done") {
      text(ctx, `Mars leads Earth by ${toDeg(leadAt(w, s.day)).toFixed(0)}°`,
        14, 18 + fontPx + 6, { color: COLOR.dim });
    }

    // Legend, bottom left: what the dashes are.
    ctx.save();
    ctx.strokeStyle = COLOR.pathFaint;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(14, H - 16);
    ctx.lineTo(34, H - 16);
    ctx.stroke();
    ctx.restore();
    text(ctx, "transfer orbit", 40, H - 16, { color: COLOR.dim });
  }

  const stage = new Stage(canvas, {
    draw,
    update: (dt) => onFrame(dt),
    onResize: layout,
  });
  layout(stage);
  stage.start();
  return { stage, redraw: () => stage.renderOnce() };
}
