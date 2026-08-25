// What the camera actually puts on the screen, without a browser.
//
// The shot list is authored as positions and angles, which is the right way
// to write it and the wrong way to judge it. The questions that matter are
// about the picture: how big is the Earth, where is it, which way is the
// surface sliding, and does any of that change abruptly. Answering those in
// a browser costs a build, a reload and a round trip each time, which is
// slow enough that you stop asking.
//
// So this reimplements the two things three.js does between a shot and a
// pixel -- lookAt and an off-axis perspective divide -- and reports the
// picture directly. It is a diagnostic, not a test; the assertions that
// come out of it live in apollo-mission-check.mjs.
//
//   node tools/apollo-framing.mjs            table for the current shot list
//   node tools/apollo-framing.mjs --drift    surface drift, in detail
//
// The off-axis part is the only subtle bit. setViewOffset(w, h, -ox*w,
// -oy*h, w, h) shifts the frustum without resizing it, and working through
// three.js's makePerspective that comes out as a pure translation in
// clip space: ndc.x += 2*ox, ndc.y -= 2*oy. Positive ox moves the image
// right, positive oy moves it down, which is how the planet is held in the
// bottom-right corner without swinging the camera off its target.

import { SHOTS, shotAt, shotToCamera } from "../src/apollo/shots.js";
import { EARTH_RADIUS_KM } from "../src/apollo/earth.js";

const R = EARTH_RADIUS_KM;
const ASPECT = 1440 / 900;

/* ---------- vector scratch, plain arrays, no dependency ---------- */

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/* ---------- shot -> screen ---------- */

// The camera basis three.js builds from position, target and up. z points
// back towards the camera, which is the convention lookAt uses.
export function cameraBasis(shot) {
  const rig = shotToCamera(shot, R);
  const z = norm(sub(rig.position, rig.target));
  const x = norm(cross(rig.up, z));
  const y = cross(z, x);
  return { eye: rig.position, x, y, z, fovDeg: rig.fovDeg, offsetX: rig.offsetX, offsetY: rig.offsetY };
}

// World point to normalised device coordinates. Returns null for anything
// behind the camera, where the perspective divide is meaningless.
export function project(basis, world, aspect = ASPECT) {
  const v = sub(world, basis.eye);
  const cz = dot(v, basis.z);
  if (cz >= -1e-9) return null; // in front of the camera means negative z
  const cx = dot(v, basis.x);
  const cy = dot(v, basis.y);
  const t = Math.tan((basis.fovDeg * Math.PI) / 360);
  return {
    x: cx / (-cz * t * aspect) + 2 * basis.offsetX,
    y: cy / (-cz * t) - 2 * basis.offsetY,
    depth: -cz,
  };
}

// Where the planet sits in the frame, and how much of it there is.
//
// The obvious way to do this is to project the silhouette circle and take a
// bounding box. That works only while the planet is a disc floating in the
// frame. Close in it is worse than useless: at the opening altitude the
// silhouette has an angular radius of forty-two degrees, so most of that
// circle is beside and behind the camera, and the projected coordinates run
// off to infinity. It reported a disc seven NDC across covering thirty-nine
// per cent of a frame two NDC wide, which is not a slightly wrong answer,
// it is an answer about nothing.
//
// So this fires a ray per sample point instead and asks whether it hits.
// That is the same question the renderer answers, it holds at every
// distance, and it gives the two numbers that actually describe the
// composition: how much of the frame is planet, and where in the frame that
// planet is.
// A ray test against the planet for one point of the frame, plus the two
// questions that follow from it: where does the planet's edge cross a given
// column, and a given row. Those are the numbers you compose with. "The
// horizon is a third of the way up" is a thing you can look at and agree or
// disagree with; "altitude 51,568 km, aim 0.9" is not.
//
// Because the lens shift is a pure translation in clip space, an edge
// measured with the shift zeroed can be moved anywhere by arithmetic:
// top edge y ends up at y0 - 2*offsetY, left edge x at x0 + 2*offsetX. So
// the whole framing problem inverts in closed form instead of needing a
// search.
export function frameProbe(shot, aspect = ASPECT) {
  const basis = cameraBasis(shot);
  const t = Math.tan((basis.fovDeg * Math.PI) / 360);
  const c = dot(basis.eye, basis.eye) - R * R;

  const hits = (ndcX, ndcY) => {
    const cx = (ndcX - 2 * basis.offsetX) * t * aspect;
    const cy = (ndcY + 2 * basis.offsetY) * t;
    const dir = norm(add(add(scale(basis.x, cx), scale(basis.y, cy)), scale(basis.z, -1)));
    const b = dot(dir, basis.eye);
    const disc = b * b - c;
    return disc >= 0 && -b - Math.sqrt(disc) > 0;
  };

  // Where the planet's edge crosses one column of the frame, and one row.
  //
  // Coarse scan first, then bisect outwards from a point known to be on the
  // planet. Bisecting from a fixed bracket instead is the obvious shortcut
  // and it is wrong: it assumes the planet reaches the bottom of the column,
  // which holds while it overflows the frame and stops holding the moment it
  // becomes a disc floating in the middle of one. That is precisely the part
  // of the page this tool exists to fix, so it would have been blind exactly
  // where it was needed.
  //
  // The scan runs well outside the viewport, because an edge at y = -1.4 --
  // off the bottom, invisible -- is a different composition from an edge at
  // y = -1.0, and the difference is the whole question of whether the planet
  // has left.
  const RANGE = 8;
  const span = (at) => {
    const N = 400;
    let lo = null, hi = null;
    for (let i = 0; i <= N; i++) {
      const v = -RANGE + (2 * RANGE * i) / N;
      if (!at(v)) continue;
      if (lo === null) lo = v;
      hi = v;
    }
    if (lo === null) return null;
    const step = (2 * RANGE) / N;
    // refine each end: one side of the bracket is on the planet, one is not
    const edge = (inside, outside) => {
      let a = inside, b = outside;
      for (let i = 0; i < 50; i++) {
        const m = (a + b) / 2;
        if (at(m)) a = m; else b = m;
      }
      return a;
    };
    return { lo: edge(lo, lo - step), hi: edge(hi, hi + step) };
  };

  // Top of the planet in a column, and its left side in a row. Null when the
  // planet is nowhere near that column or row at all.
  const topEdgeAt = (ndcX) => span((y) => hits(ndcX, y))?.hi ?? null;
  const bottomEdgeAt = (ndcX) => span((y) => hits(ndcX, y))?.lo ?? null;
  const leftEdgeAt = (ndcY) => span((x) => hits(x, ndcY))?.lo ?? null;
  const rightEdgeAt = (ndcY) => span((x) => hits(x, ndcY))?.hi ?? null;

  return { hits, span, topEdgeAt, bottomEdgeAt, leftEdgeAt, rightEdgeAt };
}

export function discOnScreen(shot, aspect = ASPECT) {
  const basis = cameraBasis(shot);
  const d = len(basis.eye);
  if (d <= R) return null;

  const t = Math.tan((basis.fovDeg * Math.PI) / 360);
  const rayFor = (ndcX, ndcY) => {
    // undo the lens shift to recover the direction this sample looks along
    const cx = (ndcX - 2 * basis.offsetX) * t * aspect;
    const cy = (ndcY + 2 * basis.offsetY) * t;
    return norm(add(add(scale(basis.x, cx), scale(basis.y, cy)), scale(basis.z, -1)));
  };
  const hits = (dir) => {
    const b = dot(dir, basis.eye);
    const c = dot(basis.eye, basis.eye) - R * R;
    const disc = b * b - c;
    return disc >= 0 && -b - Math.sqrt(disc) > 0;
  };

  const GX = 192, GY = 120;
  let hit = 0, sx = 0, sy = 0;
  for (let iy = 0; iy < GY; iy++) {
    const ndcY = ((iy + 0.5) / GY) * 2 - 1;
    for (let ix = 0; ix < GX; ix++) {
      const ndcX = ((ix + 0.5) / GX) * 2 - 1;
      if (!hits(rayFor(ndcX, ndcY))) continue;
      hit++; sx += ndcX; sy += ndcY;
    }
  }
  const cover = hit / (GX * GY);

  // Which edges of the frame it is still spilling over. This is the
  // difference between a planet that bleeds past the viewport, which is what
  // the opening wants, and one sitting neatly inside it like a marble.
  const edge = { left: false, right: false, top: false, bottom: false };
  for (let i = 0; i <= 200; i++) {
    const u = (i / 200) * 2 - 1;
    if (hits(rayFor(-1, u))) edge.left = true;
    if (hits(rayFor(1, u))) edge.right = true;
    if (hits(rayFor(u, 1))) edge.top = true;
    if (hits(rayFor(u, -1))) edge.bottom = true;
  }

  const centre = project(basis, [0, 0, 0], aspect);
  return {
    // true apparent size, valid at every distance
    angularRadiusDeg: (Math.asin(R / d) * 180) / Math.PI,
    halfFovDeg: basis.fovDeg / 2,
    centre: centre ? { x: centre.x, y: centre.y } : null,
    // centre of mass of the lit part of the frame -- where the eye goes
    centroid: hit ? { x: sx / hit, y: sy / hit } : null,
    coverage: cover,
    edge,
    edges: (edge.left ? "L" : "-") + (edge.right ? "R" : "-") + (edge.top ? "T" : "-") + (edge.bottom ? "B" : "-"),
    inFrame: hit > 0,
    altitudeKm: d - R,
  };
}

/* ---------- which way the surface is sliding ---------- */

// A spread of points over the sphere, so the answer is not an artefact of
// where one happened to land. Six thousand of them because only the ones
// inside the frame count, and at the opening framing the frame holds a
// narrow band of a very close planet: at two hundred probes there were
// fewer than a dozen usable ones and the fit refused to run at all for the
// first half of the page.
const PROBE_COUNT = 6000;
const PROBES = (() => {
  const out = [];
  for (let i = 0; i < PROBE_COUNT; i++) {
    // Fibonacci sphere, which spaces them evenly without clumping at a pole
    const y = 1 - (2 * i + 1) / PROBE_COUNT;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = i * Math.PI * (3 - Math.sqrt(5));
    out.push([Math.cos(th) * r * R, y * R, Math.sin(th) * r * R]);
  }
  return out;
})();

const spun = (pt, ang) => {
  const c = Math.cos(ang), s = Math.sin(ang);
  return [pt[0] * c + pt[2] * s, pt[1], -pt[0] * s + pt[2] * c];
};

// How the visible surface moves, split into the parts the eye reads
// separately.
//
// The first version of this averaged the sideways movement of the visible
// points and called that the drift. It is the same mistake as last time,
// wearing a different hat. Pulling the camera back makes every point on the
// planet slide towards the middle of the disc, and when the middle of the
// disc is off the bottom of the frame -- which it is for most of this page
// -- the visible half of that contraction is all going one way. The average
// picks it up as sideways motion and reports the planet turning backwards.
// Nobody sees a planet turning backwards. They see it getting further away,
// which is what it is doing.
//
// So fit the displacement field instead:
//
//     d_i = a + S (p_i - c)
//
// with c the centre of the disc. Retreat is exactly the S = kI term and
// lands entirely in "zoom", contributing nothing to a. Roll is the
// antisymmetric part of S. What is left in a is bodily movement of the
// planet across the frame, which is the thing worth comparing against the
// spin, because the spin's own flow near the middle of the disc is bodily
// movement too.
//
// Three parameters per output component, ordinary least squares, closed
// form. The planet is a sphere and its flow is not affine, so this is a fit
// and not an identity; the residual is reported so it is possible to tell
// when the fit has stopped meaning anything.
export function flowFit(shotA, angA, shotB, angB, aspect = ASPECT) {
  const bA = cameraBasis(shotA);
  const bB = cameraBasis(shotB);
  const cProj = project(bA, [0, 0, 0], aspect);
  const cx = cProj ? cProj.x : 0;
  const cy = cProj ? cProj.y : 0;

  const U = [], V = [], DX = [], DY = [];
  for (const q of PROBES) {
    const wA = spun(q, angA);
    const wB = spun(q, angB);
    if (dot(norm(wA), norm(sub(bA.eye, wA))) < 0.2) continue;
    if (dot(norm(wB), norm(sub(bB.eye, wB))) < 0.2) continue;
    const sA = project(bA, wA, aspect);
    const sB = project(bB, wB, aspect);
    if (!sA || !sB) continue;
    // On screen at both ends. Points outside the viewport are not part of
    // the picture, and including them lets the strongly nonlinear part of
    // the projection -- which is all outside the frame when the planet is
    // close -- dominate a fit meant to describe what is inside it.
    if (Math.abs(sA.x) > 1 || Math.abs(sA.y) > 1) continue;
    if (Math.abs(sB.x) > 1 || Math.abs(sB.y) > 1) continue;
    U.push(sA.x - cx); V.push(sA.y - cy);
    DX.push(sB.x - sA.x); DY.push(sB.y - sA.y);
  }
  const n = U.length;
  if (n < 12) return null;

  // normal equations for [const, u, v] against one right-hand side
  const solve3 = (RHS) => {
    let Suu = 0, Svv = 0, Suv = 0, Su = 0, Sv = 0, Sr = 0, Sur = 0, Svr = 0;
    for (let i = 0; i < n; i++) {
      Suu += U[i] * U[i]; Svv += V[i] * V[i]; Suv += U[i] * V[i];
      Su += U[i]; Sv += V[i]; Sr += RHS[i];
      Sur += U[i] * RHS[i]; Svr += V[i] * RHS[i];
    }
    const M = [[n, Su, Sv], [Su, Suu, Suv], [Sv, Suv, Svv]];
    const y = [Sr, Sur, Svr];
    // Gaussian elimination, 3x3, with partial pivoting
    for (let k = 0; k < 3; k++) {
      let piv = k;
      for (let r = k + 1; r < 3; r++) if (Math.abs(M[r][k]) > Math.abs(M[piv][k])) piv = r;
      if (Math.abs(M[piv][k]) < 1e-12) return null;
      [M[k], M[piv]] = [M[piv], M[k]];
      [y[k], y[piv]] = [y[piv], y[k]];
      for (let r = k + 1; r < 3; r++) {
        const f = M[r][k] / M[k][k];
        for (let c2 = k; c2 < 3; c2++) M[r][c2] -= f * M[k][c2];
        y[r] -= f * y[k];
      }
    }
    const out = [0, 0, 0];
    for (let k = 2; k >= 0; k--) {
      let acc = y[k];
      for (let c2 = k + 1; c2 < 3; c2++) acc -= M[k][c2] * out[c2];
      out[k] = acc / M[k][k];
    }
    return out;
  };

  const fx = solve3(DX);
  const fy = solve3(DY);
  if (!fx || !fy) return null;

  let res = 0;
  for (let i = 0; i < n; i++) {
    const ex = fx[0] + fx[1] * U[i] + fx[2] * V[i] - DX[i];
    const ey = fy[0] + fy[1] * U[i] + fy[2] * V[i] - DY[i];
    res += ex * ex + ey * ey;
  }

  return {
    panX: fx[0],
    panY: fy[0],
    zoom: (fx[1] + fy[2]) / 2,
    rollRad: (fy[1] - fx[2]) / 2,
    residual: Math.sqrt(res / n),
    n,
  };
}

// Bodily movement of the planet across the frame caused by scrolling, with
// the clock stopped.
export function scrollDrift(p, dp = 0.01) {
  const a = Math.max(0, p - dp / 2), b = Math.min(1, p + dp / 2);
  const f = flowFit(shotAt(a), 0, shotAt(b), 0);
  if (!f) return null;
  const k = 1 / (b - a);
  return { dx: f.panX * k, dy: f.panY * k, zoom: f.zoom * k, roll: f.rollRad * k, res: f.residual * k, n: f.n };
}

// The same, caused by the planet turning, with the page still.
export function spinDrift(p, dAngDeg = 1) {
  const sh = shotAt(p);
  const f = flowFit(sh, 0, sh, (dAngDeg * Math.PI) / 180);
  if (!f) return null;
  return { dx: f.panX / dAngDeg, dy: f.panY / dAngDeg, zoom: f.zoom / dAngDeg, roll: f.rollRad / dAngDeg, res: f.residual / dAngDeg, n: f.n };
}

/* ---------- report ---------- */

const argv = process.argv.slice(2);
const fmt = (v, w = 7, dp = 3) => (v === null || v === undefined ? "--".padStart(w) : v.toFixed(dp).padStart(w));

// Only when run directly. Anything importing this wants the functions, not
// twenty-six lines of table on stdout.
if (!import.meta.main) {
  // nothing
} else if (argv.includes("--drift")) {
  console.log("\nSURFACE DRIFT  (pan is bodily movement, with zoom and roll taken out)\n");
  console.log("    p    scroll pan    zoom    roll  | spin pan   fit err | same way?");
  let flips = 0, prevSign = 0;
  for (let i = 0; i <= 40; i++) {
    const p = i / 40;
    const d = scrollDrift(p);
    const t = spinDrift(p);
    if (!d || !t) {
      console.log(`  ${p.toFixed(3)}   the planet is not in the frame`);
      continue;
    }
    const sign = Math.sign(d.dx);
    const flip = prevSign !== 0 && sign !== 0 && sign !== prevSign;
    if (flip) flips++;
    if (sign !== 0) prevSign = sign;
    const agree = Math.sign(d.dx) === Math.sign(t.dx) ? "yes" : "NO ";
    console.log(
      `  ${p.toFixed(3)} ${fmt(d.dx, 10)} ${fmt(d.zoom, 8, 2)} ${fmt(d.roll, 7, 3)}  |${fmt(t.dx, 9, 4)} ${fmt(d.res, 9, 3)} | ${agree}${flip ? "  <-- REVERSES" : ""}`
    );
  }
  console.log(`\n  scroll-driven pan changes direction ${flips} time(s)\n`);
} else {
  console.log("\nWHAT IS ON THE SCREEN  (1440x900, NDC: -1..1, centre 0)\n");
  console.log("    p      altKm    angR   centreX  centreY   cover  centroid x,y  edges  d(log d)/dp");
  const dist = (x) => shotAt(x).altitudeKm + R;
  for (let i = 0; i <= 25; i++) {
    const p = i / 25;
    const g = discOnScreen(shotAt(p));
    const e = 0.002;
    const a = Math.max(0, p - e), b = Math.min(1, p + e);
    const rate = Math.log(dist(b) / dist(a)) / (b - a);
    console.log(
      `  ${p.toFixed(3)} ${String(Math.round(g.altitudeKm)).padStart(8)} ${fmt(g.angularRadiusDeg, 6, 2)} ` +
        `${fmt(g.centre?.x, 8)} ${fmt(g.centre?.y, 8)} ${fmt(g.coverage, 7)}  ` +
        `${fmt(g.centroid?.x, 6, 2)},${fmt(g.centroid?.y, 5, 2)}  ${g.edges}  ${fmt(rate, 9, 2)}`
    );
  }
  console.log("\n  knots:", SHOTS.map((s) => s.p).join(", "), "\n");
}
