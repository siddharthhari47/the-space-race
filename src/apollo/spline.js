// Cubic Hermite through a table of keyframes, with finite-difference
// tangents. No three.js, no DOM.
//
// shots.js grew its own copy of this first and still has it. This is not
// that copy refactored out — it is a second implementation with the same
// algorithm, written so the flight profile could use it without editing a
// file that had already been measured and signed off. The checks assert
// that the two agree on the shot table to fifteen digits, which is worth
// more than the deduplication would have been: if either drifts, the
// comparison fails.
//
// Why Hermite rather than an ease between neighbouring pairs, at length,
// is in shots.js. The short version: smootherstep between each pair has
// zero derivative at both ends, so the value comes to a dead stop at every
// keyframe and starts again, and a curve with ten keyframes lurches ten
// times. Hermite passes through every keyframe exactly but arrives already
// moving and leaves at the same speed.

/**
 * @param {number[]} knots      strictly increasing parameter values
 * @param {Record<string, number[]>} values  one array per field, same length
 * @returns {(x: number) => Record<string, number>}
 */
export function makeSpline(knots, values) {
  const n = knots.length;
  if (n < 2) throw new Error("a spline needs at least two knots");
  for (let i = 1; i < n; i++) {
    if (!(knots[i] > knots[i - 1])) throw new Error("spline knots must increase");
  }

  const fields = Object.keys(values);
  for (const f of fields) {
    if (values[f].length !== n) throw new Error(`field ${f} has the wrong length`);
  }

  // One tangent per knot per field, in value-per-unit-x. Interior knots use
  // a central difference over the two neighbouring spans; the ends use the
  // one span they have, so the curve is already moving at x = knots[0]
  // rather than easing out of a dead spot.
  const tangents = {};
  for (const f of fields) {
    const v = values[f];
    const m = new Array(n);
    for (let i = 0; i < n; i++) {
      if (i === 0) m[i] = (v[1] - v[0]) / (knots[1] - knots[0]);
      else if (i === n - 1) m[i] = (v[n - 1] - v[n - 2]) / (knots[n - 1] - knots[n - 2]);
      else m[i] = (v[i + 1] - v[i - 1]) / (knots[i + 1] - knots[i - 1]);
    }
    tangents[f] = m;
  }

  return function sample(x) {
    const lo = knots[0];
    const hi = knots[n - 1];
    const c = x < lo ? lo : x > hi ? hi : x;

    let i = 0;
    while (i < n - 2 && c >= knots[i + 1]) i++;

    const h = knots[i + 1] - knots[i];
    const t = h > 0 ? (c - knots[i]) / h : 0;
    const t2 = t * t;
    const t3 = t2 * t;

    const b0 = 2 * t3 - 3 * t2 + 1;
    const b1 = (t3 - 2 * t2 + t) * h;
    const b2 = -2 * t3 + 3 * t2;
    const b3 = (t3 - t2) * h;

    const out = {};
    for (const f of fields) {
      out[f] = b0 * values[f][i] + b1 * tangents[f][i] + b2 * values[f][i + 1] + b3 * tangents[f][i + 1];
    }
    return out;
  };
}

/**
 * A single-field spline, returned as a plain function of x. Convenience for
 * the many curves in the flight profile that carry one number.
 */
export function makeCurve(points) {
  const knots = points.map((q) => q[0]);
  const sample = makeSpline(knots, { v: points.map((q) => q[1]) });
  return (x) => sample(x).v;
}

/**
 * Monotone piecewise-linear interpolation. Used where a curve must not
 * overshoot under any circumstances — mission time against page progress,
 * where an overshoot would run the clock backwards, and the throttle ramps,
 * where an overshoot would mean negative thrust or more than full thrust.
 * Hermite is the right tool for a camera move and the wrong one here.
 */
export function makeRamp(points) {
  const xs = points.map((q) => q[0]);
  const ys = points.map((q) => q[1]);
  for (let i = 1; i < xs.length; i++) {
    if (!(xs[i] > xs[i - 1])) throw new Error("ramp points must increase in x");
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    const n = xs.length;
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x >= xs[i + 1]) i++;
    const t = (x - xs[i]) / (xs[i + 1] - xs[i]);
    return ys[i] + (ys[i + 1] - ys[i]) * t;
  };
}
