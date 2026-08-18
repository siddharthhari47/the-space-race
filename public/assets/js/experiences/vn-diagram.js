// V-n diagram display.
//
// Draws exactly the shape Lecture 55 draws by hand: a stall parabola on
// each side rising to a flat structural ceiling, then dropping off toward
// the design dive speed. The corner point — where the parabola meets the
// ceiling — is marked explicitly, because it is the one point on this
// whole chart with a name and a reason to care about it.

import { Stage, clamp, lerp, approach } from "../systems/stage.js";
import { buildEnvelope } from "../systems/vn-diagram.js";

export function mountVnDiagram(canvas, options = {}) {
  const getState = options.getState || (() => ({}));

  let plot = { x: 0, y: 0, w: 0, h: 0 };
  const V_MAX = 400; // kt, axis ceiling
  const N_MAX = 10;
  const N_MIN = -6;
  let smoothPos = 3;
  let smoothNeg = -1.5;

  function layout(stage) {
    plot = {
      x: 44,
      y: 14,
      w: Math.max(10, stage.width - 60),
      h: Math.max(10, stage.height - 34),
    };
  }

  const px = (v) => plot.x + (v / V_MAX) * plot.w;
  const py = (n) => plot.y + plot.h - ((n - N_MIN) / (N_MAX - N_MIN)) * plot.h;

  function drawGrid(ctx) {
    ctx.save();
    ctx.font = '500 8px "JetBrains Mono", monospace';
    ctx.strokeStyle = "rgba(200, 214, 232, 0.08)";
    for (let n = N_MIN; n <= N_MAX; n += 2) {
      const y = py(n);
      ctx.beginPath();
      ctx.moveTo(plot.x, y + 0.5);
      ctx.lineTo(plot.x + plot.w, y + 0.5);
      ctx.stroke();
      ctx.fillStyle = "rgba(160, 180, 210, 0.7)";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(n.toFixed(0), plot.x - 6, y);
    }
    for (let v = 0; v <= V_MAX; v += 100) {
      const x = px(v);
      ctx.beginPath();
      ctx.moveTo(x + 0.5, plot.y);
      ctx.lineTo(x + 0.5, plot.y + plot.h);
      ctx.stroke();
      ctx.fillStyle = "rgba(160, 180, 210, 0.7)";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(String(v), x, plot.y + plot.h + 4);
    }
    // n=0 and n=1 axes
    ctx.strokeStyle = "rgba(150, 175, 210, 0.3)";
    ctx.beginPath();
    ctx.moveTo(plot.x, py(0) + 0.5);
    ctx.lineTo(plot.x + plot.w, py(0) + 0.5);
    ctx.stroke();
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = "rgba(150, 175, 210, 0.22)";
    ctx.beginPath();
    ctx.moveTo(plot.x, py(1) + 0.5);
    ctx.lineTo(plot.x + plot.w, py(1) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(140, 160, 190, 0.8)";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("n", 4, plot.y);
    ctx.textAlign = "right";
    ctx.fillText("V (kt, equivalent)", plot.x + plot.w, plot.y + plot.h + 16);
    ctx.restore();
  }

  function pathFor(ctx, pts, colour) {
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = px(p.v);
      const y = py(p.n);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  function drawEnvelope(ctx, env) {
    ctx.save();
    // Fill: positive loop closed against the axis, negative likewise.
    ctx.beginPath();
    env.positive.forEach((p, i) => {
      const x = px(p.v);
      const y = py(p.n);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(px(env.positive[env.positive.length - 1].v), py(0));
    ctx.lineTo(px(0), py(0));
    ctx.closePath();
    ctx.fillStyle = "rgba(255, 171, 94, 0.1)";
    ctx.fill();

    ctx.beginPath();
    env.negative.forEach((p, i) => {
      const x = px(p.v);
      const y = py(p.n);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(px(env.negative[env.negative.length - 1].v), py(0));
    ctx.lineTo(px(0), py(0));
    ctx.closePath();
    ctx.fillStyle = "rgba(126, 200, 255, 0.08)";
    ctx.fill();

    pathFor(ctx, env.positive, "rgba(255, 171, 94, 0.9)");
    pathFor(ctx, env.negative, "rgba(126, 200, 255, 0.75)");
    ctx.restore();
  }

  function drawCorner(ctx, env, nPos) {
    const x = px(env.vA);
    const y = py(nPos);
    ctx.save();
    ctx.strokeStyle = "rgba(255, 220, 160, 0.95)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = "rgba(255, 220, 160, 0.4)";
    ctx.beginPath();
    ctx.moveTo(x, plot.y + plot.h);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '500 9px "JetBrains Mono", monospace';
    ctx.fillStyle = "rgba(255, 220, 160, 0.95)";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(`corner speed  ${env.vA.toFixed(0)} kt`, x + 8, y - 4);
    ctx.restore();
  }

  const stage = new Stage(canvas, {
    staticFrameTime: 0.3,
    onResize: layout,
    update(dt) {
      const s = getState();
      smoothPos = approach(smoothPos, s.nPos ?? 3, 0.001, dt);
      smoothNeg = approach(smoothNeg, s.nNeg ?? -1.5, 0.001, dt);
    },
    draw(ctx, st) {
      if (plot.w <= 10) layout(st);
      const s = getState();

      ctx.fillStyle = "#070910";
      ctx.fillRect(0, 0, st.width, st.height);

      drawGrid(ctx);

      const env = buildEnvelope({
        wingLoading: s.wingLoading ?? 3500,
        clMax: s.clMax ?? 1.3,
        clMaxNeg: s.clMaxNeg ?? 0.7,
        nPos: smoothPos,
        nNeg: smoothNeg,
        vC: s.vC ?? 250,
        vD: s.vD ?? 325,
      });

      drawEnvelope(ctx, env);
      drawCorner(ctx, env, smoothPos);
    },
  });

  layout(stage);
  stage.start();
  return { stage, destroy: () => stage.destroy() };
}
