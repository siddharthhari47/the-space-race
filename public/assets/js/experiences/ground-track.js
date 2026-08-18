// Ground track display.
//
// Equirectangular graticule rather than a world map, and that is a decision
// rather than a shortcut. A coastline drawn from memory would be wrong in
// ways an educational site cannot afford, and the lesson here does not need
// one: what matters is latitude coverage, the westward march, and where the
// launch sites sit. Real mission-control track displays are often exactly
// this — a grid, a line, and a footprint.
//
// The footprint is computed properly. A circle on a sphere is not a circle
// in this projection — it stretches badly toward the poles and wraps round
// the edges — so the outline is walked as a great-circle destination at the
// horizon half-angle across all bearings, which gives the true shape.

import { Stage, clamp, lerp, approach } from "../systems/stage.js";
import {
  groundTrack, period, horizonAngle, LAUNCH_SITES,
} from "../systems/groundtrack.js";

const DEG = Math.PI / 180;

// Great-circle destination: from (lat1, lon1), travel angular distance d on
// bearing brg. Standard navigation formula.
function destination(lat1, lon1, d, brg) {
  const la1 = lat1 * DEG;
  const lo1 = lon1 * DEG;
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(brg));
  const lo2 =
    lo1 + Math.atan2(Math.sin(brg) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
  return { lat: la2 / DEG, lon: (((lo2 / DEG + 540) % 360) - 180) };
}

export function mountGroundTrack(canvas, options = {}) {
  const getState = options.getState || (() => ({ altKm: 408, incDeg: 51.6 }));

  let plot = { x: 0, y: 0, w: 0, h: 0 };
  let track = [];
  let lastKey = "";
  let phase = 0;
  let smoothInc = 51.6;

  function layout(stage) {
    const padL = 30;
    const padR = 10;
    const padT = 10;
    const padB = 20;
    plot = {
      x: padL,
      y: padT,
      w: Math.max(10, stage.width - padL - padR),
      h: Math.max(10, stage.height - padT - padB),
    };
  }

  const px = (lon) => plot.x + ((lon + 180) / 360) * plot.w;
  const py = (lat) => plot.y + ((90 - lat) / 180) * plot.h;

  function ensureTrack(altKm, incDeg) {
    const key = `${altKm.toFixed(0)}|${incDeg.toFixed(1)}`;
    if (key === lastKey) return;
    lastKey = key;
    track = groundTrack({ altKm, incDeg, orbits: 4, samples: 1100 });
  }

  function drawGrid(ctx) {
    ctx.save();
    ctx.font = '500 8px "JetBrains Mono", monospace';
    ctx.lineWidth = 1;

    for (let lat = -90; lat <= 90; lat += 30) {
      const y = py(lat);
      ctx.strokeStyle = lat === 0 ? "rgba(110, 168, 255, 0.3)" : "rgba(150, 175, 210, 0.1)";
      ctx.beginPath();
      ctx.moveTo(plot.x, y + 0.5);
      ctx.lineTo(plot.x + plot.w, y + 0.5);
      ctx.stroke();
      ctx.fillStyle = "rgba(150, 170, 200, 0.65)";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(`${lat > 0 ? "+" : ""}${lat}`, plot.x - 5, y);
    }

    for (let lon = -180; lon <= 180; lon += 60) {
      const x = px(lon);
      ctx.strokeStyle = lon === 0 ? "rgba(110, 168, 255, 0.22)" : "rgba(150, 175, 210, 0.1)";
      ctx.beginPath();
      ctx.moveTo(x + 0.5, plot.y);
      ctx.lineTo(x + 0.5, plot.y + plot.h);
      ctx.stroke();
      ctx.fillStyle = "rgba(150, 170, 200, 0.6)";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(String(lon), x, plot.y + plot.h + 4);
    }
    ctx.restore();
  }

  // The band the satellite can never leave. Everything outside it is
  // territory this orbit simply never flies over, which is the single most
  // useful thing the inclination control demonstrates.
  function drawCoverageBand(ctx, incDeg) {
    const maxLat = incDeg <= 90 ? incDeg : 180 - incDeg;
    ctx.save();
    ctx.fillStyle = "rgba(4, 8, 18, 0.55)";
    ctx.fillRect(plot.x, plot.y, plot.w, py(maxLat) - plot.y);
    ctx.fillRect(plot.x, py(-maxLat), plot.w, plot.y + plot.h - py(-maxLat));

    ctx.strokeStyle = "rgba(255, 171, 94, 0.45)";
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1;
    for (const l of [maxLat, -maxLat]) {
      ctx.beginPath();
      ctx.moveTo(plot.x, py(l) + 0.5);
      ctx.lineTo(plot.x + plot.w, py(l) + 0.5);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.font = '500 9px "JetBrains Mono", monospace';
    ctx.fillStyle = "rgba(255, 190, 130, 0.85)";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(`never above ${maxLat.toFixed(1)}°`, plot.x + 6, py(maxLat) - 3);
    ctx.restore();
  }

  function drawTrack(ctx) {
    if (track.length < 2) return;
    ctx.save();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = "rgba(110, 168, 255, 0.75)";
    ctx.beginPath();
    let prev = null;
    for (const p of track) {
      const x = px(p.lon);
      const y = py(p.lat);
      // A jump across the date line is a projection artefact, not a
      // manoeuvre. Break the path rather than drawing a line straight
      // across the whole chart.
      if (prev && Math.abs(p.lon - prev.lon) > 180) ctx.moveTo(x, y);
      else if (!prev) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      prev = p;
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawFootprint(ctx, lat, lon, altKm) {
    const d = horizonAngle(altKm);
    const pts = [];
    for (let b = 0; b <= 360; b += 4) pts.push(destination(lat, lon, d, b * DEG));

    ctx.save();
    ctx.strokeStyle = "rgba(126, 235, 180, 0.7)";
    ctx.fillStyle = "rgba(126, 235, 180, 0.09)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    let prev = null;
    for (const p of pts) {
      const x = px(p.lon);
      const y = py(p.lat);
      if (prev && Math.abs(p.lon - prev.lon) > 180) ctx.moveTo(x, y);
      else if (!prev) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      prev = p;
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawSites(ctx) {
    ctx.save();
    ctx.font = '500 8px "JetBrains Mono", monospace';
    for (const s of LAUNCH_SITES) {
      const x = px(s.lon);
      const y = py(s.lat);
      ctx.fillStyle = "rgba(255, 210, 150, 0.9)";
      ctx.beginPath();
      ctx.moveTo(x, y - 3.2);
      ctx.lineTo(x + 3.2, y);
      ctx.lineTo(x, y + 3.2);
      ctx.lineTo(x - 3.2, y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(230, 210, 180, 0.7)";
      ctx.textAlign = x > plot.x + plot.w * 0.8 ? "right" : "left";
      ctx.textBaseline = "middle";
      ctx.fillText(s.name, x + (x > plot.x + plot.w * 0.8 ? -6 : 6), y);
    }
    ctx.restore();
  }

  function drawSatellite(ctx, p, altKm) {
    const x = px(p.lon);
    const y = py(p.lat);
    ctx.save();
    ctx.fillStyle = "#ffc98a";
    ctx.beginPath();
    ctx.arc(x, y, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 201, 138, 0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    void altKm;
  }

  const stage = new Stage(canvas, {
    staticFrameTime: 3,
    onResize: layout,
    update(dt) {
      const { altKm, incDeg } = getState();
      smoothInc = approach(smoothInc, incDeg, 0.002, dt);
      // One orbit takes about eight seconds on screen regardless of its real
      // period, so a GEO orbit and a LEO orbit are equally watchable. The
      // westward shift between successive orbits is preserved, because that
      // comes from the track geometry rather than the playback rate.
      phase = (phase + dt / 8) % 1;
      void altKm;
      void period;
    },
    draw(ctx, st) {
      if (plot.w <= 10) layout(st);
      const { altKm, incDeg } = getState();
      ensureTrack(altKm, incDeg);

      ctx.fillStyle = "#050912";
      ctx.fillRect(0, 0, st.width, st.height);

      drawCoverageBand(ctx, smoothInc);
      drawGrid(ctx);
      drawTrack(ctx);
      drawSites(ctx);

      if (track.length) {
        // Walk only the first orbit's worth of samples, looping, so the
        // marker retraces one orbit rather than crawling through all four.
        // The index is wrapped with a positive modulo: JavaScript's % keeps
        // the sign of its left operand, so a phase that has dipped below
        // zero would otherwise index -1 and read past the start of the
        // array. Stage now guarantees a non-negative dt, but an index
        // derived from a float should not depend on that promise.
        const perOrbit = Math.max(1, Math.floor(track.length / 4));
        const idx = ((Math.floor(phase * perOrbit) % track.length) + track.length) % track.length;
        const p = track[idx];
        drawFootprint(ctx, p.lat, p.lon, altKm);
        drawSatellite(ctx, p, altKm);
      }
    },
  });

  layout(stage);
  stage.start();
  return { stage, destroy: () => stage.destroy() };
}
