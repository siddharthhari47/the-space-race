// The Vertical — the homepage environment.
//
// The premise: aerospace isn't two subjects, it's one axis. Everything that
// flies is somewhere on it, and where a thing sits determines what it has to
// be. Below about 20 km there's enough air to push against, so you build
// wings. Above 100 km there's nothing to push at all, so you carry your
// reaction mass with you and you go fast enough to keep missing the ground.
// The whole aircraft/spacecraft split falls out of one variable.
//
// So the hero draws that axis, to scale (logarithmically — linear would
// compress all of aviation into the bottom 2% of the frame), with real
// altitudes marked and real vehicles sitting at their real cruise heights.
//
// The haze along the axis is not decoration. It's the barometric density
// profile, rho(h) = rho0 * exp(-h/H) with a scale height of about 8.5 km,
// drawn as width. That single curve explains the entire picture: why the
// airliner cruises where it does, why the SR-71's record still stands, why
// the sky goes black long before you're in orbit, and why nothing with a
// wing has ever reached the top of the frame.
//
// Hovering a gateway shifts the view. SPACE brightens the star field, draws
// the ISS ground track, and dims the atmosphere. AIRCRAFT does the reverse
// and puts streamlines over the airliner. It's the same scene, biased —
// not two scenes cross-fading — because they're the same axis.
//
// Figures used, all real:
//   FL350 airliner cruise      10.7 km   (35,000 ft)
//   Tropopause (mid-lat)      ~11   km
//   Armstrong limit            19   km   body-temp water boils
//   SR-71 sustained record     25.9 km   (85,069 ft, 1976)
//   Eustace balloon jump       41.4 km   (2014)
//   Karman line               100   km
//   ISS mean altitude         ~408   km   7.66 km/s, ~92.9 min period

import { Stage, clamp, lerp, approach, mulberry32, prefersReducedMotion } from "../systems/stage.js";

const ALT_TOP = 460; // km at the top of the frame
const SCALE_HEIGHT = 8.5; // km

const MARKS = [
  { km: 10.7, label: "FL350", note: "airliner cruise", side: "air" },
  { km: 19, label: "19 km", note: "Armstrong limit", side: "air" },
  { km: 25.9, label: "25.9 km", note: "SR-71 record, 1976", side: "air" },
  { km: 41.4, label: "41.4 km", note: "highest balloon jump", side: "air" },
  { km: 100, label: "100 km", note: "Kármán line", side: "both" },
  { km: 408, label: "408 km", note: "ISS", side: "space" },
];

// Log mapping. +1 keeps log(0) finite and gives sea level a real position
// rather than an asymptote.
const LOG_TOP = Math.log10(ALT_TOP + 1);
const altToUnit = (km) => Math.log10(km + 1) / LOG_TOP;

export function mountHeroVertical(canvas, options = {}) {
  const getFocus = options.getFocus || (() => "none");

  let stars = null; // cached star layer
  let starCanvas = null;
  let axisX = 0;
  let groundY = 0;
  let topY = 0;

  // Animated state, all eased toward targets each frame.
  const s = {
    space: 0, // 0..1 space-focus
    air: 0, // 0..1 aircraft-focus
    pan: 0, // -1..1 view bias
  };

  // Vehicle positions run on their own clocks so they don't visibly loop
  // in sync with each other.
  let planeT = 0.15;
  let issT = 0.6;

  const altY = (km) => lerp(groundY, topY, altToUnit(km));

  function buildStars(stage) {
    const w = stage.width;
    const h = stage.height;
    starCanvas = document.createElement("canvas");
    starCanvas.width = Math.round(w * stage.dpr);
    starCanvas.height = Math.round(h * stage.dpr);
    const c = starCanvas.getContext("2d");
    c.setTransform(stage.dpr, 0, 0, stage.dpr, 0, 0);

    const rand = mulberry32(20250817);
    const count = Math.round(clamp((w * h) / 5200, 90, 420));
    stars = [];
    for (let i = 0; i < count; i++) {
      const x = rand() * w;
      const y = rand() * h;
      // Star visibility follows the real thing: the sky is bright at the
      // bottom of the atmosphere and black above it, so fade stars in with
      // decreasing air density rather than uniformly.
      const unit = 1 - y / h;
      const km = Math.pow(10, unit * LOG_TOP) - 1;
      const density = Math.exp(-km / SCALE_HEIGHT);
      const vis = clamp(1 - density * 1.6, 0, 1);
      if (vis < 0.02) continue;
      const r = rand();
      stars.push({ x, y, vis, size: r < 0.9 ? 0.7 : r < 0.98 ? 1.1 : 1.6, tw: rand() });
    }

    for (const st of stars) {
      c.globalAlpha = st.vis * (0.35 + st.tw * 0.5);
      c.fillStyle = "#ffffff";
      c.beginPath();
      c.arc(st.x, st.y, st.size, 0, Math.PI * 2);
      c.fill();
    }
  }

  function layout(stage) {
    axisX = clamp(stage.width * 0.085, 54, 130);
    groundY = stage.height - Math.max(28, stage.height * 0.05);
    topY = Math.max(36, stage.height * 0.07);
    buildStars(stage);
  }

  /* ---------- Drawing ---------- */

  function drawAtmosphere(ctx, stage) {
    const w = stage.width;
    // Width of the haze at a given altitude, proportional to air density.
    // At sea level it reaches across a good part of the frame; by 40 km it
    // is a hairline. That taper is the entire point.
    const maxReach = w * lerp(0.5, 0.78, s.air);
    const steps = 46;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(axisX, groundY);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const y = lerp(groundY, topY, t);
      const km = Math.pow(10, t * LOG_TOP) - 1;
      const density = Math.exp(-km / SCALE_HEIGHT);
      ctx.lineTo(axisX + density * maxReach, y);
    }
    ctx.lineTo(axisX, topY);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, groundY, 0, topY);
    const a = lerp(0.16, 0.34, s.air) * (1 - s.space * 0.55);
    grad.addColorStop(0, `rgba(88, 150, 240, ${a})`);
    grad.addColorStop(0.35, `rgba(70, 130, 225, ${a * 0.5})`);
    grad.addColorStop(1, "rgba(40, 80, 170, 0)");
    ctx.fillStyle = grad;
    ctx.fill();

    // The curve itself, drawn as a line so it reads as a plot and not a glow.
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const y = lerp(groundY, topY, t);
      const km = Math.pow(10, t * LOG_TOP) - 1;
      const density = Math.exp(-km / SCALE_HEIGHT);
      const x = axisX + density * maxReach;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(126, 176, 255, ${lerp(0.22, 0.5, s.air)})`;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function drawAxis(ctx, stage) {
    ctx.save();
    ctx.strokeStyle = "rgba(150, 172, 205, 0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(axisX + 0.5, topY);
    ctx.lineTo(axisX + 0.5, groundY);
    ctx.stroke();

    // Ground line
    ctx.strokeStyle = "rgba(150, 172, 205, 0.45)";
    ctx.beginPath();
    ctx.moveTo(axisX - 8, groundY + 0.5);
    ctx.lineTo(stage.width, groundY + 0.5);
    ctx.stroke();

    ctx.font = '500 10px var(--font-mono, "JetBrains Mono", monospace)';
    ctx.textBaseline = "middle";

    for (const m of MARKS) {
      const y = altY(m.km);
      if (y < topY - 4 || y > groundY + 4) continue;

      // Marks belong to a regime; the focused regime's marks come forward.
      let emphasis = 0.4;
      if (m.side === "air") emphasis = lerp(0.4, 1, s.air) * (1 - s.space * 0.6);
      else if (m.side === "space") emphasis = lerp(0.4, 1, s.space) * (1 - s.air * 0.6);
      else emphasis = lerp(0.55, 1, Math.max(s.air, s.space));

      const tickLen = lerp(8, 16, emphasis);
      ctx.strokeStyle = `rgba(190, 208, 235, ${0.2 + emphasis * 0.45})`;
      ctx.beginPath();
      ctx.moveTo(axisX - tickLen, y + 0.5);
      ctx.lineTo(axisX, y + 0.5);
      ctx.stroke();

      ctx.textAlign = "right";
      ctx.fillStyle = `rgba(224, 233, 245, ${0.35 + emphasis * 0.55})`;
      ctx.fillText(m.label, axisX - tickLen - 6, y);

      if (emphasis > 0.62 && stage.width > 620) {
        ctx.textAlign = "left";
        ctx.fillStyle = `rgba(150, 170, 200, ${(emphasis - 0.62) * 1.9})`;
        ctx.fillText(m.note, axisX + 10, y - 11);
      }
    }
    ctx.restore();
  }

  // Side profile of a twin-aisle airliner. Drawn rather than imported
  // because at this size an accurate silhouette is about twelve segments
  // and a PNG would be a blurry rectangle.
  function drawAirliner(ctx, x, y, scale, glow) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    ctx.fillStyle = glow > 0.02 ? `rgba(255, 200, 140, ${0.85 + glow * 0.15})` : "rgba(214, 226, 242, 0.9)";

    // Fuselage
    ctx.beginPath();
    ctx.moveTo(-30, 0);
    ctx.quadraticCurveTo(-26, -3.4, -8, -4);
    ctx.lineTo(18, -3.6);
    ctx.quadraticCurveTo(28, -3.2, 33, -0.6);
    ctx.quadraticCurveTo(28, 2.6, 16, 3);
    ctx.lineTo(-10, 3.2);
    ctx.quadraticCurveTo(-26, 3, -30, 0);
    ctx.closePath();
    ctx.fill();

    // Vertical fin, swept
    ctx.beginPath();
    ctx.moveTo(-29, -2);
    ctx.lineTo(-20, -13);
    ctx.lineTo(-15.5, -13);
    ctx.lineTo(-17, -2.5);
    ctx.closePath();
    ctx.fill();

    // Wing, seen edge-on and slightly below
    ctx.beginPath();
    ctx.moveTo(-2, 2);
    ctx.lineTo(-13, 7.5);
    ctx.lineTo(-6, 7.5);
    ctx.lineTo(6, 2.4);
    ctx.closePath();
    ctx.fill();

    // Engine
    ctx.beginPath();
    ctx.ellipse(-1, 5, 5.2, 2.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tailplane
    ctx.beginPath();
    ctx.moveTo(-28, -1.5);
    ctx.lineTo(-34, -4.5);
    ctx.lineTo(-30, -4.5);
    ctx.lineTo(-25, -1.8);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // Streamlines over the wing when the aircraft world has focus. They
  // follow the section: accelerated and bunched over the upper surface,
  // slower underneath. That spacing difference is the pressure difference.
  function drawStreamlines(ctx, x, y, scale, alpha, t) {
    if (alpha < 0.02) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.lineWidth = 0.55;

    for (let i = 0; i < 7; i++) {
      const offset = -9 + i * 3.4;
      const overWing = offset < -1;
      ctx.strokeStyle = `rgba(255, 178, 90, ${alpha * (overWing ? 0.55 : 0.3)})`;
      ctx.beginPath();
      for (let k = 0; k <= 30; k++) {
        const p = k / 30;
        const px = -46 + p * 92;
        // Deflection peaks over the wing and relaxes fore and aft.
        const bump = Math.exp(-Math.pow((px - 2) / 16, 2));
        const py = offset - bump * (overWing ? 4.2 : -1.6) * (1 - Math.abs(offset) / 14);
        k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.stroke();

      // A tracer bead so the lines read as flow rather than contour.
      const bp = (t * 0.32 + i * 0.14) % 1;
      const bx = -46 + bp * 92;
      const bump = Math.exp(-Math.pow((bx - 2) / 16, 2));
      const by = offset - bump * (overWing ? 4.2 : -1.6) * (1 - Math.abs(offset) / 14);
      ctx.fillStyle = `rgba(255, 205, 150, ${alpha * 0.8})`;
      ctx.beginPath();
      ctx.arc(bx, by, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawStation(ctx, x, y, scale, glow) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    const body = glow > 0.02 ? `rgba(160, 200, 255, ${0.9})` : "rgba(198, 214, 236, 0.85)";
    ctx.fillStyle = body;

    // Truss
    ctx.fillRect(-26, -0.9, 52, 1.8);
    // Modules
    ctx.fillRect(-7, -3.4, 15, 6.8);
    ctx.fillRect(-14, -2.2, 6, 4.4);

    // Solar arrays. Four panels, the recognisable part of the silhouette.
    ctx.fillStyle = glow > 0.02 ? `rgba(120, 170, 255, 0.75)` : "rgba(120, 146, 190, 0.6)";
    for (const sx of [-24, -16, 12, 20]) {
      ctx.fillRect(sx, -11, 5, 22);
    }
    ctx.strokeStyle = "rgba(20, 30, 50, 0.5)";
    ctx.lineWidth = 0.4;
    for (const sx of [-24, -16, 12, 20]) {
      for (let k = 1; k < 4; k++) {
        const yy = -11 + (22 / 4) * k;
        ctx.beginPath();
        ctx.moveTo(sx, yy);
        ctx.lineTo(sx + 5, yy);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // The orbit track. Drawn as a wide, very shallow arc because at 408 km
  // over a 6,371 km planet the path really is almost flat at this scale —
  // showing a tight circle would be the lie most illustrations tell.
  function drawOrbitTrack(ctx, stage, alpha) {
    if (alpha < 0.02) return;
    const y = altY(408);
    ctx.save();
    ctx.strokeStyle = `rgba(110, 168, 255, ${alpha * 0.5})`;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    const w = stage.width;
    for (let i = 0; i <= 60; i++) {
      const p = i / 60;
      const px = axisX + p * (w - axisX);
      const py = y - Math.sin(p * Math.PI) * 9;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Earth's limb along the bottom. A shallow arc, because the horizon at
  // this scale is nearly straight.
  function drawLimb(ctx, stage) {
    const w = stage.width;
    const r = w * 2.4;
    const cy = groundY + r;
    ctx.save();
    ctx.beginPath();
    ctx.arc(w * 0.5, cy, r, Math.PI * 1.35, Math.PI * 1.65);
    ctx.lineTo(w, stage.height);
    ctx.lineTo(0, stage.height);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, groundY - 6, 0, stage.height);
    g.addColorStop(0, "rgba(46, 84, 150, 0.5)");
    g.addColorStop(1, "rgba(8, 14, 28, 0.95)");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  }

  /* ---------- Frame ---------- */

  const stage = new Stage(canvas, {
    staticFrameTime: 4,
    onResize: layout,
    update(dt) {
      const focus = getFocus();
      const targetSpace = focus === "space" ? 1 : 0;
      const targetAir = focus === "aircraft" ? 1 : 0;
      s.space = approach(s.space, targetSpace, 0.0008, dt);
      s.air = approach(s.air, targetAir, 0.0008, dt);
      s.pan = approach(s.pan, targetSpace - targetAir, 0.002, dt);

      planeT += dt * 0.028;
      if (planeT > 1.25) planeT = -0.25;
      issT -= dt * 0.011;
      if (issT < -0.25) issT = 1.25;
    },
    draw(ctx, st) {
      if (!stars) layout(st);

      const panPx = -s.pan * st.height * 0.045;
      ctx.save();
      ctx.translate(0, panPx);

      // Star field, blitted from cache. Brightness follows space focus.
      if (starCanvas) {
        ctx.globalAlpha = lerp(0.55, 1, s.space) * (1 - s.air * 0.35);
        ctx.drawImage(starCanvas, 0, 0, st.width, st.height);
        ctx.globalAlpha = 1;
      }

      drawLimb(ctx, st);
      drawAtmosphere(ctx, st);
      drawOrbitTrack(ctx, st, s.space);
      drawAxis(ctx, st);

      // Airliner at FL350, crossing left to right.
      const planeY = altY(10.7);
      const planeX = lerp(axisX - 60, st.width + 60, planeT);
      const planeScale = clamp(st.width / 1100, 0.72, 1.35) * lerp(1, 1.18, s.air);
      drawStreamlines(ctx, planeX, planeY, planeScale, s.air, st.time);
      drawAirliner(ctx, planeX, planeY, planeScale, s.air);

      // Station at 408 km, tracking the other way.
      const issY = altY(408) - Math.sin(issT * Math.PI) * 9;
      const issX = lerp(st.width + 70, axisX - 70, 1 - issT);
      drawStation(ctx, issX, issY, clamp(st.width / 1500, 0.6, 1.1) * lerp(1, 1.15, s.space), s.space);

      ctx.restore();
    },
  });

  layout(stage);
  stage.start();
  return stage;
}

export { prefersReducedMotion };
