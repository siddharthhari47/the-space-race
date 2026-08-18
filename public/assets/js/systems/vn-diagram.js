// The V-n diagram — how fast an aircraft may fly, plotted against how hard
// it may be allowed to pull.
//
// DOM-free so it can be checked in Node (tools/vn-diagram-check.mjs).
//
// Source: NPTEL course 101101079, Introduction to Aerospace Engineering —
// Flight, Prof. Rajkumar S. Pant (IIT Bombay), Lecture 54 ("Introduction to
// V-n Diagram") and Lecture 55 ("V-n Diagram as per FAR 23 Regulations").
// The limit-load-factor table below is transcribed directly from Lecture 54;
// the envelope construction (stall parabola, corner speed, structural limit
// lines, cruise-to-dive drop-off) follows Lecture 55.
//
// The idea in one line: load factor n = L/W is not free to be anything you
// like. Two independent limits box it in, and where they meet decides how
// hard the aircraft can turn at all.
//
//   THE STALL BOUNDARY.  L = n*W and L = 0.5*rho*V^2*S*CL, so
//   n = (rho*V^2*CLmax) / (2*W/S). This is a parabola through the origin —
//   at low speed, the wing simply cannot generate enough lift to load the
//   aircraft past this line, however hard the pilot pulls. It is a hard
//   aerodynamic limit, not a chosen one.
//
//   THE STRUCTURAL LIMIT.  A flat ceiling at n = n_max, set by regulation
//   (FAR 23) or by convention for military types, chosen so the airframe
//   survives the load with a margin. This is a chosen limit, not an
//   aerodynamic one — it exists because someone decided how much structure
//   to build.
//
// Where the stall parabola meets the structural ceiling is the corner
// speed, V_A — the slowest speed at which the maximum permitted load factor
// is achievable at all, and so the speed that gives the smallest turn
// radius and the fastest turn rate an aircraft can sustain. Fly any faster
// at that same n and the wing has lift to spare; any slower and it stalls
// before reaching n_max.

/**
 * Typical limit load factors by aircraft category, transcribed from
 * NPTEL Lecture 54. Ranges are given because the real number depends on
 * the specific type's weight and certification basis; a slider inside the
 * cited range is a reasonable representative rather than an invented one.
 */
export const CATEGORIES = {
  gaNormal: { label: "GA — Normal", nPosRange: [2.5, 3.8], nNegRange: [-1.5, -1.0] },
  gaUtility: { label: "GA — Utility", nPosRange: [4.4, 4.4], nNegRange: [-1.8, -1.8] },
  gaAerobatic: { label: "GA — Aerobatic", nPosRange: [6, 6], nNegRange: [-3, -3] },
  homebuilt: { label: "Homebuilt", nPosRange: [5, 5], nNegRange: [-2, -2] },
  transport: { label: "Transport", nPosRange: [3, 4], nNegRange: [-2, -1] },
  bomberStrategic: { label: "Strategic bomber", nPosRange: [3, 3], nNegRange: [-1, -1] },
  bomberTactical: { label: "Tactical bomber", nPosRange: [4, 4], nNegRange: [-2, -2] },
  fighter: { label: "Fighter", nPosRange: [6.5, 9], nNegRange: [-6, -3] },
};

/** The real HF-24 Marut V-n diagram (per AP-970), read off Lecture 54's own worked example. */
export const HF24_MARUT = {
  label: "HF-24 Marut (AP-970)",
  nPos: 9.34,
  nNeg: -5,
  vStallEq: 70, // knots equivalent airspeed
  vD: 325, // design diving speed, knots equivalent
  gustHigh: 15.2, // m/s, high-speed gust line
  gustLow: 7.6, // m/s, low-speed gust line
};

/**
 * Positive stall boundary: n at a given equivalent airspeed V (m/s), for a
 * wing loading W/S (N/m^2) and CLmax, at sea-level density (equivalent
 * airspeed is defined so that sea-level rho is always the right one to use —
 * that is the entire reason the V-n diagram is conventionally drawn in
 * equivalent rather than true airspeed).
 */
const RHO_SL = 1.225; // kg/m^3

export function stallLoadFactor(vEq, wingLoading, clMax) {
  return (RHO_SL * vEq * vEq * clMax) / (2 * wingLoading);
}

/** Corner speed: the equivalent airspeed at which the stall boundary reaches n. */
export function cornerSpeed(n, wingLoading, clMax) {
  return Math.sqrt((2 * Math.abs(n) * wingLoading) / (RHO_SL * clMax));
}

/**
 * Build the full FAR-23-shaped envelope as an ordered list of {v, n} points,
 * ready to hand straight to a canvas path. Shape, per Lecture 55:
 *
 *   O -> up the stall parabola -> A (corner speed, n = nPos)
 *   A -> C flat at n = nPos (structural limit)
 *   C -> D dropping to n = nPosAtD by the design dive speed
 *   D -> F straight down (the right-hand edge, dive speed limit)
 *   mirrored below the axis for the negative side: O -> B -> E -> F
 *
 * vC and vD are supplied rather than derived, because FAR 23 sets them from
 * a manufacturer's performance data (cruise speed, dive speed margin), not
 * from a closed-form function of wing loading alone — inventing one here
 * would look precise without being verified.
 */
export function buildEnvelope({ wingLoading, clMax, clMaxNeg, nPos, nNeg, vC, vD }) {
  const vA = cornerSpeed(nPos, wingLoading, clMax);
  const vB = cornerSpeed(Math.abs(nNeg), wingLoading, clMaxNeg);

  const positive = [];
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const v = (i / steps) * vA;
    positive.push({ v, n: stallLoadFactor(v, wingLoading, clMax) });
  }
  positive.push({ v: vA, n: nPos }); // corner
  positive.push({ v: vC, n: nPos }); // A -> C, flat top
  positive.push({ v: vD, n: nPos * 0.5 }); // C -> D, dropping toward dive speed
  positive.push({ v: vD, n: 0 }); // D -> F, straight down to the axis

  const negative = [];
  for (let i = 0; i <= steps; i++) {
    const v = (i / steps) * vB;
    negative.push({ v, n: -stallLoadFactor(v, wingLoading, clMaxNeg) });
  }
  negative.push({ v: vB, n: nNeg });
  negative.push({ v: vC, n: nNeg });
  negative.push({ v: vD, n: 0 });

  return { positive, negative, vA, vB, vC, vD };
}

/** Pick a representative n within a category's cited range, biased to the upper bound. */
export const representativeN = (range) => range[0] + (range[1] - range[0]) * 0.7;
