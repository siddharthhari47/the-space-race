// Stage — the canvas engine every visual on this site runs on.
//
// Written because the alternative was fifteen copies of the same forty lines
// of devicePixelRatio maths, resize handling and requestAnimationFrame
// bookkeeping, each subtly different and each with its own bug. One engine,
// one place to fix things.
//
// What it guarantees to anything drawing on top of it:
//
//   * The context is already scaled to CSS pixels. Draw at `stage.width`
//     and `stage.height` and it looks right on a Retina display without
//     thinking about it.
//   * The loop stops when nobody is looking. Off-screen (IntersectionObserver)
//     or backgrounded tab (visibilitychange) both halt the rAF loop entirely
//     rather than burning battery animating pixels no one sees. This matters
//     more than it sounds: the homepage alone would otherwise run three
//     independent loops forever.
//   * `prefers-reduced-motion` is honoured properly, which means drawing one
//     representative frame and stopping — not freezing on frame zero, where
//     most of these scenes look like an empty box.
//   * `dt` is capped. Tab-out for thirty seconds and the first frame back
//     would otherwise arrive with dt=30000ms and fling every simulation into
//     the void.
//
// Usage:
//   const stage = new Stage(canvasEl, {
//     draw: (ctx, s) => { ... },       // called each frame
//     update: (dt, s) => { ... },      // optional, physics before draw
//     staticFrameTime: 3,              // seconds to fast-forward when reduced-motion
//   });
//   stage.start();

const MAX_DT = 1 / 20; // seconds. Below 20fps we lie about dt rather than explode.
const MAX_DPR = 2; // Beyond 2x the pixel cost stops buying visible quality.

export const prefersReducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export class Stage {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: options.alpha !== false });
    this.draw = options.draw || (() => {});
    this.update = options.update || (() => {});
    this.onResize = options.onResize || null;
    this.staticFrameTime = options.staticFrameTime ?? 2;

    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.time = 0; // seconds since start, excluding paused time
    this.frame = 0;
    this.running = false;
    this.visible = true;
    this.pageVisible = !document.hidden;

    this._raf = 0;
    this._last = 0;
    this._boundTick = this._tick.bind(this);

    this._observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          this.visible = entry.isIntersecting;
        }
        this._sync();
      },
      { rootMargin: "120px" }
    );
    this._observer.observe(canvas);

    this._onVisibility = () => {
      this.pageVisible = !document.hidden;
      this._sync();
    };
    document.addEventListener("visibilitychange", this._onVisibility);

    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(canvas);

    // Belt and braces. A canvas constructed before layout settles — web
    // fonts still loading, an ancestor still display:none, a tab restored
    // from bfcache — measures 0x0, and resize() correctly refuses to
    // allocate a zero-sized backing store. If the only thing that would
    // ever call it again is ResizeObserver and that never fires, the canvas
    // is stuck at the default 300x150 for the life of the page, drawing a
    // scene nobody can see. The per-frame check in _tick() is the real
    // fix; this listener covers the paused case.
    this._onWindowResize = () => this.resize();
    window.addEventListener("resize", this._onWindowResize);

    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    // A canvas inside a display:none ancestor reports 0x0. Keep the last good
    // size rather than reallocating a zero-sized backing store, which throws
    // away the context state on some browsers.
    if (rect.width === 0 || rect.height === 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (w === this.width && h === this.height && dpr === this.dpr) return;

    this.width = w;
    this.height = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (this.onResize) this.onResize(this);
    if (!this.running) this.renderOnce();
  }

  start() {
    if (this.running) return;

    if (prefersReducedMotion) {
      // Fast-forward to a frame where the scene actually reads as something,
      // then stop. Stepping in slices keeps any integrator stable rather than
      // handing it one enormous dt.
      const step = 1 / 30;
      for (let t = 0; t < this.staticFrameTime; t += step) {
        this.time += step;
        this.update(step, this);
      }
      this.renderOnce();
      return;
    }

    this.running = true;
    this._last = performance.now();
    this._sync();
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  // Draw a single frame without starting the loop. Used for the static
  // reduced-motion frame and after a resize while paused.
  renderOnce() {
    if (this.width === 0) return;
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.draw(this.ctx, this);
  }

  _sync() {
    const shouldRun = this.running && this.visible && this.pageVisible;
    if (shouldRun && !this._raf) {
      this._last = performance.now();
      this._raf = requestAnimationFrame(this._boundTick);
    } else if (!shouldRun && this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = 0;
    }
  }

  _tick(now) {
    this._raf = requestAnimationFrame(this._boundTick);

    // Cheap self-heal: one getBoundingClientRect per frame on one element
    // costs nothing measurable, and it means the canvas cannot stay
    // mis-sized no matter which observer failed to tell us.
    if (this.width === 0) this.resize();

    const dt = Math.min((now - this._last) / 1000, MAX_DT);
    this._last = now;
    this.time += dt;
    this.frame++;
    this.update(dt, this);
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.draw(this.ctx, this);
  }

  destroy() {
    this.stop();
    this._observer.disconnect();
    this._resizeObserver.disconnect();
    window.removeEventListener("resize", this._onWindowResize);
    document.removeEventListener("visibilitychange", this._onVisibility);
  }
}

/* ---------- Small shared maths ---------- */

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a);

// Frame-rate independent exponential approach. `smoothing` is the fraction
// of the remaining distance left after one second, so 0.001 is fast and
// 0.5 is slow, and both behave identically at 30fps and 144fps.
export const approach = (current, target, smoothing, dt) =>
  target + (current - target) * Math.pow(smoothing, dt);

// Deterministic pseudo-random. Scenes need stars and particles that stay put
// across resizes and reloads; Math.random() reshuffles them every frame the
// layout changes, which reads as flicker.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- Pointer helper ---------- */

// Normalises mouse and touch into one stream of {x, y} in CSS pixels
// relative to the element, plus a down/up/drag lifecycle. Every draggable
// thing on the site goes through this so touch support is never an
// afterthought that gets forgotten on one widget.
export function attachPointer(el, handlers = {}) {
  let dragging = false;

  const local = (event) => {
    const rect = el.getBoundingClientRect();
    const src = event.touches ? event.touches[0] : event;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  };

  const down = (event) => {
    dragging = true;
    if (handlers.onDown) handlers.onDown(local(event), event);
    if (event.cancelable && handlers.preventDefault !== false) event.preventDefault();
  };

  const move = (event) => {
    const p = local(event);
    if (handlers.onMove) handlers.onMove(p, dragging, event);
    if (dragging) {
      if (handlers.onDrag) handlers.onDrag(p, event);
      if (event.cancelable && handlers.preventDefault !== false) event.preventDefault();
    }
  };

  const up = (event) => {
    if (!dragging) return;
    dragging = false;
    if (handlers.onUp) handlers.onUp(event);
  };

  el.addEventListener("mousedown", down);
  el.addEventListener("touchstart", down, { passive: false });
  window.addEventListener("mousemove", move);
  window.addEventListener("touchmove", move, { passive: false });
  window.addEventListener("mouseup", up);
  window.addEventListener("touchend", up);
  el.addEventListener("mouseleave", () => {
    if (handlers.onLeave) handlers.onLeave();
  });

  return () => {
    el.removeEventListener("mousedown", down);
    el.removeEventListener("touchstart", down);
    window.removeEventListener("mousemove", move);
    window.removeEventListener("touchmove", move);
    window.removeEventListener("mouseup", up);
    window.removeEventListener("touchend", up);
  };
}
