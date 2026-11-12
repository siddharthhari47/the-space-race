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
    this.texts = [];
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
    clip: noop, setLineDash: noop,
    // A monospace face is 0.6 em per character, so the width of a label can be
    // estimated well enough to test label layout. Other fonts keep the old
    // fixed width.
    measureText: (str) => {
      const m = /(\d+(?:\.\d+)?)px "JetBrains Mono"/.exec(ctx.font || "");
      return { width: m ? String(str).length * Number(m[1]) * 0.6 : 10 };
    },
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
    ctx[m] = (...args) => {
      rec.note(m, args);
      if (m === "fillText") {
        const size = Number((/(\d+(?:\.\d+)?)px/.exec(ctx.font || "") || [])[1]) || 10;
        rec.texts.push({ str: String(args[0]), x: args[1], y: args[2], align: ctx.textAlign, base: ctx.textBaseline, size, width: ctx.measureText(args[0]).width });
      }
    };
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
        // The wing challenge rewrote mountPolar to plot measured curves handed in by the
        // page (pages/wind-tunnel.js), so the harness supplies a small synthetic curve
        // and one saved trial in the same shape rather than a wing to evaluate.
        m.mountPolar(canvas, {
          getEvaluation: () => ({ alpha: 12, cl: 1.1, cd: 0.02 }),
          getCurve: () => Array.from({ length: 21 }, (_, i) => ({ alpha: i - 4, cl: 0.1 * (i - 4), cd: 0.008 + 0.0002 * (i - 4) ** 2 })),
          getTrials: () => [{ slot: "A", curve: [{ alpha: -4, cl: -0.3, cd: 0.01 }, { alpha: 16, cl: 1.4, cd: 0.06 }], result: { alpha: 8, cl: 0.9, cd: 0.02 } }],
          getTarget: () => 0.9,
          getState: () => ({ alpha: 12 }),
        }).stage,
    },
    {
      name: "rocket-lab (idle)",
      module: "../public/assets/js/experiences/rocket-lab.js",
      mount: (m, canvas) => m.mountRocketLab(canvas, { getState: () => ({ result: null, index: 0, phase: "idle" }) }).stage,
    },
    {
      name: "vn-diagram (transport)",
      module: "../public/assets/js/experiences/vn-diagram.js",
      mount: (m, canvas) =>
        m.mountVnDiagram(canvas, {
          getState: () => ({ wingLoading: 3500, clMax: 1.3, clMaxNeg: 0.7, nPos: 3.7, nNeg: -1.4, vC: 250, vD: 325 }),
        }).stage,
    },
    {
      // The HF-24 Marut example: high positive limit, deeply negative limit,
      // and a corner speed well out past where the transport case sits —
      // exercises a different part of the plotted range.
      name: "vn-diagram (fighter, HF-24 Marut)",
      module: "../public/assets/js/experiences/vn-diagram.js",
      mount: (m, canvas) =>
        m.mountVnDiagram(canvas, {
          getState: () => ({ wingLoading: 3500, clMax: 1.3, clMaxNeg: 0.7, nPos: 9.34, nNeg: -5, vC: 250, vD: 325 }),
        }).stage,
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
    // The Mars window canvas in each state the page can put it in. The state
    // is built from the same physics module the page runs, so a change to
    // the flight model that produced a NaN would show up here.
    ...(() => {
      const mk = async () => await import("../public/assets/js/systems/transfer.js");
      const states = {
        "aim": (T, w) => ({ world: w, day: 40, mode: "aim", flight: null, showHint: false }),
        "aim with hint": (T, w) => ({ world: w, day: 90, mode: "aim", flight: null, showHint: true }),
        "mid-flight": (T, w) => ({ world: w, day: 130, mode: "fly", flight: T.flyby(w, 0), showHint: true }),
        "arrived, missed": (T, w) => { const f = T.flyby(w, 0); return { world: w, day: f.arriveDay, mode: "result", flight: f, showHint: true }; },
        "arrived, hit": (T, w) => { const f = T.flyby(w, 121); return { world: w, day: f.arriveDay, mode: "result", flight: f, showHint: true }; },
        "fast-forward": (T, w) => ({ world: w, day: 600, mode: "ff", flight: null, showHint: true }),
      };
      return Object.entries(states).map(([label, build]) => ({
        name: `mars-window (${label})`,
        module: "../public/assets/js/experiences/mars-window.js",
        mount: async (m, canvas) => {
          const T = await mk();
          const w = T.makeWorld({ startLeadDeg: 100 });
          const st = build(T, w);
          return m.mountMarsWindow(canvas, { getState: () => st }).stage;
        },
      }));
    })(),
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
        stage = await scene.mount(mod, canvas);
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

  /* ---------- Mars window: result labels must not overprint ----------

     On a phone the canvas is about 358 px wide and Mars can sit near an edge.
     The "Mars on arrival" name and the hit or miss figure once drew on top of
     each other there. This runs the result view for both starting angles over
     a spread of launch days, estimates each label's box from its monospace
     width, and fails on any overlap or any box outside the canvas. */
  {
    const T = await import("../public/assets/js/systems/transfer.js");
    const boxOf = (t) => {
      const left = t.align === "center" ? t.x - t.width / 2 : t.align === "right" ? t.x - t.width : t.x;
      const top = t.base === "middle" ? t.y - t.size / 2 : t.base === "top" ? t.y : t.y - t.size;
      return { left, right: left + t.width, top, bottom: top + t.size, str: t.str };
    };
    let bad = 0;
    let runs = 0;
    for (const side of [358, 600]) {
      for (const startLeadDeg of [100, 20]) {
        const w = T.makeWorld({ startLeadDeg });
        const days = [0, 60, 121, 200, 300, 400, 500, 600, 727, 780, 800];
        for (const launchDay of days) {
          const dom = installDom({ width: side, height: side, dpr: 1 });
          const canvas = dom.makeCanvas(side, side);
          const mod = await import("../public/assets/js/experiences/mars-window.js?lbl=" + Math.random());
          const f = T.flyby(w, launchDay);
          const st = { world: w, day: f.arriveDay, mode: "result", flight: f, showHint: true };
          const stage = mod.mountMarsWindow(canvas, { getState: () => st }).stage;
          for (let i = 0; i < 3; i++) dom.step(16.7);
          // Only the last frame's labels.
          const before = canvas._rec.texts.length;
          dom.step(16.7);
          const frame = canvas._rec.texts.slice(before).map(boxOf);
          if (frame.length === 0) { console.log(`FAIL  mars-window labels: no text drawn @ ${side}px`); bad++; }
          runs++;
          for (let i = 0; i < frame.length; i++) {
            const a = frame[i];
            if (a.left < 0 || a.top < 0 || a.right > side || a.bottom > side) {
              console.log(`FAIL  mars-window labels @ ${side}px, ${startLeadDeg} deg start, launch day ${launchDay}: "${a.str}" leaves the canvas`);
              bad++;
            }
            for (let j = i + 1; j < frame.length; j++) {
              const b = frame[j];
              if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) {
                console.log(`FAIL  mars-window labels @ ${side}px, ${startLeadDeg} deg start, launch day ${launchDay}: "${a.str}" overlaps "${b.str}"`);
                bad++;
              }
            }
          }
          stage?.destroy?.();
        }
      }
    }
    if (bad) failures += bad;
    else console.log(`ok    mars-window result labels: no overlaps or clipping across ${runs} layouts`);
  }

  console.log(failures === 0 ? "\nAll scenes clean." : `\n${failures} failing scene/size combinations.`);
  process.exit(failures === 0 ? 0 : 1);
}

run();
