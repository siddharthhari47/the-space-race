// A day on the ISS — canvas.
//
// Three pictures share one canvas, one for each level:
//
//   "l1"  the Earth to true scale with the station at the top, the paths of
//         the throws, a speed strip along the bottom and, in a box in the
//         corner, the inside of the cabin
//   "l2"  the view from above the orbit's pole: Earth, orbit, the Sun on the
//         left and a cylinder of shadow on the right, all inside a 24 hour
//         clock ring on GMT that carries the sunrise ticks and the crew's day
//   "l3"  a world map with the day's ground track and the day and night
//         shading, a sky view from the visitor's spot, and a 24 hour strip
//         of passes
//
// As in the other exhibits, the canvas draws whatever state the page hands
// it and owns no rules. Whether a throw falls in, whether the station is in
// shadow, whether a pass is visible: all of that is worked out by
// systems/iss-day.js and passed in. What this module does own is the picture
// and the mapping between a pixel and a value (a speed on the strip, a place
// on the map, a time on the day strip), which the page needs to turn a tap
// into something.
//
// WHAT IS TO SCALE. Level 1 is true scale in both directions: the Earth is a
// circle of 6,378 km radius, the station's orbit is a circle 400 km above it,
// and the 120 km "air gets thick" line is drawn where it really is, which on
// this picture is only a few pixels above the ground. That thinness is the
// point of the picture. Level 2's Earth and orbit are in proportion to each
// other but the ring around them is only a clock face. Level 3's map is flat
// (equirectangular), so shapes near the poles are stretched, and the map
// stops at 70 degrees north and south, where nothing the station does needs
// drawing.

import { Stage } from "../systems/stage.js";

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

export const LAT_MAX = 70; // the map's edge, degrees north and south
const MAP_ASPECT = 360 / (2 * LAT_MAX); // width over height
const TEXTURE = "/assets/textures/earth-day-2k.webp"; // NASA Blue Marble, cited on the references page

export const COLOR = {
  earth: "#0f2b47",
  earthEdge: "#4f93d6",
  label: "rgba(205, 214, 230, 0.88)",
  dim: "rgba(150, 168, 196, 0.72)",
  axis: "rgba(150, 168, 196, 0.38)",
  grid: "rgba(150, 168, 196, 0.16)",
  tag: "rgba(255, 210, 122, 0.85)",
  sun: "#ffd27a",
  falls: "#ff8f8f",
  orbits: "#7cf0be",
  escapes: "#6ea8ff",
  visible: "#7cf0be",
  shadow: "rgba(70, 90, 140, 0.34)",
  shadowEdge: "rgba(143, 164, 216, 0.75)",
  panel: "rgba(8, 12, 24, 0.96)",
};

// One colour per crew block. The page uses the same table for its key, so the
// ring and the words under it cannot drift apart.
export const CREW_COLORS = {
  sleep: "#3b4a7a",
  wake: "#4fa3a5",
  work: "#6b7488",
  meal: "#d9a441",
  work2: "#6b7488",
  evening: "#8b7fc0",
};

const OUTCOME_COLOR = { falls: COLOR.falls, orbits: COLOR.orbits, escapes: COLOR.escapes };

export function mountIssDay(canvas, options = {}) {
  const getState = options.getState;
  const onFrame = options.onFrame || (() => {});

  let W = 0;
  let H = 0;
  let fontPx = 11;
  let narrow = false;

  // The map's texture. It is only ever a backdrop; if it has not loaded, or
  // there is no Image to load it with (the headless harness), the map is a
  // plain graticule with the shading on it and nothing else changes.
  let texture = null;
  let textureReady = false;
  if (typeof Image !== "undefined") {
    try {
      texture = new Image();
      texture.onload = () => { textureReady = true; if (stage) stage.renderOnce(); };
      texture.src = TEXTURE;
    } catch { texture = null; }
  }

  // Boxes the page can hit-test, kept from the last frame.
  const hit = {
    strip: { ok: false, left: 0, right: 0, top: 0, bottom: 0, max: 12 },
    map: { ok: false, left: 0, top: 0, w: 0, h: 0 },
    day: { ok: false, left: 0, right: 0, top: 0, bottom: 0 },
  };

  function layout(s) {
    W = s.width;
    H = s.height;
    narrow = W < 520;
    fontPx = narrow ? 10 : 11;
  }

  /* ---------- Labels ----------

     The same scheme as the other exhibits: boxes already placed this frame,
     and a new label that would land on one steps a line up or down. The
     harness estimates every label's box from its monospace width and fails
     on any overlap or clipping. */
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

  const modelTag = (ctx, y = 10) => text(ctx, "MODEL OUTPUT", W - 10, y, { color: COLOR.tag, align: "right", avoid: false });

  const clock = (sec) => {
    const m = Math.floor((((sec % 86400) + 86400) % 86400) / 60);
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  };

  /* =================== LEVEL 1: throw sideways =================== */

  function drawLevel1(ctx, st, time) {
    const stripH = narrow ? 44 : 52;
    const ph = H - stripH;
    const pad = 16;
    const R = st.R;
    const r0 = R + st.altKm;
    const k = Math.min((ph - pad - 8) / (r0 + R), (W - 12) / (2 * r0)); // px per km, both ways
    // While the page is being resized the canvas can be a frame at zero height, which
    // gives a negative scale and a negative arc radius, and arc() throws on that.
    if (!(k > 0)) return;
    const Cx = W / 2;
    const Cy = pad + r0 * k;
    const P = (x, y) => [Cx + x * k, Cy - y * k];

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, ph);
    ctx.clip();

    // The Earth, true scale.
    ctx.fillStyle = COLOR.earth;
    ctx.beginPath();
    ctx.arc(Cx, Cy, R * k, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = COLOR.earthEdge;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // The exhibit's own stop line, 120 km up: a few pixels above the ground.
    ctx.save();
    ctx.strokeStyle = "rgba(255, 210, 122, 0.7)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(Cx, Cy, (R + st.stopKm) * k, 0, TAU);
    ctx.stroke();
    ctx.restore();

    // The station's circle.
    ctx.save();
    ctx.strokeStyle = "rgba(150, 168, 196, 0.45)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 5]);
    ctx.beginPath();
    ctx.arc(Cx, Cy, r0 * k, 0, TAU);
    ctx.stroke();
    ctx.restore();

    const trace = (path, upTo, color, width, alpha) => {
      const n = Math.min(path.length - 1, Math.floor(upTo));
      if (n < 1) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = "round";
      ctx.beginPath();
      const [x0, y0] = P(path[0].x, path[0].y);
      ctx.moveTo(x0, y0);
      for (let i = 1; i <= n; i++) {
        const [x, y] = P(path[i].x, path[i].y);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    };

    for (const g of st.ghosts || []) trace(g.path, g.path.length, OUTCOME_COLOR[g.outcome], 2, 0.5);
    if (st.run) {
      const upTo = st.run.done ? st.run.path.length : st.run.at;
      trace(st.run.path, upTo, OUTCOME_COLOR[st.run.outcome], 3, 1);
      const i = Math.min(st.run.path.length - 1, Math.floor(upTo));
      const [hx, hy] = P(st.run.path[i].x, st.run.path[i].y);
      ctx.fillStyle = "#f4f7ff";
      ctx.beginPath();
      ctx.arc(hx, hy, 3.2, 0, TAU);
      ctx.fill();
      if (st.run.done && st.run.outcome === "falls") {
        ctx.strokeStyle = COLOR.falls;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(hx - 5, hy - 5); ctx.lineTo(hx + 5, hy + 5);
        ctx.moveTo(hx + 5, hy - 5); ctx.lineTo(hx - 5, hy + 5);
        ctx.stroke();
      }
    }

    // The station and the throw's direction.
    const [sx, sy] = P(0, r0);
    ctx.fillStyle = "#f4f7ff";
    ctx.fillRect(sx - 4, sy - 2, 8, 4);
    ctx.fillRect(sx - 1, sy - 5, 2, 10);
    ctx.strokeStyle = "rgba(244, 247, 255, 0.85)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx + 9, sy);
    ctx.lineTo(sx + 27, sy);
    ctx.lineTo(sx + 22, sy - 4);
    ctx.moveTo(sx + 27, sy);
    ctx.lineTo(sx + 22, sy + 4);
    ctx.stroke();
    ctx.restore();

    // Words on the picture (outside the clip so they can sit on the edge).
    text(ctx, `${st.altKm} km up`, sx - 10, sy + 14, { align: "right" });
    // Only before the first throw: afterwards the path runs through this spot.
    if (!st.run && !(st.marks && st.marks.length)) text(ctx, "thrown this way", sx + 32, sy + 12, { align: "left", color: COLOR.dim });
    text(ctx, "EARTH, TRUE SCALE", Cx, Cy - 10, { align: "center", color: COLOR.dim, avoid: false });
    text(ctx, `stop line ${st.stopKm} km up`, Cx, Cy - 10 + fontPx + 4, { align: "center", color: "rgba(255, 210, 122, 0.8)", avoid: false });
    modelTag(ctx);

    // The cabin.
    const iw = narrow ? 132 : 176;
    const ih = narrow ? 112 : 124;
    const ix = 6;
    // Bottom left, over the empty corner under the Earth: at the top it sat on the
    // station and its "400 km up" label, which is the thing the picture is about.
    const iy = ph - ih - 6;
    ctx.fillStyle = COLOR.panel;
    ctx.fillRect(ix, iy, iw, ih);
    ctx.strokeStyle = "rgba(150, 168, 196, 0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(ix + 0.5, iy + 0.5, iw - 1, ih - 1);
    const going = !!(st.run && !st.run.done);
    const everThrown = !!(st.run || (st.marks && st.marks.length));
    text(ctx, "inside the cabin", ix + 6, iy + 9, { size: fontPx - 1, color: COLOR.dim, avoid: false });
    // While a throw is being drawn the cabin says what is going on: the craft
    // is falling and nothing in the cabin is being pushed. Skipped on the first
    // screen so it does not give the answer away before the visitor throws.
    if (everThrown) {
      text(ctx, going ? "falling now, still floating" : "falling = floating", ix + 6, iy + 21, { size: fontPx - 1, color: COLOR.orbits, avoid: false });
    }
    // Astronaut and apple drift together: the same offset, every frame. That
    // they never move apart is the whole picture.
    const bx = Math.sin(time * 0.7) * 5;
    const by = Math.sin(time * 1.1) * 3;
    const ax = ix + iw * 0.3 + bx;
    const ay = iy + ih * 0.5 + by + 4;
    ctx.strokeStyle = "#cfd8ea";
    ctx.fillStyle = "#cfd8ea";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ax, ay - 12, 5, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(ax, ay - 7); ctx.lineTo(ax, ay + 8);
    ctx.moveTo(ax - 8, ay - 3); ctx.lineTo(ax + 8, ay - 1);
    ctx.moveTo(ax, ay + 8); ctx.lineTo(ax - 5, ay + 17);
    ctx.moveTo(ax, ay + 8); ctx.lineTo(ax + 5, ay + 17);
    ctx.stroke();
    ctx.fillStyle = "#ff7a6a";
    ctx.beginPath();
    ctx.arc(ax + (narrow ? 22 : 30), ay - 2, 3.6, 0, TAU);
    ctx.fill();
    // A small window: the Earth's edge turns past it as the craft moves round
    // the Earth, while the apple stays where it is. The angle is the craft's
    // bearing from the Earth's centre, so a circle turns it once round and a
    // short fall turns it only a little.
    const wr = 11;
    const wx = ix + iw - 20;
    const wy = iy + 38;
    ctx.save();
    ctx.beginPath();
    ctx.arc(wx, wy, wr, 0, TAU);
    ctx.clip();
    ctx.fillStyle = "#03060e";
    ctx.fillRect(wx - wr, wy - wr, 2 * wr, 2 * wr);
    ctx.translate(wx, wy);
    let bearing = 0;
    if (st.run) {
      const ri = Math.min(st.run.path.length - 1, Math.floor(st.run.done ? st.run.path.length : st.run.at));
      bearing = Math.atan2(st.run.path[ri].x, st.run.path[ri].y);
    }
    ctx.rotate(-bearing);
    ctx.fillStyle = COLOR.earth;
    ctx.fillRect(-wr - 2, 2, 2 * wr + 4, wr);
    ctx.strokeStyle = COLOR.earthEdge;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-wr - 2, 2);
    ctx.lineTo(wr + 2, 2);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = "rgba(150, 168, 196, 0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(wx, wy, wr, 0, TAU);
    ctx.stroke();
    // Gravity arrows: the pull at the ground (dim) and here, drawn at the
    // model's fraction of it. Held back until the first throw, because the
    // page has just asked what that fraction is.
    const gx = ix + iw - 22;
    const gTop = iy + 56;
    const gLen = ih - 74;
    const arrow = (x, len, color) => {
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, gTop);
      ctx.lineTo(x, gTop + len);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 4, gTop + len - 5);
      ctx.lineTo(x + 4, gTop + len - 5);
      ctx.lineTo(x, gTop + len + 2);
      ctx.fill();
    };
    if (everThrown) {
      arrow(gx - 8, gLen, "rgba(150, 168, 196, 0.6)");
      arrow(gx + 6, gLen * st.gFrac, COLOR.sun);
      text(ctx, `pull ${Math.round(st.gFrac * 100)}% of ground`, ix + 6, iy + ih - 8, { size: fontPx - 1, color: COLOR.sun, avoid: false });
    } else {
      text(ctx, "pull: throw to find out", ix + 6, iy + ih - 8, { size: fontPx - 1, color: COLOR.dim, avoid: false });
    }

    // The speed strip.
    const sl = 22;
    const sr = W - 22;
    const base = ph + 22;
    hit.strip = { ok: true, left: sl, right: sr, top: ph, bottom: H, max: st.vMax };
    ctx.strokeStyle = COLOR.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sl, base);
    ctx.lineTo(sr, base);
    ctx.stroke();
    const xv = (v) => sl + (v / st.vMax) * (sr - sl);
    for (const v of [0, 4, 8, 12]) {
      ctx.beginPath();
      ctx.moveTo(xv(v), base - 3);
      ctx.lineTo(xv(v), base + 3);
      ctx.stroke();
      if (st.circ && v === 8) continue; // keep clear of the circular-speed marks
      text(ctx, v === 12 ? "12 km/s" : String(v), xv(v), base + 13, { align: "center", color: COLOR.dim, avoid: false });
    }
    // The cursor: where the slider is now.
    ctx.strokeStyle = "rgba(244, 247, 255, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(xv(st.v), base - 12);
    ctx.lineTo(xv(st.v), base + 5);
    ctx.stroke();
    if (st.circ) {
      ctx.strokeStyle = COLOR.sun;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xv(st.vc), base - 16); ctx.lineTo(xv(st.vc), base + 5);
      ctx.stroke();
      ctx.strokeStyle = "rgba(244, 247, 255, 0.9)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xv(st.vReal), base - 16); ctx.lineTo(xv(st.vReal), base + 5);
      ctx.stroke();
      text(ctx, st.circLabel, xv(st.vc), ph + 5, { align: "center", color: COLOR.sun, avoid: false });
    }
    // One mark per throw, by outcome.
    for (const m of st.marks || []) {
      const x = xv(m.v);
      const y = base - 6;
      ctx.fillStyle = OUTCOME_COLOR[m.outcome];
      ctx.strokeStyle = OUTCOME_COLOR[m.outcome];
      ctx.lineWidth = 2;
      if (m.outcome === "falls") {
        ctx.beginPath();
        ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4);
        ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4);
        ctx.stroke();
      } else if (m.outcome === "orbits") {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, TAU);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(x, y - 5); ctx.lineTo(x + 5, y + 4); ctx.lineTo(x - 5, y + 4);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  /* =================== LEVEL 2: sixteen sunrises =================== */

  function drawLevel2(ctx, st) {
    const m = 22; // room outside the ring for hour labels
    const Ro = Math.min(W / 2, H / 2) - m;
    const bandW = narrow ? 11 : 14;
    const Ri = Ro - bandW;
    const Cx = W / 2;
    const Cy = H / 2;
    const ro = Ri * 0.64; // orbit radius on screen
    const kpx = ro / st.rOrbit; // px per km
    const Re = st.R * kpx;
    const ang = (sec) => (sec / 86400) * TAU - Math.PI / 2; // canvas angle, 00:00 at the top, clockwise

    // The crew's day, then the ring's tick marks for sunrise.
    ctx.lineCap = "butt";
    for (const b of st.blocks) {
      ctx.strokeStyle = CREW_COLORS[b.id] || "#6b7488";
      ctx.lineWidth = bandW;
      ctx.beginPath();
      ctx.arc(Cx, Cy, (Ri + Ro) / 2, ang(b.start * 60), ang(b.end * 60));
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(6, 9, 18, 0.9)";
    ctx.lineWidth = 1.5;
    for (const b of st.blocks) {
      const a = ang(b.start * 60);
      ctx.beginPath();
      ctx.moveTo(Cx + Ri * Math.cos(a), Cy + Ri * Math.sin(a));
      ctx.lineTo(Cx + Ro * Math.cos(a), Cy + Ro * Math.sin(a));
      ctx.stroke();
    }
    for (const tr of st.sunrises) {
      const a = ang(tr);
      const passed = tr <= st.t;
      ctx.strokeStyle = passed ? COLOR.sun : "rgba(255, 210, 122, 0.4)";
      ctx.lineWidth = passed ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.moveTo(Cx + (Ro - 2) * Math.cos(a), Cy + (Ro - 2) * Math.sin(a));
      ctx.lineTo(Cx + (Ro + 8) * Math.cos(a), Cy + (Ro + 8) * Math.sin(a));
      ctx.stroke();
    }
    // Hour labels, outside the ring.
    for (const [h, lab] of [[0, "00"], [6, "06"], [12, "12"], [18, "18"]]) {
      const a = ang(h * 3600);
      text(ctx, lab, Cx + (Ro + 17) * Math.cos(a), Cy + (Ro + 17) * Math.sin(a), { align: "center", color: COLOR.dim, avoid: false });
    }

    // The shadow: behind the Earth from the Sun, a cylinder seen from above
    // the pole, squeezed by the Sun's height above the orbit plane.
    ctx.save();
    ctx.beginPath();
    ctx.arc(Cx, Cy, Ri - 2, 0, TAU);
    ctx.clip();
    const sb = Math.sin(st.betaDeg * DEG);
    const half = (xk) => Math.sqrt(Math.max(0, st.R * st.R - xk * xk * sb * sb));
    const xEnd = sb > 0.02 ? Math.min(Ri / kpx, st.R / sb) : Ri / kpx;
    ctx.fillStyle = COLOR.shadow;
    ctx.beginPath();
    ctx.moveTo(Cx, Cy - half(0) * kpx);
    const N = 40;
    for (let i = 1; i <= N; i++) {
      const xk = (xEnd * i) / N;
      ctx.lineTo(Cx + xk * kpx, Cy - half(xk) * kpx);
    }
    for (let i = N; i >= 0; i--) {
      const xk = (xEnd * i) / N;
      ctx.lineTo(Cx + xk * kpx, Cy + half(xk) * kpx);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = COLOR.shadowEdge;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // The orbit: sunlit part and the part in shadow.
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255, 210, 122, 0.6)";
    ctx.beginPath();
    ctx.arc(Cx, Cy, ro, 0, TAU);
    ctx.stroke();
    if (st.nightHalf > 0) {
      ctx.strokeStyle = "#5b78d6";
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(Cx, Cy, ro, -st.nightHalf, st.nightHalf);
      ctx.stroke();
      text(ctx, "night", Cx + ro + 6, Cy - 12, { color: "#8fa4d8", avoid: false, size: fontPx - 1 });
    }

    // The Earth.
    ctx.fillStyle = COLOR.earth;
    ctx.beginPath();
    ctx.arc(Cx, Cy, Re, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = COLOR.earthEdge;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // The Sun's rays, from the left.
    ctx.strokeStyle = COLOR.sun;
    ctx.fillStyle = COLOR.sun;
    ctx.lineWidth = 1.5;
    for (const dy of [-0.34, 0, 0.34]) {
      const y = Cy + dy * ro;
      const x0 = Cx - Ri + 6;
      const x1 = Cx - ro - 10;
      if (x1 - x0 < 8) continue;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x1 + 5, y);
      ctx.lineTo(x1 - 1, y - 3);
      ctx.lineTo(x1 - 1, y + 3);
      ctx.fill();
    }
    text(ctx, "SUN", Cx - Ri + 6, Cy - 0.34 * ro - 12, { color: COLOR.sun, avoid: false });

    // The playhead on the ring.
    const pa = ang(st.t);
    ctx.strokeStyle = "#f4f7ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(Cx + (Ri - 5) * Math.cos(pa), Cy + (Ri - 5) * Math.sin(pa));
    ctx.lineTo(Cx + (Ro + 3) * Math.cos(pa), Cy + (Ro + 3) * Math.sin(pa));
    ctx.stroke();

    // The station.
    const sxp = Cx - ro * Math.cos(st.phi);
    const syp = Cy - ro * Math.sin(st.phi);
    if (st.glow > 0) {
      ctx.fillStyle = `rgba(255, 210, 122, ${(0.5 * st.glow).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(sxp, syp, 8 + 14 * (1 - st.glow), 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = st.inShadow ? "#35405e" : "#fff3c2";
    ctx.strokeStyle = st.inShadow ? "#8fa4d8" : "#ffd27a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(sxp, syp, 5.5, 0, TAU);
    ctx.fill();
    ctx.stroke();

    // Readouts.
    text(ctx, `${clock(st.t)} GMT`, Cx, Cy - fontPx * 0.7, { align: "center", color: "#f4f7ff", avoid: false, size: fontPx + 2 });
    text(ctx, `sunrises ${st.riseCount}`, Cx, Cy + fontPx * 0.9, { align: "center", color: COLOR.sun, avoid: false });
    text(ctx, st.inShadow ? "in shadow" : "in sunlight", Cx, Cy + fontPx * 2.5, { align: "center", color: st.inShadow ? "#8fa4d8" : "#fff3c2", avoid: false });
    text(ctx, `Sun ${Math.round(st.betaDeg)}° off the plane`, 10, 10, { color: COLOR.dim, avoid: false });
    if (st.glow > 0) text(ctx, "SUNRISE!", Cx, Cy + fontPx * 4.1, { align: "center", color: COLOR.sun, avoid: false, size: fontPx + 2 });
    modelTag(ctx, 10);
  }

  /* =================== LEVEL 3: spot it from home =================== */

  function drawLevel3(ctx, st) {
    const pad = 6;
    const stripH = narrow ? 40 : 48;
    // The map: as wide as it can be while leaving room for the rest.
    let mh = Math.min((W - 2 * pad) / MAP_ASPECT, H * 0.52);
    let mw = mh * MAP_ASPECT;
    const mx = (W - mw) / 2;
    const my = pad;
    hit.map = { ok: true, left: mx, top: my, w: mw, h: mh };
    const X = (lon) => mx + ((lon + 180) / 360) * mw;
    const Y = (lat) => my + ((LAT_MAX - lat) / (2 * LAT_MAX)) * mh;

    ctx.save();
    ctx.beginPath();
    ctx.rect(mx, my, mw, mh);
    ctx.clip();
    ctx.fillStyle = "#0b2036";
    ctx.fillRect(mx, my, mw, mh);
    if (textureReady && texture && texture.naturalWidth) {
      const iw = texture.naturalWidth;
      const ih = texture.naturalHeight;
      const sy = ((90 - LAT_MAX) / 180) * ih;
      const sh = ((2 * LAT_MAX) / 180) * ih;
      ctx.globalAlpha = 0.85;
      ctx.drawImage(texture, 0, sy, iw, sh, mx, my, mw, mh);
      ctx.globalAlpha = 1;
    }
    // Day and night, from the Sun's elevation in 6 degree cells.
    const cell = 6;
    for (let lat = LAT_MAX; lat > -LAT_MAX; lat -= cell) {
      for (let lon = -180; lon < 180; lon += cell) {
        const e = st.sunElev(lat - cell / 2, lon + cell / 2);
        let a = 0;
        if (e < 0) a = Math.min(0.66, 0.34 + (-e / 12) * 0.32); // below the horizon
        else if (e < 6) a = 0.12;
        if (a <= 0) continue;
        ctx.fillStyle = `rgba(2, 5, 14, ${a.toFixed(3)})`;
        ctx.fillRect(X(lon), Y(lat), (cell / 360) * mw + 0.6, (cell / (2 * LAT_MAX)) * mh + 0.6);
      }
    }
    // Graticule.
    ctx.strokeStyle = COLOR.grid;
    ctx.lineWidth = 1;
    for (let lon = -180; lon <= 180; lon += 30) {
      ctx.beginPath(); ctx.moveTo(X(lon), my); ctx.lineTo(X(lon), my + mh); ctx.stroke();
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      ctx.beginPath(); ctx.moveTo(mx, Y(lat)); ctx.lineTo(mx + mw, Y(lat)); ctx.stroke();
    }
    // The day's track, with the parts where this spot could see it picked out.
    const drawTrack = (a, b, color, width) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      let prev = null;
      for (const p of st.track) {
        if (p.t < a || p.t > b) { prev = null; continue; }
        const x = X(p.lon);
        const y = Y(Math.max(-LAT_MAX, Math.min(LAT_MAX, p.lat)));
        if (prev === null || Math.abs(p.lon - prev) > 180) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        prev = p.lon;
      }
      ctx.stroke();
    };
    drawTrack(0, 86400, "rgba(255, 210, 122, 0.7)", 1.4);
    for (const r of st.visRanges) drawTrack(r[0] - 60, r[1] + 60, COLOR.visible, 3);
    // The station and its footprint (everywhere that sees it above the horizon).
    const sp = st.sub;
    const foot = [];
    const bearings = 48;
    const lat1 = sp.lat * DEG;
    const lon1 = sp.lon * DEG;
    let last = null;
    ctx.strokeStyle = "rgba(244, 247, 255, 0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= bearings; i++) {
      const brg = (i / bearings) * TAU;
      const d = st.footRad;
      const la = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brg));
      const lo = lon1 + Math.atan2(Math.sin(brg) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(la));
      let lonD = ((((lo / DEG + 180) % 360) + 360) % 360) - 180;
      const x = X(lonD);
      const y = Y(Math.max(-LAT_MAX, Math.min(LAT_MAX, la / DEG)));
      if (last === null || Math.abs(lonD - last) > 180) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      last = lonD;
    }
    ctx.stroke();
    void foot;
    ctx.fillStyle = st.look.inSun ? "#fff3c2" : "#35405e";
    ctx.strokeStyle = st.look.inSun ? "#ffd27a" : "#8fa4d8";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(X(sp.lon), Y(Math.max(-LAT_MAX, Math.min(LAT_MAX, sp.lat))), 4.5, 0, TAU);
    ctx.fill();
    ctx.stroke();
    // The observer.
    if (st.spot) {
      const ox = X(st.spot.lon);
      const oy = Y(Math.max(-LAT_MAX, Math.min(LAT_MAX, st.spot.lat)));
      ctx.strokeStyle = "#ff8f8f";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ox - 7, oy); ctx.lineTo(ox + 7, oy);
      ctx.moveTo(ox, oy - 7); ctx.lineTo(ox, oy + 7);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ox, oy, 4, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(150, 168, 196, 0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(mx + 0.5, my + 0.5, mw - 1, mh - 1);
    if (st.prompt) text(ctx, "Tap the map to stand somewhere", mx + mw / 2, my + mh * 0.84, { align: "center", color: "#f4f7ff", avoid: false });
    modelTag(ctx, my + 10);

    // The sky view, under the map on the left.
    const bandTop = my + mh + 8;
    const bandBot = H - stripH - 4;
    const D = Math.max(60, Math.min(bandBot - bandTop - 2, W * 0.5, 210));
    const scx = pad + 14 + D / 2;
    const scy = bandTop + (bandBot - bandTop) / 2;
    const sr = D / 2;
    ctx.fillStyle = "rgba(6, 10, 22, 0.9)";
    ctx.beginPath();
    ctx.arc(scx, scy, sr, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(150, 168, 196, 0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();
    for (const e of [30, 60]) {
      ctx.beginPath();
      ctx.arc(scx, scy, sr * (1 - e / 90), 0, TAU);
      ctx.strokeStyle = "rgba(150, 168, 196, 0.2)";
      ctx.stroke();
    }
    // The exhibit's minimum elevation, as a ring.
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = "rgba(255, 210, 122, 0.55)";
    ctx.beginPath();
    ctx.arc(scx, scy, sr * (1 - st.minElev / 90), 0, TAU);
    ctx.stroke();
    ctx.restore();
    const S = (az, el) => {
      const rr = sr * (1 - el / 90);
      const a = az * DEG;
      return [scx + rr * Math.sin(a), scy - rr * Math.cos(a)];
    };
    for (const [az, lab] of [[0, "N"], [90, "E"], [180, "S"], [270, "W"]]) {
      const [lx, ly] = S(az, -9);
      text(ctx, lab, lx, ly, { align: "center", color: COLOR.dim, avoid: false, size: fontPx - 1 });
    }
    // The selected pass across the sky: green where it counts as visible.
    if (st.sky.length > 1) {
      for (let i = 1; i < st.sky.length; i++) {
        const a = st.sky[i - 1];
        const b = st.sky[i];
        const [x0, y0] = S(a.az, a.el);
        const [x1, y1] = S(b.az, b.el);
        ctx.strokeStyle = b.vis ? COLOR.visible : "rgba(150, 168, 196, 0.55)";
        ctx.lineWidth = b.vis ? 3 : 1.5;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
    }
    if (st.look.above) {
      const [x, y] = S(st.look.azDeg, st.look.elevDeg);
      ctx.fillStyle = st.look.inSun ? "#fff3c2" : "#35405e";
      ctx.strokeStyle = st.look.visible ? COLOR.visible : (st.look.inSun ? "#ffd27a" : "#8fa4d8");
      ctx.lineWidth = st.look.visible ? 3 : 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }

    // Words beside the sky view.
    const tx = scx + sr + 26;
    const lh = fontPx + 5;
    let ty = scy - sr + 8;
    const line = (str, color = COLOR.label) => { text(ctx, str, tx, ty, { color, avoid: false }); ty += lh; };
    line(`${clock(st.t)} GMT   day +${st.day}`, "#f4f7ff");
    if (st.noVisible) line("no visible pass today", COLOR.dim);
    if (st.look.above) {
      line(`elevation ${Math.round(st.look.elevDeg)}°`);
      line(`azimuth ${Math.round(st.look.azDeg)}° ${st.compass}`);
    } else {
      line("below the horizon", COLOR.dim);
      line("", COLOR.dim);
    }
    line(st.look.inSun ? "station in sunlight" : "station in shadow", st.look.inSun ? "#fff3c2" : "#8fa4d8");
    line(`Sun ${Math.round(st.look.sunElevDeg)}° here`, st.look.sunElevDeg <= -st.twilight ? COLOR.label : COLOR.sun);
    // Name the rule that fails, so "not visible" always says why.
    let why = "VISIBLE NOW";
    if (!st.look.visible) {
      if (!st.look.above) why = "not up";
      else if (st.look.elevDeg < st.minElev) why = `too low (under ${st.minElev}°)`;
      else if (!st.look.inSun) why = "in shadow";
      else why = `sky too bright (Sun ${Math.round(st.look.sunElevDeg)}°)`;
    }
    line(why, st.look.visible ? COLOR.visible : COLOR.dim);

    // The 24 hour strip.
    const sl = 18;
    const sRt = W - 18;
    const barTop = H - stripH + 6;
    const barH = narrow ? 13 : 16;
    hit.day = { ok: true, left: sl, right: sRt, top: barTop - 6, bottom: H };
    const tx2 = (sec) => sl + (sec / 86400) * (sRt - sl);
    // Sky brightness at the spot across the day.
    const nb = 96;
    for (let i = 0; i < nb; i++) {
      const sec = ((i + 0.5) / nb) * 86400;
      const e = st.spot ? st.spotSunElev(sec) : 30;
      let col;
      if (e > 0) col = "#2c4a72";
      else if (e > -st.twilight) col = "#1b2e4d";
      else col = "#0b1426";
      ctx.fillStyle = col;
      ctx.fillRect(tx2((i / nb) * 86400), barTop, (sRt - sl) / nb + 0.6, barH);
    }
    for (const p of st.passes) {
      const x0 = tx2(p.start);
      const w = Math.max(3, tx2(p.end) - x0);
      if (p.maxElevDeg < st.minElev) {
        ctx.fillStyle = "rgba(150, 168, 196, 0.4)";
        ctx.fillRect(x0, barTop + barH * 0.55, w, barH * 0.45);
      } else if (p.visible) {
        ctx.fillStyle = COLOR.visible;
        ctx.fillRect(x0, barTop, w, barH);
        if (p === st.sel) {
          ctx.strokeStyle = "#f4f7ff";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x0 - 1.5, barTop - 1.5, w + 3, barH + 3);
        }
      } else {
        ctx.fillStyle = "rgba(205, 214, 230, 0.55)";
        ctx.fillRect(x0, barTop + barH * 0.2, w, barH * 0.6);
        if (p === st.sel) {
          ctx.strokeStyle = "#f4f7ff";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x0 - 1.5, barTop + barH * 0.2 - 1.5, w + 3, barH * 0.6 + 3);
        }
      }
    }
    ctx.strokeStyle = "rgba(244, 247, 255, 0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tx2(st.t), barTop - 4);
    ctx.lineTo(tx2(st.t), barTop + barH + 4);
    ctx.stroke();
    for (const h of [0, 6, 12, 18, 24]) {
      text(ctx, h === 24 ? "24" : String(h).padStart(2, "0"), tx2(h * 3600), barTop + barH + 9, { align: "center", color: COLOR.dim, avoid: false, size: fontPx - 1 });
    }
  }

  /* ---------- Frame ---------- */

  function draw(ctx) {
    placed = [];
    hit.strip.ok = false;
    hit.map.ok = false;
    hit.day.ok = false;
    const st = getState ? getState() : null;
    if (!st) return;
    const time = stage ? stage.time : 0;
    if (st.mode === "l1") drawLevel1(ctx, st, time);
    else if (st.mode === "l2") drawLevel2(ctx, st);
    else if (st.mode === "l3") drawLevel3(ctx, st);
  }

  let stage = null;
  stage = new Stage(canvas, {
    draw,
    update: (dt) => onFrame(dt),
    onResize: layout,
  });
  layout(stage);
  stage.start();

  return {
    stage,
    redraw: () => stage.renderOnce(),
    inStrip: (x, y) => hit.strip.ok && x >= hit.strip.left - 10 && x <= hit.strip.right + 10 && y >= hit.strip.top,
    speedAt(x) {
      if (!hit.strip.ok) return null;
      const u = (x - hit.strip.left) / (hit.strip.right - hit.strip.left);
      return Math.min(1, Math.max(0, u)) * hit.strip.max;
    },
    inMap: (x, y) => hit.map.ok && x >= hit.map.left && x <= hit.map.left + hit.map.w && y >= hit.map.top && y <= hit.map.top + hit.map.h,
    mapAt(x, y) {
      if (!hit.map.ok) return null;
      const u = Math.min(1, Math.max(0, (x - hit.map.left) / hit.map.w));
      const v = Math.min(1, Math.max(0, (y - hit.map.top) / hit.map.h));
      return { lon: -180 + u * 360, lat: LAT_MAX - v * 2 * LAT_MAX };
    },
    inDay: (x, y) => hit.day.ok && x >= hit.day.left - 8 && x <= hit.day.right + 8 && y >= hit.day.top,
    dayAt(x) {
      if (!hit.day.ok) return null;
      const u = (x - hit.day.left) / (hit.day.right - hit.day.left);
      return Math.min(1, Math.max(0, u)) * 86400;
    },
  };
}
