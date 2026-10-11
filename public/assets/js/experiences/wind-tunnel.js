// Wind tunnel — the AIRCRAFT flagship.
//
// Two views, driven by one state. The working section shows the section and
// the air going past it; the polar shows where you are on the lift curve.
// Both update from the same coefficients, so the picture and the plot
// cannot disagree.
//
// About the streamlines. They are not decoration and they are not a CFD
// solution either — they are potential flow, computed properly: a uniform
// stream, plus a point vortex at the quarter chord whose strength comes
// from the lift coefficient the aerofoil module just returned, plus a
// doublet for thickness. That gives you the genuine article for free:
// upwash ahead of the wing, downwash behind it, and flow that speeds up
// over the top and slows underneath. Those are the real mechanisms, and
// they fall out of the maths rather than being drawn in.
//
// Where it stops being true is the stall, because potential flow has no
// concept of separation — it will happily predict beautiful attached
// streamlines at forty degrees. So past the stall angle the model stops
// pretending: the upper-surface lines detach at a separation point that
// walks forward as the angle increases, and the region behind becomes a
// visibly disordered wake. That transition is drawn rather than solved,
// and the caption on the page says so.

import { Stage, clamp, lerp, approach } from "../systems/stage.js";
import { nacaProfile, coefficients } from "../systems/aerofoil.js";

const DEG = Math.PI / 180;

/* ---------- Potential flow field ---------- */

// Velocity at a point, in aerofoil-fixed coordinates (chord along +x).
// Returns { u, v } normalised so freestream speed is 1.
function velocityAt(x, y, alphaRad, cl, thickness) {
  // Freestream, tilted by the angle of attack.
  let u = Math.cos(alphaRad);
  let v = Math.sin(alphaRad);

  // Bound vortex at the quarter chord. Kutta-Joukowski gives L = rho*U*Gamma
  // and L = 0.5*rho*U^2*c*CL, so Gamma = 0.5*U*c*CL. With U and c set to 1
  // the circulation is simply CL/2.
  const gamma = cl / 2;
  const vx = x - 0.25;
  const vy = y;
  const r2 = vx * vx + vy * vy + 0.004; // softened core, or it blows up
  u += (gamma / (2 * Math.PI)) * (vy / r2);
  v -= (gamma / (2 * Math.PI)) * (vx / r2);

  // Doublet at mid-chord, standing in for displacement by thickness.
  const kappa = thickness * 0.09;
  const dx = x - 0.4;
  const dy = y;
  const d2 = dx * dx + dy * dy + 0.01;
  u -= (kappa * (dx * dx - dy * dy)) / (d2 * d2);
  v -= (kappa * (2 * dx * dy)) / (d2 * d2);

  return { u, v };
}

export function mountWindTunnel(canvas, options = {}) {
  const getState = options.getState || (() => ({ alpha: 4, wing: {} }));

  let plot = { x: 0, y: 0, w: 0, h: 0, scale: 1 };
  let profile = nacaProfile({ camber: 0.02, camberPos: 0.4, thickness: 0.12 });
  let lastShape = "";
  let smoothAlpha = 4;
  let seeds = [];

  function layout(stage) {
    const pad = 20;
    plot = {
      x: pad,
      y: pad,
      w: stage.width - pad * 2,
      h: stage.height - pad * 2,
    };
    // Chord occupies a bit over half the width, leaving room for the wake.
    plot.scale = plot.w * 0.52;
    buildSeeds();
  }

  function buildSeeds() {
    seeds = [];
    const n = 17;
    for (let i = 0; i < n; i++) {
      seeds.push(-0.62 + (i / (n - 1)) * 1.24);
    }
  }

  // Aerofoil coords -> screen. Origin is the leading edge, chord along +x.
  const sx = (x) => plot.x + plot.w * 0.24 + x * plot.scale;
  const sy = (y) => plot.y + plot.h * 0.5 - y * plot.scale;

  function ensureProfile(wing) {
    const key = `${wing.camber}|${wing.camberPos}|${wing.thickness}`;
    if (key === lastShape) return;
    lastShape = key;
    profile = nacaProfile(wing);
  }

  function drawAerofoil(ctx, alphaRad) {
    ctx.save();
    ctx.translate(sx(0.25), sy(0));
    ctx.rotate(alphaRad); // screen y is already flipped, so this is nose-up
    ctx.translate(-sx(0.25), -sy(0));

    ctx.beginPath();
    profile.upper.forEach((p, i) => {
      const X = sx(p.x);
      const Y = sy(p.y);
      i === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y);
    });
    for (let i = profile.lower.length - 1; i >= 0; i--) {
      ctx.lineTo(sx(profile.lower[i].x), sy(profile.lower[i].y));
    }
    ctx.closePath();

    const g = ctx.createLinearGradient(sx(0), sy(0.1), sx(1), sy(-0.1));
    g.addColorStop(0, "#e6ecf6");
    g.addColorStop(1, "#9dabc0");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "rgba(20, 28, 44, 0.9)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Chord line, so the angle of attack is visible as an angle rather than
    // just a number on a slider.
    ctx.strokeStyle = "rgba(20, 28, 44, 0.5)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(sx(0), sy(0));
    ctx.lineTo(sx(1), sy(0));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // March a streamline through the velocity field.
  function traceStreamline(y0, alphaRad, cl, thickness, sepX, stalled) {
    const pts = [];
    let x = -0.62;
    let y = y0;
    const step = 0.012;
    for (let i = 0; i < 190; i++) {
      const { u, v } = velocityAt(x, y, alphaRad, cl, thickness);
      const mag = Math.hypot(u, v) || 1;
      x += (u / mag) * step;
      y += (v / mag) * step;
      pts.push({ x, y, speed: mag });
      if (x > 1.7) break;
    }

    // Separation: past the stall the upper-surface flow stops following the
    // section. Everything downstream of the separation point gets lifted
    // off the surface and scattered.
    if (stalled) {
      for (const p of pts) {
        if (p.x > sepX && y0 > 0) {
          const t = clamp((p.x - sepX) / 0.9, 0, 1);
          p.y += t * 0.14;
          p.chaos = t;
        }
      }
    }
    return pts;
  }

  function drawStreamlines(ctx, alphaRad, c, wing, time) {
    const sepX = clamp(0.75 - (Math.abs(c.alpha ?? smoothAlpha) - c.alphaStallDeg) * 0.06, 0.06, 0.95);

    for (const y0 of seeds) {
      const pts = traceStreamline(y0, alphaRad, c.cl, wing.thickness, sepX, c.stalled);
      if (pts.length < 2) continue;

      ctx.beginPath();
      pts.forEach((p, i) => {
        let jitter = 0;
        if (p.chaos) {
          // Deterministic wobble keyed to position and time: reads as
          // turbulence without needing a random number per frame, which
          // would strobe.
          jitter = Math.sin(p.x * 26 + time * 5 + y0 * 12) * 0.028 * p.chaos;
        }
        const X = sx(p.x);
        const Y = sy(p.y + jitter);
        i === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y);
      });

      // Colour by how fast the flow is going. Faster than freestream is the
      // low-pressure side, and on a lifting aerofoil that is the top — which
      // is the entire mechanism, made visible without a single label.
      const mid = pts[Math.floor(pts.length * 0.45)];
      const rel = clamp((mid.speed - 0.85) / 0.5, 0, 1);
      ctx.strokeStyle = `rgba(${Math.round(lerp(120, 255, rel))}, ${Math.round(
        lerp(180, 190, rel)
      )}, ${Math.round(lerp(255, 90, rel))}, ${c.stalled && y0 > 0 ? 0.5 : 0.75})`;
      ctx.lineWidth = 1;
      ctx.stroke();

      // A bead travelling along the line, so the flow reads as moving.
      const phase = (time * 0.28 + (y0 + 1) * 0.37) % 1;
      const idx = Math.floor(phase * (pts.length - 1));
      const b = pts[idx];
      if (b) {
        ctx.fillStyle = `rgba(255, 226, 170, ${c.stalled && y0 > 0 ? 0.4 : 0.85})`;
        ctx.beginPath();
        ctx.arc(sx(b.x), sy(b.y), 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (c.stalled) {
      ctx.font = '500 10px "JetBrains Mono", monospace';
      ctx.fillStyle = "rgba(255, 140, 110, 0.95)";
      ctx.textAlign = "center";
      ctx.fillText("SEPARATED", sx(sepX + 0.35), sy(0.34));
      ctx.strokeStyle = "rgba(255, 140, 110, 0.5)";
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(sx(sepX), sy(0.05));
      ctx.lineTo(sx(sepX), sy(0.3));
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Lift and drag arrows, to scale with each other. Drag is genuinely tiny
  // next to lift on an efficient wing, and showing that honestly is more
  // instructive than making both arrows a comfortable size.
  function drawForces(ctx, c) {
    const ox = sx(0.25);
    const oy = sy(0);
    const liftPx = c.cl * 90;
    const dragPx = c.cd * 90;

    const arrow = (dx, dy, colour, label) => {
      const len = Math.hypot(dx, dy);
      if (len < 3) return;
      ctx.save();
      ctx.strokeStyle = colour;
      ctx.fillStyle = colour;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + dx, oy + dy);
      ctx.stroke();
      const ang = Math.atan2(dy, dx);
      ctx.translate(ox + dx, oy + dy);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-7, -3.5);
      ctx.lineTo(-7, 3.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.font = '500 10px "JetBrains Mono", monospace';
      ctx.fillStyle = colour;
      ctx.textAlign = "center";
      ctx.fillText(label, ox + dx * 1.12, oy + dy * 1.12 - 4);
    };

    arrow(0, -liftPx, c.stalled ? "rgba(255, 150, 120, 0.95)" : "rgba(126, 235, 180, 0.95)", "L");
    arrow(dragPx * 4, 0, "rgba(255, 171, 64, 0.95)", "D");
  }

  const stage = new Stage(canvas, {
    staticFrameTime: 1,
    onResize: layout,
    update(dt) {
      const { alpha } = getState();
      // Ease the angle so dragging the slider looks like a model on a sting
      // being rotated, not like frames being swapped.
      smoothAlpha = approach(smoothAlpha, alpha, 0.001, dt);
    },
    draw(ctx, st) {
      if (plot.w <= 0) layout(st);
      const { wing } = getState();
      ensureProfile(wing);
      const c = options.getEvaluation?.() || coefficients(smoothAlpha, wing);
      const alphaRad = (options.getEvaluation ? getState().alpha : smoothAlpha) * DEG;

      // Tunnel walls
      ctx.strokeStyle = "rgba(200, 214, 232, 0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plot.x, plot.y + 0.5);
      ctx.lineTo(plot.x + plot.w, plot.y + 0.5);
      ctx.moveTo(plot.x, plot.y + plot.h - 0.5);
      ctx.lineTo(plot.x + plot.w, plot.y + plot.h - 0.5);
      ctx.stroke();

      drawStreamlines(ctx, alphaRad, c, wing, st.time);
      drawAerofoil(ctx, alphaRad);
      drawForces(ctx, c);

      ctx.font = '500 9px "JetBrains Mono", monospace';
      ctx.fillStyle = "rgba(150, 168, 195, 0.75)";
      ctx.textAlign = "left";
      ctx.fillText("FLOW →", plot.x + 4, plot.y + 14);
    },
  });

  layout(stage);
  stage.start();
  return { stage, destroy: () => stage.destroy() };
}

/* ---------- The polar ---------- */

export function mountPolar(canvas, options = {}) {
  const metric = options.metric || 'cl';
  let plot;
  const layout = st => { plot = {x:42,y:16,w:Math.max(1,st.width-58),h:Math.max(1,st.height-40)}; };
  const stage = new Stage(canvas, {
    staticFrameTime:.2, onResize:layout,
    draw(ctx,st) {
      if (!plot) layout(st);
      const current = options.getEvaluation();
      const series = [{curve:options.getCurve(),result:current,color:'#ffbd6a',dash:[],slot:'Now'},
        ...options.getTrials().map(t=>({...t,color:t.slot==='A'?'#f5a5d7':'#8ecbff',dash:t.slot==='A'?[7,4]:[2,4]}))];
      const all = series.flatMap(s=>s.curve);
      const minA=Math.min(...all.map(p=>p.alpha)), maxA=Math.max(...all.map(p=>p.alpha));
      const target=options.getTarget(metric);
      const low=Math.min(0,...all.map(p=>p[metric])), high=metric==='cd' && options.getZoom?.() ? .03 : Math.max(.02,...all.map(p=>p[metric]),target||0)*1.12;
      const px=a=>plot.x+(a-minA)/(maxA-minA)*plot.w;
      const py=v=>plot.y+plot.h-(v-low)/(high-low)*plot.h;
      ctx.font='10px monospace'; ctx.lineWidth=1;
      for(let i=0;i<=3;i++) {
        const value=low+(high-low)*i/3, y=py(value);
        ctx.strokeStyle='#344153'; ctx.beginPath(); ctx.moveTo(plot.x,y);ctx.lineTo(plot.x+plot.w,y);ctx.stroke();
        ctx.fillStyle='#c1cbd9';ctx.textAlign='right';ctx.fillText(value.toFixed(metric==='cl'?1:3),plot.x-5,y+3);
      }
      ctx.textAlign='center';ctx.fillText(minA.toFixed(1)+'°',plot.x,plot.y+plot.h+17);ctx.fillText(maxA.toFixed(1)+'°',plot.x+plot.w,plot.y+plot.h+17);
      if(target!==null && target!==undefined) {
        ctx.strokeStyle='#a8f3ce';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(plot.x,py(target));ctx.lineTo(plot.x+plot.w,py(target));ctx.stroke();ctx.setLineDash([]);
        ctx.fillStyle='#a8f3ce';ctx.textAlign='right';ctx.fillText('goal '+target.toFixed(metric==='cl'?3:5),plot.x+plot.w,Math.max(12,py(target)-5));
      }
      ctx.save();ctx.beginPath();ctx.rect(plot.x,plot.y-1,plot.w,plot.h+2);ctx.clip();
      for(const s of series) {
        ctx.strokeStyle=s.color;ctx.lineWidth=s.slot==='Now'?2:1.5;ctx.setLineDash(s.dash);ctx.beginPath();
        s.curve.forEach((p,i)=>{ i?ctx.lineTo(px(p.alpha),py(p[metric])):ctx.moveTo(px(p.alpha),py(p[metric])); });ctx.stroke();ctx.setLineDash([]);
        const x=px(s.result.alpha), y=py(s.result[metric]);ctx.fillStyle=s.color;ctx.beginPath();ctx.arc(x,y,s.slot==='Now'?4:5,0,Math.PI*2);ctx.stroke();
        if(s.slot==='Now')ctx.fill();
        ctx.textAlign='center';ctx.fillText(s.slot,Math.max(plot.x+12,Math.min(plot.x+plot.w-12,x)),Math.max(10,y-9));
      }
      ctx.restore();
    }
  });
  layout(stage);stage.start();return {stage,destroy:()=>stage.destroy()};
}
