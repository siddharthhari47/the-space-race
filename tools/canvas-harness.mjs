// Headless verification for the canvas experiences.
//
// Why this exists: the browser pane available in this environment never
// fires requestAnimationFrame, ResizeObserver or IntersectionObserver, so
// none of the canvas work can be watched while it's being written. Rather
// than ship drawing code sight-unseen, this stubs enough of the DOM and the
// 2D context to actually run a scene for a few hundred simulated frames and
// assert the things that silently ruin a canvas:
//
//   * a NaN or Infinity reaching any drawing call — one bad coordinate and
//     the browser discards the whole path, so the symptom is "nothing is
//     drawn" with no error anywhere
//   * a scene that issues no drawing calls at all
//   * coordinates flying wildly outside the canvas, which usually means a
//     mapping function has the wrong sign or scale
//   * gradient/colour stops built from NaN, which throw
//
// It is not a substitute for looking at the thing. It is a substitute for
// *not* looking at the thing, which is the actual alternative here.
//
// Run: node tools/canvas-harness.mjs

const NUMERIC_ARGS = new Set([
  "moveTo", "lineTo", "arc", "arcTo", "rect", "fillRect", "strokeRect",
  "clearRect", "quadraticCurveTo", "bezierCurveTo", "ellipse", "translate",
  "scale", "rotate", "setTransform", "transform", "fillText", "strokeText",
  "createLinearGradient", "createRadialGradient", "drawImage",
]);

class Recorder {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.calls = 0;
    this.drawOps = 0;
    this.bad = [];
    this.extremes = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  }

  note(op, args) {
    this.calls++;
    if (/^(fill|stroke|drawImage|fillRect|strokeRect|fillText)/.test(op)) this.drawOps++;

    if (!NUMERIC_ARGS.has(op)) return;
    args.forEach((a, i) => {
      if (typeof a !== "number") return;
      if (!Number.isFinite(a)) {
        this.bad.push(`${op}() arg ${i} = ${a}`);
        return;
      }
      // Even-indexed args are x, odd are y for most of these. Close enough
      // to catch a mapping that has gone an order of magnitude wrong.
      if (i % 2 === 0) {
        this.extremes.minX = Math.min(this.extremes.minX, a);
        this.extremes.maxX = Math.max(this.extremes.maxX, a);
      } else {
        this.extremes.minY = Math.min(this.extremes.minY, a);
        this.extremes.maxY = Math.max(this.extremes.maxY, a);
      }
    });
  }
}

function makeContext(rec) {
  const gradient = {
    addColorStop(offset, colour) {
      if (!Number.isFinite(offset)) rec.bad.push(`addColorStop offset = ${offset}`);
      if (typeof colour !== "string" || /NaN|Infinity|undefined/.test(colour)) {
        rec.bad.push(`addColorStop colour = ${colour}`);
      }
    },
  };

  const noop = () => {};
  const ctx = {
    canvas: { width: rec.width, height: rec.height },
    save: noop, restore: noop, beginPath: noop, closePath: noop,
    clip: noop, setLineDash: noop, measureText: () => ({ width: 10 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
  };

  const methods = [
    "moveTo", "lineTo", "arc", "arcTo", "rect", "fillRect", "strokeRect",
    "clearRect", "quadraticCurveTo", "bezierCurveTo", "ellipse", "translate",
    "scale", "rotate", "setTransform", "transform", "fill", "stroke",
    "fillText", "strokeText", "drawImage",
  ];
  for (const m of methods) {
    ctx[m] = (...args) => rec.note(m, args);
  }
  // Gradient factories still need to record their args.
  ctx.createLinearGradient = (...args) => { rec.note("createLinearGradient", args); return gradient; };
  ctx.createRadialGradient = (...args) => { rec.note("createRadialGradient", args); return gradient; };

  // Style properties: setting them to a string containing NaN is a silent
  // no-op in browsers, which is exactly the kind of invisible bug worth
  // catching here.
  for (const prop of ["fillStyle", "strokeStyle", "font", "lineWidth", "globalAlpha",
                      "textAlign", "textBaseline", "lineCap", "lineJoin", "filter",
                      "shadowBlur", "shadowColor", "globalCompositeOperation"]) {
    let v;
    Object.defineProperty(ctx, prop, {
      get: () => v,
      set: (nv) => {
        v = nv;
        if (typeof nv === "number" && !Number.isFinite(nv)) rec.bad.push(`${prop} = ${nv}`);
        if (typeof nv === "string" && /NaN|Infinity/.test(nv)) rec.bad.push(`${prop} = ${nv}`);
      },
    });
  }
  return ctx;
}

/* ---------- DOM stubs ---------- */

export function installDom({ width = 1280, height = 820, dpr = 2, reducedMotion = false } = {}) {
  const rafQueue = [];
  let now = 0;

  const makeCanvas = (w = width, h = height) => {
    const rec = new Recorder(Math.round(w * dpr), Math.round(h * dpr));
    const el = {
      _rec: rec,
      width: 300,
      height: 150,
      style: {},
      getContext: () => makeContext(rec),
      getBoundingClientRect: () => ({ width: w, height: h, left: 0, top: 0, right: w, bottom: h }),
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    return el;
  };

  globalThis.window = {
    devicePixelRatio: dpr,
    innerWidth: width,
    innerHeight: height,
    matchMedia: () => ({ matches: reducedMotion, addEventListener: () => {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  globalThis.document = {
    hidden: false,
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: (tag) => (tag === "canvas" ? makeCanvas() : { style: {} }),
  };
  globalThis.performance = { now: () => now };
  globalThis.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.IntersectionObserver = class { observe() {} disconnect() {} };

  return {
    makeCanvas,
    // Drive the loop by hand: each step advances the clock and drains one
    // generation of rAF callbacks.
    step(ms = 16.7) {
      now += ms;
      const batch = rafQueue.splice(0, rafQueue.length);
      for (const cb of batch) cb(now);
    },
  };
}

/* ---------- Runner ---------- */

async function run() {
  let failures = 0;

  const scenes = [
    {
      name: "hero-vertical",
      module: "../public/assets/js/experiences/hero-vertical.js",
      mount: (m, canvas) => m.mountHeroVertical(canvas, { getFocus: () => "none" }),
    },
    {
      name: "hero-vertical (space focus)",
      module: "../public/assets/js/experiences/hero-vertical.js",
      mount: (m, canvas) => m.mountHeroVertical(canvas, { getFocus: () => "space" }),
    },
    {
      name: "hero-vertical (aircraft focus)",
      module: "../public/assets/js/experiences/hero-vertical.js",
      mount: (m, canvas) => m.mountHeroVertical(canvas, { getFocus: () => "aircraft" }),
    },
    {
      name: "orbit-field (LEO)",
      module: "../public/assets/js/experiences/orbit-field.js",
      mount: (m, canvas) => m.mountOrbitField(canvas, { getAltitude: () => 408 }).stage,
    },
    {
      name: "orbit-field (GEO)",
      module: "../public/assets/js/experiences/orbit-field.js",
      mount: (m, canvas) => m.mountOrbitField(canvas, { getAltitude: () => 35786 }).stage,
    },
    {
      // The lowest altitude the control allows. Worth its own case because
      // it is where the orbit ring collapses onto the planet's own edge and
      // any radius arithmetic that is going to go negative will do it here.
      name: "orbit-field (minimum altitude)",
      module: "../public/assets/js/experiences/orbit-field.js",
      mount: (m, canvas) => m.mountOrbitField(canvas, { getAltitude: () => 160 }).stage,
    },
    {
      name: "flight-envelope",
      module: "../public/assets/js/experiences/flight-envelope.js",
      mount: (m, canvas) => m.mountFlightEnvelope(canvas).stage,
    },
    {
      name: "wind-tunnel (attached)",
      module: "../public/assets/js/experiences/wind-tunnel.js",
      mount: (m, canvas) =>
        m.mountWindTunnel(canvas, {
          getState: () => ({ alpha: 4, wing: { camber: 0.02, camberPos: 0.4, thickness: 0.12, aspectRatio: 8, oswald: 0.8 } }),
        }).stage,
    },
    {
      // Post-stall exercises the separation path, which is the branch most
      // likely to produce a stray NaN because it mutates traced points.
      name: "wind-tunnel (stalled)",
      module: "../public/assets/js/experiences/wind-tunnel.js",
      mount: (m, canvas) =>
        m.mountWindTunnel(canvas, {
          getState: () => ({ alpha: 20, wing: { camber: 0.02, camberPos: 0.4, thickness: 0.12, aspectRatio: 8, oswald: 0.8 } }),
        }).stage,
    },
    {
      // Zero camber with the thinnest allowed section: the geometry
      // generator's degenerate case.
      name: "wind-tunnel (symmetric, thin)",
      module: "../public/assets/js/experiences/wind-tunnel.js",
      mount: (m, canvas) =>
        m.mountWindTunnel(canvas, {
          getState: () => ({ alpha: -6, wing: { camber: 0, camberPos: 0.4, thickness: 0.06, aspectRatio: 3, oswald: 0.7 } }),
        }).stage,
    },
    {
      name: "polar plot",
      module: "../public/assets/js/experiences/wind-tunnel.js",
      mount: (m, canvas) =>
        m.mountPolar(canvas, {
          getState: () => ({ alpha: 12, wing: { camber: 0.02, camberPos: 0.4, thickness: 0.12, aspectRatio: 8, oswald: 0.8 } }),
        }).stage,
    },
    {
      name: "rocket-lab (idle)",
      module: "../public/assets/js/experiences/rocket-lab.js",
      mount: (m, canvas) => m.mountRocketLab(canvas, { getState: () => ({ result: null, index: 0, phase: "idle" }) }).stage,
    },
    {
      name: "ground-track (ISS)",
      module: "../public/assets/js/experiences/ground-track.js",
      mount: (m, canvas) => m.mountGroundTrack(canvas, { getState: () => ({ altKm: 408, incDeg: 51.6 }) }).stage,
    },
    {
      // Geostationary is the degenerate case: the track collapses to one
      // point and the footprint covers nearly a third of the planet, which
      // stresses the date-line wrapping in both directions at once.
      name: "ground-track (GEO)",
      module: "../public/assets/js/experiences/ground-track.js",
      mount: (m, canvas) => m.mountGroundTrack(canvas, { getState: () => ({ altKm: 35786, incDeg: 0 }) }).stage,
    },
    {
      name: "atmosphere-column (sea level)",
      module: "../public/assets/js/experiences/atmosphere-column.js",
      mount: (m, canvas) => m.mountAtmosphereColumn(canvas, { getAltitude: () => 0 }).stage,
    },
    {
      // The top of the modelled range, where the clamp inside atmosphere()
      // is the only thing standing between the plot and a NaN.
      name: "atmosphere-column (32 km)",
      module: "../public/assets/js/experiences/atmosphere-column.js",
      mount: (m, canvas) => m.mountAtmosphereColumn(canvas, { getAltitude: () => 32000 }).stage,
    },
    {
      // Polar, where the footprint outline wraps over the pole and the
      // equirectangular projection is at its worst.
      name: "ground-track (polar)",
      module: "../public/assets/js/experiences/ground-track.js",
      mount: (m, canvas) => m.mountGroundTrack(canvas, { getState: () => ({ altKm: 800, incDeg: 90 }) }).stage,
    },
  ];

  const sizes = [
    { width: 1440, height: 900, dpr: 2, label: "desktop" },
    { width: 768, height: 1024, dpr: 2, label: "tablet" },
    { width: 375, height: 720, dpr: 3, label: "mobile" },
  ];

  for (const scene of scenes) {
    for (const size of sizes) {
      const dom = installDom(size);
      const canvas = dom.makeCanvas(size.width, size.height);
      let mod;
      try {
        mod = await import(scene.module + `?t=${Math.random()}`);
      } catch (err) {
        console.log(`FAIL  ${scene.name} @ ${size.label} — import threw: ${err.message}`);
        failures++;
        continue;
      }

      let stage;
      try {
        stage = scene.mount(mod, canvas);
      } catch (err) {
        console.log(`FAIL  ${scene.name} @ ${size.label} — mount threw: ${err.message}`);
        failures++;
        continue;
      }

      try {
        for (let i = 0; i < 240; i++) dom.step(16.7);
      } catch (err) {
        console.log(`FAIL  ${scene.name} @ ${size.label} — frame threw: ${err.message}`);
        failures++;
        continue;
      }

      const rec = canvas._rec;
      const problems = [];
      if (rec.bad.length) problems.push(`${rec.bad.length} non-finite values (${[...new Set(rec.bad)].slice(0, 3).join("; ")})`);
      if (rec.drawOps === 0) problems.push("no drawing calls issued");
      if (canvas.width !== Math.round(size.width * Math.min(size.dpr, 2))) {
        problems.push(`backing width ${canvas.width}, expected ${Math.round(size.width * Math.min(size.dpr, 2))}`);
      }
      const e = rec.extremes;
      const slack = 6;
      if (e.maxX > size.width * slack || e.minX < -size.width * slack) {
        problems.push(`x range [${e.minX.toFixed(0)}, ${e.maxX.toFixed(0)}] far outside canvas`);
      }
      if (e.maxY > size.height * slack || e.minY < -size.height * slack) {
        problems.push(`y range [${e.minY.toFixed(0)}, ${e.maxY.toFixed(0)}] far outside canvas`);
      }

      if (problems.length) {
        console.log(`FAIL  ${scene.name} @ ${size.label}`);
        problems.forEach((p) => console.log(`        ${p}`));
        failures++;
      } else {
        console.log(
          `ok    ${scene.name} @ ${size.label} — ${rec.calls} ops, ${rec.drawOps} draws, ` +
            `x[${e.minX.toFixed(0)}, ${e.maxX.toFixed(0)}] y[${e.minY.toFixed(0)}, ${e.maxY.toFixed(0)}]`
        );
      }
      stage?.destroy?.();
    }
  }

  /* ---------- Regression: dt must never go negative ----------

     rAF hands the callback the time the frame began, which can predate the
     performance.now() captured when the frame was requested. That produced a
     negative dt, a phase accumulator that dipped below zero, and an array
     index of -1 — which in JavaScript reads past the start of the array
     rather than throwing, so the symptom was an undefined lookup three call
     frames away. Cheap to assert, expensive to rediscover. */
  {
    const dom = installDom({ width: 800, height: 400, dpr: 1 });
    const canvas = dom.makeCanvas(800, 400);
    const { Stage } = await import("../public/assets/js/systems/stage.js?dt=" + Math.random());
    const seen = [];
    const stage = new Stage(canvas, { update: (dt) => seen.push(dt), draw: () => {} });
    stage.start();
    stage._last = 1000;
    stage._tick(900); // frame timestamp 100 ms BEFORE the loop was primed
    stage._tick(916);
    const negative = seen.filter((d) => d < 0);
    if (negative.length) {
      console.log(`
FAIL  Stage produced a negative dt: ${negative.join(", ")}`);
      failures++;
    } else {
      console.log(`
ok    Stage clamps a backwards frame timestamp (dt = ${seen.map((d) => d.toFixed(4)).join(", ")})`);
    }
    stage.destroy();
  }

  console.log(failures === 0 ? "\nAll scenes clean." : `\n${failures} failing scene/size combinations.`);
  process.exit(failures === 0 ? 0 : 1);
}

run();
