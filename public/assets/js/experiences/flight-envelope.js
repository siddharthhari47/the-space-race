// Flight Envelope — the AIRCRAFT world's environment.
//
// The counterpart to the orbit field in the other wing. Where SPACE maps
// everything onto one axis of altitude, AIRCRAFT maps it onto two: how high
// and how fast. Plot both and the whole wing sorts itself out, because an
// aircraft is very largely defined by which part of this chart it was built
// to sit in.
//
// The shaded region is a real envelope for a large jet transport, and both
// its edges are computed rather than drawn:
//
//   LEFT   the wing has to make its own weight in lift, so
//          V_stall = sqrt(2(W/S) / (rho * CLmax)). Density falls with
//          altitude, so the minimum speed climbs. This edge leans right.
//
//   RIGHT  two limits in sequence. Down low it is VMO, a structural limit
//          on dynamic pressure, which is a fixed indicated airspeed and so
//          a *rising* Mach number as you climb. Higher up it is MMO, a
//          fixed Mach number set by where shockwaves start forming on the
//          wing. Whichever bites first wins, and the kink where they swap
//          is the crossover altitude — around 29,000 ft for this aeroplane,
//          which is exactly where it sits on a real one.
//
// The two edges converge. Where they meet, the speed you must not go below
// and the speed you must not go above are the same speed, and there is no
// level flight above that altitude at all. Pilots call it the coffin
// corner, and it is the single most useful thing this chart has to say.
//
// One honest caveat, drawn on the chart rather than hidden in a comment.
// This envelope is *aerodynamic*: it asks only whether a wing can hold the
// aircraft up at that speed and height. It comes out at about 57,000 ft,
// which is far above where a 777 actually goes — the real ceiling is
// 43,100 ft, and it is set by thrust, not by the wing. Up there the engines
// simply cannot produce enough thrust in air that thin to balance the drag.
// Modelling that properly needs an engine deck this doesn't have, so rather
// than invent one, the certified ceiling is drawn as its own line and the
// gap between the two is left visible. The gap is the point: aerodynamics
// would let the aeroplane go higher than its engines will.
//
// The reference aircraft are typical cruise points, not records, and they
// are approximate — the honest claim is "this is roughly where this
// aeroplane lives", which is all the chart needs them to do.

import { atmosphere, stallMach, msToKnots } from "../systems/atmosphere.js";
import { Stage, clamp, lerp, approach, attachPointer } from "../systems/stage.js";

// A large twin-aisle transport, roughly 777-shaped.
export const TRANSPORT = {
  wingLoading: 6200, // N/m^2 at a typical cruise weight
  clMax: 1.35, // clean, no flaps
  vmoKts: 330, // indicated
  mmo: 0.89,
  certifiedCeiling: 13137, // m — 43,100 ft, the 777-300ER's published maximum
};

export const AIRCRAFT = [
  { id: "c172", name: "Cessna 172", mach: 0.19, alt: 2400, note: "Piston single. Low, slow, and utterly uninterested in any of the boundaries on this chart." },
  { id: "uh60", name: "UH-60", mach: 0.23, alt: 1500, note: "Rotorcraft. Its speed limit is not thrust but the advancing blade tip going transonic while the retreating one stalls." },
  { id: "a320", name: "A320", mach: 0.78, alt: 11300, note: "Short-haul workhorse, cruising just inside the transport envelope." },
  { id: "b777", name: "777-300ER", mach: 0.84, alt: 10700, note: "The aeroplane this envelope is drawn for. Cruise sits comfortably between both edges." },
  { id: "g650", name: "G650", mach: 0.85, alt: 12500, note: "Business jets climb above the airline traffic — higher, thinner air, less drag for the same Mach." },
  { id: "u2", name: "U-2", mach: 0.72, alt: 21300, note: "Enormous wing, very little weight. Low wing loading pushes its stall boundary far left, which is the only way to be here at all." },
  { id: "concorde", name: "Concorde", mach: 2.02, alt: 18300, note: "Supersonic cruise. A slender delta with no use for the subsonic envelope it flew straight through." },
  { id: "mig25", name: "MiG-25", mach: 2.83, alt: 20700, note: "Steel airframe, enormous intakes. Built around the problem of not melting." },
  { id: "sr71", name: "SR-71", mach: 3.2, alt: 24400, note: "Titanium, and it leaked fuel on the ground because the panels only sealed once friction heating expanded them in flight." },
];

const MACH_MAX = 3.5;
const ALT_MAX = 30000; // m

// Indicated airspeed limit expressed as a Mach number at a given altitude.
// VMO is a dynamic-pressure limit, so it is a constant *indicated* speed;
// converting to Mach uses the density ratio, which is why it rises as you
// climb until MMO takes over.
function vmoMach(h) {
  const { rho, a } = atmosphere(h);
  const vmoMs = TRANSPORT.vmoKts / 1.943844;
  const tas = vmoMs / Math.sqrt(rho / 1.225);
  return tas / a;
}

export const upperMach = (h) => Math.min(vmoMach(h), TRANSPORT.mmo);
export const lowerMach = (h) => stallMach(h, TRANSPORT.wingLoading, TRANSPORT.clMax);

// Highest altitude at which any level speed exists. Found by bisection
// rather than algebra because the upper edge is a min() of two different
// functions and has a corner in it.
export function serviceCeiling() {
  let lo = 0;
  let hi = ALT_MAX;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (lowerMach(mid) < upperMach(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function mountFlightEnvelope(canvas, options = {}) {
  const onSelect = options.onSelect || (() => {});
  const onProbe = options.onProbe || (() => {});

  let plot = { x: 0, y: 0, w: 0, h: 0 };
  let hovered = null;
  const glow = AIRCRAFT.map(() => 0);
  let probe = null; // {mach, alt} under the pointer
  let ceiling = serviceCeiling();

  function layout(stage) {
    const padL = 52;
    const padR = 16;
    const padT = 18;
    const padB = 38;
    plot = {
      x: padL,
      y: padT,
      w: Math.max(10, stage.width - padL - padR),
      h: Math.max(10, stage.height - padT - padB),
    };
  }

  const mx = (mach) => plot.x + (mach / MACH_MAX) * plot.w;
  const my = (alt) => plot.y + plot.h - (alt / ALT_MAX) * plot.h;
  const xToMach = (x) => ((x - plot.x) / plot.w) * MACH_MAX;
  const yToAlt = (y) => ((plot.y + plot.h - y) / plot.h) * ALT_MAX;

  function drawGrid(ctx) {
    ctx.save();
    ctx.font = '500 9px "JetBrains Mono", monospace';
    ctx.strokeStyle = "rgba(200, 214, 232, 0.07)";
    ctx.lineWidth = 1;

    // Altitude gridlines every 5 km, labelled in both km and flight level
    // because this chart is read by people who think in each.
    for (let km = 0; km <= 30; km += 5) {
      const y = my(km * 1000);
      ctx.beginPath();
      ctx.moveTo(plot.x, y + 0.5);
      ctx.lineTo(plot.x + plot.w, y + 0.5);
      ctx.stroke();
      ctx.fillStyle = "rgba(160, 176, 200, 0.65)";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(`${km}`, plot.x - 8, y);
    }

    for (let m = 0; m <= MACH_MAX; m += 0.5) {
      const x = mx(m);
      ctx.beginPath();
      ctx.moveTo(x + 0.5, plot.y);
      ctx.lineTo(x + 0.5, plot.y + plot.h);
      ctx.stroke();
      ctx.fillStyle = "rgba(160, 176, 200, 0.65)";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(m.toFixed(1), x, plot.y + plot.h + 7);
    }

    ctx.fillStyle = "rgba(140, 156, 180, 0.9)";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("ALT km", 4, plot.y - 2);
    ctx.textAlign = "right";
    ctx.fillText("MACH", plot.x + plot.w, plot.y + plot.h + 20);

    // Mach 1. Not a wall, but it is the line that splits this chart into
    // two different design problems.
    const x1 = mx(1);
    ctx.strokeStyle = "rgba(255, 171, 64, 0.35)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x1 + 0.5, plot.y);
    ctx.lineTo(x1 + 0.5, plot.y + plot.h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawEnvelope(ctx) {
    const steps = 90;
    const top = Math.min(ceiling, ALT_MAX);

    ctx.save();
    ctx.beginPath();
    // Up the left edge...
    for (let i = 0; i <= steps; i++) {
      const alt = (i / steps) * top;
      const x = mx(lowerMach(alt));
      const y = my(alt);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    // ...and back down the right.
    for (let i = steps; i >= 0; i--) {
      const alt = (i / steps) * top;
      ctx.lineTo(mx(upperMach(alt)), my(alt));
    }
    ctx.closePath();

    const g = ctx.createLinearGradient(0, my(top), 0, my(0));
    g.addColorStop(0, "rgba(255, 171, 64, 0.20)");
    g.addColorStop(1, "rgba(255, 171, 64, 0.06)");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 171, 64, 0.7)";
    ctx.lineWidth = 1.25;
    ctx.stroke();
    ctx.restore();

    // Name the edges, in place, where they are.
    ctx.save();
    ctx.font = '500 9px "JetBrains Mono", monospace';
    ctx.fillStyle = "rgba(255, 196, 130, 0.85)";
    ctx.textBaseline = "middle";

    const midAlt = top * 0.45;
    ctx.textAlign = "right";
    ctx.fillText("STALL", mx(lowerMach(midAlt)) - 6, my(midAlt));
    ctx.textAlign = "left";
    ctx.fillText("MMO", mx(upperMach(top * 0.75)) + 6, my(top * 0.75));
    ctx.fillText("VMO", mx(upperMach(top * 0.18)) + 6, my(top * 0.18));

    // The corner itself.
    const cx = mx(lowerMach(top));
    const cy = my(top);
    ctx.strokeStyle = "rgba(255, 120, 90, 0.9)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 150, 120, 0.95)";
    ctx.textAlign = "left";
    ctx.fillText(`coffin corner  ${(top / 1000).toFixed(1)} km`, cx + 9, cy - 8);

    // The certified ceiling, which is lower, and set by the engines rather
    // than the wing. Drawing both is the only honest way to show a limit
    // this model deliberately does not compute.
    const capY = my(TRANSPORT.certifiedCeiling);
    ctx.strokeStyle = "rgba(200, 220, 245, 0.5)";
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(plot.x, capY + 0.5);
    ctx.lineTo(plot.x + plot.w, capY + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(210, 226, 246, 0.85)";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("certified ceiling  43,100 ft — thrust-limited", plot.x + 6, capY - 4);
    ctx.restore();
  }

  function drawAircraft(ctx) {
    ctx.save();
    ctx.font = '500 10px "JetBrains Mono", monospace';
    AIRCRAFT.forEach((ac, i) => {
      const x = mx(ac.mach);
      const y = my(ac.alt);
      const g = glow[i];
      const inside = ac.mach >= lowerMach(ac.alt) && ac.mach <= upperMach(ac.alt);

      if (g > 0.01) {
        ctx.fillStyle = "rgba(255, 171, 64, 0.2)";
        ctx.globalAlpha = g;
        ctx.beginPath();
        ctx.arc(x, y, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Inside the transport envelope: filled. Outside: hollow. The hollow
      // ones are the aircraft that needed a different aeroplane entirely.
      ctx.beginPath();
      ctx.arc(x, y, lerp(3.2, 4.4, g), 0, Math.PI * 2);
      if (inside) {
        ctx.fillStyle = "#ffc98a";
        ctx.fill();
      } else {
        ctx.strokeStyle = "#e8eef8";
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }

      ctx.fillStyle = `rgba(232, 238, 248, ${lerp(0.55, 1, g)})`;
      ctx.textAlign = x > plot.x + plot.w * 0.72 ? "right" : "left";
      ctx.textBaseline = "bottom";
      const dx = x > plot.x + plot.w * 0.72 ? -8 : 8;
      ctx.fillText(ac.name, x + dx, y - 3);
    });
    ctx.restore();
  }

  function drawProbe(ctx) {
    if (!probe) return;
    const x = mx(probe.mach);
    const y = my(probe.alt);
    ctx.save();
    ctx.strokeStyle = "rgba(200, 220, 245, 0.35)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(plot.x, y + 0.5);
    ctx.lineTo(plot.x + plot.w, y + 0.5);
    ctx.moveTo(x + 0.5, plot.y);
    ctx.lineTo(x + 0.5, plot.y + plot.h);
    ctx.stroke();
    ctx.restore();
  }

  const stage = new Stage(canvas, {
    staticFrameTime: 0.5,
    onResize: layout,
    update(dt) {
      AIRCRAFT.forEach((_, i) => {
        glow[i] = approach(glow[i], hovered === i ? 1 : 0, 0.002, dt);
      });
    },
    draw(ctx, st) {
      if (plot.w <= 10) layout(st);
      drawGrid(ctx);
      drawEnvelope(ctx);
      drawProbe(ctx);
      drawAircraft(ctx);
    },
  });

  layout(stage);

  function hitAircraft(px, py) {
    let best = null;
    let bestD = 18;
    AIRCRAFT.forEach((ac, i) => {
      const d = Math.hypot(px - mx(ac.mach), py - my(ac.alt));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  const detach = attachPointer(canvas, {
    preventDefault: false,
    onMove(p) {
      hovered = hitAircraft(p.x, p.y);
      canvas.style.cursor = hovered === null ? "crosshair" : "pointer";

      const mach = clamp(xToMach(p.x), 0, MACH_MAX);
      const alt = clamp(yToAlt(p.y), 0, ALT_MAX);
      probe = { mach, alt };
      const air = atmosphere(alt);
      onProbe({
        mach,
        alt,
        tempC: air.T - 273.15,
        rho: air.rho,
        tasKts: msToKnots(mach * air.a),
        inside: mach >= lowerMach(alt) && mach <= upperMach(alt),
      });
    },
    onDown(p) {
      const hit = hitAircraft(p.x, p.y);
      if (hit !== null) onSelect(AIRCRAFT[hit]);
    },
    onLeave() {
      hovered = null;
      probe = null;
      onProbe(null);
    },
  });

  stage.start();

  return {
    stage,
    ceiling,
    destroy() {
      detach();
      stage.destroy();
    },
  };
}
