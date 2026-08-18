// Aerofoil geometry and coefficients.
//
// The section is a real NACA four-digit aerofoil, generated from the
// published equations rather than drawn by hand. That matters for more than
// tidiness: it means the camber and thickness controls change the shape the
// way they change a real wing, and the shape you see is the shape the
// coefficients below are describing.
//
// NACA MPXX, e.g. 2412: 2% camber, at 40% chord, 12% thick.
//
//   thickness   yt = 5t(0.2969*sqrt(x) - 0.1260x - 0.3516x^2
//                        + 0.2843x^3 - 0.1015x^4)
//   camber      yc = (m/p^2)(2px - x^2)                    for x < p
//               yc = (m/(1-p)^2)((1-2p) + 2px - x^2)       for x >= p
//
// The aerodynamics are lifting-line plus a stall model, which is the level
// of theory a first course actually uses:
//
//   * Lift-curve slope for a 2D section is 2*pi per radian. A real finite
//     wing is less, because the tip vortices reduce the effective angle the
//     section sees, and the correction a = a0/(1 + a0/(pi*e*AR)) is what
//     the aspect-ratio control is really moving.
//   * Induced drag CDi = CL^2/(pi*e*AR). This is the term that makes long
//     thin wings worth building, and it is why the aspect-ratio slider
//     changes the L/D far more than anything else on the panel.
//   * Past the stall the attached-flow theory stops being true, so the
//     model blends into flat-plate behaviour, CL = 2 sin(a) cos(a) and
//     CD = 2 sin^2(a). That is the standard Viterna-style treatment used
//     for post-stall data, and it produces the right shape: a peak, a
//     collapse, and then a slow recovery as the section becomes a barn door.
//
// What this is not: a flow solution. Nothing here solves for a pressure
// field. The streamlines drawn in the tunnel are a schematic driven by
// these coefficients, and the page says so.

const DEG = Math.PI / 180;

/** NACA four-digit surface, as upper and lower point arrays over unit chord. */
export function nacaProfile({ camber = 0.02, camberPos = 0.4, thickness = 0.12 }, n = 90) {
  const m = camber;
  const p = Math.max(0.05, camberPos);
  const t = thickness;

  const upper = [];
  const lower = [];

  for (let i = 0; i <= n; i++) {
    // Cosine spacing: clusters points at the leading edge, where curvature
    // is extreme and uniform spacing produces a visibly faceted nose.
    const beta = (i / n) * Math.PI;
    const x = (1 - Math.cos(beta)) / 2;

    const yt =
      5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1015 * x ** 4);

    let yc;
    let dyc;
    if (x < p) {
      yc = (m / (p * p)) * (2 * p * x - x * x);
      dyc = ((2 * m) / (p * p)) * (p - x);
    } else {
      yc = (m / ((1 - p) ** 2)) * (1 - 2 * p + 2 * p * x - x * x);
      dyc = ((2 * m) / ((1 - p) ** 2)) * (p - x);
    }

    const theta = Math.atan(dyc);
    upper.push({ x: x - yt * Math.sin(theta), y: yc + yt * Math.cos(theta) });
    lower.push({ x: x + yt * Math.sin(theta), y: yc - yt * Math.cos(theta) });
  }

  return { upper, lower };
}

/**
 * Lift and drag coefficients for a finite wing.
 *
 * @param {number} alphaDeg geometric angle of attack, degrees
 * @param {object} wing { camber, aspectRatio, oswald }
 */
export function coefficients(alphaDeg, { camber = 0.02, aspectRatio = 8, oswald = 0.8 } = {}) {
  const a = alphaDeg * DEG;

  // Zero-lift angle. A cambered section already makes lift at zero
  // geometric incidence, which is why it has to be pushed to a negative
  // angle before the lift goes away. Thin-aerofoil theory puts this at
  // roughly -2 degrees per percent of camber.
  const alpha0 = -camber * 100 * 1.8 * DEG;

  const a0 = 2 * Math.PI; // per radian, 2D section
  const aFinite = a0 / (1 + a0 / (Math.PI * oswald * aspectRatio));

  const clLinear = aFinite * (a - alpha0);

  // Stall angle falls a little as camber rises, and a higher-aspect-ratio
  // wing reaches its stall at a lower geometric angle because the section
  // is working harder at any given incidence.
  const clMax = 1.35 + camber * 6;
  const alphaStall = clMax / aFinite + alpha0;

  // Flat plate, for the post-stall blend.
  const clPlate = 2 * Math.sin(a) * Math.cos(a);
  const cdPlate = 2 * Math.sin(a) * Math.sin(a);

  let cl;
  let stalled = false;
  const over = Math.abs(a) - Math.abs(alphaStall);
  if (over <= 0) {
    cl = clLinear;
  } else {
    stalled = true;
    // Blend over about six degrees, so the collapse is sharp but not a
    // discontinuity — which is also how a real wing behaves.
    const blend = Math.min(1, over / (6 * DEG));
    cl = clLinear * (1 - blend) + clPlate * blend;
  }

  const cd0 = 0.009 + 0.006 * (camber / 0.02); // section profile drag
  const cdi = (cl * cl) / (Math.PI * oswald * aspectRatio);
  let cd = cd0 + cdi;
  if (stalled) {
    const blend = Math.min(1, over / (6 * DEG));
    cd = cd * (1 - blend) + (cdPlate + cd0) * blend;
  }

  return {
    cl,
    cd,
    ld: cd > 1e-6 ? cl / cd : 0,
    stalled,
    alphaStallDeg: alphaStall / DEG,
    clMax,
    liftSlopePerDeg: aFinite * DEG,
  };
}

/** Angle of attack giving the best lift-to-drag ratio, found by sweeping. */
export function bestLD(wing) {
  let best = { ld: -Infinity, alpha: 0 };
  for (let a = -4; a <= 20; a += 0.1) {
    const c = coefficients(a, wing);
    if (c.ld > best.ld) best = { ld: c.ld, alpha: a };
  }
  return best;
}

/** Reynolds number, for the caption. Chord in metres, speed in m/s. */
export function reynolds(speed, chord, rho, mu = 1.789e-5) {
  return (rho * speed * chord) / mu;
}
